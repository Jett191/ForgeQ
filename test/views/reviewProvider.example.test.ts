/**
 * EXAMPLE - ReviewProvider 空集合 / 快照不变性 / 加载失败（Task 18.2）
 *
 * Validates: Requirements 10.6, 10.7, 10.8, 10.9
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
import { ReviewProvider } from '../../src/views/reviewProvider.js';
// eslint-disable-next-line import/first
import type { QuestionBank } from '../../src/types/question.js';
// eslint-disable-next-line import/first
import type { LearningState } from '../../src/types/learning.js';

const bank: QuestionBank = {
  name: 'Test',
  version: '1.0',
  questions: [
    {
      id: 'q1',
      type: 'code',
      title: 'Q1',
      shortTitle: '短标题 Q1',
      content: '',
      category: 'JS',
      tags: [],
      difficulty: 'easy',
      answer: '',
    },
    {
      id: 'q2',
      type: 'qa',
      title: 'Q2',
      content: '',
      category: 'CSS',
      tags: [],
      difficulty: 'medium',
      answer: '',
    },
    {
      id: 'q3',
      type: 'code',
      title: 'Q3',
      content: '',
      category: 'HTML',
      tags: [],
      difficulty: 'hard',
      answer: '',
    },
  ],
};

describe('ReviewProvider example', () => {
  it('空集合 -> 显示 "当前没有需要复习的题目"', () => {
    const provider = new ReviewProvider();
    // All learning states are default (unlearned), so no question matches any review kind
    provider.setBank(bank, new Map());
    provider.enter('unmastered');

    const topLevel = provider.getChildren(undefined);
    // Top-level shows three entry nodes
    expect(topLevel).toHaveLength(3);

    // Get children of 'unmastered' entry
    const unmasteredEntry = topLevel.find(
      (n) => n.kind === 'entry' && n.reviewKind === 'unmastered',
    )!;
    const children = provider.getChildren(unmasteredEntry);
    expect(children).toHaveLength(1);
    expect(children[0]!.kind).toBe('message');
    if (children[0]!.kind === 'message') {
      expect(children[0]!.text).toBe('当前没有需要复习的题目');
    }
  });

  it('状态改变后实时重新归类，未掌握与错题不重复', () => {
    const provider = new ReviewProvider();
    const learning = new Map<string, LearningState>();
    learning.set('q1', {
      mastery: 'not_mastered',
      favoriteFlag: false,
      wrongFlag: false,
      hasNote: false,
    });
    learning.set('q2', {
      mastery: 'not_mastered',
      favoriteFlag: false,
      wrongFlag: false,
      hasNote: false,
    });

    provider.setBank(bank, learning);
    provider.enter('unmastered');

    // 初始时 q1、q2 都只属于未掌握。
    const topLevel = provider.getChildren(undefined);
    const unmasteredEntry = topLevel.find(
      (n) => n.kind === 'entry' && n.reviewKind === 'unmastered',
    )!;
    const children1 = provider.getChildren(unmasteredEntry);
    const ids1 = children1
      .filter((c) => c.kind === 'question')
      .map((c) => (c as { kind: 'question'; question: { id: string } }).question.id);
    expect(ids1).toEqual(['q1', 'q2']);

    // q1 改为错题，q2 改为已掌握，q3 改为未掌握。
    learning.set('q1', {
      mastery: 'not_mastered',
      favoriteFlag: false,
      wrongFlag: true,
      hasNote: false,
    });
    learning.set('q2', {
      mastery: 'mastered',
      favoriteFlag: false,
      wrongFlag: false,
      hasNote: false,
    });
    learning.set('q3', {
      mastery: 'not_mastered',
      favoriteFlag: false,
      wrongFlag: false,
      hasNote: false,
    });
    provider.refresh();

    // 未掌握按最新状态只剩 q3。
    const children2 = provider.getChildren(unmasteredEntry);
    const ids2 = children2
      .filter((c) => c.kind === 'question')
      .map((c) => (c as { kind: 'question'; question: { id: string } }).question.id);
    expect(ids2).toEqual(['q3']);

    // 错题按最新状态只包含 q1，与未掌握集合没有交集。
    const wrongEntry = topLevel.find(
      (n) => n.kind === 'entry' && n.reviewKind === 'wrong',
    )!;
    const wrongIds = provider
      .getChildren(wrongEntry)
      .filter((c) => c.kind === 'question')
      .map((c) => (c as { kind: 'question'; question: { id: string } }).question.id);
    expect(wrongIds).toEqual(['q1']);
  });

  it('加载失败 -> 显示加载失败消息', () => {
    const provider = new ReviewProvider();
    provider.setBank(bank, new Map());
    provider.setLoadFailed();

    const topLevel = provider.getChildren(undefined);
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]!.kind).toBe('message');
    if (topLevel[0]!.kind === 'message') {
      expect(topLevel[0]!.text).toBe('加载学习数据失败');
    }
  });

  it('无 bank -> 显示空消息', () => {
    const provider = new ReviewProvider();
    // Don't set any bank
    const topLevel = provider.getChildren(undefined);
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]!.kind).toBe('message');
    if (topLevel[0]!.kind === 'message') {
      expect(topLevel[0]!.text).toBe('当前没有需要复习的题目');
    }
  });

  it('有匹配题目时正确返回复习列表', () => {
    const provider = new ReviewProvider();
    const learning = new Map<string, LearningState>();
    learning.set('q1', {
      mastery: 'mastered',
      favoriteFlag: true,
      wrongFlag: false,
      hasNote: false,
    });
    learning.set('q2', {
      mastery: 'not_mastered',
      favoriteFlag: true,
      wrongFlag: true,
      hasNote: false,
    });

    provider.setBank(bank, learning);
    provider.enter('favorite');

    const topLevel = provider.getChildren(undefined);
    const favEntry = topLevel.find(
      (n) => n.kind === 'entry' && n.reviewKind === 'favorite',
    )!;
    const children = provider.getChildren(favEntry);
    const ids = children
      .filter((c) => c.kind === 'question')
      .map((c) => (c as { kind: 'question'; question: { id: string } }).question.id);
    expect(ids).toEqual(['q1', 'q2']);

    const first = children[0]!;
    expect(first.kind).toBe('question');
    if (first.kind === 'question') {
      const item = provider.getTreeItem(first);
      expect(item.label).toBe('短标题 Q1');
      expect(item.tooltip).toBe('Q1');
    }
  });
});
