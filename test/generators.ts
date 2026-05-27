/**
 * 共享的 fast-check 生成器（Task 6.2 起逐步扩充）。
 *
 * 该文件集中管理跨多个 PBT 测试复用的 `Arbitrary`，避免每个属性测试文件都
 * 重新拼装一份相同的生成器。当前文件按以下任务建立的生成器：
 *
 * - Task 6.2 — `arbQuestionBank`、`arbLearningStateMap`
 *   （以及辅助 `arbCodeQuestion`、`arbQAQuestion`、`arbDifficulty`、
 *   `arbMasteryStatus`、`arbLearningState`）。
 *
 * 设计要点：
 * - 所有生成的 `Question` 都满足 design.md / requirements.md 中的字段约束
 *   （字段长度、`type` / `difficulty` 的枚举）；不引入会被 Parser 拒绝的形态，
 *   以便覆盖"在 Parser 流程之后"的 domain 模块（如 `buildReviewSet`）。
 * - `arbQuestionBank` 产出的 `questions` 数组中 `id` 互不相同——这与 Parser
 *   的 `DUPLICATE_QUESTION_ID` 保护一致；但 `buildReviewSet` 内部仍做防御
 *   式去重，因此即便未来加入"id 重复"的生成器也不会破坏测试。
 * - `arbLearningStateMap(questions)` 故意做成"部分覆盖"：每道题的 id 以一定
 *   概率出现在 map 中，未出现时由 `buildReviewSet` 走默认值分支
 *   （Req 8.6 / 9.6）。同时再注入若干**与 questions 无关**的"幽灵 id"，
 *   验证 `buildReviewSet` 不会因 map 中的额外条目而变化。
 */

import * as fc from 'fast-check';

import type { FilterState } from '../src/filter/filter.js';
import type { LearningState } from '../src/types/learning.js';
import type {
  CodeQuestion,
  Difficulty,
  MasteryStatus,
  QAQuestion,
  Question,
  QuestionBank,
} from '../src/types/question.js';

// ---------------------------------------------------------------------------
// 基础枚举 / 标量
// ---------------------------------------------------------------------------

/** 题目难度枚举生成器。 */
export const arbDifficulty: fc.Arbitrary<Difficulty> = fc.constantFrom(
  'easy',
  'medium',
  'hard',
);

/** 掌握状态枚举生成器。 */
export const arbMasteryStatus: fc.Arbitrary<MasteryStatus> = fc.constantFrom(
  'unlearned',
  'learning',
  'mastered',
  'not_mastered',
);

/**
 * 受约束的非空字符串：1-N 字符，仅由可打印 ASCII（不含空白）组成。
 *
 * 用于 `id` / `title` / `category` 等 1-N 字符必填字段。
 */
const arbConstrainedString = (maxLength: number): fc.Arbitrary<string> =>
  fc
    .string({ minLength: 1, maxLength, unit: 'grapheme-ascii' })
    // 防御性过滤：极少数情况下可能产出全空白字符串，剔除。
    .filter((s) => s.trim().length > 0);

/** 题目标签生成器：单个标签 1-50 字符。 */
const arbTag = arbConstrainedString(50);

// ---------------------------------------------------------------------------
// 派生函数生成器（Task 7.2）
//
// 这里集中维护 Property 14 / Property 15 派生函数 PBT 所需的辅助生成器：
//
//   - `arbLanguage`：覆盖 design.md "Data Models > 文件系统布局" 中
//     `language` → 文件扩展名映射的所有"已知 case"，以及"未知字符串"分支。
//     用 `fc.oneof` 显式按权重混合两类分支，确保每次属性测试的 100 次迭代
//     里，已知映射 ~70%、未知字符串 ~30% 的样本占比，让 `extForLanguage`
//     的两条分支都能被多次踩到。
//   - `arbSavedContent`：覆盖 `initialCodeContent(q, saved)` 的两类入参：
//     `undefined`（落到 `initialCode || codeTemplate || ''` 的回退链）与
//     任意字符串（saved 命中分支）。空字符串显式包含在采样空间内，因为
//     design.md Property 14 第 1 条要求"saved 非 undefined 时返回 saved"，
//     即便 saved === ''。
//
// 这两个生成器同时被 `arbCodeQuestionWithId` 引用（设置 `language` 字段），
// 因此声明顺序要先于 Question 生成器。
// ---------------------------------------------------------------------------

