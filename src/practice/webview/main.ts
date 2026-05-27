/**
 * Webview 端入口（Practice 面板）。
 *
 * 在 webview iframe 内运行，通过 `acquireVsCodeApi()` 与扩展进程通信。
 *
 * UI 结构（与 panel.ts 内嵌 HTML 同步）：
 *   - .q-head（meta 徽章 + 标题 + 收藏按钮）
 *   - #question-content.md（题面 markdown 渲染）
 *   - #test-cases（仅代码题）
 *   - .answer-toggle > #btn-show-answer（点击展开答案；展开后整体隐藏）
 *   - #answer-area（含 #btn-collapse-answer 圆形 ↑ 按钮 + #answer-content）
 *   - #follow-ups（问答题追问）
 *
 * 渲染策略：题面 / 详细解析 / 简答 / 追问答案均走 `renderMarkdown`，
 * 其余短字符串字段走 `escapeHtml`；代码题参考答案走 `highlight()` 着色。
 */

import { highlight } from './highlight.js';
import { escapeHtml, renderMarkdown } from './markdown.js';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface HostToWebviewMessage {
  type: string;
  payload?: unknown;
  ok?: boolean;
  reason?: string;
}

interface LearningState {
  mastery: 'unlearned' | 'learning' | 'mastered' | 'not_mastered';
  favoriteFlag: boolean;
  wrongFlag: boolean;
  hasNote: boolean;
  lastPracticedAt?: number;
}

interface Question {
  id: string;
  type: 'code' | 'qa';
  title: string;
  content: string;
  category: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard' | string;
  language?: string;
  answer: string;
  testCases?: Array<{
    name?: string;
    input?: string;
    expected?: string;
    description?: string;
  }>;
  followUps?: Array<{ question: string; answer?: string }>;
}

const vscode = acquireVsCodeApi();

let currentQuestion: Question | undefined;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function difficultyLabel(d: string): string {
  switch (d) {
    case 'easy':
      return '简单';
    case 'medium':
      return '中等';
    case 'hard':
      return '困难';
    default:
      return d;
  }
}

function difficultyClass(d: string): string {
  switch (d) {
    case 'easy':
      return 'diff-easy';
    case 'medium':
      return 'diff-medium';
    case 'hard':
      return 'diff-hard';
    default:
      return '';
  }
}

/**
 * 重置答案区到"未展开"状态。
 *
 * 注意只清空 `#answer-content` 而不是 `#answer-area`，因为后者还包含
 * 收起按钮 `#btn-collapse-answer`，整体清空会丢失按钮。
 */
function hideAnswerSection(): void {
  const area = $('answer-area');
  if (area) area.classList.add('hidden');
  const content = $('answer-content');
  if (content) content.innerHTML = '';
  const followUpsEl = $('follow-ups');
  if (followUpsEl) followUpsEl.innerHTML = '';
  const toggle = document.querySelector('.answer-toggle');
  if (toggle) (toggle as HTMLElement).hidden = false;
  const showBtn = $('btn-show-answer');
  if (showBtn) showBtn.removeAttribute('hidden');
}

function renderQuestion(question: Question): void {
  currentQuestion = question;

  const titleEl = $('question-title');
  if (titleEl) titleEl.textContent = question.title;

  // meta 徽章 / 标签
  const metaEl = $('question-meta');
  if (metaEl) {
    const parts: string[] = [];
    parts.push(
      `<span class="pill ${question.type === 'code' ? 'type-code' : 'type-qa'}">${
        question.type === 'code' ? '代码题' : '问答题'
      }</span>`,
    );
    parts.push(
      `<span class="pill ${difficultyClass(question.difficulty)}">${escapeHtml(
        difficultyLabel(question.difficulty),
      )}</span>`,
    );
    if (question.category) {
      parts.push(
        `<span class="pill category">${escapeHtml(question.category)}</span>`,
      );
    }
    if (Array.isArray(question.tags)) {
      for (const t of question.tags) {
        if (typeof t === 'string' && t.length > 0 && t !== question.category) {
          parts.push(`<span class="tag">${escapeHtml(t)}</span>`);
        }
      }
    }
    if (question.type === 'code' && question.language) {
      parts.push(`<span class="tag">${escapeHtml(question.language)}</span>`);
    }
    metaEl.innerHTML = parts.join('');
  }

  // 题面：markdown 渲染
  const contentEl = $('question-content');
  if (contentEl) contentEl.innerHTML = renderMarkdown(question.content);

  // 测试用例
  const testCasesEl = $('test-cases');
  if (testCasesEl) {
    if (
      question.type === 'code' &&
      Array.isArray(question.testCases) &&
      question.testCases.length > 0
    ) {
      let html = '<h2>测试用例</h2>';
      for (const tc of question.testCases) {
        html += '<div class="test-case">';
        if (tc.name) {
          html += `<div class="test-case-name">${escapeHtml(tc.name)}</div>`;
        }
        if (tc.input) {
          html += `<div class="test-case-row"><span class="test-case-label">输入</span><code>${escapeHtml(tc.input)}</code></div>`;
        }
        if (tc.expected) {
          html += `<div class="test-case-row"><span class="test-case-label">预期</span><code>${escapeHtml(tc.expected)}</code></div>`;
        }
        if (tc.description) {
          html += `<div class="test-case-row"><span class="test-case-label">说明</span><span>${escapeHtml(tc.description)}</span></div>`;
        }
        html += '</div>';
      }
      testCasesEl.innerHTML = html;
    } else {
      testCasesEl.innerHTML = '';
    }
  }

  // 切题时重置答案区到未展开状态
  hideAnswerSection();
}

