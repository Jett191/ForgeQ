// Feature: frontend-interview-practice, Property 1: Parser-Formatter 解析-序列化往返一致（含 discriminated union）
//
// 验证 design.md "Correctness Properties > Property 1" 中三条核心断言：
//   ① 对于由 Parser 成功解析得到的合法 QuestionBank 对象 B，`parse(format(B))`
//      与 B 在字段集与字段值上完全相等（深度等价）；
//   ② round-trip 后每道 Question 的 `type` 与子类型字段集合（即对象键集合）
//      保持一致——确保 discriminated union 子类型字段无丢失也无错位；
//   ③ `format(B)` 输出的 JSON 文本能被同一个 `questionBankSchema` 校验通过。
//
// **Validates: Requirements 1.8, 1.9**
//
// 实现说明：
// - design.md 把命题限定在"由 Parser 成功解析得到的合法 QuestionBank"。
//   `arbQuestionBank` / `arbCodeQuestion` / `arbQAQuestion` 产出的"原始"题库
//   可能包含 `answer` 非空但 `referenceCode` / `briefAnswer` 缺省的形态；
//   这些题库在被 Parser 解析时会触发 legacy 兜底（design.md "Parser 在校验
//   通过后做以下后处理"）。因此本测试的 fixed-point 模型如下：
//     raw bank ──format──▶ JSON₀ ──parse──▶ B  （第一次解析做 legacy 归一化）
//     B        ──format──▶ JSON₁ ──parse──▶ B' （round-trip，必须等于 B）
//   断言 ①/② 在 (B, B') 上验证；断言 ③ 在 JSON₁ 上验证（也包含 JSON₀，免费）。
// - 子类型字段集合一致性通过 `new Set(Object.keys(q))` 比较，覆盖 design.md
//   "round-trip 后的 type 与子类型字段集合保持一致"语义；不仅保证字段值
//   相同，还保证可选字段的"存在 / 缺失"状态一致——这才是 round-trip
//   完备性的真正含义（toEqual 对 `{a:1}` 与 `{a:1, b:undefined}` 在
//   exactOptionalPropertyTypes 下表现一致，但通过 keys 集合比较更显式）。
// - Schema 校验侧使用一个独立的 Ajv2020 实例编译 `questionBankSchema`，
//   不复用 parser 内部 ajv 单例，避免"用同一份代码自我证明"。
// - `numRuns: 100` 与 tasks.md / design.md 一致。
//
// 生成器：
//   - 主断言使用 `arbQuestionBank`，单次属性 1-30 道题，code 与 qa 题混合，
//     覆盖 `arbCodeQuestion` / `arbQAQuestion` 中所有可选子类型字段的存在 /
//     缺失分支（参见 `test/generators.ts`）。
//   - 单题层面的覆盖通过 `arbCodeQuestion` / `arbQAQuestion` 各做一组小型
//     往返检查，让 fast-check 的 shrinking 在单题维度上更快定位反例。

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';

import { format } from '../../src/parser/formatter.js';
import { parse } from '../../src/parser/parser.js';
import { questionBankSchema } from '../../src/parser/schema.js';
import type { QuestionBank } from '../../src/types/question.js';

import {
  arbCodeQuestion,
  arbQAQuestion,
  arbQuestionBank,
} from '../generators.js';

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// Schema 校验：独立 Ajv 实例，避免与 Parser 内部单例耦合（"自我证明"）。
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateAgainstSchema = ajv.compile(questionBankSchema);

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 把 raw 题库归一化为"由 Parser 成功解析得到的"形态：
 * format → parse → 取出值。第一次解析负责 legacy `answer` 兜底，
 * 让产出对象成为 round-trip 的 fixed point。
 *
 * 返回值始终为 `QuestionBank`；任何解析失败都视为生成器侧 bug，直接抛出，
 * 让 fast-check 的 shrinking 能定位到具体反例。
 */
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

/** 把一个对象的"自身可枚举键"提取为 `Set<string>`，用于"字段集合一致"断言。 */
function ownKeySet(obj: unknown): Set<string> {
  if (obj === null || typeof obj !== 'object') return new Set();
  return new Set(Object.keys(obj));
}

/**
 * 单次完整往返核心断言：在已经归一化的 B 上做 round-trip 校验。
 *
 * 断言三连：
 *   ① `parse(format(B))` 成功，且与 B 深度相等；
 *   ② round-trip 前后每道 Question 的 `type` 与字段集合一致；
 *   ③ `format(B)` 输出的 JSON 通过 `questionBankSchema` 校验。
 */
