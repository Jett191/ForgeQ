/**
 * 单题项目管理：一道题对应一个目录，目录中可包含任意数量的关联文件。
 */

import * as vscode from 'vscode';

import {
  DEFAULT_FORGEQ_SETTINGS,
  type DefaultProjectFile,
  type ForgeQSettings,
} from '../config/settings.js';
import type { Storage } from '../storage/storage.js';
import type { QuestionProjectFile } from '../storage/userDataStore.js';
import type { Question } from '../types/question.js';
import {
  EXCALIDRAW_EDITOR_VIEW_TYPE,
  EXCALIDRAW_EXTENSION_ID,
  isExcalidrawFile,
} from './excalidraw.js';

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
  getSettings?: () => ForgeQSettings;
}

export interface QuestionProjectOpenOptions {
  /** Existing answers open immediately; project-toolbar actions can still request the full menu. */
  directIfExists?: boolean;
  /** Keep the current editor focused while revealing the answer in the left column. */
  preserveFocus?: boolean;
}

const PRESET_FILES: ReadonlyArray<{ label: string; description: string; fileName: string }> = [
  { label: '$(file-code) JavaScript 文件', description: '创建 index.js', fileName: 'index.js' },
  { label: '$(file-code) JSX 文件', description: '创建 App.jsx', fileName: 'App.jsx' },
  { label: '$(file-code) TypeScript 文件', description: '创建 index.ts', fileName: 'index.ts' },
  { label: '$(file-code) TSX 文件', description: '创建 App.tsx', fileName: 'App.tsx' },
  { label: '$(file-code) Java 文件', description: '创建 Main.java', fileName: 'Main.java' },
  { label: '$(file-code) Go 文件', description: '创建 main.go', fileName: 'main.go' },
  { label: '$(file-code) C 文件', description: '创建 main.c', fileName: 'main.c' },
  { label: '$(file-code) Python 文件', description: '创建 main.py', fileName: 'main.py' },
  { label: '$(markdown) Markdown 文件', description: '创建 answer.md', fileName: 'answer.md' },
  { label: '$(pencil) 画板（Excalidraw）', description: '创建 answer.excalidraw', fileName: 'answer.excalidraw' },
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
      await this.openFile(migrated, bankId, qid, openOptions.preserveFocus);
      return;
    }

    const files = await this.storage.userData.listQuestionProjectFiles(bankId, qid);
    if (files.length === 0) {
      await this.initialiseProject(root, context);
      return;
    }

    if (openOptions.directIfExists) {
      await this.openFile(
        this.primaryAnswerFile(files).uri,
        bankId,
        qid,
        openOptions.preserveFocus,
      );
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
    const configuredFile = defaultFileName(
      this.settings().practice.defaultProjectFile,
      context.question,
    );
    if (configuredFile !== undefined) {
      await this.createInitialFile(context, configuredFile);
      return;
    }

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
      await this.createCustomFile(context, true);
      return;
    }
    if (picked.fileName) {
      await this.createInitialFile(context, picked.fileName);
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

  private async createCustomFile(
    context: QuestionProjectContext,
    useQuestionTemplate = false,
  ): Promise<void> {
    const fileName = await vscode.window.showInputBox({
      title: '新建题目项目文件',
      prompt: '输入文件名或相对路径，例如 index.js、App.jsx、src/utils.js',
      placeHolder: 'src/App.jsx',
      validateInput: (value) => validateRelativeFilePath(value),
    });
    if (!fileName) return;

    const initialContent = useQuestionTemplate
      ? this.initialContentFor(fileName, context.question)
      : '';
    const uri = initialContent.length > 0
      ? await this.storage.userData.ensureQuestionProjectFile(
          context.bankId,
          context.question.id,
          fileName,
          initialContent,
        )
      : await this.storage.userData.ensureQuestionProjectFile(
          context.bankId,
          context.question.id,
          fileName,
        );
    await this.openFile(uri, context.bankId, context.question.id);
  }

  private async createInitialFile(
    context: QuestionProjectContext,
    fileName: string,
  ): Promise<void> {
    const initialContent = this.initialContentFor(fileName, context.question);
    const uri = initialContent.length > 0
      ? await this.storage.userData.ensureQuestionProjectFile(
          context.bankId,
          context.question.id,
          fileName,
          initialContent,
        )
      : await this.storage.userData.ensureQuestionProjectFile(
          context.bankId,
          context.question.id,
          fileName,
        );
    await this.openFile(uri, context.bankId, context.question.id);
  }

  private initialContent(question: Question): string {
    if (!this.settings().practice.prefillFromQuestionTemplate || question.type !== 'code') {
      return '';
    }
    return question.initialCode ?? question.codeTemplate ?? '';
  }

  /**
   * 计算某个作答文件的初始内容。画板文件始终从空白开始（Excalidraw 编辑器会把
   * 空文件初始化为空场景），不写入题目的代码模板；其余文件沿用 `initialContent`。
   */
  private initialContentFor(fileName: string, question: Question): string {
    if (isExcalidrawFile(fileName)) {
      return '';
    }
    return this.initialContent(question);
  }

  private settings(): ForgeQSettings {
    return this.options.getSettings?.() ?? DEFAULT_FORGEQ_SETTINGS;
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
    preserveFocus = false,
  ): Promise<void> {
    this.options.onFileOpened?.(uri, bankId, qid);
    // 画板作答走自定义编辑器，以手绘画板方式打开，绝不退回 JSON 文本编辑器。
    if (isExcalidrawFile(uri.path)) {
      await this.openExcalidrawFile(uri, preserveFocus);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
      preserveFocus,
    });
  }

  /**
   * 以 Excalidraw 画板方式在左侧列打开作答文件。
   *
   * 关键：**不**用 `vscode.extensions` 预检是否安装。Excalidraw 是 web-capable 扩展，
   * VS Code 常把它放到「Web Worker 扩展宿主」运行；而 ForgeQ 运行在「Node 本地扩展
   * 宿主」。`vscode.extensions.all` / `getExtension` 只能看到**同一个宿主**里的扩展，
   * 因此看不到它 —— 这正是「明明装了、手动能打开 .excalidraw 画板，预检却误报未安装」
   * 的根因。
   *
   * 而 `vscode.openWith` 是 VS Code 内置命令，会**跨扩展宿主**解析编辑器，能正确命中。
   * 因此这里直接乐观打开：成功即画板；仅当没有任何编辑器能处理该 viewType（通常即
   * 未安装扩展）导致命令 reject 时，才提示安装，绝不退回 JSON 文本编辑器。
   * `preserveFocus` 透传，满足「切换题目标签时左侧画板自动切换但不抢走右侧焦点」。
   */
  private async openExcalidrawFile(uri: vscode.Uri, preserveFocus: boolean): Promise<void> {
    try {
      await vscode.commands.executeCommand('vscode.openWith', uri, EXCALIDRAW_EDITOR_VIEW_TYPE, {
        viewColumn: vscode.ViewColumn.One,
        preview: false,
        preserveFocus,
      });
    } catch (error) {
      console.warn('[ForgeQ] 以 Excalidraw 画板方式打开失败（通常是未安装扩展）：', error);
      await this.promptInstallExcalidrawEditor();
    }
  }

  /** 提示用户安装 Excalidraw 编辑器扩展，并在确认后触发安装。 */
  private async promptInstallExcalidrawEditor(): Promise<void> {
    const install = '安装扩展';
    const choice = await vscode.window.showWarningMessage(
      '画板作答需要 Excalidraw 编辑器扩展（pomdtr.excalidraw-editor）。请安装后重试；'
        + '如果刚安装，可能需要重新启动扩展开发宿主（重新按 F5）。',
      install,
    );
    if (choice === install) {
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        EXCALIDRAW_EXTENSION_ID,
      );
    }
  }
}

