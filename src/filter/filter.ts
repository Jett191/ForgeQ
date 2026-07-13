/**
 * Filter 模块（任务 4.1）。
 *
 * 该模块严格对齐 design.md 中
 * "Components and Interfaces > Filter" 一节定义的纯函数 API：
 *
 * ```ts
 * export interface FilterState {
 *   type?: 'code' | 'qa';
 *   category?: string;
 *   tags?: ReadonlySet<string>;   // size ∈ [1, 50]
 *   difficulty?: 'easy' | 'medium' | 'hard';
 * }
 *
 * export function applyFilter(questions: readonly Question[], f: FilterState): Question[];
 * export function isActive(f: FilterState, dim: keyof FilterState): boolean;
 * export function clearDimension(f: FilterState, dim: keyof FilterState): FilterState;
 * ```
 *
 * 同时按 task 4.1 的约束补充导出 `mergeFilter(a, b)`：在每个维度上以 `b` 的
 * "已定义" 取值覆盖 `a`，未在 `b` 中定义时回退 `a`，未在二者中定义时仍未定义。
 *
 * ## 实现要点
 *
 * - **纯函数**：本文件只依赖 `../types/question`，不引用任何 `vscode.*`，
 *   便于在 Vitest 下做属性测试与单元测试。
 * - **维度激活判定**（Req 4.1）：仅当用户为某维度设置了"非空筛选值"时该维度
 *   才视为激活。具体规则：
 *   - `type`：`!== undefined` 即激活（类型系统已收窄到 `'code' | 'qa'`）。
 *   - `category`：规范化后（去首尾空白、忽略大小写）长度 ≥ 1。
 *   - `tags`：`!== undefined` 且 `Set.size ≥ 1`。
 *   - `difficulty`：`!== undefined` 即激活。
 * - **多维度组合**（Req 4.6）：四维谓词逻辑与；未激活的维度恒返回 `true`，
 *   不参与过滤。
 * - **单位元**（Req 4.8 / Property 4）：`applyFilter(Q, {})` 与 `Q` 等价
 *   （返回全新数组但元素与顺序均与 Q 相同）。
 * - **`clearDimension` 局部性**（Req 4.7 / Property 5）：仅清空目标维度，
 *   其它维度的激活状态与取值完全保持不变。
 * - **`exactOptionalPropertyTypes`**：本仓 `tsconfig.json` 启用了
 *   `exactOptionalPropertyTypes: true`，因此构造 `FilterState` 时绝不能把
 *   显式 `undefined` 写入可选字段；本模块通过"先空对象再按需赋值"的方式
 *   构造结果，避免触发该约束。
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 * Design Properties: 4 (Filter 维度语义、合成与单位元), 5 (clearDimension 局部性)
 */

import type { Difficulty, Question, QuestionType } from '../types/question';

/**
 * 四维筛选状态。任意维度未设置时为 `undefined`，表示该维度未激活。
 *
 * - `type`：`'code' | 'qa'`；激活时仅保留 `q.type === f.type` 的题目（Req 4.2）。
 * - `category`：1-100 字符；匹配前忽略首尾空白与大小写，避免同一分类因导入
 *   文件的书写差异被拆成多个分类（Req 4.3）。
 * - `tags`：非空标签集合（1 ≤ |T| ≤ 50）；激活时仅保留 `q.tags ∩ T ≠ ∅` 的
 *   题目（Req 4.4）。注意约束由 UI 层在写入前保证，本模块不在运行时校验上限。
 * - `difficulty`：`'easy' | 'medium' | 'hard'`；激活时仅保留 `q.difficulty ===
 *   f.difficulty` 的题目（Req 4.5）。
 */
export interface FilterState {
  type?: QuestionType;
  category?: string;
  tags?: ReadonlySet<string>;
  difficulty?: Difficulty;
}

/**
 * 返回分类用于比较与去重的稳定 key。
 *
 * 这里只规范化比较值，不改写题库中的原始 category，确保导入数据与导出内容
 * 保持原样。
 */
export function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

/** `FilterState` 的所有维度 key（保持稳定顺序，便于迭代）。 */
const DIMENSIONS = ['type', 'category', 'tags', 'difficulty'] as const satisfies readonly (keyof FilterState)[];

/**
 * 判定某筛选维度是否处于"激活"状态。
 *
 * 依据 Req 4.1：当且仅当用户为该维度设置了非空筛选值时视为激活。
 *
 * - `type` / `difficulty`：值类型已被字面量联合收窄，`!== undefined` 即激活。
 * - `category`：除了 `!== undefined`，还要求去除首尾空白后长度 ≥ 1，避免
 *   空字符串或纯空白退化为"匹配空分类"的歧义。
 * - `tags`：除了 `!== undefined`，还要求 `Set.size ≥ 1`，与 Req 4.4 中
 *   "非空标签集合 T (1 ≤ |T| ≤ 50)" 对齐。
 *
 * Validates: Requirements 4.1
 */
export function isActive(f: FilterState, dim: keyof FilterState): boolean {
  switch (dim) {
    case 'type':
      return f.type !== undefined;
    case 'category':
      return f.category !== undefined && normalizeCategory(f.category).length > 0;
    case 'tags':
      return f.tags !== undefined && f.tags.size > 0;
    case 'difficulty':
      return f.difficulty !== undefined;
  }
}

