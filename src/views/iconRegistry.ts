/**
 * Mastery 状态图标注册表。
 *
 * Questions 与 Review 共用这里的映射，保证页面状态始终使用同一套视觉语言：
 *
 *  - 未学习：透明内芯、中性厚圆环；
 *  - 学习中：柔和橙色外环与纯色内圆；
 *  - 已掌握：柔和绿色外环与纯色内圆；
 *  - 未掌握：柔和橙色外环与纯色内圆；
 *  - 错题：柔和红色外环与纯色内圆（独立于 mastery）。
 *
 * 每个 SVG 都只使用同心圆，不使用勾、叉或其他内部符号。外环与内芯的尺寸
 * 比例保持一致，不使用渐变、高光或模糊效果，仅以低饱和配色区分状态；
 * 浅色与深色主题分别提供资源。
 *
 * Validates: Requirements 9.5
 */

import * as vscode from 'vscode';

import type { LearningState } from '../types/learning.js';
import type { MasteryStatus } from '../types/question.js';

export type QuestionVisualStatus = MasteryStatus | 'wrong';

const STATUS_ICON_FILE: Readonly<Record<QuestionVisualStatus, string>> = Object.freeze({
  unlearned: 'unlearned.svg',
  learning: 'learning.svg',
  mastered: 'mastered.svg',
  not_mastered: 'not-mastered.svg',
  wrong: 'wrong.svg',
});

/**
 * 没有扩展根 URI 时使用的降级图标，主要供独立单元测试使用。
 * 正常扩展运行时始终使用下面的自定义 SVG。
 */
const FALLBACK_ICON_COLOR: Readonly<Record<QuestionVisualStatus, string>> = Object.freeze({
  unlearned: 'descriptionForeground',
  learning: 'charts.orange',
  mastered: 'charts.green',
  not_mastered: 'charts.orange',
  wrong: 'charts.red',
});

export function statusIconFile(status: QuestionVisualStatus): string {
  return STATUS_ICON_FILE[status];
}

/** 错题标记在列表中优先于 mastery 状态显示。 */
export function learningStateVisualStatus(
  learning: LearningState | undefined,
): QuestionVisualStatus {
  if (learning?.wrongFlag) return 'wrong';
  return learning?.mastery ?? 'unlearned';
}

export type MasteryIconPath =
  | vscode.ThemeIcon
  | Readonly<{ light: vscode.Uri; dark: vscode.Uri }>;

/**
 * 返回与主题匹配的状态 SVG。`extensionUri` 在真实扩展环境中由
 * `ExtensionContext.extensionUri` 注入；省略时退回 VS Code 内置圆点，方便
 * provider 在不构造完整 ExtensionContext 的测试中继续使用。
 */
export function statusToIcon(
  status: QuestionVisualStatus,
  extensionUri?: vscode.Uri,
): MasteryIconPath {
  if (extensionUri === undefined) {
    const id = status === 'unlearned' ? 'circle-outline' : 'circle-filled';
    return new vscode.ThemeIcon(id, new vscode.ThemeColor(FALLBACK_ICON_COLOR[status]));
  }

  const file = statusIconFile(status);
  return {
    light: vscode.Uri.joinPath(extensionUri, 'media', 'mastery', 'light', file),
    dark: vscode.Uri.joinPath(extensionUri, 'media', 'mastery', 'dark', file),
  };
}
