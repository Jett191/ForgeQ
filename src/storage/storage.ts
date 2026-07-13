/**
 * Storage Facade（Task 13.1）
 *
 * `Storage` 是 design.md > Components and Interfaces > Storage Facade 与子层 中
 * 描述的高层入口：把 `MetaStore` / `BankStore` / `UserDataStore` / `Trash` 四个
 * 子层组装在一起，对外暴露 **少量的高层事务**（`bootstrap` / `installBank` /
 * `removeBank`）以及 **通用回滚模板**（`writeWithRollback`），同时把四个子层
 * 自身作为只读字段透出，让上层（`BankRegistry` / `PracticeController` 等）在
 * 需要做更细粒度操作时可以直接调用对应子层。
 *
 * ## 职责
 *
 *   1. **构造装配**：`Storage.create(ctx)` 在 `<globalStorageUri>` 下按 design.md
 *      规定的目录布局实例化四个子层，并确保根目录存在。
 *
 *   2. **bootstrap**（启动期自愈）：
 *        a. 清理 `meta.json.tmp` / `banks/<id>.tmp/` 残留（参见 design.md
 *           > Error Handling > 启动期自愈）。
 *        b. 读取 `meta.json`：
 *             - **不存在**：写入默认值 `{ schemaVersion: 1, banks: [] }`，正常启动。
 *             - **损坏**（`MetaCorruptError` 或其它读错误）：进入 **安全模式** ——
 *               以空内存状态运行，向用户弹错误提示，**不**删除底层数据
 *               （Req 11.5）。
 *        c. 把内存中的 `currentMeta` 与 `globalState['fip:currentBankId']`
 *           做最终一致同步：以 `meta.json` 为真理源（Property 18）。
 *        d. 若 `meta.currentBankId` 存在，加载激活 bank 与其 learning map；
 *           加载失败仅弹错误提示，把 `currentBank` 留 `undefined` 让上层 UI
 *           回退到 "未导入题库" 状态，不影响其它 bank。
 *
 *   3. **installBank**：把执行细节委托给 `installBank.ts` 的五阶段事务实现，
 *      同步更新内存中的 `currentMeta`。任意 Phase 1 / 2 / 3 失败都已经在子层
 *      做完回滚；本 Facade 把 `InstallBankError` 透传给调用方。
 *
 *   4. **removeBank**：把指定 bank 的 `banks/<bankId>` 与 `user-data/<bankId>`
 *      搬入 `trash/`，再原子写一次 `meta.json` 把该 bank 从摘要列表移除；
 *      若被移除的是当前激活 bank，同步把 `currentBankId` 清空并刷新 globalState
 *      （Property 18）。
 *
 *   5. **writeWithRollback**：design.md > Error Handling > 回滚通用模板 的
 *      物化。供上层在 "先内存后 Storage" 的写入路径上统一处理失败回滚 +
 *      用户提示，对应 Property 10 / Req 5.7 / 6.8 / 7.5 / 8.3 / 9.7。
 *
 * ## 不在职责范围内
 *
 *   - 视图刷新：由 `QuestionListProvider` / `ReviewProvider` 监听对应事件触发。
 *   - 命令注册：由 Activation 在 `extension.ts` 中完成。
 *   - BankRegistry 列表 / 切换：由 `BankRegistry`（Task 14.1）封装；本 Facade
 *     只承担最底层的写入与同步，不做高层 UX 决策。
 *
 * Validates: Requirements 11.1（持久化）, 11.2（启动加载）, 11.3（写入失败回滚
 * 通用模板）, 11.5（损坏自愈 / 安全模式 / 不删除底层数据）。
 */

import * as vscode from 'vscode';

import type { BankMeta, BankSource, BankSummary } from '../types/bankMeta.js';
import type { DomainError, Result } from '../types/errors.js';
import type { LearningState } from '../types/learning.js';
import type { QuestionBank } from '../types/question.js';
import { safeDelete } from './atomicFs.js';
import { BankStore } from './bankStore.js';
import {
  installBank as installBankImpl,
  InstallBankError,
} from './installBank.js';
import { MetaCorruptError, MetaStore } from './metaStore.js';
import { Trash } from './trash.js';
import { UserDataStore } from './userDataStore.js';

