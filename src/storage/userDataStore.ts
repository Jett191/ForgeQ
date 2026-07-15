/**
 * UserDataStore（Task 11.1）
 *
 * 负责 `<globalStorageUri>/user-data/<bankId>/` 下所有用户数据的持久化：
 *
 *   - `learning.json`              ：单题学习状态（mastery / favoriteFlag /
 *                                    wrongFlag / hasNote / lastPracticedAt）。
 *   - `projects/<qid>/`            ：单题练习项目，可包含任意数量与层级的文件。
 *   - `code/<qid>.<ext>`           ：代码题练习文件（`PracticeKind = 'code'`）。
 *   - `qa/<qid>.<ext>`             ：QA 题"我的回答"文件（`PracticeKind = 'qa'`）。
 *   - `notes/<qid>.md`             ：用户笔记（`PracticeKind = 'note'`）。
 *
 * 与 `MetaStore` / `BankStore` 不同，本模块在进程内维护一份 **写直达 + 读旁路**
 * 的内存缓存（`LearningCache: Map<bankId, Map<qid, LearningState>>`），并把
 * `learning.json` 的写入按 `bankId` 串行排队、在 1000ms debounce 窗口内合并为一次
 * fs 写。这样即使用户在 Webview 中连续切换 mastery / favorite / 笔记标志位，
 * 也只会触发一次 "写 `<file>.tmp` + rename" 原子写入，避免高频 IO。
 *
 * ## 文件布局
 *
 * ```
 * <baseUri>/                        // 通常是 <globalStorageUri>/user-data
 * └── <bankId>/
 *     ├── learning.json             // { [qid]: LearningState }
 *     ├── projects/<qid>/            // 新版：一道题一个独立项目目录
 *     ├── code/<qid>.<ext>          // 代码题练习文件
 *     ├── qa/<qid>.<ext>            // QA 我的回答（一般为 .md）
 *     └── notes/<qid>.md            // 用户笔记（一般为 .md）
 * ```
 *
 * 子目录在首次写入对应类型文件时按需创建（`writeAtomic*` 内部用
 * `vscode.workspace.fs.writeFile`，harness 与生产实现都会自动 mkdir）。
 *
 * ## 写入流水（learning.json）
 *
 *   1. `writeLearningState(bankId, qid, next)` 同步把 `next` 放进 cache，让后续
 *      `readLearningState` 立即可见（满足 Property 9 round-trip）。
 *   2. 写操作进入按 `bankId` 串行的 `BankWriteQueue` —— 每个 bank 独立的队列
 *      允许多 bank 并行写，单 bank 内严格按调用顺序持久化。
 *   3. 队列里设置 1000ms debounce 计时器：每次新写入到达就重置计时器；计时器
 *      触发时把队列中等待的 caller 拉成一批，调用 `flushFn` 把 **整 cache** 序列化
 *      为 `learning.json.tmp` 并 rename 为 `learning.json`。批内所有 caller 的
 *      promise 一起 resolve（或在失败时一起 reject）。
 *   4. 每次 flush 在 `chain`（Promise 串）上排队，确保 in-flight flush 期间到达
 *      的新写入会等待前一次 flush 完成后再开始下一轮。
 *
 * 该策略和 design.md > Storage Facade 与子层 > 写入原子性约束 > learning.json 合并
 * 写入 完全对齐。debounce 时长通过构造函数 `debounceMs` 注入，便于测试场景把
 * 时长压到 0 跑确定性的 round-trip。
 *
 * ## 失败语义
 *
 *   - 任何 fs 写失败（writeFile / rename / copy / delete 抛错）都让对应的
 *     `writeLearningState` / `writeNote` / `writePracticeContent` promise reject；
 *     调用方（`Storage.writeWithRollback` / `PracticeController`）按 Req 5.7 / 6.8 /
 *     7.5 / 8.3 / 9.7 把内存值回滚并提示用户。
 *   - 失败时 cache 不会被自动回滚 —— "回滚" 的语义是上层根据先前快照重新
 *     `writeLearningState(prev)`。这种设计避免本模块对 "上一次稳定状态" 做隐式记忆，
 *     与 `writeWithRollback` 的显式回滚语义匹配。
 *
 * ## `readLearningState` 与默认值
 *
 *   - `readLearningState(bankId, qid)` 在条目缺失时返回 `undefined`（design.md /
 *     Req 8.6 / 9.6）。上层通过 {@link getOrDefault} 拿到默认值
 *     `{ mastery: 'unlearned', favoriteFlag: false, wrongFlag: false, hasNote: false }`
 *     （`lastPracticedAt` 字段省略，与 `exactOptionalPropertyTypes` 兼容）。
 *
 * ## 清空笔记的语义（Property 11）
 *
 *   - `writeNote(bankId, qid, '')`：删除 `notes/<qid>.md`，同时把
 *     `learning.json` 中对应 `LearningState.hasNote` 置为 `false`。
 *   - 之后 `readNote` 返回 `undefined`（文件不存在 ≡ 没有笔记），上层 Practice 视图
 *     渲染为空编辑区。该等价关系是 design.md Property 11 的核心断言。
 *
 * Validates: Requirements 5.3, 5.4, 6.3, 6.4, 7.2, 7.3, 7.4, 8.2, 8.5, 8.6,
 *            9.2, 9.6, 11.1, 11.6
 */

