/**
 * EXAMPLE - Storage.bootstrap 异常场景（Task 13.7）
 *
 * 覆盖：
 *   1. meta.json 损坏 -> 进入安全模式（isSafeMode === true）
 *   2. meta.json.tmp 残留在启动期被清理
 *   3. 重启恢复：安全模式后重新写入合法 meta 可以正常恢复
 *
 * Validates: Requirements 11.5（损坏自愈 / 安全模式 / 不删除底层数据）
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { Storage } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import type { BankMeta } from '../../src/types/bankMeta.js';

/** 直接向 memfs 写入文本。 */
async function rawWriteText(uri: HarnessUri, text: string): Promise<void> {
  await harness.workspaceFs.writeFile(uri, new TextEncoder().encode(text));
}

/** 判断 URI 在 memfs 上是否存在。 */
async function exists(uri: HarnessUri): Promise<boolean> {
  try {
    await harness.workspaceFs.stat(uri);
    return true;
  } catch (err: any) {
    if (err?.code === 'FileNotFound' || err?.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

describe('Storage.bootstrap example', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('meta.json 损坏触发安全模式', async () => {
    // Write corrupted meta.json
    const metaUri = HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
    await rawWriteText(metaUri, '{ INVALID JSON !!!');

    const ctx = harness.createExtensionContext();
    const storage = await Storage.create(ctx as any);
    const state = await storage.bootstrap();

    // Should be in safe mode
    expect(state.isSafeMode).toBe(true);
    expect(state.meta.banks).toEqual([]);
    expect(state.currentBank).toBeUndefined();
    expect(storage.isInSafeMode()).toBe(true);

    // Underlying data should NOT be deleted - meta.json still on disk
    expect(await exists(metaUri)).toBe(true);
  });

  it('meta.json.tmp 残留在启动期被清理', async () => {
    // Write a valid meta.json
    const metaUri = HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
    const meta: BankMeta = { schemaVersion: 1, banks: [] };
    await rawWriteText(metaUri, JSON.stringify(meta, null, 2));

    // Write a stale meta.json.tmp (simulates crash before rename)
    const metaTmpUri = HarnessUri.joinPath(
      harness.globalStorageUri,
      'meta.json.tmp',
    );
    await rawWriteText(metaTmpUri, '{"stale":"residue"}');
    expect(await exists(metaTmpUri)).toBe(true);

    // Bootstrap should clean the tmp residue
    const ctx = harness.createExtensionContext();
    const storage = await Storage.create(ctx as any);
    const state = await storage.bootstrap();

    expect(state.isSafeMode).toBe(false);
    expect(await exists(metaTmpUri)).toBe(false);
    expect(await exists(metaUri)).toBe(true);
  });

  it('banks/<id>.tmp 残留在启动期被清理', async () => {
    // Write a valid meta.json
    const metaUri = HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
    const meta: BankMeta = { schemaVersion: 1, banks: [] };
    await rawWriteText(metaUri, JSON.stringify(meta, null, 2));

    // Write a stale banks/<id>.tmp directory
    const tmpBankDir = HarnessUri.joinPath(
      harness.globalStorageUri,
      'banks',
      'some-bank-id.tmp',
    );
    await harness.workspaceFs.createDirectory(tmpBankDir);
    const tmpFile = HarnessUri.joinPath(tmpBankDir, 'bank.json');
    await rawWriteText(tmpFile, '{}');
    expect(await exists(tmpBankDir)).toBe(true);

    // Bootstrap should clean the tmp directory
    const ctx = harness.createExtensionContext();
    const storage = await Storage.create(ctx as any);
    const state = await storage.bootstrap();

    expect(state.isSafeMode).toBe(false);
    expect(await exists(tmpBankDir)).toBe(false);
  });

  it('安全模式后重新写入合法 meta 可恢复', async () => {
    // First: trigger safe mode with corrupted meta
    const metaUri = HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
    await rawWriteText(metaUri, 'NOT VALID JSON');

    const ctx = harness.createExtensionContext();
    const storage1 = await Storage.create(ctx as any);
    const state1 = await storage1.bootstrap();
    expect(state1.isSafeMode).toBe(true);

    // Fix: overwrite meta.json with valid content
    const validMeta: BankMeta = {
      schemaVersion: 1,
      currentBankId: 'recovered-bank',
      banks: [
        {
          id: 'recovered-bank',
          name: 'Recovered',
          version: '1.0.0',
          questionCount: 5,
          importedAt: 1_700_000_000_000,
        },
      ],
    };
    await rawWriteText(metaUri, JSON.stringify(validMeta, null, 2));

    // Also write the bank data so bootstrap can load it
    const bankDir = HarnessUri.joinPath(
      harness.globalStorageUri,
      'banks',
      'recovered-bank',
    );
    await harness.workspaceFs.createDirectory(bankDir);
    const bankJsonUri = HarnessUri.joinPath(bankDir, 'bank.json');
    const bankData = {
      name: 'Recovered',
      version: '1.0.0',
      questions: [{ id: 'q1', type: 'qa', title: 'Q', content: 'C', category: 'Cat', tags: [], difficulty: 'easy', answer: 'A' }],
    };
    await rawWriteText(bankJsonUri, JSON.stringify(bankData));

    // Re-bootstrap: should recover
    const storage2 = await Storage.create(ctx as any);
    const state2 = await storage2.bootstrap();

    expect(state2.isSafeMode).toBe(false);
    expect(state2.meta.currentBankId).toBe('recovered-bank');
    expect(state2.meta.banks).toHaveLength(1);
    expect(state2.currentBank).toBeDefined();
    expect(state2.currentBank?.bankId).toBe('recovered-bank');
  });

  it('首次启动（meta.json 不存在）写默认 meta 并正常启动', async () => {
    // No meta.json exists (fresh install)
    const metaUri = HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
    expect(await exists(metaUri)).toBe(false);

    const ctx = harness.createExtensionContext();
    const storage = await Storage.create(ctx as any);
    const state = await storage.bootstrap();

    expect(state.isSafeMode).toBe(false);
    expect(state.meta.schemaVersion).toBe(1);
    expect(state.meta.banks).toEqual([]);
    expect(state.currentBank).toBeUndefined();

    // Default meta should now be on disk
    expect(await exists(metaUri)).toBe(true);
  });
});
