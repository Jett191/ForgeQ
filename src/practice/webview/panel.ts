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
      vscode.Uri.joinPath(this.deps.extensionUri, 'src', 'practice', 'webview', 'styles.css'),
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
    <div class="question-header">
      <h1 id="question-title"></h1>
      <span id="question-type" class="badge"></span>
      <span id="question-difficulty" class="badge"></span>
      <span id="question-category" class="badge"></span>
    </div>

    <div id="question-content" class="content-area"></div>

    <div id="test-cases" class="test-cases"></div>

    <div class="controls">
      <button id="btn-show-answer" class="primary">查看答案</button>
      <button id="btn-favorite">收藏</button>
      <div class="mastery-controls">
        <button id="btn-unlearned" data-mastery="unlearned">未学习</button>
        <button id="btn-learning" data-mastery="learning">学习中</button>
        <button id="btn-mastered" data-mastery="mastered">已掌握</button>
        <button id="btn-not-mastered" data-mastery="not_mastered">未掌握</button>
      </div>
    </div>

    <div class="note-links">
      <a id="link-open-note">在编辑器打开笔记</a>
      <a id="link-note-preview">Markdown 预览</a>
    </div>

    <div id="answer-area" class="answer-area hidden"></div>

    <div id="follow-ups" class="follow-ups"></div>

    <p id="status-message" class="status-message"></p>
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