/**
 * `language` → 文件扩展名映射中所有"已知键"。
 *
 * 必须保持与 `src/practice/practiceFiles.ts` 中 `LANGUAGE_EXT_MAP` 的键完全
 * 一致；任意一边新增 / 删除条目时另一边也要同步更新。
 */
const KNOWN_LANGUAGE_KEYS: readonly string[] = [
  'javascript',
  'js',
  'typescript',
  'ts',
  'jsx',
  'tsx',
  'python',
  'py',
  'java',
  'go',
  'rust',
  'rs',
  'c',
  'cpp',
  'c++',
  'html',
  'css',
  'json',
];

/**
 * 已知 language 键的生成器：均匀采样上述映射表中的某个键。
 *
 * 在测试中由 `arbLanguage` 与之合并；单独导出便于其它 PBT 直接使用。
 */
const arbKnownLanguage: fc.Arbitrary<string> = fc.constantFrom(
  ...KNOWN_LANGUAGE_KEYS,
);

/**
 * "未知 language 字符串" 生成器：构造不与任何已知键冲突的非空字符串。
 *
 * 实现：用 `fc.string` 生成 1-50 字符的字符串，并在 `filter` 中剔除"归一化后
 * 命中已知键"的样本。归一化等价于 `extForLanguage` 内部的 `trim+toLowerCase`，
 * 保证生成器产出的"未知"样本无论原始大小写 / 前后空白都不会被映射表命中。
 */
const arbUnknownLanguageString: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50, unit: 'grapheme-ascii' })
  .filter((s) => {
    const normalized = s.trim().toLowerCase();
    if (normalized === '') return false;
    return !KNOWN_LANGUAGE_KEYS.includes(normalized);
  });

/**
 * `Question.language` 字段的生成器：~70% 已知映射 + ~30% 未知字符串。
 *
 * 不在此处生成 `undefined`，因为 `Question.language` 是可选字段，"语言缺省"
 * 由调用方（`arbCodeQuestionWithId` 与 Property 14 测试）通过 `fc.option`
 * 单独覆盖，保持职责单一。
 */
export const arbLanguage: fc.Arbitrary<string> = fc.oneof(
  { weight: 7, arbitrary: arbKnownLanguage },
  { weight: 3, arbitrary: arbUnknownLanguageString },
);

/**
 * `initialCodeContent(q, saved)` 中 `saved` 入参的生成器：要么 `undefined`，
 * 要么任意字符串（含空串）。
 *
 * 用 `fc.option(_, { nil: undefined })` 获取真正的 `undefined`，让"saved 缺失"
 * 与"saved === ''"两个语义彻底分开（后者必须按 design.md 要求返回 ''）。
 */
export const arbSavedContent: fc.Arbitrary<string | undefined> = fc.option(
  fc.string({ maxLength: 200, unit: 'grapheme-ascii' }),
  { nil: undefined },
);

// ---------------------------------------------------------------------------
// Question 生成器
// ---------------------------------------------------------------------------

/**
 * 生成一道符合 schema 约束的代码题。
 *
 * 必填字段（`id` / `type` / `title` / `content` / `category` / `tags` /
 * `difficulty` / `answer`）始终满足 Req 1.1 的长度上限；可选子类型字段
 * （`language` / `initialCode` / `codeTemplate` / `referenceCode`）每个都以
 * `fc.option(_, { nil: null })` 的形式独立采样，命中 `null` 时显式不写入键，
 * 避免在 `exactOptionalPropertyTypes: true` 下把 `undefined` 写进可选字段。
 *
 * 这些可选字段对 Task 7.2 (Property 14) 的派生函数测试至关重要：
 * - `language` 决定 `extForLanguage` / `deriveLanguageMode` 的分支；
 * - `initialCode` / `codeTemplate` 决定 `initialCodeContent` 的回退链；
 * - `referenceCode` 决定 `deriveCodeAnswer` 的回退链。
 *
 * 对未引用这些字段的下游测试（例如 ReviewSetBuilder PBT）保持向后兼容，
 * 因为额外字段都是可选键，不会破坏既有断言。
 */