import * as vscode from 'vscode';

import type { PracticeKind } from '../types/bankMeta';
import type { LearningState } from '../types/learning';
import { safeDelete, writeAtomicJson, writeAtomicText } from './atomicFs';

/** 默认 debounce 时长（ms），与 design.md "1000ms debounce" 对齐。 */
const DEFAULT_DEBOUNCE_MS = 1000;

/** `learning.json` 文件名，固定。 */
const LEARNING_JSON_FILE = 'learning.json';

/** 新版单题项目统一存放目录。 */
const PROJECTS_DIR = 'projects';

/** 各 `PracticeKind` 对应的子目录名。 */
const PRACTICE_SUBDIR: Readonly<Record<PracticeKind, string>> = Object.freeze({
  code: 'code',
  qa: 'qa',
  note: 'notes',
});

/** 单题 `LearningState` 的缺省值（参见 `getOrDefault`）。 */
const DEFAULT_LEARNING_STATE: Readonly<LearningState> = Object.freeze({
  mastery: 'unlearned',
  favoriteFlag: false,
  wrongFlag: false,
  hasNote: false,
});

/**
 * 上层 "未写入时返回默认值" 的便捷工具。等价于
 * `userData.readLearningState(...).then(s => s ?? defaultLearningState())`。
 *
 * 不做复杂的合并逻辑：上层若已读到部分字段，应自行 spread；该函数只负责
 * "完全缺失" 时给出符合 Req 8.6 / 9.6 / Property 13 的默认 LearningState。
 *
 * 注意：默认值 **不** 包含 `lastPracticedAt` 字段，以与
 * `exactOptionalPropertyTypes: true` 下的 "可选属性可缺省" 语义保持一致。
 */
export function getOrDefault(state: LearningState | undefined): LearningState {
  if (state !== undefined) return state;
  return { ...DEFAULT_LEARNING_STATE };
}

/** 单题项目中的一个普通文件。 */
export interface QuestionProjectFile {
  relativePath: string;
  uri: vscode.Uri;
}

/**
 * 把题目 id 编码成单个安全目录名，避免 `/`、`..` 等内容逃逸出题目目录。
 * 编码只影响磁盘路径，不修改题库中的原始 id。
 */
function projectQuestionSegment(qid: string): string {
  return encodeURIComponent(qid).replace(/\./g, '%2E');
}

/** 校验并拆分用户输入的项目内相对文件路径。 */
function projectPathSegments(relativePath: string): string[] {
  const normalized = relativePath.trim().replace(/\\/g, '/');
  if (normalized.length === 0 || normalized.startsWith('/') || normalized.endsWith('/')) {
    throw new Error('文件名不能为空，也不能使用绝对路径或以 / 结尾');
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error('文件路径不能包含空目录、. 或 ..');
  }
  return segments;
}

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
 * 把 `Map<qid, LearningState>` 序列化为 `learning.json` 写入磁盘的对象形态。
 * 显式使用 `Object.fromEntries` + 排序键，确保输出可重复（便于 git diff /
 * 备份对齐 / 测试快照）。
 */
