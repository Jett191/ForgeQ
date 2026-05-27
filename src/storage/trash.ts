/**
 * Trash（Task 12.1）
 *
 * `Trash` 是 Storage 子层中负责 **隔离区** 的模块。覆盖导入 / 移除题库时，旧
 * `banks/<oldBankId>/` 与 `user-data/<oldBankId>/` 不会被立即硬删，而是被搬移到
 * `<trashRoot>/<bankId>-<timestamp>/` 下，由后台 `purge()` 在时间窗口外异步清理。
 *
 * 这条路径同时承载两个语义：
 *
 *   1. **覆盖导入安全切换**（design.md > Overview > 覆盖导入安全切换）：一旦
 *      `meta.json` 切换到新 bankId，旧 bank 在所有读路径上都不再可见，等价于
 *      "已删除"（满足 Req 2.9 / 11.4 的用户视角语义），物理删除可以延后做。
 *   2. **数据安全保险**：即便 `meta.json` 切换之后立刻进程崩溃，旧数据仍然完整
 *      保留在 `trash/` 下，运维 / 用户可以离线恢复。
 *
 * ## 文件布局
 *
 * ```
 * <baseUri>/                                 // 通常是 <globalStorageUri>/trash
 * ├── <bankId>-<timestamp>/                  // 一次 moveToTrash 调用对应一个目录
 * │   ├── <basename of src1>/...
 * │   └── <basename of src2>/...
 * └── ...
 * ```
 *
 * `<bankId>-<timestamp>` 中 `timestamp` 取自 `Date.now()`（epoch 毫秒）。`bankId`
 * 通常是 UUID v4，自带连字符，因此 `purge` 在解析目录名时必须按 **最后一个**
 * `-` 之后的子串提取时间戳，参见 {@link parseTrashTimestamp}。
 *
 * ## 写入语义（moveToTrash）
 *
 *   1. 计算 `<bankId>-<timestamp>` 子目录名（同一毫秒内多次 move 到同一 bankId
 *      会落在同一子目录；考虑到 import / remove 是低频用户操作，此风险可接受，
 *      `renameDirAtomic` 的 `overwrite: true` 也能保证不抛错）。
 *   2. `createDirectory(destDir)` 确保 trash 根目录及 `<bankId>-<timestamp>/` 存在。
 *   3. 对每个 `src` 计算 `<destDir>/<basename(src)>`，调用
 *      {@link renameDirAtomic} 把整目录搬过去。`renameDirAtomic` 在跨分区 / 平台
 *      限制下退化为 copy+delete，调用方（`Storage.installBank` Phase 5）已把
 *      moveToTrash 的失败定位为 "warning，不阻塞主流程"。
 *   4. 任意 `src` 不存在（FileNotFound / ENOENT）时静默跳过，与 `safeDelete` 的
 *      "幂等" 语义保持一致 —— 旧 bank 可能 user-data 从未创建，moveToTrash 不应
 *      因此而失败。
 *
 * ## 清理语义（purge）
 *
 *   1. 读 `<baseUri>` 下的所有顶层条目；目录不存在时直接返回（首次启动尚未产出 trash）。
 *   2. 仅处理 **目录** 类型条目；跳过文件（防御异常状态，正常流程不会出现）。
 *   3. 用 {@link parseTrashTimestamp} 解析目录名时间戳；解析失败的目录跳过（保留），
 *      避免误删手动放进来的备份。
 *   4. `ts < (Date.now() - olderThanMs)` 才删；恰好等于阈值的视为 "刚好到期"，
 *      保留多一个心跳周期，更安全。
 *   5. 删除单个目录失败仅 `console.warn`，继续清理其它目录，不让单个 IO 错误
 *      把整个 purge 拖垮（启动期由 Activation 调用时尤其重要，不能阻塞激活）。
 *
 * Validates: Requirements 2.9（覆盖导入旧数据隔离）, 11.4（覆盖导入语义）。
 */

import * as vscode from 'vscode';

import { renameDirAtomic, safeDelete } from './atomicFs';

/**
 * 判断错误是否表示 "文件不存在"。同时兼容 `vscode.FileSystemError`（生产）与
 * polyfill / Node 的 `ENOENT`（测试 harness）。与 `atomicFs` / `bankStore` 中的
 * 同名工具语义一致；此处复制一份避免引入只为类型守卫而存在的循环依赖。
 */
function isFileNotFound(err: unknown): boolean {
  if (err instanceof vscode.FileSystemError) {
    return err.code === 'FileNotFound';
  }
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return code === 'FileNotFound' || code === 'ENOENT';
}

/**
 * 从 trash 子目录名中解析出时间戳（epoch 毫秒）。
 *
 * 命名格式：`<bankId>-<timestamp>`，其中 `bankId` 通常是 UUID v4（自带连字符），
 * 因此必须从 **最后一个** `-` 后取子串。
 *
 * - 名称不含 `-` → 返回 `undefined`（不属于 Trash 产出，跳过）。
 * - 末段非纯数字 → 返回 `undefined`（同上）。
 * - 数字越界 / NaN → 返回 `undefined`。
 *
 * 这种 "解析失败就跳过" 的策略让 purge 对手动放进 `trash/` 的备份 / 临时文件
 * 保持友好，避免误删。
 */
