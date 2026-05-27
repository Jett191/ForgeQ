// Feature: frontend-interview-practice, Property 7: ReviewSet 快照不变性
//
// 该属性测试覆盖 design.md 中 Property 7 的两条断言：
//   ① 已构造的 R = buildReviewSet(Q, L, k) 在后续对 L 的任意修改 L'
//      下保持不变（值快照独立于后续修改）；
//   ② 当 L' 中某 q 的 mastery 从满足谓词的取值变更为 'mastered'
//      时，`buildReviewSet(Q, L', k)`（k ∈ {unmastered, wrong}）不再包含 q。
//
// Validates: Requirements 10.6, 10.7
//
// 实现说明：
// - 复用 `test/generators.ts` 中已有的 `arbQuestionBank` /
//   `arbLearningStateMap` / `arbLearningState`，与 Task 6.2 共用一份生成器。
// - 第 ① 条断言：构造 R 后取一份 id-序列快照，再对 L 自身施加任意混合修改
//   （覆盖已知 qid / 删除 qid / 注入幽灵 id），最后断言 R 的长度、id 序列、
//   每个元素引用与快照完全一致——即 buildReviewSet 在返回 R 之后没有保留
//   任何对 L 的活引用，也没有让 R 中的 Question 被替换。
// - 第 ② 条断言：先把目标 q 的 LearningState 强行置为该 kind 的"匹配值"，
//   保证 q ∈ R；然后通过 `deriveLearningState(prev, 'mastered')` 构造
//   L'，按 Mastery↔WrongFlag 联动（Req 9.4）同步更新 wrongFlag；最后断言
//   target ∉ buildReviewSet(Q, L', k)。`favorite` 不在本属性范围内。
// - `numRuns: 100`，与 tasks.md 任务 6.3 的要求一致。

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { deriveLearningState } from '../../src/domain/masteryRules.js';
import {
  buildReviewSet,
  type ReviewKind,
} from '../../src/domain/reviewSetBuilder.js';
import type { LearningState } from '../../src/types/learning.js';
import type { Question, QuestionBank } from '../../src/types/question.js';

import {
  arbLearningState,
  arbLearningStateMap,
  arbQuestionBank,
} from '../generators.js';

/** 三种 ReviewKind，用于第 ① 条断言（快照不变性对所有 kind 通用）。 */
const REVIEW_KINDS: readonly ReviewKind[] = ['unmastered', 'favorite', 'wrong'];

/** Property 7 的第 ② 条断言只覆盖 `unmastered` / `wrong`；`favorite` 与 mastery 无联动。 */
const MASTERY_LINKED_KINDS: readonly Exclude<ReviewKind, 'favorite'>[] = [
  'unmastered',
  'wrong',
];

/** 一次对 `Map<string, LearningState>` 的就地修改。 */
type LearningMutation = (L: Map<string, LearningState>) => void;

/**
 * 构造一组对 L 的混合修改：
 * - 覆盖某个已知 qid 的 LearningState；
 * - 删除某个已知 qid；
 * - 注入与 questions 无关的"幽灵" qid。
 *
 * 三类操作都会在不同程度上"污染" L，用于检验 R 的快照独立性。
 */
const arbLearningMutations = (
  questions: readonly Question[],
): fc.Arbitrary<LearningMutation[]> => {
  const knownIds = questions.map((q) => q.id);

  const arbOverrideKnown: fc.Arbitrary<LearningMutation> = fc
    .tuple(fc.constantFrom(...knownIds), arbLearningState)
    .map(([id, state]) => (L) => {
      L.set(id, state);
    });

  const arbDeleteKnown: fc.Arbitrary<LearningMutation> = fc
    .constantFrom(...knownIds)
    .map((id) => (L) => {
      L.delete(id);
    });

  const arbGhostInsert: fc.Arbitrary<LearningMutation> = fc
    .tuple(
      fc
        .string({ minLength: 1, maxLength: 20 })
        // 防止"幽灵 id"碰巧等于已知 id，让该操作语义保持"插入幽灵"。
        .filter((id) => !knownIds.includes(id)),
      arbLearningState,
    )
    .map(([id, state]) => (L) => {
      L.set(id, state);
    });

  return fc.array(
    fc.oneof(arbOverrideKnown, arbDeleteKnown, arbGhostInsert),
    { minLength: 0, maxLength: 10 },
  );
};

