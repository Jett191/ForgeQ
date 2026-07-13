/**
 * EXAMPLE - UserDataStore 默认状态 / 写合并 / 单写性能 / 笔记清空（Task 11.2）
 *
 * 这是 design.md > Storage Facade 与子层 > UserDataStore 一节的示例验证。覆盖
 * 四个核心断言：
 *
 *   1. **默认状态**：未写入时 `readLearningState` 返回 `undefined`；上层
 *      `getOrDefault` 给出 `{ mastery: 'unlearned', favoriteFlag: false,
 *      wrongFlag: false, hasNote: false }`（对齐 Req 8.6 / 9.6 / Property 13）。
 *   2. **写合并**:在同一 1000ms debounce 窗口内连续 5 次 `writeLearningState`
 *      只触发 *一次* 对 `learning.json.tmp` 的 `vscode.workspace.fs.writeFile`,
 *      且最终落盘的 `learning.json` 包含全部 5 条记录(design.md "1000ms
 *      debounce 写合并")。
 *   3. **单写性能**：单次 `writeLearningState` + `flushPending` 在 500ms 内完成，
 *      与 Task 23.2 基准任务以及 Req 11.6 "单次写入操作 ≤ 500ms" 呼应。
 *   4. **笔记清空**：`writeNote(bankId, qid, '')` 删除 `notes/<qid>.md`，并把
 *      `learning.json.hasNote` 置为 `false`，下次 `readNote` 返回 `undefined`
 *      （design.md Property 11 的 EXAMPLE 镜像；PBT 版本在 Task 11.3）。
 *
 * 实现策略说明：
 *
 *   - 通过 `memFsHarness` 把 `vscode.workspace.fs` 替换为 memfs 实现，写入语义
 *     等价于真实分区 rename（同分区原子）。
 *   - 写合并测试用 `vi.useFakeTimers()` 让 `setTimeout(1000)` 受控前进，
 *     `advanceTimersByTimeAsync(1500)` 同时冲洗 microtask 队列让 `ensureCache`
 *     的 `readFile` 微任务先 settle，再触发唯一一次 debounce 批 flush。
 *   - 通过 `vi.spyOn(harness.workspaceFs, 'writeFile')` 计数 `.tmp` 写入次数；
 *     `safeDelete` / `rename` 不计入 `writeFile`，因此一次 flush ↔ 一次 writeFile。
 *   - 性能测试用 `debounceMs: 0` 让 schedule 立即 dequeue，避免人为引入 1s
 *     等待；`flushPending` 仍然把整 cache 走完整 `tmp + rename` 路径。
 *
 * **Validates: Requirements 11.6**
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemFsHarness } from '../harness/memFsHarness.js';

// `vi.mock` 工厂在 vitest 运行时会被提升到文件顶部，普通的顶层 const 在那一刻
// 还没有完成初始化（会触发 "Cannot access 'harness' before initialization"）。
// 解法：用 `vi.hoisted` 让 harness 的构造也被提升；factory 写成 async + 动态
// import 以避开 `require` 在 ESM-only TS 源上的解析问题，返回值是 `Promise<...>`,
// 避免在模块顶层使用 `await`（Node16 module 模式下不允许）。
const hoistedHarness = vi.hoisted(async () => {
  const mod = await import('../harness/memFsHarness.js');
  return mod.createMemFsHarness();
});

// `UserDataStore` 与 `atomicFs` 在运行时 `import * as vscode from 'vscode'`,
// 必须在所有真实模块的 import 之前替换该模块。`vi.mock` 工厂同样被 hoist,
// 但运行顺序晚于 `vi.hoisted`，因此可以安全地 `await hoistedHarness`。
vi.mock('vscode', async () => {
  const mod = await import('../harness/memFsHarness.js');
  const harness = await hoistedHarness;
  return mod.createVscodeModuleMock(harness);
});

// 注：mock 必须先于真实模块的 import；下面这些 import 才能拿到桩实现。
// eslint-disable-next-line import/first
import { HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { UserDataStore, getOrDefault } from '../../src/storage/userDataStore.js';
// eslint-disable-next-line import/first
import type { LearningState } from '../../src/types/learning.js';

// 测试体中需要同步访问 harness。`beforeAll` 在所有 it 之前 await 一次拿到
// 同一份实例并赋值；`!:` 让 TS 信任 setup 总会执行成功。
let harness!: MemFsHarness;

const BANK_ID = 'bank-example';

/** 测试用 LearningState；不带 `lastPracticedAt` 以兼容 `exactOptionalPropertyTypes`。 */
const SAMPLE_STATE: LearningState = {
  mastery: 'learning',
  favoriteFlag: true,
  wrongFlag: false,
  hasNote: false,
};

