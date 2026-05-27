/**
 * Parser EXAMPLE / EDGE_CASE 测试（任务 3.7）。
 *
 * 用具体输入 / 期望输出锁定 design.md "Parser / Formatter" 一节中三组核心
 * 边界行为：
 *
 *   1. **`INVALID_JSON` 行列号定位**：分别构造"少 brace / 未引用键 / bad
 *      escape" 三种触发不同 fail 分支的 JSON 文本，断言 `line` / `column`
 *      取到首个失败 token 的精确 1 起始位置（Req 1.3）。
 *   2. **`EMPTY_QUESTION_BANK` 短路**：当 `questions: []` 时 Parser 在
 *      Ajv 之前优先返回更友好的错误码，而不是被 schema `minItems: 1`
 *      "吃掉"成 `SCHEMA_VIOLATION`（Req 1.10）。
 *   3. **legacy `answer` 兜底**：经过 schema 校验 + 重复检查的 bank 进入
 *      后处理：code 题在 `referenceCode` 缺省、`answer` 非空时把 `answer`
 *      映射为 `referenceCode`；qa 题同理映射到 `briefAnswer`；显式提供子
 *      类型字段或 `answer === ''` 的情况下不做改写（Req 1.1）。
 *
 * 这是 EXAMPLE 测试（concrete inputs → expected outputs），与 PBT 互补，
 * 不引入 fast-check。覆盖 design.md 中 Parser 模块顶部注释列出的"错误归
 * 一化优先级"短路逻辑。
 *
 * **Validates: Requirements 1.3, 1.10, 1.1**
 */

import { describe, expect, it } from 'vitest';

import { parse } from '../../src/parser/parser.js';
import type {
  CodeQuestion,
  QAQuestion,
  QuestionBank,
} from '../../src/types/question.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 构造一个最小合法 bank fixture，方便各用例在其上做小幅修改。
 *
 * 字段值刻意保持简短稳定，便于断言深度等价；不引入可选子类型字段，
 * 让 legacy `answer` 兜底相关用例自行控制 `referenceCode` / `briefAnswer`
 * 的存在与否。
 */
function makeCodeQuestion(overrides: Partial<CodeQuestion> = {}): CodeQuestion {
  const base: CodeQuestion = {
    id: 'code-1',
    type: 'code',
    title: '反转字符串',
    content: '请实现 reverse(s)。',
    category: '字符串',
    tags: ['easy', 'string'],
    difficulty: 'easy',
    answer: 'return s.split("").reverse().join("")',
  };
  return { ...base, ...overrides };
}

function makeQAQuestion(overrides: Partial<QAQuestion> = {}): QAQuestion {
  const base: QAQuestion = {
    id: 'qa-1',
    type: 'qa',
    title: '解释 event loop',
    content: 'event loop 是什么？',
    category: 'JavaScript',
    tags: ['runtime'],
    difficulty: 'medium',
    answer: '事件循环负责协调宏任务与微任务',
  };
  return { ...base, ...overrides };
}

function makeBank(questions: QuestionBank['questions']): QuestionBank {
  return {
    name: 'fixture-bank',
    version: '1.0.0',
    questions,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Parser INVALID_JSON 行列号定位 (Req 1.3)', () => {
  it('未闭合的对象（缺 closing brace）报告"end of JSON input"，行列号定位到 EOF', () => {
    // 输入：`{"k": "v"`（长度 9）
    //
    // 期望：parseString 读完 'v' 后回到 parseObject 循环，发现已到 EOF，
    // 触发 `fail('Unexpected end of JSON input')`。此时扫描指针位于
    // text.length=9 的位置，1 起始的列号为 10。
    const text = '{"k": "v"';

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_JSON');
    if (result.error.code !== 'INVALID_JSON') return;
    expect(result.error.line).toBe(1);
    expect(result.error.column).toBe(10);
    expect(result.error.message).toMatch(/end of JSON input/i);
  });

  it('属性键未加引号时报告 "Expected double-quoted property name"，行列号指向起始字符', () => {
    // 输入：`{name: "x"}`
    //
    // 期望：parseObject 在吃掉 `{` 后跳过空白，发现 `n` 不是 `"`，立即
    // `fail("Expected double-quoted property name, got 'n'")`。`{` 占用
    // 列 1，`n` 位于 1 起始的列 2。
    const text = '{name: "x"}';

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_JSON');
    if (result.error.code !== 'INVALID_JSON') return;
    expect(result.error.line).toBe(1);
    expect(result.error.column).toBe(2);
    expect(result.error.message).toMatch(/property name/i);
  });

  it('字符串中出现非法转义时报告 "Invalid escape"，行列号指向被拒绝的转义字符', () => {
    // 输入：`{"k": "a\xb"}`（JS 字面量需写 `"a\\xb"`）。
    //
    // 期望：parseString 解析 'a' 后遇到 `\\`，进入转义分支吃掉反斜杠（pos=9，
    // col=10），随后 `esc='x'` 命中 default 分支立即 `fail`。因为 advance
    // 是先记录再前移，`\\x` 这两个字符吃完后 line/column 已经更新为 10，
    // 与 design.md / Req 1.3 的 1 起始约定一致。
    const text = '{"k": "a\\xb"}';

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_JSON');
    if (result.error.code !== 'INVALID_JSON') return;
    expect(result.error.line).toBe(1);
    expect(result.error.column).toBe(10);
    expect(result.error.message).toMatch(/invalid escape/i);
    expect(result.error.message).toContain('x');
  });

  it('多行 JSON 中失败位置正确累计行号', () => {
    // 输入：跨两行，第二行第 3 列出现非法 token（`x`）。
    //
    //   line 1: `{`
    //   line 2: `  x: "y"}`
    //
    // 期望：跨过 `\n` 后行号 +1、列号归 1，再吃掉两个空格列号到 3，命中
    // 未引用键的失败分支。
    const text = '{\n  x: "y"}';

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_JSON');
    if (result.error.code !== 'INVALID_JSON') return;
    expect(result.error.line).toBe(2);
    expect(result.error.column).toBe(3);
  });
});

