/**
 * memFsHarness（Task 1.3）
 *
 * 给 Storage 系列测试（MetaStore / BankStore / UserDataStore / Trash / Storage Facade）
 * 提供一个**不依赖真实 VS Code Extension Host** 的运行环境：
 *
 *   1. 基于 `memfs` 的 `vscode.workspace.fs` 桩 —— 覆盖 readFile / writeFile /
 *      rename / copy / delete / stat / createDirectory / readDirectory。
 *   2. 一个内存版 `vscode.Memento`，作为 `ExtensionContext.globalState` 的桩。
 *   3. 一个最小化的 `vscode.Uri` 实现 —— `file()` / `joinPath()` / `fsPath` /
 *      `with()` / `toString()`，与生产代码中常用的 API 兼容。
 *   4. 一个最小化的 `ExtensionContext`（暴露 `globalStorageUri` / `globalState` /
 *      `subscriptions`），由 `Storage.create(ctx)` 使用。
 *   5. 失败注入钩子（Property 10 / 17 用）：可以让某次 writeFile / rename / copy /
 *      delete 抛出受控错误，以验证 `installBank` 五阶段事务与 `writeWithRollback` 的回滚不变量。
 *
 * 用法（在测试文件顶部）：
 *
 *   import { vi } from 'vitest';
 *   import { createMemFsHarness, createVscodeModuleMock } from '../harness/memFsHarness';
 *
 *   const harness = createMemFsHarness();
 *   vi.mock('vscode', () => createVscodeModuleMock(harness));
 *
 *   // 此后任意 `import * as vscode from 'vscode'` 都会拿到 harness 提供的实现
 */

import { Volume, createFsFromVolume, type IFs } from 'memfs';
import * as nodePath from 'node:path';

// ---------------------------------------------------------------------------
// vscode.Uri 最小实现
// ---------------------------------------------------------------------------

/**
 * 与 `vscode.Uri` 形态兼容的最小实现。仅覆盖 Storage / harness 真正使用到的字段
 * 与方法：scheme / authority / path / fsPath / fragment / query / toString() /
 * toJSON() / with() / 以及静态 file()、joinPath()、parse()。
 *
 * 为了让 `uri.fsPath` 在跨平台测试中保持稳定，harness 锁定为 POSIX 风格路径，
 * 与 memfs 默认行为一致。生产代码读写路径时只走 `uri.fsPath`，无需关心平台差异。
 */
export class HarnessUri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;

  private constructor(
    scheme: string,
    authority: string,
    path: string,
    query: string,
    fragment: string,
  ) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
  }

  get fsPath(): string {
    // 仅支持 file: scheme（与 globalStorageUri 一致）。其它 scheme 的路径直接返回 path。
    return this.path;
  }

  toString(): string {
    const auth = this.authority ? `//${this.authority}` : '';
    const q = this.query ? `?${this.query}` : '';
    const f = this.fragment ? `#${this.fragment}` : '';
    return `${this.scheme}:${auth}${this.path}${q}${f}`;
  }

  toJSON(): unknown {
    return { scheme: this.scheme, authority: this.authority, path: this.path };
  }

  with(change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): HarnessUri {
    return new HarnessUri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  static file(fsPath: string): HarnessUri {
    // 统一为 POSIX 路径（memfs 用的就是 POSIX）。
    const posix = fsPath.split(nodePath.sep).join('/');
    const normalized = posix.startsWith('/') ? posix : `/${posix}`;
    return new HarnessUri('file', '', normalized, '', '');
  }

  static parse(value: string): HarnessUri {
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(
      value,
    );
    if (!m) {
      throw new Error(`Invalid URI: ${value}`);
    }
    const [, scheme, authority = '', path = '', query = '', fragment = ''] = m;
    return new HarnessUri(scheme!, authority, path || '/', query, fragment);
  }

  static joinPath(base: HarnessUri, ...segments: string[]): HarnessUri {
    const joined = nodePath.posix.join(base.path || '/', ...segments);
    return base.with({ path: joined });
  }
}

