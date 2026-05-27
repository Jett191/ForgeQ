// Feature: frontend-interview-practice, Property 11: 清空笔记等价于"删除"
//
// 验证 design.md "Correctness Properties > Property 11" 与 Requirement 7.4：
// 对任意 `bankId` / `qid`，调用 `userData.writeNote(bankId, qid, '')` 之后：
//
//   ① `userData.readNote(bankId, qid)` 返回 `''` 或 `undefined`（二者在
//      Practice_View 中等价为空编辑区）。当前实现走"删除文件"路径，
//      应返回 `undefined`；接受 `''` 是为了在未来 implementation 改为
//      "写空文件" 时属性仍然成立。
//   ② 磁盘上的 `learning.json` 中对应 `LearningState.hasNote === false`。
//   ③ 下次 Practice_View 加载（模拟扩展重启：用全新的 `UserDataStore` 实例
//      从磁盘读起，不复用任何 in-memory cache）得到的 note 编辑区初值为空，
//      且对应 `LearningState.hasNote === false`。
//
// 生成器：本文件本地定义 `arbBankId` / `arbQid` / `arbNoteContent`。
//   - bankId / qid：1-20 字符的 `[a-z0-9_-]+`，避免引入路径分隔符干扰
//     `vscode.Uri.joinPath` 的目录分割与 memfs 的路径解析。
//   - noteContent：长度 0-10000 的任意（grapheme-ascii）字符串，与
//     Req 7.1 中"单条 Note 字符数不超过 10000"上限对齐；含空串路径，等价
//     于"清空前 note 本就为空"，让初始状态为"已有笔记"与"未曾写入笔记"
//     两条路径都被覆盖。
//
// `numRuns: 100`，与 tasks.md 任务 11.3 / design.md 一致。
//
// **Validates: Requirements 7.4**

import { describe, expect, it, vi } from 'vitest';

// `vi.mock('vscode', ...)` 工厂会被 vitest 提升到文件顶部，普通顶层变量在
// 那一刻还没初始化。`vi.hoisted` 提供同样被提升的钩子，让 harness 在 mock
// 工厂与测试体内引用同一份实例（与 `test/storage/trash.example.test.ts`
// 同模式）。
const { harness } = vi.hoisted(() => {
  // 在 hoisted 阶段不能用 ESM `import`，只能用 require；测试运行时由
  // vitest 通过 ts/esm loader 把它解析为同一个模块实例。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return { harness: mod.createMemFsHarness() };
});

// `UserDataStore` 在运行时 `import * as vscode from 'vscode'`，因此必须在所有
// import 之前替换该模块为 harness 提供的桩。
vi.mock('vscode', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return mod.createVscodeModuleMock(harness);
});

// 注：以下 import 必须晚于 `vi.mock`，才能拿到桩实现。
// eslint-disable-next-line import/first
import * as fc from 'fast-check';
// eslint-disable-next-line import/first
import { HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { UserDataStore } from '../../src/storage/userDataStore.js';

// ---------------------------------------------------------------------------
// 本地生成器
// ---------------------------------------------------------------------------

/** id 字符集：仅小写字母 / 数字 / 连字符 / 下划线，避免引入路径分隔符。 */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('');

/** Bank id：1-20 字符的安全 id。 */
const arbBankId: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...ID_ALPHABET),
});

/** Question id：与 bankId 同形态，独立采样以允许双方完全无关。 */
const arbQid: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...ID_ALPHABET),
});

/** Note 内容：长度 0-10000 的任意字符串（含空串路径）。 */
const arbNoteContent: fc.Arbitrary<string> = fc.string({
  minLength: 0,
  maxLength: 10000,
});

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// 属性测试
// ---------------------------------------------------------------------------

