// Feature: frontend-interview-practice, Property 12: Toggle Favorite 对合
//
// 验证 toggle favorite 的对合性质：
//   - 偶数次 toggle 恢复原始 favoriteFlag
//   - 奇数次 toggle 翻转 favoriteFlag
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
import { Storage } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import { arbLearningState } from '../generators.js';
// eslint-disable-next-line import/first
import type { LearningState } from '../../src/types/learning.js';

const NUM_RUNS = 100;

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

/** Toggle the favoriteFlag on a LearningState */
function toggleFavorite(state: LearningState): LearningState {
  return { ...state, favoriteFlag: !state.favoriteFlag };
}

describe('Property 12: Toggle Favorite 对合', () => {
  it('even toggles restore original favoriteFlag, odd toggles flip it', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbLearningState,
        fc.integer({ min: 1, max: 10 }),
        async (bankId, qid, initialState, toggleCount) => {
          harness.reset();

          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          // Write initial state
          await store.writeLearningState(bankId, qid, initialState);

          // Toggle `toggleCount` times
          let current = initialState;
          for (let i = 0; i < toggleCount; i++) {
            current = toggleFavorite(current);
            await store.writeLearningState(bankId, qid, current);
          }

          // Read back from store
          const readBack = await store.readLearningState(bankId, qid);
          expect(readBack).toBeDefined();

          // Verify involution property
          if (toggleCount % 2 === 0) {
            // Even toggles: favoriteFlag restored to original
            expect(readBack!.favoriteFlag).toBe(initialState.favoriteFlag);
          } else {
            // Odd toggles: favoriteFlag flipped
            expect(readBack!.favoriteFlag).toBe(!initialState.favoriteFlag);
          }

          // Other fields unchanged
          expect(readBack!.mastery).toBe(initialState.mastery);
          expect(readBack!.wrongFlag).toBe(initialState.wrongFlag);
          expect(readBack!.hasNote).toBe(initialState.hasNote);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('toggle favorite round-trips through writeWithRollback', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbLearningState,
        async (bankId, qid, initialState) => {
          harness.reset();

          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);

          // Write initial state
          await store.writeLearningState(bankId, qid, initialState);

          // Toggle via writeWithRollback
          const next = toggleFavorite(initialState);
          let memoryValue: LearningState = initialState;

          const result = await storage.writeWithRollback<LearningState>({
            prev: initialState,
            next,
            applyMemory: (v) => { memoryValue = v; },
            persist: async () => {
              await store.writeLearningState(bankId, qid, next);
            },
            onRollback: (v) => { memoryValue = v; },
            path: `learning/${bankId}/${qid}`,
          });

          expect(result.ok).toBe(true);
          expect(memoryValue.favoriteFlag).toBe(!initialState.favoriteFlag);

          // Verify persistence
          const readBack = await store.readLearningState(bankId, qid);
          expect(readBack!.favoriteFlag).toBe(!initialState.favoriteFlag);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('toggle favorite with persist failure: memory rolls back', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbLearningState,
        async (bankId, qid, initialState) => {
          harness.reset();

          const baseUri = HarnessUri.joinPath(harness.globalStorageUri, 'user-data');
          const store = new UserDataStore(baseUri, { debounceMs: 0 });

          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);

          // Write initial state
          await store.writeLearningState(bankId, qid, initialState);

          // Toggle via writeWithRollback, but inject failure
          const next = toggleFavorite(initialState);
          let memoryValue: LearningState = initialState;

          harness.failNext({ op: 'writeFile', once: true });

          const result = await storage.writeWithRollback<LearningState>({
            prev: initialState,
            next,
            applyMemory: (v) => { memoryValue = v; },
            persist: async () => {
              await store.writeLearningState(bankId, qid, next);
            },
            onRollback: (v) => { memoryValue = v; },
            path: `learning/${bankId}/${qid}`,
          });

          expect(result.ok).toBe(false);
          // Memory should be rolled back to original
          expect(memoryValue.favoriteFlag).toBe(initialState.favoriteFlag);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
