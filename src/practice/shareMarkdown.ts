import type { Question } from '../types/question.js';
import { deriveQuestionAnswer } from './practiceFiles.js';

export interface SharedAnswerFile {
  relativePath: string;
  content: string;
}

const difficultyLabels: Record<Question['difficulty'], string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

function section(title: string, content: string | undefined): string[] {
  if (!content?.trim()) return [];
  return [`## ${title}`, '', content.trim(), ''];
}

function codeFence(content: string): string {
  const longestRun = Math.max(0, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length));
  return '`'.repeat(Math.max(3, longestRun + 1));
}

function languageForFile(relativePath: string): string {
  const extension = relativePath.split('.').pop()?.toLowerCase();
  const aliases: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    html: 'html',
    css: 'css',
    json: 'json',
    vue: 'vue',
    py: 'python',
    java: 'java',
    md: 'markdown',
  };
  return extension ? aliases[extension] ?? extension : '';
}

function userAnswerLines(files: ReadonlyArray<SharedAnswerFile>): string[] {
  const lines = ['## 我的回答', ''];
  if (files.length === 0) return [...lines, '（暂无回答内容）', ''];

  for (const file of files) {
    lines.push(`### ${file.relativePath}`, '');
    if (!file.content.trim()) {
      lines.push('（空文件）', '');
      continue;
    }
    const fence = codeFence(file.content);
    lines.push(`${fence}${languageForFile(file.relativePath)}`, file.content.trimEnd(), fence, '');
  }
  return lines;
}

/** Build a portable Markdown document containing the prompt, user's work and reference answer. */
export function buildQuestionMarkdown(
  question: Question,
  answerFiles: ReadonlyArray<SharedAnswerFile> = [],
): string {
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

  lines.push('', '## 题目', '', `**${question.title}**`, '');
  if (question.content.trim()) lines.push(question.content.trim(), '');
  lines.push(...userAnswerLines(answerFiles));

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
