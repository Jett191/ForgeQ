/**
 * Parser：把 `Question_Bank_File` 的 JSON 文本解析为内部 `QuestionBank`
 * 对象（任务 3.2）。
 *
 * 严格对齐 design.md 中
 * "Components and Interfaces > Parser / Formatter" 一节，是
 * `Question_Bank_Schema` 的运行时真理源消费者：
 *
 * 1. 调用自定义 JSON 解析包装 `parseJsonWithLocation` 把文本解析为 JS 值。
 *    任何非法 JSON 都会被映射成 `INVALID_JSON`，错误信息附带首个解析失败
 *    位置的 1 起始行号 / 列号（Req 1.3）。
 * 2. 在送 Ajv 之前显式判定 `questions` 数组为空，单独返回更友好的
 *    `EMPTY_QUESTION_BANK`（Req 1.10），避免被 schema 中的 `minItems: 1`
 *    "吃掉"成 `SCHEMA_VIOLATION`。
 * 3. 用 Ajv2020（启用 `oneOf` / `if-then-else` / `unevaluatedProperties`）
 *    做结构 / 类型 / 枚举 / 题型差异化字段的校验；任何违规归一化为
 *    `SCHEMA_VIOLATION` + `SchemaViolation[]`，每条违规带上 `path` /
 *    `kind` / `questionId` / `questionType`（Req 1.4-1.6 + design 中
 *    Property 2）。
 * 4. 在 schema 通过后做 id 区分大小写精确去重；任意 id 出现 ≥ 2 次时返回
 *    `DUPLICATE_QUESTION_ID`，列出每个重复 id 在 `questions` 数组中的全部
 *    0 起始下标（Req 1.7）。
 * 5. 通过校验 + 去重的 bank 进入 legacy 兜底后处理：两种题型在
 *    `briefAnswer` 缺失且 `answer` 非空时，都用 `answer` 作为简洁答案。
 *
 * ## 设计取舍
 *
 * - **自定义 JSON 解析包装**：Node 内置 `JSON.parse` 在 V8 不同版本下
 *   错误信息格式不一致，部分错误（如 `Unexpected token 'N'` for `NaN`）
 *   不附带位置；为了稳定提供 line / column，本模块实现一个递归下降的
 *   JSON parser，自身追踪行列号。整个实现以 RFC 8259 为骨架，与
 *   `JSON.parse` 在合法 JSON 上的语义一致。
 * - **Ajv2020**：使用 `ajv/dist/2020` 入口，原生支持 `unevaluatedProperties`
 *   (2020-12 才有)、`oneOf`、`if/then/else`，与 `schema.ts` 完全匹配。
 *   `strict: false` 关闭对未知关键字的 strict-mode 警告（schema 中的
 *   `$id` / `$defs` 在 strict 模式下偶有噪声）。`allErrors: true` 让 Ajv
 *   返回所有失败原因，便于 UI 一次性提示用户全部违规字段。
 * - **错误归一化优先级**：`INVALID_JSON` → `EMPTY_QUESTION_BANK` →
 *   `SCHEMA_VIOLATION` → `DUPLICATE_QUESTION_ID`。这个顺序保证最简单、最
 *   决定性的错误先返回，贴合 design.md 中错误流的"快速失败"语义。
 * - **不变性 / 纯函数**：本文件不引用任何 `vscode.*`，`parse` 是确定性的
 *   纯函数：相同输入恒得相同结果，无副作用。这让 Vitest 与 fast-check
 *   的 PBT 用例可以零额外夹具完成测试。
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10
 * Design Properties: 1, 2, 3
 *
 * @see {@link ../../.kiro/specs/frontend-interview-practice/design.md}
 * @see {@link ./schema.ts}
 */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';

import type { Question, QuestionBank } from '../types/question.js';
import type {
  ParseError,
  Result,
  SchemaViolation,
} from '../types/errors.js';

