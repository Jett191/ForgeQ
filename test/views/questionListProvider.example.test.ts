/**
 * EXAMPLE - QuestionListProvider 空 bank / 空筛选结果文案（Task 17.3）
 *
 * Validates: Requirements 3.5, 3.6, 4.9
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ scheme: 'file', path: p, fsPath: p }),
    joinPath: (base: { path: string }, ...segments: string[]) => {
      const joined = [base.path, ...segments].join('/');
      return { scheme: 'file', path: joined, fsPath: joined };
    },
    parse: (v: string) => ({ scheme: 'file', path: v, fsPath: v }),
  },
  EventEmitter: class {
    event = () => {};
    fire() {}
    dispose() {}
  },
  TreeItem: class {
    label: string;
    collapsibleState: number;
    description?: string;
    iconPath?: unknown;
    command?: unknown;
    contextValue?: string;
    tooltip?: string;
    constructor(label: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState ?? 0;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    id: string;
    color: unknown;
    constructor(id: string, color?: unknown) {
      this.id = id;
      this.color = color;
    }
  },
  ThemeColor: class {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
}));

// eslint-disable-next-line import/first
import { QuestionListProvider } from '../../src/views/questionListProvider.js';
// eslint-disable-next-line import/first
import type { BankSummary } from '../../src/types/bankMeta.js';
// eslint-disable-next-line import/first
import type { QuestionBank } from '../../src/types/question.js';

describe('QuestionListProvider example', () => {
  it('空 bank -> 显示 "当前没有题目，请先导入题库" 消息', () => {
    const provider = new QuestionListProvider({ debounceMs: 0 });
    // No bank set
    const children = provider.getChildren(undefined);
    expect(children).toHaveLength(1);
    expect(children[0]!.kind).toBe('message');
    if (children[0]!.kind === 'message') {
      expect(children[0]!.text).toBe('当前没有题目，请先导入题库');
    }
  });

  it('筛选条件无匹配 -> 显示 "当前筛选条件下没有匹配题目" 消息', () => {
    const provider = new QuestionListProvider({ debounceMs: 0 });

    const bank: QuestionBank = {
      name: 'Test',
      version: '1.0',
      questions: [
        {
          id: 'q1',
          type: 'code',
          title: 'Q1',
          content: 'C1',
          category: 'JS',
          tags: ['js'],
          difficulty: 'easy',
          answer: 'a',
        },
      ],
    };
    const summary: BankSummary = {
      id: 'b1',
      name: bank.name,
      version: bank.version,
      questionCount: 1,
      importedAt: Date.now(),
    };
    provider.setBank(bank, summary, new Map());

    // Set filter that won't match any question
    provider.setFilter({ difficulty: 'hard' });

    // Need to get bank node first
    const topLevel = provider.getChildren(undefined);
    expect(topLevel).toHaveLength(1);
    const bankNode = topLevel[0]!;
    expect(bankNode.kind).toBe('bank');

    // Get children - should show filter no-match message
    const children = provider.getChildren(bankNode);
    expect(children).toHaveLength(1);
    expect(children[0]!.kind).toBe('message');
    if (children[0]!.kind === 'message') {
      expect(children[0]!.text).toBe('当前筛选条件下没有匹配题目');
    }
  });

  it('有题目时展示所有题目', () => {
    // 该用例锚定"扁平模式下 children 直接是 question 序列"的契约。
    // 分类分组在多 category 下会引入中间 category 层，单独由其它用例覆盖，
    // 这里显式关闭以保持本断言的语义清晰。
    const provider = new QuestionListProvider({ debounceMs: 0, groupByCategory: false });

    const bank: QuestionBank = {
      name: 'MyBank',
      version: '2.0',
      questions: [
        {
          id: 'q1',
          type: 'code',
          title: 'First',
          content: '',
          category: 'JS',
          tags: [],
          difficulty: 'easy',
          answer: '',
        },
        {
          id: 'q2',
          type: 'qa',
          title: 'Second',
          content: '',
          category: 'CSS',
          tags: [],
          difficulty: 'medium',
          answer: '',
        },
      ],
    };
    const summary: BankSummary = {
      id: 'b1',
      name: bank.name,
      version: bank.version,
      questionCount: 2,
      importedAt: Date.now(),
    };
    provider.setBank(bank, summary, new Map());

    const topLevel = provider.getChildren(undefined);
    const bankNode = topLevel[0]!;
    const children = provider.getChildren(bankNode);

    expect(children).toHaveLength(2);
    expect(children[0]!.kind).toBe('question');
    expect(children[1]!.kind).toBe('question');
    if (children[0]!.kind === 'question') {
      expect(children[0]!.question.id).toBe('q1');
    }
    if (children[1]!.kind === 'question') {
      expect(children[1]!.question.id).toBe('q2');
    }
  });
});
