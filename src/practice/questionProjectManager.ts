/**
 * 单题项目管理：一道题对应一个目录，目录中可包含任意数量的关联文件。
 */

import * as vscode from 'vscode';

import type { Storage } from '../storage/storage.js';
import type { QuestionProjectFile } from '../storage/userDataStore.js';
import type { Question } from '../types/question.js';

interface ProjectPickItem extends vscode.QuickPickItem {
  action: 'file' | 'new' | 'terminal' | 'folder';
  fileUri?: vscode.Uri;
}

interface InitialPickItem extends vscode.QuickPickItem {
  action: 'preset' | 'custom' | 'empty';
  fileName?: string;
}

export interface QuestionProjectContext {
  bankId: string;
  question: Question;
}

export interface QuestionProjectManagerOptions {
  onFileOpened?: (uri: vscode.Uri, bankId: string, qid: string) => void;
}

export interface QuestionProjectOpenOptions {
  /** Existing answers open immediately; project-toolbar actions can still request the full menu. */
  directIfExists?: boolean;
}

const PRESET_FILES: ReadonlyArray<{ label: string; description: string; fileName: string }> = [
  { label: '$(file-code) JavaScript 文件', description: '创建 index.js', fileName: 'index.js' },
  { label: '$(file-code) JSX 文件', description: '创建 App.jsx', fileName: 'App.jsx' },
  { label: '$(file-code) Java 文件', description: '创建 Main.java', fileName: 'Main.java' },
  { label: '$(file-code) Go 文件', description: '创建 main.go', fileName: 'main.go' },
  { label: '$(file-code) C 文件', description: '创建 main.c', fileName: 'main.c' },
  { label: '$(file-code) Python 文件', description: '创建 main.py', fileName: 'main.py' },
  { label: '$(markdown) Markdown 文件', description: '创建 answer.md', fileName: 'answer.md' },
];

/**
 * 负责项目首次初始化、文件选择、继续添加文件及运行入口。
 */
export class QuestionProjectManager {
  constructor(
    private readonly storage: Storage,
    private readonly options: QuestionProjectManagerOptions = {},
  ) {}

  async open(
    context: QuestionProjectContext,
    openOptions: QuestionProjectOpenOptions = {},
  ): Promise<void> {
    const { bankId, question } = context;
    const qid = question.id;
    const root = await this.storage.userData.ensureQuestionProject(bankId, qid);

    const migrated = await this.migrateLegacyAnswers(bankId, question);
    if (migrated) {
      await this.openFile(migrated, bankId, qid);
      return;
    }

    const files = await this.storage.userData.listQuestionProjectFiles(bankId, qid);
    if (files.length === 0) {
      await this.initialiseProject(root, context);
      return;
    }

    if (openOptions.directIfExists) {
      await this.openFile(this.primaryAnswerFile(files).uri, bankId, qid);
      return;
    }

    const items: ProjectPickItem[] = [
      { label: '$(new-file) 新建文件', description: '支持 src/App.jsx 等子目录', action: 'new' },
      { label: '$(terminal) 在项目目录打开终端', action: 'terminal' },
      { label: '$(folder-opened) 在新窗口打开整个项目', action: 'folder' },
      ...files.map((file) => ({
        label: `$(file) ${file.relativePath}`,
        description: '打开已有文件',
        action: 'file' as const,
        fileUri: file.uri,
      })),
    ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `选择“${question.title}”的项目文件`,
      matchOnDescription: true,
    });
    if (!picked) return;

