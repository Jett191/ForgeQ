import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class ThemeColor {
    readonly id: string;
    constructor(id: string) {
      this.id = id;
    }
  }
  class ThemeIcon {
    readonly id: string;
    readonly color?: ThemeColor;
    constructor(id: string, color?: ThemeColor) {
      this.id = id;
      if (color !== undefined) this.color = color;
    }
  }
  return { ThemeColor, ThemeIcon };
});

import {
  NO_REFERENCE_ANSWER_HINT,
  deriveQuestionAnswer,
} from '../../src/practice/practiceFiles.js';
import type { Question } from '../../src/types/question.js';
import {
  learningStateVisualStatus,
  statusIconFile,
} from '../../src/views/iconRegistry.js';
import {
  arbCodeQuestion,
  arbMasteryStatus,
  arbQAQuestion,
} from '../generators.js';

const NUM_RUNS = 100;

describe('统一题目答案派生', () => {
  it('code 与 qa 使用完全相同的 Markdown 答案结构', () => {
    const common = {
      id: 'same-answer',
      title: '题目',
      content: '题面',
      category: 'JavaScript',
      tags: ['编程题'],
      difficulty: 'medium' as const,
      answer: '兼容答案',
      briefAnswer: '简洁答案',
      detailedAnswer: '```js\nreturn 1\n```',
      followUps: [{ question: '为什么？', answer: '因为。' }],
    };
    const code: Question = { ...common, type: 'code' };
    const qa: Question = { ...common, type: 'qa' };

    expect(deriveQuestionAnswer(code)).toEqual(deriveQuestionAnswer(qa));
  });

  it('两种题型都按 briefAnswer → answer 回退，并保留详细解析和追问', () => {
    fc.assert(
      fc.property(fc.oneof(arbCodeQuestion, arbQAQuestion), (question) => {
        const actual = deriveQuestionAnswer(question);
        const brief =
          question.briefAnswer !== undefined && question.briefAnswer !== ''
            ? question.briefAnswer
            : question.answer !== ''
              ? question.answer
              : undefined;
        const detailed =
          question.detailedAnswer !== undefined && question.detailedAnswer !== ''
            ? question.detailedAnswer
            : undefined;
        const followUps = question.followUps ?? [];

        if (brief === undefined && detailed === undefined && followUps.length === 0) {
          expect(actual).toEqual({
            kind: 'none',
            hint: NO_REFERENCE_ANSWER_HINT,
          });
          return;
        }

        expect(actual).toEqual({
          kind: 'reference',
          ...(brief !== undefined ? { briefAnswer: brief } : {}),
          ...(detailed !== undefined ? { detailedAnswer: detailed } : {}),
          followUps,
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('旧代码专属字段不再改变答案展示', () => {
    const question: Question = {
      id: 'legacy-code',
      type: 'code',
      title: '旧代码题',
      content: '',
      category: 'JavaScript',
      tags: [],
      difficulty: 'easy',
      answer: '',
      referenceCode: 'return 42;',
      solutionExplanation: '旧解析',
    };

    expect(deriveQuestionAnswer(question)).toEqual({
      kind: 'none',
      hint: NO_REFERENCE_ANSWER_HINT,
    });
  });

  it('题目面板可按设置展示关键词、参考代码、测试用例和解题说明', () => {
    const question: Question = {
      id: 'complete-code',
      type: 'code',
      title: '完整代码题',
      content: '',
      category: 'JavaScript',
      tags: [],
      difficulty: 'medium',
      answer: '',
      language: 'javascript',
      keywords: ['边界条件', '复杂度'],
      referenceCode: 'return 42;',
      testCases: [{ input: '[]', expected: '42' }],
      solutionExplanation: '先处理边界条件。',
    };

    expect(deriveQuestionAnswer(question, {
      includeKeywords: true,
      includeCodeDetails: true,
    })).toEqual({
      kind: 'reference',
      keywords: ['边界条件', '复杂度'],
      language: 'javascript',
      referenceCode: 'return 42;',
      testCases: [{ input: '[]', expected: '42' }],
      solutionExplanation: '先处理边界条件。',
      followUps: [],
    });
  });

  it('只有 detailedAnswer 时仍能展示详细解析', () => {
    const question: Question = {
      id: 'detailed-only',
      type: 'code',
      title: '代码题',
      content: '',
      category: '编程题',
      tags: ['编程题'],
      difficulty: 'easy',
      answer: '',
      detailedAnswer: '包含 Markdown 的详细解析',
    };

    expect(deriveQuestionAnswer(question)).toEqual({
      kind: 'reference',
      detailedAnswer: '包含 Markdown 的详细解析',
      followUps: [],
    });
  });
});

describe('Property 15: Mastery 视觉标识单射', () => {
  it('四种状态使用各自的自定义圆点 SVG', () => {
    expect(statusIconFile('unlearned')).toBe('unlearned.svg');
    expect(statusIconFile('learning')).toBe('learning.svg');
    expect(statusIconFile('mastered')).toBe('mastered.svg');
    expect(statusIconFile('not_mastered')).toBe('not-mastered.svg');
    expect(statusIconFile('wrong')).toBe('wrong.svg');
  });

  it('未掌握显示橙色状态，只有独立错题标记显示红色状态', () => {
    const base = {
      mastery: 'not_mastered' as const,
      favoriteFlag: false,
      hasNote: false,
    };
    expect(learningStateVisualStatus({ ...base, wrongFlag: false })).toBe(
      'not_mastered',
    );
    expect(learningStateVisualStatus({ ...base, wrongFlag: true })).toBe('wrong');
  });

  it('浅色和深色资源都只由圆形构成，不包含勾或叉路径', () => {
    const statuses = [
      'unlearned',
      'learning',
      'mastered',
      'not_mastered',
      'wrong',
    ] as const;
    for (const theme of ['light', 'dark'] as const) {
      for (const status of statuses) {
        const svg = readFileSync(
          join(process.cwd(), 'media', 'mastery', theme, statusIconFile(status)),
          'utf8',
        );
        expect(svg).toContain('<circle');
        expect(svg).not.toContain('<path');
      }
    }
  });

  it('四个 MasteryStatus 取值映射到的 SVG 互不相同', () => {
    fc.assert(
      fc.property(arbMasteryStatus, arbMasteryStatus, (s1, s2) => {
        if (s1 === s2) {
          expect(statusIconFile(s1)).toBe(statusIconFile(s2));
          return;
        }
        expect(statusIconFile(s1)).not.toBe(statusIconFile(s2));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
