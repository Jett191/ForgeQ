/**
 * Practice file derivation helpers (Task 7.1).
 *
 * 该模块对齐 design.md 中：
 *
 *  - "Data Models > 文件系统布局 > `language` → 文件扩展名映射"：
 *    `extForLanguage(lang?: string): string`，缺省 / 未识别返回 `.txt`。
 *  - "Correctness Properties > Property 14: 渲染派生函数"：
 *    `initialCodeContent` / `deriveLanguageMode` / `deriveCodeAnswer` /
 *    `deriveQAAnswer` 四个纯函数。
 *
 * 这些纯函数被 `PracticeController` / `Webview Panel` / `UserDataStore`
 * 共同使用：
 *
 *  - `extForLanguage` 决定 `code/<qid>.<ext>` 的扩展名；
 *  - `initialCodeContent` 计算原生编辑器首次打开时的初始内容（Req 5.2 / 5.4 / 5.8）；
 *  - `deriveLanguageMode` 决定原生编辑器 / Webview 中代码块的语言模式（Req 5.6 / 5.9）；
 *  - `deriveCodeAnswer` / `deriveQAAnswer` 决定"查看答案"区域的展示内容
 *    （Req 5.5 / 5.9 / 6.6）。
 *
 * Validates: Requirements 5.2, 5.6, 5.8, 5.9, 6.5, 6.6
 */

import type { CodeQuestion, QAQuestion, Question } from '../types/question.js';

/**
 * "暂无参考答案" 提示文案。
 *
 * Webview 在答案区缺失时统一展示该字符串，满足 Req 5.9 / 6.6 中
 * "提示该题暂无参考答案" 的语义。文案以中文呈现，与扩展整体语言一致。
 */
export const NO_REFERENCE_ANSWER_HINT = '该题暂无参考答案';

/**
 * `language` → 文件扩展名映射。键统一为小写。
 *
 * 与 design.md 中 "Data Models > 文件系统布局 > `language` → 文件扩展名映射"
 * 表格保持 1:1 对应；任何变更必须先回写到 design.md。
 *
 * 设计上保留为 `Record<string, string>`，便于 `extForLanguage` 做 O(1) 查表。
 */
const LANGUAGE_EXT_MAP: Readonly<Record<string, string>> = Object.freeze({
  javascript: '.js',
  js: '.js',
  typescript: '.ts',
  ts: '.ts',
  jsx: '.jsx',
  tsx: '.tsx',
  python: '.py',
  py: '.py',
  java: '.java',
  go: '.go',
  rust: '.rs',
  rs: '.rs',
  c: '.c',
  cpp: '.cpp',
  'c++': '.cpp',
  html: '.html',
  css: '.css',
  json: '.json',
});

/**
 * 把 `Question.language` 字段转换为练习文件扩展名。
 *
 * 行为约定（与 design.md 表格一致）：
 *
 *  - 已知映射（不区分大小写）命中时返回对应扩展名（含点号，例如 `.ts`）。
 *  - `lang` 为 `undefined` / 空字符串 / 未识别字符串时返回 `.txt`。
 *  - `lang` 中的前后空白被忽略；用 `trim().toLowerCase()` 做归一化。
 *
 * 该函数是纯函数，无副作用，便于单元测试与 PBT 复用。
 *
 * @param lang `Question.language` 原始值（可能为 undefined）。
 * @returns 形如 `.ts` 的扩展名，永远以 `.` 开头。
 */
export function extForLanguage(lang?: string): string {
  if (typeof lang !== 'string') {
    return '.txt';
  }
  const key = lang.trim().toLowerCase();
  if (key === '') {
    return '.txt';
  }
  // `noUncheckedIndexedAccess` 让索引访问返回 `string | undefined`，
  // 必须显式判空再回退到默认值。
  const ext = LANGUAGE_EXT_MAP[key];
  return ext ?? '.txt';
}

/**
 * 计算代码题原生编辑器的初始内容。
 *
 * 三段优先级（design.md Property 14 第 1 条）：
 *
 *  1. 若 `saved !== undefined`，原样返回 `saved`（包括空字符串），表示
 *     `Storage` 已有当前题目的代码（Req 5.4）。空字符串语义为 "用户曾把代码清空"。
 *  2. 否则若 `q.initialCode` 非空字符串，返回它（新字段优先于 legacy 字段）。
 *  3. 否则若 `q.codeTemplate` 非空字符串，返回它（Req 5.2 的 legacy 兼容路径）。
 *  4. 都缺失或为空字符串时返回 `''`（Req 5.8）。
 *
 * 注意：仅当 `q.initialCode` / `q.codeTemplate` 是非空字符串时才视为 "存在"，
 * 与 design.md "saved===undefined 且 `q.initialCode || q.codeTemplate` 存在"
 * 的逻辑一致（JS `||` 会跳过空串 / undefined）。
 *
 * @param q 代码题。
 * @param saved `Storage` 中已保存的代码内容；不存在时传 `undefined`。
 */
export function initialCodeContent(q: CodeQuestion, saved: string | undefined): string {
  if (saved !== undefined) {
    return saved;
  }
  if (typeof q.initialCode === 'string' && q.initialCode !== '') {
    return q.initialCode;
  }
  if (typeof q.codeTemplate === 'string' && q.codeTemplate !== '') {
    return q.codeTemplate;
  }
  return '';
}