const arbCodeQuestionWithId = (id: string): fc.Arbitrary<CodeQuestion> =>
  fc
    .record({
      id: fc.constant(id),
      type: fc.constant('code' as const),
      title: arbConstrainedString(200),
      content: fc.string({ maxLength: 200, unit: 'grapheme-ascii' }),
      category: arbConstrainedString(100),
      tags: fc.array(arbTag, { minLength: 0, maxLength: 5 }),
      difficulty: arbDifficulty,
      answer: fc.string({ maxLength: 200, unit: 'grapheme-ascii' }),
      // Optional discriminated-union extras —— `null` 占位避免显式 undefined。
      language: fc.option(arbLanguage, { nil: null }),
      initialCode: fc.option(fc.string({ maxLength: 200, unit: 'grapheme-ascii' }), {
        nil: null,
      }),
      codeTemplate: fc.option(fc.string({ maxLength: 200, unit: 'grapheme-ascii' }), {
        nil: null,
      }),
      referenceCode: fc.option(fc.string({ maxLength: 200, unit: 'grapheme-ascii' }), {
        nil: null,
      }),
    })
    .map(({ language, initialCode, codeTemplate, referenceCode, ...base }) => {
      const out: CodeQuestion = base;
      if (language !== null) out.language = language;
      if (initialCode !== null) out.initialCode = initialCode;
      if (codeTemplate !== null) out.codeTemplate = codeTemplate;
      if (referenceCode !== null) out.referenceCode = referenceCode;
      return out;
    });

/**
 * 生成一道符合 schema 约束的问答题。
 *
 * 与 `arbCodeQuestionWithId` 同思路：必填字段稳定满足 schema 约束；可选
 * 子类型字段（`briefAnswer` / `detailedAnswer` / `followUps`）每个独立 ~50%
 * 概率出现，覆盖 `deriveQAAnswer` 的优先级回退链与 followUps 缺省分支。
 */
const arbQAQuestionWithId = (id: string): fc.Arbitrary<QAQuestion> =>
  fc
    .record({
      id: fc.constant(id),
      type: fc.constant('qa' as const),
      title: arbConstrainedString(200),
      content: fc.string({ maxLength: 200, unit: 'grapheme-ascii' }),
      category: arbConstrainedString(100),
      tags: fc.array(arbTag, { minLength: 0, maxLength: 5 }),
      difficulty: arbDifficulty,
      answer: fc.string({ maxLength: 200, unit: 'grapheme-ascii' }),
      briefAnswer: fc.option(fc.string({ maxLength: 200, unit: 'grapheme-ascii' }), {
        nil: null,
      }),
      detailedAnswer: fc.option(fc.string({ maxLength: 200, unit: 'grapheme-ascii' }), {
        nil: null,
      }),
      followUps: fc.option(
        fc.array(
          fc.record({
            question: arbConstrainedString(100),
            answer: fc.option(fc.string({ maxLength: 100, unit: 'grapheme-ascii' }), {
              nil: null,
            }),
          }).map(({ question, answer }) => {
            const fu: { question: string; answer?: string } = { question };
            if (answer !== null) fu.answer = answer;
            return fu;
          }),
          { maxLength: 3 },
        ),
        { nil: null },
      ),
    })
    .map(({ briefAnswer, detailedAnswer, followUps, ...base }) => {
      const out: QAQuestion = base;
      if (briefAnswer !== null) out.briefAnswer = briefAnswer;
      if (detailedAnswer !== null) out.detailedAnswer = detailedAnswer;
      if (followUps !== null) out.followUps = followUps;
      return out;
    });

