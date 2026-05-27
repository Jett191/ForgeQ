// Feature: frontend-interview-practice, Property 2: Schema 违规可被完整检出（含按题型不允许的字段）
//
// 验证 design.md "Correctness Properties > Property 2" 与 Req 1.4 / 1.5 / 1.6
// 描述的"单步突变可检出"语义：
//
//   对任意由 Parser 接受的合法 QuestionBank B，对其执行一次"单步突变"——
//     · M1 删除任一必填字段（题库级 / 题目级 QuestionBase 必填）；
//     · M2 把任一必填字段替换为类型不匹配的值；
//     · M3 把 `type` 替换为 {code, qa} 之外的字符串；
//     · M4 把 `difficulty` 替换为 {easy, medium, hard} 之外的字符串；
//     · M5 跨子类型字段注入：把仅属于 code 题的字段（如 `referenceCode` /
//          `testCases`）注入到 qa 题，或把仅属于 qa 题的字段（如
//          `briefAnswer` / `followUps`）注入到 code 题。
//   ——`Parser` 必须返回 `SCHEMA_VIOLATION`，且其 `violations` 中至少包含一
//   条描述该突变的 (path, kind)。M3 / M4 与 M5 的 violation 还必须携带对应
//   `Question.id` 与 `questionType`（用于 UI 精准定位）。
//
// **Validates: Requirements 1.4, 1.5, 1.6**
//
// 实现说明：
// - "合法 bank" 通过 `arbQuestionBank` → `format` → `parse` 归一化得到，
//   保证起点必然能被 Parser 接受（与 Property 1 同思路）。
// - 突变在 *已经序列化为 unknown 树* 的副本上执行（`structuredClone`），
//   再 `JSON.stringify` 喂回 Parser；不直接修改 `QuestionBank` 对象，
//   避免与 TypeScript 类型系统对抗。
// - `arbSchemaMutation` 输出 `(mutator, expected)` 二元组：mutator 应用到
//   bank-as-unknown 上做单步变更，`expected` 描述测试侧期待 Parser 报告的
//   `path` / `kind` / 是否带 `questionId` / `questionType`，断言时按"包含
//   即可"（at least one）来匹配，不要求 Parser 输出与期待一一对等。
// - `numRuns: 100` 与 tasks.md / design.md 一致。

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { format } from '../../src/parser/formatter.js';
import { parse } from '../../src/parser/parser.js';
import type { SchemaViolation } from '../../src/types/errors.js';
import type { QuestionBank } from '../../src/types/question.js';

import { arbQuestionBank } from '../generators.js';

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// 类型与工具
// ---------------------------------------------------------------------------

/**
 * 测试侧期望 Parser 在 `SCHEMA_VIOLATION.violations` 中至少包含的某条违规
 * 的"形状"。我们不要求 Parser 一字不差地输出 path / kind 序列，因为单步
 * 突变常会触发多个相关错误（`oneOf` / `unevaluatedProperties` /
 * `if/then/else` 同时失败）；只断言"至少有一条违规命中我们期待的形状"。
 *
 * - `path`：精确匹配 Parser 渲染后的路径字符串（如 `questions[3].difficulty`）。
 * - `kinds`：可接受的 `kind` 集合。Parser 把多个 schema 关键字归并到 4 种
 *   `kind`，但同一字段在不同关键字下可能落到 `type_mismatch` 或
 *   `oneOf_mismatch`（如类型替换 + oneOf 同时触发），故这里允许多种取值。
 * - `requireQuestionId`：是否必须带 `questionId`。仅 M3 / M4 / M5 对 question
 *   级字段的违规要求；题库级（如根 `name` 缺失）则为 `false`。
 * - `requireQuestionType`：是否必须带 `questionType`。设计中 question 级
 *   违规一旦能从原始 bank 中提取到 `type === 'code' | 'qa'` 即应填充；M5
 *   测试时我们恰好保留了原 type，因此要求必须填充；M3 把 type 改成非法值
 *   后 Parser 取不到合法 type，因此该项设为 false。
 */
