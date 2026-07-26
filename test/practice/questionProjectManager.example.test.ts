import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  openTextDocument: vi.fn(async (uri: unknown) => ({ uri })),
  showTextDocument: vi.fn(async () => ({})),
  executeCommand: vi.fn(async () => undefined),
  updateWorkspaceFolders: vi.fn(() => true),
  showWarningMessage: vi.fn(async () => undefined),
  createTerminal: vi.fn(() => ({ show: vi.fn() })),
}));

vi.mock('vscode', () => ({
  ViewColumn: { One: 1 },
  window: {
    showQuickPick: mocks.showQuickPick,
    showInputBox: mocks.showInputBox,
    showTextDocument: mocks.showTextDocument,
    showWarningMessage: mocks.showWarningMessage,
    executeCommand: mocks.executeCommand,
    createTerminal: mocks.createTerminal,
  },
  workspace: {
    openTextDocument: mocks.openTextDocument,
    workspaceFolders: [],
    updateWorkspaceFolders: mocks.updateWorkspaceFolders,
  },
  commands: { executeCommand: mocks.executeCommand },
}));

// eslint-disable-next-line import/first
import { QuestionProjectManager } from '../../src/practice/questionProjectManager.js';
// eslint-disable-next-line import/first
import { DEFAULT_FORGEQ_SETTINGS } from '../../src/config/settings.js';
// eslint-disable-next-line import/first
import type { CodeQuestion } from '../../src/types/question.js';

const root = { path: '/projects/q1', fsPath: '/projects/q1', toString: () => 'file:/projects/q1' };
const fileUri = (path: string) => ({
  path: `/projects/q1/${path}`,
  fsPath: `/projects/q1/${path}`,
  toString: () => `file:/projects/q1/${path}`,
});

const question: CodeQuestion = {
  id: 'q1',
  type: 'code',
  title: '模块练习',
  content: '创建多个模块',
  category: '工程化',
  tags: [],
  difficulty: 'medium',
  answer: '',
  language: 'javascript',
};

function createStorage(files: Array<{ relativePath: string; uri: ReturnType<typeof fileUri> }> = []) {
  return {
    userData: {
      ensureQuestionProject: vi.fn(async () => root),
      listQuestionProjectFiles: vi.fn(async () => files),
      ensureQuestionProjectFile: vi.fn(async (_bankId, _qid, path, _init?: string) => fileUri(path)),
      readPracticeContent: vi.fn(async () => undefined),
    },
  };
}

