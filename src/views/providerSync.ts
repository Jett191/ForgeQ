import type { BankSummary } from '../types/bankMeta.js';
import type { LearningState } from '../types/learning.js';
import type { QuestionBank } from '../types/question.js';
import type { InMemoryState } from '../storage/storage.js';

export interface QuestionListSyncTarget {
  refresh(): void;
  setBank?(
    bank: QuestionBank | undefined,
    summary: BankSummary | undefined,
    learning: ReadonlyMap<string, LearningState>,
  ): void;
}

export interface ReviewSyncTarget {
  refresh(): void;
  setBank?(
    bank: QuestionBank | undefined,
    learning: ReadonlyMap<string, LearningState>,
  ): void;
}

/**
 * Keep TreeDataProvider-owned data aligned with the mutable extension state.
 * Calling refresh alone only redraws the provider's previous bank references.
 */
export function syncProviders(
  state: InMemoryState,
  summary: BankSummary | undefined,
  listProvider: QuestionListSyncTarget,
  reviewProvider?: ReviewSyncTarget,
): void {
  const current = state.currentBank;
  const learning: ReadonlyMap<string, LearningState> = current?.learning ?? new Map();

  if (listProvider.setBank) {
    listProvider.setBank(current?.bank, summary, learning);
  } else {
    // Preserve compatibility with lightweight callers used outside activation.
    listProvider.refresh();
  }

  if (!reviewProvider) return;
  if (reviewProvider.setBank) {
    reviewProvider.setBank(current?.bank, learning);
  } else {
    reviewProvider.refresh();
  }
}
