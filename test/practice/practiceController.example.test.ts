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
const mockPostMessage = vi.fn();

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
      showTextDocument: async (doc: unknown, column?: unknown) => {
        showTextDocumentCalls.push({ doc, column });
        return {};
      },
      createWebviewPanel: (viewType: string, title: string, column: unknown, opts: unknown) => {
        createWebviewPanelCalls.push({ viewType, title, column, opts });
        return {
          webview: {
            onDidReceiveMessage: vi.fn(),
            postMessage: mockPostMessage,
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
      onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
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
    mockPostMessage.mockClear();
  });

  it('代码题: ensurePracticeFile + openTextDocument + showTextDocument(ViewColumn.One) + 创建 WebviewPanel', async () => {
    const ctx = harness.createExtensionContext();
    (ctx as any).extensionUri = HarnessUri.file('/ext');
    const storage = await Storage.create(ctx as any);
    await storage.bootstrap();

    // Install a bank to activate it
    await storage.installBank(BANK);

    // Reload state
    const state = await storage.bootstrap();

    const controller = new PracticeController(ctx as any, storage, state);

    await controller.open('q-code-1');

    // openTextDocument should have been called
    expect(openTextDocumentCalls.length).toBe(1);

    // showTextDocument should have been called with ViewColumn.One
    expect(showTextDocumentCalls.length).toBe(1);
    expect(showTextDocumentCalls[0]).toHaveProperty('column', 1);

    // WebviewPanel should have been created
    expect(createWebviewPanelCalls.length).toBe(1);
    expect(createWebviewPanelCalls[0]).toHaveProperty('title', 'Implement sum');
    expect(createWebviewPanelCalls[0]).toHaveProperty('column', 2);

    controller.dispose();
  });

  it('问答题: ensurePracticeFile + openTextDocument + showTextDocument + WebviewPanel', async () => {
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
});
