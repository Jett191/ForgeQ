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
});
