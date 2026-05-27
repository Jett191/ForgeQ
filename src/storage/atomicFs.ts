/**
 * 原子文件写入工具（Task 9.1）
 *
 * 该模块封装 `vscode.workspace.fs` 之上的 "tmp + rename" 原子写入语义，
 * 是上层 `MetaStore` / `BankStore` / `UserDataStore` / `Trash` 共享的底层 IO 工具。
 *
 * 实现策略（参见 design.md > Storage Facade 与子层 > 写入原子性约束）：
 *
 *   1. **JSON / 文本文件**：先把内容写到 `<uri>.tmp`（UTF-8），再通过
 *      `vscode.workspace.fs.rename(<tmp>, <uri>, { overwrite: true })` 替换原文件。
 *      在大多数 OS 上，同分区 rename 是原子的；进程崩溃也只会留下 `<uri>.tmp` 残留，
 *      启动期清理钩子会把它扫掉，原文件保持上一次稳定值。
 *
 *   2. **rename 失败兜底**：当 rename 抛错（典型：跨分区 / 权限受限 / 平台限制），
 *      退化为 `copy(tmp → uri, overwrite=true) + delete(tmp)`。这条退化路径不再具备
 *      原子性，crash-on-copy 可能让 `<uri>` 处于"半新半旧"状态，因此调用方
 *      （`MetaStore` / `BankStore`）需要把这种失败映射成 `META_CORRUPT` 等可恢复
 *      错误并提示用户检查。本模块仅负责执行退化操作，不直接产出 `DomainError`。
 *
 *   3. **目录原子替换**：`renameDirAtomic` 同样优先尝试整目录 `rename`，失败时退化为
 *      `copy + recursive delete`。`Storage.installBank` 的 Phase 1 会用它把
 *      `banks/<newId>.tmp/` 提升为 `banks/<newId>/`。
 *
 *   4. **`safeDelete`**：删除文件或目录；`FileNotFound` 视为成功（与 "tmp 残留可能已被清理"
 *      的语义一致），其它错误向上抛出。该 helper 在 `installBank` 各阶段失败时清理副产物，
 *      也在每次写入开始前清掉历史 `<uri>.tmp` 残留以避免 stale 内容干扰。
 *
 * Validates: Requirements 11.6（单次写入 ≤ 500ms 的硬约束由上层调度保证；本模块只确保
 * "成功写入" 等价于 "文件被原子替换"，从而支撑 11.1 / 11.2 的可恢复性）。
 */

import * as vscode from 'vscode';

/** 临时文件后缀；统一为 `.tmp`，与 design.md 中 `meta.json.tmp` / `banks/<id>.tmp/` 命名一致。 */
const TMP_SUFFIX = '.tmp';

/**
 * 由目标 URI 派生其临时 URI。直接在 `path` 末尾追加 `.tmp`，保留 scheme / authority /
 * query / fragment，从而和原文件落在同一目录、同一分区，最大化 rename 是原子的概率。
 */
function tmpUriFor(uri: vscode.Uri): vscode.Uri {
  return uri.with({ path: uri.path + TMP_SUFFIX });
}

/**
 * 判断错误是否表示 "文件不存在"。同时兼容 `vscode.FileSystemError`（生产）与
 * 某些 polyfill / Node 错误（`code === 'ENOENT'`）。
 */
function isFileNotFound(err: unknown): boolean {
  if (err instanceof vscode.FileSystemError) {
    return err.code === 'FileNotFound';
  }
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return code === 'FileNotFound' || code === 'ENOENT';
}

/**
 * 删除指定 URI；当目标不存在时静默成功。`recursive: true` 让本函数同时适用于文件与
 * 非空目录（VS Code API 对纯文件忽略 `recursive`），`useTrash: false` 避免把 tmp 文件
 * 进系统回收站，否则后续 `installBank` 失败时旧数据会被裹挟着进回收站。
 */
export async function safeDelete(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false });
  } catch (err) {
    if (isFileNotFound(err)) {
      return;
    }
    throw err;
  }
}

/**
 * 把任意字节序列原子写入 `uri`：先写 `<uri>.tmp`，再 rename 替换。
 * rename 失败时退化为 copy + delete，并保持调用方可观察到的错误尽量贴近真实根因。
 */
