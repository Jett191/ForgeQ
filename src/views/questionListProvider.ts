/**
 * QuestionListProvider（Task 17.1）
 *
 * TreeDataProvider 实现，渲染当前激活题库的题目列表。
 *
 * - 顺序与 `QuestionBank.questions` 一致
 * - 展示 title / type / difficulty / category / mastery icon / favorite icon / hasNote icon
 * - 顶层 bank 标题节点
 * - 空 bank 消息 / 筛选无匹配消息
 * - 集成 FilterController (500ms debounce refresh)
 * - 单击触发 `frontendInterview.openQuestion` 命令
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.9, 4.10, 8.4, 9.5
 */

import * as vscode from 'vscode';

import type { FilterState } from '../filter/filter.js';
import { applyFilter, isActive } from '../filter/filter.js';
import type { LearningState } from '../types/learning.js';
import type { Question, QuestionBank } from '../types/question.js';
import type { BankSummary } from '../types/bankMeta.js';
import { statusToIcon } from './iconRegistry.js';

// ---------------------------------------------------------------------------
// TreeItem 类型
// ---------------------------------------------------------------------------

/** TreeItem 节点类型：bank 标题 / 题目 / 消息提示 */
export type QuestionTreeItem =
  | { kind: 'bank'; summary: BankSummary }
  | { kind: 'question'; question: Question; learning: LearningState | undefined }
  | { kind: 'message'; text: string };

/** 空 bank 消息文案 */
const EMPTY_BANK_MESSAGE = '当前没有题目，请先导入题库';

/** 筛选无匹配消息文案 */
const FILTER_NO_MATCH_MESSAGE = '当前筛选条件下没有匹配题目';

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
  private _refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private _debounceMs: number;

  constructor(options?: { debounceMs?: number }) {
    this._debounceMs = options?.debounceMs ?? 500;
  }

  /** 设置当前显示的题库与学习状态 */
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

  /** 设置当前筛选状态（带 debounce） */
  setFilter(filter: FilterState): void {
    this._filter = filter;
    this._debouncedRefresh();
  }

  /** 更新学习状态 Map */
  setLearning(learning: ReadonlyMap<string, LearningState>): void {
    this._learningMap = learning;
  }

  /** 立即刷新 TreeView */
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

  getTreeItem(element: QuestionTreeItem): vscode.TreeItem {
    switch (element.kind) {
      case 'bank': {
        const item = new vscode.TreeItem(
          `${element.summary.name} (${element.summary.version})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = 'bankTitle';
        item.description = `${element.summary.questionCount} 题`;
        return item;
      }
      case 'question': {
        const q = element.question;
        const item = new vscode.TreeItem(
          q.title,
          vscode.TreeItemCollapsibleState.None,
        );
        // Description shows type / difficulty / category
        const parts: string[] = [];
        parts.push(q.type === 'code' ? '代码' : '问答');
        parts.push(q.difficulty);
        parts.push(q.category);
        item.description = parts.join(' | ');

        // Icon from mastery status
        const ls = element.learning;
        const mastery = ls?.mastery ?? 'unlearned';
        item.iconPath = statusToIcon(mastery);

        // Tooltip with extra info
        const tooltipParts = [q.title];
        if (ls?.favoriteFlag) tooltipParts.push('★ 已收藏');
        if (ls?.hasNote) tooltipParts.push('📝 有笔记');
        item.tooltip = tooltipParts.join(' · ');

        // Single click opens question
        item.command = {
          command: 'frontendInterview.openQuestion',
          title: '打开题目',
          arguments: [q.id],
        };

        return item;
      }
      case 'message': {
        const item = new vscode.TreeItem(
          element.text,
          vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = 'message';
        return item;
      }
    }
  }

  getChildren(element?: QuestionTreeItem): QuestionTreeItem[] {
    // Top-level: no element
    if (element === undefined) {
      if (!this._bank || !this._bankSummary) {
        return [{ kind: 'message', text: EMPTY_BANK_MESSAGE }];
      }
      return [{ kind: 'bank', summary: this._bankSummary }];
    }

    // Children of bank title node
    if (element.kind === 'bank') {
      const questions = this._bank?.questions ?? [];
      if (questions.length === 0) {
        return [{ kind: 'message', text: EMPTY_BANK_MESSAGE }];
      }

      // Apply filter
      const hasActiveFilter =
        isActive(this._filter, 'type') ||
        isActive(this._filter, 'category') ||
        isActive(this._filter, 'tags') ||
        isActive(this._filter, 'difficulty');

      const filtered = hasActiveFilter
        ? applyFilter(questions, this._filter)
        : questions;

      if (filtered.length === 0) {
        return [{ kind: 'message', text: FILTER_NO_MATCH_MESSAGE }];
      }

      return filtered.map((q) => ({
        kind: 'question' as const,
        question: q,
        learning: this._learningMap.get(q.id),
      }));
    }

    // No children for question or message nodes
    return [];
  }
}
