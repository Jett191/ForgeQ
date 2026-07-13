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
import type { InMemoryState, Storage } from '../storage/storage.js';
import {
  syncProviders,
  type QuestionListSyncTarget,
  type ReviewSyncTarget,
} from '../views/providerSync.js';

/**
 * 切换当前激活题库。
 */
export async function switchBank(
  registry: BankRegistry,
  storage: Storage,
  state: InMemoryState,
  listProvider: QuestionListSyncTarget,
  reviewProvider: ReviewSyncTarget,
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

  // Reload state.currentBank with the new bank's data
  try {
    const bank = await storage.banks.readBank(selected.bankId);
    const learning = await storage.userData.readLearningMap(selected.bankId);
    state.currentBank = { bankId: selected.bankId, bank, learning };
  } catch (err) {
    delete state.currentBank;
    const cause = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`切换题库失败: ${cause}`);
  }

  syncProviders(state, registry.current(), listProvider, reviewProvider);
}

/**
 * 移除题库。
 */
export async function removeBank(
  registry: BankRegistry,
  storage: Storage,
  state: InMemoryState,
  listProvider: QuestionListSyncTarget,
  reviewProvider: ReviewSyncTarget,
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

  // 删除当前题库时，Storage 会自动选中剩余列表里最近导入的题库。
  if (state.currentBank?.bankId === selected.bankId) {
    const fallback = registry.current();
    if (fallback) {
      try {
        const bank = await storage.banks.readBank(fallback.id);
        const learning = await storage.userData.readLearningMap(fallback.id);
        state.currentBank = { bankId: fallback.id, bank, learning };
      } catch (err) {
        delete state.currentBank;
        const cause = err instanceof Error ? err.message : String(err);
        await vscode.window.showErrorMessage(`删除成功，但加载剩余题库失败: ${cause}`);
      }
    } else {
      delete state.currentBank;
    }
  }

  syncProviders(state, registry.current(), listProvider, reviewProvider);
}
