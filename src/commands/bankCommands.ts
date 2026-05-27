/**
 * Bank 命令处理器（Task 20）。
 *
 * - `switchBank`：QuickPick 切换题库。
 * - `removeBank`：QuickPick + 确认弹窗 移除题库。
 *
 * Validates: Requirements 2.9, 2.10
 */

import * as vscode from 'vscode';

import type { BankRegistry } from '../storage/bankRegistry.js';
import type { InMemoryState } from '../storage/storage.js';

/**
 * 切换当前激活题库。
 */
export async function switchBank(
  registry: BankRegistry,
  state: InMemoryState,
  listProvider: { refresh(): void },
  reviewProvider: { refresh(): void },
): Promise<void> {
  const banks = registry.list();
  if (banks.length === 0) {
    await vscode.window.showInformationMessage('尚未导入任何题库。');
    return;
  }

  const items = banks.map((b) => ({
    label: b.name,
    description: `${b.version} (${b.questionCount} 题)`,
    bankId: b.id,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: '选择要切换的题库',
  });

  if (!selected) return;

  await registry.switchTo(selected.bankId);
  listProvider.refresh();
  reviewProvider.refresh();
}

/**
 * 移除题库。
 */
export async function removeBank(
  registry: BankRegistry,
  state: InMemoryState,
  listProvider: { refresh(): void },
): Promise<void> {
  const banks = registry.list();
  if (banks.length === 0) {
    await vscode.window.showInformationMessage('尚未导入任何题库。');
    return;
  }

  const items = banks.map((b) => ({
    label: b.name,
    description: `${b.version} (${b.questionCount} 题)`,
    bankId: b.id,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: '选择要移除的题库',
  });

  if (!selected) return;

  const confirm = await vscode.window.showWarningMessage(
    '确认移除该题库？所有学习记录将被清除。',
    { modal: true },
    '确认',
  );

  if (confirm !== '确认') return;

  await registry.remove(selected.bankId);
  listProvider.refresh();
}
