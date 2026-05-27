/**
 * MasteryRules：纯函数模块，封装 `Mastery_Status ↔ Wrong_Flag` 联动规则。
 *
 * 该模块严格对齐 design.md 中
 * "Components and Interfaces > MasteryRules" 一节，
 * 实现需求 9.1 / 9.2 / 9.3 / 9.4 中描述的状态机转换。
 *
 * 设计要点：
 * - 纯函数：相同输入恒返回相同输出，无副作用，不依赖任何外部状态。
 * - 不直接持久化：调用方（如 Webview message handler）负责把返回值
 *   通过 `Storage` 写盘，并在写入失败时按 Req 9.7 回滚至变更前取值。
 * - 不修改 `prev`：通过对象展开返回新对象，保留 `prev` 不变性，方便上层
 *   做 optimistic update / rollback。
 *
 * 状态机不变量（对应 design.md Property 8，Validates Req 9.3 / 9.4）：
 * 1. `mastery === next`
 * 2. 若 `next === 'not_mastered'`，则 `wrongFlag === true`
 * 3. 若 `next === 'mastered'`，则 `wrongFlag === false`
 * 4. 若 `next ∈ {'unlearned', 'learning'}`，则 `wrongFlag === prev.wrongFlag`
 * 5. 其它字段（`favoriteFlag` / `hasNote` / `lastPracticedAt`）保持不变
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */

import type { LearningState } from '../types/learning.js';
import type { MasteryStatus } from '../types/question.js';

/**
 * 根据用户选择的下一个 `MasteryStatus`，由当前 `LearningState` 派生新的
 * `LearningState`。
 *
 * 行为定义（与 design.md MasteryRules 实现完全一致）：
 * - `next === 'not_mastered'`：`wrongFlag` 置为 `true`（Req 9.3）。
 * - `next === 'mastered'`：`wrongFlag` 置为 `false`（Req 9.4）。
 * - `next === 'unlearned' | 'learning'`：保持 `prev.wrongFlag` 不变。
 * - `mastery` 永远等于 `next`（Req 9.2）。
 * - 其余字段（`favoriteFlag` / `hasNote` / `lastPracticedAt`）整体透传。
 *
 * 该函数不会变更入参 `prev`；调用方拿到返回值后再交由 `Storage` 写盘。
 *
 * @param prev 变更前的 `LearningState`。
 * @param next 用户在 Practice_View 中选择的目标 `MasteryStatus`。
 * @returns 联动后的新 `LearningState`，与 `prev` 是不同对象引用。
 */
export function deriveLearningState(
  prev: LearningState,
  next: MasteryStatus,
): LearningState {
  let wrongFlag = prev.wrongFlag;
  if (next === 'not_mastered') wrongFlag = true; // Req 9.3
  if (next === 'mastered') wrongFlag = false; // Req 9.4
  return { ...prev, mastery: next, wrongFlag };
}
