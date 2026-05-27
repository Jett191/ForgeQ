/**
 * EXAMPLE - BankStore 写读 / tmp 残留清理（Task 10.2）
 *
 * 验证 `BankStore` 在两条核心契约上的 happy path 与失败路径：
 *
 *   1. **写入再读结果深度等价**：`writeBankAtomic(bankId, bank)` 之后
 *      `readBank(bankId)` 返回的对象与原 `bank` 在字段集与字段值上完全相等
 *      （含 discriminated union 的子类型可选字段）；同时 `bankExists` 反映
 *      最新状态、`schema-version` 文件被写为当前布局版本号。
 *   2. **写入失败后 tmp 目录被清理**：在 `writeBankAtomic` 中途注入 FS 错误
 *      （`schema-version` 的初始 writeFile 失败），错误透出后 `<bankId>.tmp/`
 *      目录被 catch 块的 `safeDelete` 清掉、`<bankId>/` 最终目录从未被创建；
 *      后续重试同一 bankId 能成功且读出的内容是 retry 的 bank（不会被失败那次
 *      的部分写入污染）。
 *
 * 此外补充两条小型保护性场景：
 *   - 多 bankId 之间互不干扰（写 A 不影响 B）。
 *   - 进入 `writeBankAtomic` 时如果磁盘上已经存在历史 `<bankId>.tmp/` 残留
 *     （前一次进程在 rename 之前 crash 留下），新写入仍能成功，且产物里不
 *     混入残留内容。
 *
 * 实现要点：
 *   - 沿用 `trash.example.test.ts` 中已验证可行的 `vi.hoisted` + async 动态
 *     import 模式构造同一份 harness 实例，避免在 hoisted 工厂里 `require`
 *     TypeScript 源（vitest CJS 解析器无法解析 `.js` 后缀指向的 `.ts` 文件）。
 *   - 用 `harness.failNext({ op: 'writeFile', pathPattern: ... })` 精确控制
 *     失败时机；`schema-version.tmp` 这条匹配让失败点恰好落在 "bank.json
 *     已经写到 tmp 目录之后、目录晋升之前"，从而真正考察 catch 块的清理逻辑
 *     是否覆盖了已经创建的 tmp 子文件。
 *
 * **Validates: Requirements 11.6**
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemFsHarness } from '../harness/memFsHarness.js';

// `vi.mock` 工厂在 vitest 运行时被提升到文件顶部，普通的顶层 const 在那一刻
// 还没有完成初始化（会触发 "Cannot access 'harness' before initialization"）。
// 解法：用 `vi.hoisted` 让 harness 的构造也被提升；factory 写成 async + 动态
// import 以避开 require 在 TS 源上的解析问题，返回值是 `Promise<...>`，避免在
// 模块顶层使用 `await`（Node16 module 模式下不允许）。
const hoistedHarness = vi.hoisted(async () => {
  const mod = await import('../harness/memFsHarness.js');
  return mod.createMemFsHarness();
});

// `BankStore` / `atomicFs` 在运行时 `import * as vscode from 'vscode'`，因此
// 必须在所有真实模块的 import 之前完成 mock 替换。`vi.mock` 工厂同样被 hoist，
// 但运行顺序晚于 `vi.hoisted`，因此可以安全地 `await hoistedHarness`。
vi.mock('vscode', async () => {
  const mod = await import('../harness/memFsHarness.js');
  const harness = await hoistedHarness;
  return mod.createVscodeModuleMock(harness);
});

// 注：mock 必须先于真实模块的 import；下面这些 import 才能拿到桩实现。
// eslint-disable-next-line import/first
import { HarnessFileSystemError, HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { BANK_SCHEMA_VERSION, BankStore } from '../../src/storage/bankStore.js';
// eslint-disable-next-line import/first
import type { QuestionBank } from '../../src/types/question.js';

// 测试体中需要同步访问 harness。`beforeAll` 在所有 it 之前 await 一次拿到
// 同一份实例，赋给本 module 的 `harness` 变量。`!:` 让 TS 信任 beforeAll
// 的 setup 总会执行成功（vitest 在每个 describe 块进入前 await beforeAll）。
let harness!: MemFsHarness;

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

/**
 * 构造一个 "形态丰富" 的 QuestionBank：包含 code / qa 两类题，code 题带
 * 全部可选 union 字段（language / initialCode / codeTemplate / referenceCode /
 * testCases / solutionExplanation），qa 题带 keywords / briefAnswer /
 * detailedAnswer / followUps，以确保 round-trip 等价断言不会因为某个字段在
 * `JSON.stringify` 后丢失而漏检。
 */