/** 浅克隆 R 用作快照（仅保留引用与顺序）。 */
const snapshotR = (R: readonly Question[]): Question[] => R.slice();

describe('Property 7: ReviewSet 快照不变性', () => {
  it('R 在 L → L\' 任意修改下保持不变（值快照独立于后续修改）', () => {
    fc.assert(
      fc.property(
        arbQuestionBank.chain((bank: QuestionBank) =>
          fc.tuple(
            fc.constant(bank),
            arbLearningStateMap(bank.questions),
            fc.constantFrom(...REVIEW_KINDS),
            arbLearningMutations(bank.questions),
          ),
        ),
        ([bank, L, kind, mutations]) => {
          const Q = bank.questions;
          const R = buildReviewSet(Q, L, kind);
          const snapshot = snapshotR(R);
          const snapshotIds = snapshot.map((q) => q.id);

          // 对 L 自身施加任意修改 L → L'。注意 L 是 Map 引用，这里直接就地变更，
          // 模拟"用户在持有 R 的同时继续在外部修改 L"的真实场景。
          for (const m of mutations) {
            m(L);
          }

          // ① R 长度与 id 序列保持不变。
          expect(R.length).toBe(snapshot.length);
          expect(R.map((q) => q.id)).toEqual(snapshotIds);

          // ② R 中每个元素的引用未被替换（buildReviewSet 不应在返回后再写回 R）。
          for (let i = 0; i < R.length; i += 1) {
            expect(R[i]).toBe(snapshot[i]);
          }

          // ③ 用同一份 L'（已被修改）重新构造 R'，与 R 是两次独立的快照——
          //    R' 可以与 R 不同，但 R 必须仍等于 snapshot（再次确认 R 未被联动）。
          const _Rprime = buildReviewSet(Q, L, kind);
          expect(R.map((q) => q.id)).toEqual(snapshotIds);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('当 q 的 mastery 从匹配值变为 mastered，buildReviewSet(Q, L\', k) 不再包含 q (k ∈ {unmastered, wrong})', () => {
    fc.assert(
      fc.property(
        arbQuestionBank.chain((bank: QuestionBank) =>
          fc.tuple(
            fc.constant(bank),
            arbLearningStateMap(bank.questions),
            fc.constantFrom(...MASTERY_LINKED_KINDS),
            fc.nat({ max: bank.questions.length - 1 }),
          ),
        ),
        ([bank, L, kind, qIndex]) => {
          const Q = bank.questions;
          const target = Q[qIndex]!;

          // 把目标 q 的 LearningState 强行置为该 kind 的"匹配值"，
          // 保证前置条件 target ∈ R 成立。其余字段使用最小化的合法默认。
          const matching: LearningState =
            kind === 'unmastered'
              ? {
                  mastery: 'not_mastered',
                  favoriteFlag: false,
                  wrongFlag: false,
                  hasNote: false,
                }
              : {
                  // wrong：mastery 取一个非 'mastered' 的值即可；wrongFlag 必须为 true。
                  mastery: 'learning',
                  favoriteFlag: false,
                  wrongFlag: true,
                  hasNote: false,
                };
          L.set(target.id, matching);

          const R = buildReviewSet(Q, L, kind);
          expect(
            R.some((q) => q.id === target.id),
            `前置条件失败：target 应当 ∈ R（kind=${kind}）`,
          ).toBe(true);

          // 构造 L'：把 target 的 mastery 改为 'mastered'，按 MasteryRules 联动同步 wrongFlag
          //（Req 9.4：mastery='mastered' ⇒ wrongFlag=false）。L' 的其它条目与 L 保持一致。
          const Lprime = new Map(L);
          Lprime.set(target.id, deriveLearningState(matching, 'mastered'));

          const Rprime = buildReviewSet(Q, Lprime, kind);
          expect(
            Rprime.some((q) => q.id === target.id),
            `target 在 L' 下应不再 ∈ R（kind=${kind}）`,
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
