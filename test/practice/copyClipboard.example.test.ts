import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  messageHandler: undefined as ((message: unknown) => Promise<void>) | undefined,
  postMessage: vi.fn(async () => true),
  writeText: vi.fn(async () => undefined),
}));

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, ...segments: string[]) => {
      const path = `${base.path}/${segments.join('/')}`;
      return { path, toString: () => path };
    },
  },
  env: { clipboard: { writeText: mocks.writeText } },
  workspace: {
    textDocuments: [],
    workspaceFolders: [],
    fs: { readFile: vi.fn() },
  },
  window: {
    createWebviewPanel: () => ({
      webview: {
        html: '',
        cspSource: 'vscode-webview-resource:',
        asWebviewUri: (uri: unknown) => uri,
        onDidReceiveMessage: (handler: (message: unknown) => Promise<void>) => {
          mocks.messageHandler = handler;
          return { dispose: vi.fn() };
        },
        postMessage: mocks.postMessage,
      },
      onDidDispose: vi.fn(),
      onDidChangeViewState: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    }),
  },
}));

import { PracticePanel } from '../../src/practice/webview/panel.js';
import type { LearningState } from '../../src/types/learning.js';
import type { QAQuestion } from '../../src/types/question.js';

const QUESTION: QAQuestion = {
  id: 'clipboard-question',
  type: 'qa',
  title: '复制测试',
  content: '这是题目内容。',
  category: '测试',
  tags: ['剪贴板'],
  difficulty: 'easy',
  answer: '这是参考答案。',
};

const LEARNING: LearningState = {
  mastery: 'learning',
  favoriteFlag: false,
  wrongFlag: false,
  hasNote: true,
};

describe('PracticePanel copyForAi', () => {
  beforeEach(() => {
    mocks.messageHandler = undefined;
    mocks.postMessage.mockClear();
    mocks.writeText.mockClear();
  });

  it('writes the complete plain text to the VS Code clipboard and acknowledges success', async () => {
    const noteUri = { path: '/notes/clipboard-question.md', toString: () => '/notes/clipboard-question.md' };
    const storage = {
      getCurrentMeta: () => ({ banks: [{ id: 'bank-1' }] }),
      userData: {
        listQuestionProjectFiles: async () => [],
        getNoteUri: () => noteUri,
        readNote: async () => '我的个人笔记。',
      },
    };
    const panel = new PracticePanel({
      storage: storage as never,
      state: {} as never,
      extensionUri: { path: '/extension', toString: () => '/extension' } as never,
    });

    panel.createOrShow('bank-1', QUESTION.id, QUESTION, new Map([[QUESTION.id, LEARNING]]), 2);
    await mocks.messageHandler?.({ type: 'copyForAi' });

    expect(mocks.writeText).toHaveBeenCalledTimes(1);
    const copied = mocks.writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain('【题目】\n这是题目内容。');
    expect(copied).toContain('【参考答案】');
    expect(copied).toContain('这是参考答案。');
    expect(copied).toContain('【我的笔记】\n我的个人笔记。');
    expect(copied).toContain('【题目原始 JSON】');
    expect(mocks.postMessage).toHaveBeenCalledWith({ type: 'copyAck', ok: true });
  });
});
