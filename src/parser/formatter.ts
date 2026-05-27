/**
 * Formatter：把内部 `QuestionBank` 对象序列化为符合 `Question_Bank_Schema`
 * 的 JSON 文本（任务 3.3）。
 *
 * 该模块严格对齐 design.md 中
 * "Components and Interfaces > Parser / Formatter" 一节，
 * 与 `parser.ts` 互为反函数。它是 design.md "Property 1: Parser-Formatter
 * 解析-序列化往返一致" 的实现侧支柱：对任意由 Parser 成功解析得到的合法
 * `QuestionBank` 对象 B，`parse(format(B))` 应当与 B 在字段集与字段值上
 * 完全相等（Validates Req 1.8 / 1.9）。
 *
 * ## 设计约束（任务 3.3）
 *
 * - **UTF-8**：返回的是 JavaScript 字符串。该字符串再被写入磁盘时由调用方
 *   以 UTF-8 编码落盘（见 `BankStore.writeBankAtomic` 与
 *   `vscode.workspace.fs.writeFile`）。`JSON.stringify` 仅产出 ASCII 可显示
 *   字符或转义序列加上原文 Unicode 码点，整体落盘后即为合法 UTF-8。
 * - **稳定字段顺序**：`JSON.stringify(value, null, 2)` 严格按 value 的属性
 *   插入顺序输出。本模块通过显式逐字段赋值的构造序列锁定 schema 中
 *   `QuestionBase` → 子类型 extras 的字段顺序，做到"相同输入恒得到相同字节"。
 * - **legacy `answer` 与子类型字段并存**：Parser 在解析 legacy 题库（仅
 *   `answer`、缺 `referenceCode` / `briefAnswer`）时会把 `answer` 兜底映射
 *   到对应子类型字段；本 Formatter 在序列化时同时输出二者，保证 round-trip
 *   下 Parser 在第二次解析时不再触发兜底（`referenceCode` / `briefAnswer`
 *   已显式存在），从而 B 与 parse(format(B)) 的字段集 / 值都保持一致。
 *
 * ## 实现要点
 *
 * - **纯函数**：本文件仅依赖 `../types/question`，不引用任何 `vscode.*`，
 *   也不读取任何全局状态，便于在 Vitest 下做单元测试与属性测试。
 * - **不修改入参**：返回新数组 / 新对象给 `JSON.stringify`，原 `bank` 引用
 *   不被改动；`tags` / `keywords` 等数组以 `slice()` 拷贝，避免外部别名共享。
 * - **可选字段缺省即省略**：若某可选字段在输入对象中为 `undefined`（在
 *   `exactOptionalPropertyTypes: true` 下意味着 "属性未定义"），输出 JSON 中
 *   不会出现该键。这与 Parser 接受 "可选字段可缺省" 的语义对称，是 round-trip
 *   一致性的必要条件。
 * - **2 空格缩进 + 行尾换行**：与构建脚本 `scripts/generateSchema.mjs` 的
 *   schema JSON 输出风格一致，便于人类阅读题库文件、做 git diff 与外部工具
 *   校验。该格式为 JSON.parse 所完全支持，不影响 round-trip。
 *
 * Validates: Requirements 1.8, 1.9
 * Design Properties: 1 (Parser-Formatter 解析-序列化往返一致)
 *
 * @see {@link ../../.kiro/specs/frontend-interview-practice/design.md}
 * @see {@link ./schema.ts}
 */

import type {
  CodeQuestion,
  QAQuestion,
  Question,
  QuestionBank,
} from '../types/question.js';

/**
 * 把一个合法的 `QuestionBank` 对象序列化为 JSON 文本。
 *
 * 顶层字段顺序固定为 `name` → `version` → `questions`，与
 * `Question_Bank_Schema` 的 `required` 数组顺序保持一致。
 *
 * @param bank Parser 成功解析或上层模块构造的合法 `QuestionBank` 对象。
 *             调用方负责保证字段值已满足 schema 约束（长度 / 枚举），本函数
 *             不再做运行时校验，只做"忠实序列化"。
 * @returns 序列化后的 JSON 文本，2 空格缩进，行尾以 `\n` 结尾，UTF-8 安全。
 */
export function format(bank: QuestionBank): string {
  const serialised: Record<string, unknown> = {};
  serialised.name = bank.name;
  serialised.version = bank.version;
  serialised.questions = bank.questions.map(formatQuestion);

  // 2 空格缩进与构建脚本 / 题库手维护体验一致；行尾保留单个换行符以符合
  // POSIX "文本文件以 \n 结束" 的传统。
  return `${JSON.stringify(serialised, null, 2)}\n`;
}

