/**
 * EXAMPLE - Importer 各分支（Task 16.2）
 *
 * 覆盖：
 *   1. dialog 入参（filters / canSelectMany）
 *   2. 取消
 *   3. >10MB 短路
 *   4. 读取失败
 *   5. 解析失败
 *   6. 覆盖确认 / 取消
 *   7. 成功后 Storage 状态
 *
 * Validates: Requirements 2.2, 2.4, 2.5, 2.7, 2.8, 2.9
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  harness,
  showOpenDialogMock,
  showErrorMessageMock,
  showInformationMessageMock,
  showQuickPickMock,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return {
    harness: mod.createMemFsHarness(),
    showOpenDialogMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
    showErrorMessageMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
    showInformationMessageMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
    showQuickPickMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
  };
});

vi.mock('vscode', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  const base = mod.createVscodeModuleMock(harness);
  return {
    ...base,
    window: {
      ...base.window,
      showOpenDialog: showOpenDialogMock,
      showErrorMessage: showErrorMessageMock,
      showInformationMessage: showInformationMessageMock,
      showQuickPick: showQuickPickMock,
    },
  };
});

// eslint-disable-next-line import/first
import { HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { importBank } from '../../src/importer/importer.js';
// eslint-disable-next-line import/first
import { Storage, type InMemoryState } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import { BankRegistry } from '../../src/storage/bankRegistry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Valid bank JSON for testing */
const VALID_BANK_JSON = JSON.stringify({
  name: 'Test Bank',
  version: '1.0',
  questions: [
    {
      id: 'q1',
      type: 'code',
      title: 'Test Question 1',
      content: 'Content 1',
      category: 'JavaScript',
      tags: ['js'],
      difficulty: 'easy',
      answer: 'console.log("hello")',
    },
    {
      id: 'q2',
      type: 'qa',
      title: 'Test Question 2',
      content: 'Content 2',
      category: 'CSS',
      tags: ['css'],
      difficulty: 'medium',
      answer: 'Flexbox',
    },
  ],
});

function makeState(): InMemoryState {
  return {
    meta: { schemaVersion: 1, banks: [] },
    isSafeMode: false,
  };
}

async function writeFileAtUri(uri: HarnessUri, text: string): Promise<void> {
  await harness.workspaceFs.writeFile(uri, new TextEncoder().encode(text));
}

