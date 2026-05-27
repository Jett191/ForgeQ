/**
 * installBank 五阶段事务（Task 13.2）
 *
 * `Storage.installBank` 的内部实现：把一个新解析出的 `QuestionBank` 安全切换为
 * 当前激活题库，旧 bank（若存在）被搬入 `trash/` 而非立即硬删。任意阶段失败时
 * 按 design.md > Architecture > 导入题库（安全切换）规定的回滚路径恢复，保证
 * 用户视角下"旧 bank 完整可见 / 新 bank 不可见"或"新 bank 完整生效"两种最终态
 * 之一。
 *
 * ## 阶段划分（与 design.md 序列图一一对应）
 *
 *   Phase 1 — 写新 bank：`bankStore.writeBankAtomic(newId, bank)`。
 *     失败：`safeDelete(banks/<newId>.tmp)` 然后抛 `BANK_FS_WRITE_FAILED`；
 *     旧 bank 完全不变。
 *
 *   Phase 2 — 创建 user-data 根目录：`userDataStore.ensureBankRoot(newId)`。
 *     失败：先回滚 Phase 1（`bankStore.deleteBank(newId)`），然后抛
 *     `BANK_FS_WRITE_FAILED`；旧 bank 完全不变。
 *
 *   Phase 3 — 切元数据：`metaStore.writeAtomic(nextMeta)`，其中
 *     `nextMeta.currentBankId = newId` 且 `banks` 数组追加 newId 的 summary。
 *     失败：依次回滚 Phase 1 / 2，然后抛 `META_CORRUPT`；旧 bank 完全不变。
 *
 *   Phase 4 — 同步 globalState：`globalState.update('fip:currentBankId', newId)`。
 *     失败：仅记录 warning，不回滚。`meta.json` 已经是真理源（Property 18）；
 *     globalState 仅是快速读取镜像，下次 bootstrap 会自我修正。
 *
 *   Phase 5 — 旧 bank 入 trash：`trash.moveToTrash([banks/<oldId>, user-data/<oldId>], { bankId: oldId })`。
 *     失败：仅记录 warning，不回滚。从用户视角看 `meta.json` 已经切换、旧 bank
 *     不再可见；磁盘上的残留物会在下次 `Trash.purge` 中由 7 日窗口外的清理或
 *     手动恢复消化。
 *
 * ## 失败语义
 *
 * 所有失败统一抛出 `InstallBankError`（见下），调用方 `Storage.installBank`
 * 把它转译为 `DomainError` 联合并由上层 UI 提示。Phase 4 / 5 不抛错，只 warn。
 *
 * Validates: Requirements 2.9（覆盖导入语义）, 11.4（覆盖导入安全切换）。
 */

import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';

import type { BankMeta, BankSource, BankSummary } from '../types/bankMeta';
import type { DomainError } from '../types/errors';
import type { QuestionBank } from '../types/question';
import type { BankStore } from './bankStore';
import type { MetaStore } from './metaStore';
import type { Trash } from './trash';
import type { UserDataStore } from './userDataStore';

/**
 * 表示 installBank 各阶段失败的可抛异常。
 *
 * - `code`：与 `DomainError` 联合中的 `BANK_FS_WRITE_FAILED` / `META_CORRUPT`
 *   对齐，便于上层做统一错误提示。
 * - `phase`：1 / 2 / 3 之一，标记失败发生在哪个阶段。Phase 4 / 5 不抛错。
 * - `cause`：底层错误的可读原因。
 * - `bankId`：失败时尚未生效的 newBankId（便于排查）。
 */
export class InstallBankError extends Error {
  readonly code: 'BANK_FS_WRITE_FAILED' | 'META_CORRUPT';
  readonly phase: 1 | 2 | 3;
  readonly bankId: string;
  readonly reason: string;

  constructor(
    code: 'BANK_FS_WRITE_FAILED' | 'META_CORRUPT',
    phase: 1 | 2 | 3,
    bankId: string,
    reason: string,
    options?: { cause?: unknown },
  ) {
    super(`installBank: phase ${phase} failed for bank ${bankId} — ${reason}`, options);
    this.name = 'InstallBankError';
    this.code = code;
    this.phase = phase;
    this.bankId = bankId;
    this.reason = reason;
  }

  /** 转换为 `DomainError` 联合，便于上层 UI 显示。 */
  toDomainError(): DomainError {
    if (this.code === 'BANK_FS_WRITE_FAILED') {
      return { code: 'BANK_FS_WRITE_FAILED', bankId: this.bankId, cause: this.reason };
    }
    return { code: 'META_CORRUPT', cause: this.reason };
  }
}

/** 提取错误的可读 message，作为 `reason` / `cause` 字段；非 Error 走 String 兜底。 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** installBank 的依赖集合，由 `Storage` Facade 注入。 */
export interface InstallBankDeps {
  readonly meta: MetaStore;
  readonly banks: BankStore;
  readonly userData: UserDataStore;
  readonly trash: Trash;
  readonly globalState: { update(key: string, value: unknown): Thenable<void> };
  /** 当前内存中 `BankMeta` 快照；installBank 基于其计算 nextMeta。 */
  readonly currentMeta: BankMeta;
  /** trash baseUri（用于构造 banks/<oldId>、user-data/<oldId> 的 URI 列表，避免暴露内部目录布局）。 */
  readonly banksBaseUri: vscode.Uri;
  readonly userDataBaseUri: vscode.Uri;
  /** 仅测试可注入：UUID 生成器与时间源；生产保持默认。 */
  readonly newId?: () => string;
  readonly now?: () => number;
}