/** `globalState` 中存放当前激活 bankId 的快速读取镜像键。 */
export const GLOBAL_STATE_CURRENT_BANK_ID = 'fip:currentBankId' as const;

/** `meta.json` 的默认初始值（首次启动时写入磁盘）。 */
const DEFAULT_BANK_META: BankMeta = Object.freeze({
  schemaVersion: 1,
  banks: [],
}) as BankMeta;

/**
 * `Storage.bootstrap()` 返回的内存快照：上层视图层与控制层基于该结构渲染初始
 * 状态。安全模式下会返回 `isSafeMode: true` + 空 `meta`，让 UI 同步切到引导
 * 文案。
 */
export interface InMemoryState {
  /** 当前 `meta.json` 的内存快照（安全模式下为默认空 meta）。 */
  meta: BankMeta;
  /**
   * 当前激活 bank 的快照。当 `meta.currentBankId` 缺失或激活 bank 加载失败时
   * 该字段缺省。
   */
  currentBank?: {
    bankId: string;
    bank: QuestionBank;
    learning: Map<string, LearningState>;
  };
  /**
   * 是否处于 "安全模式"。`true` 表示 `meta.json` 损坏；空内存状态运行，磁盘
   * 上的底层数据保持不变，等待用户排查或重新导入。
   */
  isSafeMode: boolean;
}

/**
 * `Storage.create` 接受的最小化 ExtensionContext 形状。声明该子集是为了让本
 * 文件能在 `vscode` 模块被 mock 的 harness 中工作（harness 提供的
 * `HarnessExtensionContext` 同样满足该接口）。
 */
export interface StorageContext {
  readonly globalStorageUri: vscode.Uri;
  readonly globalState: vscode.Memento;
}

/**
 * `writeWithRollback` 的参数。把 design.md 的位置参数模板转换为对象式入参，
 * 让调用点的可读性更高、字段名自带文档。
 */
export interface WriteWithRollbackParams<T> {
  /** 上一次稳定值；`persist` 失败时 `onRollback` 会用它把内存状态还原。 */
  prev: T;
  /** 本次将要写入的目标值；先经 `applyMemory(next)` 应用到内存。 */
  next: T;
  /** 把 next 立即应用到内存（例如更新 cache / Webview state）。 */
  applyMemory: (value: T) => void;
  /** 实际的持久化操作，可能抛错。 */
  persist: () => Promise<void>;
  /** 失败时把内存状态还原为 prev；与 `applyMemory` 对称。 */
  onRollback: (value: T) => void;
  /**
   * 用于 `STORAGE_WRITE_FAILED` 错误对象的 `path` 字段；典型值如
   * `"learning.json"` / `"notes/<qid>.md"`。仅作展示，不参与寻址。
   */
  path: string;
}

/**
 * 判断错误是否表示 "文件不存在"。同时兼容 `vscode.FileSystemError`（生产）与
 * polyfill / Node 的 `ENOENT`（测试 harness）。各子层中的同名工具语义一致；
 * 此处复制一份避免引入只为类型守卫而存在的循环依赖。
 */
function isFileNotFound(err: unknown): boolean {
  if (err instanceof vscode.FileSystemError) {
    return err.code === 'FileNotFound';
  }
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return code === 'FileNotFound' || code === 'ENOENT';
}

/** 提取错误的可读 message，作为 `cause` 字段；非 Error 走 String 兜底。 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Storage Facade。实例方法 / 子层对外可见的字段 / 高层事务的对外契约共同构成
 * 上层（`BankRegistry` / `PracticeController` / 各 Provider）所依赖的
 * "Storage API"。
 */
export class Storage {
  /**
   * 内存中的 `meta.json` 快照。`bootstrap` / `installBank` / `removeBank`
   * 都会在写盘成功后同步刷新该字段，作为下一次写入构造 nextMeta 的基础。
   * 安全模式下该字段为 {@link DEFAULT_BANK_META} 的一份独立副本。
   */
  private currentMeta: BankMeta = { ...DEFAULT_BANK_META, banks: [] };

  /** 是否处于安全模式（`meta.json` 损坏）。仅供 UI 与诊断查询。 */
  private safeMode = false;

