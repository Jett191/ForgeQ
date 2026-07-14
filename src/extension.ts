/**
 * Extension 激活入口（Task 20）。
 *
 * `activate` 初始化 Storage、注册命令与 TreeDataProvider，启动异步清理。
 * `deactivate` 由 VS Code 在扩展卸载时调用。
 *
 * Validates: Requirements 2.1, 3.1, 5.1, 10.1, 11.1, 11.2
 */

import * as vscode from 'vscode';

import { removeBank, switchBank } from './commands/bankCommands.js';
import {
  clearFilters,
  filterByCategory,
  filterByDifficulty,
  filterByType,
  toggleGroupByCategory,
} from './commands/filterCommands.js';
import { importBank } from './importer/importer.js';
import { PracticeController } from './practice/practiceController.js';
import { BankRegistry } from './storage/bankRegistry.js';
import { Storage } from './storage/storage.js';
import { QuestionListProvider, type QuestionTreeItem } from './views/questionListProvider.js';
import { ReviewProvider } from './views/reviewProvider.js';

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  // 1. Storage 初始化
  const storage = await Storage.create(ctx);
  const state = await storage.bootstrap();

  // 2. 实例化核心组件
  const registry = new BankRegistry(storage, ctx.globalState);
  const listProvider = new QuestionListProvider({ extensionUri: ctx.extensionUri });
  const reviewProvider = new ReviewProvider(ctx.extensionUri);
  const practiceController = new PracticeController(ctx, storage, state, {
    onLearningChanged: (bankId) => {
      if (state.currentBank?.bankId !== bankId) return;
      listProvider.refresh();
      reviewProvider.refresh();
    },
  });

  // 3. 初始数据注入
  if (state.currentBank) {
    const summary = registry.current();
    listProvider.setBank(state.currentBank.bank, summary, state.currentBank.learning);
    reviewProvider.setBank(state.currentBank.bank, state.currentBank.learning);
  }

  // 4. 注册 TreeDataProvider
  const listView = vscode.window.createTreeView('frontendInterview.questionList', {
    treeDataProvider: listProvider,
  });
  const reviewView = vscode.window.createTreeView('frontendInterview.review', {
    treeDataProvider: reviewProvider,
  });

  // 5. 注册命令
  const importCmd = vscode.commands.registerCommand(
    'frontendInterview.import',
    () => importBank(ctx, storage, registry, state, listProvider, reviewProvider),
  );

  const openQuestionCmd = vscode.commands.registerCommand(
    'frontendInterview.openQuestion',
    (qid: string) => practiceController.open(qid),
  );

  const deleteAnswerCmd = vscode.commands.registerCommand(
    'frontendInterview.deleteAnswer',
    (item: QuestionTreeItem | string | undefined) => {
      const qid = typeof item === 'string'
        ? item
        : item?.kind === 'question'
          ? item.question.id
          : undefined;
      if (qid) return practiceController.deleteAnswer(qid);
      return undefined;
    },
  );

  const switchBankCmd = vscode.commands.registerCommand(
    'frontendInterview.switchBank',
    () => switchBank(registry, storage, state, listProvider, reviewProvider),
  );

  const removeBankCmd = vscode.commands.registerCommand(
    'frontendInterview.removeBank',
    () => removeBank(registry, storage, state, listProvider, reviewProvider),
  );

  const reviewUnmasteredCmd = vscode.commands.registerCommand(
    'frontendInterview.review.unmastered',
    () => { reviewProvider.enter('unmastered'); },
  );

  const reviewFavoriteCmd = vscode.commands.registerCommand(
    'frontendInterview.review.favorite',
    () => { reviewProvider.enter('favorite'); },
  );

  const reviewWrongCmd = vscode.commands.registerCommand(
    'frontendInterview.review.wrong',
    () => { reviewProvider.enter('wrong'); },
  );

  // Filter commands (题目列表筛选与分组)
  const filterByTypeCmd = vscode.commands.registerCommand(
    'frontendInterview.filter.byType',
    () => filterByType(listProvider),
  );
  const filterByCategoryCmd = vscode.commands.registerCommand(
    'frontendInterview.filter.byCategory',
    () => filterByCategory(listProvider),
  );
  const filterByDifficultyCmd = vscode.commands.registerCommand(
    'frontendInterview.filter.byDifficulty',
    () => filterByDifficulty(listProvider),
  );
  const clearFiltersCmd = vscode.commands.registerCommand(
    'frontendInterview.filter.clear',
    () => clearFilters(listProvider),
  );
  const toggleGroupCmd = vscode.commands.registerCommand(
    'frontendInterview.toggleGroupByCategory',
    () => toggleGroupByCategory(listProvider),
  );

  // 6. Push to subscriptions
  ctx.subscriptions.push(
    listView,
    reviewView,
    importCmd,
    openQuestionCmd,
    deleteAnswerCmd,
    switchBankCmd,
    removeBankCmd,
    reviewUnmasteredCmd,
    reviewFavoriteCmd,
    reviewWrongCmd,
    filterByTypeCmd,
    filterByCategoryCmd,
    filterByDifficultyCmd,
    clearFiltersCmd,
    toggleGroupCmd,
    { dispose: () => practiceController.dispose() },
  );

  // 7. Async trash purge (non-blocking)
  const sevenDays = 7 * 24 * 3600 * 1000;
  void storage.trash.purge({ olderThanMs: sevenDays }).catch(() => {
    // Non-fatal; ignore purge failure at startup.
  });
}

export function deactivate(): void {
  // Cleanup handled by subscription disposal.
}
