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

/**
 * PracticeController manages opening questions, creating webview panels,
 * and watching file changes to update lastPracticedAt.
 */
export class PracticeController {
  private readonly panel: PracticePanel;
  private readonly saveSubscription: vscode.Disposable;
  private readonly changeSubscription: vscode.Disposable;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Tracks which URIs map to which qid. */
  private readonly uriToQid = new Map<string, string>();

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly storage: Storage,
    private readonly state: InMemoryState,
  ) {
    this.panel = new PracticePanel({
      storage,
      state,
      extensionUri: ctx.extensionUri,
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
    this.panel.createOrShow(qid, question, vscode.ViewColumn.Two);
  }

  /**
   * Close a question's panel and subscriptions.
   */
  close(qid: string): void {
    this.panel.close(qid);
    const timer = this.debounceTimers.get(qid);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.debounceTimers.delete(qid);
    }
    // Clean up URI mappings for this qid
    for (const [uri, id] of this.uriToQid) {
      if (id === qid) {
        this.uriToQid.delete(uri);
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
    this.uriToQid.clear();
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

    this.uriToQid.set(fileUri.toString(), qid);

    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  }

  private async openQA(
    bankId: string,
    qid: string,
    _question: import('../types/question.js').QAQuestion,
    _learning: Map<string, import('../types/learning.js').LearningState>,
  ): Promise<void> {
    const fileUri = await this.storage.userData.ensurePracticeFile(
      bankId, qid, 'qa', '.md', '',
    );

    this.uriToQid.set(fileUri.toString(), qid);

    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  }

  private onDocumentChange(uri: vscode.Uri): void {
    const qid = this.uriToQid.get(uri.toString());
    if (!qid) return;

    // Debounce: schedule lastPracticedAt update
    const existing = this.debounceTimers.get(qid);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    this.debounceTimers.set(
      qid,
      setTimeout(() => {
        this.debounceTimers.delete(qid);
        void this.updateLastPracticed(qid);
      }, DEBOUNCE_MS),
    );
  }

  private async updateLastPracticed(qid: string): Promise<void> {
    const currentBank = this.state.currentBank;
    if (!currentBank) return;

    const { bankId, learning } = currentBank;
    const prev = getOrDefault(learning.get(qid));
    const next = { ...prev, lastPracticedAt: Date.now() };

    await this.storage.writeWithRollback({
      prev,
      next,
      applyMemory: (v) => { learning.set(qid, v); },
      persist: () => this.storage.userData.writeLearningState(bankId, qid, next),
      onRollback: (v) => { learning.set(qid, v); },
      path: 'learning.json',
    });
  }
}