function assertRoundTrip(B: QuestionBank): void {
  // ---- 准备 round-trip ----
  const text = format(B);

  // ③ Schema 校验：format 的输出必须通过 schema。注意这里直接对 JSON 文本
  //    做 `JSON.parse` 喂给 Ajv，与 Parser 走的不是同一条路径——这才能验证
  //    "Formatter 的输出形态" 而非"Parser 的接受形态"。
  const parsedJson: unknown = JSON.parse(text);
  const ok = validateAgainstSchema(parsedJson);
  expect(
    ok,
    `format(B) 必须通过 questionBankSchema 校验，但 Ajv 报错：${JSON.stringify(
      validateAgainstSchema.errors,
    )}`,
  ).toBe(true);

  // ① round-trip 后深度等价。
  const reParsed = parse(text);
  expect(reParsed.ok, '第二次 parse 必须成功').toBe(true);
  if (!reParsed.ok) return; // 类型守卫
  const Bprime = reParsed.value;
  expect(Bprime).toEqual(B);

  // ② 字段集合一致性：顶层与每道 Question 都做 keys 集合比较，覆盖
  //    可选子类型字段（如 `language` / `initialCode` / `referenceCode` /
  //    `keywords` / `briefAnswer` / `followUps` 等）的"存在与否"。
  expect(ownKeySet(Bprime)).toEqual(ownKeySet(B));
  expect(Bprime.questions.length).toBe(B.questions.length);
  for (let i = 0; i < B.questions.length; i += 1) {
    const original = B.questions[i]!;
    const roundTripped = Bprime.questions[i]!;
    // type 一致 —— discriminated union 的核心。
    expect(roundTripped.type).toBe(original.type);
    // 整体字段集合一致 —— 子类型可选字段不应在 round-trip 中丢失或新增。
    expect(ownKeySet(roundTripped)).toEqual(ownKeySet(original));
    // 嵌套 testCases / followUps 内部对象的字段集合也一致：嵌套结构同样
    // 经过 Formatter 的稳定字段顺序重排，断言应成立；toEqual 已经覆盖值，
    // 这里再做一次 keys 集合的对照，让"字段集合保持"在嵌套层级上同样显式。
    if (original.type === 'code' && original.testCases !== undefined) {
      const rtTestCases = (roundTripped as { testCases?: unknown[] }).testCases;
      expect(Array.isArray(rtTestCases)).toBe(true);
      const rtList = rtTestCases as unknown[];
      expect(rtList.length).toBe(original.testCases.length);
      for (let j = 0; j < original.testCases.length; j += 1) {
        expect(ownKeySet(rtList[j])).toEqual(ownKeySet(original.testCases[j]));
      }
    }
    if (original.type === 'qa' && original.followUps !== undefined) {
      const rtFollowUps = (roundTripped as { followUps?: unknown[] }).followUps;
      expect(Array.isArray(rtFollowUps)).toBe(true);
      const rtList = rtFollowUps as unknown[];
      expect(rtList.length).toBe(original.followUps.length);
      for (let j = 0; j < original.followUps.length; j += 1) {
        expect(ownKeySet(rtList[j])).toEqual(ownKeySet(original.followUps[j]));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 属性测试
// ---------------------------------------------------------------------------

describe('Property 1: Parser-Formatter 解析-序列化往返一致（含 discriminated union）', () => {
  it('arbQuestionBank: parse(format(B)) === B（深度等价）；子类型字段集合一致；format(B) 通过 schema 校验', () => {
    fc.assert(
      fc.property(arbQuestionBank, (raw) => {
        // 第一次 parse 做 legacy 兜底，让 B 成为 round-trip 的 fixed point。
        const B = normaliseToParsed(raw);
        assertRoundTrip(B);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('arbCodeQuestion 单题: round-trip 等价（覆盖 CodeQuestion 子类型字段）', () => {
    fc.assert(
      fc.property(arbCodeQuestion, (q) => {
        const raw: QuestionBank = {
          name: 'round-trip-bank',
          version: '1.0.0',
          questions: [q],
        };
        const B = normaliseToParsed(raw);
        assertRoundTrip(B);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('arbQAQuestion 单题: round-trip 等价（覆盖 QAQuestion 子类型字段）', () => {
    fc.assert(
      fc.property(arbQAQuestion, (q) => {
        const raw: QuestionBank = {
          name: 'round-trip-bank',
          version: '1.0.0',
          questions: [q],
        };
        const B = normaliseToParsed(raw);
        assertRoundTrip(B);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