/**
 * 学习状态相关 UI 更新。
 *
 * 新版 UI 已移除 mastery 4 段选择器，只保留标题栏右侧的收藏星按钮，
 * 因此本函数只更新 `#btn-favorite` 的 active 状态与 aria 文案。
 * 入参类型仍保留完整 LearningState，便于扩展端协议不变。
 */
function updateLearningUI(learning: LearningState): void {
  const favBtn = $('btn-favorite');
  if (!favBtn) return;
  favBtn.classList.toggle('active', learning.favoriteFlag);
  favBtn.setAttribute(
    'aria-label',
    learning.favoriteFlag ? '取消收藏' : '收藏',
  );
  favBtn.setAttribute('title', learning.favoriteFlag ? '取消收藏' : '收藏');
}

interface AnswerPayload {
  questionType: 'code' | 'qa';
  answer:
    | {
        kind: 'reference';
        code?: string;
        briefAnswer?: string;
        detailedAnswer?: string;
        followUps?: Array<{ question: string; answer?: string }>;
      }
    | { kind: 'none'; hint: string };
}

function showAnswer(payload: AnswerPayload): void {
  const area = $('answer-area');
  const content = $('answer-content');
  if (!area || !content) return;

  area.classList.remove('hidden');

  const ans = payload.answer;
  if (ans.kind === 'none') {
    content.innerHTML = `<span class="answer-label">参考答案</span><p>${escapeHtml(
      ans.hint ?? '该题暂无参考答案',
    )}</p>`;
  } else {
    let html = '<span class="answer-label">参考答案</span>';
    if (payload.questionType === 'code') {
      const lang =
        currentQuestion && currentQuestion.type === 'code'
          ? currentQuestion.language ?? ''
          : '';
      const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
      html += `<pre><code${langClass}>${highlight(ans.code ?? '', lang)}</code></pre>`;
    } else {
      if (ans.briefAnswer) {
        html += `<div class="brief md">${renderMarkdown(ans.briefAnswer)}</div>`;
      }
      if (ans.detailedAnswer) {
        html += `<div class="detailed md"><h3>详细解析</h3>${renderMarkdown(ans.detailedAnswer)}</div>`;
      }
    }
    content.innerHTML = html;
  }

  // 追问（仅 QA 题且 reference）
  const followUpsEl = $('follow-ups');
  if (followUpsEl) {
    if (
      ans.kind === 'reference' &&
      payload.questionType === 'qa' &&
      Array.isArray(ans.followUps) &&
      ans.followUps.length > 0
    ) {
      let fuHtml = '<h2 class="followups-title">追问</h2>';
      for (const fu of ans.followUps) {
        fuHtml += '<div class="follow-up">';
        fuHtml += `<div class="follow-up-q">${escapeHtml(fu.question)}</div>`;
        if (fu.answer) {
          fuHtml += `<div class="follow-up-a md">${renderMarkdown(fu.answer)}</div>`;
        }
        fuHtml += '</div>';
      }
      followUpsEl.innerHTML = fuHtml;
    } else {
      followUpsEl.innerHTML = '';
    }
  }

  // 切换 toggle 区到隐藏状态（同时把 show 按钮 hide，以备将来重新显示）
  const toggle = document.querySelector('.answer-toggle');
  if (toggle) (toggle as HTMLElement).hidden = true;
  const showBtn = $('btn-show-answer');
  if (showBtn) showBtn.setAttribute('hidden', '');
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;

function showStatus(msg: string): void {
  const el = $('status-message');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (statusTimer !== undefined) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2400);
}

document.addEventListener('DOMContentLoaded', () => {
  $('btn-show-answer')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'requestAnswer' });
  });

  $('btn-collapse-answer')?.addEventListener('click', () => {
    hideAnswerSection();
  });

  $('btn-favorite')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleFavorite' });
  });

  vscode.postMessage({ type: 'ready' });
});

window.addEventListener('message', (event) => {
  const msg = event.data as HostToWebviewMessage;
  switch (msg.type) {
    case 'init': {
      const payload = msg.payload as { question: Question; learning: LearningState };
      renderQuestion(payload.question);
      updateLearningUI(payload.learning);
      break;
    }
    case 'showAnswer': {
      showAnswer(msg.payload as AnswerPayload);
      break;
    }
    case 'rollback':
    case 'refreshLearning': {
      const learning = msg.payload as LearningState;
      if (learning) updateLearningUI(learning);
      break;
    }
    case 'favoriteAck': {
      if (!msg.ok) showStatus(`收藏操作失败: ${msg.reason ?? '未知错误'}`);
      break;
    }
  }
});
