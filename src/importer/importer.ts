/**
 * Importer（Task 16.1）
 *
 * 负责弹出文件选择对话框、读取 JSON 文件、调用 Parser、
 * 并通过 BankRegistry 执行安全新增与切换。
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 11.4
 */

import * as vscode from 'vscode';

import type { BankRegistry } from '../storage/bankRegistry.js';
import type { InMemoryState, Storage } from '../storage/storage.js';
import { parse } from '../parser/parser.js';
import {
  syncProviders,
  type QuestionListSyncTarget,
  type ReviewSyncTarget,
} from '../views/providerSync.js';

/** 10 MB 上限（字节）。 */
const FILE_SIZE_LIMIT = 10 * 1024 * 1024;

/**
 * 导入题库。
 *
 * 流程：
 *   1. `showOpenDialog`（单选、`*.json` 过滤）
 *   2. `stat` 文件大小；> 10MB 返回 `FILE_TOO_LARGE`
 *   3. UTF-8 读取文件内容
 *   4. 调用 `parse(text)`
 *   5. 解析失败 -> `showErrorMessage` + 不修改 Storage
 *   6. 解析成功且已存在同名同版本题库 -> 提示先删除旧题库，不重复导入
 *   7. 无重复 -> `registry.install(bank, { fileName })` 作为新题库加入
 *   8. 成功 -> `showInformationMessage` 含题数，触发 `listProvider.refresh()`
 */
export async function importBank(
  ctx: vscode.ExtensionContext,
  storage: Storage,
  registry: BankRegistry,
  state: InMemoryState,
  listProvider: QuestionListSyncTarget,
  reviewProvider?: ReviewSyncTarget,
): Promise<void> {
  // Step 1: 弹出文件选择对话框
  const fileUris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'JSON Files': ['json'] },
    openLabel: '导入题库',
  });

  if (!fileUris || fileUris.length === 0) {
    // 用户取消
    return;
  }

  const fileUri = fileUris[0]!;

  // Step 2: 检查文件大小
  let fileStat: { size: number };
  try {
    fileStat = await vscode.workspace.fs.stat(fileUri);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`读取文件失败: ${cause}`);
    return;
  }

  if (fileStat.size > FILE_SIZE_LIMIT) {
    await vscode.window.showErrorMessage(
      `文件大小超过 10 MB 限制 (${(fileStat.size / 1024 / 1024).toFixed(2)} MB)，无法导入。`,
    );
    return;
  }

  // Step 3: UTF-8 读取文件内容
  let content: string;
  try {
    const raw = await vscode.workspace.fs.readFile(fileUri);
    content = new TextDecoder('utf-8').decode(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`读取文件失败: ${cause}`);
    return;
  }

  // Step 4: 调用 Parser
  const result = parse(content);

  if (!result.ok) {
    // Step 5: 解析失败
    const error = result.error;
    let message: string;
    switch (error.code) {
      case 'INVALID_JSON':
        message = `JSON 解析失败 (行 ${error.line}, 列 ${error.column}): ${error.message}`;
        break;
      case 'SCHEMA_VIOLATION':
        message = `题库格式校验失败: ${error.violations.length} 处违规`;
        break;
      case 'DUPLICATE_QUESTION_ID':
        message = `题目 ID 重复: ${error.duplicates.map((d) => d.id).join(', ')}`;
        break;
      case 'EMPTY_QUESTION_BANK':
        message = '题库中没有题目';
        break;
    }
    await vscode.window.showErrorMessage(message);
    return;
  }

  const bank = result.value;

  // Step 6: 同名同版本视为重复；本产品不提供更新/覆盖，只允许新增。
  if (registry.isLegacyDuplicate(bank)) {
    await vscode.window.showErrorMessage(
      `题库 "${bank.name}" (${bank.version}) 已存在，请先删除旧题库后再导入。`,
    );
    return;
  }

  // Step 7: 执行安装
  const fileName = fileUri.fsPath.split('/').pop() ?? fileUri.fsPath;
  try {
    await registry.install(bank, { fileName });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`导入失败: ${cause}`);
    return;
  }

  // Reload state.currentBank with the newly installed bank
  try {
    const meta = storage.getCurrentMeta();
    if (meta.currentBankId) {
      const loadedBank = await storage.banks.readBank(meta.currentBankId);
      const learning = await storage.userData.readLearningMap(meta.currentBankId);
      state.currentBank = { bankId: meta.currentBankId, bank: loadedBank, learning };
    }
  } catch (err) {
    delete state.currentBank;
    const cause = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`题库已导入，但加载失败: ${cause}`);
  }

  // Step 8: 成功提示 + 刷新列表
  await vscode.window.showInformationMessage(
    `导入成功！共 ${bank.questions.length} 道题目。`,
  );
  syncProviders(state, registry.current(), listProvider, reviewProvider);
}