  /**
   * @param ctx 最小化扩展上下文。仅使用 `globalStorageUri` / `globalState`，
   *   方便测试 harness 注入伪 context。
   * @param meta 元数据子层（`meta.json` 读写）。
   * @param banks 题库本体子层（`banks/<bankId>/`）。
   * @param userData 用户数据子层（`user-data/<bankId>/`）。
   * @param trash 隔离区子层（`trash/`）。
   */
  constructor(
    private readonly ctx: StorageContext,
    public readonly meta: MetaStore,
    public readonly banks: BankStore,
    public readonly userData: UserDataStore,
    public readonly trash: Trash,
  ) {}

  /**
   * 工厂方法：在 `<globalStorageUri>` 下按 design.md 规定的目录布局实例化
   * 四个子层并组装为 `Storage`。
   *
   * 仅创建对象、不读 / 写盘。`bootstrap()` 才是真正的 IO 入口。
   *
   * 创建时会确保 `<globalStorageUri>` 根目录存在；该目录在 VS Code 安装扩展
   * 时通常由宿主负责创建，此处的 `createDirectory` 是幂等保险，方便测试 harness
   * 与首次安装场景。
   */
  static async create(ctx: vscode.ExtensionContext): Promise<Storage> {
    const root = ctx.globalStorageUri;
    // 幂等创建根目录；harness 的 `_snapshot` / 生产的 globalStorageUri 都允许重复 mkdir。
    await vscode.workspace.fs.createDirectory(root);
    const meta = new MetaStore(vscode.Uri.joinPath(root, 'meta.json'));
    const banks = new BankStore(vscode.Uri.joinPath(root, 'banks'));
    const userData = new UserDataStore(vscode.Uri.joinPath(root, 'user-data'));
    const trash = new Trash(vscode.Uri.joinPath(root, 'trash'));
    return new Storage(ctx, meta, banks, userData, trash);
  }

  /**
   * 启动期初始化。返回 UI 可直接消费的 `InMemoryState`。
   *
   * 流程：
   *   1. 清理 tmp 残留（`meta.json.tmp` / `banks/<id>.tmp/`）。
   *   2. 读 `meta.json`：
   *        - FileNotFound：写默认 meta，继续；
   *        - 损坏 / 其它读错误：进入安全模式，弹提示，返回空内存状态。
   *   3. 与 `globalState['fip:currentBankId']` 做最终一致同步。
   *   4. 若 `currentBankId` 存在，加载激活 bank + learning map；失败仅弹提示，
   *      `currentBank` 缺省。
   *
   * 任何启动期失败都不会抛错给调用方 —— 安全模式是显式的最差路径，UI 应当
   * 通过 `state.isSafeMode` 自适应渲染。这是 Req 11.5 的对外契约。
   */
  async bootstrap(): Promise<InMemoryState> {
    // ---- Step 1: 清理 tmp 残留 ----
    await this.cleanupTmpResidue();

    // ---- Step 2: 读 meta.json ----
    let meta: BankMeta;
    try {
      meta = await this.meta.read();
    } catch (err) {
      if (isFileNotFound(err)) {
        // 首次启动：写默认 meta；写失败也走安全模式但不再尝试 update globalState。
        try {
          await this.meta.writeAtomic({ ...DEFAULT_BANK_META, banks: [] });
          meta = { ...DEFAULT_BANK_META, banks: [] };
        } catch (writeErr) {
          await this.enterSafeMode(describeError(writeErr));
          return this.buildSafeModeState();
        }
      } else {
        // MetaCorruptError 或其它读错误（NoPermissions 等）一律视为 "load failed"，
        // 进入安全模式。`MetaCorruptError.reason` 提供更精确的失败原因，
        // 其它错误走 describeError 兜底。
        const reason =
          err instanceof MetaCorruptError ? err.reason : describeError(err);
        await this.enterSafeMode(reason);
        return this.buildSafeModeState();
      }
    }

    this.currentMeta = meta;
    this.safeMode = false;

    // ---- Step 3: globalState ↔ meta.json 最终一致同步（Property 18） ----
    // 以 meta.json 为真理源；不一致时把 globalState 拉齐。失败仅警告，
    // 因为 globalState 是镜像而非真理源。
    const gsCurrentBankId = this.ctx.globalState.get<string | undefined>(
      GLOBAL_STATE_CURRENT_BANK_ID,
    );
    if (gsCurrentBankId !== meta.currentBankId) {
      try {
        await this.ctx.globalState.update(
          GLOBAL_STATE_CURRENT_BANK_ID,
          meta.currentBankId,
        );
      } catch (err) {
        console.warn(
          '[storage] bootstrap: globalState sync failed (non-fatal):',
          err,
        );
      }
    }

    // ---- Step 4: 加载激活 bank ----
    let currentBank: InMemoryState['currentBank'];
    if (meta.currentBankId !== undefined) {
      try {
        const bank = await this.banks.readBank(meta.currentBankId);
        const learning = await this.userData.readLearningMap(meta.currentBankId);
        currentBank = { bankId: meta.currentBankId, bank, learning };
      } catch (err) {
        // 单 bank 加载失败：把它标记为 "不可用"（currentBank 留 undefined），
        // 弹错误提示。其它 bank 与 globalState 不受影响（Req 11.5 子条款）。
        await this.notifyError(
          `Failed to load active bank "${meta.currentBankId}": ${describeError(err)}`,
        );
      }
    }

    if (currentBank !== undefined) {
      return { meta, currentBank, isSafeMode: false };
    }
    return { meta, isSafeMode: false };
  }