function makeRichBank(suffix = ''): QuestionBank {
  return {
    name: `bank-${suffix || 'default'}`,
    version: '1.0.0',
    questions: [
      {
        id: `code-q-${suffix || '1'}`,
        type: 'code',
        title: 'Reverse a linked list',
        content: '请翻转链表',
        category: 'data-structure',
        tags: ['list', 'pointer'],
        difficulty: 'medium',
        answer: 'function reverse(head) { /* ... */ }',
        language: 'javascript',
        initialCode: 'function reverse(head) {}',
        codeTemplate: 'function reverse(head) {}',
        referenceCode: 'function reverse(head) { /* impl */ }',
        testCases: [
          { name: 'empty', input: '[]', expected: '[]', description: 'empty list' },
          { name: 'single', input: '[1]', expected: '[1]' },
        ],
        solutionExplanation: '迭代反转',
      },
      {
        id: `qa-q-${suffix || '1'}`,
        type: 'qa',
        title: 'CSS 盒模型',
        content: '请描述 CSS 盒模型',
        category: 'css',
        tags: ['box-model'],
        difficulty: 'easy',
        answer: 'content + padding + border + margin',
        keywords: ['content', 'padding', 'border', 'margin'],
        briefAnswer: 'content + padding + border + margin',
        detailedAnswer: '详细描述...',
        followUps: [
          { question: 'box-sizing 影响是什么', answer: 'border-box 与 content-box 的差异' },
          { question: '什么时候用 border-box' },
        ],
      },
    ],
  };
}

/**
 * 一个最简单的 QuestionBank：仅含必填字段，确保 round-trip 在最小形态下也成立。
 */
function makeMinimalBank(suffix = 'min'): QuestionBank {
  return {
    name: `minimal-${suffix}`,
    version: '0.1.0',
    questions: [
      {
        id: `q-${suffix}`,
        type: 'qa',
        title: 'q',
        content: '',
        category: 'misc',
        tags: [],
        difficulty: 'easy',
        answer: 'a',
      },
    ],
  };
}

/** 把整段文本内容写入指定 URI（用于构造历史残留）。 */
async function writeText(uri: HarnessUri, text: string): Promise<void> {
  await harness.workspaceFs.writeFile(uri, new TextEncoder().encode(text));
}