describe('QuestionProjectManager example', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('空项目首次打开时可选择 JSX，并在原生编辑器打开', async () => {
    const storage = createStorage();
    mocks.showQuickPick.mockImplementation(async (items: Array<{ fileName?: string }>) =>
      items.find((item) => item.fileName === 'App.jsx'),
    );
    const onFileOpened = vi.fn();
    const manager = new QuestionProjectManager(storage as never, { onFileOpened });

    await manager.open({ bankId: 'bank-1', question });

    expect(storage.userData.ensureQuestionProjectFile).toHaveBeenCalledWith(
      'bank-1',
      'q1',
      'App.jsx',
    );
    expect(onFileOpened).toHaveBeenCalledWith(expect.anything(), 'bank-1', 'q1');
    expect(mocks.openTextDocument).toHaveBeenCalledTimes(1);
    expect(mocks.showTextDocument).toHaveBeenCalledWith(expect.anything(), {
      viewColumn: 1,
      preview: false,
      preserveFocus: false,
    });
  });

  it('首次创建列表提供常用前端、后端和 Markdown 预设', async () => {
    const storage = createStorage();
    let shownItems: Array<{ fileName?: string }> = [];
    mocks.showQuickPick.mockImplementation(async (items: Array<{ fileName?: string }>) => {
      shownItems = items;
      return undefined;
    });
    const manager = new QuestionProjectManager(storage as never);

    await manager.open({ bankId: 'bank-1', question });

    expect(shownItems.flatMap((item) => (item.fileName ? [item.fileName] : []))).toEqual([
      'index.js',
      'App.jsx',
      'index.ts',
      'App.tsx',
      'Main.java',
      'main.go',
      'main.c',
      'main.py',
      'answer.md',
    ]);
  });

  it('首次创建代码文件时使用 initialCode 预填内容', async () => {
    const storage = createStorage();
    mocks.showQuickPick.mockImplementation(async (items: Array<{ fileName?: string }>) =>
      items.find((item) => item.fileName === 'index.js'),
    );
    const manager = new QuestionProjectManager(storage as never);

    await manager.open({
      bankId: 'bank-1',
      question: { ...question, initialCode: 'export function solve() {}' },
    });

    expect(storage.userData.ensureQuestionProjectFile).toHaveBeenCalledWith(
      'bank-1',
      'q1',
      'index.js',
      'export function solve() {}',
    );
  });

  it('默认文件设为 auto 时根据 language 直接创建，不弹选择框', async () => {
    const storage = createStorage();
    const manager = new QuestionProjectManager(storage as never, {
      getSettings: () => ({
        ...DEFAULT_FORGEQ_SETTINGS,
        practice: {
          ...DEFAULT_FORGEQ_SETTINGS.practice,
          defaultProjectFile: 'auto',
        },
      }),
    });

    await manager.open({
      bankId: 'bank-1',
      question: { ...question, language: 'java' },
    });

    expect(mocks.showQuickPick).not.toHaveBeenCalled();
    expect(storage.userData.ensureQuestionProjectFile).toHaveBeenCalledWith(
      'bank-1',
      'q1',
      'Main.java',
    );
  });

  it.each(['Main.java', 'main.go', 'main.c', 'main.py'])(
    '首次打开时可创建 %s',
    async (fileName) => {
      const storage = createStorage();
      mocks.showQuickPick.mockImplementation(async (items: Array<{ fileName?: string }>) =>
        items.find((item) => item.fileName === fileName),
      );
      const manager = new QuestionProjectManager(storage as never);

      await manager.open({ bankId: 'bank-1', question });

      expect(storage.userData.ensureQuestionProjectFile).toHaveBeenCalledWith(
        'bank-1',
        'q1',
        fileName,
      );
    },
  );

  it('选择空项目文件夹时在当前窗口创建并打开默认 index.js', async () => {
    const storage = createStorage();
    mocks.showQuickPick.mockImplementation(async (items: Array<{ action: string }>) =>
      items.find((item) => item.action === 'empty'),
    );
    const onFileOpened = vi.fn();
    const manager = new QuestionProjectManager(storage as never, { onFileOpened });

    await manager.open({ bankId: 'bank-1', question });

    expect(storage.userData.ensureQuestionProjectFile).toHaveBeenCalledWith(
      'bank-1',
      'q1',
      'index.js',
    );
    expect(mocks.updateWorkspaceFolders).toHaveBeenCalledWith(0, 0, {
      uri: root,
      name: '练习：模块练习',
    });
    expect(mocks.executeCommand).not.toHaveBeenCalledWith(
      'vscode.openFolder',
      expect.anything(),
      true,
    );
    expect(mocks.showTextDocument).toHaveBeenCalledWith(expect.anything(), {
      viewColumn: 1,
      preview: false,
      preserveFocus: false,
    });
    expect(onFileOpened).toHaveBeenCalledWith(expect.anything(), 'bank-1', 'q1');
  });

  it('已有项目可继续创建嵌套文件', async () => {
    const storage = createStorage([
      { relativePath: 'index.js', uri: fileUri('index.js') },
    ]);
    mocks.showQuickPick.mockImplementation(async (items: Array<{ action: string }>) =>
      items.find((item) => item.action === 'new'),
    );
    mocks.showInputBox.mockResolvedValue('src/components/App.jsx');
    const manager = new QuestionProjectManager(storage as never);

    await manager.open({ bankId: 'bank-1', question });

    expect(storage.userData.ensureQuestionProjectFile).toHaveBeenCalledWith(
      'bank-1',
      'q1',
      'src/components/App.jsx',
    );
  });

  it('从题目列表打开已有作答时跳过选项并直接打开主要回答文件', async () => {
    const storage = createStorage([
      { relativePath: 'notes.txt', uri: fileUri('notes.txt') },
      { relativePath: 'index.js', uri: fileUri('index.js') },
    ]);
    const onFileOpened = vi.fn();
    const manager = new QuestionProjectManager(storage as never, { onFileOpened });

    await manager.open(
      { bankId: 'bank-1', question },
      { directIfExists: true },
    );

    expect(mocks.showQuickPick).not.toHaveBeenCalled();
    expect(mocks.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/projects/q1/index.js' }),
    );
    expect(onFileOpened).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/projects/q1/index.js' }),
      'bank-1',
      'q1',
    );
  });

  it('旧 Markdown 有内容时复制到 answer.md，不删除或覆盖旧文件', async () => {
    const storage = createStorage();
    storage.userData.readPracticeContent.mockResolvedValue('# 我的旧答案');
    const manager = new QuestionProjectManager(storage as never);

    await manager.open({ bankId: 'bank-1', question });

    expect(storage.userData.ensureQuestionProjectFile).toHaveBeenCalledWith(
      'bank-1',
      'q1',
      'answer.md',
      '# 我的旧答案',
    );
    expect(mocks.showQuickPick).not.toHaveBeenCalled();
  });
});
