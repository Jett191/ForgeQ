/**
 * ReviewSetBuilder：从 `Question_Bank` + `LearningState` 构造一次性的复习题目集合。
 *
 * 该模块严格对齐 design.md 中
 * "Components and Interfaces > ReviewSetBuilder" 一节，且与
 * requirements.md 中以下条款一一对应：
 * - Req 10.2：`复习未掌握` 入口仅包含 `mastery === 'not_mastered'` 的题目。
 * - Req 10.3：`复习收藏` 入口仅包含 `favoriteFlag === true` 的题目。
 * - Req 10.4：`复习错题` 入口仅包含 `wrongFlag === true` 的题目。
 *
 * 设计要点：
 * - 纯函数；不依赖 `vscode` API，便于在 vitest / fast-check 下单独测试。
 * - 保留 `questions` 的原序（Req 10.2 / 10.3 / 10.4 都要求"与 Question_Bank
 *   原序一致"），不做任何排序。
 * - 每道题至多出现一次：即使上游 `questions` 数组中存在 id 重复（理论上
 *   `Parser` 会拒绝，但本函数仍按"防御式"处理），结果中每个 id 仅出现首次
 *   匹配的引用，满足 Property 6 / design.md 中"each q at most once"。
 * - 当 `learning` 中不存在某 `question.id` 时，按默认 `LearningState`
 *   （`mastery='unlearned'`、所有 flag 为 `false`）评估，三种谓词在该场景
 *   下均为 false，因此该题不会进入任何 `Review_Set`（与 Req 8.6 / 9.6
 *   的默认值语义一致）。
 *
 * Validates: Requirements 10.2, 10.3, 10.4
 */

import type { LearningState } from '../types/learning.js';
import type { Question } from '../types/question.js';

/** 复习集合类别。 */
export type ReviewKind = 'unmastered' | 'favorite' | 'wrong';

/** 单个 `LearningState` 上的谓词函数签名。 */
type LearningPredicate = (state: LearningState | undefined) => boolean;

/**
 * 三种 `ReviewKind` 对应的谓词。
 *
 * 注意：所有谓词在 `state === undefined` 时返回 `false`，等价于把缺省的
 * `LearningState` 视为默认值（mastery=unlearned、所有 flag 为 false）。
 */
const PREDICATES: Readonly<Record<ReviewKind, LearningPredicate>> = {
  unmastered: (state) => state?.mastery === 'not_mastered',
  favorite: (state) => state?.favoriteFlag === true,
  wrong: (state) => state?.wrongFlag === true,
};

/**
 * 根据 `kind` 构造一次性的复习题目集合。
 *
 * @param questions 当前激活 `Question_Bank` 的题目数组（保留原序）。
 * @param learning  按 `Question.id` 索引的 `LearningState` 视图，可能不包含
 *                  全部题目；缺失时按默认值评估。
 * @param kind      复习入口类别，决定谓词。
 * @returns 命中谓词的题目集合，保留原序，无重复。
 *
 * 复杂度：O(n) 时间 / O(n) 额外空间，n 为 `questions.length`。
 */
export function buildReviewSet(
  questions: readonly Question[],
  learning: ReadonlyMap<string, LearningState>,
  kind: ReviewKind,
): Question[] {
  const predicate = PREDICATES[kind];
  const result: Question[] = [];
  // 防御式去重：即使上游 questions 中出现重复 id，也只保留首次命中。
  const seen = new Set<string>();

  for (const q of questions) {
    if (seen.has(q.id)) {
      continue;
    }
    if (predicate(learning.get(q.id))) {
      result.push(q);
      seen.add(q.id);
    }
  }

  return result;
}