  /**
   * 安全切换（覆盖）导入：委托给 {@link installBankImpl} 的五阶段事务。
   *
   * 成功时同步刷新 `currentMeta`；失败时已经在子层完成回滚，把
   * `InstallBankError` 透出给调用方。
   *
   * 注意：本方法不消费 `InstallBankError`，由调用方（`BankRegistry` /
   * `Importer`）通过 `err.toDomainError()` 转译为 `DomainError` 联合并展示。
   */
  async installBank(bank: QuestionBank, source?: BankSource): Promise<BankSummary> {
    const result = await installBankImpl(
      bank,
      source,
      {
        meta: this.meta,
        banks: this.banks,
        userData: this.userData,
        trash: this.trash,
        globalState: this.ctx.globalState,
        currentMeta: this.currentMeta,
        banksBaseUri: vscode.Uri.joinPath(this.ctx.globalStorageUri, 'banks'),
        userDataBaseUri: vscode.Uri.joinPath(
          this.ctx.globalStorageUri,
          'user-data',
        ),
      },
    );
    // installBankImpl 返回的 nextMeta 已经在 Phase 3 写盘成功；同步内存快照。
    this.currentMeta = result.nextMeta;
    // installBankImpl 在 Phase 4 也会把 globalState 拉齐（失败仅警告），无需重复同步。
    this.safeMode = false;
    return result.summary;
  }

  /**
   * Persist a current-bank selection and update this facade's in-memory meta
   * snapshot in the same operation. Returns false for an unknown bank id.
   */
  async switchToBank(bankId: string): Promise<boolean> {
    if (!this.currentMeta.banks.some((bank) => bank.id === bankId)) return false;
    if (this.currentMeta.currentBankId === bankId) return true;

    const nextMeta: BankMeta = { ...this.currentMeta, currentBankId: bankId };
    await this.meta.writeAtomic(nextMeta);
    this.currentMeta = nextMeta;
    return true;
  }

