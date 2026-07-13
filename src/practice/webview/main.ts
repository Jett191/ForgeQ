/**
 * Webview 端入口（Practice 面板）。
 *
 * 在 webview iframe 内运行，通过 `acquireVsCodeApi()` 与扩展进程通信。
 *
 * UI 结构（与 panel.ts 内嵌 HTML 同步）：
 *   - .q-head（meta 徽章 + 标题 + 收藏按钮）
 *   - #question-content.md（题面 markdown 渲染）
 *   - .answer-toggle > #btn-show-answer（点击展开答案；展开后整体隐藏）
 *   - #answer-area（含 #btn-collapse-answer 圆形 ↑ 按钮 + #answer-content）
 *   - #follow-ups（题目追问）
 *
 * 渲染策略：题面 / 详细解析 / 简答 / 追问答案均走 `renderMarkdown`，
 * 其余短字符串字段走 `escapeHtml`。题型只改变徽章文字与筛选结果。
 */

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
  answer: string;
  followUps?: Array<{ question: string; answer?: string }>;
}

const vscode = acquireVsCodeApi();

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
  // mastery-fab 在答案展开时被移到 .answer-actions，这里要把它搬回到 .answer-toggle
  // 顶部位置；这样未展开状态下学习状态按钮始终在 "查看答案" 行的右侧。
  moveMasteryToToggle();
  const toggle = $('answer-toggle');
  if (toggle) toggle.hidden = false;
  const showBtn = $('btn-show-answer');
  if (showBtn) showBtn.removeAttribute('hidden');
  hideMasteryOptions();
}

/**
 * 把 #mastery-fab 移到答案展开时的容器（.answer-actions 内、收起按钮左边）。
 *
 * 用 DOM 移动而不是双份 DOM 实例，避免按钮"展开/选中"状态在两处不同步。
 */
function moveMasteryToAnswer(): void {
  const fab = $('mastery-fab');
  const actions = document.querySelector('.answer-actions');
  const collapse = $('btn-collapse-answer');
  if (!fab || !actions || !collapse) return;
  if (fab.parentElement === actions) return;
  actions.insertBefore(fab, collapse);
}

/** 把 #mastery-fab 移回未展开状态的容器（.answer-toggle 内、查看答案按钮右边）。 */
function moveMasteryToToggle(): void {
  const fab = $('mastery-fab');
  const toggle = $('answer-toggle');
  if (!fab || !toggle) return;
  if (fab.parentElement === toggle) return;
  toggle.appendChild(fab);
}

/** 关闭学习状态浮动选项菜单。 */
function hideMasteryOptions(): void {
  const opts = document.querySelector('.mastery-options') as HTMLElement | null;
  if (opts) opts.hidden = true;
  const trigger = $('btn-mastery');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

/** 把 mastery 值映射成主按钮中央显示的字符。 */
function masteryIcon(m: string): string {
  switch (m) {
    case 'mastered':
      return '✓';
    case 'not_mastered':
      return '◔';
    case 'learning':
      return '◔';
    case 'unlearned':
    default:
      return '○';
  }
}

function renderQuestion(question: Question): void {
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
    metaEl.innerHTML = parts.join('');
  }

  // 题面：markdown 渲染
  const contentEl = $('question-content');
  if (contentEl) contentEl.innerHTML = renderMarkdown(question.content);

  // 切题时重置答案区到未展开状态
  hideAnswerSection();
}

/**
 * 学习状态相关 UI 更新。
 *
 * 标题栏右侧的收藏星按钮 + 答案 toggle 行右侧的学习状态浮动按钮组：
 *  - 收藏：active class + aria 文案；
 *  - 学习状态主按钮：显示掌握状态；错题标记开启时优先显示错题；
 *  - 掌握状态与错题按钮分别维护自己的 active 高亮。
 *
 * 入参类型仍保留完整 LearningState，扩展端协议不变。
 */
