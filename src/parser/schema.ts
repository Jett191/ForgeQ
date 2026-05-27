/**
 * Question_Bank_Schema (JSON Schema 2020-12).
 *
 * 该常量是 design.md 中
 * "Data Models > Question_Bank_Schema (JSON Schema 2020-12，按 `type` 差异化)"
 * 一节的 1:1 落地，是题库 JSON 文件的合法性真理源：
 *
 * - `Parser` 在解析阶段将 JSON 文本传给 Ajv，按本 schema 完成结构 / 类型 /
 *   长度 / 枚举 / 题型差异化字段的校验（Req 1.1, 1.4, 1.5, 1.6）。
 * - 构建脚本 `scripts/generateSchema.mjs` 会把本常量序列化为
 *   `schemas/question-bank.schema.json`，便于离线工具（IDE / CI / 题库
 *   维护者）独立校验。
 *
 * 实现要点（保持与 design.md 字面一致）：
 * - 顶层 `additionalProperties: false`：题库根对象不允许出现 schema 未定义
 *   的字段。
 * - `$defs.QuestionBase`：列出所有题型共享的必填字段（含 legacy `answer`），
 *   不限制额外字段——子类型字段经由 `unevaluatedProperties` 在 `Question`
 *   级别统一收口。
 * - `$defs.Question.allOf` 同时引用 `QuestionBase` 与 `oneOf` 子类型，再用
 *   `if/then/else` 强约束 `type === 'code'` / `type === 'qa'` 各自必须满足
 *   对应的 `*Extras`，最终 `unevaluatedProperties: false` 让按题型不允许
 *   的字段（例如 code 题里出现 `briefAnswer`）触发 oneOf / additional 错误，
 *   被 Parser 映射为 `oneOf_mismatch` 或 `additionalProperties` 类违规。
 * - `Code/QAQuestionExtras` 内部包含 `type: { "const": ... }`，与 `if`
 *   分支配合即可在 oneOf 中精确路由。
 *
 * Schema 中 `questions.minItems: 1` 仅作快速失败辅助；真正的
 * `EMPTY_QUESTION_BANK` 错误由 Parser 在 schema 校验通过后单独显式
 * 抛出，从而保留更友好的错误码（Req 1.10）。
 *
 * @see {@link ../../.kiro/specs/frontend-interview-practice/design.md} —— Data Models 章节
 * @see {@link ../../.kiro/specs/frontend-interview-practice/requirements.md} —— Req 1.1
 *
 * Validates: Requirements 1.1
 */
export const questionBankSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://kiro.dev/schemas/frontend-interview-practice/question-bank.json',
  title: 'QuestionBank',
  type: 'object',
  additionalProperties: false,
  required: ['name', 'version', 'questions'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    version: { type: 'string', minLength: 1, maxLength: 20 },
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 10000,
      items: { $ref: '#/$defs/Question' },
    },
  },
  $defs: {
    QuestionBase: {
      type: 'object',
      required: [
        'id',
        'type',
        'title',
        'content',
        'category',
        'tags',
        'difficulty',
        'answer',
      ],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 100 },
        type: { type: 'string', enum: ['code', 'qa'] },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', maxLength: 20000 },
        category: { type: 'string', minLength: 1, maxLength: 100 },
        tags: {
          type: 'array',
          minItems: 0,
          maxItems: 50,
          items: { type: 'string', minLength: 1, maxLength: 50 },
        },
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        answer: { type: 'string', maxLength: 50000 },
      },
    },
    Question: {
      allOf: [
        { $ref: '#/$defs/QuestionBase' },
        {
          oneOf: [
            { $ref: '#/$defs/CodeQuestionExtras' },
            { $ref: '#/$defs/QAQuestionExtras' },
          ],
        },
        {
          if: { properties: { type: { const: 'code' } } },
          then: { $ref: '#/$defs/CodeQuestionExtras' },
        },
        {
          if: { properties: { type: { const: 'qa' } } },
          then: { $ref: '#/$defs/QAQuestionExtras' },
        },
      ],
      unevaluatedProperties: false,
    },
    CodeQuestionExtras: {
      type: 'object',
      properties: {
        type: { const: 'code' },
        language: { type: 'string', minLength: 1, maxLength: 50 },
        initialCode: { type: 'string', maxLength: 50000 },
        codeTemplate: { type: 'string', maxLength: 50000 },
        referenceCode: { type: 'string', maxLength: 50000 },
        testCases: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', maxLength: 100 },
              input: { type: 'string', maxLength: 5000 },
              expected: { type: 'string', maxLength: 5000 },
              description: { type: 'string', maxLength: 5000 },
            },
          },
        },
        solutionExplanation: { type: 'string', maxLength: 50000 },
      },
    },
    QAQuestionExtras: {
      type: 'object',
      properties: {
        type: { const: 'qa' },
        keywords: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string', minLength: 1, maxLength: 100 },
        },
        briefAnswer: { type: 'string', maxLength: 5000 },
        detailedAnswer: { type: 'string', maxLength: 50000 },
        followUps: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['question'],
            properties: {
              question: { type: 'string', minLength: 1, maxLength: 1000 },
              answer: { type: 'string', maxLength: 20000 },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * 题库 JSON Schema 的类型别名。
 *
 * 由 `as const` 推导得到字面量类型；Parser 模块在编译期可使用本类型保证
 * 引用 schema 字段路径时不会拼错。
 */
export type QuestionBankSchema = typeof questionBankSchema;
