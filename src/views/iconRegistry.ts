/**
 * Mastery 视觉标识注册表（Task 7.1）。
 *
 * 该模块对齐 design.md 中：
 *
 *  - "Correctness Properties > Property 15: Mastery 视觉标识单射"：
 *    `MasteryStatus` 四个取值映射到的 ThemeIcon 互不相同（单射）。
 *  - Req 9.5：`Question_List_View` 在每个列表项上展示与 `Mastery_Status`
 *    一致的视觉标识，且四种取值的视觉标识彼此可区分。
 *
 * 设计说明：
 *
 *  - 视觉差异同时通过 **图标 id** 与 **图标颜色** 两个维度提供。`vscode.ThemeIcon`
 *    的相等性由调用方判定，单元测试用 `iconKey(icon)` 这个纯函数辅助比较，
 *    保证 PBT 在不依赖 VS Code 真实运行时的情况下也能验证单射性。
 *  - 选用的 codicon id 全部来自 VS Code 内置 codicon set
 *    （https://microsoft.github.io/vscode-codicons/），不会随版本变动消失。
 *
 * 选型理由：
 *
 *  | MasteryStatus  | codicon id        | 颜色 token (ThemeColor)               | 含义                           |
 *  |----------------|-------------------|----------------------------------------|--------------------------------|
 *  | unlearned      | `circle-outline`  | `descriptionForeground`                | 空心圆 — 尚未开始练习         |
 *  | learning       | `record`          | `charts.yellow`                        | 黄色实心点 — 学习中           |
 *  | mastered       | `check`           | `testing.iconPassed`                   | 绿色对勾 — 已掌握             |
 *  | not_mastered   | `close`           | `testing.iconFailed`                   | 红色叉 — 未掌握 / 错题        |
 *
 * 四个 codicon id 两两不同，颜色 token 也两两不同，单射条件满足。
 */

import * as vscode from 'vscode';

import type { MasteryStatus } from '../types/question.js';

/**
 * `MasteryStatus` 到 codicon id 的映射。
 *
 * 用 `Record<MasteryStatus, string>` 而非 `Map`，便于 TypeScript 在添加新
 * `MasteryStatus` 取值时通过类型穷举检查（`exactOptionalPropertyTypes`）
 * 让本表必须同步更新。
 *
 * 注：每个 id 都是 codicon 内置图标，调用方无需额外贡献资源。
 */
const STATUS_ICON_ID: Readonly<Record<MasteryStatus, string>> = Object.freeze({
  unlearned: 'circle-outline',
  learning: 'record',
  mastered: 'check',
  not_mastered: 'close',
});

/**
 * `MasteryStatus` 到 ThemeColor token 的映射。
 *
 * 颜色 token 走 VS Code 主题着色，既保证用户在不同主题（亮 / 暗 / 高对比度）
 * 下都能区分四种状态，又避免硬编码具体颜色值导致主题不一致。
 */
const STATUS_ICON_COLOR: Readonly<Record<MasteryStatus, string>> = Object.freeze({
  unlearned: 'descriptionForeground',
  learning: 'charts.yellow',
  mastered: 'testing.iconPassed',
  not_mastered: 'testing.iconFailed',
});

/**
 * 把 `MasteryStatus` 转换为 `vscode.ThemeIcon`。
 *
 *  - 同一 `MasteryStatus` 多次调用会返回**新的 ThemeIcon 实例**，但其 `id` 与
 *    `color` 保持稳定，符合 VS Code TreeItem 渲染的常规用法。
 *  - 四个取值的返回值在 `id` 维度两两不同，在 `color` 维度也两两不同，
 *    满足 design.md Property 15 的单射约束。
 *
 * @param status 单题的掌握状态。
 * @returns 与 `status` 对应的 ThemeIcon。
 */
export function statusToIcon(status: MasteryStatus): vscode.ThemeIcon {
  const id = STATUS_ICON_ID[status];
  const colorId = STATUS_ICON_COLOR[status];
  return new vscode.ThemeIcon(id, new vscode.ThemeColor(colorId));
}

/**
 * 仅用于测试的派生函数：把一个 `vscode.ThemeIcon` 投影成可比较的字符串。
 *
 * 形如 `"circle-outline|descriptionForeground"`，由 `iconRegistry.test.ts`
 * 与 PBT (Property 15) 用来在不依赖 ThemeIcon 引用相等性的前提下断言单射。
 *
 * 该函数容忍 `color` 缺失（返回 `<id>|<none>`），方便未来扩展。
 */
export function iconKey(icon: vscode.ThemeIcon): string {
  // ThemeIcon 的 color 字段在运行时是 `ThemeColor | undefined`；ThemeColor
  // 内部以 `id` 表征，但官方类型并未导出 `id`。我们只需要可比较的字符串，所以
  // 在测试桩里也兼容这个布局。
  const color = (icon as { color?: { id?: string } }).color;
  const colorId = color?.id ?? '<none>';
  return `${icon.id}|${colorId}`;
}