function learningMapToObject(
  map: ReadonlyMap<string, LearningState>,
): Record<string, LearningState> {
  const sorted = [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(sorted);
}

/**
 * 把磁盘上的 `learning.json` 反序列化为内存 Map。仅做最低限度的形状校验：
 * 顶层为对象、值为对象。深度字段校验留给上层（Storage / PracticeController）按需处理 —
 * 本模块的不变量是 "round-trip：read(write(x)) === x"，过强的校验反而会破坏
 * 历史数据的可恢复性。
 */
function objectToLearningMap(value: unknown): Map<string, LearningState> {
  const out = new Map<string, LearningState>();
  if (value === null || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== null && typeof v === 'object') {
      out.set(k, v as LearningState);
    }
  }
  return out;
}

/**
 * 单 bank 的写入队列。负责 debounce 合并 + Promise 串行链。
 *
 * 设计要点：
 *
 *   - `waiting`：在当前 debounce 窗口内等待 flush 的 caller 集合。每次新写入到达
 *     都把 caller 的 resolver 推入 `waiting` 并重置计时器。
 *   - `chain`：所有已经被 dequeue 的 batch 会以 Promise 串的方式按顺序执行，
 *     保证 "前一次 flush 完成 → 后一次 flush 开始" 严格串行。
 *   - 计时器触发时把整 `waiting` 数组拉成一批；批内所有 caller 共享同一次
 *     `flushFn()` 的成功 / 失败结果。
 */
class BankWriteQueue {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private waiting: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly debounceMs: number,
    private readonly flushFn: () => Promise<void>,
  ) {}

  /**
   * 把一次写请求登记进队列。返回的 promise 会在该请求所在批次的 flush 完成后
   * resolve（成功）或 reject（失败）。
   */
  schedule(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      this.armTimer();
    });
  }

  /**
   * 立即触发一次 flush（绕过 debounce）。返回的 promise 与本次 flush 的最终
   * 结果对齐。即便当前 `waiting` 为空，也会触发一次空 flush 以让链上的等待者拿到
   * 最新结果（用于 `Storage.installBank` 等需要确保所有未决写入已落盘的场景）。
   */
  async flushNow(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.dequeue();
    await this.chain;
  }

  /** 设置 / 重置 debounce 计时器。 */
  private armTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    if (this.debounceMs <= 0) {
      // 同步路径：把当前 waiting 立即 dequeue。注意 dequeue 会把 batch 加入
      // `chain`，仍然异步执行，因此 caller 的 Promise.then 顺序得到保留。
      this.timer = undefined;
      this.dequeue();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.dequeue();
    }, this.debounceMs);
  }

  /**
   * 把当前 `waiting` 中的 caller 拉成一批，挂到 `chain` 上等待执行。
   * `chain` 失败不会让后续 batch 被中断 —— 每个 batch 自己捕获 flushFn 的异常
   * 并 reject 自己的 caller。
   */
  private dequeue(): void {
    const batch = this.waiting;
    this.waiting = [];
    if (batch.length === 0) {
      // 仍然把一次 flush 串到 chain 上，保证 `flushNow` 的等待语义正确。
      this.chain = this.chain.then(
        () => this.flushFn(),
        () => this.flushFn(),
      );
      return;
    }
    this.chain = this.chain.then(
      // 不论上游 chain 成功还是失败，都尝试本批次的 flush，避免一次失败
      // 永久阻塞后续写入。
      () => this.runBatch(batch),
      () => this.runBatch(batch),
    );
  }

  private async runBatch(
    batch: Array<{ resolve: () => void; reject: (err: unknown) => void }>,
  ): Promise<void> {
    try {
      await this.flushFn();
      for (const w of batch) w.resolve();
    } catch (err) {
      for (const w of batch) w.reject(err);
    }
  }
}

/** 构造函数选项。 */
export interface UserDataStoreOptions {
  /**
   * `learning.json` 的写合并 debounce 时长（毫秒）。默认 1000ms，与 design.md
   * "1000ms debounce 写合并" 对齐。测试可以传 0 让写入近似同步执行。
   */
  debounceMs?: number;
}

/**
 * `UserDataStore` 实现。
 *
 * 实例一般由 `Storage.create(ctx)` 在引导期构造，传入
 * `vscode.Uri.joinPath(ctx.globalStorageUri, 'user-data')` 作为 `baseUri`。
 */
