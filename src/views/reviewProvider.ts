/**
 * ReviewProvider（Task 18.1）
 *
 * TreeDataProvider 实现，渲染三种复习入口及其题目列表。
 *
 * - 三个入口节点：复习未掌握 / 复习收藏 / 复习错题
 * - 每次读取列表时按最新 LearningState 调用 `buildReviewSet`
 * - 空集合消息
 * - 单击触发 `frontendInterview.openQuestion` 命令
 * - 不受 FilterController 影响
 * - 处理 STORAGE_LOAD_FAILED
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9
 */

import * as vscode from 'vscode';

import type { LearningState } from '../types/learning.js';
import type { Question, QuestionBank } from '../types/question.js';
import { buildReviewSet, type ReviewKind } from '../domain/reviewSetBuilder.js';
import { learningStateVisualStatus, statusToIcon } from './iconRegistry.js';
import { sidebarQuestionTitle } from './questionDisplay.js';

// ---------------------------------------------------------------------------
// TreeItem 类型
// ---------------------------------------------------------------------------

/** ReviewView 节点类型 */
export type ReviewTreeItem =
  | { kind: 'entry'; reviewKind: ReviewKind; label: string }
  | { kind: 'question'; question: Question; learning: LearningState | undefined }
  | { kind: 'message'; text: string };

/** 空集合消息 */
const EMPTY_REVIEW_MESSAGE = '当前没有需要复习的题目';

/** 加载失败消息 */
const LOAD_FAILED_MESSAGE = '加载学习数据失败';

/** 三个入口的标签 */
const ENTRY_LABELS: Record<ReviewKind, string> = {
  unmastered: '复习未掌握',
  favorite: '复习收藏',
  wrong: '复习错题',
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ReviewProvider implements vscode.TreeDataProvider<ReviewTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ReviewTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _bank: QuestionBank | undefined;
  private _learningMap: ReadonlyMap<string, LearningState> = new Map();
  private _activeKind: ReviewKind | undefined;
  private _loadFailed = false;

  constructor(private readonly _extensionUri?: vscode.Uri) {}

  /** 设置当前题库与学习状态 */
  setBank(
    bank: QuestionBank | undefined,
    learning: ReadonlyMap<string, LearningState>,
  ): void {
    this._bank = bank;
    this._learningMap = learning;
    // 切换 bank 时重置当前入口
    this._activeKind = undefined;
    this._loadFailed = false;
    this.refresh();
  }

  /** 标记加载失败 */
  setLoadFailed(): void {
    this._loadFailed = true;
    this._activeKind = undefined;
    this.refresh();
  }

  /** 进入某个复习类别；题目集合在读取时根据最新状态计算。 */
  enter(kind: ReviewKind): void {
    if (!this._bank) {
      return;
    }
    this._activeKind = kind;
    this.refresh();
  }

  /** 立即刷新 TreeView */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    switch (element.kind) {
      case 'entry': {
        const hasActive = this._activeKind === element.reviewKind;
        const item = new vscode.TreeItem(
          element.label,
          hasActive
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.contextValue = 'reviewEntry';
        return item;
      }
      case 'question': {
        const q = element.question;
        const item = new vscode.TreeItem(
          sidebarQuestionTitle(q),
          vscode.TreeItemCollapsibleState.None,
        );
        item.tooltip = q.title;

        const ls = element.learning;
        const visualStatus = learningStateVisualStatus(ls);
        item.iconPath = statusToIcon(visualStatus, this._extensionUri);

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
        return item;
      }
    }
  }

  getChildren(element?: ReviewTreeItem): ReviewTreeItem[] {
    if (element === undefined) {
      // Top level: three entry nodes (or load-failed message)
      if (this._loadFailed) {
        return [{ kind: 'message', text: LOAD_FAILED_MESSAGE }];
      }
      if (!this._bank) {
        return [{ kind: 'message', text: EMPTY_REVIEW_MESSAGE }];
      }
      const entries: ReviewTreeItem[] = [
        { kind: 'entry', reviewKind: 'unmastered', label: ENTRY_LABELS.unmastered },
        { kind: 'entry', reviewKind: 'favorite', label: ENTRY_LABELS.favorite },
        { kind: 'entry', reviewKind: 'wrong', label: ENTRY_LABELS.wrong },
      ];
      return entries;
    }

    if (element.kind === 'entry') {
      if (!this._bank) {
        return [{ kind: 'message', text: EMPTY_REVIEW_MESSAGE }];
      }
      const currentSet = buildReviewSet(
        this._bank.questions,
        this._learningMap,
        element.reviewKind,
      );
      if (currentSet.length === 0) {
        return [{ kind: 'message', text: EMPTY_REVIEW_MESSAGE }];
      }

      return currentSet.map((q) => ({
        kind: 'question' as const,
        question: q,
        learning: this._learningMap.get(q.id),
      }));
    }

    return [];
  }
}