import { questionBankSchema } from './schema.js';

// ---------------------------------------------------------------------------
// Ajv 单例与编译
// ---------------------------------------------------------------------------

/**
 * Ajv2020 单例。模块加载时 compile 一次 schema，后续 `parse` 复用；
 * 题库可达 5 MB / 10000 题，单次 compile 的开销远大于一次 validate，
 * 所以做模块级缓存对 Req 1.2 的 1 秒解析时限至关重要。
 *
 * - `allErrors: true`：返回全部违规，让 UI 一次性提示用户。
 * - `strict: false`：忽略 `$id` 等 schema 元字段在严格模式下的告警；
 *   schema 是受控的，不会误把用户输入塞进来。
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });

/** 与 `questionBankSchema` 严格对齐的运行时校验函数。 */
const validateBank: ValidateFunction<unknown> = ajv.compile(questionBankSchema);

// ---------------------------------------------------------------------------
// 公共入口
// ---------------------------------------------------------------------------

/**
 * 解析题库 JSON 文本。
 *
 * 失败语义详见模块顶部的"错误归一化优先级"注释。
 *
 * @param text 原始 UTF-8 JSON 文本（由 `Importer` 读取后传入）。
 * @returns `Result<QuestionBank, ParseError>` 标签联合，调用方据 `ok`
 *          字段做穷尽分支处理。
 */
export function parse(text: string): Result<QuestionBank, ParseError> {
  // ---- Step 1: JSON 解析（带行列号定位） ----
  const parsed = parseJsonWithLocation(text);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_JSON',
        line: parsed.line,
        column: parsed.column,
        message: parsed.message,
      },
    };
  }

  const data = parsed.value;

  // ---- Step 2: 空题库优先短路（友好错误码胜过 schema minItems） ----
  // 仅当根对象存在且 `questions` 字段是一个数组且为空时才提前返回；
  // 其它情况（根不是对象、`questions` 类型错等）继续交给 Ajv 报告
  // 更准确的 SCHEMA_VIOLATION。
  if (
    typeof data === 'object' &&
    data !== null &&
    !Array.isArray(data) &&
    Array.isArray((data as { questions?: unknown }).questions) &&
    ((data as { questions: unknown[] }).questions.length === 0)
  ) {
    return { ok: false, error: { code: 'EMPTY_QUESTION_BANK' } };
  }

  // ---- Step 3: Schema 校验 ----
  if (!validateBank(data)) {
    const violations = mapAjvErrors(validateBank.errors ?? [], data);
    return { ok: false, error: { code: 'SCHEMA_VIOLATION', violations } };
  }

  // 类型断言安全：上一步 Ajv 已确认形状与 QuestionBank 完全匹配。
  const bank = data as QuestionBank;

  // ---- Step 4: id 区分大小写精确去重 ----
  const dupErr = findDuplicateIds(bank.questions);
  if (dupErr) {
    return { ok: false, error: dupErr };
  }

  // ---- Step 5: legacy `answer` 兜底后处理 ----
  return { ok: true, value: postProcess(bank) };
}

// ---------------------------------------------------------------------------
// JSON 解析（行列号定位）
// ---------------------------------------------------------------------------

/**
 * 自定义递归下降 JSON 解析器在解析失败时返回的诊断信息。
 *
 * - `line` / `column` 均为 **1 起始**，与 Req 1.3 / Importer 错误提示对齐。
 * - `message` 是面向开发者的简短描述，UI 层可直接展示，也可以本地化。
 */
type JsonLocateError = {
  ok: false;
  line: number;
  column: number;
  message: string;
};

/** 解析成功的载荷。 */
type JsonLocateOk = { ok: true; value: unknown };

