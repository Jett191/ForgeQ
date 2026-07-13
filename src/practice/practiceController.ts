/**
 * PracticeController（Task 19）。
 *
 * 编排练习流程：打开题目文件 + Webview Panel，监听文件保存以更新 lastPracticedAt。
 *
 * Validates: Requirements 5.1, 5.3, 6.1, 6.3, 7.1
 */

import * as vscode from 'vscode';

import type { InMemoryState, Storage } from '../storage/storage.js';
import { getOrDefault } from '../storage/userDataStore.js';
import {
  extForLanguage,
  initialCodeContent,
  isCodeQuestion,
} from './practiceFiles.js';
import { PracticePanel } from './webview/panel.js';

/** 1000ms debounce for lastPracticedAt updates. */
const DEBOUNCE_MS = 1000;

interface OpenDocumentBinding {
  bankId: string;
  qid: string;
  learning: Map<string, import('../types/learning.js').LearningState>;
}

export interface PracticeControllerOptions {
  onLearningChanged?: (bankId: string, qid: string) => void;
}

/**
 * PracticeController manages opening questions, creating webview panels,
 * and watching file changes to update lastPracticedAt.
 */
export class PracticeController {
  private readonly panel: PracticePanel;
  private readonly saveSubscription: vscode.Disposable;
  private readonly changeSubscription: vscode.Disposable;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Tracks the bank and question that own each open practice document. */
  private readonly uriBindings = new Map<string, OpenDocumentBinding>();

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly storage: Storage,
    private readonly state: InMemoryState,
    private readonly options: PracticeControllerOptions = {},
  ) {
    this.panel = new PracticePanel({
      storage,
      state,
      extensionUri: ctx.extensionUri,
      ...(options.onLearningChanged !== undefined
        ? { onLearningChanged: options.onLearningChanged }
        : {}),
    });

    this.saveSubscription = vscode.workspace.onDidSaveTextDocument((doc) => {
      this.onDocumentChange(doc.uri);
    });

    this.changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      this.onDocumentChange(e.document.uri);
    });
  }

  /**
   * Open a question: ensure practice file, open in editor, show webview.
   */
  async open(qid: string): Promise<void> {
    const currentBank = this.state.currentBank;
    if (!currentBank) return;

    const { bankId, bank, learning } = currentBank;
    const question = bank.questions.find((q) => q.id === qid);
    if (!question) return;

    if (isCodeQuestion(question)) {
      await this.openCode(bankId, qid, question, learning);
    } else {
      await this.openQA(bankId, qid, question, learning);
    }

    // Show webview panel
    this.panel.createOrShow(bankId, qid, question, learning, vscode.ViewColumn.Two);
  }

  /**
   * Close a question's panel and subscriptions.
   */
  close(bankId: string, qid: string): void {
    this.panel.close(bankId, qid);
    for (const [uri, binding] of this.uriBindings) {
      if (binding.bankId === bankId && binding.qid === qid) {
        const timer = this.debounceTimers.get(uri);
        if (timer !== undefined) clearTimeout(timer);
        this.debounceTimers.delete(uri);
        this.uriBindings.delete(uri);
      }
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.saveSubscription.dispose();
    this.changeSubscription.dispose();
    this.panel.disposeAll();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.uriBindings.clear();
  }

  private async openCode(
    bankId: string,
    qid: string,
    question: import('../types/question.js').CodeQuestion,
    learning: Map<string, import('../types/learning.js').LearningState>,
  ): Promise<void> {
    const ext = extForLanguage(question.language);
    const saved = await this.storage.userData.readPracticeContent(bankId, qid, 'code', ext);
    const init = initialCodeContent(question, saved);
    const fileUri = await this.storage.userData.ensurePracticeFile(
      bankId, qid, 'code', ext, init,
    );

    this.uriBindings.set(fileUri.toString(), { bankId, qid, learning });

    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  }

  private async openQA(
    bankId: string,
    qid: string,
    _question: import('../types/question.js').QAQuestion,
    learning: Map<string, import('../types/learning.js').LearningState>,
  ): Promise<void> {
    const fileUri = await this.storage.userData.ensurePracticeFile(
      bankId, qid, 'qa', '.md', '',
    );

    this.uriBindings.set(fileUri.toString(), { bankId, qid, learning });

    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  }

  private onDocumentChange(uri: vscode.Uri): void {
    const uriKey = uri.toString();
    const binding = this.uriBindings.get(uriKey);
    if (!binding) return;

    // Debounce: schedule lastPracticedAt update
    const existing = this.debounceTimers.get(uriKey);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    this.debounceTimers.set(
      uriKey,
      setTimeout(() => {
        this.debounceTimers.delete(uriKey);
        void this.updateLastPracticed(binding);
      }, DEBOUNCE_MS),
    );
  }

  private async updateLastPracticed(binding: OpenDocumentBinding): Promise<void> {
    const { bankId, qid, learning } = binding;
    // A removed/replaced bank must not be recreated by a delayed editor event.
    if (!this.storage.getCurrentMeta().banks.some((bank) => bank.id === bankId)) return;
    const prev = getOrDefault(learning.get(qid));
    const next = { ...prev, lastPracticedAt: Date.now() };

    const result = await this.storage.writeWithRollback({
      prev,
      next,
      applyMemory: (v) => { learning.set(qid, v); },
      persist: () => this.storage.userData.writeLearningState(bankId, qid, next),
      onRollback: (v) => { learning.set(qid, v); },
      path: 'learning.json',
    });
    if (result.ok) this.options.onLearningChanged?.(bankId, qid);
  }
}