/**
 * 生成一道任意类型的 `Question`（code 或 qa），id 由调用方指定。
 *
 * 暴露成 `id` 工厂的形式，方便 `arbQuestionBank` 控制全局 id 唯一性。
 */
export const arbQuestionWithId = (id: string): fc.Arbitrary<Question> =>
  fc.oneof(
    arbCodeQuestionWithId(id) as fc.Arbitrary<Question>,
    arbQAQuestionWithId(id) as fc.Arbitrary<Question>,
  );

/**
 * 生成一道 `CodeQuestion`，自动分配一个不可预知的 id（适合在不需要外部 id
 * 控制的场景使用）。
 */
export const arbCodeQuestion: fc.Arbitrary<CodeQuestion> = arbConstrainedString(
  20,
).chain((id) => arbCodeQuestionWithId(id));

/** 生成一道 `QAQuestion`，自动分配 id。 */
export const arbQAQuestion: fc.Arbitrary<QAQuestion> = arbConstrainedString(
  20,
).chain((id) => arbQAQuestionWithId(id));

// ---------------------------------------------------------------------------
// QuestionBank 生成器
// ---------------------------------------------------------------------------

/**
 * 生成一份合法的 `QuestionBank`：`questions` 长度 1-30，且 id 互不相同。
 *
 * 这里手工保证 id 唯一（而不是用 `fc.uniqueArray`），以便每条 question 的其余
 * 字段独立生成，同时仍能让生成器随机出现 id 形如 `q-7`、`q-12` 这类常见模式。
 */
export const arbQuestionBank: fc.Arbitrary<QuestionBank> = fc
  .uniqueArray(arbConstrainedString(20), {
    minLength: 1,
    maxLength: 30,
    selector: (s) => s,
  })
  .chain((ids) =>
    fc.record({
      name: arbConstrainedString(100),
      version: arbConstrainedString(20),
      questions: fc.tuple(...ids.map((id) => arbQuestionWithId(id))) as fc.Arbitrary<
        Question[]
      >,
    }),
  );

// ---------------------------------------------------------------------------
// LearningState 生成器
// ---------------------------------------------------------------------------

/**
 * 生成一个任意合法的 `LearningState`（不与具体 Question 关联）。
 *
 * 注意 `tsconfig` 启用 `exactOptionalPropertyTypes`：`lastPracticedAt` 是
 * 真正的可选键（缺席）而非显式 `undefined`，因此这里通过 `chain` 在两种形态
 * 之间挑选——"带 lastPracticedAt 的记录"或"完全省略该键的记录"。
 */
export const arbLearningState: fc.Arbitrary<LearningState> = fc
  .record({
    mastery: arbMasteryStatus,
    favoriteFlag: fc.boolean(),
    wrongFlag: fc.boolean(),
    hasNote: fc.boolean(),
  })
  .chain((base) =>
    fc.option(fc.integer({ min: 0 }), { nil: undefined }).map((ts) =>
      ts === undefined ? base : { ...base, lastPracticedAt: ts },
    ),
  );

/**
 * 给定 `questions`，生成一个 `Map<qid, LearningState>`：
 *
 * - 对每道题以 ~70% 概率写入一条状态，~30% 概率不写入（让默认值分支被覆盖）。
 * - 额外注入 0-5 条与 `questions` 无关的"幽灵"条目（id 来自独立生成器），
 *   用于验证 `buildReviewSet` 不会因 map 中的额外条目改变结果。
 *
 * 注意：返回的是真正的 `Map` 实例（不是 plain object），与 `buildReviewSet`
 * 的 `ReadonlyMap<string, LearningState>` 形参契约一致。
 */
