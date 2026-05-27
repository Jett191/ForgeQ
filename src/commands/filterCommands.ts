/**
 * 题目列表筛选 / 分组命令。
 *
 * 通过 VS Code QuickPick 让用户为 `QuestionListProvider` 设置筛选状态：
 *  - 按类型（代码 / 问答 / 全部）
 *  - 按分类（动态枚举当前题库的所有分类）
 *  - 按难度（简单 / 中等 / 困难 / 全部）
 *  - 清除全部筛选
 *  - 切换分类分组开关
 *
 * 单一信息源：筛选状态保存在 `QuestionListProvider` 内部，命令层只通过
 * `getFilter()` / `setFilter()` 读改写，避免出现"命令层和 provider 状态各持一份且不同步"的常见 bug。
 *
 * exactOptionalPropertyTypes 注意：本仓 tsconfig 启用了
 * `exactOptionalPropertyTypes: true`，因此构造 QuickPickItem 时不能把
 * `description` 显式赋为 `undefined`，否则会被认为是"显式声明 undefined"
 * 而违反类型契约。这里通过先创建对象再按需赋值的方式回避该约束。
 */

import * as vscode from 'vscode';

import type { FilterState } from '../filter/filter.js';
import type { Difficulty, QuestionType } from '../types/question.js';
import type { QuestionListProvider } from '../views/questionListProvider.js';

interface FilterPickItem<TValue> extends vscode.QuickPickItem {
  value: TValue;
}

const TYPE_OPTIONS: ReadonlyArray<{ label: string; value: QuestionType | 'all' }> = [
  { label: '$(list-flat) 全部类型', value: 'all' },
  { label: '$(code) 代码题', value: 'code' },
  { label: '$(comment-discussion) 问答题', value: 'qa' },
];

const DIFFICULTY_OPTIONS: ReadonlyArray<{ label: string; value: Difficulty | 'all' }> = [
  { label: '$(list-flat) 全部难度', value: 'all' },
  { label: '$(circle-filled) 简单', value: 'easy' },
  { label: '$(warning) 中等', value: 'medium' },
  { label: '$(flame) 困难', value: 'hard' },
];

/**
 * 把 `{ label, value }` 选项数组转换为带"当前"角标的 QuickPickItem 数组。
 * 仅当 `value === current` 时才设置 description，否则不写入该字段。
 */
function buildPickItems<TValue>(
  options: ReadonlyArray<{ label: string; value: TValue }>,
  current: TValue | undefined,
): Array<FilterPickItem<TValue>> {
  return options.map((opt) => {
    const item: FilterPickItem<TValue> = { label: opt.label, value: opt.value };
    if (opt.value === current) item.description = '当前';
    return item;
  });
}

/** 按题型筛选。 */
export async function filterByType(provider: QuestionListProvider): Promise<void> {
  const current = provider.getFilter().type;
  const items = buildPickItems(TYPE_OPTIONS, current);
  const picked = await vscode.window.showQuickPick<FilterPickItem<QuestionType | 'all'>>(items, {
    placeHolder: '按题型筛选',
  });
  if (!picked) return;

  const next: FilterState = { ...provider.getFilter() };
  if (picked.value === 'all') {
    delete next.type;
  } else {
    next.type = picked.value;
  }
  provider.setFilter(next);
}

/** 按分类筛选（动态从当前题库收集 category）。 */
export async function filterByCategory(provider: QuestionListProvider): Promise<void> {
  const categories = provider.getCategoriesInBank();
  if (categories.length === 0) {
    await vscode.window.showInformationMessage('当前题库为空或未加载，无法按分类筛选。');
    return;
  }
  const current = provider.getFilter().category;

  const options: Array<{ label: string; value: string | 'all' }> = [
    { label: '$(list-flat) 全部分类', value: 'all' },
    ...categories.map((c) => ({ label: `$(folder) ${c}`, value: c })),
  ];

  // 全部分类一项的 "current" 判定：当前未筛选 category 时为 true。
  const items = options.map((opt) => {
    const item: FilterPickItem<string | 'all'> = { label: opt.label, value: opt.value };
    const isCurrent =
      opt.value === 'all' ? current === undefined : opt.value === current;
    if (isCurrent) item.description = '当前';
    return item;
  });

  const picked = await vscode.window.showQuickPick<FilterPickItem<string | 'all'>>(items, {
    placeHolder: '按分类筛选',
    matchOnDescription: true,
  });
  if (!picked) return;

  const next: FilterState = { ...provider.getFilter() };
  if (picked.value === 'all') {
    delete next.category;
  } else {
    next.category = picked.value;
  }
  provider.setFilter(next);
}

/** 按难度筛选。 */
export async function filterByDifficulty(provider: QuestionListProvider): Promise<void> {
  const current = provider.getFilter().difficulty;
  const items = buildPickItems(DIFFICULTY_OPTIONS, current);
  const picked = await vscode.window.showQuickPick<FilterPickItem<Difficulty | 'all'>>(items, {
    placeHolder: '按难度筛选',
  });
  if (!picked) return;

  const next: FilterState = { ...provider.getFilter() };
  if (picked.value === 'all') {
    delete next.difficulty;
  } else {
    next.difficulty = picked.value;
  }
  provider.setFilter(next);
}

/** 清除全部筛选条件。 */
export function clearFilters(provider: QuestionListProvider): void {
  provider.setFilter({});
}

/** 切换分类分组显示。 */
export function toggleGroupByCategory(provider: QuestionListProvider): void {
  provider.setGroupByCategory(!provider.getGroupByCategory());
}