export function parseTrashTimestamp(name: string): number | undefined {
  const idx = name.lastIndexOf('-');
  if (idx === -1) return undefined;
  const tsStr = name.slice(idx + 1);
  if (tsStr.length === 0) return undefined;
  // 仅接受纯十进制数字（含前导零的情况依然合法），过滤负号 / 浮点 / 16 进制等噪声。
  if (!/^\d+$/.test(tsStr)) return undefined;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return undefined;
  return ts;
}

/**
 * 从一个 URI 的路径中取末段名（basename）。
 *
 * 不直接使用 Node 的 `path.posix.basename`，是因为 `vscode.Uri.path` 已经是
 * POSIX 风格（即便在 Windows 上）；自己写一个最小实现可以避免引入额外依赖，
 * 也让 harness（POSIX 路径）与生产（POSIX URI 路径）行为完全一致。
 */
function basenameOfUri(uri: vscode.Uri): string {
  const p = uri.path;
  // 去掉末尾的斜杠（目录可能以 `/` 结尾），再取最后一段。
  const trimmed = p.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/**
 * `Trash` 实现。
 *
 * 实例一般由 `Storage.create(ctx)` 在引导期构造，传入
 * `vscode.Uri.joinPath(ctx.globalStorageUri, 'trash')` 作为 `baseUri`。
 * 测试中亦可用 `HarnessUri.joinPath(harness.globalStorageUri, 'trash')` 注入。
 */
export class Trash {
  /**
   * @param baseUri trash 根目录，通常为 `<globalStorageUri>/trash`。所有读 / 写 /
   * 删除操作都以该 URI 为基准 `joinPath`，不会越权访问其他位置。
   * @param now 时间戳源，默认为 `Date.now`。注入点便于测试构造确定性的
   * `<bankId>-<timestamp>` 命名（参见 Task 12.2 EXAMPLE）。
   */
  constructor(
    private readonly baseUri: vscode.Uri,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * 把若干源目录搬移到 `<baseUri>/<bankId>-<timestamp>/` 下，每个源以其
   * `basename` 命名。
   *
   * 行为约定：
   *
   *   - 空 `uris` 列表：直接返回，不创建空目录（避免污染 trash）。
   *   - 源不存在：静默跳过该项，继续处理其它源；不抛错。
   *   - `renameDirAtomic` 失败：抛出原始错误，已经成功搬入的项保持现状（未做反向回滚）。
   *     调用方 `Storage.installBank` Phase 5 会把整体失败仅记录为 warning（不阻塞主流程），
   *     残留的 `<destDir>` 在下次启动时由 purge 自然回收。
   *
   * 与 `BankStore.deleteBank` 的边界：本方法是 **软删除**（用户可见的旧 bank 移除路径）；
   * `BankStore.deleteBank` 是 **硬删除**（仅清理尚未对用户可见的副产物）。
   */
  async moveToTrash(
    uris: readonly vscode.Uri[],
    reason: { bankId: string },
  ): Promise<void> {
    if (uris.length === 0) {
      return;
    }

    const ts = this.now();
    const subdirName = `${reason.bankId}-${ts}`;
    const destDir = vscode.Uri.joinPath(this.baseUri, subdirName);

    // 先确保目标子目录存在；createDirectory 是幂等的（已存在时不抛错），
    // 顺便也保证了 `<baseUri>` 这层 trash 根目录被创建出来。
    await vscode.workspace.fs.createDirectory(destDir);

    for (const src of uris) {
      const basename = basenameOfUri(src);
      // 防御性兜底：basename 解析失败时跳过，避免把 src 整个 rename 到 destDir 自身。
      if (basename.length === 0) {
        continue;
      }
      const dst = vscode.Uri.joinPath(destDir, basename);
      try {
        await renameDirAtomic(src, dst);
      } catch (err) {
        // 源不存在：当 user-data 从未创建过时是合法情形，静默跳过。
        if (isFileNotFound(err)) {
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * 扫描 `<baseUri>` 下的所有 `<bankId>-<timestamp>/` 子目录，删除时间戳早于
   * `Date.now() - olderThanMs` 的项。
   *
   * 启动时由 Activation 调用 `void purge({ olderThanMs: 7 * 24 * 3600 * 1000 })`，
   * 不阻塞激活流程；任何单个目录的删除失败只会被 `console.warn`，不会抛出，
   * 让 purge 对启动期非阻塞调用是安全的。
   *
   * - `baseUri` 不存在：直接返回（首次启动尚无 trash）。
   * - 非目录条目：跳过（防御异常状态，理论上 trash 下不应出现文件）。
   * - 目录名无法解析为时间戳：保留（避免误删手动备份）。
   * - 时间戳 `>= cutoff`：保留；仅严格早于 cutoff 的目录被删除。
   */
  async purge(opts: { olderThanMs: number }): Promise<void> {
    const cutoff = this.now() - opts.olderThanMs;

    let entries: ReadonlyArray<readonly [string, vscode.FileType]>;
    try {
      entries = await vscode.workspace.fs.readDirectory(this.baseUri);
    } catch (err) {
      if (isFileNotFound(err)) {
        return;
      }
      throw err;
    }

    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const ts = parseTrashTimestamp(name);
      if (ts === undefined) {
        continue;
      }
      if (ts >= cutoff) {
        continue;
      }
      const target = vscode.Uri.joinPath(this.baseUri, name);
      try {
        await safeDelete(target);
      } catch (err) {
        // 单个目录删除失败不影响其它目录的清理；仅记录警告以便后续观测。
        console.warn(`[trash] purge failed for ${name}:`, err);
      }
    }
  }
}