// ---------------------------------------------------------------------------
// vscode.FileType / vscode.FileSystemError 桩
// ---------------------------------------------------------------------------

export const HarnessFileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const;

export type HarnessFileType = (typeof HarnessFileType)[keyof typeof HarnessFileType];

/**
 * 与 `vscode.FileSystemError` 形态兼容的错误。生产代码常通过 `err.code` 判断
 * 'FileNotFound' / 'FileExists' / 'NoPermissions' 等情形，harness 在 memfs
 * 的 ENOENT / EEXIST / EACCES 之间做 1:1 映射。
 */
export class HarnessFileSystemError extends Error {
  readonly code: string;
  readonly uri?: HarnessUri;

  constructor(code: string, message: string, uri?: HarnessUri) {
    super(message);
    this.name = 'FileSystemError';
    this.code = code;
    if (uri !== undefined) {
      this.uri = uri;
    }
  }

  static FileNotFound(uri?: HarnessUri): HarnessFileSystemError {
    return new HarnessFileSystemError(
      'FileNotFound',
      `File not found: ${uri?.fsPath ?? '<unknown>'}`,
      uri,
    );
  }
  static FileExists(uri?: HarnessUri): HarnessFileSystemError {
    return new HarnessFileSystemError(
      'FileExists',
      `File already exists: ${uri?.fsPath ?? '<unknown>'}`,
      uri,
    );
  }
  static FileIsADirectory(uri?: HarnessUri): HarnessFileSystemError {
    return new HarnessFileSystemError(
      'FileIsADirectory',
      `File is a directory: ${uri?.fsPath ?? '<unknown>'}`,
      uri,
    );
  }
  static FileNotADirectory(uri?: HarnessUri): HarnessFileSystemError {
    return new HarnessFileSystemError(
      'FileNotADirectory',
      `File is not a directory: ${uri?.fsPath ?? '<unknown>'}`,
      uri,
    );
  }
  static NoPermissions(uri?: HarnessUri): HarnessFileSystemError {
    return new HarnessFileSystemError(
      'NoPermissions',
      `No permissions: ${uri?.fsPath ?? '<unknown>'}`,
      uri,
    );
  }
  static Unavailable(uri?: HarnessUri): HarnessFileSystemError {
    return new HarnessFileSystemError(
      'Unavailable',
      `Unavailable: ${uri?.fsPath ?? '<unknown>'}`,
      uri,
    );
  }
}

function mapMemFsError(e: unknown, uri?: HarnessUri): HarnessFileSystemError {
  const code = (e as { code?: string }).code;
  switch (code) {
    case 'ENOENT':
      return HarnessFileSystemError.FileNotFound(uri);
    case 'EEXIST':
      return HarnessFileSystemError.FileExists(uri);
    case 'EISDIR':
      return HarnessFileSystemError.FileIsADirectory(uri);
    case 'ENOTDIR':
      return HarnessFileSystemError.FileNotADirectory(uri);
    case 'EACCES':
    case 'EPERM':
      return HarnessFileSystemError.NoPermissions(uri);
    default: {
      const msg = e instanceof Error ? e.message : String(e);
      return new HarnessFileSystemError('Unknown', msg, uri);
    }
  }
}

// ---------------------------------------------------------------------------
// 失败注入
// ---------------------------------------------------------------------------

export type FsOp =
  | 'readFile'
  | 'writeFile'
  | 'delete'
  | 'rename'
  | 'copy'
  | 'stat'
  | 'createDirectory'
  | 'readDirectory';

export interface FailureRule {
  /** 触发的 FS 操作。`'*'` 表示所有写路径上的操作。 */
  op: FsOp | '*';
  /** 路径匹配；`undefined` 表示匹配任意路径（按 `uri.fsPath` 比较）。 */
  pathPattern?: RegExp;
  /** 触发时抛出的错误；默认抛 'Unavailable'。 */
  error?: HarnessFileSystemError | Error;
  /** true 表示触发一次后自动失效（默认 true）。 */
  once?: boolean;
}