  /**
   * 移除指定 bank。把 `banks/<bankId>` 与 `user-data/<bankId>` 搬入 trash，
   * 再原子写一次 `meta.json` 把它从摘要列表移除；若移除的是当前激活 bank，
   * 同步把 `currentBankId` 清空并刷新 globalState。
   *
   * 顺序约束：先 moveToTrash 再写 meta.json。这样即便 meta.json 写入失败、
   * 旧 bank 已经被搬入 trash，下次启动时 `Storage.bootstrap` 在加载 currentBank
   * 时会因为读不到磁盘上的 banks/<bankId>/bank.json 而进入 "单 bank 加载失败"
   * 路径，被弹错误提示并把 currentBank 留空 —— 用户视角下旧 bank 已经移除，
   * 只是 meta.json 摘要项滞留了一条；下次任意写 meta 操作（`installBank` /
   * 再次 `removeBank`）会自动清理。trash 中的副本仍可恢复，符合 Req 2.9 / 11.4
   * "用户视角已删除，物理副本可恢复" 的语义。
   *
   * 反过来，"先写 meta 再 moveToTrash"：如果 trash 失败，meta 已经把 bank 移除
   * 但磁盘上的 banks/<bankId>/ 仍在，下次启动同样进入加载失败路径，且无 trash
   * 备份，反而更糟。所以本实现选择前一种顺序。
   *
   * @throws 任意子层抛错都透出。`removeBank` 不做局部回滚，因为没有 "原子地
   *   把 trash 状态还原" 的可行操作；调用方应当向用户提示失败，由用户决定重试。
   */
  async removeBank(bankId: string): Promise<void> {
    // 防御：bankId 不在 meta 中时短路。这种情形通常是上层 UX 已经从过期列表
    // 里取了一个 id；没有必要写 meta / 触碰 trash。
    const inMeta = this.currentMeta.banks.some((b) => b.id === bankId);
    if (!inMeta && this.currentMeta.currentBankId !== bankId) {
      return;
    }

    // ---- Step 1: 旧 bank / user-data 入 trash ----
    const bankUri = vscode.Uri.joinPath(
      this.ctx.globalStorageUri,
      'banks',
      bankId,
    );
    const userDataUri = vscode.Uri.joinPath(
      this.ctx.globalStorageUri,
      'user-data',
      bankId,
    );
    await this.trash.moveToTrash([bankUri, userDataUri], { bankId });
    // user-data 子层的 cache / 写队列也要清掉，避免后续误读到已移除 bank 的内存状态。
    try {
      await this.userData.deleteBankRoot(bankId);
    } catch (err) {
      // moveToTrash 已经把目录搬走，deleteBankRoot 内部 safeDelete 大概率是 FileNotFound 静默成功；
      // 极少数失败仅警告。
      console.warn(
        '[storage] removeBank: deleteBankRoot follow-up failed (non-fatal):',
        err,
      );
    }

    // ---- Step 2: 更新 meta.json ----
    const filteredBanks = this.currentMeta.banks.filter((b) => b.id !== bankId);
    // exactOptionalPropertyTypes: 不能直接给可选字段赋 undefined；通过解构
    // 决定是否携带 currentBankId。
    const wasActive = this.currentMeta.currentBankId === bankId;
    const { currentBankId: _prevCurrent, ...metaRest } = this.currentMeta;
    const nextMeta: BankMeta = wasActive
      ? { ...metaRest, banks: filteredBanks }
      : { ...this.currentMeta, banks: filteredBanks };
    await this.meta.writeAtomic(nextMeta);
    this.currentMeta = nextMeta;

    // ---- Step 3: 同步 globalState（仅当 currentBankId 变更时） ----
    if (wasActive) {
      try {
        await this.ctx.globalState.update(
          GLOBAL_STATE_CURRENT_BANK_ID,
          undefined,
        );
      } catch (err) {
        console.warn(
          '[storage] removeBank: globalState sync failed (non-fatal):',
          err,
        );
      }
    }
  }

  /**
   * design.md > Error Handling > 回滚通用模板 的物化。供上层在 "先内存后
   * Storage" 的写入路径上统一处理失败回滚 + 用户提示。
   *
   * 行为：
   *   1. 调用 `applyMemory(next)` 立即把 next 应用到内存（让其它读路径看到
   *      乐观值，UI 立即响应）。
   *   2. 调用 `persist()` 持久化。成功时返回 `Result.ok`。
   *   3. 持久化抛错时调用 `onRollback(prev)` 把内存还原，弹错误提示，
   *      返回 `STORAGE_WRITE_FAILED`。
   *
   * 该模板不处理 "持久化部分成功" 的复杂场景 —— 各子层（`UserDataStore` /
   * `MetaStore`）已经把单文件写做成 "tmp + rename" 原子操作，因此 `persist`
   * 的失败语义就是 "磁盘保持上一次稳定状态"。
   *
   * Validates: Property 10 / Req 5.7, 6.8, 7.5, 8.3, 9.7
   */
  async writeWithRollback<T>(
    params: WriteWithRollbackParams<T>,
  ): Promise<Result<void, DomainError>> {
    params.applyMemory(params.next);
    try {
      await params.persist();
      return { ok: true, value: undefined };
    } catch (err) {
      // 先回滚内存；用户提示与错误对象构造可以放在回滚之后。
      try {
        params.onRollback(params.prev);
      } catch (rollbackErr) {
        // 回滚函数本身抛错只能 warn，避免覆盖原始失败原因。
        console.warn(
          '[storage] writeWithRollback: onRollback threw (non-fatal):',
          rollbackErr,
        );
      }
      const cause = describeError(err);
      await this.notifyError(`Failed to save ${params.path}: ${cause}`);
      return {
        ok: false,
        error: { code: 'STORAGE_WRITE_FAILED', path: params.path, cause },
      };
    }
  }

