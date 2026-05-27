// Feature: frontend-interview-practice, Property 17: 覆盖导入安全切换语义
//
// 验证 installBank 的成功路径（currentBankId 更新、旧 bank 不可见）以及
// 失败注入 Phase 1/2/3（旧 bank 完整保持不变）。
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
import { Storage } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import { InstallBankError } from '../../src/storage/installBank.js';
// eslint-disable-next-line import/first
import { arbQuestionBank } from '../generators.js';
// eslint-disable-next-line import/first
import type { QuestionBank } from '../../src/types/question.js';

const NUM_RUNS = 100;

describe('Property 17: 覆盖导入安全切换语义', () => {
  it('installBank success: currentBankId updates, new bank in list', async () => {
    await fc.assert(
      fc.asyncProperty(arbQuestionBank, async (bank: QuestionBank) => {
        harness.reset();

        const ctx = harness.createExtensionContext();
        const storage = await Storage.create(ctx as any);
        await storage.bootstrap();

        const summary = await storage.installBank(bank);

        // currentBankId in meta should be the new bank
        const meta = storage.getCurrentMeta();
        expect(meta.currentBankId).toBe(summary.id);

        // New bank should be in the list
        expect(meta.banks.some((b) => b.id === summary.id)).toBe(true);
        expect(summary.name).toBe(bank.name);
        expect(summary.version).toBe(bank.version);
        expect(summary.questionCount).toBe(bank.questions.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('installBank success with existing bank: old bank removed from list', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbQuestionBank,
        arbQuestionBank,
        async (bankA: QuestionBank, bankB: QuestionBank) => {
          harness.reset();

          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);
          await storage.bootstrap();

          // Install first bank
          const summaryA = await storage.installBank(bankA);
          expect(storage.getCurrentMeta().currentBankId).toBe(summaryA.id);

          // Install second bank (overwrite)
          const summaryB = await storage.installBank(bankB);

          const meta = storage.getCurrentMeta();
          // currentBankId should be the new bank
          expect(meta.currentBankId).toBe(summaryB.id);
          // Old bank should not be in list
          expect(meta.banks.some((b) => b.id === summaryA.id)).toBe(false);
          // New bank should be in list
          expect(meta.banks.some((b) => b.id === summaryB.id)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('installBank Phase 1 failure: old bank stays intact', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbQuestionBank,
        arbQuestionBank,
        async (bankA: QuestionBank, bankB: QuestionBank) => {
          harness.reset();

          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);
          await storage.bootstrap();

          // Install first bank successfully
          const summaryA = await storage.installBank(bankA);
          const metaBefore = storage.getCurrentMeta();

          // Inject failure for Phase 1 (writeFile during writeBankAtomic)
          harness.failNext({ op: 'writeFile', once: true });

          let caught: unknown;
          try {
            await storage.installBank(bankB);
          } catch (err) {
            caught = err;
          }

          expect(caught).toBeInstanceOf(InstallBankError);
          const installErr = caught as InstallBankError;
          expect(installErr.phase).toBe(1);

          // Old bank still intact
          const metaAfter = storage.getCurrentMeta();
          expect(metaAfter.currentBankId).toBe(summaryA.id);
          expect(metaAfter.banks.some((b) => b.id === summaryA.id)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('installBank Phase 2 failure: old bank stays intact', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbQuestionBank,
        arbQuestionBank,
        async (bankA: QuestionBank, bankB: QuestionBank) => {
          harness.reset();

          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);
          await storage.bootstrap();

          // Install first bank successfully
          const summaryA = await storage.installBank(bankA);

          // Inject failure for Phase 2 (createDirectory for user-data)
          harness.failNext({ op: 'createDirectory', once: true });

          let caught: unknown;
          try {
            await storage.installBank(bankB);
          } catch (err) {
            caught = err;
          }

          expect(caught).toBeInstanceOf(InstallBankError);
          const installErr = caught as InstallBankError;
          expect(installErr.phase).toBe(2);

          // Old bank still intact
          const metaAfter = storage.getCurrentMeta();
          expect(metaAfter.currentBankId).toBe(summaryA.id);
          expect(metaAfter.banks.some((b) => b.id === summaryA.id)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('installBank Phase 3 failure: old bank stays intact', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbQuestionBank,
        arbQuestionBank,
        async (bankA: QuestionBank, bankB: QuestionBank) => {
          harness.reset();

          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);
          await storage.bootstrap();

          // Install first bank successfully
          const summaryA = await storage.installBank(bankA);

          // Inject failure for Phase 3: target both rename and copy on meta.json path.
          // writeAtomicBytes tries rename first, then falls back to copy;
          // we need both to fail so the write actually throws.
          harness.failNext({
            op: 'rename',
            pathPattern: /meta\.json/,
            once: true,
          });
          harness.failNext({
            op: 'copy',
            pathPattern: /meta\.json/,
            once: true,
          });

          let caught: unknown;
          try {
            await storage.installBank(bankB);
          } catch (err) {
            caught = err;
          }

          expect(caught).toBeInstanceOf(InstallBankError);
          const installErr = caught as InstallBankError;
          expect(installErr.phase).toBe(3);

          // Old bank still intact: read meta from disk via fresh Storage
          harness.clearFailures();
          const freshStorage = await Storage.create(ctx as any);
          const state = await freshStorage.bootstrap();
          expect(state.meta.currentBankId).toBe(summaryA.id);
          expect(state.meta.banks.some((b) => b.id === summaryA.id)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
