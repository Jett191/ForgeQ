/**
 * BankRegistry（Task 14.1）
 *
 * 维护 `BankSummary[]` 内存视图，提供切换 / 移除 bank、同步
 * `globalState['fip:currentBankId']` 的高层 API。上层 UI（`QuestionListView` /
 * `ReviewView` / 命令面板）通过本模块操作题库列表与激活状态。
 *
 * ## 职责
 *
 *   - `list()`：返回当前 meta 中的 `BankSummary[]`。
 *   - `current()`：返回当前激活 bank 的 summary（若有）。
 *   - `switchTo(bankId)`：更新 `meta.json` 中的 `currentBankId` 并同步 globalState。
 *   - `install(bank, src?)`：委托 `Storage.installBank`，返回新 summary。
 *   - `remove(bankId)`：委托 `Storage.removeBank`。
 *   - `isLegacyDuplicate(bank)`：判断是否存在同名同版本的题库。
 *
 * ## 不在职责范围内
 *
 *   - 文件 I/O 细节：由 `Storage` Facade 与子层承担。
 *   - 视图刷新：由上层监听事件触发。
 *   - Toggle Favorite：由上层通过 `Storage.writeWithRollback` 完成。
 *
 * Validates: Requirements 2.9, 2.10, 11.4
 */

import * as vscode from 'vscode';

import type { BankSource, BankSummary } from '../types/bankMeta.js';
import type { QuestionBank } from '../types/question.js';
import { GLOBAL_STATE_CURRENT_BANK_ID, Storage } from './storage.js';

/**
 * BankRegistry 实例。
 *
 * 在 `activate()` 中实例化：
 * ```ts
 * const registry = new BankRegistry(storage, ctx.globalState);
 * ```
 */
export class BankRegistry {
  constructor(
    private readonly storage: Storage,
    private readonly globalState: vscode.Memento,
  ) {}

  /**
   * 当前 meta 中所有题库的摘要列表。
   * 返回防御性拷贝（`Storage.getCurrentMeta()` 已做拷贝）。
   */
  list(): BankSummary[] {
    return this.storage.getCurrentMeta().banks;
  }

  /**
   * 当前激活 bank 的 summary。若 `currentBankId` 未设置或在列表中不存在，
   * 返回 `undefined`。
   */
  current(): BankSummary | undefined {
    const meta = this.storage.getCurrentMeta();
    if (meta.currentBankId === undefined) return undefined;
    return meta.banks.find((b) => b.id === meta.currentBankId);
  }

  /**
   * 切换激活题库。更新 `meta.json` + 同步 globalState。
   *
   * 若 `bankId` 不在当前列表中，直接返回（防御过期 UI 操作）。
   */
  async switchTo(bankId: string): Promise<void> {
    const previousId = this.storage.getCurrentMeta().currentBankId;
    const switched = await this.storage.switchToBank(bankId);
    if (!switched || previousId === bankId) return;

    // 同步 globalState（失败仅警告，meta.json 为真理源）。
    try {
      await this.globalState.update(GLOBAL_STATE_CURRENT_BANK_ID, bankId);
    } catch (err) {
      console.warn(
        '[BankRegistry] switchTo: globalState sync failed (non-fatal):',
        err,
      );
    }
  }

  /**
   * 安装新题库。委托 `Storage.installBank`。
   */
  async install(bank: QuestionBank, source?: BankSource): Promise<BankSummary> {
    return this.storage.installBank(bank, source);
  }

  /**
   * 移除题库。委托 `Storage.removeBank`。
   */
  async remove(bankId: string): Promise<void> {
    return this.storage.removeBank(bankId);
  }

  /**
   * 判断是否已存在同名同版本的题库（用于阻止重复新增）。
   */
  isLegacyDuplicate(bank: QuestionBank): boolean {
    const banks = this.storage.getCurrentMeta().banks;
    return banks.some((b) => b.name === bank.name && b.version === bank.version);
  }
}
