/**
 * BankStore（Task 10.1）
 *
 * `BankStore` 是 Storage 子层中负责 **题库本体**（不变内容）持久化的模块。
 * 它把 `QuestionBank` 写入 `<globalStorageUri>/banks/<bankId>/bank.json`，
 * 并在同目录下维护 `schema-version`（纯文本）以便后续做布局迁移。
 *
 * ## 文件布局
 *
 * ```
 * <baseUri>/                    // 通常是 <globalStorageUri>/banks
 * ├── <bankId>/
 * │   ├── bank.json             // QuestionBank（UTF-8 JSON）
 * │   └── schema-version        // 单库结构版本号，纯文本（当前固定为 "1"）
 * └── <bankId>.tmp/             // 写入过程中的临时目录；写入完成后由
 *                               // renameDirAtomic 提升为 <bankId>/
 * ```
 *
 * ## 写入语义（Task 10.1）
 *
 * `writeBankAtomic(bankId, bank)` 严格按以下步骤执行：
 *
 *   1. 入口先 `safeDelete(<bankId>.tmp)`，清理上一次写入未提交时遗留的临时目录，
 *      避免 stale 内容混入新写入。
 *   2. 在 `<bankId>.tmp/` 下写出 `bank.json` 与 `schema-version` —— 通过
 *      `writeAtomicJson` / `writeAtomicText` 走 "tmp + rename" 内层原子写入。
 *      这一步任何失败都会触发 catch 块的清理逻辑（删除整个 `<bankId>.tmp`），
 *      保证写入失败后磁盘状态与写入前完全一致（实现层 / Req 11.3）。
 *   3. 把整个 `<bankId>.tmp/` 通过 `renameDirAtomic` 提升为最终的 `<bankId>/`。
 *      `renameDirAtomic` 自身在跨分区 / 平台限制下会退化为 `copy + delete`，
 *      该退化路径不再具备原子性 —— 此时上层（`Storage.installBank` Phase 1）
 *      应当感知到错误并把它转译为 `BANK_FS_WRITE_FAILED` / `META_CORRUPT`。
 *
 * 任意阶段抛错时，本模块都尽 best-effort 把 `<bankId>.tmp/` 清掉再向上抛出原始
 * 错误。"清理失败" 不再覆盖原始错误（仅 console.warn），以保留 root cause 给
 * 上层观测。
 *
 * ## 与 Trash 的边界
 *
 * `deleteBank(bankId)` 是 *硬删除*，**不**走 Trash —— 设计目的是供
 * `Storage.installBank` 在 Phase 2 / 3 失败时清理刚写好的 `banks/<newBankId>/`，
 * 此时它属于 "尚未对用户可见" 的副产物，没有进 Trash 的价值。
 * 用户可见的旧 bank 移除流程在更高层（`Trash.moveToTrash`）。
 *
 * Validates: Requirements 11.1, 11.2, 11.6
 */

import * as vscode from 'vscode';

import type { QuestionBank } from '../types/question';
import { renameDirAtomic, safeDelete, writeAtomicJson, writeAtomicText } from './atomicFs';

/** 当前 BankStore 的目录布局版本号，写入到 `schema-version` 文件。 */
export const BANK_SCHEMA_VERSION = '1';

/** 临时目录后缀；与 `atomicFs` / design.md 中 `<bankId>.tmp/` 命名一致。 */
const TMP_DIR_SUFFIX = '.tmp';

/** 题库本体文件名。 */
const BANK_JSON_FILE = 'bank.json';

/** 单库结构版本号文件名（纯文本）。 */
const SCHEMA_VERSION_FILE = 'schema-version';

/**
 * 判断错误是否表示 "文件不存在"。同时兼容 `vscode.FileSystemError`（生产）与
 * polyfill / Node 的 `ENOENT`（测试 harness）。
 */
function isFileNotFound(err: unknown): boolean {
  if (err instanceof vscode.FileSystemError) {
    return err.code === 'FileNotFound';
  }
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return code === 'FileNotFound' || code === 'ENOENT';
}

/**
 * `BankStore` 实现。
 *
 * 实例一般由 `Storage.create(ctx)` 在引导期构造，传入
 * `vscode.Uri.joinPath(ctx.globalStorageUri, 'banks')` 作为 `baseUri`。
 * 测试中亦可用 `HarnessUri.joinPath(harness.globalStorageUri, 'banks')` 注入。
 */
export class BankStore {
  /**
   * @param baseUri 题库根目录，通常为 `<globalStorageUri>/banks`。所有读 / 写
   * 操作都以该 URI 为基准 `joinPath`，不会越权访问其他位置。
   */
  constructor(private readonly baseUri: vscode.Uri) {}

  /**
   * 读取指定 bankId 对应的题库 JSON。
   *
   * - 文件不存在 / JSON 损坏 / 类型异常 都会以原始错误 / 包装错误向上抛出，
   *   由 `Storage` Facade 转译为 `BANK_FS_READ_FAILED` 或 `BANK_NOT_FOUND`。
   * - 读取后**不**做 schema 校验：调用方在写入时已用 `Parser` 校验过；本模块
   *   仅负责"忠实读出磁盘上的对象"。后续若需要重新校验，由 Bootstrap 流程显式触发。
   */
  async readBank(bankId: string): Promise<QuestionBank> {
    const jsonUri = this.bankJsonUri(bankId);
    const bytes = await vscode.workspace.fs.readFile(jsonUri);
    const text = new TextDecoder('utf-8').decode(bytes);
    const parsed = JSON.parse(text) as QuestionBank;
    return parsed;
  }

