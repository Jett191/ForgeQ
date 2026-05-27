/**
 * QuestionListProvider（Task 17.1 + UI 优化）
 *
 * TreeDataProvider 实现，渲染当前激活题库的题目列表。
 *
 * 主要能力：
 *  - 顶层 bank 标题节点；其下默认按 `category` 分组（每组显示题数）；可一键切换为扁平列表。
 *  - 题目节点显示：mastery 图标 / 难度色块文字 / 收藏与笔记小标记。
 *  - 集成 FilterController（500ms debounce refresh），并在 bank 节点 description 中以中文摘要展示当前筛选条件。
 *  - 单击题目节点触发 `frontendInterview.openQuestion`。
 *
 * 设计要点：
 *  - `groupByCategory` 默认 true，当只有一个分类时自动跳过分类层（避免出现"100 道题挂在一个 JavaScript 文件夹下"的多余一层）。
 *  - 顺序保留：每个分类内部题目按 `QuestionBank.questions` 原始顺序排列，分类列出顺序由分类首次出现位置决定。
 *  - 难度色块在 description 里通过文本符号近似呈现（VS Code TreeItem description 不支持富文本，只能靠图标 + 简短文字）。
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.9, 4.10, 8.4, 9.5
 */

import * as vscode from 'vscode';

import type { FilterState } from '../filter/filter.js';
import { applyFilter, isActive } from '../filter/filter.js';
import type { LearningState } from '../types/learning.js';
import type { Difficulty, Question, QuestionBank, QuestionType } from '../types/question.js';
import type { BankSummary } from '../types/bankMeta.js';
import { statusToIcon } from './iconRegistry.js';

// ---------------------------------------------------------------------------
// TreeItem 类型
// ---------------------------------------------------------------------------

/** TreeItem 节点类型。 */
export type QuestionTreeItem =
  | { kind: 'bank'; summary: BankSummary }
  | { kind: 'category'; category: string; questions: Question[] }
  | { kind: 'question'; question: Question; learning: LearningState | undefined }
  | { kind: 'message'; text: string };

const EMPTY_BANK_MESSAGE = '当前没有题目，请先导入题库';
const FILTER_NO_MATCH_MESSAGE = '当前筛选条件下没有匹配题目';

// ---------------------------------------------------------------------------
// 文案 & 视觉辅助
// ---------------------------------------------------------------------------

const TYPE_LABEL: Readonly<Record<QuestionType, string>> = {
  code: '代码',
  qa: '问答',
};

const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

/**
 * 把当前筛选状态格式化成 description 摘要字符串。
 * 例如：`筛选: 问答 · JavaScript · 困难`；无激活时返回空串。
 */
