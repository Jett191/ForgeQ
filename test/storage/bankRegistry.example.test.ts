import { beforeEach, describe, expect, it, vi } from 'vitest';

const { harness } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return { harness: mod.createMemFsHarness() };
});

vi.mock('vscode', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return mod.createVscodeModuleMock(harness);
});

// eslint-disable-next-line import/first
import { BankRegistry } from '../../src/storage/bankRegistry.js';
// eslint-disable-next-line import/first
import { Storage } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import type { BankMeta } from '../../src/types/bankMeta.js';
// eslint-disable-next-line import/first
import type { QuestionBank } from '../../src/types/question.js';

const BANK: QuestionBank = {
  name: 'Bank',
  version: '1',
  questions: [
    {
      id: 'q1',
      type: 'qa',
      title: 'Question',
      content: '',
      category: 'General',
      tags: [],
      difficulty: 'easy',
      answer: 'Answer',
    },
  ],
};

describe('BankRegistry switchTo', () => {
  beforeEach(() => harness.reset());

  it('keeps persisted meta, Storage memory, registry and globalState aligned', async () => {
    const ctx = harness.createExtensionContext();
    const storage = await Storage.create(ctx as any);
    const meta: BankMeta = {
      schemaVersion: 1,
      currentBankId: 'bank-1',
      banks: [
        { id: 'bank-1', name: 'One', version: '1', questionCount: 0, importedAt: 1 },
        { id: 'bank-2', name: 'Two', version: '1', questionCount: 0, importedAt: 2 },
      ],
    };
    await storage.meta.writeAtomic(meta);
    await storage.bootstrap();
    const registry = new BankRegistry(storage, ctx.globalState);

    await registry.switchTo('bank-2');

    expect((await storage.meta.read()).currentBankId).toBe('bank-2');
    expect(storage.getCurrentMeta().currentBankId).toBe('bank-2');
    expect(registry.current()?.id).toBe('bank-2');
    expect(ctx.globalState.get('fip:currentBankId')).toBe('bank-2');
  });

  it('deleting the current bank selects the most recently imported remaining bank', async () => {
    const ctx = harness.createExtensionContext();
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();
    const registry = new BankRegistry(storage, ctx.globalState);

    const first = await registry.install({ ...BANK, name: 'First' });
    await storage.userData.writeLearningState(first.id, 'q1', {
      mastery: 'not_mastered',
      favoriteFlag: true,
      wrongFlag: false,
      hasNote: false,
    });
    const second = await registry.install({ ...BANK, name: 'Second' });
    expect(registry.list()).toHaveLength(2);
    expect(registry.current()?.id).toBe(second.id);
    expect(await storage.userData.readLearningState(first.id, 'q1')).toMatchObject({
      mastery: 'not_mastered',
      favoriteFlag: true,
    });

    await registry.remove(second.id);

    expect(registry.list().map((bank) => bank.id)).toEqual([first.id]);
    expect(registry.current()?.id).toBe(first.id);
    expect(ctx.globalState.get('fip:currentBankId')).toBe(first.id);
    expect(await storage.banks.bankExists(first.id)).toBe(true);
    expect(await storage.userData.readLearningState(first.id, 'q1')).toMatchObject({
      mastery: 'not_mastered',
      favoriteFlag: true,
    });
  });

  it('deleting the last bank clears the current selection', async () => {
    const ctx = harness.createExtensionContext();
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();
    const registry = new BankRegistry(storage, ctx.globalState);

    const only = await registry.install(BANK);
    await registry.remove(only.id);

    expect(registry.list()).toEqual([]);
    expect(registry.current()).toBeUndefined();
    expect(ctx.globalState.get('fip:currentBankId')).toBeUndefined();
  });
});