describe('Parser EMPTY_QUESTION_BANK 短路 (Req 1.10)', () => {
  it('合法 JSON 但 questions 为空数组时返回 EMPTY_QUESTION_BANK，不被 SCHEMA_VIOLATION 吞噬', () => {
    const text = JSON.stringify({
      name: 'empty-bank',
      version: '1.0.0',
      questions: [],
    });

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EMPTY_QUESTION_BANK');
  });

  it('包含至少一道题的 bank 不会触发 EMPTY_QUESTION_BANK 分支', () => {
    // 这条用例确保短路条件足够紧（只在 `questions: []` 时触发），
    // 否则会与 Req 1.10 的语义冲突。
    const text = JSON.stringify(makeBank([makeCodeQuestion()]));

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.questions).toHaveLength(1);
  });
});

describe('Parser legacy answer 兜底 (Req 1.1)', () => {
  it('code 题缺失 referenceCode 且 answer 非空时，将 answer 同步映射为 referenceCode', () => {
    const codeQ = makeCodeQuestion({
      id: 'code-fallback',
      answer: 'return 42;',
    });
    const text = JSON.stringify(makeBank([codeQ]));

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.value.questions[0];
    expect(out).toBeDefined();
    if (out === undefined || out.type !== 'code') {
      throw new Error('expected first question to be a code question');
    }
    expect(out.referenceCode).toBe('return 42;');
    // answer 字段保持原值不变，兜底是"补充"而非"替换"。
    expect(out.answer).toBe('return 42;');
  });

  it('qa 题缺失 briefAnswer 且 answer 非空时，将 answer 同步映射为 briefAnswer', () => {
    const qaQ = makeQAQuestion({
      id: 'qa-fallback',
      answer: '事件循环协调任务调度。',
    });
    const text = JSON.stringify(makeBank([qaQ]));

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.value.questions[0];
    expect(out).toBeDefined();
    if (out === undefined || out.type !== 'qa') {
      throw new Error('expected first question to be a qa question');
    }
    expect(out.briefAnswer).toBe('事件循环协调任务调度。');
    expect(out.answer).toBe('事件循环协调任务调度。');
  });

  it('code 题已显式提供 referenceCode 时不被 answer 覆盖', () => {
    // 兜底逻辑只在 `referenceCode === undefined` 时触发；显式提供时
    // Parser 必须保持原值，否则会破坏"显式优先"语义。
    const codeQ = makeCodeQuestion({
      id: 'code-explicit',
      answer: 'legacy answer',
      referenceCode: 'explicit reference',
    });
    const text = JSON.stringify(makeBank([codeQ]));

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.value.questions[0];
    if (out === undefined || out.type !== 'code') {
      throw new Error('expected first question to be a code question');
    }
    expect(out.referenceCode).toBe('explicit reference');
    expect(out.answer).toBe('legacy answer');
  });

  it('qa 题已显式提供 briefAnswer 时不被 answer 覆盖', () => {
    const qaQ = makeQAQuestion({
      id: 'qa-explicit',
      answer: 'legacy answer',
      briefAnswer: 'explicit brief',
    });
    const text = JSON.stringify(makeBank([qaQ]));

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.value.questions[0];
    if (out === undefined || out.type !== 'qa') {
      throw new Error('expected first question to be a qa question');
    }
    expect(out.briefAnswer).toBe('explicit brief');
    expect(out.answer).toBe('legacy answer');
  });

  it('answer === "" 时不触发兜底（保留 referenceCode / briefAnswer 缺省）', () => {
    // design.md "Parser legacy 兜底"明确要求空 answer 不写入子类型字段，
    // 让 UI 层退化为"暂无参考答案"文案，而不是渲染一个空字符串。
    const codeQ = makeCodeQuestion({ id: 'code-empty', answer: '' });
    const qaQ = makeQAQuestion({ id: 'qa-empty', answer: '' });
    const text = JSON.stringify(makeBank([codeQ, qaQ]));

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [code, qa] = result.value.questions;
    if (code === undefined || code.type !== 'code') {
      throw new Error('expected first question to be a code question');
    }
    if (qa === undefined || qa.type !== 'qa') {
      throw new Error('expected second question to be a qa question');
    }
    expect(code.referenceCode).toBeUndefined();
    expect(qa.briefAnswer).toBeUndefined();
  });
});