function formatFilterSummary(filter: FilterState): string {
  const parts: string[] = [];
  if (isActive(filter, 'type') && filter.type) {
    parts.push(TYPE_LABEL[filter.type]);
  }
  if (isActive(filter, 'category') && filter.category) {
    parts.push(filter.category);
  }
  if (isActive(filter, 'difficulty') && filter.difficulty) {
    parts.push(DIFFICULTY_LABEL[filter.difficulty]);
  }
  if (isActive(filter, 'tags') && filter.tags && filter.tags.size > 0) {
    parts.push(`#${[...filter.tags].join('+')}`);
  }
  return parts.length > 0 ? `筛选: ${parts.join(' · ')}` : '';
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class QuestionListProvider implements vscode.TreeDataProvider<QuestionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<QuestionTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _bank: QuestionBank | undefined;
  private _bankSummary: BankSummary | undefined;
  private _learningMap: ReadonlyMap<string, LearningState> = new Map();
  private _filter: FilterState = {};
  private _groupByCategory = true;
  private _refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private _debounceMs: number;

  constructor(options?: { debounceMs?: number; groupByCategory?: boolean }) {
    this._debounceMs = options?.debounceMs ?? 500;
    if (options?.groupByCategory !== undefined) {
      this._groupByCategory = options.groupByCategory;
    }
  }

  /** 设置当前显示的题库与学习状态。 */
  setBank(
    bank: QuestionBank | undefined,
    summary: BankSummary | undefined,
    learning: ReadonlyMap<string, LearningState>,
  ): void {
    this._bank = bank;
    this._bankSummary = summary;
    this._learningMap = learning;
    this.refresh();
  }

  /** 设置当前筛选状态（带 debounce）。 */
  setFilter(filter: FilterState): void {
    this._filter = filter;
    this._debouncedRefresh();
  }

  /** 读取当前筛选状态（用于命令层 QuickPick 时回显当前选择）。 */
  getFilter(): FilterState {
    return { ...this._filter };
  }

  /** 切换或显式设置分类分组。 */
  setGroupByCategory(value: boolean): void {
    if (this._groupByCategory === value) return;
    this._groupByCategory = value;
    this.refresh();
  }

  getGroupByCategory(): boolean {
    return this._groupByCategory;
  }

  /** 返回当前题库内所有分类（按首次出现顺序），供 QuickPick 用。 */
  getCategoriesInBank(): string[] {
    const set = new Set<string>();
    const list: string[] = [];
    for (const q of this._bank?.questions ?? []) {
      if (!set.has(q.category)) {
        set.add(q.category);
        list.push(q.category);
      }
    }
    return list;
  }

  /** 更新学习状态 Map。 */
  setLearning(learning: ReadonlyMap<string, LearningState>): void {
    this._learningMap = learning;
  }

  /** 立即刷新 TreeView。 */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private _debouncedRefresh(): void {
    if (this._refreshTimer !== undefined) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = undefined;
      this.refresh();
    }, this._debounceMs);
  }

  // -----------------------------------------------------------------------
  // TreeItem 渲染
  // -----------------------------------------------------------------------

  getTreeItem(element: QuestionTreeItem): vscode.TreeItem {
    switch (element.kind) {
      case 'bank': {
        const item = new vscode.TreeItem(
          `${element.summary.name}`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = 'bankTitle';
        item.iconPath = new vscode.ThemeIcon('library');

        const summary = formatFilterSummary(this._filter);
        const totalLabel = `${element.summary.questionCount} 题 · v${element.summary.version}`;
        item.description = summary ? `${summary} · ${totalLabel}` : totalLabel;
        item.tooltip = summary
          ? `${element.summary.name}\n${summary}\n共 ${element.summary.questionCount} 道题`
          : `${element.summary.name}\n共 ${element.summary.questionCount} 道题`;
        return item;
      }

      case 'category': {
        const item = new vscode.TreeItem(
          element.category,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = 'category';
        item.iconPath = new vscode.ThemeIcon('folder');
        item.description = `${element.questions.length} 题`;
        return item;
      }

      case 'question': {
        const q = element.question;
        const item = new vscode.TreeItem(
          q.title,
          vscode.TreeItemCollapsibleState.None,
        );

        // mastery 图标
        const ls = element.learning;
        const mastery = ls?.mastery ?? 'unlearned';
        item.iconPath = statusToIcon(mastery);

        // description: 类型 · 难度 [· 分类（仅扁平模式且筛选未限定分类时显示）] [收藏 / 笔记标记]
        const descParts: string[] = [];
        descParts.push(TYPE_LABEL[q.type]);
        descParts.push(DIFFICULTY_LABEL[q.difficulty]);
        if (!this._groupByCategory) {
          descParts.push(q.category);
        }
        const flags: string[] = [];
        if (ls?.favoriteFlag) flags.push('★');
        if (ls?.hasNote) flags.push('📝');
        if (flags.length > 0) descParts.push(flags.join(''));
        item.description = descParts.join(' · ');

        // tooltip
        const tooltipLines = [
          q.title,
          `${TYPE_LABEL[q.type]} · ${DIFFICULTY_LABEL[q.difficulty]} · ${q.category}`,
        ];
        if (q.tags.length > 0) tooltipLines.push(`标签: ${q.tags.join(', ')}`);
        if (ls?.favoriteFlag) tooltipLines.push('★ 已收藏');
        if (ls?.hasNote) tooltipLines.push('📝 已记录笔记');
        item.tooltip = new vscode.MarkdownString(tooltipLines.join('  \n'));

        // 单击打开
        item.command = {
          command: 'frontendInterview.openQuestion',
          title: '打开题目',
          arguments: [q.id],
        };

        item.contextValue = 'question';
        return item;
      }

      case 'message': {
        const item = new vscode.TreeItem(
          element.text,
          vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = 'message';
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
      }
    }
  }

  // -----------------------------------------------------------------------
  // TreeItem 子节点
  // -----------------------------------------------------------------------

  getChildren(element?: QuestionTreeItem): QuestionTreeItem[] {
    if (element === undefined) {
      if (!this._bank || !this._bankSummary) {
        return [{ kind: 'message', text: EMPTY_BANK_MESSAGE }];
      }
      return [{ kind: 'bank', summary: this._bankSummary }];
    }

    if (element.kind === 'bank') {
      const all = this._bank?.questions ?? [];
      if (all.length === 0) {
        return [{ kind: 'message', text: EMPTY_BANK_MESSAGE }];
      }

      const hasActiveFilter =
        isActive(this._filter, 'type') ||
        isActive(this._filter, 'category') ||
        isActive(this._filter, 'tags') ||
        isActive(this._filter, 'difficulty');

      const filtered = hasActiveFilter ? applyFilter(all, this._filter) : all;
      if (filtered.length === 0) {
        return [{ kind: 'message', text: FILTER_NO_MATCH_MESSAGE }];
      }

      // 分类分组：当前筛选已锁定单一 category 时自动跳过分类层
      const lockedCategory = isActive(this._filter, 'category');
      const grouped: Map<string, Question[]> = new Map();
      for (const q of filtered) {
        const list = grouped.get(q.category);
        if (list) list.push(q);
        else grouped.set(q.category, [q]);
      }

      if (this._groupByCategory && !lockedCategory && grouped.size > 1) {
        return [...grouped.entries()].map(([category, questions]) => ({
          kind: 'category' as const,
          category,
          questions,
        }));
      }

      // 否则扁平展开
      return filtered.map((q) => ({
        kind: 'question' as const,
        question: q,
        learning: this._learningMap.get(q.id),
      }));
    }

    if (element.kind === 'category') {
      return element.questions.map((q) => ({
        kind: 'question' as const,
        question: q,
        learning: this._learningMap.get(q.id),
      }));
    }

    return [];
  }
}
