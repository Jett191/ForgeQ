/**
 * Filter 属性测试（Task 4.2 / 4.3）
 *
 * 本文件承载 Filter 模块的两个属性，按设计文档的口径在两个独立 describe 块
 * 中实现：
 *
 * - Property 4：Filter 维度语义、单位元（Task 4.2）。
 * - Property 5：clearDimension 局部性（Task 4.3）。
 *
 * 两条 Property 共享 `test/generators.ts` 中维护的 `arbFilterState` /
 * `arbFilterStateForBank` / `arbDimension` / `arbQuestionBank`：前者覆盖维度
 * 间组合的纯随机空间，后者把 `category` / `tags` / `type` / `difficulty` 偏
 * 置回采到题库现有取值，保证 `applyFilter` 的命中样本足够大。两个 Property
 * 的 `numRuns` 按 tasks.md 调整：Filter 相关 PBT 调高至 500 次迭代。
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 * Design Properties: 4 (维度语义 / 单位元), 5 (clearDimension 局部性)
 *
 * 注：原先 Property 4 中曾包含一条"合成等价"断言
 * `applyFilter(Q, mergeFilter(f1, f2)) === applyFilter(applyFilter(Q, f1), f2)`，
 * 但 design.md 已改为 later-wins `mergeFilter` 语义并撤销该等价命题，因此本
 * 文件不再包含对应的断言（Property 4 仅保留 ①/②/④ 三条）。`mergeFilter` 自身
 * 的语义由 src/filter/filter.ts 中的单元测试覆盖。
 */

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';

import {
  applyFilter,
  clearDimension,
  isActive,
  type FilterState,
} from '../../src/filter/filter.js';
import {
  arbDimension,
  arbFilterState,
  arbFilterStateForBank,
  arbQuestionBank,
} from '../generators.js';

// ---------------------------------------------------------------------------
// Property 4: Filter 维度语义、单位元
//
// 该 Property 覆盖三组断言，按 design.md 原文（Property 4）：
//   ① 已激活维度的"逐维度逻辑与"（soundness）：
//      - 若 f.type 已激活，则 ∀q∈R, q.type === f.type；
//      - 若 f.category 已激活，则 ∀q∈R, q.category === f.category（区分大小写）;
//      - 若 f.tags 已激活，则 ∀q∈R, q.tags 与 f.tags 交集非空；
//      - 若 f.difficulty 已激活，则 ∀q∈R, q.difficulty === f.difficulty。
//   ② 完备性：任何 q∈Q 同时满足所有已激活维度时必然 q∈R。
//   ④ 单位元：`applyFilter(Q, {})` 与 Q 等价（按元素与顺序）。
//
// 输入空间策略：
//   - 题库使用 `arbQuestionBank`（题目数 1-30，id 唯一，字段满足 schema 上限）；
//   - 已激活维度的取值优先回采题库现有值（`arbFilterStateForBank`），让命中
//     样本量足够大，避免 R 永远为空导致断言空转；同时该生成器仍以 ~30% 概率
//     走全随机分支，覆盖"无命中"的边界。
//   - 第 ④ 条单位元用 `arbQuestionBank` 即可，与 FilterState 无关。
// ---------------------------------------------------------------------------