/**
 * 序列化一道 `Question`。
 *
 * 字段顺序约定（与 `schema.ts > QuestionBase.required` + 子类型 extras 中
 * 字段声明顺序对齐，便于 diff 与人工核对）：
 *
 * 1. `QuestionBase` 必填字段：`id` → `type` → `title` → `content` →
 *    `category` → `tags` → `difficulty` → `answer`。
 * 2. 当 `type === 'code'` 时追加：`language` → `initialCode` → `codeTemplate`
 *    → `referenceCode` → `testCases` → `solutionExplanation`。
 * 3. 当 `type === 'qa'` 时追加：`keywords` → `briefAnswer` → `detailedAnswer`
 *    → `followUps`。
 *
 * 任意可选字段为 `undefined` 时整键省略，输出对象上不出现该键。
 */
function formatQuestion(q: Question): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // ----- QuestionBase 必填字段（schema.ts > QuestionBase.required） -----
  out.id = q.id;
  out.type = q.type;
  out.title = q.title;
  out.content = q.content;
  out.category = q.category;
  // tags 数组在序列化时浅拷贝，避免外部修改原数组影响 JSON.stringify 的快照
  // 行为；元素为字符串原语，无需深拷贝。
  out.tags = q.tags.slice();
  out.difficulty = q.difficulty;
  out.answer = q.answer;

  // ----- 子类型 extras：按 schema.ts 中字段声明顺序补齐 -----
  if (q.type === 'code') {
    appendCodeExtras(out, q);
  } else {
    appendQAExtras(out, q);
  }

  return out;
}

/**
 * 把 `CodeQuestion` 的子类型字段按稳定顺序追加到输出对象。
 *
 * 顺序见 `formatQuestion` 注释；任意字段为 `undefined` 即整键省略。
 *
 * 对 `testCases` 内每条用例同样做稳定字段顺序的拷贝（`name` → `input`
 * → `expected` → `description`），避免直接 `JSON.stringify` 时受到外部对象
 * 字段插入顺序的影响——这一点对 round-trip 的字节级稳定性很重要：
 * 即便上层在内存中以不同顺序写入字段，Formatter 输出仍然唯一确定。
 */
function appendCodeExtras(
  out: Record<string, unknown>,
  q: CodeQuestion,
): void {
  if (q.language !== undefined) out.language = q.language;
  if (q.initialCode !== undefined) out.initialCode = q.initialCode;
  if (q.codeTemplate !== undefined) out.codeTemplate = q.codeTemplate;
  if (q.referenceCode !== undefined) out.referenceCode = q.referenceCode;
  if (q.testCases !== undefined) {
    out.testCases = q.testCases.map(formatTestCase);
  }
  if (q.solutionExplanation !== undefined) {
    out.solutionExplanation = q.solutionExplanation;
  }
}

/**
 * 把 `QAQuestion` 的子类型字段按稳定顺序追加到输出对象。
 *
 * `keywords` 同样浅拷贝；`followUps` 内每条追问按稳定字段顺序
 * （`question` → `answer`）重新构造。
 */
function appendQAExtras(
  out: Record<string, unknown>,
  q: QAQuestion,
): void {
  if (q.keywords !== undefined) {
    out.keywords = q.keywords.slice();
  }
  if (q.briefAnswer !== undefined) out.briefAnswer = q.briefAnswer;
  if (q.detailedAnswer !== undefined) out.detailedAnswer = q.detailedAnswer;
  if (q.followUps !== undefined) {
    out.followUps = q.followUps.map(formatFollowUp);
  }
}

/**
 * 单个 `testCase` 的稳定序列化：
 * `name` → `input` → `expected` → `description`，缺省字段整键省略。
 */
function formatTestCase(
  tc: NonNullable<CodeQuestion['testCases']>[number],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (tc.name !== undefined) out.name = tc.name;
  if (tc.input !== undefined) out.input = tc.input;
  if (tc.expected !== undefined) out.expected = tc.expected;
  if (tc.description !== undefined) out.description = tc.description;
  return out;
}

/**
 * 单个 `followUp` 的稳定序列化：
 * `question` → `answer`，`answer` 为可选字段缺省时省略。
 *
 * `question` 字段在 schema 中为必填，因此始终输出。
 */
function formatFollowUp(
  fu: NonNullable<QAQuestion['followUps']>[number],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.question = fu.question;
  if (fu.answer !== undefined) out.answer = fu.answer;
  return out;
}