  /** 当前是否处于安全模式（仅供诊断 / 测试断言）。 */
  isInSafeMode(): boolean {
    return this.safeMode;
  }

  /**
   * 当前内存中的 `BankMeta` 副本（防御性拷贝，避免外部直接修改影响内部状态）。
   * 上层 `BankRegistry` 通过该接口拿到 `banks[]` 渲染列表。
   */
  getCurrentMeta(): BankMeta {
    return {
      ...this.currentMeta,
      banks: this.currentMeta.banks.map((s) => ({ ...s })),
    };
  }

  // ---------------------------------------------------------------------------
  // 内部辅助
  // ---------------------------------------------------------------------------

  /**
   * 启动期清理 tmp 残留：
   *
   *   - `<globalStorageUri>/meta.json.tmp`：上一次进程在 rename 之前 crash 留下的
   *     `meta.json` 临时文件，必须删掉以避免新一轮原子写被它误导。
   *   - `<globalStorageUri>/banks/<id>.tmp/`：`installBank` 写新 bank 时的临时
   *     目录；启动期残留意味着上一次写未成功 rename。整目录删除，避免下次写新
   *     bank 时冲突。
   *
   * 任意失败都仅 warn，不阻塞启动。`Trash.purge(7d)` 的异步触发由 Activation
   * 在创建完 `Storage` 之后单独调度，本方法不承担 trash 清理。
   */
  private async cleanupTmpResidue(): Promise<void> {
    // 1) meta.json.tmp
    const metaTmp = vscode.Uri.joinPath(
      this.ctx.globalStorageUri,
      'meta.json.tmp',
    );
    try {
      await safeDelete(metaTmp);
    } catch (err) {
      console.warn(
        '[storage] cleanupTmpResidue: meta.json.tmp delete failed (non-fatal):',
        err,
      );
    }

    // 2) banks/<id>.tmp/ 残留目录
    const banksRoot = vscode.Uri.joinPath(this.ctx.globalStorageUri, 'banks');
    let entries: ReadonlyArray<readonly [string, vscode.FileType]> = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(banksRoot);
    } catch (err) {
      // banks/ 不存在是首次启动的合法情形；其它错误 warn 并继续。
      if (!isFileNotFound(err)) {
        console.warn(
          '[storage] cleanupTmpResidue: readDirectory(banks) failed (non-fatal):',
          err,
        );
      }
      return;
    }
    for (const [name] of entries) {
      // 仅删名以 `.tmp` 结尾的条目（与 `BankStore` 的 `<bankId>.tmp` 命名一致）。
      // 不限制 type，因 atomicFs 的退化路径下 `.tmp` 也可能是文件残骸。
      if (!name.endsWith('.tmp')) continue;
      const target = vscode.Uri.joinPath(banksRoot, name);
      try {
        await safeDelete(target);
      } catch (err) {
        console.warn(
          `[storage] cleanupTmpResidue: failed to delete ${name} (non-fatal):`,
          err,
        );
      }
    }
  }

  /** 进入安全模式：弹错误提示 + 重置内存状态；不触碰磁盘。 */
  private async enterSafeMode(reason: string): Promise<void> {
    this.safeMode = true;
    this.currentMeta = { ...DEFAULT_BANK_META, banks: [] };
    await this.notifyError(
      `Failed to load meta.json (${reason}). Started in safe mode; existing data was not deleted.`,
    );
  }

  private buildSafeModeState(): InMemoryState {
    return {
      meta: { ...DEFAULT_BANK_META, banks: [] },
      isSafeMode: true,
    };
  }

  /**
   * 通过 `vscode.window.showErrorMessage` 弹错误提示；自身抛错时仅 warn。
   * 抽出本辅助是为了让 bootstrap / writeWithRollback / removeBank 的失败路径
   * 在错误展示侧具备一致的容错语义（mock 环境也能调用）。
   */
  private async notifyError(message: string): Promise<void> {
    try {
      await vscode.window.showErrorMessage(message);
    } catch (err) {
      console.warn('[storage] notifyError: showErrorMessage failed:', err);
    }
  }
}
