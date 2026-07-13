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
  MarkdownString: class {
    value: string;
    constructor(value: string) {
      this.value = value;
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
          title: 'First question with a deliberately long complete title',
          shortTitle: 'First',
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
      const item = provider.getTreeItem(children[0]);
      expect(item.label).toBe('First');
    }
    if (children[1]!.kind === 'question') {
      expect(children[1]!.question.id).toBe('q2');
      const item = provider.getTreeItem(children[1]);
      expect(item.label).toBe('Second');
    }
  });

  it('分类分组忽略首尾空白与大小写，并保留首次出现顺序', () => {
    const provider = new QuestionListProvider({ debounceMs: 0 });
    const bank: QuestionBank = {
      name: 'CategoryBank',
      version: '1.0',
      questions: [
        {
          id: 'q1', type: 'code', title: 'First JS', content: '',
          category: ' JavaScript ', tags: [], difficulty: 'easy', answer: '',
        },
        {
          id: 'q2', type: 'qa', title: 'CSS', content: '',
          category: 'CSS', tags: [], difficulty: 'medium', answer: '',
        },
        {
          id: 'q3', type: 'qa', title: 'Second JS', content: '',
          category: 'javascript', tags: [], difficulty: 'hard', answer: '',
        },
      ],
    };
    const summary: BankSummary = {
      id: 'category-bank', name: bank.name, version: bank.version,
      questionCount: bank.questions.length, importedAt: Date.now(),
    };
    provider.setBank(bank, summary, new Map());

    const bankNode = provider.getChildren(undefined)[0]!;
    const groups = provider.getChildren(bankNode);

    expect(groups.map((item) => item.kind === 'category' ? item.category : item.kind)).toEqual([
      'JavaScript',
      'CSS',
    ]);
    expect(groups[0]?.kind).toBe('category');
    if (groups[0]?.kind === 'category') {
      expect(groups[0].questions.map((q) => q.id)).toEqual(['q1', 'q3']);
    }
  });

  it('分类筛选忽略首尾空白与大小写', () => {
    const provider = new QuestionListProvider({ debounceMs: 0 });
    const bank: QuestionBank = {
      name: 'NormalizedFilterBank',
      version: '1.0',
      questions: [
        {
          id: 'q1', type: 'code', title: 'First', content: '',
          category: 'JavaScript', tags: [], difficulty: 'easy', answer: '',
        },
        {
          id: 'q2', type: 'qa', title: 'Second', content: '',
          category: ' javascript ', tags: [], difficulty: 'medium', answer: '',
        },
        {
          id: 'q3', type: 'qa', title: 'Third', content: '',
          category: 'CSS', tags: [], difficulty: 'hard', answer: '',
        },
      ],
    };
    const summary: BankSummary = {
      id: 'normalized-filter-bank', name: bank.name, version: bank.version,
      questionCount: bank.questions.length, importedAt: Date.now(),
    };
    provider.setBank(bank, summary, new Map());
    provider.setFilter({ category: ' JAVASCRIPT ' });

    const bankNode = provider.getChildren(undefined)[0]!;
    const children = provider.getChildren(bankNode);
    expect(children.map((item) => item.kind === 'question' ? item.question.id : item.kind)).toEqual([
      'q1',
      'q2',
    ]);
  });

  it('分类选项跟随其它筛选条件，但不受当前分类筛选限制', () => {
    const provider = new QuestionListProvider({ debounceMs: 0 });
    const bank: QuestionBank = {
      name: 'LinkedFilterBank',
      version: '1.0',
      questions: [
        {
          id: 'q1', type: 'code', title: 'Code JS', content: '',
          category: ' JavaScript ', tags: [], difficulty: 'easy', answer: '',
        },
        {
          id: 'q2', type: 'code', title: 'Code JS duplicate', content: '',
          category: 'javascript', tags: [], difficulty: 'hard', answer: '',
        },
        {
          id: 'q3', type: 'code', title: 'Code CSS', content: '',
          category: 'CSS', tags: [], difficulty: 'easy', answer: '',
        },
        {
          id: 'q4', type: 'qa', title: 'QA HTML', content: '',
          category: 'HTML', tags: [], difficulty: 'easy', answer: '',
        },
      ],
    };
    const summary: BankSummary = {
      id: 'linked-filter-bank', name: bank.name, version: bank.version,
      questionCount: bank.questions.length, importedAt: Date.now(),
    };
    provider.setBank(bank, summary, new Map());
    provider.setFilter({ type: 'code', difficulty: 'easy', category: 'CSS' });

    expect(provider.getCategoriesInBank()).toEqual(['JavaScript', 'CSS']);
  });

  it('切换题库时清空筛选，同一题库刷新时保留筛选', () => {
    const provider = new QuestionListProvider({ debounceMs: 0 });
    const bank: QuestionBank = {
      name: 'Bank',
      version: '1.0',
      questions: [{
        id: 'q1', type: 'qa', title: 'Question', content: '',
        category: 'JS', tags: [], difficulty: 'easy', answer: '',
      }],
    };
    const firstSummary: BankSummary = {
      id: 'bank-1', name: bank.name, version: bank.version,
      questionCount: 1, importedAt: Date.now(),
    };
    provider.setBank(bank, firstSummary, new Map());
    provider.setFilter({ category: 'JS', difficulty: 'easy' });

    provider.setBank(bank, { ...firstSummary }, new Map());
    expect(provider.getFilter()).toEqual({ category: 'JS', difficulty: 'easy' });

    provider.setBank(bank, { ...firstSummary, id: 'bank-2' }, new Map());
    expect(provider.getFilter()).toEqual({});
  });
});
