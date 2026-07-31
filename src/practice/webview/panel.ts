/**
 * WebviewPanel 生命周期管理（Task 19）。
 *
 * 封装 `vscode.WebviewPanel` 的创建 / 消息路由 / 销毁清理。
 *
 * Validates: Requirements 5.1, 5.5, 6.1, 6.6, 7.1, 8.1, 9.1
 */

import * as crypto from 'node:crypto';
import * as os from 'node:os';

import * as vscode from 'vscode';

import {
  DEFAULT_FORGEQ_SETTINGS,
  type ForgeQSettings,
  type NoteOpenMode,
} from '../../config/settings.js';
import type { LearningState } from '../../types/learning.js';
import type { MasteryStatus, Question } from '../../types/question.js';
import { deriveLearningState, toggleWrongFlag } from '../../domain/masteryRules.js';
import { getOrDefault } from '../../storage/userDataStore.js';
import type { InMemoryState, Storage } from '../../storage/storage.js';
import { isExcalidrawFile } from '../excalidraw.js';
import { deriveQuestionAnswer } from '../practiceFiles.js';
import {
  buildQuestionMarkdown,
  questionMarkdownFileName,
  type SharedAnswerFile,
} from '../shareMarkdown.js';
import type {
  AnswerPayload,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from './messages.js';
import { buildQuestionPlainText } from '../copyPlainText.js';

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
  onOpenNote?: (
    bankId: string,
    qid: string,
    learning: Map<string, LearningState>,
    mode: NoteOpenMode,
  ) => Promise<void>;
  onDidBecomeActive?: (
    bankId: string,
    qid: string,
    question: Question,
    learning: Map<string, LearningState>,
  ) => void;
  getSettings?: () => ForgeQSettings;
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

    panel.onDidChangeViewState(
      () => {
        if (panel.active) {
          this.deps.onDidBecomeActive?.(bankId, qid, question, learning);
        }
      },
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
    content="default-src 'none'; img-src https:; font-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>Practice</title>
</head>
<body>
  <div id="app">
    <header class="q-head">
      <div id="question-meta" class="q-meta"></div>
      <div class="q-title-row">
        <h1 id="question-title" class="q-title"></h1>
        <div class="q-title-actions" aria-label="题目操作">
          <button id="btn-open-project" class="q-icon-btn" type="button" aria-label="项目文件" title="项目文件">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3.5 6.75h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.75Z"></path>
              <path d="M3.5 9.25h17"></path>
            </svg>
          </button>
          <button id="btn-open-note" class="q-icon-btn q-note" type="button" aria-label="个人笔记" title="个人笔记">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 4.75h9.5L19 8.25v11H6a2 2 0 0 1-2-2V6.75a2 2 0 0 1 2-2Z"></path>
              <path d="M15.5 4.75v3.5H19"></path>
              <path d="M8 12h7M8 15.5h5"></path>
            </svg>
          </button>
          <button id="btn-share-markdown" class="q-icon-btn" type="button" aria-label="分享 Markdown" title="分享 Markdown">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5"></path>
              <path d="m19 5-8.5 8.5"></path>
              <path d="M18 13.5v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 17.5v-10A1.5 1.5 0 0 1 6.5 6h4"></path>
            </svg>
          </button>
          <button id="btn-copy-ai" class="q-icon-btn q-copy" type="button" aria-label="复制完整内容，粘贴给 AI" title="复制给 AI">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="11" height="11" rx="1.75"></rect>
              <path d="M16 8V6.75A1.75 1.75 0 0 0 14.25 5h-7.5A1.75 1.75 0 0 0 5 6.75v7.5A1.75 1.75 0 0 0 6.75 16H8"></path>
            </svg>
          </button>
          <button id="btn-favorite" class="q-icon-btn q-fav" type="button" aria-label="收藏" title="收藏">
            <span class="fav-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </header>

    <article id="question-content" class="md"></article>

    <div id="answer-toggle" class="answer-toggle">
      <button id="btn-show-answer" class="btn primary" type="button">查看答案</button>
      <div id="mastery-fab" class="mastery-fab">
        <div class="mastery-options" hidden>
          <button class="seg" type="button" data-mastery="unlearned" aria-label="未学习" title="未学习">○</button>
          <button class="seg" type="button" data-mastery="learning" aria-label="学习中" title="学习中">◑</button>
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

    const isReadOnlyMessage =
      msg.type === 'ready' ||
      msg.type === 'requestAnswer' ||
      msg.type === 'shareMarkdown' ||
      msg.type === 'copyForAi';
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
        const settings = this.settings();

        const initPayload: HostToWebviewMessage = {
          type: 'init',
          payload: {
            bankId,
            question,
            learning,
            noteFileUri: `notes/${qid}.md`,
            preferences: {
              revealAnswerOnOpen: settings.practice.revealAnswerOnOpen,
            },
          },
        };
        this.postMessage(bankId, qid, initPayload);
        break;
      }

      case 'requestAnswer': {
        const settings = this.settings();
        const payload: AnswerPayload = {
          questionType: question.type,
          answer: deriveQuestionAnswer(question, {
            includeKeywords: settings.display.showKeywords,
            includeCodeDetails: settings.display.showCodeDetails,
          }),
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

      case 'openNote': {
        await this.deps.onOpenNote?.(
          bankId,
          qid,
          learningMap,
          this.settings().practice.noteOpenMode,
        );
        break;
      }

      case 'shareMarkdown': {
        const defaultDirectory =
          vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(
            defaultDirectory,
            questionMarkdownFileName(question.title),
          ),
          filters: { Markdown: ['md'] },
          saveLabel: '导出 Markdown',
          title: '选择分享文件的保存位置',
        });

        if (!target) {
          this.postMessage(bankId, qid, { type: 'shareAck', ok: false, cancelled: true });
          break;
        }

        try {
          const answerFiles = await this.readAnswerFiles(bankId, qid);
          const markdown = buildQuestionMarkdown(question, answerFiles);
          await vscode.workspace.fs.writeFile(target, Buffer.from(markdown, 'utf8'));
          this.postMessage(bankId, qid, {
            type: 'shareAck',
            ok: true,
            fileName: target.path.split('/').pop() ?? target.path,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.postMessage(bankId, qid, { type: 'shareAck', ok: false, reason });
        }
        break;
      }

      case 'copyForAi': {
        try {
          const [answerFiles, note] = await Promise.all([
            this.readAnswerFiles(bankId, qid),
            this.readNoteContent(bankId, qid),
          ]);
          const learning = getOrDefault(learningMap.get(qid));
          const settings = this.settings();
          const text = buildQuestionPlainText(question, answerFiles, learning, note, {
            includeReferenceAnswer: settings.copy.includeReferenceAnswer,
            includeRawQuestionJson: settings.copy.includeRawQuestionJson,
          });
          await vscode.env.clipboard.writeText(text);
          this.postMessage(bankId, qid, { type: 'copyAck', ok: true });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.postMessage(bankId, qid, { type: 'copyAck', ok: false, reason });
        }
        break;
      }

      case 'openNativeEditor': {
        if (msg.target === 'note') {
          await this.deps.onOpenNote?.(bankId, qid, learningMap, 'editor');
        } else {
          await this.deps.onOpenProject?.(bankId, qid, question, learningMap);
        }
        break;
      }

      case 'requestNotePreview': {
        await this.deps.onOpenNote?.(bankId, qid, learningMap, 'preview');
        break;
      }
    }
  }

  /** Read every text file in the question project, preferring unsaved editor content. */
  private async readAnswerFiles(bankId: string, qid: string): Promise<SharedAnswerFile[]> {
    const files = await this.deps.storage.userData.listQuestionProjectFiles(bankId, qid);
    const answers: SharedAnswerFile[] = [];

    for (const file of files) {
      // 画板作答不读取原始 JSON：分享 / 复制时由构建器渲染占位说明即可。
      if (isExcalidrawFile(file.relativePath)) {
        answers.push({ relativePath: file.relativePath, content: '' });
        continue;
      }

      const openDocument = vscode.workspace.textDocuments.find(
        (document) => document.uri.toString() === file.uri.toString(),
      );
      if (openDocument) {
        answers.push({ relativePath: file.relativePath, content: openDocument.getText() });
        continue;
      }

      const bytes = await vscode.workspace.fs.readFile(file.uri);
      // Ignore obvious binary assets in a project; they cannot be represented usefully as Markdown text.
      if (bytes.includes(0)) continue;
      answers.push({ relativePath: file.relativePath, content: Buffer.from(bytes).toString('utf8') });
    }

    return answers;
  }

  /** Read the note while preferring any unsaved editor buffer. */
  private async readNoteContent(bankId: string, qid: string): Promise<string | undefined> {
    const noteUri = this.deps.storage.userData.getNoteUri(bankId, qid);
    const openDocument = vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === noteUri.toString(),
    );
    if (openDocument) return openDocument.getText();
    return this.deps.storage.userData.readNote(bankId, qid);
  }

  private settings(): ForgeQSettings {
    return this.deps.getSettings?.() ?? DEFAULT_FORGEQ_SETTINGS;
  }
}
