import type { Question } from '../types/question.js';

/**
 * 返回 VS Code 侧栏使用的紧凑题目标题。
 * 空白 shortTitle 被视为无效并安全回退，兼容由旧版本或手工构造的题库对象。
 */
export function sidebarQuestionTitle(question: Question): string {
  const shortTitle = question.shortTitle?.trim();
  return shortTitle ? shortTitle : question.title;
}
