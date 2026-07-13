// Feature: frontend-interview-practice, Property 8: MasteryRules 状态机不变量
//
// 验证 design.md "Correctness Properties > Property 8" 描述的五条不变量：
//   ① mastery === next
//   ② next === 'mastered'      ⇒ wrongFlag === false
//   ③ 其它掌握状态不改变 wrongFlag（错题标记独立切换）
//   ⑤ 其余字段（favoriteFlag / hasNote / lastPracticedAt）保持不变
//
// 同时确保实现是纯函数：
//   - 不修改入参 prev（被测代码用对象展开返回新对象）。
//   - 多次调用相同 (prev, next) 返回结构相等的结果。
//
// **Validates: Requirements 9.3, 9.4**

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { deriveLearningState } from '../../src/domain/masteryRules.js';
import type { LearningState } from '../../src/types/learning.js';
import { arbLearningState, arbMasteryStatus } from '../generators.js';

const NUM_RUNS = 500;

describe('Property 8: MasteryRules 状态机不变量', () => {
  it('deriveLearningState 满足 design.md 中的五条不变量', () => {
    fc.assert(
      fc.property(arbLearningState, arbMasteryStatus, (prev, next) => {
        // 在调用前对 prev 做一次结构快照，便于在调用后断言"未被修改"。
        const snapshot: LearningState = { ...prev };

        const result = deriveLearningState(prev, next);

        // 不变量 ①：mastery 必须等于目标值。
        expect(result.mastery).toBe(next);

        // 不变量 ②/③：已掌握清除错题，其它掌握状态保持错题标记。
        if (next === 'mastered') {
          expect(result.wrongFlag).toBe(false);
        } else {
          expect(result.wrongFlag).toBe(prev.wrongFlag);
        }

        // 不变量 ⑤：其余字段必须与 prev 完全一致。
        expect(result.favoriteFlag).toBe(prev.favoriteFlag);
        expect(result.hasNote).toBe(prev.hasNote);
        // exactOptionalPropertyTypes：直接比较即可（undefined 也会相等）。
        expect(result.lastPracticedAt).toBe(prev.lastPracticedAt);

        // 纯函数补强：确保 prev 没有被原地修改。
        expect(prev).toEqual(snapshot);

        // 该函数不会与入参共享引用（避免上层 optimistic update / rollback 时
        // 产生别名问题）。
        expect(result).not.toBe(prev);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