interface RegisteredRule extends FailureRule {
  consumed: boolean;
}

// ---------------------------------------------------------------------------
// Memento（globalState）桩
// ---------------------------------------------------------------------------

export interface HarnessGlobalState {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
  setKeysForSync(keys: readonly string[]): void;
  /** 仅测试用：直接读出底层 Map（跳过 `get` 的拷贝逻辑）。 */
  _snapshot(): Record<string, unknown>;
  /** 仅测试用：让下一次 `update` 抛错，模拟 globalState 写失败（Property 18）。 */
  _failNextUpdate(error?: Error): void;
}

function createGlobalState(): HarnessGlobalState {
  const store = new Map<string, unknown>();
  const syncKeys = new Set<string>();
  let pendingUpdateError: Error | undefined;

  function get<T>(key: string): T | undefined;
  function get<T>(key: string, defaultValue: T): T;
  function get<T>(key: string, defaultValue?: T): T | undefined {
    if (store.has(key)) {
      return store.get(key) as T;
    }
    return defaultValue;
  }

  return {
    get,
    async update(key, value) {
      if (pendingUpdateError) {
        const err = pendingUpdateError;
        pendingUpdateError = undefined;
        throw err;
      }
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    },
    keys() {
      return [...store.keys()];
    },
    setKeysForSync(keys) {
      syncKeys.clear();
      for (const k of keys) syncKeys.add(k);
    },
    _snapshot() {
      const out: Record<string, unknown> = {};
      for (const [k, v] of store) out[k] = v;
      return out;
    },
    _failNextUpdate(error) {
      pendingUpdateError = error ?? new Error('globalState.update failed (test injection)');
    },
  };
}

// ---------------------------------------------------------------------------
// vscode.workspace.fs 桩
// ---------------------------------------------------------------------------