    switch (picked.action) {
      case 'file':
        if (picked.fileUri) await this.openFile(picked.fileUri, bankId, qid);
        return;
      case 'new':
        await this.createCustomFile(context);
        return;
      case 'terminal': {
        const terminal = vscode.window.createTerminal({
          name: `练习: ${question.title}`,
          cwd: root,
        });
        terminal.show();
        return;
      }
      case 'folder':
        await vscode.commands.executeCommand('vscode.openFolder', root, true);
        return;
    }
  }

  /** Pick a stable primary answer when a project contains more than one file. */
  private primaryAnswerFile(files: ReadonlyArray<QuestionProjectFile>): QuestionProjectFile {
    const preferredNames = [
      'index.js',
      'Main.java',
      'main.go',
      'main.c',
      'main.py',
      'answer.md',
      'App.jsx',
      // 兼容升级前已经创建的 TypeScript 项目。
      'index.ts',
      'App.tsx',
    ];
    for (const name of preferredNames) {
      const match = files.find(
        (file) => file.relativePath === name || file.relativePath.endsWith(`/${name}`),
      );
      if (match) return match;
    }
    return files[0]!;
  }

  private async initialiseProject(
    root: vscode.Uri,
    context: QuestionProjectContext,
  ): Promise<void> {
    const presets: InitialPickItem[] = PRESET_FILES.map((preset) => ({
      label: preset.label,
      description: preset.description,
      fileName: preset.fileName,
      action: 'preset',
    }));
    const items: InitialPickItem[] = [
      ...presets,
      { label: '$(new-file) 自定义文件名', description: '例如 src/components/App.jsx', action: 'custom' },
      {
        label: '$(folder) 空项目文件夹',
        description: '在当前窗口创建并打开默认 index.js',
        action: 'empty',
      },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `为“${context.question.title}”创建练习文件`,
    });
    if (!picked) return;

    if (picked.action === 'empty') {
      const uri = await this.storage.userData.ensureQuestionProjectFile(
        context.bankId,
        context.question.id,
        'index.js',
      );
      await this.openFile(uri, context.bankId, context.question.id);
      this.addProjectToWorkspace(root, context.question);
      return;
    }
    if (picked.action === 'custom') {
      await this.createCustomFile(context);
      return;
    }
    if (picked.fileName) {
      const uri = await this.storage.userData.ensureQuestionProjectFile(
        context.bankId,
        context.question.id,
        picked.fileName,
      );
      await this.openFile(uri, context.bankId, context.question.id);
    }
  }

  /** Add the per-question project as a root so VS Code Explorer can display its directory tree. */
  private addProjectToWorkspace(root: vscode.Uri, question: Question): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const alreadyAdded = folders.some((folder) => folder.uri.toString() === root.toString());
    if (alreadyAdded) return;

    const added = vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
      uri: root,
      name: `练习：${question.shortTitle ?? question.title}`,
    });
    if (!added) {
      void vscode.window.showWarningMessage('无法把题目项目添加到当前工作区，请稍后重试。');
    }
  }

  private async createCustomFile(context: QuestionProjectContext): Promise<void> {
    const fileName = await vscode.window.showInputBox({
      title: '新建题目项目文件',
      prompt: '输入文件名或相对路径，例如 index.js、App.jsx、src/utils.js',
      placeHolder: 'src/App.jsx',
      validateInput: (value) => validateRelativeFilePath(value),
    });
    if (!fileName) return;

    const uri = await this.storage.userData.ensureQuestionProjectFile(
      context.bankId,
      context.question.id,
      fileName,
    );
    await this.openFile(uri, context.bankId, context.question.id);
  }

  /**
   * 首次升级时复制旧单文件答案；只复制非空内容，不删除旧文件。
   */
  private async migrateLegacyAnswers(
    bankId: string,
    question: Question,
  ): Promise<vscode.Uri | undefined> {
    const currentFiles = await this.storage.userData.listQuestionProjectFiles(bankId, question.id);
    if (currentFiles.length > 0) return undefined;

    const markdown = await this.storage.userData.readPracticeContent(
      bankId,
      question.id,
      'qa',
      '.md',
    );
    if (markdown !== undefined && markdown.length > 0) {
      return this.storage.userData.ensureQuestionProjectFile(
        bankId,
        question.id,
        'answer.md',
        markdown,
      );
    }

    if (question.type === 'code') {
      const ext = legacyCodeExtension(question.language);
      const code = await this.storage.userData.readPracticeContent(
        bankId,
        question.id,
        'code',
        ext,
      );
      if (code !== undefined && code.length > 0) {
        return this.storage.userData.ensureQuestionProjectFile(
          bankId,
          question.id,
          `answer${ext}`,
          code,
        );
      }
    }
    return undefined;
  }

  private async openFile(
    uri: vscode.Uri,
    bankId: string,
    qid: string,
  ): Promise<void> {
    this.options.onFileOpened?.(uri, bankId, qid);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
      preserveFocus: false,
    });
  }
}

function validateRelativeFilePath(value: string): string | undefined {
  const normalized = value.trim().replace(/\\/g, '/');
  if (normalized.length === 0) return '请输入文件名';
  if (normalized.startsWith('/') || normalized.endsWith('/')) return '请输入项目内的相对文件路径';
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return '路径不能包含空目录、. 或 ..';
  }
  return undefined;
}

function legacyCodeExtension(language: string | undefined): string {
  switch (language?.trim().toLowerCase()) {
    case 'javascript':
    case 'js':
      return '.js';
    case 'jsx':
    case 'react':
      return '.jsx';
    case 'typescript':
    case 'ts':
      return '.ts';
    case 'tsx':
      return '.tsx';
    case 'html':
      return '.html';
    case 'css':
      return '.css';
    default:
      return '.txt';
  }
}
