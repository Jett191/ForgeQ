// Feature: frontend-interview-practice, Property 6: ReviewSet 谓词-保序-子集
//
// 该属性测试覆盖 design.md 中 Property 6 全部三条断言：
//   ① R 是 Q 的子序列（保留 Q 中的相对顺序）；
//   ② q∈R 当且仅当对应 LearningState 满足 k 的谓词
//      （unmastered: mastery==='not_mastered'；
//        favorite:   favoriteFlag===true；
//        wrong:      wrongFlag===true）；
//   ③ R 中无重复（基于 q.id）。
//
// Validates: Requirements 10.2, 10.3, 10.4
//
// 实现说明：
// - 生成器使用 `test/generators.ts` 中 Task 6.2 引入的 `arbQuestionBank` /
//   `arbLearningStateMap`，复用同一份"题库 + 学习状态"模型。
// - `arbLearningStateMap` 故意构造"部分覆盖 + 幽灵 id"的 map，分别覆盖
//   "qid 缺失走默认值"与"map 中存在 questions 之外的 id"两种边界。
// - 三种 ReviewKind 在同一次属性测试中一起验证，避免重复生成大型 bank。
// - `numRuns: 100`，与 tasks.md 任务 6.2 的要求一致。

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildReviewSet, type ReviewKind } from '../../src/domain/reviewSetBuilder.js';
import type { LearningState } from '../../src/types/learning.js';
import type { Question } from '../../src/types/question.js';

import { arbLearningStateMap, arbQuestionBank } from '../generators.js';

/** 三种 ReviewKind 各自的"判定函数"，用于在测试侧独立验证谓词语义。 */
const expectedPredicate: Record<
  ReviewKind,
  (state: LearningState | undefined) => boolean
> = {
  unmastered: (s) => s?.mastery === 'not_mastered',
  favorite: (s) => s?.favoriteFlag === true,
  wrong: (s) => s?.wrongFlag === true,
};

/**
 * 计算 `R` 中每个元素在 `Q` 中的下标序列。返回 `null` 表示 R 中存在不在 Q 中
 * 的引用（违反"子序列"前提）。
 */
const indicesOfRInQ = (R: readonly Question[], Q: readonly Question[]): number[] | null => {
  const idToIndex = new Map<string, number>();
  Q.forEach((q, i) => idToIndex.set(q.id, i));
  const indices: number[] = [];
  for (const r of R) {
    const idx = idToIndex.get(r.id);
    if (idx === undefined) {
      return null;
    }
    indices.push(idx);
  }
  return indices;
};

const REVIEW_KINDS: readonly ReviewKind[] = ['unmastered', 'favorite', 'wrong'];

describe('Property 6: ReviewSet 谓词-保序-子集', () => {
  it('R 是 Q 的子序列；q∈R ⇔ predicate(L[q.id])；R 中无重复', () => {
    fc.assert(
      fc.property(
        arbQuestionBank.chain((bank) =>
          fc.tuple(
            fc.constant(bank),
            arbLearningStateMap(bank.questions),
            fc.constantFrom(...REVIEW_KINDS),
          ),
        ),
        ([bank, learning, kind]) => {
          const Q = bank.questions;
          const R = buildReviewSet(Q, learning, kind);
          const predicate = expectedPredicate[kind];

          // ① R 是 Q 的子序列：每个 r 的引用与 Q 中同 id 的元素严格相等，
          //    且 R 中元素在 Q 中的下标序列严格递增。
          const indices = indicesOfRInQ(R, Q);
          expect(indices, 'R must reference items present in Q').not.toBeNull();
          for (let i = 1; i < indices!.length; i += 1) {
            expect(
              indices![i]! > indices![i - 1]!,
              `R 中元素相对顺序必须严格递增（保序），实际 indices=${JSON.stringify(indices)}`,
            ).toBe(true);
          }
          // 引用同一性：R 中的题目对象与 Q 中同 id 的题目深度相等
          // （buildReviewSet 不应替换或重新构造题目对象的字段）。
          for (const r of R) {
            const original = Q.find((q) => q.id === r.id);
            expect(original).toBeDefined();
            expect(r).toEqual(original);
          }

          // ② q∈R 当且仅当 predicate(L[q.id]) 为真。
          const inR = new Set(R.map((q) => q.id));
          for (const q of Q) {
            const shouldBeIn = predicate(learning.get(q.id));
            expect(
              inR.has(q.id),
              `kind=${kind}, qid=${q.id}, learning=${JSON.stringify(
                learning.get(q.id),
              )}: 期望 ${shouldBeIn ? '∈' : '∉'} R`,
            ).toBe(shouldBeIn);
          }

          // ③ R 中无重复（基于 id）。
          expect(new Set(R.map((q) => q.id)).size).toBe(R.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