export const arbLearningStateMap = (
  questions: readonly Question[],
): fc.Arbitrary<Map<string, LearningState>> => {
  const knownIds = questions.map((q) => q.id);
  const knownEntries = fc.tuple(
    ...knownIds.map((id) =>
      fc.option(arbLearningState, { nil: undefined }).map(
        (state): [string, LearningState] | undefined =>
          state === undefined ? undefined : [id, state],
      ),
    ),
  ) as fc.Arbitrary<Array<[string, LearningState] | undefined>>;

  // "幽灵" id：生成与 questions 无关的随机字符串，并过滤掉与已知 id 冲突的。
  const ghostEntries = fc
    .array(fc.tuple(arbConstrainedString(20), arbLearningState), {
      minLength: 0,
      maxLength: 5,
    })
    .map((pairs) => pairs.filter(([id]) => !knownIds.includes(id)));

  return fc.tuple(knownEntries, ghostEntries).map(([known, ghost]) => {
    const map = new Map<string, LearningState>();
    for (const entry of known) {
      if (entry !== undefined) {
        map.set(entry[0], entry[1]);
      }
    }
    for (const [id, state] of ghost) {
      map.set(id, state);
    }
    return map;
  });
};

// ---------------------------------------------------------------------------
// Filter 生成器（Task 4.2 / 4.3）
//
// 这一组生成器原先放在 `test/properties/filter.property.test.ts` 内部，
// Task 4.2 起被提取到本文件，便于其它 PBT 测试（如 ReviewView 与
// PracticeController 派生函数）按需复用：
//
//   - `arbDimension`：四个 `FilterState` 维度 key 的均匀采样。
//   - `arbFilterState`：四个维度独立 50% 激活的 FilterState 生成器，
//     适合做"维度间组合 / 局部性"这一类与具体题库无关的属性测试
//     （例如 Property 5 clearDimension 局部性）。
//   - `arbFilterStateForBank(bank)`：在已生成 `QuestionBank` 的基础上，
//     以一定概率从题库现有的 `category` / `tags` / `type` / `difficulty`
//     中采样取值，用于让 `applyFilter` 的命中样本量足够大，尤其是 Property 4
//     的 soundness / completeness / 合成等价性 / 单位元四组断言。
//
// 设计动机：`arbQuestionBank` 中 `category` / 单 tag 长度可达 1-100 / 1-50 ASCII
// 字符，纯随机生成的 `FilterState.category` / `FilterState.tags` 几乎不会与
// 题库已有取值重合，从而让 `applyFilter` 的输出永远为空，掩盖 Property 4
// 中"完备性"与"合成等价性"两条断言的真实覆盖率。`arbFilterStateForBank` 在
// 这两个维度上以 ~70% 概率回采题库已有值，剩余 ~30% 概率走全随机分支，兼顾
// 覆盖率与发现 corner case 的能力。
// ---------------------------------------------------------------------------

/** `FilterState` 的全部维度 key，用于驱动 `clearDimension` 局部性测试与 fc 采样。 */
export const arbDimension: fc.Arbitrary<keyof FilterState> = fc.constantFrom(
  'type',
  'category',
  'tags',
  'difficulty',
);

/** 单个 tag 字符串：长度 1-50 ASCII（与 schema 上限一致）。 */
const arbAnyTag: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 50 });

/** `tags` 维度的"已激活"取值：1-50 个唯一 tag 组成的 ReadonlySet。 */
const arbAnyTagsSet: fc.Arbitrary<ReadonlySet<string>> = fc
  .uniqueArray(arbAnyTag, { minLength: 1, maxLength: 50 })
  .map((arr): ReadonlySet<string> => new Set(arr));

/**
 * 任意 `FilterState`：四个维度各自 ~50% 概率激活。
 *
 * - `type`：未定义或 `'code' | 'qa'`。
 * - `category`：未定义或长度 1-100 的非空字符串（短串 `''` 在 `isActive` 下视为
 *   未激活，这里规避以保持"已定义 ⇔ 已激活"的简单一致语义）。
 * - `tags`：未定义或大小 1-50 的 `ReadonlySet<string>`。
 * - `difficulty`：未定义或 `'easy' | 'medium' | 'hard'`。
 *
 * `exactOptionalPropertyTypes: true` 约束下，构造结果时绝不向可选字段写入显式
 * `undefined`：先在中间结构里用 `null` 占位，再按是否为 `null` 决定是否拷贝。
 */