function updateLearningUI(learning: LearningState): void {
  const favBtn = $('btn-favorite');
  if (favBtn) {
    favBtn.classList.toggle('active', learning.favoriteFlag);
    favBtn.setAttribute(
      'aria-label',
      learning.favoriteFlag ? '取消收藏' : '收藏',
    );
    favBtn.setAttribute('title', learning.favoriteFlag ? '取消收藏' : '收藏');
  }

  // 掌握状态按钮的 active class（learning 仅为旧数据兼容，不再提供按钮）
  const masteryValues = ['unlearned', 'learning', 'mastered', 'not_mastered'];
  for (const m of masteryValues) {
    const btn = document.querySelector(
      `[data-mastery="${m}"]`,
    ) as HTMLElement | null;
    if (!btn) continue;
    btn.classList.toggle('active', m === learning.mastery);
  }

  const wrongBtn = document.querySelector('[data-wrong]') as HTMLElement | null;
  if (wrongBtn) {
    wrongBtn.classList.toggle('active', learning.wrongFlag);
    wrongBtn.setAttribute('aria-label', learning.wrongFlag ? '取消错题标记' : '标记为错题');
    wrongBtn.setAttribute('title', learning.wrongFlag ? '取消错题标记' : '标记为错题');
  }

  // 主触发按钮：清掉所有 is-* 再加当前 mastery 的 class，更新中心字符
  const trigger = $('btn-mastery');
  if (trigger) {
    for (const m of masteryValues) {
      trigger.classList.remove(`is-${m}`);
    }
    trigger.classList.remove('is-wrong');
    trigger.classList.add(learning.wrongFlag ? 'is-wrong' : `is-${learning.mastery}`);
    const icon = trigger.querySelector('.mastery-icon');
    if (icon) icon.textContent = learning.wrongFlag ? '✗' : masteryIcon(learning.mastery);
  }
}

interface AnswerPayload {
  questionType: 'code' | 'qa';
  answer:
    | {
      kind: 'reference';
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
    if (ans.briefAnswer) {
      html += `<div class="brief md">${renderMarkdown(ans.briefAnswer)}</div>`;
    }
    if (ans.detailedAnswer) {
      html += `<div class="detailed md"><h3>详细解析</h3>${renderMarkdown(ans.detailedAnswer)}</div>`;
    }
    content.innerHTML = html;
  }

  // 追问（两种题型共用）
  const followUpsEl = $('follow-ups');
  if (followUpsEl) {
    if (
      ans.kind === 'reference' &&
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

  // 切换 toggle 区到隐藏状态（同时把 show 按钮 hide，以备将来重新显示）；
  // 把 mastery-fab DOM 移到答案区底部右下角的 .answer-actions 内。
  const toggle = $('answer-toggle');
  if (toggle) toggle.hidden = true;
  const showBtn = $('btn-show-answer');
  if (showBtn) showBtn.setAttribute('hidden', '');
  hideMasteryOptions();
  moveMasteryToAnswer();
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
  $('btn-open-project')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'openProject' });
  });

  $('btn-show-answer')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'requestAnswer' });
  });

  $('btn-collapse-answer')?.addEventListener('click', () => {
    hideAnswerSection();
  });

  $('btn-favorite')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleFavorite' });
  });

  // 学习状态主按钮：toggle 4 个选项的可见性
  $('btn-mastery')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const opts = document.querySelector('.mastery-options') as HTMLElement | null;
    const trigger = $('btn-mastery');
    if (!opts) return;
    const willShow = opts.hidden;
    opts.hidden = !willShow;
    if (trigger) trigger.setAttribute('aria-expanded', willShow ? 'true' : 'false');
  });

  // 4 个选项按钮：发出 setMastery，并立刻关闭浮动菜单
  document.querySelectorAll('[data-mastery]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = (btn as HTMLElement).dataset['mastery'];
      if (value) vscode.postMessage({ type: 'setMastery', value });
      hideMasteryOptions();
    });
  });

  document.querySelector('[data-wrong]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'toggleWrong' });
    hideMasteryOptions();
  });

  // 点击 fab 之外的任意位置关闭浮动菜单（不阻止事件，让原本的点击仍生效）
  document.addEventListener('click', (e) => {
    const fab = $('mastery-fab');
    if (!fab) return;
    if (fab.contains(e.target as Node)) return;
    hideMasteryOptions();
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
    case 'masteryAck': {
      if (!msg.ok) showStatus(`掌握状态更新失败: ${msg.reason ?? '未知错误'}`);
      break;
    }
    case 'wrongAck': {
      if (!msg.ok) showStatus(`错题标记更新失败: ${msg.reason ?? '未知错误'}`);
      break;
    }
  }
});
