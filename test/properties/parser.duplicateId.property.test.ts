// Feature: frontend-interview-practice, Property 3: 重复 id 全量定位
//
// 该属性测试覆盖 design.md / requirements.md 中
//   Property 3 / Req 1.7：当题库中存在 ≥ 2 个 question 共享同一 id 时，
//   Parser 必须返回 `DUPLICATE_QUESTION_ID` 错误，并在 `duplicates` 数组中
//   列出每个重复 id 在 `questions` 数组中的全部 0 起始下标。
//
// 实现思路：
//   1. `arbDuplicateInjection` 在合法 `arbQuestionBank` 上注入"单重复组"：
//      从题库中挑选一个"源"题目，其 id 作为重复 id；再随机选取 ≥ 2 个
//      目标下标，把这些题目的 id 都改写为源 id。注入后的 bank 仅 id 重复
//      （其它字段仍满足 schema），稳定触发 Parser 的 DUPLICATE_QUESTION_ID
//      分支。
//   2. 用 `format(bank)` 序列化为 JSON 文本，走 Parser 的真实输入路径
//      （而非直接构造 JS 对象），覆盖端到端管线语义。
//   3. `parse(text)` 失败，错误码必为 `DUPLICATE_QUESTION_ID`。
//   4. 对每个 `{ id, indices }` 比较 `Set(indices)` 与原 bank 中 id 出现
//      位置的实际集合（基于 0），二者必须严格相等；并且报告的 id 集合
//      等于实际重复 id 集合（不多报、不漏报）。
//
// Validates: Requirements 1.7
// Design Property: 3
//
// `numRuns: 100`（与 tasks.md 任务 3.6 要求一致）。

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { format } from '../../src/parser/formatter.js';
import { parse } from '../../src/parser/parser.js';
import type { QuestionBank } from '../../src/types/question.js';

import { arbQuestionBank } from '../generators.js';

/**
 * 重复 id 注入生成器：
 *
 * 在 `arbQuestionBank` 产出的合法 bank 上注入"单重复组"。注入策略：
 *
 * 1. 仅接受 `questions.length ≥ 2` 的 bank（filter 拒绝率 ≤ 1/30，可接受）。
 * 2. 从 `questions` 中随机挑选一个 `sourceIdx`，把它的 id 作为重复 id。
 * 3. 随机选取 2 ≤ |T| ≤ n 个目标下标 T（去重数组），把每个 `questions[t]`
 *    的 id 改写为 sourceId。
 *
 * 由于 `arbQuestionBank` 保证原始 ids 互不相同，注入后：
 *   - 若 sourceIdx ∉ T：sourceId 出现在 sourceIdx + |T| 个位置，共 ≥ 3 次。
 *   - 若 sourceIdx ∈ T：sourceId 出现在 |T| 个位置，共 ≥ 2 次。
 * 任意情况下都至少存在一组重复，且其它原始 id 仍唯一。
 *
 * 注入只改写 `id` 字段，不破坏 schema 其它约束（id 字符串长度 1-100 不变，
 * 因为 sourceId 也来自 `arbConstrainedString(20)`）。
 */
const arbDuplicateInjection: fc.Arbitrary<QuestionBank> = arbQuestionBank
  .filter((b) => b.questions.length >= 2)
  .chain((b) => {
    const n = b.questions.length;
    return fc
      .tuple(
        fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), {
          minLength: 2,
          maxLength: n,
        }),
        fc.integer({ min: 0, max: n - 1 }),
      )
      .map(([targetIndices, sourceIdx]) => {
        // sourceIdx 在 [0, n-1] 范围内，n ≥ 2，故 b.questions[sourceIdx]
        // 必然存在；`!` 断言用于满足 noUncheckedIndexedAccess。
        const sourceId = b.questions[sourceIdx]!.id;
        const targetSet = new Set(targetIndices);
        const questions = b.questions.map((q, i) =>
          targetSet.has(i) ? { ...q, id: sourceId } : q,
        );
        return { ...b, questions };
      });
  });

/**
 * 计算 bank 中每个重复 id（出现 ≥ 2 次）对应的所有 0 起始下标集合。
 *
 * 用作 Parser 报告的"事实参照系"——Parser 的 `duplicates` 必须与本结果
 * 在键集 + 每键的 indices 集合上完全一致。
 */
const computeActualDuplicateIndices = (
  bank: QuestionBank,
): Map<string, Set<number>> => {
  const indicesById = new Map<string, Set<number>>();
  bank.questions.forEach((q, i) => {
    let s = indicesById.get(q.id);
    if (s === undefined) {
      s = new Set<number>();
      indicesById.set(q.id, s);
    }
    s.add(i);
  });
  // 仅保留出现次数 ≥ 2 的 id，单次出现 = 非重复。
  for (const [id, s] of indicesById) {
    if (s.size < 2) indicesById.delete(id);
  }
  return indicesById;
};

/** 比较两个数字集合是否相等（同 size 且元素逐一相同）。 */
const setsEqual = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean => {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
};

describe('Property 3: 重复 id 全量定位', () => {
  it('duplicates 中每个 id 的 indices 集合等于实际出现位置的集合（基于 0）', () => {
    fc.assert(
      fc.property(arbDuplicateInjection, (bank) => {
        // 端到端走 Parser 真实管线：先序列化为 JSON，再解析。
        const text = format(bank);
        const result = parse(text);

        // 必须返回失败结果，且错误码恰为 DUPLICATE_QUESTION_ID。
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('DUPLICATE_QUESTION_ID');
        if (result.error.code !== 'DUPLICATE_QUESTION_ID') return;

        const expected = computeActualDuplicateIndices(bank);

        // 报告条目按 id 归集为 Map<string, Set<number>>，便于按 id 比较。
        // 同一 id 在 `duplicates` 数组中仅应出现一次，本断言顺带验证之。
        const got = new Map<string, Set<number>>();
        for (const { id, indices } of result.error.duplicates) {
          expect(got.has(id), `id ${id} reported more than once`).toBe(false);
          got.set(id, new Set(indices));
        }

        // ① 报告的 id 集合 = 实际重复 id 集合（不多报、不漏报）。
        expect(new Set(got.keys())).toEqual(new Set(expected.keys()));

        // ② 每个 id 的 indices 集合（基于 0）严格相等。
        for (const [id, expectedIndices] of expected) {
          const gotIndices = got.get(id);
          expect(
            gotIndices,
            `missing duplicate report for id ${id}`,
          ).toBeDefined();
          expect(
            gotIndices !== undefined && setsEqual(gotIndices, expectedIndices),
            `for id ${id}: expected indices ${JSON.stringify(
              [...expectedIndices].sort((a, b) => a - b),
            )}, got ${JSON.stringify(
              gotIndices
                ? [...gotIndices].sort((a, b) => a - b)
                : undefined,
            )}`,
          ).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
