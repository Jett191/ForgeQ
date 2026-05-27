/**
 * MetaStore（Task 9.2）
 *
 * 负责 `<globalStorageUri>/meta.json` 的读写，是 Storage 真理源（参见 design.md
 * > Data Models > Bank 元数据；Property 18: meta.json 与 globalState.currentBankId 最终一致）。
 *
 * 职责边界：
 *
 *   1. **写**：`writeAtomic(next)` 通过 `writeAtomicJson` 把 `BankMeta` 序列化到目标 URI，
 *      底层由 `atomicFs` 提供 "tmp + rename" 原子语义。任何写失败的细化错误归属
 *      （如 `META_CORRUPT` / `STORAGE_WRITE_FAILED`）由上层 `Storage` Facade 转译，
 *      这里只透出底层 `vscode.FileSystemError`。
 *
 *   2. **读**：`read()` 走 `vscode.workspace.fs.readFile`，再做两步语义校验：
 *        a. 内容必须是合法 JSON；
 *        b. 顶层必须包含 `schemaVersion` 字段。
 *      任何一步失败都视为 "meta.json 已损坏"，抛 `MetaCorruptError`，让上层
 *      `Storage.bootstrap()` 进入安全模式（参见 design.md > Error Handling > 启动期自愈）。
 *      "文件不存在" 不属于损坏，向上透出 `FileNotFound` 由 bootstrap 决定是否写默认值。
 *
 * 不在职责范围内：
 *   - `meta.json.tmp` 残留清理：由启动期 `startupCleanup` 钩子 / `Storage.bootstrap` 处理。
 *   - `globalState['fip:currentBankId']` 同步：由 `BankRegistry` / `Storage` Facade 处理。
 *   - schemaVersion 迁移：当前仅校验字段存在；未来版本号变更时再扩展。
 *
 * Validates: Requirements 11.1（持久化 meta）, 11.2（启动加载）, 11.5（损坏自愈）。
 */

import * as vscode from 'vscode';

import type { BankMeta } from '../types/bankMeta.js';
import type { DomainError } from '../types/errors.js';
import { writeAtomicJson } from './atomicFs.js';

/**
 * 表示 `meta.json` 已损坏的可抛异常。
 *
 * 设计要点：
 *   - `code` 与 `DomainError` 的 `META_CORRUPT` 分支对齐，便于上层 `instanceof` 或
 *     `(err as { code?: string }).code === 'META_CORRUPT'` 双路径判断。
 *   - `reason` 字段保存与 `DomainError.cause` 同语义的可读原因（例如 "invalid JSON"
 *     或 "missing schemaVersion"），保证 UI 文案可以直接复用。
 *   - 底层原始错误（`SyntaxError` 等）放在 `Error.cause`，便于排查。
 */
export class MetaCorruptError extends Error {
  readonly code = 'META_CORRUPT' as const;
  readonly reason: string;

  constructor(reason: string, options?: { cause?: unknown }) {
    super(`MetaStore: meta.json is corrupt — ${reason}`, options);
    this.name = 'MetaCorruptError';
    this.reason = reason;
  }

  /** 转换为 `DomainError` 标签联合，便于上层做统一错误提示。 */
  toDomainError(): Extract<DomainError, { code: 'META_CORRUPT' }> {
    return { code: 'META_CORRUPT', cause: this.reason };
  }
}

/**
 * 类型守卫：把任意 `unknown` 收窄为合法的 `BankMeta`。
 *
 * 仅校验 `schemaVersion` 字段的存在；进一步的字段级合法性（`banks` 数组类型 /
 * `currentBankId` 是否在 `banks` 中）留给上层 `Storage.bootstrap` / `BankRegistry`
 * 自愈，避免在最底层做过强约束导致用户的旧版本数据无法升级。
 */
function isBankMetaShape(value: unknown): value is BankMeta {
  if (value === null || typeof value !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(value, 'schemaVersion');
}

/**
 * `meta.json` 持久化层。无内部缓存：每次 `read()` 都重新读盘，避免出现 "进程内缓存"
 * 与 "磁盘内容" 不一致的伪一致性。上层若需要避免高频 IO，自己加 cache 即可。
 */
export class MetaStore {
  /**
   * @param metaUri `meta.json` 的完整 URI。典型用法：
   *   `vscode.Uri.joinPath(ctx.globalStorageUri, 'meta.json')`。
   *   传入参数化 URI 而非根目录是为了让上层（如测试）可以把 meta 放在任意位置，
   *   也让本类与 `globalStorageUri` 的具体形态完全解耦。
   */
  constructor(private readonly metaUri: vscode.Uri) {}

  /**
   * 读取并解析 `meta.json`。
   *
   * @throws {MetaCorruptError} JSON 不合法 / 顶层非对象 / 缺失 `schemaVersion`。
   * @throws {vscode.FileSystemError} 文件不存在（`FileNotFound`），或其它 IO 错误（权限等）。
   *   "文件不存在" 由调用方决定如何处理（bootstrap 会写默认 meta；其它路径可能直接报错）。
   */
  async read(): Promise<BankMeta> {
    // 1. 读字节。文件不存在 / 无权限 / 其它 IO 错误透传给上层。
    const bytes = await vscode.workspace.fs.readFile(this.metaUri);

    // 2. UTF-8 解码。
    const text = new TextDecoder('utf-8').decode(bytes);

    // 3. JSON 解析。失败视为内容损坏，抛 META_CORRUPT。
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new MetaCorruptError('invalid JSON', { cause: err });
    }

    // 4. 结构校验（顶层对象 + 必有 schemaVersion）。失败同样视为损坏。
    if (!isBankMetaShape(parsed)) {
      throw new MetaCorruptError('missing schemaVersion');
    }

    return parsed;
  }

  /**
   * 原子写入 `meta.json`。失败时由 `writeAtomicJson` 决定是否退化为 copy+delete；
   * 任意失败都不会让目标文件处于半新半旧状态（除非退化路径在 copy 中途崩溃，
   * 此时下一次 `read()` 会触发 `META_CORRUPT`，`bootstrap` 进入安全模式）。
   *
   * 注意：本方法不强制 `next.schemaVersion === 1`，由上层 `Storage` 在版本迁移时
   * 决定何时升档；类型系统已限定为 `1`（参见 `BankMeta`）。
   */
  async writeAtomic(next: BankMeta): Promise<void> {
    await writeAtomicJson(this.metaUri, next);
  }
}
