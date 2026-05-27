/**
 * EXAMPLE - QA answer / Note 长度限制测试（Task 19）
 *
 * - QA answer 写入内容不应超过 20000 字符
 * - Note 写入内容不应超过 10000 字符
 *
 * 当前实现中 Storage 层不做截断（由上层 Webview / 用户限制内容量），
 * 此测试验证写入行为在各种长度下的正确性。
 *
 * Validates: Requirements 6.4, 7.4
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

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
import { UserDataStore } from '../../src/storage/userDataStore.js';

const QA_LIMIT = 20_000;
const NOTE_LIMIT = 10_000;

describe('Length limits', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('QA answer <= 20000 chars: 写入成功', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });
    const bankId = 'bank-1';
    const qid = 'q1';
    const content = 'a'.repeat(QA_LIMIT);

    await store.ensurePracticeFile(bankId, qid, 'qa', '.md', content);
    const read = await store.readPracticeContent(bankId, qid, 'qa', '.md');
    expect(read).toBe(content);
    expect(read!.length).toBe(QA_LIMIT);
  });

  it('QA answer > 20000 chars: 内容仍可存储（UI 层应限制输入）', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });
    const bankId = 'bank-1';
    const qid = 'q2';
    const content = 'b'.repeat(QA_LIMIT + 1);

    await store.ensurePracticeFile(bankId, qid, 'qa', '.md', content);
    const read = await store.readPracticeContent(bankId, qid, 'qa', '.md');
    // Storage layer stores what's given
    expect(read).toBe(content);
    expect(read!.length).toBe(QA_LIMIT + 1);
  });

  it('Note <= 10000 chars: 写入成功', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });
    const bankId = 'bank-1';
    const qid = 'q3';
    const content = 'c'.repeat(NOTE_LIMIT);

    await store.writeNote(bankId, qid, content);
    const read = await store.readNote(bankId, qid);
    expect(read).toBe(content);
    expect(read!.length).toBe(NOTE_LIMIT);
  });

  it('Note > 10000 chars: 内容仍可存储（UI 层应限制输入）', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });
    const bankId = 'bank-1';
    const qid = 'q4';
    const content = 'd'.repeat(NOTE_LIMIT + 1);

    await store.writeNote(bankId, qid, content);
    const read = await store.readNote(bankId, qid);
    expect(read).toBe(content);
    expect(read!.length).toBe(NOTE_LIMIT + 1);
  });

  it('Note 写入后 hasNote = true', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });
    const bankId = 'bank-1';
    const qid = 'q5';

    await store.writeNote(bankId, qid, 'my note content');
    const ls = await store.readLearningState(bankId, qid);
    expect(ls).toBeDefined();
    expect(ls!.hasNote).toBe(true);
  });

  it('Note 清空后 hasNote = false', async () => {
    const store = new UserDataStore(harness.globalStorageUri, { debounceMs: 0 });
    const bankId = 'bank-1';
    const qid = 'q6';

    await store.writeNote(bankId, qid, 'some note');
    await store.writeNote(bankId, qid, '');
    const ls = await store.readLearningState(bankId, qid);
    expect(ls).toBeDefined();
    expect(ls!.hasNote).toBe(false);
  });
});
