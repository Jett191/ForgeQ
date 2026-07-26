/**
 * 练习页面答案派生。
 *
 * 两种题型共用基础 Markdown 答案结构；代码题可在用户允许时附加参考代码、
 * 测试用例与解题说明，问答题和代码题都可附加关键词。
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
      keywords?: readonly string[];
      language?: string;
      referenceCode?: string;
      testCases?: ReadonlyArray<{
        name?: string;
        input?: string;
        expected?: string;
        description?: string;
      }>;
      solutionExplanation?: string;
      followUps: ReadonlyArray<{ question: string; answer?: string }>;
    }
  | { kind: 'none'; hint: string };

export interface DeriveQuestionAnswerOptions {
  includeKeywords?: boolean;
  includeCodeDetails?: boolean;
}

/**
 * 计算“查看答案”区域的 Markdown 内容。
 *
 * `briefAnswer` 优先，缺省时用兼容字段 `answer`；`detailedAnswer` 和追问按原样
 * 附带。关键词和代码题详情由 options 控制，默认关闭以保持纯派生 API 的兼容行为。
 */
export function deriveQuestionAnswer(
  q: Question,
  options: DeriveQuestionAnswerOptions = {},
): QuestionAnswer {
  const includeKeywords = options.includeKeywords ?? false;
  const includeCodeDetails = options.includeCodeDetails ?? false;
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
  const keywords = includeKeywords && q.keywords?.some((keyword) => keyword.trim().length > 0)
    ? q.keywords.filter((keyword) => keyword.trim().length > 0)
    : undefined;
  const referenceCode =
    includeCodeDetails && q.type === 'code' && q.referenceCode?.trim().length
      ? q.referenceCode
      : undefined;
  const testCases =
    includeCodeDetails && q.type === 'code' && q.testCases?.length
      ? q.testCases
      : undefined;
  const solutionExplanation =
    includeCodeDetails && q.type === 'code' && q.solutionExplanation?.trim().length
      ? q.solutionExplanation
      : undefined;

  if (
    brief === undefined &&
    detailed === undefined &&
    keywords === undefined &&
    referenceCode === undefined &&
    testCases === undefined &&
    solutionExplanation === undefined &&
    followUps.length === 0
  ) {
    return { kind: 'none', hint: NO_REFERENCE_ANSWER_HINT };
  }

  return {
    kind: 'reference',
    ...(brief !== undefined ? { briefAnswer: brief } : {}),
    ...(detailed !== undefined ? { detailedAnswer: detailed } : {}),
    ...(keywords !== undefined ? { keywords } : {}),
    ...(referenceCode !== undefined && q.type === 'code' && q.language !== undefined
      ? { language: q.language }
      : {}),
    ...(referenceCode !== undefined ? { referenceCode } : {}),
    ...(testCases !== undefined ? { testCases } : {}),
    ...(solutionExplanation !== undefined ? { solutionExplanation } : {}),
    followUps,
  };
}