export interface HarnessWorkspaceFs {
  readFile(uri: HarnessUri): Promise<Uint8Array>;
  writeFile(uri: HarnessUri, content: Uint8Array): Promise<void>;
  delete(uri: HarnessUri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void>;
  rename(
    source: HarnessUri,
    target: HarnessUri,
    options?: { overwrite?: boolean },
  ): Promise<void>;
  copy(
    source: HarnessUri,
    target: HarnessUri,
    options?: { overwrite?: boolean },
  ): Promise<void>;
  stat(uri: HarnessUri): Promise<{
    type: HarnessFileType;
    ctime: number;
    mtime: number;
    size: number;
  }>;
  createDirectory(uri: HarnessUri): Promise<void>;
  readDirectory(uri: HarnessUri): Promise<Array<[string, HarnessFileType]>>;
}

// ---------------------------------------------------------------------------
// Harness 主体
// ---------------------------------------------------------------------------

export interface MemFsHarness {
  /** 模拟 `ExtensionContext.globalStorageUri` 的根目录。 */
  readonly globalStorageUri: HarnessUri;
  /** memfs 的卷句柄（高级测试可直接读写以构造异常状态，例如 tmp 残留）。 */
  readonly volume: Volume;
  /** memfs 暴露的 fs API（用 promises 风格调用更方便）。 */
  readonly fs: IFs;
  /** `vscode.workspace.fs` 桩。 */
  readonly workspaceFs: HarnessWorkspaceFs;
  /** `ExtensionContext.globalState` 桩。 */
  readonly globalState: HarnessGlobalState;
  /** 失败注入。 */
  failNext(rule: FailureRule): void;
  /** 清空所有失败规则。 */
  clearFailures(): void;
  /** 模拟 `ExtensionContext`（只暴露 Storage 实际使用的字段）。 */
  createExtensionContext(): HarnessExtensionContext;
  /** 把整个文件系统重置为初始状态（含 globalStorageUri 已存在）。 */
  reset(): void;
}

export interface HarnessExtensionContext {
  readonly globalStorageUri: HarnessUri;
  readonly globalState: HarnessGlobalState;
  readonly subscriptions: Array<{ dispose(): unknown }>;
}

export interface CreateMemFsHarnessOptions {
  /** 默认 `/test-global-storage`。 */
  globalStorageRoot?: string;
}

/**
 * 创建一个独立的 harness 实例。每个测试文件应单独创建一份，以保证用例之间隔离。
 */
export function createMemFsHarness(options: CreateMemFsHarnessOptions = {}): MemFsHarness {
  const globalStorageRoot = options.globalStorageRoot ?? '/test-global-storage';
  const volume = new Volume();
  const fs = createFsFromVolume(volume);
  const failures: RegisteredRule[] = [];
  const globalState = createGlobalState();

  // 初始化根目录。
  fs.mkdirSync(globalStorageRoot, { recursive: true });

  function checkFailure(op: FsOp, uri: HarnessUri): void {
    const idx = failures.findIndex((rule) => {
      if (rule.consumed) return false;
      if (rule.op !== '*' && rule.op !== op) return false;
      if (rule.pathPattern && !rule.pathPattern.test(uri.fsPath)) return false;
      return true;
    });
    if (idx === -1) return;
    const rule = failures[idx]!;
    const error =
      rule.error ?? HarnessFileSystemError.Unavailable(uri);
    if (rule.once !== false) {
      rule.consumed = true;
    }
    throw error;
  }

  const workspaceFs: HarnessWorkspaceFs = {
    async readFile(uri) {
      checkFailure('readFile', uri);
      try {
        const buf = await fs.promises.readFile(uri.fsPath);
        // memfs 的 Buffer 已经是 Uint8Array 子类；为了对调用方暴露一个干净的 Uint8Array，
        // 复制一份避免被外部改回卷里。
        return new Uint8Array(buf as Buffer);
      } catch (e) {
        throw mapMemFsError(e, uri);
      }
    },

    async writeFile(uri, content) {
      checkFailure('writeFile', uri);
      try {
        await fs.promises.mkdir(nodePath.posix.dirname(uri.fsPath), { recursive: true });
        await fs.promises.writeFile(uri.fsPath, Buffer.from(content));
      } catch (e) {
        throw mapMemFsError(e, uri);
      }
    },

    async delete(uri, opts) {
      checkFailure('delete', uri);
      try {
        let stat;
        try {
          stat = await fs.promises.stat(uri.fsPath);
        } catch (e) {
          throw mapMemFsError(e, uri);
        }
        if (stat.isDirectory()) {
          if (opts?.recursive) {
            await fs.promises.rm(uri.fsPath, { recursive: true, force: true });
          } else {
            await fs.promises.rmdir(uri.fsPath);
          }
        } else {
          await fs.promises.unlink(uri.fsPath);
        }
      } catch (e) {
        if (e instanceof HarnessFileSystemError) throw e;
        throw mapMemFsError(e, uri);
      }
    },

    async rename(source, target, opts) {
      checkFailure('rename', source);
      try {
        if (!opts?.overwrite) {
          let exists = true;
          try {
            await fs.promises.stat(target.fsPath);
          } catch {
            exists = false;
          }
          if (exists) {
            throw HarnessFileSystemError.FileExists(target);
          }
        }
        await fs.promises.mkdir(nodePath.posix.dirname(target.fsPath), { recursive: true });
        await fs.promises.rename(source.fsPath, target.fsPath);
      } catch (e) {
        if (e instanceof HarnessFileSystemError) throw e;
        throw mapMemFsError(e, source);
      }
    },

    async copy(source, target, opts) {
      checkFailure('copy', source);
      try {
        if (!opts?.overwrite) {
          let exists = true;
          try {
            await fs.promises.stat(target.fsPath);
          } catch {
            exists = false;
          }
          if (exists) {
            throw HarnessFileSystemError.FileExists(target);
          }
        }
        await fs.promises.mkdir(nodePath.posix.dirname(target.fsPath), { recursive: true });
        await copyRecursive(fs, source.fsPath, target.fsPath);
      } catch (e) {
        if (e instanceof HarnessFileSystemError) throw e;
        throw mapMemFsError(e, source);
      }
    },

    async stat(uri) {
      checkFailure('stat', uri);
      try {
        const s = await fs.promises.stat(uri.fsPath);
        let type: HarnessFileType = HarnessFileType.Unknown;
        if (s.isFile()) type = HarnessFileType.File;
        else if (s.isDirectory()) type = HarnessFileType.Directory;
        else if (s.isSymbolicLink()) type = HarnessFileType.SymbolicLink;
        return {
          type,
          ctime: typeof s.ctimeMs === 'number' ? s.ctimeMs : 0,
          mtime: typeof s.mtimeMs === 'number' ? s.mtimeMs : 0,
          size: typeof s.size === 'number' ? s.size : 0,
        };
      } catch (e) {
        throw mapMemFsError(e, uri);
      }
    },

    async createDirectory(uri) {
      checkFailure('createDirectory', uri);
      try {
        await fs.promises.mkdir(uri.fsPath, { recursive: true });
      } catch (e) {
        throw mapMemFsError(e, uri);
      }
    },

    async readDirectory(uri) {
      checkFailure('readDirectory', uri);
      try {
        const entries = await fs.promises.readdir(uri.fsPath, { withFileTypes: true });
        return entries.map((entry) => {
          let type: HarnessFileType = HarnessFileType.Unknown;
          if (entry.isFile()) type = HarnessFileType.File;
          else if (entry.isDirectory()) type = HarnessFileType.Directory;
          else if (entry.isSymbolicLink()) type = HarnessFileType.SymbolicLink;
          return [entry.name, type] as [string, HarnessFileType];
        });
      } catch (e) {
        throw mapMemFsError(e, uri);
      }
    },
  };

  function failNext(rule: FailureRule): void {
    failures.push({ ...rule, consumed: false });
  }

  function clearFailures(): void {
    failures.length = 0;
  }

  function reset(): void {
    volume.reset();
    fs.mkdirSync(globalStorageRoot, { recursive: true });
    failures.length = 0;
  }

  const globalStorageUri = HarnessUri.file(globalStorageRoot);

  return {
    globalStorageUri,
    volume,
    fs,
    workspaceFs,
    globalState,
    failNext,
    clearFailures,
    reset,
    createExtensionContext() {
      return {
        globalStorageUri,
        globalState,
        subscriptions: [],
      };
    },
  };
}

async function copyRecursive(fs: IFs, src: string, dst: string): Promise<void> {
  const stat = await fs.promises.stat(src);
  if (stat.isDirectory()) {
    await fs.promises.mkdir(dst, { recursive: true });
    const entries = await fs.promises.readdir(src);
    for (const name of entries) {
      const child = String(name);
      await copyRecursive(fs, nodePath.posix.join(src, child), nodePath.posix.join(dst, child));
    }
  } else {
    const buf = await fs.promises.readFile(src);
    await fs.promises.writeFile(dst, buf);
  }
}

// ---------------------------------------------------------------------------
// `vi.mock('vscode', ...)` 工厂
// ---------------------------------------------------------------------------

/**
 * 构造一个可被 `vi.mock('vscode', () => createVscodeModuleMock(harness))` 使用的
 * 模块对象。只暴露 Storage / Importer / 派生函数等被测代码实际使用到的子集，
 * 不强制保持与真实 `vscode` 的全字段一致；遇到生产代码新增 API 调用时再扩展。
 */
export function createVscodeModuleMock(harness: MemFsHarness): {
  Uri: typeof HarnessUri;
  FileType: typeof HarnessFileType;
  FileSystemError: typeof HarnessFileSystemError;
  workspace: { fs: HarnessWorkspaceFs };
  window: {
    showErrorMessage: (...args: unknown[]) => Promise<undefined>;
    showInformationMessage: (...args: unknown[]) => Promise<undefined>;
    showWarningMessage: (...args: unknown[]) => Promise<undefined>;
  };
} {
  return {
    Uri: HarnessUri,
    FileType: HarnessFileType,
    FileSystemError: HarnessFileSystemError,
    workspace: { fs: harness.workspaceFs },
    window: {
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => undefined,
    },
  };
}
