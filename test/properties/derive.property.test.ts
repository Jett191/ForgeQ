// Feature: frontend-interview-practice, Property 14: 渲染派生函数
//
// 验证 design.md "Correctness Properties > Property 14" 中四（实为五）个
// 派生函数的全部分支语义：
//
//   1) `initialCodeContent(q, saved)`
//      - saved !== undefined → 原样返回 saved（包含空字符串）。
//      - saved === undefined 且 `q.initialCode || q.codeTemplate` 存在 →
//        返回该值（JS `||` 语义：取首个真值，等价于"取首个非空字符串"）。
//      - 否则返回 ''。
//   2) `extForLanguage(q.language)`
//      - 已知键命中映射表中对应扩展名（与 design.md 表格 1:1）。
//      - 缺省 / 未识别返回 `.txt`。
//   3) `deriveLanguageMode(q)`
//      - `q.language` 非空字符串 → 原样返回。
//      - 否则返回 `'plaintext'`。
//   4) `deriveCodeAnswer(q)`
//      - 优先 `q.referenceCode`；缺失走 legacy `q.answer`；都缺失返回
//        `{ kind: 'none', hint }` 提示文案。
//   5) `deriveQAAnswer(q)`
//      - briefAnswer = `q.briefAnswer ?? q.answer`（均要求非空字符串）；
//        缺失时整体返回 `{ kind: 'none', hint }` 提示。
//      - 同时附带 `detailedAnswer`（仅当非空时存在）与 `followUps`（缺省 []）。
//
// 生成器使用 `arbCodeQuestion` / `arbQAQuestion`（含可选子类型字段）、
// `arbLanguage`（已知映射 + 未知字符串）与 `arbSavedContent`（含 undefined 与
// 空串）。`numRuns: 100` 与 tasks.md / design.md 一致。
//
// **Validates: Requirements 5.2, 5.6, 5.8, 5.9, 6.5, 6.6**

import { vi } from 'vitest';

