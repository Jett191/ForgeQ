/**
 * Webview 端脚本（Task 19）。
 *
 * 在 Webview iframe 内运行，通过 `acquireVsCodeApi()` 与 Extension Host 通信。
 */

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
  mastery: string;
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
  difficulty: string;
  answer: string;
  testCases?: Array<{ name?: string; input?: string; expected?: string; description?: string }>;
  followUps?: Array<{ question: string; answer?: string }>;
}

const vscode = acquireVsCodeApi();

let currentLearning: LearningState | undefined;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderQuestion(question: Question): void {
  const title = $('question-title');
  if (title) title.textContent = question.title;

  const typeEl = $('question-type');
  if (typeEl) typeEl.textContent = question.type === 'code' ? '代码' : '问答';

  const diffEl = $('question-difficulty');
  if (diffEl) diffEl.textContent = question.difficulty;

  const catEl = $('question-category');
  if (catEl) catEl.textContent = question.category;

  const contentEl = $('question-content');
  if (contentEl) contentEl.textContent = question.content;

  // Render test cases for code questions
  const testCasesEl = $('test-cases');
  if (testCasesEl && question.type === 'code' && question.testCases && question.testCases.length > 0) {
    let html = '<h2>测试用例</h2>';
    for (const tc of question.testCases) {
      html += '<div class="test-case">';
      if (tc.name) html += `<div class="test-case-name">${escapeHtml(tc.name)}</div>`;
      if (tc.input) html += `<div><strong>输入:</strong> <code>${escapeHtml(tc.input)}</code></div>`;
      if (tc.expected) html += `<div><strong>预期:</strong> <code>${escapeHtml(tc.expected)}</code></div>`;
      if (tc.description) html += `<div>${escapeHtml(tc.description)}</div>`;
      html += '</div>';
    }
    testCasesEl.innerHTML = html;
  }
}

function updateLearningUI(learning: LearningState): void {
  currentLearning = learning;

  // Update favorite button
  const favBtn = $('btn-favorite');
  if (favBtn) {
    favBtn.textContent = learning.favoriteFlag ? '取消收藏' : '收藏';
    if (learning.favoriteFlag) {
      favBtn.classList.add('active');
    } else {
      favBtn.classList.remove('active');
    }
  }

  // Update mastery buttons
  const masteryValues = ['unlearned', 'learning', 'mastered', 'not_mastered'];
  for (const m of masteryValues) {
    const btn = document.querySelector(`[data-mastery="${m}"]`) as HTMLElement | null;
    if (btn) {
      if (m === learning.mastery) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }
}

function showAnswer(payload: { questionType: string; answer: unknown }): void {
  const area = $('answer-area');
  if (!area) return;
  area.classList.remove('hidden');

  const answer = payload.answer as { kind: string; code?: string; briefAnswer?: string; detailedAnswer?: string; hint?: string; followUps?: Array<{ question: string; answer?: string }> };

  if (answer.kind === 'none') {
    area.innerHTML = `<p class="status-message">${escapeHtml(answer.hint ?? '该题暂无参考答案')}</p>`;
    return;
  }

  if (payload.questionType === 'code') {
    area.innerHTML = `<h2>参考答案</h2><pre><code>${escapeHtml(answer.code ?? '')}</code></pre>`;
  } else {
    let html = `<h2>参考答案</h2><p>${escapeHtml(answer.briefAnswer ?? '')}</p>`;
    if (answer.detailedAnswer) {
      html += `<h3>详细解析</h3><div class="content-area">${escapeHtml(answer.detailedAnswer)}</div>`;
    }
    area.innerHTML = html;

    // Render follow-ups
    const followUpsEl = $('follow-ups');
    if (followUpsEl && answer.followUps && answer.followUps.length > 0) {
      let fuHtml = '<h2>追问</h2>';
      for (const fu of answer.followUps) {
        fuHtml += '<div class="follow-up">';
        fuHtml += `<div class="follow-up-question">${escapeHtml(fu.question)}</div>`;
        if (fu.answer) fuHtml += `<div>${escapeHtml(fu.answer)}</div>`;
        fuHtml += '</div>';
      }
      followUpsEl.innerHTML = fuHtml;
    }
  }

  // Hide the button
  const btn = $('btn-show-answer');
  if (btn) btn.style.display = 'none';
}

function showStatus(msg: string): void {
  const el = $('status-message');
  if (el) {
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  $('btn-show-answer')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'requestAnswer' });
  });

  $('btn-favorite')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleFavorite' });
  });

  document.querySelectorAll('[data-mastery]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = (btn as HTMLElement).dataset['mastery'];
      if (value) {
        vscode.postMessage({ type: 'setMastery', value });
      }
    });
  });

  $('link-open-note')?.addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ type: 'openNativeEditor', target: 'note' });
  });

  $('link-note-preview')?.addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ type: 'requestNotePreview' });
  });

  // Notify host that webview is ready
  vscode.postMessage({ type: 'ready' });
});

// Listen for messages from host
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
      showAnswer(msg.payload as { questionType: string; answer: unknown });
      break;
    }
    case 'rollback':
    case 'refreshLearning': {
      const learning = msg.payload as LearningState;
      if (learning) updateLearningUI(learning);
      break;
    }
    case 'masteryAck': {
      if (!msg.ok) {
        showStatus(`掌握状态更新失败: ${msg.reason ?? '未知错误'}`);
      }
      break;
    }
    case 'favoriteAck': {
      if (!msg.ok) {
        showStatus(`收藏操作失败: ${msg.reason ?? '未知错误'}`);
      }
      break;
    }
  }
});
