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
import { deriveLearningState, toggleWrongFlag } from '../../domain/masteryRules.js';
import { getOrDefault } from '../../storage/userDataStore.js';
import type { InMemoryState, Storage } from '../../storage/storage.js';
import { deriveQuestionAnswer } from '../practiceFiles.js';
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
  onLearningChanged?: (bankId: string, qid: string) => void;
  onOpenProject?: (
    bankId: string,
    qid: string,
    question: Question,
    learning: Map<string, LearningState>,
  ) => Promise<void>;
}

interface PanelInstance {
  panel: vscode.WebviewPanel;
  bankId: string;
  qid: string;
  question: Question;
  learning: Map<string, LearningState>;
  disposables: vscode.Disposable[];
}

function panelKey(bankId: string, qid: string): string {
  return JSON.stringify([bankId, qid]);
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
    bankId: string,
    qid: string,
    question: Question,
    learning: Map<string, LearningState>,
    viewColumn: vscode.ViewColumn,
  ): void {
    const key = panelKey(bankId, qid);
    const existing = this.instances.get(key);
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
      (msg: WebviewToHostMessage) => this.handleMessage(bankId, qid, question, learning, msg),
      undefined,
      disposables,
    );

    panel.onDidDispose(
      () => this.disposeInstance(bankId, qid),
      undefined,
      disposables,
    );

    this.instances.set(key, { panel, bankId, qid, question, learning, disposables });

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

    <div id="answer-toggle" class="answer-toggle">
      <button id="btn-open-project" class="btn" type="button">项目文件</button>
      <button id="btn-show-answer" class="btn primary" type="button">查看答案</button>
      <div id="mastery-fab" class="mastery-fab">
        <div class="mastery-options" hidden>
          <button class="seg" type="button" data-mastery="unlearned" aria-label="未学习" title="未学习">○</button>
          <button class="seg" type="button" data-mastery="not_mastered" aria-label="未掌握" title="未掌握">◔</button>
          <button class="seg" type="button" data-mastery="mastered" aria-label="已掌握" title="已掌握">✓</button>
          <button class="seg" type="button" data-wrong aria-label="错题" title="错题">✗</button>
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
  postMessage(bankId: string, qid: string, msg: HostToWebviewMessage): void {
    const instance = this.instances.get(panelKey(bankId, qid));
    if (instance) {
      void instance.panel.webview.postMessage(msg);
    }
  }

  /**
   * 判断指定 qid 是否有活跃 panel。
   */
  has(bankId: string, qid: string): boolean {
    return this.instances.has(panelKey(bankId, qid));
  }

  /**
   * 关闭并清理指定 panel。
   */
  close(bankId: string, qid: string): void {
    const instance = this.instances.get(panelKey(bankId, qid));
    if (instance) {
      instance.panel.dispose();
      // onDidDispose will call disposeInstance
    }
  }

  /**
   * 清理所有 panel。
   */
  disposeAll(): void {
    for (const instance of [...this.instances.values()]) {
      this.close(instance.bankId, instance.qid);
    }
  }

  private disposeInstance(bankId: string, qid: string): void {
    const key = panelKey(bankId, qid);
    const instance = this.instances.get(key);
    if (instance) {
      for (const d of instance.disposables) {
        d.dispose();
      }
      this.instances.delete(key);
    }
  }

  private async handleMessage(
    bankId: string,
    qid: string,
    question: Question,
    learningMap: Map<string, LearningState>,
    msg: WebviewToHostMessage,
  ): Promise<void> {
    const { storage } = this.deps;

    const isReadOnlyMessage = msg.type === 'ready' || msg.type === 'requestAnswer';
    const bankStillExists = storage.getCurrentMeta().banks.some((bank) => bank.id === bankId);
    if (!isReadOnlyMessage && !bankStillExists) {
      const reason = '题库已被移除或替换';
      if (msg.type === 'toggleFavorite') {
        this.postMessage(bankId, qid, { type: 'favoriteAck', ok: false, reason });
      } else if (msg.type === 'toggleWrong') {
        this.postMessage(bankId, qid, { type: 'wrongAck', ok: false, reason });
      } else if (msg.type === 'setMastery') {
        this.postMessage(bankId, qid, { type: 'masteryAck', ok: false, reason });
      }
      return;
    }

    switch (msg.type) {
      case 'ready': {
        const learning = getOrDefault(learningMap.get(qid));

        const initPayload: HostToWebviewMessage = {
          type: 'init',
          payload: {
            bankId,
            question,
            learning,
            noteFileUri: `notes/${qid}.md`,
          },
        };
        this.postMessage(bankId, qid, initPayload);
        break;
      }

      case 'requestAnswer': {
        const payload: AnswerPayload = {
          questionType: question.type,
          answer: deriveQuestionAnswer(question),
        };
        this.postMessage(bankId, qid, { type: 'showAnswer', payload });
        break;
      }

      case 'toggleFavorite': {
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
          this.postMessage(bankId, qid, { type: 'favoriteAck', ok: true });
          this.postMessage(bankId, qid, { type: 'refreshLearning', payload: next });
          this.deps.onLearningChanged?.(bankId, qid);
        } else {
          const reason = 'cause' in result.error ? result.error.cause : 'unknown';
          this.postMessage(bankId, qid, { type: 'favoriteAck', ok: false, reason });
          this.postMessage(bankId, qid, { type: 'rollback', payload: prev });
        }
        break;
      }

      case 'setMastery': {
        const mastery = msg.value as MasteryStatus;
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
          this.postMessage(bankId, qid, { type: 'masteryAck', ok: true });
          this.postMessage(bankId, qid, { type: 'refreshLearning', payload: next });
          this.deps.onLearningChanged?.(bankId, qid);
        } else {
          const reason = 'cause' in result.error ? result.error.cause : 'unknown';
          this.postMessage(bankId, qid, { type: 'masteryAck', ok: false, reason });
          this.postMessage(bankId, qid, { type: 'rollback', payload: prev });
        }
        break;
      }

      case 'toggleWrong': {
        const prev = getOrDefault(learningMap.get(qid));
        const next = toggleWrongFlag(prev);

        const result = await storage.writeWithRollback({
          prev,
          next,
          applyMemory: (v) => { learningMap.set(qid, v); },
          persist: () => storage.userData.writeLearningState(bankId, qid, next),
          onRollback: (v) => { learningMap.set(qid, v); },
          path: 'learning.json',
        });

        if (result.ok) {
          this.postMessage(bankId, qid, { type: 'wrongAck', ok: true });
          this.postMessage(bankId, qid, { type: 'refreshLearning', payload: next });
          this.deps.onLearningChanged?.(bankId, qid);
        } else {
          const reason = 'cause' in result.error ? result.error.cause : 'unknown';
          this.postMessage(bankId, qid, { type: 'wrongAck', ok: false, reason });
          this.postMessage(bankId, qid, { type: 'rollback', payload: prev });
        }
        break;
      }

      case 'openProject': {
        await this.deps.onOpenProject?.(bankId, qid, question, learningMap);
        break;
      }

      case 'openNativeEditor': {
        const target = msg.target;
        let fileUri: vscode.Uri | undefined;

        if (target === 'code' || target === 'qa') {
          await this.deps.onOpenProject?.(bankId, qid, question, learningMap);
          break;
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
