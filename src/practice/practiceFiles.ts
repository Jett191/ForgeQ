/**
 * 练习页面答案派生。
 *
 * `code` / `qa` 只用于题型标签与筛选；两种题型共用 Markdown 练习文件和
 * Markdown 答案展示，因此这里不再维护代码模板、语言扩展名或参考代码分支。
 */

import type { Question } from '../types/question.js';

/** 题目没有可展示答案时使用的统一提示。 */
export const NO_REFERENCE_ANSWER_HINT = '该题暂无参考答案';

/** 两种题型共用的答案展示数据。 */
export type QuestionAnswer =
  | {
      kind: 'reference';
      briefAnswer?: string;
      detailedAnswer?: string;
      followUps: ReadonlyArray<{ question: string; answer?: string }>;
    }
  | { kind: 'none'; hint: string };

/**
 * 计算“查看答案”区域的 Markdown 内容。
 *
 * `briefAnswer` 优先，缺省时用兼容字段 `answer`；`detailedAnswer` 和追问按原样
 * 附带。题型不会改变答案结构或渲染方式。
 */
export function deriveQuestionAnswer(q: Question): QuestionAnswer {
  const brief =
    typeof q.briefAnswer === 'string' && q.briefAnswer !== ''
      ? q.briefAnswer
      : typeof q.answer === 'string' && q.answer !== ''
        ? q.answer
        : undefined;
  const detailed =
    typeof q.detailedAnswer === 'string' && q.detailedAnswer !== ''
      ? q.detailedAnswer
      : undefined;
  const followUps: ReadonlyArray<{ question: string; answer?: string }> =
    Array.isArray(q.followUps) ? q.followUps : [];

  if (brief === undefined && detailed === undefined && followUps.length === 0) {
    return { kind: 'none', hint: NO_REFERENCE_ANSWER_HINT };
  }

  return {
    kind: 'reference',
    ...(brief !== undefined ? { briefAnswer: brief } : {}),
    ...(detailed !== undefined ? { detailedAnswer: detailed } : {}),
    followUps,
  };
}