/**
 * 把任意字符串解析为 JS 值，同时在失败时返回首个错误的行列号。
 *
 * 实现要点：
 * - 完全自定义递归下降扫描，不依赖 `JSON.parse` 的错误信息（V8 跨版本
 *   不一致），保证行列号在 Node 18 / 20 / Code-Server / 浏览器 webview
 *   等所有运行时下都精确一致。
 * - 与 `JSON.parse` 在合法 JSON 输入上的语义对齐：
 *   - 严格 RFC 8259 数字（不接受 `NaN` / `Infinity` / 前导加号 / 八进制）。
 *   - 字符串中禁止裸控制字符（U+0000 - U+001F）。
 *   - 对象重复键以最后一次为准（`Object.assign` 的语义，与 V8 一致）。
 *   - 不接受尾随逗号（trailing comma）。
 * - 出错时通过抛出"sentinel"对象退栈，避免在每一层嵌套调用里手动传递
 *   错误返回值；最终由顶层 `try/catch` 捕获并归一化。
 *
 * @param text 待解析的 JSON 文本。
 * @returns `JsonLocateOk` 或 `JsonLocateError`。
 */
function parseJsonWithLocation(
  text: string,
): JsonLocateOk | JsonLocateError {
  // ----- 扫描状态：行 / 列 / 字节位置 -----
  // 使用 `text.charAt(pos)` 而非 `text[pos]` 以兼容
  // `noUncheckedIndexedAccess`：前者总是返回 string（EOF 时为 ''），后者
  // 类型为 `string | undefined`，会污染下游的字符比较。
  let pos = 0;
  let line = 1;
  let column = 1;

  /** 将扫描位置前推 n 个字符，并相应更新行 / 列。 */
  function advance(n = 1): void {
    for (let i = 0; i < n && pos < text.length; i++) {
      if (text.charAt(pos) === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      pos++;
    }
  }

  /** 抛出带行列号的解析失败 sentinel。函数签名为 `never`，便于类型收窄。 */
  function fail(message: string): never {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw { __jsonParseFail: true, line, column, message } as const;
  }

  /** 跳过 RFC 8259 允许的所有空白：`U+0009` / `U+000A` / `U+000D` / `U+0020`。 */
  function skipWs(): void {
    while (pos < text.length) {
      const c = text.charAt(pos);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        advance();
      } else {
        break;
      }
    }
  }

  /** 从当前位置解析任意 JSON 值。 */
  function parseValue(): unknown {
    skipWs();
    if (pos >= text.length) fail('Unexpected end of JSON input');
    const c = text.charAt(pos);
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"') return parseString();
    if (c === 't' || c === 'f') return parseBoolean();
    if (c === 'n') return parseNull();
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    fail(`Unexpected token '${c}'`);
  }

  function parseObject(): Record<string, unknown> {
    advance(); // 吃掉 '{'
    const obj: Record<string, unknown> = {};
    skipWs();
    if (pos < text.length && text.charAt(pos) === '}') {
      advance();
      return obj;
    }
    while (true) {
      skipWs();
      if (pos >= text.length) fail('Unexpected end of JSON input');
      if (text.charAt(pos) !== '"') {
        fail(`Expected double-quoted property name, got '${text.charAt(pos)}'`);
      }
      const key = parseString();
      skipWs();
      if (pos >= text.length || text.charAt(pos) !== ':') {
        fail("Expected ':' after property name");
      }
      advance(); // 吃掉 ':'
      const value = parseValue();
      obj[key] = value;
      skipWs();
      if (pos >= text.length) fail('Unexpected end of JSON input');
      const next = text.charAt(pos);
      if (next === ',') {
        advance();
        continue;
      }
      if (next === '}') {
        advance();
        return obj;
      }
      fail(`Unexpected token '${next}' in object`);
    }
  }

  function parseArray(): unknown[] {
    advance(); // 吃掉 '['
    const arr: unknown[] = [];
    skipWs();
    if (pos < text.length && text.charAt(pos) === ']') {
      advance();
      return arr;
    }
    while (true) {
      arr.push(parseValue());
      skipWs();
      if (pos >= text.length) fail('Unexpected end of JSON input');
      const next = text.charAt(pos);
      if (next === ',') {
        advance();
        continue;
      }
      if (next === ']') {
        advance();
        return arr;
      }
      fail(`Unexpected token '${next}' in array`);
    }
  }

  function parseString(): string {
    if (pos >= text.length || text.charAt(pos) !== '"') fail('Expected string');
    advance(); // 吃掉开引号
    let out = '';
    while (pos < text.length) {
      const c = text.charAt(pos);
      if (c === '"') {
        advance(); // 吃掉闭引号
        return out;
      }
      if (c === '\\') {
        advance();
        if (pos >= text.length) fail('Unexpected end of string escape');
        const esc = text.charAt(pos);
        switch (esc) {
          case '"':
            out += '"';
            advance();
            break;
          case '\\':
            out += '\\';
            advance();
            break;
          case '/':
            out += '/';
            advance();
            break;
          case 'b':
            out += '\b';
            advance();
            break;
          case 'f':
            out += '\f';
            advance();
            break;
          case 'n':
            out += '\n';
            advance();
            break;
          case 'r':
            out += '\r';
            advance();
            break;
          case 't':
            out += '\t';
            advance();
            break;
          case 'u': {
            advance(); // 吃掉 'u'
            if (pos + 4 > text.length) fail('Invalid unicode escape');
            const hex = text.substring(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              fail(`Invalid unicode escape '\\u${hex}'`);
            }
            out += String.fromCharCode(parseInt(hex, 16));
            advance(4);
            break;
          }
          default:
            fail(`Invalid escape character '\\${esc}'`);
        }
        continue;
      }
      // RFC 8259：字符串中禁止裸控制字符（U+0000 - U+001F）。
      if (c.charCodeAt(0) < 0x20) {
        fail('Invalid control character in string');
      }
      out += c;
      advance();
    }
    fail('Unterminated string');
  }

  function parseBoolean(): boolean {
    if (text.substring(pos, pos + 4) === 'true') {
      advance(4);
      return true;
    }
    if (text.substring(pos, pos + 5) === 'false') {
      advance(5);
      return false;
    }
    fail(`Unexpected token '${text.charAt(pos)}'`);
  }

  function parseNull(): null {
    if (text.substring(pos, pos + 4) === 'null') {
      advance(4);
      return null;
    }
    fail(`Unexpected token '${text.charAt(pos)}'`);
  }

  function parseNumber(): number {
    let s = '';
    if (text.charAt(pos) === '-') {
      s += '-';
      advance();
    }
    if (pos >= text.length) fail('Unexpected end of number');
    if (text.charAt(pos) === '0') {
      s += '0';
      advance();
    } else if (text.charAt(pos) >= '1' && text.charAt(pos) <= '9') {
      while (
        pos < text.length &&
        text.charAt(pos) >= '0' &&
        text.charAt(pos) <= '9'
      ) {
        s += text.charAt(pos);
        advance();
      }
    } else {
      fail(`Unexpected token '${text.charAt(pos)}' in number`);
    }
    if (pos < text.length && text.charAt(pos) === '.') {
      s += '.';
      advance();
      if (
        pos >= text.length ||
        !(text.charAt(pos) >= '0' && text.charAt(pos) <= '9')
      ) {
        fail('Invalid number: expected digit after decimal point');
      }
      while (
        pos < text.length &&
        text.charAt(pos) >= '0' &&
        text.charAt(pos) <= '9'
      ) {
        s += text.charAt(pos);
        advance();
      }
    }
    const c = text.charAt(pos);
    if (c === 'e' || c === 'E') {
      s += c;
      advance();
      if (text.charAt(pos) === '+' || text.charAt(pos) === '-') {
        s += text.charAt(pos);
        advance();
      }
      if (
        pos >= text.length ||
        !(text.charAt(pos) >= '0' && text.charAt(pos) <= '9')
      ) {
        fail('Invalid number: expected digit in exponent');
      }
      while (
        pos < text.length &&
        text.charAt(pos) >= '0' &&
        text.charAt(pos) <= '9'
      ) {
        s += text.charAt(pos);
        advance();
      }
    }
    return Number(s);
  }

  try {
    skipWs();
    if (pos >= text.length) {
      return {
        ok: false,
        line: 1,
        column: 1,
        message: 'Unexpected end of JSON input',
      };
    }
    const value = parseValue();
    skipWs();
    if (pos < text.length) {
      return {
        ok: false,
        line,
        column,
        message: `Unexpected trailing token '${text.charAt(pos)}'`,
      };
    }
    return { ok: true, value };
  } catch (e: unknown) {
    if (
      typeof e === 'object' &&
      e !== null &&
      (e as { __jsonParseFail?: boolean }).__jsonParseFail === true
    ) {
      const sentinel = e as { line: number; column: number; message: string };
      return {
        ok: false,
        line: sentinel.line,
        column: sentinel.column,
        message: sentinel.message,
      };
    }
    // 内部 bug：让宿主感知到，便于排查。
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Ajv 错误归一化
// ---------------------------------------------------------------------------

/**
 * 把一组 Ajv `ErrorObject` 归一化为 `SchemaViolation[]`。
 *
 * 设计要点：
 * - 把 Ajv 的 JSON Pointer 风格 `instancePath`（`/questions/3/difficulty`）
 *   转换为 design.md 约定的点 / 中括号路径（`questions[3].difficulty`），
 *   方便人类阅读与 UI 直接展示。
 * - `required` 错误使用 Ajv 的 `params.missingProperty` 拼出真正缺失的
 *   字段路径；`unevaluatedProperties` / `additionalProperties` 错误同理。
 * - 对每条违规，尝试解析路径中的"questions[N]"，从原始解析结果里提取
 *   `id` / `type` 填到 `questionId` / `questionType`，让 UI 能快速定位
 *   到具体题目（特别是按题型不允许的字段提示，Property 2）。
 * - 同一对象上 Ajv 可能产出多条同义错误（如 `oneOf` + `if/then/else`
 *   + `unevaluatedProperties` 同时触发），按 `(path, kind)` 二元组去重，
 *   既保持完备性又降低 UI 噪声。
 *
 * @param errors Ajv 输出的原始错误列表。
 * @param root   Ajv 校验的输入根对象，用于按路径提取 `questionId` /
 *               `questionType`。注意：当 `root` 不是合法 `QuestionBank`
 *               形状时（type/missing 错误下），按路径访问可能拿不到这两
 *               个字段，留空即可。
 */
function mapAjvErrors(
  errors: readonly ErrorObject[],
  root: unknown,
): SchemaViolation[] {
  const seen = new Set<string>();
  const out: SchemaViolation[] = [];

  for (const err of errors) {
    const violation = ajvErrorToViolation(err, root);
    if (!violation) continue;
    const dedupKey = `${violation.path}::${violation.kind}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push(violation);
  }

  return out;
}

/**
 * 把单条 Ajv `ErrorObject` 转成 `SchemaViolation`，未知关键字返回
 * `undefined` 由调用方过滤。
 */
function ajvErrorToViolation(
  err: ErrorObject,
  root: unknown,
): SchemaViolation | undefined {
  const kind = mapKeywordToKind(err.keyword);
  if (kind === undefined) return undefined;

  // 计算违规字段路径：`required` / `unevaluatedProperties` /
  // `additionalProperties` 需要把 params 中的字段名拼到 instancePath 后面，
  // 其它关键字直接用 instancePath。
  const instancePathSegments = parseInstancePath(err.instancePath);
  let extraSegment: string | undefined;
  switch (err.keyword) {
    case 'required':
      extraSegment = (err.params as { missingProperty?: string })
        .missingProperty;
      break;
    case 'unevaluatedProperties':
      extraSegment = (err.params as { unevaluatedProperty?: string })
        .unevaluatedProperty;
      break;
    case 'additionalProperties':
      extraSegment = (err.params as { additionalProperty?: string })
        .additionalProperty;
      break;
    default:
      extraSegment = undefined;
  }

  const segments =
    extraSegment !== undefined
      ? [...instancePathSegments, { kind: 'prop' as const, value: extraSegment }]
      : instancePathSegments;

  const path = renderPath(segments);

  // 尝试从 instancePath 提取 questions[N] 索引，用于附加 questionId /
  // questionType。
  const questionIndex = extractQuestionIndex(instancePathSegments);
  const target =
    questionIndex !== undefined ? extractQuestionAt(root, questionIndex) : undefined;

  const violation: SchemaViolation = { path, kind };
  if (target?.id !== undefined) {
    violation.questionId = target.id;
  }
  if (target?.type === 'code' || target?.type === 'qa') {
    violation.questionType = target.type;
  }
  return violation;
}

/** 把 Ajv 关键字映射为 `SchemaViolation.kind`。 */
function mapKeywordToKind(
  keyword: string,
): SchemaViolation['kind'] | undefined {
  switch (keyword) {
    case 'required':
      return 'missing';

    case 'type':
    case 'minLength':
    case 'maxLength':
    case 'minItems':
    case 'maxItems':
    case 'minProperties':
    case 'maxProperties':
    case 'minimum':
    case 'maximum':
    case 'exclusiveMinimum':
    case 'exclusiveMaximum':
    case 'pattern':
    case 'format':
      return 'type_mismatch';

    case 'enum':
    case 'const':
      return 'enum_violation';

    case 'oneOf':
    case 'anyOf':
    case 'allOf':
    case 'not':
    case 'if':
    case 'then':
    case 'else':
    case 'unevaluatedProperties':
    case 'additionalProperties':
      return 'oneOf_mismatch';

    default:
      // 未知关键字保守跳过：后续若引入新的 schema 关键字再扩展。
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// JSON Pointer / 路径渲染辅助
// ---------------------------------------------------------------------------

/** 路径分段：对象属性 (`prop`) 或数组下标 (`index`)。 */
type PathSegment =
  | { kind: 'prop'; value: string }
  | { kind: 'index'; value: number };

/**
 * 解析 Ajv 的 `instancePath`（JSON Pointer，例如 `/questions/3/difficulty`）。
 *
 * - 空字符串代表根节点，返回 `[]`。
 * - 段中 `~0` 解码为 `~`、`~1` 解码为 `/`（RFC 6901）。
 * - 纯整数段视为数组下标。
 */
function parseInstancePath(instancePath: string): PathSegment[] {
  if (instancePath === '') return [];
  // instancePath 形如 `/questions/3/difficulty`，首字符为 '/'。
  const raw = instancePath.startsWith('/')
    ? instancePath.slice(1)
    : instancePath;
  return raw.split('/').map((seg) => {
    const decoded = seg.replace(/~1/g, '/').replace(/~0/g, '~');
    if (/^\d+$/.test(decoded)) {
      return { kind: 'index', value: Number(decoded) };
    }
    return { kind: 'prop', value: decoded };
  });
}

/**
 * 把 `PathSegment[]` 渲染为 design.md 约定的 `name[idx].sub` 格式。
 * 空数组返回 `'$'` 表示根节点，便于 UI 区分"根级别"违规与"无路径"。
 */
function renderPath(segments: PathSegment[]): string {
  if (segments.length === 0) return '$';
  let out = '';
  for (const seg of segments) {
    if (seg.kind === 'index') {
      out += `[${seg.value}]`;
    } else {
      out += out === '' ? seg.value : `.${seg.value}`;
    }
  }
  return out;
}

/**
 * 若路径前缀为 `questions[N]`，返回 N；否则返回 `undefined`。
 * 用于把 Ajv 错误关联到具体 Question。
 */
function extractQuestionIndex(segments: PathSegment[]): number | undefined {
  if (segments.length < 2) return undefined;
  const first = segments[0];
  const second = segments[1];
  if (
    first?.kind === 'prop' &&
    first.value === 'questions' &&
    second?.kind === 'index'
  ) {
    return second.value;
  }
  return undefined;
}

/**
 * 从原始 root 中按下标提取 question；`root` 形状未必是合法 QuestionBank，
 * 任何不匹配都返回 `undefined`，由调用方决定是否填充 `questionId` /
 * `questionType`。
 */
function extractQuestionAt(
  root: unknown,
  index: number,
): { id?: string; type?: string } | undefined {
  if (typeof root !== 'object' || root === null) return undefined;
  const questions = (root as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) return undefined;
  const q = questions[index];
  if (typeof q !== 'object' || q === null) return undefined;
  const id = (q as { id?: unknown }).id;
  const type = (q as { type?: unknown }).type;
  // `exactOptionalPropertyTypes: true` 要求"省略"与"显式 undefined"不同语义；
  // 这里逐字段条件赋值，确保只有真实存在的字段会出现在结果对象里。
  const result: { id?: string; type?: string } = {};
  if (typeof id === 'string') result.id = id;
  if (typeof type === 'string') result.type = type;
  return result;
}

// ---------------------------------------------------------------------------
// 重复 id 检测
// ---------------------------------------------------------------------------

/**
 * 区分大小写精确扫描 `questions[i].id`。任意 id 出现 ≥ 2 次时返回
 * `DUPLICATE_QUESTION_ID` 错误，列出每个重复 id 的全部 0 起始下标。
 *
 * 时间复杂度 O(n)；对 10000 题在毫秒级完成，与 Req 1.2 的 1 秒预算相比
 * 几乎可忽略。
 */
function findDuplicateIds(questions: readonly Question[]): ParseError | null {
  const indicesById = new Map<string, number[]>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q === undefined) continue; // 防御 noUncheckedIndexedAccess
    const arr = indicesById.get(q.id);
    if (arr === undefined) {
      indicesById.set(q.id, [i]);
    } else {
      arr.push(i);
    }
  }
  const duplicates: { id: string; indices: number[] }[] = [];
  for (const [id, indices] of indicesById) {
    if (indices.length > 1) {
      duplicates.push({ id, indices });
    }
  }
  if (duplicates.length === 0) return null;
  // 让错误结果具有确定性顺序：按首次出现下标排序，便于 UI 与测试断言。
  duplicates.sort(
    (a, b) => (a.indices[0] ?? 0) - (b.indices[0] ?? 0),
  );
  return { code: 'DUPLICATE_QUESTION_ID', duplicates };
}

// ---------------------------------------------------------------------------
// legacy `answer` 兜底后处理
// ---------------------------------------------------------------------------

/**
 * 通过 schema 校验 + 去重后的题库二次加工：两种题型统一把 legacy
 * `answer` 兜底映射到 `briefAnswer`。
 *
 * 这保证老题库无需增加新字段，也能在统一的 Markdown 答案区域展示。
 *
 * `answer` 为空字符串时不做兜底——空字符串没有展示价值，留给 UI 退化为
 * "暂无参考答案"文案（Req 5.9 / 6.6）。
 *
 * 不修改入参：返回的是浅拷贝 + 修改后的新对象，便于上层做引用比较与
 * 不变性追踪。
 */
function postProcess(bank: QuestionBank): QuestionBank {
  const questions = bank.questions.map(postProcessAnswer);
  return {
    name: bank.name,
    version: bank.version,
    questions,
  };
}

function postProcessAnswer(q: Question): Question {
  if (q.briefAnswer === undefined && q.answer !== '') {
    return { ...q, briefAnswer: q.answer };
  }
  return q;
}
