import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  openTextDocument: vi.fn(async (uri: unknown) => ({ uri })),
  showTextDocument: vi.fn(async () => ({})),
  executeCommand: vi.fn(async () => undefined),
  createTerminal: vi.fn(() => ({ show: vi.fn() })),
}));

vi.mock('vscode', () => ({
  ViewColumn: { One: 1 },
  window: {
    showQuickPick: mocks.showQuickPick,
    showInputBox: mocks.showInputBox,
    showTextDocument: mocks.showTextDocument,
    executeCommand: mocks.executeCommand,
    createTerminal: mocks.createTerminal,
  },
  workspace: { openTextDocument: mocks.openTextDocument },
  commands: { executeCommand: mocks.executeCommand },
}));

// eslint-disable-next-line import/first
import { QuestionProjectManager } from '../../src/practice/questionProjectManager.js';
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
      ensureQuestionProjectFile: vi.fn(async (_bankId, _qid, path) => fileUri(path)),
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
