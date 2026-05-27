// Feature: frontend-interview-practice, Property 16: Question 列表保序
//
// 验证：无激活筛选时 `getChildren()` 返回的 id 序列等于 `bank.questions.map(q => q.id)`
//
// numRuns: 100

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
import * as fc from 'fast-check';
// eslint-disable-next-line import/first
import { QuestionListProvider } from '../../src/views/questionListProvider.js';
// eslint-disable-next-line import/first
import { arbQuestionBank } from '../generators.js';
// eslint-disable-next-line import/first
import type { BankSummary } from '../../src/types/bankMeta.js';

const NUM_RUNS = 100;

describe('Property 16: Question 列表保序', () => {
  it('无激活筛选时 getChildren() id 序列等于 bank.questions.map(q => q.id)', () => {
    fc.assert(
      fc.property(arbQuestionBank, (bank) => {
        // 显式关闭分类分组，确保 children 直接是 question 序列；
        // 分组模式下的保序断言在 example test 中以等价的"扁平展开等于原序"形式覆盖。
        const provider = new QuestionListProvider({ debounceMs: 0, groupByCategory: false });
        const summary: BankSummary = {
          id: 'test-bank-id',
          name: bank.name,
          version: bank.version,
          questionCount: bank.questions.length,
          importedAt: Date.now(),
        };

        provider.setBank(bank, summary, new Map());

        // Get top-level children (should be bank title node)
        const topLevel = provider.getChildren(undefined);
        expect(topLevel).toHaveLength(1);
        const bankNode = topLevel[0]!;
        expect(bankNode.kind).toBe('bank');

        // Get children of bank node (should be questions)
        const children = provider.getChildren(bankNode);
        const ids = children
          .filter((c): c is { kind: 'question'; question: { id: string }; learning: unknown } => c.kind === 'question')
          .map((c) => c.question.id);

        const expected = bank.questions.map((q) => q.id);
        expect(ids).toEqual(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