/**
 * 对题目列表执行四维筛选。
 *
 * 实现为四个独立谓词的逻辑与（Req 4.6）：
 * - 未激活的维度对所有题目恒返回 `true`，等价于不参与过滤；
 * - 已激活的维度按各自语义筛选（见 `FilterState` 字段说明）；
 * - 全部维度均未激活时 `applyFilter(Q, {}) === Q`（单位元，Req 4.8）。
 *
 * 该函数始终返回**新数组**，避免调用方误改原列表；元素本身按引用透传，
 * 不做克隆，符合纯函数视角下的"投影"语义。
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.8
 * Design Properties: 4
 */
export function applyFilter(questions: readonly Question[], f: FilterState): Question[] {
  // 提前缓存激活标志位与取值，避免在循环内反复展开 `isActive`。
  const typeActive = isActive(f, 'type');
  const categoryActive = isActive(f, 'category');
  const tagsActive = isActive(f, 'tags');
  const difficultyActive = isActive(f, 'difficulty');

  if (!typeActive && !categoryActive && !tagsActive && !difficultyActive) {
    // 单位元路径：直接返回浅拷贝，保持函数纯净（不向外暴露原 readonly 数组）。
    return questions.slice();
  }

  const wantedType = f.type;
  const wantedCategory = f.category === undefined ? undefined : normalizeCategory(f.category);
  const wantedTags = f.tags;
  const wantedDifficulty = f.difficulty;

  const out: Question[] = [];
  for (const q of questions) {
    if (typeActive && q.type !== wantedType) continue;
    if (categoryActive && normalizeCategory(q.category) !== wantedCategory) continue;
    if (tagsActive) {
      // tags 维度：只要 q.tags 与 wantedTags 交集非空即视为命中（Req 4.4）。
      // 选择遍历 q.tags 而非 wantedTags，是因为 q.tags 通常更短且 ReadonlySet
      // 的 `has` 是 O(1)。
      let hit = false;
      // wantedTags 必然非 undefined，因为 tagsActive === true。
      const t = wantedTags as ReadonlySet<string>;
      for (const tag of q.tags) {
        if (t.has(tag)) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
    }
    if (difficultyActive && q.difficulty !== wantedDifficulty) continue;
    out.push(q);
  }
  return out;
}

/**
 * 清空 `FilterState` 中的某个维度，返回新的 `FilterState`。
 *
 * 局部性保证（Req 4.7 / Property 5）：
 * - 目标维度 `dim` 在结果中变为 `undefined`（即未定义、未激活）；
 * - 其余三个维度的取值与定义状态与输入 `f` 完全一致（按 `===` 比较保留引用）。
 *
 * 实现使用"先空对象再按需赋值"的方式，规避 `exactOptionalPropertyTypes`
 * 下不能把显式 `undefined` 写入可选字段的限制。
 *
 * Validates: Requirements 4.7
 * Design Properties: 5
 */
export function clearDimension(f: FilterState, dim: keyof FilterState): FilterState {
  const out: FilterState = {};
  if (dim !== 'type' && f.type !== undefined) {
    out.type = f.type;
  }
  if (dim !== 'category' && f.category !== undefined) {
    out.category = f.category;
  }
  if (dim !== 'tags' && f.tags !== undefined) {
    out.tags = f.tags;
  }
  if (dim !== 'difficulty' && f.difficulty !== undefined) {
    out.difficulty = f.difficulty;
  }
  return out;
}

/**
 * 合并两个 `FilterState`：在每个维度上，以 `b` 的"已定义"取值覆盖 `a`。
 *
 * 语义（task 4.1 描述）：
 * > 结果等价于先按 `a` 再按 `b` 在状态层面顺序更新——`b` 已定义的维度覆盖
 * > `a`，`b` 未定义的维度沿用 `a`，二者均未定义则在结果中也未定义。
 *
 * 这是一个状态层级的"覆盖式合并"，并非 query 层级的两次过滤的交集。具体语义
 * 与不变量将在 task 4.2 的属性测试中以 design.md 的 Property 4 口径加以验证。
 *
 * "已定义"的判据使用 `!== undefined`，与 `FilterState` 字段的 optional 语义一致。
 * 对 `tags` 而言，传入空集合（size === 0）虽然 `isActive` 视为未激活，但仍
 * 视为"已定义"——这是为了允许调用方显式表达"清空后被空集合覆盖"的场景；
 * 调用方若希望在合并时让空 `tags` 沿用 `a`，应在调用前自行使用
 * `clearDimension` 把空 `tags` 归一化为 `undefined`。
 */
export function mergeFilter(a: FilterState, b: FilterState): FilterState {
  const out: FilterState = {};
  for (const key of DIMENSIONS) {
    // b 优先：b[key] 已定义时取 b[key]，否则回退 a[key]；都未定义时跳过。
    const bValue = b[key];
    if (bValue !== undefined) {
      assignDimension(out, key, bValue);
      continue;
    }
    const aValue = a[key];
    if (aValue !== undefined) {
      assignDimension(out, key, aValue);
    }
  }
  return out;
}

/**
 * 内部工具：把维度值按 `key` 对应的字段类型安全写入 `target`。
 *
 * 这里需要做按 key 的类型分派，因为 TS 无法直接推断
 * `target[key] = value` 的类型安全（联合分布问题）。switch + 局部断言把
 * 不安全断言收拢到这一处，保持外部调用点干净。
 */
function assignDimension(
  target: FilterState,
  key: keyof FilterState,
  value: NonNullable<FilterState[keyof FilterState]>,
): void {
  switch (key) {
    case 'type':
      target.type = value as QuestionType;
      return;
    case 'category':
      target.category = value as string;
      return;
    case 'tags':
      target.tags = value as ReadonlySet<string>;
      return;
    case 'difficulty':
      target.difficulty = value as Difficulty;
      return;
  }
}