// `iconRegistry.ts`（被本文件末尾的 Property 15 用例引用）在运行时
// `import * as vscode from 'vscode'`，因此必须把 `vscode` 模块替换为只包含本
// 测试需要的最小桩。该 mock 在 vitest hoist 阶段提升到 import 之前，避免被
// 替换前先加载真实模块。Property 14 自身不依赖 vscode，但与 Property 15
// 共享同一文件，因此 mock 必须放在所有 import 之前。
vi.mock('vscode', () => {
  class ThemeColor {
    readonly id: string;
    constructor(id: string) {
      this.id = id;
    }
  }
  class ThemeIcon {
    readonly id: string;
    readonly color?: ThemeColor;
    constructor(id: string, color?: ThemeColor) {
      this.id = id;
      if (color !== undefined) {
        this.color = color;
      }
    }
  }
  return { ThemeColor, ThemeIcon };
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  NO_REFERENCE_ANSWER_HINT,
  deriveCodeAnswer,
  deriveLanguageMode,
  deriveQAAnswer,
  extForLanguage,
  initialCodeContent,
} from '../../src/practice/practiceFiles.js';
import {
  arbCodeQuestion,
  arbLanguage,
  arbMasteryStatus,
  arbQAQuestion,
  arbSavedContent,
} from '../generators.js';

const NUM_RUNS = 100;

/**
 * design.md "Data Models > 文件系统布局" 中 `language` → 扩展名映射的精确镜像。
 *
 * 这里独立维护一份映射表用于测试，**不**从 `practiceFiles.ts` 导入，
 * 让测试不会"用同一份代码自我证明"——一旦实现与 design.md 表格脱钩，
 * 测试会立刻失败。
 */
const EXPECTED_EXT_MAP: Readonly<Record<string, string>> = Object.freeze({
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

/** 与实现保持一致的归一化：trim + toLowerCase。 */
const normalizeLang = (lang: string): string => lang.trim().toLowerCase();

/** 判断一个字符串是否为已知 language 键（按归一化后比较）。 */
const isKnownLanguage = (lang: string): boolean =>
  Object.prototype.hasOwnProperty.call(EXPECTED_EXT_MAP, normalizeLang(lang));

describe('Property 14: 渲染派生函数', () => {
  // -------------------------------------------------------------------------
  // 子断言 ①：initialCodeContent
  // -------------------------------------------------------------------------
  it('initialCodeContent(q, saved): saved 优先；否则 initialCode || codeTemplate || ""', () => {
    fc.assert(
      fc.property(arbCodeQuestion, arbSavedContent, (q, saved) => {
        const actual = initialCodeContent(q, saved);

        if (saved !== undefined) {
          // saved 非 undefined（包含 ''）必须原样返回。
          expect(actual).toBe(saved);
          return;
        }

        // saved === undefined：按 `initialCode || codeTemplate || ''` 取值。
        // 注意 JS `||` 把 '' 视为 falsy，与 design.md "存在" 的语义一致。
        const initial = q.initialCode;
        const template = q.codeTemplate;
        let expected: string;
        if (typeof initial === 'string' && initial !== '') {
          expected = initial;
        } else if (typeof template === 'string' && template !== '') {
          expected = template;
        } else {
          expected = '';
        }
        expect(actual).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // 子断言 ②：extForLanguage
  //
  // 拆成两条用例：已知键命中 + 未识别 / 缺省 fallback。两条都用 numRuns: 100。
  // -------------------------------------------------------------------------
  it('extForLanguage: 已知 language 命中映射表中对应扩展名', () => {
    fc.assert(
      fc.property(arbLanguage, (lang) => {
        const normalized = normalizeLang(lang);
        if (normalized in EXPECTED_EXT_MAP) {
          // 已知键：必须命中映射表中的精确扩展名。
          expect(extForLanguage(lang)).toBe(EXPECTED_EXT_MAP[normalized]);
        } else {
          // 未知键：必须 fallback 到 .txt。
          expect(extForLanguage(lang)).toBe('.txt');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('extForLanguage: 缺省（undefined / 空串 / 全空白）始终返回 .txt', () => {
    // 缺省与空白串两类都属于"未识别"分支；用一组 fc.constantFrom 等价采样。
    const arbDefaultish = fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
    );
    fc.assert(
      fc.property(arbDefaultish, (lang) => {
        expect(extForLanguage(lang)).toBe('.txt');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // 子断言 ③：deriveLanguageMode
  // -------------------------------------------------------------------------
  it('deriveLanguageMode(q): q.language 非空时原样；否则 plaintext', () => {
    fc.assert(
      fc.property(arbCodeQuestion, (q) => {
        const actual = deriveLanguageMode(q);
        if (typeof q.language === 'string' && q.language !== '') {
          expect(actual).toBe(q.language);
        } else {
          expect(actual).toBe('plaintext');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // 子断言 ④：deriveCodeAnswer
  // -------------------------------------------------------------------------
  it('deriveCodeAnswer(q): referenceCode → answer (legacy) → 暂无参考答案 提示', () => {
    fc.assert(
      fc.property(arbCodeQuestion, (q) => {
        const actual = deriveCodeAnswer(q);

        const refCode = q.referenceCode;
        const legacyAnswer = q.answer;

        if (typeof refCode === 'string' && refCode !== '') {
          expect(actual).toEqual({ kind: 'reference', code: refCode });
        } else if (typeof legacyAnswer === 'string' && legacyAnswer !== '') {
          expect(actual).toEqual({ kind: 'reference', code: legacyAnswer });
        } else {
          expect(actual).toEqual({ kind: 'none', hint: NO_REFERENCE_ANSWER_HINT });
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // 子断言 ⑤：deriveQAAnswer
  // -------------------------------------------------------------------------
  it('deriveQAAnswer(q): briefAnswer ?? answer；带 detailedAnswer 与 followUps（默认 []）', () => {
    fc.assert(
      fc.property(arbQAQuestion, (q) => {
        const actual = deriveQAAnswer(q);

        // 1) 计算期望的 brief：briefAnswer 非空优先，其次 legacy answer 非空。
        let expectedBrief: string | undefined;
        if (typeof q.briefAnswer === 'string' && q.briefAnswer !== '') {
          expectedBrief = q.briefAnswer;
        } else if (typeof q.answer === 'string' && q.answer !== '') {
          expectedBrief = q.answer;
        }

        if (expectedBrief === undefined) {
          // brief 与 legacy answer 都为空：必须返回 none 分支。
          expect(actual).toEqual({ kind: 'none', hint: NO_REFERENCE_ANSWER_HINT });
          return;
        }

        // 2) reference 分支：briefAnswer 必为 expectedBrief；followUps 必为只读
        //    数组（缺省时为空数组）；detailedAnswer 仅当非空时存在。
        expect(actual.kind).toBe('reference');
        if (actual.kind !== 'reference') return; // 类型守卫，便于后续访问字段

        expect(actual.briefAnswer).toBe(expectedBrief);
        // followUps 缺省回退为空数组，与 design.md "followUps: q.followUps ?? []" 一致。
        const expectedFollowUps = Array.isArray(q.followUps) ? q.followUps : [];
        expect(actual.followUps).toEqual(expectedFollowUps);

        // detailedAnswer 仅在非空字符串时被携带；空 / 缺失时键不应存在。
        if (typeof q.detailedAnswer === 'string' && q.detailedAnswer !== '') {
          expect(actual.detailedAnswer).toBe(q.detailedAnswer);
        } else {
          expect(actual.detailedAnswer).toBeUndefined();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Sanity 检查：直接对一组手工 case 验证 isKnownLanguage 工具函数的对称性，
  // 这条用例不属于 Property 14 的核心断言，但能在生成器或映射表偏离 design.md
  // 时立即报警，从而保护上面"已知 vs 未知"分支的有效性。
  // -------------------------------------------------------------------------
  it('isKnownLanguage 工具与 EXPECTED_EXT_MAP 自洽（sanity）', () => {
    for (const key of Object.keys(EXPECTED_EXT_MAP)) {
      expect(isKnownLanguage(key)).toBe(true);
      // 验证大小写不敏感 & 容忍前后空白：与实现的 trim+toLowerCase 归一化一致。
      expect(extForLanguage(`  ${key.toUpperCase()}  `)).toBe(EXPECTED_EXT_MAP[key]);
    }
  });
});

// ---------------------------------------------------------------------------
// Feature: frontend-interview-practice, Property 15: Mastery 视觉标识单射
//
// 验证 design.md "Correctness Properties > Property 15" 与 Req 9.5 描述的单射性：
//   ∀ s₁, s₂ ∈ MasteryStatus，若 s₁ ≠ s₂ 则 iconKey(statusToIcon(s₁)) ≠ iconKey(statusToIcon(s₂))。
//
// `MasteryStatus` 仅有四个取值，但本 PBT 仍以 numRuns: 100 覆盖所有 (s₁, s₂)
// 组合（fast-check 会反复采样），等价地保证四个状态对应的 ThemeIcon 两两不同。
// 配合 `iconKey(icon)` 这个测试辅助函数（把 ThemeIcon 投影成 `<id>|<color>`），
// 比较时不依赖 ThemeIcon 实例的引用相等性。
//
// **Validates: Requirements 9.5**
// ---------------------------------------------------------------------------

import { iconKey, statusToIcon } from '../../src/views/iconRegistry.js';

describe('Property 15: Mastery 视觉标识单射', () => {
  it('四个 MasteryStatus 取值映射到的 ThemeIcon 互不相同', () => {
    fc.assert(
      fc.property(arbMasteryStatus, arbMasteryStatus, (s1, s2) => {
        // 同一取值必然映射到等价的 key（自反性，作为反向健全性检查）。
        if (s1 === s2) {
          expect(iconKey(statusToIcon(s1))).toBe(iconKey(statusToIcon(s2)));
          return;
        }
        // 不同取值必须映射到不同的 ThemeIcon —— 这是 Req 9.5 / Property 15
        // 要求的"视觉标识单射"。
        expect(iconKey(statusToIcon(s1))).not.toBe(iconKey(statusToIcon(s2)));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
