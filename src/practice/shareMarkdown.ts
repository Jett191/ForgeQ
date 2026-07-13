import type { Question } from '../types/question.js';
import { deriveQuestionAnswer } from './practiceFiles.js';

const difficultyLabels: Record<Question['difficulty'], string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

function section(title: string, content: string | undefined): string[] {
  if (!content?.trim()) return [];
  return [`## ${title}`, '', content.trim(), ''];
}

/** Build a portable Markdown document containing one question and its answer. */
export function buildQuestionMarkdown(question: Question): string {
  const lines = [
    `# ${question.title}`,
    '',
    `- 题型：${question.type === 'code' ? '代码题' : '问答题'}`,
    `- 难度：${difficultyLabels[question.difficulty]}`,
    `- 分类：${question.category}`,
  ];

  if (question.tags.length > 0) {
    lines.push(`- 标签：${question.tags.join('、')}`);
  }

  lines.push('', '## 题目', '', question.content.trim(), '');

  const answer = deriveQuestionAnswer(question);
  if (answer.kind === 'none') {
    lines.push('## 参考答案', '', answer.hint, '');
  } else {
    lines.push(...section('参考答案', answer.briefAnswer));
    lines.push(...section('详细解析', answer.detailedAnswer));

    if (answer.followUps.length > 0) {
      lines.push('## 追问', '');
      answer.followUps.forEach((followUp, index) => {
        lines.push(`### ${index + 1}. ${followUp.question}`, '');
        if (followUp.answer?.trim()) lines.push(followUp.answer.trim(), '');
      });
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** Replace characters that cannot safely appear in common desktop file systems. */
export function questionMarkdownFileName(title: string): string {
  const safeTitle = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100);
  return `${safeTitle || 'interview-question'}.md`;
}