interface ExpectedViolation {
  path: string;
  kinds: ReadonlyArray<SchemaViolation['kind']>;
  requireQuestionId: boolean;
  requireQuestionType: boolean;
  /** 当 `requireQuestionId` 为 true 时，期待的具体 id。 */
  questionId?: string;
  /** 当 `requireQuestionType` 为 true 时，期待的具体 questionType。 */
  questionType?: 'code' | 'qa';
}

/**
 * 一次性突变：把"已经被 Parser 接受的合法 bank"以 JSON 文本中转，深拷贝出
 * 一棵纯 unknown 树，再让 mutator 在该树上做就地修改。返回突变后的 JSON
 * 文本（保留 2 空格缩进，与 Formatter 输出风格一致；缩进对 Parser 的
 * SCHEMA_VIOLATION 行为没有影响）。
 *
 * 这种 "JSON.parse → 修改 → JSON.stringify" 的写法等价于结构化克隆，但
 * 完全脱离 TypeScript 的类型系统约束，便于注入"题库本来不允许的形态"。
 */
function applyMutationToBank(
  bank: QuestionBank,
  mutator: (root: Record<string, unknown>) => void,
): string {
  const text = format(bank);
  const root = JSON.parse(text) as Record<string, unknown>;
  mutator(root);
  return JSON.stringify(root, null, 2);
}

/** 取出 bank-as-unknown 树中下标 i 的 question；不做容错（生成器侧保证存在）。 */
function questionAt(
  root: Record<string, unknown>,
  i: number,
): Record<string, unknown> {
  const questions = root.questions as unknown[];
  return questions[i] as Record<string, unknown>;
}

