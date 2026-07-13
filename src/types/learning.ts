/**
 * LearningState 类型定义。
 *
 * 该模块严格对齐 design.md 中
 * "Data Models > TypeScript 类型定义 > LearningState" 一节。
 *
 * 设计要点：
 * - 笔记文本不再放在 `learning.json`，而是落在 `notes/<qid>.md`；
 *   `learning.json` 仅保留 `hasNote` 标志位，便于 TreeView 不读取每个文件
 *   就能展示"有无笔记"图标，且避免 `learning.json` 因长笔记膨胀。
 * - `lastPracticedAt` 由 `PracticeController` 监听原生编辑器 `onDidSaveTextDocument`
 *   后更新（Req 5.3 / 6.3）。
 *
 * Validates: Requirements 8.1, 9.1
 */

import type { MasteryStatus } from './question.js';

/**
 * 单题的学习状态。所有字段均有默认值，未写入时由
 * `UserDataStore.getOrDefault` 提供。
 *
 * 默认值（Req 8.6 / 9.6）：
 * - `mastery`：`'unlearned'`
 * - `favoriteFlag`：`false`
 * - `wrongFlag`：`false`
 * - `hasNote`：`false`
 * - `lastPracticedAt`：`undefined`
 */
export interface LearningState {
  /** 掌握状态；默认 `'unlearned'`。 */
  mastery: MasteryStatus;
  /** 是否收藏；默认 `false`。 */
  favoriteFlag: boolean;
  /**
   * 是否错题标记；默认 `false`。
   *
   * 由独立的“错题”按钮切换；设置为 `'mastered'` 时会清除该标记，
   * 其他掌握状态变更不触碰本字段。
   */
  wrongFlag: boolean;
  /**
   * 是否存在笔记。
   *
   * 笔记文本本身存放在 `notes/<qid>.md`；本字段仅作标志位。
   */
  hasNote: boolean;
  /** 最近一次练习的时间戳（epoch ms）；从未练习时为 `undefined`。 */
  lastPracticedAt?: number;
}