/** 判断指定 URI 是否存在（任何 FileNotFound 错误都视为不存在）。 */
async function exists(uri: HarnessUri): Promise<boolean> {
  try {
    await harness.workspaceFs.stat(uri);
    return true;
  } catch (err) {
    if (err instanceof HarnessFileSystemError && err.code === 'FileNotFound') {
      return false;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BankStore', () => {
  beforeAll(async () => {
    harness = await hoistedHarness;
  });

  beforeEach(() => {
    harness.reset();
  });

  describe('writeBankAtomic + readBank: 写入再读深度等价', () => {
    it('写入后再读结果在字段集与字段值上完全相等（含 discriminated union 子字段）', async () => {
      const banksRoot = HarnessUri.joinPath(harness.globalStorageUri, 'banks');
      await harness.workspaceFs.createDirectory(banksRoot);
      const store = new BankStore(banksRoot);

      const bankId = '5e1a7f5a-1b34-4c2c-8e9b-3f8b9a2a7b41';
      const original = makeRichBank('rich');

      await store.writeBankAtomic(bankId, original);

      const readBack = await store.readBank(bankId);

      // 用 toEqual 做结构等价；同时显式检查各 union 子字段不会在 JSON 序列化
      // 反序列化中丢失（toEqual 已经覆盖，但单独 assert 让回归点更具诊断性）。
      expect(readBack).toEqual(original);
      expect(readBack).not.toBe(original); // readBack 必须是从磁盘 JSON 重建的新对象
      const codeQ = readBack.questions[0];
      const originalCodeQ = original.questions[0];
      expect(codeQ?.type).toBe('code');
      expect(originalCodeQ?.type).toBe('code');
      if (codeQ?.type === 'code' && originalCodeQ?.type === 'code') {
        expect(codeQ.testCases).toHaveLength(2);
        // 显式确认每个 union 子字段都从磁盘 round-trip 回来；这条 sanity 在
        // toEqual 已经覆盖的基础上提供更具诊断性的回归点。
        expect(codeQ.referenceCode).toBe(originalCodeQ.referenceCode);
        expect(codeQ.solutionExplanation).toBe(originalCodeQ.solutionExplanation);
        expect(codeQ.language).toBe(originalCodeQ.language);
      }
      const qaQ = readBack.questions[1];
      expect(qaQ?.type).toBe('qa');
      if (qaQ?.type === 'qa') {
        expect(qaQ.followUps).toHaveLength(2);
      }

      // bankExists 应反映已存在；schema-version 文件内容应为当前布局版本号。
      expect(await store.bankExists(bankId)).toBe(true);
      const schemaVersionUri = HarnessUri.joinPath(banksRoot, bankId, 'schema-version');
      const schemaText = new TextDecoder('utf-8').decode(
        await harness.workspaceFs.readFile(schemaVersionUri),
      );
      expect(schemaText).toBe(BANK_SCHEMA_VERSION);

      // 成功路径上 tmp 目录应该已经被晋升而不是残留。
      const tmpUri = HarnessUri.joinPath(banksRoot, `${bankId}.tmp`);
      expect(await exists(tmpUri)).toBe(false);
    });

    it('最小形态 bank 也能 round-trip', async () => {
      const banksRoot = HarnessUri.joinPath(harness.globalStorageUri, 'banks');
      await harness.workspaceFs.createDirectory(banksRoot);
      const store = new BankStore(banksRoot);

      const bankId = 'minimal-bank';
      const original = makeMinimalBank('m1');

      await store.writeBankAtomic(bankId, original);
      const readBack = await store.readBank(bankId);

      expect(readBack).toEqual(original);
    });

    it('多 bankId 之间互不干扰：写 A 后写 B，A 与 B 的读取相互独立', async () => {
      const banksRoot = HarnessUri.joinPath(harness.globalStorageUri, 'banks');
      await harness.workspaceFs.createDirectory(banksRoot);
      const store = new BankStore(banksRoot);

      const bankA = makeRichBank('A');
      const bankB = makeMinimalBank('B');

      await store.writeBankAtomic('bank-A', bankA);
      await store.writeBankAtomic('bank-B', bankB);

      expect(await store.readBank('bank-A')).toEqual(bankA);
      expect(await store.readBank('bank-B')).toEqual(bankB);
      expect(await store.bankExists('bank-A')).toBe(true);
      expect(await store.bankExists('bank-B')).toBe(true);

      // 不存在的 bankId 报告为 false（不抛错）。
      expect(await store.bankExists('bank-not-installed')).toBe(false);
    });
  });

  describe('writeBankAtomic 失败后清理 tmp 目录', () => {
    it('schema-version 写入失败时：<bankId>.tmp 被清理、<bankId>/ 不会出现、错误透出', async () => {
      const banksRoot = HarnessUri.joinPath(harness.globalStorageUri, 'banks');
      await harness.workspaceFs.createDirectory(banksRoot);
      const store = new BankStore(banksRoot);

      const bankId = 'failing-bank';
      const original = makeRichBank('failing');

      // 注入精确失败：第二个文件 `schema-version` 的初始 writeFile 阶段抛错。
      // 这一刻 bank.json 已经被 writeAtomicJson 成功写入到 <bankId>.tmp/，
      // 因此 catch 块的 safeDelete(<bankId>.tmp) 必须做实质性的递归删除工作。
      const expectedError = new HarnessFileSystemError(
        'NoPermissions',
        'simulated permissions failure on schema-version.tmp',
      );
      harness.failNext({
        op: 'writeFile',
        pathPattern: /\/schema-version\.tmp$/,
        error: expectedError,
      });

      await expect(store.writeBankAtomic(bankId, original)).rejects.toBe(expectedError);

      // 关键断言：<bankId>.tmp/ 已被 catch 块的 safeDelete 清理，无残留。
      const tmpDirUri = HarnessUri.joinPath(banksRoot, `${bankId}.tmp`);
      expect(await exists(tmpDirUri)).toBe(false);

      // 最终目录从未被晋升，因此也不存在；bankExists 反映为 false。
      const finalDirUri = HarnessUri.joinPath(banksRoot, bankId);
      expect(await exists(finalDirUri)).toBe(false);
      expect(await store.bankExists(bankId)).toBe(false);

      // banks 根目录除了基础结构外不应残留任何与 bankId 相关的条目。
      const rootEntries = (await harness.workspaceFs.readDirectory(banksRoot)).map(
        ([name]) => name,
      );
      expect(rootEntries).not.toContain(bankId);
      expect(rootEntries).not.toContain(`${bankId}.tmp`);
    });

    it('失败后重试同一 bankId 能成功，读出的内容来自重试这一次（不被前次部分写入污染）', async () => {
      const banksRoot = HarnessUri.joinPath(harness.globalStorageUri, 'banks');
      await harness.workspaceFs.createDirectory(banksRoot);
      const store = new BankStore(banksRoot);

      const bankId = 'retryable-bank';
      const firstAttempt = makeRichBank('first');
      const retryAttempt = makeMinimalBank('retry');

      // 第 1 步：注入失败，writeBankAtomic 应抛错并清理。
      harness.failNext({
        op: 'writeFile',
        pathPattern: /\/schema-version\.tmp$/,
      });
      await expect(store.writeBankAtomic(bankId, firstAttempt)).rejects.toBeDefined();

      // 第 2 步：清理失败规则后重试，应当成功并读到 retryAttempt 的内容。
      harness.clearFailures();
      await store.writeBankAtomic(bankId, retryAttempt);

      const readBack = await store.readBank(bankId);
      expect(readBack).toEqual(retryAttempt);
      // 显式确认未被前次的 firstAttempt 污染。
      expect(readBack).not.toEqual(firstAttempt);
    });

    it('进入 writeBankAtomic 时存在历史 <bankId>.tmp 残留：先清残留，再正常写入', async () => {
      const banksRoot = HarnessUri.joinPath(harness.globalStorageUri, 'banks');
      await harness.workspaceFs.createDirectory(banksRoot);
      const store = new BankStore(banksRoot);

      const bankId = 'with-stale-tmp';
      const tmpDirUri = HarnessUri.joinPath(banksRoot, `${bankId}.tmp`);

      // 模拟一次进程在 rename 之前 crash：tmp 目录里残留旧内容。
      await harness.workspaceFs.createDirectory(tmpDirUri);
      await writeText(HarnessUri.joinPath(tmpDirUri, 'bank.json'), '{"stale":true}');
      await writeText(HarnessUri.joinPath(tmpDirUri, 'leftover.txt'), 'should be wiped');

      const fresh = makeMinimalBank('fresh');
      await store.writeBankAtomic(bankId, fresh);

      // 1. 读到的是新写入的内容，不含 stale 字段。
      const readBack = await store.readBank(bankId);
      expect(readBack).toEqual(fresh);

      // 2. tmp 目录在晋升后不应再存在（renameDirAtomic 已把它移走）。
      expect(await exists(tmpDirUri)).toBe(false);

      // 3. 最终目录里不应残留意外的 leftover.txt（说明 step 1 的入口清理生效）。
      const finalDirUri = HarnessUri.joinPath(banksRoot, bankId);
      const entries = (await harness.workspaceFs.readDirectory(finalDirUri))
        .map(([name]) => name)
        .sort();
      expect(entries).toEqual(['bank.json', 'schema-version']);
    });
  });
});