/** 在 violations 中寻找一条"形状匹配"的违规。 */
function findMatchingViolation(
  violations: readonly SchemaViolation[],
  expected: ExpectedViolation,
): SchemaViolation | undefined {
  return violations.find((v) => {
    if (v.path !== expected.path) return false;
    if (!expected.kinds.includes(v.kind)) return false;
    if (expected.requireQuestionId) {
      if (v.questionId !== expected.questionId) return false;
    }
    if (expected.requireQuestionType) {
      if (v.questionType !== expected.questionType) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// arbSchemaMutation：对合法 bank 做单步突变
//
// 该生成器以已被 Parser 接受的合法 `QuestionBank` 为输入，输出一个
// `(mutator, expected)` 二元组：
//
//   - `mutator(root)` 在 bank-as-unknown 树上做一次单步修改，对应 design.md
//     Property 2 中列举的五类突变（M1-M5）。
//   - `expected` 描述测试侧期待 Parser 必须报告的违规形状（path / kind /
//     是否带 questionId / 是否带 questionType）。
//
// 设计要点：
//   - 五类突变以 `fc.oneof` 等权混合，让 100 次迭代中每类约 20 个样本；
//   - M1 / M2 在选择字段时回避 `id` / `type`：删除或替换 `id` 会让 Parser
//     无法从 root 中提取出 questionId，删除 `type` 会同时让 questionType
//     无法填充，覆盖范围已由 M3 / M5 兜住，不在 M1 / M2 中重复；
//   - M3 把 `type` 改成 enum 之外的字符串后，Parser 自然取不到合法的
//     questionType（因为题型本身已损坏），因此 `requireQuestionType: false`；
//     该决策与 `mapAjvErrors` / `extractQuestionAt` 的实现对齐——它们仅在
//     `q.type === 'code' | 'qa'` 时才填充 questionType；
//   - M5 选定 question 时只挑选 `arbQuestionBank` 实际产出的题型，避免
//     "qa 题中无 qa-only 字段可注入" 这种空集情况。
// ---------------------------------------------------------------------------

/** 单步突变：包括 mutator 与对 Parser 输出的期望形状。 */
interface Mutation {
  /** 仅供调试用的可读描述（fast-check shrinking 报告中可见）。 */
  description: string;
  mutator: (root: Record<string, unknown>) => void;
  expected: ExpectedViolation;
}

/**
 * QuestionBase 必填字段集合（用于 M1 / M2）。
 *
 * 与 `src/parser/schema.ts > QuestionBase.required` 对齐；这里刻意排除
 * `id` 与 `type`：
 * - 删除 / 替换 `id`：会让 Parser 在 `extractQuestionAt` 中取不到 id，
 *   `questionId` 无从断言，且其它突变类型已经覆盖 question 级 violation 的
 *   "带 id"语义；
 * - 删除 / 替换 `type`：与 M3 重复，且会破坏 questionType 的提取。
 */
const QUESTION_BASE_REQUIRED_FOR_MUTATION = [
  'title',
  'content',
  'category',
  'tags',
  'difficulty',
  'answer',
] as const;

/** M1：删除某道题的某个 QuestionBase 必填字段。 */
const arbDeleteQuestionField = (bank: QuestionBank): fc.Arbitrary<Mutation> =>
  fc
    .tuple(
      fc.nat({ max: bank.questions.length - 1 }),
      fc.constantFrom(...QUESTION_BASE_REQUIRED_FOR_MUTATION),
    )
    .map(([qIdx, field]): Mutation => {
      const q = bank.questions[qIdx]!;
      return {
        description: `M1 delete questions[${qIdx}].${field}`,
        mutator: (root) => {
          const target = questionAt(root, qIdx);
          delete target[field];
        },
        expected: {
          path: `questions[${qIdx}].${field}`,
          kinds: ['missing'],
          requireQuestionId: true,
          requireQuestionType: true,
          questionId: q.id,
          questionType: q.type,
        },
      };
    });

/**
 * M2：把某道题的某个 QuestionBase 必填字段（除 id / type 外）替换为类型
 * 不匹配的值。
 *
 * 字段→错型替换值的选择：所有 string 字段一律替换为 number `42`（明显的
 * `type_mismatch`），`tags` 替换为字符串 `'not-an-array'`（替代 array 类型）。
 *
 * 不替换 `id` / `type`：与 M1 同样的考虑，且 M3 已专门覆盖 `type`。
 */
const arbReplaceQuestionFieldType = (bank: QuestionBank): fc.Arbitrary<Mutation> =>
  fc
    .tuple(
      fc.nat({ max: bank.questions.length - 1 }),
      fc.constantFrom(...QUESTION_BASE_REQUIRED_FOR_MUTATION),
    )
    .map(([qIdx, field]): Mutation => {
      const q = bank.questions[qIdx]!;
      // tags 是数组类型，其余都是 string；为了让 Ajv 报告稳定的 type_mismatch，
      // 替换值必须显然不属于目标类型。
      const replacement: unknown = field === 'tags' ? 'not-an-array' : 42;
      return {
        description: `M2 replace questions[${qIdx}].${field} with wrong-type value`,
        mutator: (root) => {
          const target = questionAt(root, qIdx);
          target[field] = replacement;
        },
        expected: {
          path: `questions[${qIdx}].${field}`,
          kinds: ['type_mismatch'],
          requireQuestionId: true,
          requireQuestionType: true,
          questionId: q.id,
          questionType: q.type,
        },
      };
    });

/**
 * M3：把 `type` 替换为 `{code, qa}` 之外的字符串（enum 越界）。
 *
 * Parser 在 `extractQuestionAt` 中仅当 `q.type === 'code' | 'qa'` 时才填充
 * `questionType`；本突变把 type 改成非法 enum，questionType 自然取不到，
 * 因此 `requireQuestionType: false`。
 *
 * `id` 仍是合法字符串，questionId 必须填充——这是 Req 1.5 的核心要求。
 *
 * 接受的 kind 集合包括 `enum_violation`（Ajv 的 `enum` 关键字）与
 * `oneOf_mismatch`（被 `if/then/else` / `oneOf` 同时触发也是合理的）。
 */
const arbReplaceTypeEnum = (bank: QuestionBank): fc.Arbitrary<Mutation> =>
  fc
    .tuple(
      fc.nat({ max: bank.questions.length - 1 }),
      fc.constantFrom('mcq', 'essay', 'unknown', 'CODE', 'Qa'),
    )
    .map(([qIdx, badType]): Mutation => {
      const q = bank.questions[qIdx]!;
      return {
        description: `M3 replace questions[${qIdx}].type with '${badType}'`,
        mutator: (root) => {
          const target = questionAt(root, qIdx);
          target.type = badType;
        },
        expected: {
          path: `questions[${qIdx}].type`,
          kinds: ['enum_violation', 'oneOf_mismatch'],
          requireQuestionId: true,
          // type 已被破坏，Parser 取不到合法 questionType，按实现保留
          // questionType 字段缺省即可——这与 src/parser/parser.ts 中
          // `extractQuestionAt` 的实现一致。
          requireQuestionType: false,
          questionId: q.id,
        },
      };
    });

/**
 * M4：把 `difficulty` 替换为 `{easy, medium, hard}` 之外的字符串（enum 越界）。
 *
 * 与 M3 不同的是，`type` 字段保持原值，因此 Parser 仍能从原 bank 中提取出
 * 合法的 questionType；`requireQuestionType: true`。
 */
const arbReplaceDifficultyEnum = (
  bank: QuestionBank,
): fc.Arbitrary<Mutation> =>
  fc
    .tuple(
      fc.nat({ max: bank.questions.length - 1 }),
      fc.constantFrom('extreme', 'trivial', 'EASY', 'Hard', 'medium '),
    )
    .map(([qIdx, badDifficulty]): Mutation => {
      const q = bank.questions[qIdx]!;
      return {
        description: `M4 replace questions[${qIdx}].difficulty with '${badDifficulty}'`,
        mutator: (root) => {
          const target = questionAt(root, qIdx);
          target.difficulty = badDifficulty;
        },
        expected: {
          path: `questions[${qIdx}].difficulty`,
          kinds: ['enum_violation'],
          requireQuestionId: true,
          requireQuestionType: true,
          questionId: q.id,
          questionType: q.type,
        },
      };
    });

/**
 * M5：跨子类型字段注入。
 *
 * - 在 qa 题中注入仅属于 code 题的字段（如 `referenceCode` / `solutionExplanation`）。
 * - 在 code 题中注入仅属于 qa 题的字段（如 `briefAnswer` / `detailedAnswer`）。
 *
 * 与 schema 的耦合：注入的字段名必须在被注入题型的 `*Extras.properties`
 * 中**未声明**——这才会被 `unevaluatedProperties: false` / `oneOf` /
 * `if/then/else` 联合判定为违规。我们故意不挑 `language`（code 独有但
 * 可能在 qa 题中导致路径变化）等已经被两个 Extras 共同覆盖的字段；这里
 * 选用各题型最具代表性的"独有"字段。
 *
 * Parser 在归并这些违规时通常会落到 `oneOf_mismatch`（被
 * `unevaluatedProperties` / `oneOf` / `if/then/else` 同时触发）；
 * 接受的 kinds 同时包含 `oneOf_mismatch`，足以稳定匹配。
 *
 * 注入字段值故意选用合法 string，避免 type_mismatch 噪声覆盖跨题型违规。
 */
const CODE_ONLY_FIELDS = ['referenceCode', 'solutionExplanation', 'initialCode'] as const;
const QA_ONLY_FIELDS = ['briefAnswer', 'detailedAnswer'] as const;

const arbInjectCrossTypeField = (bank: QuestionBank): fc.Arbitrary<Mutation> => {
  // 为每道题计算"对面题型字段"列表；为后续 fc.constantFrom 准备样本池。
  const candidates: Array<{
    qIdx: number;
    field: string;
  }> = [];
  for (let i = 0; i < bank.questions.length; i += 1) {
    const q = bank.questions[i]!;
    if (q.type === 'qa') {
      for (const f of CODE_ONLY_FIELDS) candidates.push({ qIdx: i, field: f });
    } else {
      for (const f of QA_ONLY_FIELDS) candidates.push({ qIdx: i, field: f });
    }
  }
  // arbQuestionBank 至少 1 道题，candidates 必非空（每个题型都至少 2 个独有字段）。
  return fc.constantFrom(...candidates).map(({ qIdx, field }): Mutation => {
    const q = bank.questions[qIdx]!;
    return {
      description: `M5 inject ${field} into ${q.type} question questions[${qIdx}]`,
      mutator: (root) => {
        const target = questionAt(root, qIdx);
        target[field] = 'cross-type-injected-value';
      },
      expected: {
        path: `questions[${qIdx}].${field}`,
        // Ajv 在 `unevaluatedProperties: false` 下把这种违规归为
        // unevaluatedProperties 关键字，被 `mapKeywordToKind` 映射为
        // `oneOf_mismatch`。同一字段也可能在 oneOf 内部其它分支中以
        // `additionalProperties` 形式出现；两者都映射到 `oneOf_mismatch`。
        kinds: ['oneOf_mismatch'],
        requireQuestionId: true,
        requireQuestionType: true,
        questionId: q.id,
        questionType: q.type,
      },
    };
  });
};

/**
 * 把五类突变以等权 `oneOf` 混合：每次 100 次迭代里每类约 20 个样本，覆盖
 * 全部分支同时让 fast-check 在 shrinking 时能跨类型尝试简化。
 */
const arbSchemaMutation = (bank: QuestionBank): fc.Arbitrary<Mutation> =>
  fc.oneof(
    arbDeleteQuestionField(bank),
    arbReplaceQuestionFieldType(bank),
    arbReplaceTypeEnum(bank),
    arbReplaceDifficultyEnum(bank),
    arbInjectCrossTypeField(bank),
  );

// ---------------------------------------------------------------------------
// 工具：从 raw 题库归一化得到"已被 Parser 接受"的合法 bank（与 Property 1
// 的 normaliseToParsed 同思路）。
// ---------------------------------------------------------------------------

function normaliseToParsed(raw: QuestionBank): QuestionBank {
  const text = format(raw);
  const result = parse(text);
  if (!result.ok) {
    throw new Error(
      `生成器产出题库无法被 Parser 接受（应被认为是生成器 bug）：${JSON.stringify(
        result.error,
      )}`,
    );
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// 属性测试
// ---------------------------------------------------------------------------

describe('Property 2: Schema 违规可被完整检出（含按题型不允许的字段）', () => {
  it('单步突变（删除必填 / 类型替换 / 枚举越界 / 跨子类型字段注入）必触发 SCHEMA_VIOLATION，且至少有一条 violation 命中预期形状', () => {
    fc.assert(
      fc.property(
        arbQuestionBank.chain((raw) => {
          // 第一次 parse 做 legacy 兜底，让 B 成为 round-trip 的 fixed point；
          // 后续突变都以 B 为起点，确保起点必然能被 Parser 接受。
          const B = normaliseToParsed(raw);
          return fc.tuple(fc.constant(B), arbSchemaMutation(B));
        }),
        ([B, mutation]) => {
          // 应用突变并送回 Parser。
          const mutatedText = applyMutationToBank(B, mutation.mutator);
          const result = parse(mutatedText);

          // ---- 断言 1：必须返回 SCHEMA_VIOLATION ----
          expect(
            result.ok,
            `突变 (${mutation.description}) 后 Parser 不应解析成功`,
          ).toBe(false);
          if (result.ok) return; // 类型守卫
          expect(
            result.error.code,
            `突变 (${mutation.description}) 后期望 SCHEMA_VIOLATION，实际：${result.error.code}`,
          ).toBe('SCHEMA_VIOLATION');
          if (result.error.code !== 'SCHEMA_VIOLATION') return; // 类型守卫

          // ---- 断言 2：至少存在一条 violation 命中预期形状 ----
          const matched = findMatchingViolation(
            result.error.violations,
            mutation.expected,
          );
          expect(
            matched,
            `突变 (${mutation.description}) 期望至少有一条 violation 命中 ${JSON.stringify(
              mutation.expected,
            )}，实际 violations：${JSON.stringify(result.error.violations)}`,
          ).toBeDefined();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
