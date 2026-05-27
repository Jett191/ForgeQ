// Feature: frontend-interview-practice, Property 9: LocalFileStorage Round-Trip（多 bank 隔离）
//
// 验证 Storage 系列的 read/write round-trip：
//   - LearningState: writeLearningState → readLearningState 返回同一值
//   - Practice content: writePracticeContent → readPracticeContent 返回同一值
//   - Notes: writeNote → readNote 返回同一值
//   - 多 bank 隔离：不同 bankId 的数据互不干扰
//
// numRuns: 100

import { describe, expect, it, vi } from 'vitest';

const { harness } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return { harness: mod.createMemFsHarness() };
});

vi.mock('vscode', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return mod.createVscodeModuleMock(harness);
});

// eslint-disable-next-line import/first
import * as fc from 'fast-check';
// eslint-disable-next-line import/first
import { HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { UserDataStore } from '../../src/storage/userDataStore.js';
// eslint-disable-next-line import/first
import { arbLearningState, arbMasteryStatus } from '../generators.js';
// eslint-disable-next-line import/first
import type { LearningState } from '../../src/types/learning.js';

// ---------------------------------------------------------------------------
// 本地生成器
// ---------------------------------------------------------------------------

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('');

const arbBankId: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...ID_ALPHABET),
});

const arbQid: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...ID_ALPHABET),
});

const arbContent: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 500,
});

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// 属性测试
// ---------------------------------------------------------------------------

describe('Property 9: LocalFileStorage Round-Trip（多 bank 隔离）', () => {
  it('writeLearningState → readLearningState round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbLearningState,
        async (bankId, qid, state) => {
          harness.reset();
          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          await store.writeLearningState(bankId, qid, state);
          const readBack = await store.readLearningState(bankId, qid);

          expect(readBack).toEqual(state);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('writePracticeContent → readPracticeContent round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbContent,
        async (bankId, qid, content) => {
          harness.reset();
          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          await store.writePracticeContent(bankId, qid, 'code', '.ts', content);
          const readBack = await store.readPracticeContent(bankId, qid, 'code', '.ts');

          expect(readBack).toBe(content);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('writeNote → readNote round-trip (non-empty)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        fc.string({ minLength: 1, maxLength: 500 }),
        async (bankId, qid, note) => {
          harness.reset();
          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          await store.writeNote(bankId, qid, note);
          const readBack = await store.readNote(bankId, qid);

          expect(readBack).toBe(note);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('multi-bank isolation: different bankIds have independent learning state', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbBankId.filter((s) => s.length > 1),
        arbQid,
        arbLearningState,
        arbLearningState,
        async (bankIdA, bankIdSuffix, qid, stateA, stateB) => {
          // Ensure bankIds are different
          const bankIdB = bankIdA === bankIdSuffix ? `${bankIdSuffix}x` : bankIdSuffix;
          if (bankIdA === bankIdB) return; // skip if still equal

          harness.reset();
          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          await store.writeLearningState(bankIdA, qid, stateA);
          await store.writeLearningState(bankIdB, qid, stateB);

          const readA = await store.readLearningState(bankIdA, qid);
          const readB = await store.readLearningState(bankIdB, qid);

          expect(readA).toEqual(stateA);
          expect(readB).toEqual(stateB);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('persistence across store instances (reload from disk)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbLearningState,
        async (bankId, qid, state) => {
          harness.reset();
          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');

          // Write with first instance
          const store1 = new UserDataStore(baseUri, { debounceMs: 0 });
          await store1.writeLearningState(bankId, qid, state);

          // Read with fresh instance (simulates extension restart)
          const store2 = new UserDataStore(baseUri, { debounceMs: 0 });
          const readBack = await store2.readLearningState(bankId, qid);

          expect(readBack).toEqual(state);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