// Feature: frontend-interview-practice, Property 4: Filter 维度语义、单位元
describe('Filter Property 4: 维度语义、单位元', () => {
  /**
   * 第 ① 条：已激活维度的逐维度逻辑与（soundness）。
   *
   * 对 R = `applyFilter(Q, f)` 中的每道题 q，逐维度验证：
   * - 已激活的维度必须按各自语义命中（type / category / difficulty 用 ===，
   *   tags 用集合交集非空）；
   * - 未激活的维度对 q 不施加任何约束（隐含于"不检查"即可）。
   *
   * 这与 Req 4.2-4.6 严格对齐；用 `arbFilterStateForBank` 提高命中率，避免
   * 大量样本走 R = [] 的平凡路径。
   */
  test('① 已激活维度逐维度逻辑与（soundness）', () => {
    fc.assert(
      fc.property(
        arbQuestionBank.chain((bank) =>
          fc
            .tuple(fc.constant(bank), arbFilterStateForBank(bank))
            .map(([b, f]) => ({ bank: b, filter: f })),
        ),
        ({ bank, filter }) => {
          const result = applyFilter(bank.questions, filter);

          for (const q of result) {
            if (isActive(filter, 'type')) {
              expect(q.type).toBe(filter.type);
            }
            if (isActive(filter, 'category')) {
              expect(q.category).toBe(filter.category);
            }
            if (isActive(filter, 'tags')) {
              const wanted = filter.tags as ReadonlySet<string>;
              const intersects = q.tags.some((t) => wanted.has(t));
              expect(intersects).toBe(true);
            }
            if (isActive(filter, 'difficulty')) {
              expect(q.difficulty).toBe(filter.difficulty);
            }
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * 第 ② 条：完备性。
   *
   * 对任意 q∈Q，若 q 同时满足所有已激活维度的条件，则 q 必须出现在
   * R = `applyFilter(Q, f)` 中。
   *
   * 我们在测试侧独立写一份"参考谓词" `matches(q, filter)` 来判断 q 是否满足
   * 全部已激活维度，并断言 `Q.filter(matches) === R`（按元素与顺序）。该断言
   * 同时包含了第 ① 条的 soundness（filter 留下的元素集合 ⊆ matches 留下的）
   * 与第 ② 条的 completeness（matches 留下的元素集合 ⊆ filter 留下的），并且
   * 顺序也保持一致（applyFilter 不重排）。
   */
  test('② 完备性：满足所有已激活维度的题目必在结果中（顺序保持）', () => {
    fc.assert(
      fc.property(
        arbQuestionBank.chain((bank) =>
          fc
            .tuple(fc.constant(bank), arbFilterStateForBank(bank))
            .map(([b, f]) => ({ bank: b, filter: f })),
        ),
        ({ bank, filter }) => {
          const expected = bank.questions.filter((q) => matches(q, filter));
          const actual = applyFilter(bank.questions, filter);
          expect(actual).toEqual(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * 第 ④ 条：单位元。
   *
   * `applyFilter(Q, {})` 必须返回与 Q 等价的列表（按元素与顺序相同）。
   *
   * `applyFilter` 实现上返回新数组（浅拷贝），因此这里不用 `===` 比较，而是
   * 用 `toEqual` 验证元素相同；进一步用 `toBe` 在每个 index 上验证元素是
   * 同一引用，以排除"实现里偷偷克隆元素"的回归。
   */
  test('④ 空 Filter 是单位元（applyFilter(Q, {}) 等价于 Q）', () => {
    fc.assert(
      fc.property(arbQuestionBank, (bank) => {
        const result = applyFilter(bank.questions, {});
        expect(result).toEqual(bank.questions);
        // 元素引用透传：投影语义而非克隆。
        expect(result.length).toBe(bank.questions.length);
        for (let i = 0; i < result.length; i++) {
          expect(result[i]).toBe(bank.questions[i]);
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * 测试侧的"参考谓词"：判断 q 是否同时满足 f 中所有已激活维度。
   *
   * 这里有意"独立实现"，不复用 src/filter/filter.ts 中的内部逻辑——一旦实现
   * 与谓词漂移，第 ② 条断言会立即捕捉到。
   */
  function matches(
    q: { type: 'code' | 'qa'; category: string; tags: readonly string[]; difficulty: 'easy' | 'medium' | 'hard' },
    f: FilterState,
  ): boolean {
    if (isActive(f, 'type') && q.type !== f.type) return false;
    if (isActive(f, 'category') && q.category !== f.category) return false;
    if (isActive(f, 'tags')) {
      const wanted = f.tags as ReadonlySet<string>;
      let hit = false;
      for (const t of q.tags) {
        if (wanted.has(t)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (isActive(f, 'difficulty') && q.difficulty !== f.difficulty) return false;
    return true;
  }
});

// ---------------------------------------------------------------------------
// Property 5: clearDimension 局部性
// ---------------------------------------------------------------------------

// Feature: frontend-interview-practice, Property 5: clearDimension 局部性
describe('Filter Property 5: clearDimension 局部性', () => {
  /**
   * 局部性核心断言：对任意 FilterState f 与维度 d ∈
   * {type, category, tags, difficulty}，`clearDimension(f, d)` 满足：
   * 1) d 维度变为未激活（`isActive(out, d) === false`）；
   * 2) 其余三个维度的"激活状态"与"取值"与 f 完全一致。
   *
   * 取值一致性按字段类型分别比较：
   * - `type` / `category` / `difficulty`：用 `===` 比较原始值；
   * - `tags`：必须是同一个引用（`===`），与 `clearDimension` 在
   *   src/filter/filter.ts 中"原引用透传，不做克隆"的实现保持一致。
   *
   * 测试空间通过 `arbFilterState` 让四个维度独立 50% 激活，从而充分覆盖
   * "目标维度本就未激活" 与 "目标维度已激活" 两种情形。
   */
  test('clearDimension 仅清空目标维度，其余维度激活状态与取值不变', () => {
    fc.assert(
      fc.property(arbFilterState, arbDimension, (f, d) => {
        const out = clearDimension(f, d);

        // ① 目标维度被清空：未激活，且字段值为 undefined。
        expect(isActive(out, d)).toBe(false);
        expect(out[d]).toBeUndefined();

        // ② 其余维度激活状态与取值一致。
        const others = (['type', 'category', 'tags', 'difficulty'] as const).filter(
          (k) => k !== d,
        );
        for (const k of others) {
          // 激活状态保持
          expect(isActive(out, k)).toBe(isActive(f, k));
          // 取值保持（包括 undefined）；tags 用引用相等
          if (k === 'tags') {
            expect(out.tags).toBe(f.tags);
          } else {
            expect(out[k]).toBe(f[k]);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * 幂等性的副作用检查：连续两次 `clearDimension(_, d)` 与单次效果一致；
   * 这是局部性的直接推论（一旦某维度未激活，再次清空仍返回未激活，且其余维度
   * 不被触碰）。把它单独列为一条测试，是为了在回归时用一个轻量断言迅速捕捉
   * 实现内部偶然引入的"clearDimension 顺带改其它维度"的回归。
   */
  test('clearDimension 在同一维度上幂等，对其余维度不产生副作用', () => {
    fc.assert(
      fc.property(arbFilterState, arbDimension, (f, d) => {
        const once = clearDimension(f, d);
        const twice = clearDimension(once, d);

        // 目标维度仍然未激活
        expect(isActive(twice, d)).toBe(false);
        expect(twice[d]).toBeUndefined();

        // 其余维度与第一次清空后完全一致
        const others = (['type', 'category', 'tags', 'difficulty'] as const).filter(
          (k) => k !== d,
        );
        for (const k of others) {
          expect(isActive(twice, k)).toBe(isActive(once, k));
          if (k === 'tags') {
            expect(twice.tags).toBe(once.tags);
          } else {
            expect(twice[k]).toBe(once[k]);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * 行为等价的"端到端"局部性：在任意题目列表 Q 上，把 `clearDimension(f, d)`
   * 应用于 `applyFilter(Q, _)` 的结果，应等价于"先把 f 中 d 维度去掉再过滤"。
   *
   * 这一条不直接对应 Property 5 的两条文字断言，而是验证局部性在下游
   * `applyFilter` 上的等价性：只要 `clearDimension` 真的只改 d 维度，下游基于
   * 该 FilterState 的过滤结果就只会随 d 维度变化。这里用一组很小的合成题目
   * 列表（避免引入题目生成器，与 Task 4.3 范围保持一致），仅做行为层校验。
   */
  test('clearDimension 后的 applyFilter 仅在被清空维度上发生变化', () => {
    // 极简题目列表：覆盖两种 type、两种 category、若干 tag、三种 difficulty。
    // 这里只为 Property 5 做一致性校验，不涉及 Property 4 的完备性证明。
    const Q = [
      {
        id: 'q1',
        type: 'code' as const,
        title: 't1',
        content: '',
        category: 'arrays',
        tags: ['recursion', 'easy-warmup'],
        difficulty: 'easy' as const,
        answer: '',
      },
      {
        id: 'q2',
        type: 'qa' as const,
        title: 't2',
        content: '',
        category: 'browser',
        tags: ['event-loop'],
        difficulty: 'medium' as const,
        answer: '',
      },
      {
        id: 'q3',
        type: 'code' as const,
        title: 't3',
        content: '',
        category: 'arrays',
        tags: ['sorting'],
        difficulty: 'hard' as const,
        answer: '',
      },
    ];

    fc.assert(
      fc.property(arbFilterState, arbDimension, (f, d) => {
        const cleared = clearDimension(f, d);

        // 关键不变量：cleared 上下游过滤结果只与"d 维度被去掉"相关。
        // 我们通过两条等式间接验证：① 用 cleared 过滤 Q，与用一个手工构造的
        // "只保留 f 中其余三维"的 g 过滤 Q，结果完全一致。
        const g: FilterState = {};
        if (d !== 'type' && f.type !== undefined) g.type = f.type;
        if (d !== 'category' && f.category !== undefined) g.category = f.category;
        if (d !== 'tags' && f.tags !== undefined) g.tags = f.tags;
        if (d !== 'difficulty' && f.difficulty !== undefined) g.difficulty = f.difficulty;

        expect(applyFilter(Q, cleared)).toEqual(applyFilter(Q, g));
      }),
      { numRuns: 500 },
    );
  });
});
