import { describe, expect, it } from 'vitest';

import { buildQuestionPlainText } from '../../src/practice/copyPlainText.js';
import type { LearningState } from '../../src/types/learning.js';
import type { CodeQuestion } from '../../src/types/question.js';

const QUESTION: CodeQuestion = {
  id: 'sum',
  type: 'code',
  title: '实现求和函数',
  content: '实现 `sum(a, b)`。',
  category: 'JavaScript',
  tags: ['函数', '基础'],
  difficulty: 'easy',
  answer: '返回 a + b。',
  briefAnswer: '直接相加。',
  detailedAnswer: '两个参数均为数字。',
  referenceCode: 'const sum = (a, b) => a + b;',
  solutionExplanation: '使用加法运算符。',
  testCases: [{ input: 'sum(1, 2)', expected: '3' }],
  followUps: [{ question: '如何处理字符串？', answer: '先校验类型。' }],
};

const LEARNING: LearningState = {
  mastery: 'not_mastered',
  favoriteFlag: true,
  wrongFlag: true,
  hasNote: true,
  lastPracticedAt: Date.UTC(2026, 6, 14, 12),
};

describe('buildQuestionPlainText', () => {
  it('包含题目、答案、作答、笔记、学习状态和原始 JSON', () => {
    const text = buildQuestionPlainText(
      QUESTION,
      [
        { relativePath: 'index.js', content: 'function sum(a, b) { return a + b; }' },
        { relativePath: 'README.txt', content: '我的思路' },
      ],
      LEARNING,
      '注意参数类型。',
    );

    expect(text).toContain('【题目】\n实现 `sum(a, b)`。');
    expect(text).toContain('基础答案：\n返回 a + b。');
    expect(text).toContain('参考代码：\nconst sum = (a, b) => a + b;');
    expect(text).toContain('--- 文件：index.js ---');
    expect(text).toContain('function sum(a, b) { return a + b; }');
    expect(text).toContain('【我的笔记】\n注意参数类型。');
    expect(text).toContain('掌握状态：未掌握');
    expect(text).toContain('最近练习时间：2026-07-14T12:00:00.000Z');
    expect(text).toContain('【题目原始 JSON】');
    expect(text).toContain('"solutionExplanation": "使用加法运算符。"');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('没有作答和笔记时提供明确占位文本', () => {
    const text = buildQuestionPlainText(QUESTION, [], {
      mastery: 'unlearned',
      favoriteFlag: false,
      wrongFlag: false,
      hasNote: false,
    });

    expect(text).toContain('【我的答案】\n（暂无作答文件）');
    expect(text).toContain('【我的笔记】\n（无）');
    expect(text).toContain('最近练习时间：（无）');
  });
});