/**
 * 计算代码题原生编辑器 / Webview 代码块的语言模式（Req 5.6 / 5.9）。
 *
 *  - `q.language` 为非空字符串时原样返回（VS Code 的 language id 区分大小写，
 *    上层调用方负责保证传入的是合法 id）。
 *  - 缺省 / 空字符串时返回 `'plaintext'`（Req 5.9）。
 *
 * @param q 代码题。
 */
export function deriveLanguageMode(q: CodeQuestion): string {
  if (typeof q.language === 'string' && q.language !== '') {
    return q.language;
  }
  return 'plaintext';
}

/**
 * 代码题答案派生结果。
 *
 *  - `kind: 'reference'`：存在参考答案，`code` 是要展示的代码。
 *  - `kind: 'none'`：没有任何答案，UI 应展示 `NO_REFERENCE_ANSWER_HINT`。
 *
 * 用 discriminated union 而不是单一字符串，是为了让调用方能在不依赖特殊"哨兵字符串"
 * 的前提下区分"真有答案"与"没答案"两种语义。
 */
export type CodeAnswer =
  | { kind: 'reference'; code: string }
  | { kind: 'none'; hint: string };

/**
 * 计算代码题"查看答案"区域的展示内容（design.md Property 14 第 4 条）。
 *
 * 优先级：
 *
 *  1. `q.referenceCode` 非空字符串 → 返回它（新字段优先）。
 *  2. legacy `q.answer` 非空字符串 → 返回它（Req 1.1 的兜底路径）。
 *  3. 都缺失或为空字符串 → 返回 `{ kind: 'none' }` 提示文案。
 *
 * 注：Parser 已经在解析阶段把 legacy `answer` 兜底到 `referenceCode`；
 * 这里仍然显式回退一次，让该函数对"未经过 Parser 后处理"的输入也安全。
 *
 * @param q 代码题。
 */
export function deriveCodeAnswer(q: CodeQuestion): CodeAnswer {
  if (typeof q.referenceCode === 'string' && q.referenceCode !== '') {
    return { kind: 'reference', code: q.referenceCode };
  }
  if (typeof q.answer === 'string' && q.answer !== '') {
    return { kind: 'reference', code: q.answer };
  }
  return { kind: 'none', hint: NO_REFERENCE_ANSWER_HINT };
}

/**
 * 问答题答案派生结果。
 *
 *  - `kind: 'reference'`：存在简洁答案；`detailedAnswer` / `followUps` 可选展示。
 *  - `kind: 'none'`：没有任何答案，UI 应展示 `NO_REFERENCE_ANSWER_HINT`。
 *
 * `followUps` 始终为只读数组（缺省时为空数组），便于 Webview 模板直接 `for...of`
 * 而不必判空。
 */
export type QAAnswer =
  | {
      kind: 'reference';
      briefAnswer: string;
      detailedAnswer?: string;
      followUps: ReadonlyArray<{ question: string; answer?: string }>;
    }
  | { kind: 'none'; hint: string };

/**
 * 计算问答题"查看答案"区域的展示内容（design.md Property 14 第 5 条）。
 *
 * 优先级：
 *
 *  1. `q.briefAnswer` 非空字符串 → 作为 `briefAnswer`（新字段优先）。
 *  2. legacy `q.answer` 非空字符串 → 作为 `briefAnswer`（Req 6.6 的兜底路径）。
 *  3. 都缺失或为空字符串 → 返回 `{ kind: 'none' }` 提示文案。
 *
 * 同时附带 `detailedAnswer`（仅当为非空字符串时）与 `followUps`（缺省为空数组），
 * 让 Webview 一次性拿到所有需要展示的字段。
 *
 * @param q 问答题。
 */
export function deriveQAAnswer(q: QAQuestion): QAAnswer {
  let brief: string | undefined;
  if (typeof q.briefAnswer === 'string' && q.briefAnswer !== '') {
    brief = q.briefAnswer;
  } else if (typeof q.answer === 'string' && q.answer !== '') {
    brief = q.answer;
  }

  if (brief === undefined) {
    return { kind: 'none', hint: NO_REFERENCE_ANSWER_HINT };
  }

  const followUps: ReadonlyArray<{ question: string; answer?: string }> =
    Array.isArray(q.followUps) ? q.followUps : [];

  if (typeof q.detailedAnswer === 'string' && q.detailedAnswer !== '') {
    return {
      kind: 'reference',
      briefAnswer: brief,
      detailedAnswer: q.detailedAnswer,
      followUps,
    };
  }
  return {
    kind: 'reference',
    briefAnswer: brief,
    followUps,
  };
}

/**
 * 类型守卫：判断 Question 是否为代码题。
 *
 * 在 PBT / 上层路由代码中使用，避免重复书写 `q.type === 'code'`。
 */
export function isCodeQuestion(q: Question): q is CodeQuestion {
  return q.type === 'code';
}

/**
 * 类型守卫：判断 Question 是否为问答题。
 */
export function isQAQuestion(q: Question): q is QAQuestion {
  return q.type === 'qa';
}