/** design.md Req 8.6 / 9.6 中的默认 LearningState（缺省 `lastPracticedAt`）。 */
const DEFAULT_LEARNING_STATE: LearningState = {
  mastery: 'unlearned',
  favoriteFlag: false,
  wrongFlag: false,
  hasNote: false,
};

describe('UserDataStore (example)', () => {
  beforeAll(async () => {
    harness = await hoistedHarness;
  });

  beforeEach(() => {
    harness.reset();
  });

  afterEach(() => {
    // 每个用例自行决定是否启用 fake timers；统一在 afterEach 复位以免污染下一例。
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('默认状态：未写入时 readLearningState 返回 undefined，getOrDefault 提供缺省值', async () => {
    const store = new UserDataStore(harness.globalStorageUri);

    // learning.json 尚未存在 → underlying readFile 抛 FileNotFound，store 在
    // loadFromDisk 中 catch 并以空 Map 缓存。对外仍返回 undefined，让上层经
    // getOrDefault 决定缺省值（与 PracticeController / TreeView 的渲染契约一致）。
    const value = await store.readLearningState(BANK_ID, 'q-missing');
    expect(value).toBeUndefined();

    expect(getOrDefault(value)).toEqual(DEFAULT_LEARNING_STATE);

    // 防御性确认：整 bank 的 LearningMap 也是空集合，没有被损坏数据污染。
    const map = await store.readLearningMap(BANK_ID);
    expect(map.size).toBe(0);
  });

  it('写合并：1000ms 内连续 5 次 writeLearningState 仅触发一次 learning.json fs 写', async () => {
    vi.useFakeTimers();

    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 1000 });

    // spyOn 替换 harness.workspaceFs.writeFile；mock 出来的 vscode.workspace.fs
    // 直接引用同一对象，因此生产代码 `vscode.workspace.fs.writeFile` 也会被记录。
    const writeFileSpy = vi.spyOn(harness.workspaceFs, 'writeFile');

    // 5 次写入：dispatch 后不立即 await，模拟用户在 1s 内连续切换
    // mastery / favorite 等高频写场景。每次 schedule 都会 clearTimeout(前一次)
    // 并重置 1000ms 计时器 —— 最终只有第 5 次设置的 timer 会真正触发。
    const writes = [0, 1, 2, 3, 4].map((i) =>
      store.writeLearningState(BANK_ID, `q-${i}`, {
        ...SAMPLE_STATE,
        mastery: i % 2 === 0 ? 'learning' : 'mastered',
      }),
    );

    // 推进 1500ms：同时冲洗 microtask 队列，让 ensureCache 的 readFile 全部
    // settle、所有 schedule 完成入队，再让 setTimeout(1000) fire 一次。
    await vi.advanceTimersByTimeAsync(1500);
    await Promise.all(writes);

    // 期望 learning.json.tmp 仅被写入一次；rename / delete 不计入 writeFile。
    const learningTmpPath = `${harness.globalStorageUri.fsPath}/${BANK_ID}/learning.json.tmp`;
    const tmpWrites = writeFileSpy.mock.calls.filter(
      ([uri]) => (uri as HarnessUri).fsPath === learningTmpPath,
    );
    expect(tmpWrites).toHaveLength(1);

    // 落盘内容包含全部 5 条记录 —— 证明 "合并写" 没有丢任何中间值。
    const learningUri = HarnessUri.joinPath(
      harness.globalStorageUri,
      BANK_ID,
      'learning.json',
    );
    const bytes = await harness.workspaceFs.readFile(learningUri);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, LearningState>;
    expect(Object.keys(parsed).sort()).toEqual(['q-0', 'q-1', 'q-2', 'q-3', 'q-4']);
    expect(parsed['q-2']?.mastery).toBe('learning');
    expect(parsed['q-3']?.mastery).toBe('mastered');
  });

  it('单次 learning.json 写入 ≤ 500ms（与 Task 23.2 基准呼应）', async () => {
    // debounceMs: 0 让 schedule 当 tick 立即 dequeue，单次写入退化为
    // "loadFromDisk → set cache → flush(tmp + rename)" 一条直链。
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });

    // 预热：第一次访问会触发 readFile(FileNotFound) 路径，把首字节加载 / catch
    // 等开销排除在测量窗口之外，让本例聚焦 "单次完整 fs 写入"。
    await store.readLearningState(BANK_ID, 'q-warmup');

    const start = performance.now();
    await store.writeLearningState(BANK_ID, 'q-1', SAMPLE_STATE);
    await store.flushPending(BANK_ID);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);

    // 顺带确认 round-trip 一致：写入即可见、落盘字节也一致。
    expect(await store.readLearningState(BANK_ID, 'q-1')).toEqual(SAMPLE_STATE);
  });

  it('清空笔记：writeNote(_, _, "") 删除文件并把 hasNote 置为 false', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });

    // Phase 1：建立 "有笔记" 状态。writeNote 内部联动把 hasNote 置 true。
    await store.writeNote(BANK_ID, 'q-1', '# 一段笔记');
    await store.flushPending(BANK_ID);

    expect(await store.readNote(BANK_ID, 'q-1')).toBe('# 一段笔记');
    expect(await store.readLearningState(BANK_ID, 'q-1')).toMatchObject({
      hasNote: true,
    });

    // Phase 2：清空。design.md Property 11："清空 ≡ 删除"，文件应不复存在，
    // hasNote 同步翻回 false。
    await store.writeNote(BANK_ID, 'q-1', '');
    await store.flushPending(BANK_ID);

    expect(await store.readNote(BANK_ID, 'q-1')).toBeUndefined();
    expect(await store.readLearningState(BANK_ID, 'q-1')).toMatchObject({
      hasNote: false,
    });
  });

  it('单题项目支持嵌套多文件，重复确保时不覆盖已有内容', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });
    const qid = '../question/with/slash';

    const appUri = await store.ensureQuestionProjectFile(
      BANK_ID,
      qid,
      'src/App.jsx',
      'export default function App() {}',
    );
    await store.ensureQuestionProjectFile(
      BANK_ID,
      qid,
      'src/utils.js',
      'export const value = 1;',
    );

    // 第二次 ensure 不能覆盖用户已写入的答案。
    await store.ensureQuestionProjectFile(BANK_ID, qid, 'src/App.jsx', 'overwritten');

    const files = await store.listQuestionProjectFiles(BANK_ID, qid);
    expect(files.map((file) => file.relativePath)).toEqual(['src/App.jsx', 'src/utils.js']);
    expect(new TextDecoder().decode(await harness.workspaceFs.readFile(appUri))).toBe(
      'export default function App() {}',
    );

    // qid 被编码成单一目录段，不能通过 ../ 或 / 逃逸出 projects 目录。
    expect(appUri.fsPath).toContain('/projects/%2E%2E%2Fquestion%2Fwith%2Fslash/');
  });
});
