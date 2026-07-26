import type { LearningState } from '../types/learning.js';
import type { Question } from '../types/question.js';
import type { SharedAnswerFile } from './shareMarkdown.js';

const difficultyLabels: Record<Question['difficulty'], string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const masteryLabels: Record<LearningState['mastery'], string> = {
  unlearned: '未学习',
  learning: '学习中',
  not_mastered: '未掌握',
  mastered: '已掌握',
};

function valueOrEmpty(value: string | undefined): string {
  return value?.trim() || '（无）';
}

function formatLastPracticedAt(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '（无）';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '（无）' : date.toISOString();
}

function appendAnswerFiles(lines: string[], files: ReadonlyArray<SharedAnswerFile>): void {
  if (files.length === 0) {
    lines.push('（暂无作答文件）', '');
    return;
  }

  for (const file of files) {
    lines.push(`--- 文件：${file.relativePath} ---`, file.content || '（空文件）', '');
  }
}

function appendFollowUps(lines: string[], question: Question): void {
  if (!question.followUps?.length) {
    lines.push('（无）', '');
    return;
  }

  question.followUps.forEach((followUp, index) => {
    lines.push(`${index + 1}. ${followUp.question}`);
    lines.push(`回答：${valueOrEmpty(followUp.answer)}`, '');
  });
}

export interface CopyPlainTextOptions {
  includeReferenceAnswer?: boolean;
  includeRawQuestionJson?: boolean;
}

/**
 * 构建适合直接粘贴给 AI 的完整纯文本上下文。
 *
 * 文本有意同时包含可读分区和原始 JSON：前者便于模型快速理解，后者确保任何
 * 可选字段都不会在格式化过程中丢失。
 */
export function buildQuestionPlainText(
  question: Question,
  answerFiles: ReadonlyArray<SharedAnswerFile>,
  learning: LearningState,
  note?: string,
  options: CopyPlainTextOptions = {},
): string {
  const includeReferenceAnswer = options.includeReferenceAnswer ?? true;
  const includeRawQuestionJson = options.includeRawQuestionJson ?? true;
  const lines: string[] = [
    'FORGEQ 题目完整上下文',
    '请结合题目、我的作答、个人笔记和学习状态回答后续问题。',
    '',
    '================================================================',
    '【题目信息】',
    `标题：${question.title}`,
    `题目 ID：${question.id}`,
    `题型：${question.type === 'code' ? '代码题' : '问答题'}`,
    `难度：${difficultyLabels[question.difficulty]}`,
    `分类：${question.category}`,
    `标签：${question.tags.length > 0 ? question.tags.join('、') : '（无）'}`,
    '',
    '================================================================',
    '【题目】',
    valueOrEmpty(question.content),
    '',
  ];

  if (includeReferenceAnswer) {
    lines.push(
      '================================================================',
      '【参考答案】',
      `基础答案：\n${valueOrEmpty(question.answer)}`,
      '',
      `简要答案：\n${valueOrEmpty(question.briefAnswer)}`,
      '',
      `详细答案：\n${valueOrEmpty(question.detailedAnswer)}`,
      '',
    );

    if (question.type === 'code') {
      lines.push(
        `参考代码：\n${valueOrEmpty(question.referenceCode)}`,
        '',
        `解题思路：\n${valueOrEmpty(question.solutionExplanation)}`,
        '',
        '测试用例：',
        question.testCases?.length
          ? JSON.stringify(question.testCases, null, 2)
          : '（无）',
        '',
      );
    }

    lines.push('追问：');
    appendFollowUps(lines, question);
  }

  lines.push(
    '================================================================',
    '【我的答案】',
  );
  appendAnswerFiles(lines, answerFiles);

  lines.push(
    '================================================================',
    '【我的笔记】',
    valueOrEmpty(note),
    '',
    '================================================================',
    '【学习状态】',
    `掌握状态：${masteryLabels[learning.mastery]}`,
    `已收藏：${learning.favoriteFlag ? '是' : '否'}`,
    `错题标记：${learning.wrongFlag ? '是' : '否'}`,
    `存在笔记：${learning.hasNote ? '是' : '否'}`,
    `最近练习时间：${formatLastPracticedAt(learning.lastPracticedAt)}`,
    '',
  );

  if (includeRawQuestionJson) {
    lines.push(
      '================================================================',
      '【题目原始 JSON】',
      JSON.stringify(question, null, 2),
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
