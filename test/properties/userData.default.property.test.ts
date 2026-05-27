// Feature: frontend-interview-practice, Property 13: LearningState 默认值
//
// 验证 design.md "Correctness Properties > Property 13"：
//
//   *For any* `bankId` / `qid`，若 `learning.json` 中不存在该 `qid` 条目，则
//   `userData.readLearningState(bankId, qid)` 返回 `undefined`，且
//   `getOrDefault(undefined)` 返回
//   `{ mastery: 'unlearned', favoriteFlag: false, wrongFlag: false, hasNote: false,
//     lastPracticedAt: undefined }`。
//
// 实现注意（与 design.md / requirements.md 8.6 / 9.6 在语义层等价）：
//
//   - 由于 `tsconfig` 启用 `exactOptionalPropertyTypes: true`，`getOrDefault`
//     返回的默认对象 **省略** `lastPracticedAt` 键，而不是把它写成显式
//     `undefined`。"键省略" 与 "键存在但值为 undefined" 在 design.md 表述
//     `lastPracticedAt: undefined` 的默认值语义下是等价的：访问
//     `result.lastPracticedAt` 都得到 `undefined`。
//   - 因此本测试在断言这一字段时同时接受两种表达：
//       a) `'lastPracticedAt' in result === false`（键不存在），或
//       b) `result.lastPracticedAt === undefined`（键存在但值为 undefined）。
//     任意一种成立都满足 design.md 的语义；二者都不满足才视为违反 Property 13。
//
// 测试结构：
//
//   - 用 `memFsHarness` 替换 `vscode` 模块，给 `UserDataStore` 提供干净的
//     in-memory 文件系统。
//   - 每次 fc 迭代生成一对随机 (bankId, qid)，**不**对该 bank 做任何写入；
//     直接对一个全新的 `UserDataStore` 实例调用 `readLearningState`，断言
//     返回 `undefined`。
//   - 再把 `undefined` 喂给 `getOrDefault`，断言其字段集合与 design.md 默认值
//     一致；`lastPracticedAt` 按上述等价规则验证。
//
// 与 `numRuns: 100` 的约束一致（与 design.md / tasks.md 11.4 对齐）。
//
// **Validates: Requirements 8.6, 9.6**

import { describe, expect, it, vi } from 'vitest';

// `vi.mock('vscode', ...)` 工厂会被 vitest 提升到文件顶部，普通顶层变量在
// 那一刻还没初始化。`vi.hoisted` 提供同样被提升的钩子，让 harness 在 mock
// 工厂与测试体内引用同一份实例（与 `test/properties/userData.clearNote.property.test.ts`
// 同模式）。
const { harness } = vi.hoisted(() => {
  // 在 hoisted 阶段不能用 ESM `import`，只能用 require；vitest 通过 ts/esm
  // loader 把它解析为同一个模块实例。这里使用 `.ts` 扩展是 vitest 在
  // properties 子目录下解析模块时的工作配置（参见 clearNote 同款 PBT）。
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
import { UserDataStore, getOrDefault } from '../../src/storage/userDataStore.js';
// eslint-disable-next-line import/first
import type { LearningState } from '../../src/types/learning.js';

const NUM_RUNS = 100;

/**
 * 受约束的非空 ASCII 字符串：1-N 字符，剔除全空白。
 *
 * 与 `test/generators.ts` 中 `arbConstrainedString` 一致；这里**特意不复用**
 * 那份生成器，因为它不导出，且本测试只需要最简的 bankId / qid 形态。
 */
const arbId = (maxLength: number): fc.Arbitrary<string> =>
  fc
    .string({ minLength: 1, maxLength, unit: 'grapheme-ascii' })
    // 防御性过滤：极少数情况下生成器会产出全空白字符串，剔除以避免 fsPath 异常。
    .filter((s) => s.trim().length > 0)
    // 进一步剔除会被 vscode.Uri.joinPath 当作路径分隔符的字符。
    // memFsHarness 走 POSIX 路径，仅 '/' 需要排除。
    .filter((s) => !s.includes('/'));

/** 创建一个全新的 `UserDataStore`，绑定到 harness 的 `<globalStorageUri>/user-data`。 */
function makeStore(): UserDataStore {
  const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
  // debounceMs: 0 让任何潜在的内部 flush 不会与本测试的"未写入"前提冲突；
  // 本测试根本不调用 `writeLearningState`，所以该参数仅作保险。
  return new UserDataStore(baseUri, { debounceMs: 0 });
}

describe('Property 13: LearningState 默认值', () => {
  it('未写入时 readLearningState 返回 undefined；getOrDefault(undefined) 返回 design.md 规定默认值', async () => {
    await fc.assert(
      fc.asyncProperty(arbId(20), arbId(20), async (bankId, qid) => {
        // 每次 fc 迭代独立重置整个 memfs 卷，避免上一轮残留的 learning.json
        // 影响本轮的"未写入"前提。`reset` 同时重新创建 globalStorageRoot。
        harness.reset();

        const store = makeStore();

        // -- 子断言 1：未写入时 readLearningState 返回 undefined --
        const got = await store.readLearningState(bankId, qid);
        expect(got).toBeUndefined();

        // -- 子断言 2：getOrDefault(undefined) 返回 design.md 规定的默认 LearningState --
        const def: LearningState = getOrDefault(undefined);
        expect(def.mastery).toBe('unlearned');
        expect(def.favoriteFlag).toBe(false);
        expect(def.wrongFlag).toBe(false);
        expect(def.hasNote).toBe(false);

        // `lastPracticedAt`：在 `exactOptionalPropertyTypes: true` 下，缺省实现
        // 选择 **省略** 该可选键；design.md 用 `lastPracticedAt: undefined`
        // 表达 "未练习过" 的语义。两种形态都满足规范，因此本测试接受任意一种：
        //   a) 键不存在（`'lastPracticedAt' in def === false`），或
        //   b) 键存在但值为 undefined（`def.lastPracticedAt === undefined`）。
        const hasKey = Object.prototype.hasOwnProperty.call(def, 'lastPracticedAt');
        if (hasKey) {
          expect(def.lastPracticedAt).toBeUndefined();
        } else {
          // 显式断言键缺失这条路径在每次迭代里也走到 expect，避免静默通过。
          expect(hasKey).toBe(false);
        }

        // 进一步：`def` 不应携带任何 design.md 默认值之外的字段，避免 future
        // 实现引入未声明的副字段而绕过本断言。
        const allowedKeys = new Set([
          'mastery',
          'favoriteFlag',
          'wrongFlag',
          'hasNote',
          'lastPracticedAt',
        ]);
        for (const k of Object.keys(def)) {
          expect(allowedKeys.has(k)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
