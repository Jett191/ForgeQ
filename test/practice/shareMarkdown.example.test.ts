import { describe, expect, it } from 'vitest';

import {
  buildQuestionMarkdown,
  questionMarkdownFileName,
} from '../../src/practice/shareMarkdown.js';
import type { QAQuestion } from '../../src/types/question.js';

const QUESTION: QAQuestion = {
  id: 'event-loop',
  type: 'qa',
  title: '解释 Event Loop',
  content: '请说明 **宏任务** 与微任务的执行顺序。',
  category: 'JavaScript',
  tags: ['异步', '浏览器'],
  difficulty: 'medium',
  answer: '微任务会在当前宏任务结束后执行。',
  detailedAnswer: '事件循环会在每个任务后清空微任务队列。',
  followUps: [{ question: 'Promise 属于哪一种？', answer: '微任务。' }],
};

describe('buildQuestionMarkdown', () => {
  it('拼接题面、答案、解析和追问', () => {
    const markdown = buildQuestionMarkdown(QUESTION, [
      { relativePath: 'answer.md', content: '这是我的回答。' },
      { relativePath: 'demo.js', content: 'Promise.resolve().then(run);' },
    ]);

    expect(markdown).toContain('# 解释 Event Loop');
    expect(markdown).toContain('- 标签：异步、浏览器');
    expect(markdown).toContain(
      '## 题目\n\n**解释 Event Loop**\n\n请说明 **宏任务** 与微任务的执行顺序。',
    );
    expect(markdown).toContain(
      '## 我的回答\n\n### answer.md\n\n```markdown\n这是我的回答。\n```',
    );
    expect(markdown).toContain(
      '### demo.js\n\n```javascript\nPromise.resolve().then(run);\n```',
    );
    expect(markdown).toContain('## 参考答案\n\n微任务会在当前宏任务结束后执行。');
    expect(markdown).toContain('## 详细解析\n\n事件循环会在每个任务后清空微任务队列。');
    expect(markdown).toContain('### 1. Promise 属于哪一种？\n\n微任务。');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('没有答案时写入统一提示', () => {
    const markdown = buildQuestionMarkdown({
      ...QUESTION,
      answer: '',
      detailedAnswer: undefined,
      followUps: [],
    });

    expect(markdown).toContain('## 参考答案\n\n该题暂无参考答案');
    expect(markdown).toContain('## 我的回答\n\n（暂无回答内容）');
  });

  it('用户回答中已有代码围栏时使用更长的围栏', () => {
    const markdown = buildQuestionMarkdown(QUESTION, [
      { relativePath: 'answer.md', content: '```js\nconst answer = 1;\n```' },
    ]);

    expect(markdown).toContain('````markdown\n```js\nconst answer = 1;\n```\n````');
  });
});

describe('questionMarkdownFileName', () => {
  it('清理跨平台非法文件名字符', () => {
    expect(questionMarkdownFileName('Event Loop: 宏/微任务?')).toBe(
      'Event Loop- 宏-微任务-.md',
    );
  });

  it('空标题使用兜底文件名', () => {
    expect(questionMarkdownFileName(' ... ')).toBe('interview-question.md');
  });
});