/** installBank 成功后返回的摘要项与新 meta 快照。 */
export interface InstallBankResult {
  readonly summary: BankSummary;
  readonly nextMeta: BankMeta;
}

/**
 * 执行五阶段安全切换。
 *
 * @throws {InstallBankError} Phase 1 / 2 / 3 失败时抛出，已自动回滚到失败前状态。
 */
export async function installBank(
  bank: QuestionBank,
  source: BankSource | undefined,
  deps: InstallBankDeps,
): Promise<InstallBankResult> {
  const newId = (deps.newId ?? uuidv4)();
  const importedAt = (deps.now ?? Date.now)();

  const summary: BankSummary = {
    id: newId,
    name: bank.name,
    version: bank.version,
    questionCount: bank.questions.length,
    importedAt,
    ...(source?.fileName !== undefined ? { source: { fileName: source.fileName } } : {}),
  };

  const oldId = deps.currentMeta.currentBankId;

  // ---- Phase 1: 写新 bank ----
  try {
    await deps.banks.writeBankAtomic(newId, bank);
  } catch (err) {
    // 失败：BankStore 已经尽力清理 <newId>.tmp/，此处补一刀也不致命。
    try {
      await deps.banks.deleteBank(newId);
    } catch {
      /* swallow */
    }
    throw new InstallBankError('BANK_FS_WRITE_FAILED', 1, newId, describeError(err), {
      cause: err,
    });
  }

  // ---- Phase 2: 创建 user-data 根目录 ----
  try {
    await deps.userData.ensureBankRoot(newId);
  } catch (err) {
    // 回滚 Phase 1。
    try {
      await deps.banks.deleteBank(newId);
    } catch (rollbackErr) {
      console.warn('[installBank] rollback of phase 1 (deleteBank) failed:', rollbackErr);
    }
    throw new InstallBankError('BANK_FS_WRITE_FAILED', 2, newId, describeError(err), {
      cause: err,
    });
  }

  // ---- Phase 3: 切元数据 ----
  // 注意：currentMeta.banks 中可能仍含 oldId 的 summary —— 我们保留它直到 Phase 5
  // 完成搬入 trash。但 currentBankId 已切换，UI 与 BankRegistry.list() 会按新 meta
  // 渲染。等 Phase 5 之后再做一次 meta 写入移除 oldId 的 summary，则会让 meta.json
  // 写入两次；为了避免两次 fs 写，本实现选择 *在 Phase 3 一次写入完成* 的策略：
  //   - banks 数组追加新 summary；
  //   - 如果 oldId 存在且 oldId !== newId，则同时把 oldId 的 summary 移除。
  // 这样 Phase 5 仅做 trash 搬移，不再触碰 meta.json。
  const filteredBanks =
    oldId !== undefined
      ? deps.currentMeta.banks.filter((b) => b.id !== oldId)
      : deps.currentMeta.banks.slice();
  const nextMeta: BankMeta = {
    ...deps.currentMeta,
    currentBankId: newId,
    banks: [...filteredBanks, summary],
  };
  try {
    await deps.meta.writeAtomic(nextMeta);
  } catch (err) {
    // 回滚 Phase 2 + Phase 1。
    try {
      await deps.userData.deleteBankRoot(newId);
    } catch (rollbackErr) {
      console.warn(
        '[installBank] rollback of phase 2 (deleteBankRoot) failed:',
        rollbackErr,
      );
    }
    try {
      await deps.banks.deleteBank(newId);
    } catch (rollbackErr) {
      console.warn('[installBank] rollback of phase 1 (deleteBank) failed:', rollbackErr);
    }
    throw new InstallBankError('META_CORRUPT', 3, newId, describeError(err), {
      cause: err,
    });
  }

  // ---- Phase 4: 同步 globalState ----
  // 失败仅警告：meta.json 已切换并 fsync 完成，是真理源；下次 bootstrap 会以
  // meta.json 为准把 globalState 修正回来（Property 18）。
  try {
    await deps.globalState.update('fip:currentBankId', newId);
  } catch (err) {
    console.warn(
      '[installBank] phase 4: globalState.update failed (non-fatal, meta.json is source of truth):',
      err,
    );
  }

  // ---- Phase 5: 旧 bank 入 trash ----
  // 仅当存在旧 bank 且与新 bank 不同（同一进程内重复 install 同一 newId 不可能，
  // 但 oldId === newId 的防御性兜底也不浪费太多代码）。失败仅警告，不阻塞主流程。
  if (oldId !== undefined && oldId !== newId) {
    const oldBankUri = vscode.Uri.joinPath(deps.banksBaseUri, oldId);
    const oldUserDataUri = vscode.Uri.joinPath(deps.userDataBaseUri, oldId);
    try {
      await deps.trash.moveToTrash([oldBankUri, oldUserDataUri], { bankId: oldId });
    } catch (err) {
      console.warn(
        '[installBank] phase 5: moveToTrash failed (non-fatal, old bank no longer visible via meta.json):',
        err,
      );
    }
  }

  return { summary, nextMeta };
}