  /**
   * 把 `bank` 原子写入 `<baseUri>/<bankId>/`。
   *
   * 写入流程：
   *
   *   1. `safeDelete(<bankId>.tmp)` —— 清理可能的历史残留。
   *   2. 在 `<bankId>.tmp/` 下分别写入 `bank.json`（UTF-8 JSON，
   *      `JSON.stringify(bank, null, 2)`）与 `schema-version`（纯文本 `"1"`）。
   *   3. `renameDirAtomic(<bankId>.tmp, <bankId>)` 提升为最终目录。
   *
   * 任意一步抛错都会触发清理：尽 best-effort 删掉 `<bankId>.tmp/`，再把原始错误
   * 抛出。`Storage.installBank` Phase 1 会进一步把它包装为
   * `BANK_FS_WRITE_FAILED`（参见 design.md > Error Handling）。
   *
   * 注意：本方法**不**保护已存在的 `<bankId>/`。`renameDirAtomic` 内部使用
   * `overwrite: true`，再次写入同一 bankId 会替换其中内容；上层 `installBank`
   * 总是用全新 UUID，不依赖此行为，但保持语义对调用方明确。
   */
  async writeBankAtomic(bankId: string, bank: QuestionBank): Promise<void> {
    const tmpDirUri = this.bankTmpDirUri(bankId);
    const finalDirUri = this.bankDirUri(bankId);

    // Step 1：清理可能的历史 tmp 目录（前一次进程在 rename 之前 crash 或失败回滚遗留）。
    // 清理失败不致命；最坏情况是接下来的写入覆盖其中内容。
    try {
      await safeDelete(tmpDirUri);
    } catch (cleanupErr) {
      console.warn(
        '[bankStore] failed to remove stale tmp dir before write; continuing:',
        cleanupErr,
      );
    }

    try {
      // Step 2：写入 tmp 目录下的两份文件。`writeAtomicJson` / `writeAtomicText`
      // 自身已是 "写 .tmp + rename" 原子操作；这两次原子写共同构成 tmp 目录的内容。
      const tmpBankJsonUri = vscode.Uri.joinPath(tmpDirUri, BANK_JSON_FILE);
      const tmpSchemaVersionUri = vscode.Uri.joinPath(tmpDirUri, SCHEMA_VERSION_FILE);

      await writeAtomicJson(tmpBankJsonUri, bank);
      await writeAtomicText(tmpSchemaVersionUri, BANK_SCHEMA_VERSION);

      // Step 3：把整个 tmp 目录提升为最终目录。同分区 rename 是原子的；
      // 跨分区 / 平台限制下退化为 copy+delete，由 atomicFs 内部记录警告。
      await renameDirAtomic(tmpDirUri, finalDirUri);
    } catch (writeErr) {
      // 任意阶段失败：尽力清理 tmp 残留，再透出原始错误。
      // 这里捕获清理异常仅为日志，不让 cleanup 失败覆盖根本原因。
      try {
        await safeDelete(tmpDirUri);
      } catch (cleanupErr) {
        console.warn(
          '[bankStore] failed to clean up tmp dir after write failure; leaving residue:',
          cleanupErr,
        );
      }
      throw writeErr;
    }
  }

  /**
   * 判断 `<baseUri>/<bankId>/bank.json` 是否存在。
   *
   * - 文件存在：返回 `true`。
   * - 文件不存在（FileNotFound / ENOENT）：返回 `false`。
   * - 其它错误（例如 NoPermissions）：透出，由调用方处理。
   *
   * 选择以 `bank.json` 而非目录本身作为存在性标志，是因为目录可能在写入失败的
   * 中途被部分创建出来；以 `bank.json` 为准更贴近 "用户可见的题库存在" 语义。
   */
  async bankExists(bankId: string): Promise<boolean> {
    const jsonUri = this.bankJsonUri(bankId);
    try {
      await vscode.workspace.fs.stat(jsonUri);
      return true;
    } catch (err) {
      if (isFileNotFound(err)) {
        return false;
      }
      throw err;
    }
  }

  /**
   * 硬删除 `<baseUri>/<bankId>/`（不走 Trash）。目录不存在时静默成功。
   *
   * 主要用途：`Storage.installBank` Phase 2 / 3 失败时清理刚写好的 `<newBankId>/`
   * 这种 "尚未对用户可见" 的副产物。用户可见的旧 bank 应通过 `Trash.moveToTrash`
   * 移除，本方法不参与该路径。
   */
  async deleteBank(bankId: string): Promise<void> {
    await safeDelete(this.bankDirUri(bankId));
  }

  /** `<baseUri>/<bankId>/`，最终目录。 */
  private bankDirUri(bankId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.baseUri, bankId);
  }

  /** `<baseUri>/<bankId>.tmp/`，写入过程中的临时目录。 */
  private bankTmpDirUri(bankId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.baseUri, `${bankId}${TMP_DIR_SUFFIX}`);
  }

  /** `<baseUri>/<bankId>/bank.json`，题库本体文件。 */
  private bankJsonUri(bankId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.bankDirUri(bankId), BANK_JSON_FILE);
  }
}
