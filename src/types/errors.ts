/**
 * 领域错误与解析错误类型，以及通用的 Result 标签联合。
 *
 * 该文件仅承载类型定义，不包含任何运行时逻辑或副作用。
 *
 * 定义来源：design.md > Components and Interfaces > Parser / Formatter
 *                   > Error Handling > 错误类型枚举
 */

/**
 * Schema 校验违规项。`Parser` 把 Ajv 输出归一化为该结构，便于上层统一展示
 * "字段路径 + 类型 + 题目定位" 三段式错误。
 *
 * - `path`：JSON Pointer 风格路径，例如 `"questions[3].referenceCode"`。
 * - `kind`：违规分类，覆盖 `oneOf` 与 `if/then/else` 误用（`oneOf_mismatch`）。
 * - `questionId` / `questionType`：当违规可定位到具体 Question 时填充，
 *   方便 UI 对"按题型不允许的字段"做精准提示（参见 Property 2 / Req 1.4-1.6）。
 */
export interface SchemaViolation {
  path: string;
  kind: 'missing' | 'type_mismatch' | 'enum_violation' | 'oneOf_mismatch';
  questionId?: string;
  questionType?: 'code' | 'qa';
}

/**
 * Parser 在解析 / 校验阶段产生的错误。是 `DomainError` 的真子集，
 * 单独导出便于 `Parser` 在 `Result<QuestionBank, ParseError>` 中精确表达。
 *
 * - `INVALID_JSON.line / column`：1 起始的人类可读位置。
 * - `DUPLICATE_QUESTION_ID.duplicates[i].indices`：每个重复 id 在
 *   `questions` 数组中的全部 0 起始下标。
 */
export type ParseError =
  | { code: 'INVALID_JSON';          line: number; column: number; message: string }
  | { code: 'SCHEMA_VIOLATION';      violations: SchemaViolation[] }
  | { code: 'DUPLICATE_QUESTION_ID'; duplicates: { id: string; indices: number[] }[] }
  | { code: 'EMPTY_QUESTION_BANK' };

/**
 * 跨模块共用的领域错误。所有 I/O 与解析失败都被规约到该 discriminated union，
 * 便于 UI 层统一格式化提示与回滚。
 *
 * 分类与对应触发位置参见 design.md > Error Handling > 错误流与回滚机制。
 */
export type DomainError =
  // Parser 错误（Req 1）
  | { code: 'INVALID_JSON';          line: number; column: number; message: string }
  | { code: 'SCHEMA_VIOLATION';      violations: SchemaViolation[] }
  | { code: 'DUPLICATE_QUESTION_ID'; duplicates: { id: string; indices: number[] }[] }
  | { code: 'EMPTY_QUESTION_BANK' }

  // Importer 错误（Req 2 / 11）
  | { code: 'FILE_TOO_LARGE';        sizeBytes: number; limitBytes: number }
  | { code: 'FILE_READ_FAILED';      cause: string }

  // Storage / FS 错误（Req 5 / 6 / 7 / 8 / 9 / 11 + 实现层）
  | { code: 'BANK_FS_WRITE_FAILED';  bankId: string; cause: string }
  | { code: 'BANK_FS_READ_FAILED';   bankId: string; cause: string }
  | { code: 'META_CORRUPT';          cause: string }
  | { code: 'BANK_NOT_FOUND';        bankId: string }
  | { code: 'BANK_ALREADY_EXISTS';   bankId: string }
  | { code: 'STORAGE_WRITE_FAILED';  path: string; cause: string }
  | { code: 'STORAGE_LOAD_FAILED';   cause: string };

/**
 * 通用 tagged-union 结果类型。所有可能失败的纯函数（如 `parse`）以及部分 I/O
 * 入口（如 `writeWithRollback`）以该类型表达成功 / 失败两态，避免抛异常带来的
 * 控制流非局部跳转。
 *
 * 用法约束：
 * - 成功分支取 `r.value`，失败分支取 `r.error`，`ok` 字段提供穷尽的类型收窄。
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