const CONFIGURED_FILE_NAMES: Readonly<Record<Exclude<DefaultProjectFile, 'ask' | 'auto'>, string>> = {
  javascript: 'index.js',
  jsx: 'App.jsx',
  typescript: 'index.ts',
  tsx: 'App.tsx',
  java: 'Main.java',
  go: 'main.go',
  c: 'main.c',
  python: 'main.py',
  markdown: 'answer.md',
  excalidraw: 'answer.excalidraw',
};

function defaultFileName(setting: DefaultProjectFile, question: Question): string | undefined {
  if (setting === 'ask') return undefined;
  if (setting !== 'auto') return CONFIGURED_FILE_NAMES[setting];
  if (question.type === 'qa') return 'answer.md';

  switch (question.language?.trim().toLowerCase()) {
    case 'jsx':
    case 'react':
      return 'App.jsx';
    case 'typescript':
    case 'ts':
      return 'index.ts';
    case 'tsx':
      return 'App.tsx';
    case 'java':
      return 'Main.java';
    case 'go':
    case 'golang':
      return 'main.go';
    case 'c':
      return 'main.c';
    case 'python':
    case 'py':
      return 'main.py';
    case 'html':
      return 'index.html';
    case 'css':
      return 'styles.css';
    case 'markdown':
    case 'md':
      return 'answer.md';
    case 'javascript':
    case 'js':
    default:
      return 'index.js';
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