async function writeAtomicBytes(uri: vscode.Uri, bytes: Uint8Array): Promise<void> {
  const tmp = tmpUriFor(uri);

  // 写前清理可能的历史 tmp 残留（前一次进程在 rename 之前 crash 留下的）。
  // 失败不致命：后续 writeFile 会用 `overwrite` 默认行为覆盖。
  try {
    await safeDelete(tmp);
  } catch {
    // 残留无法删除时，继续尝试写入；如果 writeFile 仍然成功则用最新内容覆盖。
  }

  try {
    await vscode.workspace.fs.writeFile(tmp, bytes);
  } catch (writeErr) {
    // 写 tmp 直接失败：尽力清理半成品后把原始错误抛给调用方。
    try {
      await safeDelete(tmp);
    } catch {
      /* swallow */
    }
    throw writeErr;
  }

  try {
    await vscode.workspace.fs.rename(tmp, uri, { overwrite: true });
    return;
  } catch (renameErr) {
    // rename 失败（典型：跨分区 / 平台限制）。退化为 copy + delete，并把退化路径标记为
    // META_CORRUPT 风险（由上层 MetaStore / BankStore 转译）。
    console.warn(
      '[atomicFs] rename failed, falling back to copy+delete (non-atomic; META_CORRUPT risk):',
      renameErr,
    );
    try {
      await vscode.workspace.fs.copy(tmp, uri, { overwrite: true });
    } catch (copyErr) {
      // 退化路径也失败：清理 tmp，把原始 rename 错误透出。
      try {
        await safeDelete(tmp);
      } catch {
        /* swallow */
      }
      // 在调试场景下保留 copy 失败的次级原因。
      console.warn('[atomicFs] copy fallback also failed:', copyErr);
      throw renameErr;
    }
    // copy 成功则 tmp 已不再需要。删除失败仅警告，原文件已经更新成功。
    try {
      await safeDelete(tmp);
    } catch (cleanupErr) {
      console.warn('[atomicFs] failed to remove tmp after copy fallback:', cleanupErr);
    }
  }
}

/**
 * 原子写入文本文件（UTF-8）。
 *
 * 失败语义：
 *   - 写 tmp 失败：抛出底层错误，目标文件保持上一次稳定值，无副作用残留（best-effort 清理）。
 *   - rename 失败：自动退化为 copy+delete；若退化也失败，抛出原始 rename 错误，
 *     目标文件保持上一次稳定值。
 */
export async function writeAtomicText(uri: vscode.Uri, text: string): Promise<void> {
  const bytes = new TextEncoder().encode(text);
  await writeAtomicBytes(uri, bytes);
}

/**
 * 原子写入 JSON 文件（UTF-8）。等价于 `writeAtomicText(uri, JSON.stringify(data, null, 2))`，
 * 单独导出以让上层 `MetaStore` / `BankStore` 调用更直观、对序列化策略保持一致。
 *
 * 注意：本函数对 `data` 不做 schema 校验；MetaStore / BankStore 在调用前自行保证数据合法。
 */
export async function writeAtomicJson(uri: vscode.Uri, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2);
  await writeAtomicText(uri, text);
}

/**
 * 把 `src` 目录原子地重命名为 `dst`。失败时退化为 `copy + recursive delete`。
 *
 * 设计意图：`installBank` 的 Phase 1 会写出 `banks/<newId>.tmp/` 临时目录后调用本函数
 * 把它提升为 `banks/<newId>/`；同样地，`Storage` 在做目录级回滚时也借助本函数交换内容。
 *
 * 与文件版本不同的两点：
 *   1. 不预先清掉 `dst`，而是让 `rename` / `copy` 自行处理（`overwrite: true` 让 VS Code 决定
 *      跨平台兼容路径）；
 *   2. copy 退化成功后再 `delete(src, { recursive: true })`；删除失败时仍透出原始 rename 错误，
 *      因为此时 `dst` 已是新内容、`src` 还在 —— 上层应当感知不一致并触发清理 / 提示。
 */
export async function renameDirAtomic(src: vscode.Uri, dst: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.rename(src, dst, { overwrite: true });
    return;
  } catch (renameErr) {
    console.warn(
      '[atomicFs] directory rename failed, falling back to copy+delete (non-atomic; META_CORRUPT risk):',
      renameErr,
    );
    try {
      await vscode.workspace.fs.copy(src, dst, { overwrite: true });
    } catch (copyErr) {
      console.warn('[atomicFs] directory copy fallback also failed:', copyErr);
      throw renameErr;
    }
    try {
      await vscode.workspace.fs.delete(src, { recursive: true, useTrash: false });
    } catch (cleanupErr) {
      console.warn(
        '[atomicFs] copied directory but failed to delete source; META_CORRUPT risk:',
        cleanupErr,
      );
      throw renameErr;
    }
  }
}
