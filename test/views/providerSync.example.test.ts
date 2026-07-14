import { describe, expect, it, vi } from 'vitest';

import type { BankSummary } from '../../src/types/bankMeta.js';
import type { LearningState } from '../../src/types/learning.js';
import type { QuestionBank } from '../../src/types/question.js';
import type { InMemoryState } from '../../src/storage/storage.js';
import { syncProviders } from '../../src/views/providerSync.js';

const BANK: QuestionBank = {
  name: 'Synced bank',
  version: '1.0',
  questions: [],
};

const SUMMARY: BankSummary = {
  id: 'bank-1',
  name: BANK.name,
  version: BANK.version,
  questionCount: 0,
  importedAt: 1,
};

describe('syncProviders', () => {
  it('injects the current bank and the same learning map into both providers', () => {
    const learning = new Map<string, LearningState>();
    const state: InMemoryState = {
      meta: { schemaVersion: 1, banks: [SUMMARY], currentBankId: SUMMARY.id },
      currentBank: { bankId: SUMMARY.id, bank: BANK, learning },
      isSafeMode: false,
    };
    const listProvider = { refresh: vi.fn(), setBank: vi.fn() };
    const reviewProvider = { refresh: vi.fn(), setBank: vi.fn() };

    syncProviders(state, SUMMARY, listProvider, reviewProvider);

    expect(listProvider.setBank).toHaveBeenCalledWith(BANK, SUMMARY, learning);
    expect(reviewProvider.setBank).toHaveBeenCalledWith(BANK, learning);
    expect(listProvider.refresh).not.toHaveBeenCalled();
    expect(reviewProvider.refresh).not.toHaveBeenCalled();
  });

  it('clears provider-owned bank data when there is no active bank', () => {
    const state: InMemoryState = {
      meta: { schemaVersion: 1, banks: [] },
      isSafeMode: false,
    };
    const listProvider = { refresh: vi.fn(), setBank: vi.fn() };
    const reviewProvider = { refresh: vi.fn(), setBank: vi.fn() };

    syncProviders(state, undefined, listProvider, reviewProvider);

    expect(listProvider.setBank).toHaveBeenCalledWith(undefined, undefined, expect.any(Map));
    expect(reviewProvider.setBank).toHaveBeenCalledWith(undefined, expect.any(Map));
  });
});
