/**
 * Question / QuestionBank 共享类型定义。
 *
 * 该模块严格对齐 design.md 中
 * "Data Models > TypeScript 类型定义 > Question (discriminated union)" 一节，
 * 任何变更必须先回写到 design.md 后再同步本文件。
 *
 * 设计要点：
 * - `Question` 是按 `type` 区分的 discriminated union（`'code' | 'qa'`）。
 * - `QuestionBase` 保留 legacy 字段 `answer: string`，用于向后兼容
 *   Req 1.1（已批准）所要求的 `answer` 必填语义；新模型在此基础上扩展。
 * - 子类型字段（`referenceCode` / `briefAnswer` 等）作为可选补充字段；
 *   `Parser` 在解析后会用 legacy `answer` 兜底缺失的 `referenceCode` / `briefAnswer`。
 *
 * Validates: Requirements 1.1, 9.1, 8.1
 */

/** 题目类型枚举：code = 代码题；qa = 问答题。 */
export type QuestionType = 'code' | 'qa';

/** 题目难度枚举。 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * 用户对单题的掌握状态。
 *
 * - `unlearned`：默认值，从未练习。
 * - `learning`：学习中。
 * - `mastered`：已掌握；切换到该值时 `wrongFlag` 联动置为 false（Req 9.4）。
 * - `not_mastered`：未掌握；切换到该值时 `wrongFlag` 联动置为 true（Req 9.3）。
 */
export type MasteryStatus = 'unlearned' | 'learning' | 'mastered' | 'not_mastered';

/**
 * 所有题目共享的基础字段。
 *
 * 字段长度 / 元素个数约束见 Req 1.1：
 * - `id`：1-100 字符，区分大小写唯一。
 * - `title`：1-200 字符。
 * - `content`：≤20000 字符，markdown。
 * - `category`：1-100 字符。
 * - `tags`：0-50 个元素。
 * - `answer`：≤50000 字符，legacy 必填字段，新模型仍保留。
 */
export interface QuestionBase {
  /** 题目唯一标识；区分大小写。 */
  id: string;
  /** 题型 discriminator，由具体子类型收窄。 */
  type: QuestionType;
  /** 题目标题，1-200 字符。 */
  title: string;
  /** 题面 markdown 内容，≤20000 字符。 */
  content: string;
  /** 题目分类，1-100 字符。 */
  category: string;
  /** 题目标签集合，0-50 个元素。 */
  tags: string[];
  /** 题目难度。 */
  difficulty: Difficulty;
  /**
   * Legacy 兼容字段（Req 1.1）：已批准需求要求 `answer` 必填，
   * 新模型保留以保证 round-trip 与历史 JSON 兼容。
   */
  answer: string;
}

/**
 * 代码题：`type === 'code'`。
 *
 * 子类型字段全部可选；`referenceCode` 缺省时由 Parser 用 legacy `answer` 兜底。
 */
export interface CodeQuestion extends QuestionBase {
  type: 'code';
  /** 编程语言，1-50 字符；决定练习文件扩展名。 */
  language?: string;
  /** 等价于 `codeTemplate` 的新字段名；同时存在时以 `initialCode` 为准。 */
  initialCode?: string;
  /** Legacy 字段名 alias，向后兼容。 */
  codeTemplate?: string;
  /** 参考代码；缺省时由 Parser 用 legacy `answer` 兜底。 */
  referenceCode?: string;
  /** 测试用例集合（仅展示，不在扩展中执行）。 */
  testCases?: Array<{
    name?: string;
    input?: string;
    expected?: string;
    /** markdown 描述。 */
    description?: string;
  }>;
  /** 解题思路 markdown。 */
  solutionExplanation?: string;
}

/**
 * 问答题：`type === 'qa'`。
 *
 * 子类型字段全部可选；`briefAnswer` 缺省时由 Parser 用 legacy `answer` 兜底。
 */
export interface QAQuestion extends QuestionBase {
  type: 'qa';
  /** 关键词集合（用于答题点检查 / 提示）。 */
  keywords?: string[];
  /** 简洁答案；缺省时由 Parser 用 legacy `answer` 兜底。 */
  briefAnswer?: string;
  /** 详细答案 markdown。 */
  detailedAnswer?: string;
  /** 追问及其答案。 */
  followUps?: Array<{
    question: string;
    /** markdown。 */
    answer?: string;
  }>;
}

/**
 * Discriminated union：通过 `type` 字段判别具体子类型。
 *
 * 使用模式：
 * ```ts
 * if (q.type === 'code') {
 *   // q 收窄为 CodeQuestion
 * } else {
 *   // q 收窄为 QAQuestion
 * }
 * ```
 */
export type Question = CodeQuestion | QAQuestion;

/**
 * 题库顶层结构。
 *
 * 约束：
 * - `name`：1-100 字符。
 * - `version`：1-20 字符。
 * - `questions`：长度 ≥ 1，否则 Parser 返回 `EMPTY_QUESTION_BANK`。
 */
export interface QuestionBank {
  name: string;
  version: string;
  questions: Question[];
}