describe('Property 11: 清空笔记等价于"删除"', () => {
  it('writeNote(_, _, "") 之后 readNote / learning.json / 重新加载均回到空 note 状态', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbNoteContent,
        async (bankId, qid, noteContent) => {
          // 每次 fc 迭代独立重置整个 memfs 卷，避免上一轮残留的 learning.json
          // 影响本轮断言。`reset` 同时重新创建 `globalStorageUri` 根目录。
          harness.reset();

          const baseUri = HarnessUri.joinPath(
            harness.globalStorageUri,
            'user-data',
          );

          // `debounceMs: 0` 让写入近似同步执行；配合 `flushPending` 把每次
          // `writeNote` 触发的 `learning.json` 落盘强制完成，便于在断言阶段
          // 直接读磁盘进行交叉验证。
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          // -----------------------------------------------------------------
          // Phase 1：先写入 noteContent。
          //
          // 当 noteContent !== '' 时，store 会写出 `notes/<qid>.md` 并把
          // `learning.json` 中的 `hasNote` 置为 true，覆盖"清空前已有笔记"
          // 路径。当 noteContent === '' 时，本次调用走删除分支（与 Phase 2
          // 等价），覆盖"清空前未曾写入笔记"路径——这两条路径都应在 Phase 2
          // 之后回归一致的"空 note"状态。
          // -----------------------------------------------------------------
          await store.writeNote(bankId, qid, noteContent);
          await store.flushPending(bankId);

          // -----------------------------------------------------------------
          // Phase 2：清空笔记——本属性的被验证操作。
          // -----------------------------------------------------------------
          await store.writeNote(bankId, qid, '');
          await store.flushPending(bankId);

          // 断言 ①：readNote 返回 '' 或 undefined。当前实现删除文件后
          // `readTextOrUndefined` 走 `FileNotFound` 分支，返回 undefined。
          const readBack = await store.readNote(bankId, qid);
          expect(readBack === '' || readBack === undefined).toBe(true);

          // 断言 ②：learning.json 中 hasNote === false。
          //
          // 直接读磁盘字节再 JSON.parse，绕过 store 内部的 cache，避免与
          // "cache 写直达 + 磁盘异步 flush" 互相验证导致的同义反复。
          const learningJsonUri = HarnessUri.joinPath(
            baseUri,
            bankId,
            'learning.json',
          );
          const bytes = await harness.workspaceFs.readFile(learningJsonUri);
          const parsed = JSON.parse(
            new TextDecoder('utf-8').decode(bytes),
          ) as Record<string, { hasNote?: unknown }>;
          // `hasNote` 必须存在且严格为 false（不是 undefined / 缺席）。
          expect(parsed[qid]).toBeDefined();
          expect(parsed[qid]?.hasNote).toBe(false);

          // 顺带通过同一 store 的 cache 视图再验一次，确保 cache 与磁盘一致。
          const lsCache = await store.readLearningState(bankId, qid);
          expect(lsCache?.hasNote).toBe(false);

          // -----------------------------------------------------------------
          // 断言 ③：下次加载初值为空。
          //
          // 用一个全新的 `UserDataStore` 实例去掉所有进程内 cache，模拟扩展
          // 重启 / 重新激活时 PracticeController 首次读取笔记的过程。
          // -----------------------------------------------------------------
          const reloaded = new UserDataStore(baseUri, { debounceMs: 0 });
          const noteAfterReload = await reloaded.readNote(bankId, qid);
          expect(noteAfterReload === '' || noteAfterReload === undefined).toBe(
            true,
          );

          // 重新加载后的 LearningState 必然落地为"qid 条目存在但 hasNote 为
          // false"——因为 Phase 2 必定写过一次 learning.json。这也间接证明
          // `learning.json` 的 hasNote 标志位与 `notes/<qid>.md` 文件存在性
          // 在"已清空"时严格一致。
          const lsAfterReload = await reloaded.readLearningState(bankId, qid);
          expect(lsAfterReload).toBeDefined();
          expect(lsAfterReload?.hasNote).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