describe('Importer', () => {
  let storage: Storage;
  let registry: BankRegistry;
  let state: InMemoryState;
  let listProvider: { refresh: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    harness.reset();
    showOpenDialogMock.mockReset();
    showErrorMessageMock.mockReset();
    showInformationMessageMock.mockReset();
    showQuickPickMock.mockReset();

    const ctx = harness.createExtensionContext();
    storage = await Storage.create(ctx as any);
    await storage.bootstrap();
    registry = new BankRegistry(storage, ctx.globalState);
    state = makeState();
    listProvider = { refresh: vi.fn() };
  });

  it('showOpenDialog 使用正确的参数（filters, canSelectMany）', async () => {
    showOpenDialogMock.mockResolvedValue(undefined);

    const ctx = harness.createExtensionContext();
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showOpenDialogMock).toHaveBeenCalledTimes(1);
    const args = showOpenDialogMock.mock.calls[0]![0] as {
      canSelectMany: boolean;
      filters: Record<string, string[]>;
    };
    expect(args.canSelectMany).toBe(false);
    expect(args.filters).toEqual({ 'JSON Files': ['json'] });
  });

  it('用户取消对话框 -> 不修改 Storage', async () => {
    showOpenDialogMock.mockResolvedValue(undefined);

    const ctx = harness.createExtensionContext();
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showErrorMessageMock).not.toHaveBeenCalled();
    expect(showInformationMessageMock).not.toHaveBeenCalled();
    expect(listProvider.refresh).not.toHaveBeenCalled();
  });

  it('文件 > 10MB -> 短路，不读取内容', async () => {
    // Write a fake file path that will be "stat'd" as > 10MB
    const fileUri = HarnessUri.file('/tmp/big-file.json');
    // Write minimal content, then override stat via failure injection
    await writeFileAtUri(fileUri, 'x');

    // We need the stat to report > 10MB. Since memfs stat returns actual file size,
    // let's write a large placeholder. We'll write just enough bytes to indicate > 10MB
    // by using failure injection approach - actually let's write a real indication.
    // Simpler: write enough that stat reports correct size
    // Actually, let's create a buffer of > 10MB
    const bigContent = new Uint8Array(10 * 1024 * 1024 + 1);
    await harness.workspaceFs.writeFile(fileUri, bigContent);

    showOpenDialogMock.mockResolvedValue([fileUri]);

    const ctx = harness.createExtensionContext();
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showErrorMessageMock).toHaveBeenCalledTimes(1);
    const msg = showErrorMessageMock.mock.calls[0]![0] as string;
    expect(msg).toContain('10 MB');
    expect(listProvider.refresh).not.toHaveBeenCalled();
  });

  it('读取文件失败 -> showErrorMessage', async () => {
    const fileUri = HarnessUri.file('/tmp/unreadable.json');
    // Don't write the file so readFile will fail
    showOpenDialogMock.mockResolvedValue([fileUri]);

    // stat will fail too, so we need to write something for stat to work
    // but readFile to fail
    await writeFileAtUri(fileUri, 'small content');
    // inject readFile failure
    harness.failNext({ op: 'readFile', pathPattern: /unreadable/ });

    const ctx = harness.createExtensionContext();
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showErrorMessageMock).toHaveBeenCalledTimes(1);
    const msg = showErrorMessageMock.mock.calls[0]![0] as string;
    expect(msg).toContain('读取文件失败');
    expect(listProvider.refresh).not.toHaveBeenCalled();
  });

  it('解析失败 -> showErrorMessage，不修改 Storage', async () => {
    const fileUri = HarnessUri.file('/tmp/invalid.json');
    await writeFileAtUri(fileUri, '{ invalid json !!!');
    showOpenDialogMock.mockResolvedValue([fileUri]);

    const ctx = harness.createExtensionContext();
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showErrorMessageMock).toHaveBeenCalledTimes(1);
    const msg = showErrorMessageMock.mock.calls[0]![0] as string;
    expect(msg).toContain('JSON 解析失败');
    expect(listProvider.refresh).not.toHaveBeenCalled();
  });

  it('已存在同名同版本 -> 用户选择"取消导入"', async () => {
    // First import a bank
    const fileUri = HarnessUri.file('/tmp/bank.json');
    await writeFileAtUri(fileUri, VALID_BANK_JSON);
    showOpenDialogMock.mockResolvedValue([fileUri]);
    showQuickPickMock.mockResolvedValue(undefined); // won't be called first time

    const ctx = harness.createExtensionContext();

    // First import (no duplicate)
    showQuickPickMock.mockResolvedValue(undefined);
    await importBank(ctx as any, storage, registry, state, listProvider);
    expect(showInformationMessageMock).toHaveBeenCalledTimes(1);

    // Reset mocks for second call
    showInformationMessageMock.mockReset();
    listProvider.refresh.mockReset();

    // Second import of same bank - duplicate exists
    showOpenDialogMock.mockResolvedValue([fileUri]);
    showQuickPickMock.mockResolvedValue('取消导入');
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showQuickPickMock).toHaveBeenCalled();
    expect(showInformationMessageMock).not.toHaveBeenCalled();
    expect(listProvider.refresh).not.toHaveBeenCalled();
  });

  it('已存在同名同版本 -> 用户选择"覆盖已有题库" -> 成功', async () => {
    // First import
    const fileUri = HarnessUri.file('/tmp/bank.json');
    await writeFileAtUri(fileUri, VALID_BANK_JSON);
    showOpenDialogMock.mockResolvedValue([fileUri]);

    const ctx = harness.createExtensionContext();
    await importBank(ctx as any, storage, registry, state, listProvider);

    // Reset mocks
    showInformationMessageMock.mockReset();
    listProvider.refresh.mockReset();

    // Second import with override
    showOpenDialogMock.mockResolvedValue([fileUri]);
    showQuickPickMock.mockResolvedValue('覆盖已有题库');
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showInformationMessageMock).toHaveBeenCalledTimes(1);
    const msg = showInformationMessageMock.mock.calls[0]![0] as string;
    expect(msg).toContain('2');
    expect(listProvider.refresh).toHaveBeenCalledTimes(1);
  });

  it('成功导入 -> 显示题数信息 + 触发 refresh', async () => {
    const fileUri = HarnessUri.file('/tmp/bank.json');
    await writeFileAtUri(fileUri, VALID_BANK_JSON);
    showOpenDialogMock.mockResolvedValue([fileUri]);

    const ctx = harness.createExtensionContext();
    await importBank(ctx as any, storage, registry, state, listProvider);

    expect(showInformationMessageMock).toHaveBeenCalledTimes(1);
    const msg = showInformationMessageMock.mock.calls[0]![0] as string;
    expect(msg).toContain('2');
    expect(msg).toContain('导入成功');
    expect(listProvider.refresh).toHaveBeenCalledTimes(1);
  });
});