export const arbFilterState: fc.Arbitrary<FilterState> = fc
  .record({
    type: fc.option(fc.constantFrom<'code' | 'qa'>('code', 'qa'), { nil: null }),
    category: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
    tags: fc.option(arbAnyTagsSet, { nil: null }),
    difficulty: fc.option(
      fc.constantFrom<'easy' | 'medium' | 'hard'>('easy', 'medium', 'hard'),
      { nil: null },
    ),
  })
  .map(({ type, category, tags, difficulty }) => {
    const out: FilterState = {};
    if (type !== null) out.type = type;
    if (category !== null) out.category = category;
    if (tags !== null) out.tags = tags;
    if (difficulty !== null) out.difficulty = difficulty;
    return out;
  });

/**
 * 以 `bank` 为锚点生成 `FilterState`：每个维度独立 ~50% 概率激活；激活时按下述
 * 策略采样取值，让 `applyFilter` 的命中样本足够大：
 *
 * - `type`：从 `{'code', 'qa'}` 均匀采样（题库内必出现这两个值之一，故无需偏置）。
 * - `category`：~70% 从 `bank.questions[*].category` 中均匀采样；~30% 走全随机
 *   1-100 字符串（覆盖"完全无命中"的边界）。
 * - `tags`：~70% 取一个非空子集，元素从 `bank.questions[*].tags` 平铺去重后的
 *   tag 池中采样；~30% 走全随机 tag 集（再次覆盖"完全无命中"）。当题库不存在
 *   任何 tag 时降级为全随机 tag 集。
 * - `difficulty`：从 `{'easy','medium','hard'}` 均匀采样。
 *
 * 该生成器不会依赖 `bank` 是否符合某种排序——仅依赖其字段值的并集，因此对
 * `arbQuestionBank` 产出的任何题库都安全。
 */
export const arbFilterStateForBank = (
  bank: QuestionBank,
): fc.Arbitrary<FilterState> => {
  const knownCategories = Array.from(new Set(bank.questions.map((q) => q.category)));
  const knownTagPool = Array.from(
    new Set(bank.questions.flatMap((q) => q.tags)),
  );
  const knownDifficulties = ['easy', 'medium', 'hard'] as const;

  const arbCategoryActive: fc.Arbitrary<string> =
    knownCategories.length > 0
      ? fc.oneof(
          { weight: 7, arbitrary: fc.constantFrom(...knownCategories) },
          { weight: 3, arbitrary: fc.string({ minLength: 1, maxLength: 100 }) },
        )
      : fc.string({ minLength: 1, maxLength: 100 });

  // 优先从已知 tag 池采样一个非空子集（最多 5 个），保证至少 1 个；
  // 当池为空时降级为全随机 tag 集。
  const arbTagsFromPool: fc.Arbitrary<ReadonlySet<string>> =
    knownTagPool.length > 0
      ? fc
          .uniqueArray(fc.constantFrom(...knownTagPool), {
            minLength: 1,
            maxLength: Math.min(5, knownTagPool.length),
          })
          .map((arr): ReadonlySet<string> => new Set(arr))
      : arbAnyTagsSet;

  const arbTagsActive: fc.Arbitrary<ReadonlySet<string>> = fc.oneof(
    { weight: 7, arbitrary: arbTagsFromPool },
    { weight: 3, arbitrary: arbAnyTagsSet },
  );

  return fc
    .record({
      type: fc.option(fc.constantFrom<'code' | 'qa'>('code', 'qa'), { nil: null }),
      category: fc.option(arbCategoryActive, { nil: null }),
      tags: fc.option(arbTagsActive, { nil: null }),
      difficulty: fc.option(fc.constantFrom(...knownDifficulties), { nil: null }),
    })
    .map(({ type, category, tags, difficulty }) => {
      const out: FilterState = {};
      if (type !== null) out.type = type;
      if (category !== null) out.category = category;
      if (tags !== null) out.tags = tags;
      if (difficulty !== null) out.difficulty = difficulty;
      return out;
    });
};