export class UserDataStore {
  private readonly debounceMs: number;

  /** `LearningCache: Map<bankId, Map<qid, LearningState>>`，进程内权威工作集。 */
  private readonly cache = new Map<string, Map<string, LearningState>>();

  /** 仍在加载中的 bankId 对应的 in-flight promise，用于去重并发 read。 */
  private readonly loadPromises = new Map<string, Promise<Map<string, LearningState>>>();

  /** 每个 bankId 一个写队列；不同 bank 之间天然并行。 */
  private readonly queues = new Map<string, BankWriteQueue>();

  /**
   * @param baseUri user-data 根目录，通常为 `<globalStorageUri>/user-data`。
   * 所有读 / 写 / 删除路径都基于该 URI `joinPath`，不会越权访问其它位置。
   * @param options 写合并 debounce 时长等可选参数。
   */
  constructor(
    private readonly baseUri: vscode.Uri,
    options: UserDataStoreOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  // ---- LearningState API ----------------------------------------------------

  /**
   * 读取单题学习状态。
   *
   * - cache 中存在该 bankId 对应的 Map → 直接返回 `map.get(qid)`（可能 undefined）。
   * - cache 中尚未加载 → 从 `learning.json` 读盘，写入 cache 后再返回。
   * - 文件不存在 → cache 写入空 Map，返回 undefined。
   *
   * 文件不存在不视为错误：首次启动 / 新建 bank / 用户从未练过 都属于此情形。
   */
  async readLearningState(bankId: string, qid: string): Promise<LearningState | undefined> {
    const map = await this.ensureCache(bankId);
    return map.get(qid);
  }

  /**
   * 把单题学习状态写入 cache，并调度一次 debounced flush。
   *
   * 返回的 promise 在 flush 完成后 resolve / reject —— flush 失败会让本次
   * `writeLearningState` 一起失败，以便上层做回滚。
   */
  async writeLearningState(bankId: string, qid: string, next: LearningState): Promise<void> {
    const map = await this.ensureCache(bankId);
    map.set(qid, next);
    await this.scheduleFlush(bankId);
  }

  /**
   * 读取整 bank 的学习状态，返回防御性拷贝。
   *
   * 调用方修改返回的 Map 不会影响内部 cache；但 Map 中的 LearningState 对象本身
   * 仍是引用共享，调用方若要修改字段应先 `{ ...prev }` 再 `writeLearningState`，
   * 与 `MasteryRules.deriveLearningState` 的不可变更新模式一致。
   */
  async readLearningMap(bankId: string): Promise<Map<string, LearningState>> {
    const map = await this.ensureCache(bankId);
    return new Map(map);
  }

  // ---- Practice / Note 文件 API -------------------------------------------

  /**
   * 确保 `<baseUri>/<bankId>/<subdir>/<qid><ext>` 存在；不存在时用 `init` 写入。
   *
   * - 文件已存在：直接返回 URI，**不**覆盖既有内容（Req 5.4 / 6.4 / 7.3
   *   "重新打开同一题加载已保存内容"）。
   * - 文件不存在：原子写入 `init`（UTF-8）。任意 fs 错误向上抛出。
   *
   * @returns 该练习文件的最终 URI。
   */
  async ensurePracticeFile(
    bankId: string,
    qid: string,
    kind: PracticeKind,
    ext: string,
    init: string,
  ): Promise<vscode.Uri> {
    const uri = this.practiceFileUri(bankId, qid, kind, ext);
    const exists = await this.fileExists(uri);
    if (!exists) {
      await writeAtomicText(uri, init);
    }
    return uri;
  }

  /**
   * 读取 `<baseUri>/<bankId>/<subdir>/<qid><ext>` 的 UTF-8 文本内容。
   * 文件不存在时返回 `undefined`；其它 fs 错误向上抛出。
   */
  async readPracticeContent(
    bankId: string,
    qid: string,
    kind: PracticeKind,
    ext: string,
  ): Promise<string | undefined> {
    const uri = this.practiceFileUri(bankId, qid, kind, ext);
    return this.readTextOrUndefined(uri);
  }

  /**
   * 原子写入 `<baseUri>/<bankId>/<subdir>/<qid><ext>` 的 UTF-8 文本内容。
   * 不更新 `learning.json`（练习文件本身的存在与否不映射到 LearningState）。
   */
  async writePracticeContent(
    bankId: string,
    qid: string,
    kind: PracticeKind,
    ext: string,
    value: string,
  ): Promise<void> {
    const uri = this.practiceFileUri(bankId, qid, kind, ext);
    await writeAtomicText(uri, value);
  }

  // ---- 单题项目 API -------------------------------------------------------

  /**
   * 返回并确保单题项目目录存在：
   * `<baseUri>/<bankId>/projects/<encoded-qid>/`。
   */
  async ensureQuestionProject(bankId: string, qid: string): Promise<vscode.Uri> {
    const uri = this.questionProjectUri(bankId, qid);
    await vscode.workspace.fs.createDirectory(uri);
    return uri;
  }

  /** 返回单题项目目录 URI；该方法本身不会创建目录。 */
  getQuestionProjectUri(bankId: string, qid: string): vscode.Uri {
    return this.questionProjectUri(bankId, qid);
  }

  /**
   * 确保项目中的相对路径文件存在；允许 `src/App.jsx` 这样的嵌套路径。
   * 已存在文件不会被覆盖。
   */
  async ensureQuestionProjectFile(
    bankId: string,
    qid: string,
    relativePath: string,
    init = '',
  ): Promise<vscode.Uri> {
    const segments = projectPathSegments(relativePath);
    const root = await this.ensureQuestionProject(bankId, qid);
    const parentSegments = segments.slice(0, -1);
    if (parentSegments.length > 0) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, ...parentSegments));
    }
    const uri = vscode.Uri.joinPath(root, ...segments);
    if (!(await this.fileExists(uri))) {
      await writeAtomicText(uri, init);
    }
    return uri;
  }

  /** 递归列出单题项目中的全部普通文件，返回稳定的路径排序。 */
  async listQuestionProjectFiles(bankId: string, qid: string): Promise<QuestionProjectFile[]> {
    const root = await this.ensureQuestionProject(bankId, qid);
    const files: QuestionProjectFile[] = [];

    const walk = async (dir: vscode.Uri, prefix: string): Promise<void> => {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      for (const [name, type] of entries) {
        const uri = vscode.Uri.joinPath(dir, name);
        const relativePath = prefix.length > 0 ? `${prefix}/${name}` : name;
        if (type === vscode.FileType.Directory) {
          await walk(uri, relativePath);
        } else if (type === vscode.FileType.File && !name.endsWith('.tmp')) {
          files.push({ relativePath, uri });
        }
      }
    };

    await walk(root, '');
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return files;
  }

  /**
   * 删除一道题的全部作答文件。
   *
   * 同时覆盖新版 `projects/<qid>/` 整目录与旧版 `qa/`、`code/` 单文件布局；
   * 笔记位于独立的 `notes/` 目录，不属于答案，因此不会被删除。
   *
   * @returns 删除前是否至少存在一个答案文件或项目目录。
   */
  async deleteQuestionAnswers(bankId: string, qid: string): Promise<boolean> {
    const candidates = [
      this.questionProjectUri(bankId, qid),
      this.practiceFileUri(bankId, qid, 'qa', '.md'),
      ...['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.txt'].map((extension) =>
        this.practiceFileUri(bankId, qid, 'code', extension),
      ),
    ];
    let found = false;

    for (const uri of candidates) {
      if (!(await this.fileExists(uri))) continue;
      found = true;
      await safeDelete(uri);
    }

    return found;
  }

  /**
   * 读取 `<baseUri>/<bankId>/notes/<qid>.md` 的内容。
   * 文件不存在 → `undefined`；存在 → 文件文本（可能是空字符串，但通常不会出现，
   * 因为清空笔记走的是删除路径，参见 {@link writeNote}）。
   */
  async readNote(bankId: string, qid: string): Promise<string | undefined> {
    const uri = this.noteFileUri(bankId, qid);
    return this.readTextOrUndefined(uri);
  }

  /** 返回笔记文件 URI；不会创建或修改文件。 */
  getNoteUri(bankId: string, qid: string): vscode.Uri {
    return this.noteFileUri(bankId, qid);
  }

  /**
   * 写入或清空笔记。
   *
   * - `value === ''`：删除 `notes/<qid>.md`（不存在则跳过），并把 `learning.json`
   *   中对应 `LearningState.hasNote` 置为 `false`。这是 Property 11 "清空笔记
   *   等价于删除" 的实现路径。
   * - `value !== ''`：原子写入 `notes/<qid>.md`，并把 `LearningState.hasNote`
   *   置为 `true`。如果原 LearningState 不存在，会以默认值 + `hasNote: true`
   *   建一条新条目。
   *
   * 顺序约束：先写 / 删除文件，成功后再更新 `learning.json` cache 并调度 flush。
   * 这样即便 flush 失败，文件状态与 hasNote 的偏移最多一格 —— 下次启动重新读盘
   * 时上层可以基于 `notes/<qid>.md` 是否存在自我修正（PracticeController 在
   * 加载笔记时本来就会读文件）。
   */
  async writeNote(bankId: string, qid: string, value: string): Promise<void> {
    const noteUri = this.noteFileUri(bankId, qid);
    if (value === '') {
      // 删除文件 → 失败时不更新 learning state。文件不存在视为已经被清空。
      await safeDelete(noteUri);
      await this.updateHasNote(bankId, qid, false);
      return;
    }
    await writeAtomicText(noteUri, value);
    await this.updateHasNote(bankId, qid, true);
  }

  // ---- Bank 根目录 / 生命周期 ----------------------------------------------

  /**
   * 确保 `<baseUri>/<bankId>/` 存在。子目录（`code/` / `qa/` / `notes/`）按需在
   * 写入对应文件时由 `vscode.workspace.fs.writeFile` 自行 mkdir，本方法只负责
   * `Storage.installBank` Phase 2 中的 "用户目录已就绪" 标记。
   */
  async ensureBankRoot(bankId: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.bankRootUri(bankId));
  }

  /**
   * 删除 `<baseUri>/<bankId>/` 全部内容（不走 Trash）。
   *
   * 主要用途：`Storage.installBank` Phase 3 失败时清理刚创建的 user-data 副产品；
   * 用户可见的旧 bank 应由 `Trash.moveToTrash` 处理。
   *
   * 同步清掉本 bank 的 cache / 队列状态，避免后续读到被删除目录的过期数据。
   * 任何对应 bankId 的 in-flight flush 都会因为目录消失而下次 fs 写抛错；这是
   * 期望行为 —— 该 bank 已不存在，写入应该失败。
   */
  async deleteBankRoot(bankId: string): Promise<void> {
    this.cache.delete(bankId);
    this.loadPromises.delete(bankId);
    this.queues.delete(bankId);
    await safeDelete(this.bankRootUri(bankId));
  }

  // ---- 内部实现 -------------------------------------------------------------

  /**
   * 内部联动：写入笔记后 / 清空笔记后同步 `LearningState.hasNote`。
   * 保留 prev 中的其它字段，缺失时使用默认 LearningState。
   */
  private async updateHasNote(bankId: string, qid: string, hasNote: boolean): Promise<void> {
    const map = await this.ensureCache(bankId);
    const prev = map.get(qid);
    const next: LearningState = prev
      ? { ...prev, hasNote }
      : { ...DEFAULT_LEARNING_STATE, hasNote };
    map.set(qid, next);
    await this.scheduleFlush(bankId);
  }

  /**
   * 加载 bankId 对应的 `learning.json` 到 cache（幂等）。
   *
   * - cache 已存在 → 直接返回引用。
   * - 文件不存在 → 缓存空 Map（让后续 read 一致返回 undefined / 空集合）。
   * - 解析失败 → 视为 "学习状态损坏"，缓存空 Map 并打 warning。这条容错路径让
   *   一次磁盘损坏不至于让整个扩展无法启动；上层如需更严格的处理应在
   *   `Storage.bootstrap` 中显式校验。
   *
   * 并发安全：用 `loadPromises` 去重，多个并发 `ensureCache(bankId)` 共享同一次
   * 加载结果。
   */
  private async ensureCache(bankId: string): Promise<Map<string, LearningState>> {
    const cached = this.cache.get(bankId);
    if (cached) return cached;

    const inflight = this.loadPromises.get(bankId);
    if (inflight) return inflight;

    const promise = this.loadFromDisk(bankId);
    this.loadPromises.set(bankId, promise);
    try {
      const map = await promise;
      this.cache.set(bankId, map);
      return map;
    } finally {
      this.loadPromises.delete(bankId);
    }
  }

  private async loadFromDisk(bankId: string): Promise<Map<string, LearningState>> {
    const uri = this.learningJsonUri(bankId);
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch (err) {
      if (isFileNotFound(err)) {
        return new Map();
      }
      throw err;
    }
    const text = new TextDecoder('utf-8').decode(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      // 容错：损坏的 learning.json 不阻塞启动。上层若需要更严格的处理可以在
      // bootstrap 中显式调用 read* 检查并把这种情形提升为 STORAGE_LOAD_FAILED。
      console.warn(
        `[userDataStore] learning.json for bank ${bankId} is corrupt; starting empty:`,
        parseErr,
      );
      return new Map();
    }
    return objectToLearningMap(parsed);
  }

  /**
   * 把 bank 的当前 cache 序列化并原子写入 `learning.json`。
   * 这是 `BankWriteQueue.flushFn` 的实际执行体。
   */
  private async flushLearningJson(bankId: string): Promise<void> {
    const map = this.cache.get(bankId) ?? new Map<string, LearningState>();
    const obj = learningMapToObject(map);
    await writeAtomicJson(this.learningJsonUri(bankId), obj);
  }

  /** 把 cache 当前状态加入 bank 的写队列；按需懒构造 `BankWriteQueue`。 */
  private async scheduleFlush(bankId: string): Promise<void> {
    let queue = this.queues.get(bankId);
    if (!queue) {
      queue = new BankWriteQueue(this.debounceMs, () => this.flushLearningJson(bankId));
      this.queues.set(bankId, queue);
    }
    await queue.schedule();
  }

  /**
   * 测试 / 上层显式同步用：等待指定 bank 所有未决写入落盘。
   *
   * `Storage.installBank` 在 Phase 2 之后可调用本方法把 user-data 落盘强制刷回。
   * 没有未决写入时立即 resolve。
   */
  async flushPending(bankId: string): Promise<void> {
    const queue = this.queues.get(bankId);
    if (!queue) return;
    await queue.flushNow();
  }

  // ---- 路径构造 -------------------------------------------------------------

  /** `<baseUri>/<bankId>/`，bank 用户数据根目录。 */
  private bankRootUri(bankId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.baseUri, bankId);
  }

  /** `<baseUri>/<bankId>/learning.json`。 */
  private learningJsonUri(bankId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.bankRootUri(bankId), LEARNING_JSON_FILE);
  }

  /** `<baseUri>/<bankId>/<subdir>/<qid><ext>`。 */
  private practiceFileUri(
    bankId: string,
    qid: string,
    kind: PracticeKind,
    ext: string,
  ): vscode.Uri {
    const subdir = PRACTICE_SUBDIR[kind];
    return vscode.Uri.joinPath(this.bankRootUri(bankId), subdir, `${qid}${ext}`);
  }

  /** `<baseUri>/<bankId>/projects/<encoded-qid>/`。 */
  private questionProjectUri(bankId: string, qid: string): vscode.Uri {
    return vscode.Uri.joinPath(
      this.bankRootUri(bankId),
      PROJECTS_DIR,
      projectQuestionSegment(qid),
    );
  }

  /** `<baseUri>/<bankId>/notes/<qid>.md`，笔记文件固定 `.md` 扩展名。 */
  private noteFileUri(bankId: string, qid: string): vscode.Uri {
    return vscode.Uri.joinPath(this.bankRootUri(bankId), PRACTICE_SUBDIR.note, `${qid}.md`);
  }

  // ---- IO 辅助 --------------------------------------------------------------

  /** 判断文件是否存在；不存在返回 false，其它错误透出。 */
  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (err) {
      if (isFileNotFound(err)) return false;
      throw err;
    }
  }

  /** 读 UTF-8 文本，文件不存在时返回 undefined；其它错误透出。 */
  private async readTextOrUndefined(uri: vscode.Uri): Promise<string | undefined> {
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch (err) {
      if (isFileNotFound(err)) return undefined;
      throw err;
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
}
