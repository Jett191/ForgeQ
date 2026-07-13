/**
 * EXAMPLE - PracticeController open(qid) 行为测试（Task 19）
 *
 * Validates: Requirements 5.1, 5.3, 6.1, 6.3
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Track calls for assertions
const openTextDocumentCalls: unknown[] = [];
const showTextDocumentCalls: unknown[] = [];
const createWebviewPanelCalls: unknown[] = [];
const layoutCallOrder: string[] = [];
const mockPostMessage = vi.fn();
const changeTextDocumentHandlers: Array<(event: { document: { uri: unknown } }) => void> = [];
const webviewMessageHandlers: Array<(message: unknown) => Promise<void>> = [];

const { harness } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  return { harness: mod.createMemFsHarness() };
});

vi.mock('vscode', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  const base = mod.createVscodeModuleMock(harness);
  return {
    ...base,
    ViewColumn: { One: 1, Two: 2, Three: 3 },
    window: {
      ...base.window,
      showQuickPick: async (items: Array<{ fileName?: string; action?: string }>) =>
        items.find((item) => item.fileName === 'index.js') ??
        items.find((item) => item.action === 'file'),
      showInputBox: async () => undefined,
      createTerminal: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
      showTextDocument: async (doc: unknown, column?: unknown) => {
        layoutCallOrder.push('answer');
        showTextDocumentCalls.push({ doc, column });
        return {};
      },
      createWebviewPanel: (viewType: string, title: string, column: unknown, opts: unknown) => {
        layoutCallOrder.push('question');
        createWebviewPanelCalls.push({ viewType, title, column, opts });
        return {
          webview: {
            html: '',
            onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
              webviewMessageHandlers.push(handler);
              return { dispose: vi.fn() };
            }),
            postMessage: mockPostMessage,
            asWebviewUri: (uri: unknown) => uri,
            cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
          },
          onDidDispose: vi.fn(),
          reveal: vi.fn(),
          dispose: vi.fn(),
        };
      },
    },
    workspace: {
      ...base.workspace,
      openTextDocument: async (uri: unknown) => {
        openTextDocumentCalls.push(uri);
        return { uri };
      },
      onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeTextDocument: vi.fn((handler: (event: { document: { uri: unknown } }) => void) => {
        changeTextDocumentHandlers.push(handler);
        return { dispose: vi.fn() };
      }),
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

// eslint-disable-next-line import/first
import { Storage } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import { PracticeController } from '../../src/practice/practiceController.js';
// eslint-disable-next-line import/first
import type { QuestionBank, CodeQuestion, QAQuestion } from '../../src/types/question.js';
// eslint-disable-next-line import/first
import { HarnessUri } from '../harness/memFsHarness.js';

const CODE_QUESTION: CodeQuestion = {
  id: 'q-code-1',
  type: 'code',
  title: 'Implement sum',
  content: 'Write a sum function',
  category: 'JS',
  tags: ['basic'],
  difficulty: 'easy',
  answer: 'function sum(a, b) { return a + b; }',
  language: 'typescript',
};

const QA_QUESTION: QAQuestion = {
  id: 'q-qa-1',
  type: 'qa',
  title: 'What is closure?',
  content: 'Explain closure in JavaScript',
  category: 'JS',
  tags: ['scope'],
  difficulty: 'medium',
  answer: 'A closure is a function with access to its outer scope.',
};

const BANK: QuestionBank = {
  name: 'TestBank',
  version: '1.0',
  questions: [CODE_QUESTION, QA_QUESTION],
};

describe('PracticeController open(qid)', () => {
  beforeEach(() => {
    harness.reset();
    openTextDocumentCalls.length = 0;
    showTextDocumentCalls.length = 0;
    createWebviewPanelCalls.length = 0;
    layoutCallOrder.length = 0;
    changeTextDocumentHandlers.length = 0;
    webviewMessageHandlers.length = 0;
    mockPostMessage.mockClear();
  });

  it('代码题首次打开时创建单题项目文件并创建 WebviewPanel', async () => {
    const ctx = harness.createExtensionContext();
    (ctx as any).extensionUri = HarnessUri.file('/ext');
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();

    // Install a bank to activate it
    await storage.installBank(BANK);

    // Reload state
    const state = await storage.bootstrap();
    const ensureProjectFile = vi.spyOn(storage.userData, 'ensureQuestionProjectFile');

    const controller = new PracticeController(ctx as any, storage, state);

    await controller.open('q-code-1');

    // openTextDocument should have been called
    expect(openTextDocumentCalls.length).toBe(1);

    // showTextDocument should have been called with ViewColumn.One
    expect(showTextDocumentCalls.length).toBe(1);
    expect(showTextDocumentCalls[0]).toHaveProperty('column.viewColumn', 1);
    expect(ensureProjectFile).toHaveBeenCalledWith(
      state.currentBank!.bankId,
      'q-code-1',
      'index.js',
    );

    // WebviewPanel should have been created
    expect(createWebviewPanelCalls.length).toBe(1);
    expect(createWebviewPanelCalls[0]).toHaveProperty('title', 'Implement sum');
    expect(createWebviewPanelCalls[0]).toHaveProperty('column', 2);
    expect(layoutCallOrder).toEqual(['answer', 'question']);

    controller.dispose();
  });

  it('问答题也可选择项目文件并与 WebviewPanel 同时打开', async () => {
    const ctx = harness.createExtensionContext();
    (ctx as any).extensionUri = HarnessUri.file('/ext');
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();

    await storage.installBank(BANK);
    const state = await storage.bootstrap();

    const controller = new PracticeController(ctx as any, storage, state);

    await controller.open('q-qa-1');

    // openTextDocument called for QA file
    expect(openTextDocumentCalls.length).toBe(1);

    // showTextDocument called
    expect(showTextDocumentCalls.length).toBe(1);

    // WebviewPanel created with QA title
    expect(createWebviewPanelCalls.length).toBe(1);
    expect(createWebviewPanelCalls[0]).toHaveProperty('title', 'What is closure?');

    controller.dispose();
  });

  it('题目不存在时不执行任何操作', async () => {
    const ctx = harness.createExtensionContext();
    (ctx as any).extensionUri = HarnessUri.file('/ext');
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();

    await storage.installBank(BANK);
    const state = await storage.bootstrap();

    const controller = new PracticeController(ctx as any, storage, state);

    await controller.open('nonexistent-qid');

    expect(openTextDocumentCalls.length).toBe(0);
    expect(showTextDocumentCalls.length).toBe(0);
    expect(createWebviewPanelCalls.length).toBe(0);

    controller.dispose();
  });

  it('不同题库中相同 qid 会创建彼此独立的 WebviewPanel', async () => {
    const ctx = harness.createExtensionContext();
    (ctx as any).extensionUri = HarnessUri.file('/ext');
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();
    await storage.installBank(BANK);
    const state = await storage.bootstrap();
    const controller = new PracticeController(ctx as any, storage, state);

    await controller.open('q-code-1');
    state.currentBank = {
      bankId: 'bank-2',
      bank: { ...BANK, name: 'Second bank' },
      learning: new Map(),
    };
    await controller.open('q-code-1');

    expect(createWebviewPanelCalls).toHaveLength(2);
    controller.dispose();
  });

  it('旧题库文档变更只更新其绑定的 learning map', async () => {
    vi.useFakeTimers();
    try {
      const ctx = harness.createExtensionContext();
      (ctx as any).extensionUri = HarnessUri.file('/ext');
      const storage = await Storage.create(ctx as any);
      await storage.bootstrap();
      await storage.installBank(BANK);
      const state = await storage.bootstrap();
      const oldLearning = state.currentBank!.learning;
      const writeSpy = vi.spyOn(storage, 'writeWithRollback').mockImplementation(async (params) => {
        params.applyMemory(params.next);
        return { ok: true, value: undefined };
      });
      const controller = new PracticeController(ctx as any, storage, state);

      await controller.open('q-code-1');
      const oldUri = openTextDocumentCalls[0];
      const newLearning = new Map();
      state.currentBank = {
        bankId: 'bank-2',
        bank: { ...BANK, name: 'Second bank' },
        learning: newLearning,
      };

      changeTextDocumentHandlers[0]!({ document: { uri: oldUri } });
      await vi.advanceTimersByTimeAsync(1000);

      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(oldLearning.get('q-code-1')?.lastPracticedAt).toEqual(expect.any(Number));
      expect(newLearning.has('q-code-1')).toBe(false);
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('收藏状态保存成功后通知外层刷新当前题库视图', async () => {
    const ctx = harness.createExtensionContext();
    (ctx as any).extensionUri = HarnessUri.file('/ext');
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();
    await storage.installBank(BANK);
    const state = await storage.bootstrap();
    const bankId = state.currentBank!.bankId;
    vi.spyOn(storage, 'writeWithRollback').mockImplementation(async (params) => {
      params.applyMemory(params.next);
      return { ok: true, value: undefined };
    });
    const onLearningChanged = vi.fn();
    const controller = new PracticeController(ctx as any, storage, state, {
      onLearningChanged,
    });

    await controller.open('q-code-1');
    await webviewMessageHandlers[0]!({ type: 'toggleFavorite' });

    expect(onLearningChanged).toHaveBeenCalledWith(bankId, 'q-code-1');
    expect(state.currentBank!.learning.get('q-code-1')?.favoriteFlag).toBe(true);
    controller.dispose();
  });

  it('未掌握与错题是两个独立操作', async () => {
    const ctx = harness.createExtensionContext();
    (ctx as any).extensionUri = HarnessUri.file('/ext');
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();
    await storage.installBank(BANK);
    const state = await storage.bootstrap();
    vi.spyOn(storage, 'writeWithRollback').mockImplementation(async (params) => {
      params.applyMemory(params.next);
      return { ok: true, value: undefined };
    });
    const controller = new PracticeController(ctx as any, storage, state);

    await controller.open('q-code-1');
    const handler = webviewMessageHandlers[0]!;
    await handler({ type: 'setMastery', value: 'not_mastered' });

    expect(state.currentBank!.learning.get('q-code-1')).toMatchObject({
      mastery: 'not_mastered',
      wrongFlag: false,
    });

    await handler({ type: 'toggleWrong' });
    expect(state.currentBank!.learning.get('q-code-1')).toMatchObject({
      mastery: 'not_mastered',
      wrongFlag: true,
    });
    controller.dispose();
  });
});
