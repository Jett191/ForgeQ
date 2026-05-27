/**
 * WebviewPanel 生命周期管理（Task 19）。
 *
 * 封装 `vscode.WebviewPanel` 的创建 / 消息路由 / 销毁清理。
 *
 * Validates: Requirements 5.1, 5.5, 6.1, 6.6, 7.1, 8.1, 9.1
 */

import * as crypto from 'node:crypto';

import * as vscode from 'vscode';

import type { LearningState } from '../../types/learning.js';
import type { MasteryStatus, Question } from '../../types/question.js';
import { deriveLearningState } from '../../domain/masteryRules.js';
import { getOrDefault } from '../../storage/userDataStore.js';
import type { InMemoryState, Storage } from '../../storage/storage.js';
import {
  deriveCodeAnswer,
  deriveQAAnswer,
  extForLanguage,
  isCodeQuestion,
} from '../practiceFiles.js';
import type {
  AnswerPayload,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from './messages.js';

const VIEW_TYPE = 'frontendInterview.practiceView';

export interface PanelDeps {
  storage: Storage;
  state: InMemoryState;
  extensionUri: vscode.Uri;
}

interface PanelInstance {
  panel: vscode.WebviewPanel;
  qid: string;
  question: Question;
  disposables: vscode.Disposable[];
}

/**
 * 管理 Webview Panel 的创建、消息路由和销毁。
 */
export class PracticePanel {
  private instances = new Map<string, PanelInstance>();

  constructor(private readonly deps: PanelDeps) {}

  /**
   * 创建或聚焦 Webview Panel。
   */
  createOrShow(
    qid: string,
    question: Question,
    viewColumn: vscode.ViewColumn,
  ): void {
    const existing = this.instances.get(qid);
    if (existing) {
      existing.panel.reveal(viewColumn);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      question.title,
      viewColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'webview'),
        ],
      },
    );

    const disposables: vscode.Disposable[] = [];

    panel.webview.onDidReceiveMessage(
      (msg: WebviewToHostMessage) => this.handleMessage(qid, question, msg),
      undefined,
      disposables,
    );

    panel.onDidDispose(
      () => this.disposeInstance(qid),
      undefined,
      disposables,
    );

    this.instances.set(qid, { panel, qid, question, disposables });

    // Set webview HTML content
    panel.webview.html = this.getWebviewHtml(panel.webview);
  }

  /**
   * Generate the HTML content for the webview panel.
   */
  private getWebviewHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');

    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'webview', 'styles.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'dist', 'webview', 'main.js'),
    );
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>Practice</title>
</head>
<body>
  <div id="app">
    <header class="q-head">
      <div id="question-meta" class="q-meta"></div>
      <div class="q-title-row">
        <h1 id="question-title" class="q-title"></h1>
        <button id="btn-favorite" class="q-fav" type="button" aria-label="收藏" title="收藏">
          <span class="fav-icon" aria-hidden="true"></span>
        </button>
      </div>
    </header>

    <article id="question-content" class="md"></article>

    <section id="test-cases" class="test-cases"></section>

    <div id="answer-toggle" class="answer-toggle">
      <button id="btn-show-answer" class="btn primary" type="button">查看答案</button>
      <div id="mastery-fab" class="mastery-fab">
        <div class="mastery-options" hidden>
          <button class="seg" type="button" data-mastery="unlearned" aria-label="未学习" title="未学习">○</button>
          <button class="seg" type="button" data-mastery="learning" aria-label="学习中" title="学习中">◔</button>
          <button class="seg" type="button" data-mastery="mastered" aria-label="已掌握" title="已掌握">✓</button>
          <button class="seg" type="button" data-mastery="not_mastered" aria-label="未掌握" title="未掌握">✗</button>
        </div>
        <button id="btn-mastery" class="mastery-trigger" type="button" aria-label="学习状态" title="学习状态" aria-haspopup="true" aria-expanded="false">
          <span class="mastery-icon" aria-hidden="true">○</span>
        </button>
      </div>
    </div>

    <section id="answer-area" class="answer-area hidden">
      <div id="answer-content"></div>
      <div class="answer-actions">
        <button id="btn-collapse-answer" class="btn-collapse" type="button" aria-label="收起答案" title="收起答案">
          <span aria-hidden="true">↑</span>
        </button>
      </div>
    </section>

    <section id="follow-ups" class="follow-ups"></section>

    <div id="status-message" class="status-message" role="status" aria-live="polite"></div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * 向指定 panel post message。
   */
  postMessage(qid: string, msg: HostToWebviewMessage): void {
    const instance = this.instances.get(qid);
    if (instance) {
      void instance.panel.webview.postMessage(msg);
    }
  }

  /**
   * 判断指定 qid 是否有活跃 panel。
   */
  has(qid: string): boolean {
    return this.instances.has(qid);
  }

  /**
   * 关闭并清理指定 panel。
   */
  close(qid: string): void {
    const instance = this.instances.get(qid);
    if (instance) {
      instance.panel.dispose();
      // onDidDispose will call disposeInstance
    }
  }

  /**
   * 清理所有 panel。
   */
  disposeAll(): void {
    for (const [qid] of this.instances) {
      this.close(qid);
    }
  }

  private disposeInstance(qid: string): void {
    const instance = this.instances.get(qid);
    if (instance) {
      for (const d of instance.disposables) {
        d.dispose();
      }
      this.instances.delete(qid);
    }
  }

  private async handleMessage(
    qid: string,
    question: Question,
    msg: WebviewToHostMessage,
  ): Promise<void> {
    const { storage, state } = this.deps;
    const bankId = state.currentBank?.bankId;
    if (!bankId) return;

    switch (msg.type) {
      case 'ready': {
        const learning = getOrDefault(state.currentBank?.learning.get(qid));

        const initPayload: HostToWebviewMessage = {
          type: 'init',
          payload: {
            bankId,
            question,
            learning,
            noteFileUri: `notes/${qid}.md`,
          },
        };
        this.postMessage(qid, initPayload);
        break;
      }

      case 'requestAnswer': {
        let payload: AnswerPayload;
        if (isCodeQuestion(question)) {
          payload = { questionType: 'code', answer: deriveCodeAnswer(question) };
        } else {
          payload = { questionType: 'qa', answer: deriveQAAnswer(question) };
        }
        this.postMessage(qid, { type: 'showAnswer', payload });
        break;
      }

      case 'toggleFavorite': {
        const learningMap = state.currentBank?.learning;
        if (!learningMap) break;
        const prev = getOrDefault(learningMap.get(qid));
        const next: LearningState = { ...prev, favoriteFlag: !prev.favoriteFlag };

        const result = await storage.writeWithRollback({
          prev,
          next,
          applyMemory: (v) => { learningMap.set(qid, v); },
          persist: () => storage.userData.writeLearningState(bankId, qid, next),
          onRollback: (v) => { learningMap.set(qid, v); },
          path: 'learning.json',
        });

        if (result.ok) {
          this.postMessage(qid, { type: 'favoriteAck', ok: true });
          this.postMessage(qid, { type: 'refreshLearning', payload: next });
        } else {
          const reason = 'cause' in result.error ? result.error.cause : 'unknown';
          this.postMessage(qid, { type: 'favoriteAck', ok: false, reason });
          this.postMessage(qid, { type: 'rollback', payload: prev });
        }
        break;
      }

      case 'setMastery': {
        const mastery = msg.value as MasteryStatus;
        const learningMap = state.currentBank?.learning;
        if (!learningMap) break;
        const prev = getOrDefault(learningMap.get(qid));
        const next = deriveLearningState(prev, mastery);

        const result = await storage.writeWithRollback({
          prev,
          next,
          applyMemory: (v) => { learningMap.set(qid, v); },
          persist: () => storage.userData.writeLearningState(bankId, qid, next),
          onRollback: (v) => { learningMap.set(qid, v); },
          path: 'learning.json',
        });

        if (result.ok) {
          this.postMessage(qid, { type: 'masteryAck', ok: true });
          this.postMessage(qid, { type: 'refreshLearning', payload: next });
        } else {
          const reason = 'cause' in result.error ? result.error.cause : 'unknown';
          this.postMessage(qid, { type: 'masteryAck', ok: false, reason });
          this.postMessage(qid, { type: 'rollback', payload: prev });
        }
        break;
      }

      case 'openNativeEditor': {
        const target = msg.target;
        let fileUri: vscode.Uri | undefined;

        if (target === 'code' && isCodeQuestion(question)) {
          const ext = extForLanguage(question.language);
          fileUri = await storage.userData.ensurePracticeFile(
            bankId, qid, 'code', ext, '',
          );
        } else if (target === 'qa') {
          fileUri = await storage.userData.ensurePracticeFile(
            bankId, qid, 'qa', '.md', '',
          );
        } else if (target === 'note') {
          fileUri = await storage.userData.ensurePracticeFile(
            bankId, qid, 'note', '.md', '',
          );
        }

        if (fileUri) {
          const doc = await vscode.workspace.openTextDocument(fileUri);
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        }
        break;
      }

      case 'requestNotePreview': {
        const noteUri = await storage.userData.ensurePracticeFile(
          bankId, qid, 'note', '.md', '',
        );
        const doc = await vscode.workspace.openTextDocument(noteUri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await vscode.commands.executeCommand('markdown.showPreview');
        break;
      }
    }
  }
}
