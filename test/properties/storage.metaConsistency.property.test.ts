// Feature: frontend-interview-practice, Property 18: meta.json 与 globalState.currentBankId 最终一致
//
// 验证 bootstrap 阶段把 globalState 与 meta.json 对齐（meta.json 为真理源）：
//   - 不一致时以 meta.json 为准修正 globalState
//   - 一致时保持不变
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
import { GLOBAL_STATE_CURRENT_BANK_ID, Storage } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import { MetaStore } from '../../src/storage/metaStore.js';
// eslint-disable-next-line import/first
import type { BankMeta, BankSummary } from '../../src/types/bankMeta.js';

const NUM_RUNS = 100;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

const arbBankId: fc.Arbitrary<string> = fc.string({
  minLength: 5,
  maxLength: 20,
  unit: fc.constantFrom(...ID_ALPHABET),
});

/** Generate a simple BankSummary for a given id */
function makeSummary(id: string): BankSummary {
  return {
    id,
    name: `Bank-${id}`,
    version: '1.0.0',
    questionCount: 10,
    importedAt: Date.now(),
  };
}

describe('Property 18: meta.json 与 globalState.currentBankId 最终一致', () => {
  it('bootstrap resolves inconsistency: globalState is synced to meta.json value', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbBankId,
        async (metaBankId, gsBankId) => {
          harness.reset();

          // Write a meta.json with currentBankId = metaBankId
          const metaUri = HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
          const meta: BankMeta = {
            schemaVersion: 1,
            currentBankId: metaBankId,
            banks: [makeSummary(metaBankId)],
          };
          await harness.workspaceFs.writeFile(
            metaUri,
            new TextEncoder().encode(JSON.stringify(meta, null, 2)),
          );

          // Write bank.json for the bank so bootstrap can load it
          const bankDir = HarnessUri.joinPath(
            harness.globalStorageUri,
            'banks',
            metaBankId,
          );
          await harness.workspaceFs.createDirectory(bankDir);
          const bankJsonUri = HarnessUri.joinPath(bankDir, 'bank.json');
          const bankData = { name: `Bank-${metaBankId}`, version: '1.0.0', questions: [{ id: 'q1', type: 'qa', title: 'T', content: 'C', category: 'Cat', tags: [], difficulty: 'easy', answer: 'A' }] };
          await harness.workspaceFs.writeFile(
            bankJsonUri,
            new TextEncoder().encode(JSON.stringify(bankData)),
          );

          // Set globalState to a different value
          await harness.globalState.update(GLOBAL_STATE_CURRENT_BANK_ID, gsBankId);

          // Bootstrap should sync globalState to meta.json value
          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);
          await storage.bootstrap();

          // After bootstrap, globalState should match meta.json
          const gsValue = harness.globalState.get<string>(GLOBAL_STATE_CURRENT_BANK_ID);
          expect(gsValue).toBe(metaBankId);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('bootstrap with no currentBankId in meta clears globalState', async () => {
    await fc.assert(
      fc.asyncProperty(arbBankId, async (gsBankId) => {
        harness.reset();

        // Write meta.json without currentBankId
        const metaUri = HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
        const meta: BankMeta = {
          schemaVersion: 1,
          banks: [],
        };
        await harness.workspaceFs.writeFile(
          metaUri,
          new TextEncoder().encode(JSON.stringify(meta, null, 2)),
        );

        // Set globalState to some value
        await harness.globalState.update(GLOBAL_STATE_CURRENT_BANK_ID, gsBankId);

        // Bootstrap should clear globalState
        const ctx = harness.createExtensionContext();
        const storage = await Storage.create(ctx as any);
        await storage.bootstrap();

        const gsValue = harness.globalState.get<string>(GLOBAL_STATE_CURRENT_BANK_ID);
        expect(gsValue).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('meta.json is always the source of truth after installBank + bootstrap', async () => {
    await fc.assert(
      fc.asyncProperty(arbBankId, async (gsBankId) => {
        harness.reset();

        const ctx = harness.createExtensionContext();
        const storage = await Storage.create(ctx as any);
        await storage.bootstrap();

        // Install a bank
        const bank = { name: 'Test', version: '1.0.0', questions: [{ id: 'q1', type: 'qa' as const, title: 'T', content: 'C', category: 'Cat', tags: [] as string[], difficulty: 'easy' as const, answer: 'A' }] };
        const summary = await storage.installBank(bank);

        // Corrupt globalState by setting a wrong value
        await harness.globalState.update(GLOBAL_STATE_CURRENT_BANK_ID, gsBankId);

        // Re-bootstrap: should fix globalState
        const storage2 = await Storage.create(ctx as any);
        await storage2.bootstrap();

        const gsValue = harness.globalState.get<string>(GLOBAL_STATE_CURRENT_BANK_ID);
        expect(gsValue).toBe(summary.id);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
