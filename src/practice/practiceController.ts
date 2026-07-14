/**
 * PracticeController（Task 19）。
 *
 * 编排练习流程：打开单题项目 + Webview Panel，监听项目文件保存以更新 lastPracticedAt。
 *
 * Validates: Requirements 5.1, 5.3, 6.1, 6.3, 7.1
 */

import * as vscode from 'vscode';

import type { InMemoryState, Storage } from '../storage/storage.js';
import { getOrDefault } from '../storage/userDataStore.js';
import { QuestionProjectManager } from './questionProjectManager.js';
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
  private readonly projectManager: QuestionProjectManager;
  private readonly saveSubscription: vscode.Disposable;
  private readonly changeSubscription: vscode.Disposable;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Tracks the bank and question that own each open practice document. */
  private readonly uriBindings = new Map<string, OpenDocumentBinding>();
  /** Tracks whole project roots so files created later in Explorer are also recognised. */
  private readonly projectBindings = new Map<string, OpenDocumentBinding>();

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly storage: Storage,
    private readonly state: InMemoryState,
    private readonly options: PracticeControllerOptions = {},
  ) {
    this.projectManager = new QuestionProjectManager(storage, {
      onFileOpened: (uri, bankId, qid) => {
        const binding = [...this.projectBindings.values()].find(
          (candidate) => candidate.bankId === bankId && candidate.qid === qid,
        );
        if (binding) this.uriBindings.set(uri.toString(), binding);
      },
    });
    this.panel = new PracticePanel({
      storage,
      state,
      extensionUri: ctx.extensionUri,
      onOpenProject: async (bankId, qid, question, learning) => {
        this.bindProject(bankId, qid, learning);
        await this.projectManager.open({ bankId, question });
      },
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
   * Open a question: existing answers open directly; first-time answers show the creation picker.
   */
  async open(qid: string): Promise<void> {
    const currentBank = this.state.currentBank;
    if (!currentBank) return;

    const { bankId, bank, learning } = currentBank;
    const question = bank.questions.find((q) => q.id === qid);
    if (!question) return;

    this.bindProject(bankId, qid, learning);
    await this.projectManager.open({ bankId, question }, { directIfExists: true });
    // 先固定作答文件到左侧，再创建/聚焦右侧题目面板，避免 VS Code 复用同一编辑器组。
    this.panel.createOrShow(bankId, qid, question, learning, vscode.ViewColumn.Two);
  }

  /** Delete every answer file for a question while preserving notes and learning state. */
  async deleteAnswer(qid: string): Promise<void> {
    const currentBank = this.state.currentBank;
    if (!currentBank) return;
    const question = currentBank.bank.questions.find((candidate) => candidate.id === qid);
    if (!question) return;

    const { bankId } = currentBank;
    const root = this.storage.userData.getQuestionProjectUri(bankId, qid);

    try {
      const tabsClosed = await this.closeProjectTabs(root);
      if (!tabsClosed) return;

      const deleted = await this.storage.userData.deleteQuestionAnswers(bankId, qid);
      this.clearProjectBindings(bankId, qid);
      this.removeProjectFromWorkspace(root);

      if (deleted) {
        await vscode.window.showInformationMessage(`已删除“${question.title}”的全部答案文件`);
      } else {
        await vscode.window.showInformationMessage(`“${question.title}”还没有答案文件`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`删除答案失败：${reason}`);
    }
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
    for (const [root, binding] of this.projectBindings) {
      if (binding.bankId === bankId && binding.qid === qid) {
        this.projectBindings.delete(root);
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
    this.projectBindings.clear();
  }

  private bindProject(
    bankId: string,
    qid: string,
    learning: Map<string, import('../types/learning.js').LearningState>,
  ): void {
    const root = this.storage.userData.getQuestionProjectUri(bankId, qid).toString();
    this.projectBindings.set(root, { bankId, qid, learning });
  }

  private clearProjectBindings(bankId: string, qid: string): void {
    for (const [uri, binding] of this.uriBindings) {
      if (binding.bankId !== bankId || binding.qid !== qid) continue;
      const timer = this.debounceTimers.get(uri);
      if (timer !== undefined) clearTimeout(timer);
      this.debounceTimers.delete(uri);
      this.uriBindings.delete(uri);
    }
    for (const [root, binding] of this.projectBindings) {
      if (binding.bankId === bankId && binding.qid === qid) {
        this.projectBindings.delete(root);
      }
    }
  }

  private async closeProjectTabs(root: vscode.Uri): Promise<boolean> {
    const rootKey = root.toString();
    const prefix = rootKey.endsWith('/') ? rootKey : `${rootKey}/`;
    const tabs = vscode.window.tabGroups.all.flatMap((group) =>
      group.tabs.filter((tab) => {
        const uri = (tab.input as { uri?: vscode.Uri }).uri;
        return uri !== undefined && uri.toString().startsWith(prefix);
      }),
    );
    if (tabs.length === 0) return true;
    return vscode.window.tabGroups.close(tabs, true);
  }

  private removeProjectFromWorkspace(root: vscode.Uri): void {
    const index = vscode.workspace.workspaceFolders?.findIndex(
      (folder) => folder.uri.toString() === root.toString(),
    ) ?? -1;
    if (index >= 0) vscode.workspace.updateWorkspaceFolders(index, 1);
  }

  private onDocumentChange(uri: vscode.Uri): void {
    const uriKey = uri.toString();
    let binding = this.uriBindings.get(uriKey);
    if (!binding) {
      for (const [root, candidate] of this.projectBindings) {
        const prefix = root.endsWith('/') ? root : `${root}/`;
        if (uriKey.startsWith(prefix)) {
          binding = candidate;
          break;
        }
      }
    }
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
