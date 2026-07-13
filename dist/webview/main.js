"use strict";
(() => {
  // src/practice/webview/highlight.ts
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function tokenize(src, rules) {
    let out = "";
    let plain = "";
    const flush = () => {
      if (plain) {
        out += escapeHtml(plain);
        plain = "";
      }
    };
    let i = 0;
    while (i < src.length) {
      let matched = false;
      for (const r of rules) {
        r.re.lastIndex = i;
        const m = r.re.exec(src);
        if (m && m.index === i) {
          flush();
          out += `<span class="hl-${r.kind}">${escapeHtml(m[0])}</span>`;
          i = r.re.lastIndex;
          matched = true;
          break;
        }
      }
      if (!matched) {
        plain += src[i];
        i++;
      }
    }
    flush();
    return out;
  }
  var JS_RULES = [
    { kind: "com", re: /\/\/[^\n]*/y },
    { kind: "com", re: /\/\*[\s\S]*?\*\//y },
    { kind: "str", re: /"(?:\\.|[^"\\\n])*"/y },
    { kind: "str", re: /'(?:\\.|[^'\\\n])*'/y },
    { kind: "str", re: /`(?:\\.|[^`\\])*`/y },
    {
      kind: "kw",
      re: /\b(?:const|let|var|function|class|extends|implements|interface|type|enum|namespace|declare|module|import|export|from|as|default|return|if|else|for|while|do|switch|case|break|continue|new|delete|this|super|typeof|instanceof|in|of|try|catch|finally|throw|async|await|yield|static|get|set|public|private|protected|readonly|abstract|override|void|any|unknown|never|with)\b/y
    },
    { kind: "bool", re: /\b(?:true|false|null|undefined|NaN|Infinity)\b/y },
    {
      kind: "num",
      re: /\b(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)n?\b/y
    },
    { kind: "ty", re: /\b[A-Z][\w$]*\b/y },
    { kind: "fn", re: /\b[a-zA-Z_$][\w$]*(?=\s*\()/y }
  ];
  var CSS_RULES = [
    { kind: "com", re: /\/\*[\s\S]*?\*\//y },
    { kind: "str", re: /"(?:[^"\\\n]|\\.)*"/y },
    { kind: "str", re: /'(?:[^'\\\n]|\\.)*'/y },
    { kind: "val", re: /#[0-9a-fA-F]{3,8}\b/y },
    { kind: "kw", re: /@[a-zA-Z-]+/y },
    { kind: "prop", re: /-?[a-zA-Z][\w-]*(?=\s*:)/y },
    {
      kind: "num",
      re: /-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|rad|turn|fr|pt|pc|ex|ch)?\b/y
    },
    {
      kind: "bool",
      re: /\b(?:none|inherit|initial|unset|auto|inline|block|flex|grid|absolute|relative|fixed|static|sticky|hidden|visible)\b/y
    }
  ];
  var HTML_RULES = [
    { kind: "com", re: /<!--[\s\S]*?-->/y },
    { kind: "str", re: /"[^"\n]*"/y },
    { kind: "str", re: /'[^'\n]*'/y },
    { kind: "tag", re: /<\/?[a-zA-Z][\w-]*/y },
    { kind: "tag", re: /\/?>/y },
    { kind: "attr", re: /\b[a-zA-Z][\w-]*(?==)/y }
  ];
  var JSON_RULES = [
    { kind: "attr", re: /"(?:\\.|[^"\\])*"(?=\s*:)/y },
    { kind: "str", re: /"(?:\\.|[^"\\])*"/y },
    { kind: "bool", re: /\b(?:true|false|null)\b/y },
    { kind: "num", re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y }
  ];
  var PY_RULES = [
    { kind: "com", re: /#[^\n]*/y },
    { kind: "str", re: /"""[\s\S]*?"""/y },
    { kind: "str", re: /'''[\s\S]*?'''/y },
    { kind: "str", re: /"(?:\\.|[^"\\\n])*"/y },
    { kind: "str", re: /'(?:\\.|[^'\\\n])*'/y },
    {
      kind: "kw",
      re: /\b(?:def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|yield|lambda|global|nonlocal|in|is|not|and|or|async|await)\b/y
    },
    { kind: "bool", re: /\b(?:True|False|None)\b/y },
    { kind: "num", re: /\b\d+(?:\.\d+)?\b/y },
    { kind: "fn", re: /\b[a-zA-Z_]\w*(?=\s*\()/y }
  ];
  var SH_RULES = [
    { kind: "com", re: /#[^\n]*/y },
    { kind: "str", re: /"(?:\\.|[^"\\])*"/y },
    { kind: "str", re: /'[^']*'/y },
    {
      kind: "kw",
      re: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|export|local|readonly)\b/y
    },
    { kind: "fn", re: /\$\{[^}]+\}|\$\w+/y }
  ];
  function langKey(lang) {
    switch (lang.toLowerCase()) {
      case "js":
      case "jsx":
      case "javascript":
      case "ts":
      case "tsx":
      case "typescript":
        return "js";
      case "css":
      case "scss":
      case "less":
        return "css";
      case "html":
      case "xml":
      case "vue":
      case "svg":
        return "html";
      case "json":
      case "json5":
        return "json";
      case "py":
      case "python":
        return "py";
      case "sh":
      case "bash":
      case "shell":
      case "zsh":
        return "sh";
      default:
        return "";
    }
  }
  function highlight(code, lang) {
    switch (langKey(lang)) {
      case "js":
        return tokenize(code, JS_RULES);
      case "css":
        return tokenize(code, CSS_RULES);
      case "html":
        return tokenize(code, HTML_RULES);
      case "json":
        return tokenize(code, JSON_RULES);
      case "py":
        return tokenize(code, PY_RULES);
      case "sh":
        return tokenize(code, SH_RULES);
      default:
        return escapeHtml(code);
    }
  }

  // src/practice/webview/markdown.ts
  function escapeHtml2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function renderMarkdown(src) {
    if (!src) return "";
    return blockRender(normalizeNewlines(src));
  }
  function normalizeNewlines(s) {
    return s.replace(/\r\n?/g, "\n");
  }
  function blockRender(src) {
    const lines = src.split("\n");
    const out = [];
    let i = 0;
    let paragraph = [];
    let listKind = null;
    const listItems = [];
    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      out.push(`<p>${inlineRender(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (listKind === null) return;
      out.push(`<${listKind}>${listItems.join("")}</${listKind}>`);
      listItems.length = 0;
      listKind = null;
    };
    const flushAll = () => {
      flushParagraph();
      flushList();
    };
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const fence = /^```\s*([^\s`]*)/.exec(line);
      if (fence) {
        flushAll();
        const langRaw = fence[1] ?? "";
        const lang = langRaw.split(/\s/)[0] ?? "";
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
          codeLines.push(lines[i] ?? "");
          i++;
        }
        if (i < lines.length) i++;
        const langClass = lang ? ` class="lang-${escapeAttr(lang)}"` : "";
        out.push(
          `<pre><code${langClass}>${highlight(codeLines.join("\n"), lang)}</code></pre>`
        );
        continue;
      }
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        flushAll();
        const level = (heading[1] ?? "").length;
        out.push(`<h${level}>${inlineRender(heading[2] ?? "")}</h${level}>`);
        i++;
        continue;
      }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        flushAll();
        out.push("<hr/>");
        i++;
        continue;
      }
      if (/^\s*>/.test(line)) {
        flushAll();
        const quoteLines = [];
        while (i < lines.length && /^\s*>/.test(lines[i] ?? "")) {
          quoteLines.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
          i++;
        }
        out.push(`<blockquote>${blockRender(quoteLines.join("\n"))}</blockquote>`);
        continue;
      }
      if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1] ?? "")) {
        flushAll();
        const headerCells = parseTableRow(line);
        i += 2;
        const bodyRows = [];
        while (i < lines.length && isTableRow(lines[i] ?? "")) {
          bodyRows.push(parseTableRow(lines[i] ?? ""));
          i++;
        }
        let table = "<table><thead><tr>";
        for (const c of headerCells) table += `<th>${inlineRender(c)}</th>`;
        table += "</tr></thead><tbody>";
        for (const row of bodyRows) {
          table += "<tr>";
          for (const c of row) table += `<td>${inlineRender(c)}</td>`;
          table += "</tr>";
        }
        table += "</tbody></table>";
        out.push(table);
        continue;
      }
      const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
      const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (ul || ol) {
        flushParagraph();
        const kind = ul ? "ul" : "ol";
        if (listKind !== null && listKind !== kind) {
          flushList();
        }
        listKind = kind;
        const text = (ul ? ul[1] : ol?.[1]) ?? "";
        listItems.push(`<li>${inlineRender(text)}</li>`);
        i++;
        continue;
      }
      if (line.trim() === "") {
        flushAll();
        i++;
        continue;
      }
      flushList();
      paragraph.push(line);
      i++;
    }
    flushAll();
    return out.join("");
  }
  function isTableRow(line) {
    return /^\s*\|.*\|\s*$/.test(line);
  }
  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
  }
  function parseTableRow(line) {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map((c) => c.trim());
  }
  function inlineRender(s) {
    let out = escapeHtml2(s);
    const codes = [];
    out = out.replace(/`([^`\n]+?)`/g, (_, code) => {
      codes.push(`<code>${code}</code>`);
      return `\0C${codes.length - 1}\0`;
    });
    out = out.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, text, href) => {
        const safe = sanitizeHref(href);
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
    );
    out = out.replace(/\*\*\*([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    out = out.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
    out = out.replace(/\u0000C(\d+)\u0000/g, (_, idx) => {
      const i = Number(idx);
      return codes[i] ?? "";
    });
    return out;
  }
  function sanitizeHref(href) {
    const trimmed = href.trim();
    if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(trimmed)) {
      return escapeAttr(trimmed);
    }
    return "#";
  }
  function escapeAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // src/practice/webview/main.ts
  var vscode = acquireVsCodeApi();
  var currentQuestion;
  function $(id) {
    return document.getElementById(id);
  }
  function difficultyLabel(d) {
    switch (d) {
      case "easy":
        return "\u7B80\u5355";
      case "medium":
        return "\u4E2D\u7B49";
      case "hard":
        return "\u56F0\u96BE";
      default:
        return d;
    }
  }
  function difficultyClass(d) {
    switch (d) {
      case "easy":
        return "diff-easy";
      case "medium":
        return "diff-medium";
      case "hard":
        return "diff-hard";
      default:
        return "";
    }
  }
  function hideAnswerSection() {
    const area = $("answer-area");
    if (area) area.classList.add("hidden");
    const content = $("answer-content");
    if (content) content.innerHTML = "";
    const followUpsEl = $("follow-ups");
    if (followUpsEl) followUpsEl.innerHTML = "";
    moveMasteryToToggle();
    const toggle = $("answer-toggle");
    if (toggle) toggle.hidden = false;
    const showBtn = $("btn-show-answer");
    if (showBtn) showBtn.removeAttribute("hidden");
    hideMasteryOptions();
  }
  function moveMasteryToAnswer() {
    const fab = $("mastery-fab");
    const actions = document.querySelector(".answer-actions");
    const collapse = $("btn-collapse-answer");
    if (!fab || !actions || !collapse) return;
    if (fab.parentElement === actions) return;
    actions.insertBefore(fab, collapse);
  }
  function moveMasteryToToggle() {
    const fab = $("mastery-fab");
    const toggle = $("answer-toggle");
    if (!fab || !toggle) return;
    if (fab.parentElement === toggle) return;
    toggle.appendChild(fab);
  }
  function hideMasteryOptions() {
    const opts = document.querySelector(".mastery-options");
    if (opts) opts.hidden = true;
    const trigger = $("btn-mastery");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }
  function masteryIcon(m) {
    switch (m) {
      case "mastered":
        return "\u2713";
      case "not_mastered":
        return "\u25D4";
      case "learning":
        return "\u25D4";
      case "unlearned":
      default:
        return "\u25CB";
    }
  }
  function renderQuestion(question) {
    currentQuestion = question;
    const titleEl = $("question-title");
    if (titleEl) titleEl.textContent = question.title;
    const metaEl = $("question-meta");
    if (metaEl) {
      const parts = [];
      parts.push(
        `<span class="pill ${question.type === "code" ? "type-code" : "type-qa"}">${question.type === "code" ? "\u4EE3\u7801\u9898" : "\u95EE\u7B54\u9898"}</span>`
      );
      parts.push(
        `<span class="pill ${difficultyClass(question.difficulty)}">${escapeHtml2(
          difficultyLabel(question.difficulty)
        )}</span>`
      );
      if (question.category) {
        parts.push(
          `<span class="pill category">${escapeHtml2(question.category)}</span>`
        );
      }
      if (Array.isArray(question.tags)) {
        for (const t of question.tags) {
          if (typeof t === "string" && t.length > 0 && t !== question.category) {
            parts.push(`<span class="tag">${escapeHtml2(t)}</span>`);
          }
        }
      }
      if (question.type === "code" && question.language) {
        parts.push(`<span class="tag">${escapeHtml2(question.language)}</span>`);
      }
      metaEl.innerHTML = parts.join("");
    }
    const contentEl = $("question-content");
    if (contentEl) contentEl.innerHTML = renderMarkdown(question.content);
    const testCasesEl = $("test-cases");
    if (testCasesEl) {
      if (question.type === "code" && Array.isArray(question.testCases) && question.testCases.length > 0) {
        let html = "<h2>\u6D4B\u8BD5\u7528\u4F8B</h2>";
        for (const tc of question.testCases) {
          html += '<div class="test-case">';
          if (tc.name) {
            html += `<div class="test-case-name">${escapeHtml2(tc.name)}</div>`;
          }
          if (tc.input) {
            html += `<div class="test-case-row"><span class="test-case-label">\u8F93\u5165</span><code>${escapeHtml2(tc.input)}</code></div>`;
          }
          if (tc.expected) {
            html += `<div class="test-case-row"><span class="test-case-label">\u9884\u671F</span><code>${escapeHtml2(tc.expected)}</code></div>`;
          }
          if (tc.description) {
            html += `<div class="test-case-row"><span class="test-case-label">\u8BF4\u660E</span><span>${escapeHtml2(tc.description)}</span></div>`;
          }
          html += "</div>";
        }
        testCasesEl.innerHTML = html;
      } else {
        testCasesEl.innerHTML = "";
      }
    }
    hideAnswerSection();
  }
  function updateLearningUI(learning) {
    const favBtn = $("btn-favorite");
    if (favBtn) {
      favBtn.classList.toggle("active", learning.favoriteFlag);
      favBtn.setAttribute(
        "aria-label",
        learning.favoriteFlag ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF"
      );
      favBtn.setAttribute("title", learning.favoriteFlag ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF");
    }
    const masteryValues = ["unlearned", "learning", "mastered", "not_mastered"];
    for (const m of masteryValues) {
      const btn = document.querySelector(
        `[data-mastery="${m}"]`
      );
      if (!btn) continue;
      btn.classList.toggle("active", m === learning.mastery);
    }
    const wrongBtn = document.querySelector("[data-wrong]");
    if (wrongBtn) {
      wrongBtn.classList.toggle("active", learning.wrongFlag);
      wrongBtn.setAttribute("aria-label", learning.wrongFlag ? "\u53D6\u6D88\u9519\u9898\u6807\u8BB0" : "\u6807\u8BB0\u4E3A\u9519\u9898");
      wrongBtn.setAttribute("title", learning.wrongFlag ? "\u53D6\u6D88\u9519\u9898\u6807\u8BB0" : "\u6807\u8BB0\u4E3A\u9519\u9898");
    }
    const trigger = $("btn-mastery");
    if (trigger) {
      for (const m of masteryValues) {
        trigger.classList.remove(`is-${m}`);
      }
      trigger.classList.remove("is-wrong");
      trigger.classList.add(learning.wrongFlag ? "is-wrong" : `is-${learning.mastery}`);
      const icon = trigger.querySelector(".mastery-icon");
      if (icon) icon.textContent = learning.wrongFlag ? "\u2717" : masteryIcon(learning.mastery);
    }
  }
  function showAnswer(payload) {
    const area = $("answer-area");
    const content = $("answer-content");
    if (!area || !content) return;
    area.classList.remove("hidden");
    const ans = payload.answer;
    if (ans.kind === "none") {
      content.innerHTML = `<span class="answer-label">\u53C2\u8003\u7B54\u6848</span><p>${escapeHtml2(
        ans.hint ?? "\u8BE5\u9898\u6682\u65E0\u53C2\u8003\u7B54\u6848"
      )}</p>`;
    } else {
      let html = '<span class="answer-label">\u53C2\u8003\u7B54\u6848</span>';
      if (payload.questionType === "code") {
        const lang = currentQuestion && currentQuestion.type === "code" ? currentQuestion.language ?? "" : "";
        const langClass = lang ? ` class="lang-${escapeHtml2(lang)}"` : "";
        html += `<pre><code${langClass}>${highlight(ans.code ?? "", lang)}</code></pre>`;
      } else {
        if (ans.briefAnswer) {
          html += `<div class="brief md">${renderMarkdown(ans.briefAnswer)}</div>`;
        }
        if (ans.detailedAnswer) {
          html += `<div class="detailed md"><h3>\u8BE6\u7EC6\u89E3\u6790</h3>${renderMarkdown(ans.detailedAnswer)}</div>`;
        }
      }
      content.innerHTML = html;
    }
    const followUpsEl = $("follow-ups");
    if (followUpsEl) {
      if (ans.kind === "reference" && payload.questionType === "qa" && Array.isArray(ans.followUps) && ans.followUps.length > 0) {
        let fuHtml = '<h2 class="followups-title">\u8FFD\u95EE</h2>';
        for (const fu of ans.followUps) {
          fuHtml += '<div class="follow-up">';
          fuHtml += `<div class="follow-up-q">${escapeHtml2(fu.question)}</div>`;
          if (fu.answer) {
            fuHtml += `<div class="follow-up-a md">${renderMarkdown(fu.answer)}</div>`;
          }
          fuHtml += "</div>";
        }
        followUpsEl.innerHTML = fuHtml;
      } else {
        followUpsEl.innerHTML = "";
      }
    }
    const toggle = $("answer-toggle");
    if (toggle) toggle.hidden = true;
    const showBtn = $("btn-show-answer");
    if (showBtn) showBtn.setAttribute("hidden", "");
    hideMasteryOptions();
    moveMasteryToAnswer();
  }
  var statusTimer;
  function showStatus(msg) {
    const el = $("status-message");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    if (statusTimer !== void 0) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 2400);
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("btn-show-answer")?.addEventListener("click", () => {
      vscode.postMessage({ type: "requestAnswer" });
    });
    $("btn-collapse-answer")?.addEventListener("click", () => {
      hideAnswerSection();
    });
    $("btn-favorite")?.addEventListener("click", () => {
      vscode.postMessage({ type: "toggleFavorite" });
    });
    $("btn-mastery")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const opts = document.querySelector(".mastery-options");
      const trigger = $("btn-mastery");
      if (!opts) return;
      const willShow = opts.hidden;
      opts.hidden = !willShow;
      if (trigger) trigger.setAttribute("aria-expanded", willShow ? "true" : "false");
    });
    document.querySelectorAll("[data-mastery]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = btn.dataset["mastery"];
        if (value) vscode.postMessage({ type: "setMastery", value });
        hideMasteryOptions();
      });
    });
    document.querySelector("[data-wrong]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: "toggleWrong" });
      hideMasteryOptions();
    });
    document.addEventListener("click", (e) => {
      const fab = $("mastery-fab");
      if (!fab) return;
      if (fab.contains(e.target)) return;
      hideMasteryOptions();
    });
    vscode.postMessage({ type: "ready" });
  });
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "init": {
        const payload = msg.payload;
        renderQuestion(payload.question);
        updateLearningUI(payload.learning);
        break;
      }
      case "showAnswer": {
        showAnswer(msg.payload);
        break;
      }
      case "rollback":
      case "refreshLearning": {
        const learning = msg.payload;
        if (learning) updateLearningUI(learning);
        break;
      }
      case "favoriteAck": {
        if (!msg.ok) showStatus(`\u6536\u85CF\u64CD\u4F5C\u5931\u8D25: ${msg.reason ?? "\u672A\u77E5\u9519\u8BEF"}`);
        break;
      }
      case "masteryAck": {
        if (!msg.ok) showStatus(`\u638C\u63E1\u72B6\u6001\u66F4\u65B0\u5931\u8D25: ${msg.reason ?? "\u672A\u77E5\u9519\u8BEF"}`);
        break;
      }
      case "wrongAck": {
        if (!msg.ok) showStatus(`\u9519\u9898\u6807\u8BB0\u66F4\u65B0\u5931\u8D25: ${msg.reason ?? "\u672A\u77E5\u9519\u8BEF"}`);
        break;
      }
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ByYWN0aWNlL3dlYnZpZXcvaGlnaGxpZ2h0LnRzIiwgIi4uLy4uL3NyYy9wcmFjdGljZS93ZWJ2aWV3L21hcmtkb3duLnRzIiwgIi4uLy4uL3NyYy9wcmFjdGljZS93ZWJ2aWV3L21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogXHU2NzgxXHU3QjgwXHU4QkVEXHU2Q0Q1XHU5QUQ4XHU0RUFFXHVGRjA4d2VidmlldyBcdTUxODVcdTVENENcdUZGMENcdTk2RjZcdTRGOURcdThENTZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTkxNERcdTU0MDggYG1hcmtkb3duLnRzYCBcdTU3MjhcdTUyNERcdTdBRUZcdTk3NjJcdThCRDVcdTk4OThcdTRFRTNcdTc4MDFcdTU3NTdcdTRFMEFcdTYzRDBcdTRGOUIgR2l0SHViIFx1OThDRVx1NjgzQ1x1NzY4NFx1Nzc0MFx1ODI3Mlx1RkYxQVxuICogIC0ganMgLyB0cyAvIGpzeCAvIHRzeCAvIGphdmFzY3JpcHQgLyB0eXBlc2NyaXB0XHVGRjA4XHU2NzAwXHU1QjhDXHU2NTc0XHVGRjA5XG4gKiAgLSBjc3MgLyBzY3NzIC8gbGVzc1x1RkYwOFx1NUM1RVx1NjAyNyAvIFx1NjU3MFx1NTAzQyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQSAvIFx1OTg5Q1x1ODI3Mlx1RkYwOVxuICogIC0gaHRtbCAvIHhtbCAvIHZ1ZSAvIHN2Z1x1RkYwOFx1NjgwN1x1N0I3RSAvIFx1NUM1RVx1NjAyNyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQVx1RkYwOVxuICogIC0ganNvbiAvIGpzb241XHVGRjA4a2V5IC8gXHU1QjU3XHU3QjI2XHU0RTMyIC8gXHU2NTcwXHU1QjU3IC8gXHU1RTAzXHU1QzE0XHVGRjA5XG4gKiAgLSBweSAvIHB5dGhvblx1MzAwMXNoIC8gYmFzaCAvIHpzaFx1RkYwOFx1NTdGQVx1Nzg0MFx1NTE3M1x1OTUyRVx1NUI1NyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQVx1RkYwOVxuICogXHU1MTc2XHU1QjgzXHU4QkVEXHU4QTAwXHU5NjREXHU3RUE3XHU0RTNBXHU3RUFGXHU2NTg3XHU2NzJDXHVGRjA4XHU0RUM1XHU1MDVBIEhUTUwgXHU4RjZDXHU0RTQ5XHVGRjA5XHUzMDAyXG4gKlxuICogdG9rZW5pemUgXHU3NTI4IHN0aWNreSBcdTZCNjNcdTUyMTlcdTYzMDlcdTg5QzRcdTUyMTlcdTRGMThcdTUxNDhcdTdFQTdcdTUyNERcdTdGMDBcdTUzMzlcdTkxNERcdUZGMENcdTUzNTVcdTkwNERcdTYyNkJcdTYzQ0YgTyhuIFx1MDBENyBydWxlcylcdTMwMDJcbiAqIFx1OEY5M1x1NTFGQVx1NTMwNVx1ODhDNVx1NEUzQSBgPHNwYW4gY2xhc3M9XCJobC0ke2tpbmR9XCI+XHUyMDI2PC9zcGFuPmBcdUZGMENcdTkxNERcdTgyNzJcdTc1MzEgc3R5bGVzLmNzcyBcdTYzRDBcdTRGOUJcbiAqIFx1NEVBRSAvIFx1NjY5N1x1NTNDQ1x1NTk1N1x1RkYwQ1x1NEY5RFx1OTc2MCB3ZWJ2aWV3IGJvZHkgXHU0RTBBXHU3Njg0IGAudnNjb2RlLWxpZ2h0YCAvIGAudnNjb2RlLWRhcmtgXG4gKiBjbGFzcyBcdTUyMDdcdTYzNjJcdTMwMDJcbiAqXG4gKiBcdTRFMEUgbWFya2Rvd24udHMgXHU4OUUzXHU4MDI2XHVGRjFBXHU0RTBEXHU1QkZDXHU1MTY1XHU1QjgzXHVGRjBDZXNjYXBlSHRtbCBcdTU3MjhcdTY3MkNcdTY1ODdcdTRFRjZcdTcyRUNcdTdBQ0JcdTVCOUVcdTczQjBcdUZGMENcdTkwN0ZcdTUxNERcdTVGQUFcdTczQUZcdTRGOURcdThENTZcdTMwMDJcbiAqL1xuXG5pbnRlcmZhY2UgUnVsZSB7XG4gIGtpbmQ6IHN0cmluZztcbiAgcmU6IFJlZ0V4cDtcbn1cblxuZnVuY3Rpb24gZXNjYXBlSHRtbChzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG59XG5cbi8qKlxuICogXHU2MjhBXHU2RTkwXHU3ODAxXHU2MzA5XHU4OUM0XHU1MjE5XHU2NTcwXHU3RUM0IHRva2VuaXplIFx1NjIxMFx1NUUyNiBobC1jbGFzcyBcdTc2ODQgSFRNTFx1MzAwMlxuICpcbiAqIC0gXHU4OUM0XHU1MjE5XHU2MzA5XHU2NTcwXHU3RUM0XHU5ODdBXHU1RThGXHU0RjE4XHU1MTQ4XHU3RUE3XHU1MjREXHU3RjAwXHU1MzM5XHU5MTREXHVGRjFCXHU0RTBEXHU1MzM5XHU5MTREXHU1MjE5XHU1RjUyXHU1MTY1XCJwbGFpblwiXHU2QkI1XHU4NDNEXHVGRjBDXHU3RURGXHU0RTAwXHU4RjZDXHU0RTQ5XHU1NDBFXHU4RjkzXHU1MUZBXHUzMDAyXG4gKiAtIFx1NjI0MFx1NjcwOSBSZWdFeHAgXHU1RkM1XHU5ODdCXHU2NjJGIHN0aWNreVx1RkYwOGB5YCBcdTY4MDdcdTVGRDdcdUZGMDlcdUZGMENsYXN0SW5kZXggXHU2MjREXHU0RjFBXHU4OEFCXHU1QzBBXHU5MUNEXHUzMDAyXG4gKi9cbmZ1bmN0aW9uIHRva2VuaXplKHNyYzogc3RyaW5nLCBydWxlczogUmVhZG9ubHlBcnJheTxSdWxlPik6IHN0cmluZyB7XG4gIGxldCBvdXQgPSAnJztcbiAgbGV0IHBsYWluID0gJyc7XG4gIGNvbnN0IGZsdXNoID0gKCk6IHZvaWQgPT4ge1xuICAgIGlmIChwbGFpbikge1xuICAgICAgb3V0ICs9IGVzY2FwZUh0bWwocGxhaW4pO1xuICAgICAgcGxhaW4gPSAnJztcbiAgICB9XG4gIH07XG4gIGxldCBpID0gMDtcbiAgd2hpbGUgKGkgPCBzcmMubGVuZ3RoKSB7XG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IHIgb2YgcnVsZXMpIHtcbiAgICAgIHIucmUubGFzdEluZGV4ID0gaTtcbiAgICAgIGNvbnN0IG0gPSByLnJlLmV4ZWMoc3JjKTtcbiAgICAgIGlmIChtICYmIG0uaW5kZXggPT09IGkpIHtcbiAgICAgICAgZmx1c2goKTtcbiAgICAgICAgb3V0ICs9IGA8c3BhbiBjbGFzcz1cImhsLSR7ci5raW5kfVwiPiR7ZXNjYXBlSHRtbChtWzBdKX08L3NwYW4+YDtcbiAgICAgICAgaSA9IHIucmUubGFzdEluZGV4O1xuICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghbWF0Y2hlZCkge1xuICAgICAgcGxhaW4gKz0gc3JjW2ldO1xuICAgICAgaSsrO1xuICAgIH1cbiAgfVxuICBmbHVzaCgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFx1NTQwNFx1OEJFRFx1OEEwMFx1ODlDNFx1NTIxOVx1ODg2OFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogSlMgLyBUUyBcdTg5QzRcdTUyMTlcdTMwMDJcdTZDRThcdTYxMEZcdUZGMUFcbiAqICAtIFx1NkNFOFx1OTFDQVx1MzAwMVx1NUI1N1x1N0IyNlx1NEUzMlx1MzAwMVx1NkEyMVx1Njc3Rlx1NUI1N1x1N0IyNlx1NEUzMlx1NjUzRVx1NjcwMFx1NTI0RFx1RkYwQ1x1OTA3Rlx1NTE0RFx1OTFDQ1x1OTc2Mlx1NzY4NFx1NTE3M1x1OTUyRVx1NUI1N1x1ODhBQlx1OEJFRlx1NjdEM1x1MzAwMlxuICogIC0gYHR5YFx1RkYwOFx1NTkyN1x1NTE5OVx1NUYwMFx1NTkzNFx1NjgwN1x1OEJDNlx1N0IyNlx1RkYwOVx1NjUzRVx1NTcyOCBgZm5gIFx1NTI0RFx1RkYwQ1x1OEJBOSBgTXlDbGFzcyguLi4pYCBcdTY3RDNcdTYyMTBcdTdDN0JcdTU3OEJcdTgyNzJcdTgwMENcdTRFMERcdTY2MkZcdTUxRkRcdTY1NzBcdTgyNzJcdTMwMDJcbiAqICAtIFx1NkEyMVx1Njc3Rlx1NUI1N1x1N0IyNlx1NEUzMlx1OTFDQ1x1NzY4NCBgJHtleHByfWAgXHU0RTBEXHU1MDVBXHU1RDRDXHU1OTU3XHU4OUUzXHU2NzkwXHVGRjBDXHU2NTc0XHU0RjUzXHU1RjUzXHU1QjU3XHU3QjI2XHU0RTMyXHU1OTA0XHU3NDA2XHVGRjA4XHU5NzYyXHU4QkQ1XHU5ODk4XHU0RUUzXHU3ODAxXHU1OTFGXHU3NTI4XHVGRjA5XHUzMDAyXG4gKi9cbmNvbnN0IEpTX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcL1teXFxuXSoveSB9LFxuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcKltcXHNcXFNdKj9cXCpcXC8veSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogL1wiKD86XFxcXC58W15cIlxcXFxcXG5dKSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJyg/OlxcXFwufFteJ1xcXFxcXG5dKSonL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9gKD86XFxcXC58W15gXFxcXF0pKmAveSB9LFxuICB7XG4gICAga2luZDogJ2t3JyxcbiAgICByZTogL1xcYig/OmNvbnN0fGxldHx2YXJ8ZnVuY3Rpb258Y2xhc3N8ZXh0ZW5kc3xpbXBsZW1lbnRzfGludGVyZmFjZXx0eXBlfGVudW18bmFtZXNwYWNlfGRlY2xhcmV8bW9kdWxlfGltcG9ydHxleHBvcnR8ZnJvbXxhc3xkZWZhdWx0fHJldHVybnxpZnxlbHNlfGZvcnx3aGlsZXxkb3xzd2l0Y2h8Y2FzZXxicmVha3xjb250aW51ZXxuZXd8ZGVsZXRlfHRoaXN8c3VwZXJ8dHlwZW9mfGluc3RhbmNlb2Z8aW58b2Z8dHJ5fGNhdGNofGZpbmFsbHl8dGhyb3d8YXN5bmN8YXdhaXR8eWllbGR8c3RhdGljfGdldHxzZXR8cHVibGljfHByaXZhdGV8cHJvdGVjdGVkfHJlYWRvbmx5fGFic3RyYWN0fG92ZXJyaWRlfHZvaWR8YW55fHVua25vd258bmV2ZXJ8d2l0aClcXGIveSxcbiAgfSxcbiAgeyBraW5kOiAnYm9vbCcsIHJlOiAvXFxiKD86dHJ1ZXxmYWxzZXxudWxsfHVuZGVmaW5lZHxOYU58SW5maW5pdHkpXFxiL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdudW0nLFxuICAgIHJlOiAvXFxiKD86MFt4WF1bMC05YS1mQS1GXSt8MFtiQl1bMDFdK3wwW29PXVswLTddK3xcXGQrKD86XFwuXFxkKyk/KD86W2VFXVsrLV0/XFxkKyk/KW4/XFxiL3ksXG4gIH0sXG4gIHsga2luZDogJ3R5JywgcmU6IC9cXGJbQS1aXVtcXHckXSpcXGIveSB9LFxuICB7IGtpbmQ6ICdmbicsIHJlOiAvXFxiW2EtekEtWl8kXVtcXHckXSooPz1cXHMqXFwoKS95IH0sXG5dO1xuXG4vKiogQ1NTIC8gU0NTUyAvIExFU1MgXHU4OUM0XHU1MjE5XHUzMDAyU2VsZWN0b3IgXHU0RTBEXHU1MDVBXHU3Q0JFXHU3RUM2XHU5QUQ4XHU0RUFFXHVGRjBDXHU5MUNEXHU3MEI5XHU1NzI4IHByb3AgLyB2YWx1ZSAvIFx1OTg5Q1x1ODI3Mlx1MzAwMiAqL1xuY29uc3QgQ1NTX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcKltcXHNcXFNdKj9cXCpcXC8veSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogL1wiKD86W15cIlxcXFxcXG5dfFxcXFwuKSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJyg/OlteJ1xcXFxcXG5dfFxcXFwuKSonL3kgfSxcbiAgeyBraW5kOiAndmFsJywgcmU6IC8jWzAtOWEtZkEtRl17Myw4fVxcYi95IH0sXG4gIHsga2luZDogJ2t3JywgcmU6IC9AW2EtekEtWi1dKy95IH0sXG4gIHsga2luZDogJ3Byb3AnLCByZTogLy0/W2EtekEtWl1bXFx3LV0qKD89XFxzKjopL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdudW0nLFxuICAgIHJlOiAvLT9cXGQrKD86XFwuXFxkKyk/KD86cHh8ZW18cmVtfCV8dmh8dnd8dm1pbnx2bWF4fHN8bXN8ZGVnfHJhZHx0dXJufGZyfHB0fHBjfGV4fGNoKT9cXGIveSxcbiAgfSxcbiAge1xuICAgIGtpbmQ6ICdib29sJyxcbiAgICByZTogL1xcYig/Om5vbmV8aW5oZXJpdHxpbml0aWFsfHVuc2V0fGF1dG98aW5saW5lfGJsb2NrfGZsZXh8Z3JpZHxhYnNvbHV0ZXxyZWxhdGl2ZXxmaXhlZHxzdGF0aWN8c3RpY2t5fGhpZGRlbnx2aXNpYmxlKVxcYi95LFxuICB9LFxuXTtcblxuLyoqIEhUTUwgLyBYTUwgXHU4OUM0XHU1MjE5XHUzMDAyYDxgIGA+YCBcdTg4QUJcdTdFQjNcdTUxNjUgdGFnIFx1NkJCNVx1NEVFNVx1OTA3Rlx1NTE0RFx1ODhBQiBlc2NhcGVIdG1sIFx1OEY2Q1x1NjIxMCAmbHQ7IFx1NTQwRVx1NEUyMlx1NTkzMVx1ODlDNlx1ODlDOVx1MzAwMiAqL1xuY29uc3QgSFRNTF9SVUxFUzogUmVhZG9ubHlBcnJheTxSdWxlPiA9IFtcbiAgeyBraW5kOiAnY29tJywgcmU6IC88IS0tW1xcc1xcU10qPy0tPi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCJbXlwiXFxuXSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJ1teJ1xcbl0qJy95IH0sXG4gIHsga2luZDogJ3RhZycsIHJlOiAvPFxcLz9bYS16QS1aXVtcXHctXSoveSB9LFxuICB7IGtpbmQ6ICd0YWcnLCByZTogL1xcLz8+L3kgfSxcbiAgeyBraW5kOiAnYXR0cicsIHJlOiAvXFxiW2EtekEtWl1bXFx3LV0qKD89PSkveSB9LFxuXTtcblxuLyoqIEpTT04gXHU4OUM0XHU1MjE5XHUzMDAya2V5IFx1NkJENCBzdHIgXHU0RjE4XHU1MTQ4XHU1MzM5XHU5MTREXHVGRjA4YFwieFwiYCBcdTU0MEVcdThEREYgYDpgIFx1NjYyRiBrZXlcdUZGMDlcdTMwMDIgKi9cbmNvbnN0IEpTT05fUlVMRVM6IFJlYWRvbmx5QXJyYXk8UnVsZT4gPSBbXG4gIHsga2luZDogJ2F0dHInLCByZTogL1wiKD86XFxcXC58W15cIlxcXFxdKSpcIig/PVxccyo6KS95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCIoPzpcXFxcLnxbXlwiXFxcXF0pKlwiL3kgfSxcbiAgeyBraW5kOiAnYm9vbCcsIHJlOiAvXFxiKD86dHJ1ZXxmYWxzZXxudWxsKVxcYi95IH0sXG4gIHsga2luZDogJ251bScsIHJlOiAvLT9cXGQrKD86XFwuXFxkKyk/KD86W2VFXVsrLV0/XFxkKyk/L3kgfSxcbl07XG5cbmNvbnN0IFBZX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogLyNbXlxcbl0qL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9cIlwiXCJbXFxzXFxTXSo/XCJcIlwiL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC8nJydbXFxzXFxTXSo/JycnL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9cIig/OlxcXFwufFteXCJcXFxcXFxuXSkqXCIveSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogLycoPzpcXFxcLnxbXidcXFxcXFxuXSkqJy95IH0sXG4gIHtcbiAgICBraW5kOiAna3cnLFxuICAgIHJlOiAvXFxiKD86ZGVmfGNsYXNzfHJldHVybnxpZnxlbGlmfGVsc2V8Zm9yfHdoaWxlfGJyZWFrfGNvbnRpbnVlfHBhc3N8aW1wb3J0fGZyb218YXN8dHJ5fGV4Y2VwdHxmaW5hbGx5fHJhaXNlfHdpdGh8eWllbGR8bGFtYmRhfGdsb2JhbHxub25sb2NhbHxpbnxpc3xub3R8YW5kfG9yfGFzeW5jfGF3YWl0KVxcYi95LFxuICB9LFxuICB7IGtpbmQ6ICdib29sJywgcmU6IC9cXGIoPzpUcnVlfEZhbHNlfE5vbmUpXFxiL3kgfSxcbiAgeyBraW5kOiAnbnVtJywgcmU6IC9cXGJcXGQrKD86XFwuXFxkKyk/XFxiL3kgfSxcbiAgeyBraW5kOiAnZm4nLCByZTogL1xcYlthLXpBLVpfXVxcdyooPz1cXHMqXFwoKS95IH0sXG5dO1xuXG5jb25zdCBTSF9SVUxFUzogUmVhZG9ubHlBcnJheTxSdWxlPiA9IFtcbiAgeyBraW5kOiAnY29tJywgcmU6IC8jW15cXG5dKi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCIoPzpcXFxcLnxbXlwiXFxcXF0pKlwiL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC8nW14nXSonL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdrdycsXG4gICAgcmU6IC9cXGIoPzppZnx0aGVufGVsc2V8ZWxpZnxmaXxmb3J8d2hpbGV8ZG98ZG9uZXxjYXNlfGVzYWN8aW58ZnVuY3Rpb258cmV0dXJufGV4cG9ydHxsb2NhbHxyZWFkb25seSlcXGIveSxcbiAgfSxcbiAgeyBraW5kOiAnZm4nLCByZTogL1xcJFxce1tefV0rXFx9fFxcJFxcdysveSB9LFxuXTtcblxuZnVuY3Rpb24gbGFuZ0tleShsYW5nOiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGxhbmcudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2pzJzpcbiAgICBjYXNlICdqc3gnOlxuICAgIGNhc2UgJ2phdmFzY3JpcHQnOlxuICAgIGNhc2UgJ3RzJzpcbiAgICBjYXNlICd0c3gnOlxuICAgIGNhc2UgJ3R5cGVzY3JpcHQnOlxuICAgICAgcmV0dXJuICdqcyc7XG4gICAgY2FzZSAnY3NzJzpcbiAgICBjYXNlICdzY3NzJzpcbiAgICBjYXNlICdsZXNzJzpcbiAgICAgIHJldHVybiAnY3NzJztcbiAgICBjYXNlICdodG1sJzpcbiAgICBjYXNlICd4bWwnOlxuICAgIGNhc2UgJ3Z1ZSc6XG4gICAgY2FzZSAnc3ZnJzpcbiAgICAgIHJldHVybiAnaHRtbCc7XG4gICAgY2FzZSAnanNvbic6XG4gICAgY2FzZSAnanNvbjUnOlxuICAgICAgcmV0dXJuICdqc29uJztcbiAgICBjYXNlICdweSc6XG4gICAgY2FzZSAncHl0aG9uJzpcbiAgICAgIHJldHVybiAncHknO1xuICAgIGNhc2UgJ3NoJzpcbiAgICBjYXNlICdiYXNoJzpcbiAgICBjYXNlICdzaGVsbCc6XG4gICAgY2FzZSAnenNoJzpcbiAgICAgIHJldHVybiAnc2gnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuLyoqXG4gKiBcdTUxNkNcdTUxNzFcdTUxNjVcdTUzRTNcdUZGMUFcdTYyOEEgYGNvZGVgIFx1NjMwOSBgbGFuZ2AgXHU2RTMyXHU2N0QzXHU0RTNBXHU1REYyXHU4RjZDXHU0RTQ5XHU3Njg0IEhUTUwgXHU1QjU3XHU3QjI2XHU0RTMyXHUzMDAyXG4gKlxuICogXHU4QzAzXHU3NTI4XHU2NUI5XHU2MkZGXHU1MjMwXHU3RUQzXHU2NzlDXHU1NDBFXHU3NkY0XHU2M0E1XHU2MkZDXHU1MjMwIGA8cHJlPjxjb2RlPi4uLjwvY29kZT48L3ByZT5gIFx1NTE4NVx1NTM3M1x1NTNFRlx1RkYwQ1x1NjVFMFx1OTcwMFx1NTE4RFx1NkIyMVx1OEY2Q1x1NEU0OVx1MzAwMlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGlnaGxpZ2h0KGNvZGU6IHN0cmluZywgbGFuZzogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChsYW5nS2V5KGxhbmcpKSB7XG4gICAgY2FzZSAnanMnOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIEpTX1JVTEVTKTtcbiAgICBjYXNlICdjc3MnOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIENTU19SVUxFUyk7XG4gICAgY2FzZSAnaHRtbCc6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgSFRNTF9SVUxFUyk7XG4gICAgY2FzZSAnanNvbic6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgSlNPTl9SVUxFUyk7XG4gICAgY2FzZSAncHknOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIFBZX1JVTEVTKTtcbiAgICBjYXNlICdzaCc6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgU0hfUlVMRVMpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZXNjYXBlSHRtbChjb2RlKTtcbiAgfVxufVxuIiwgIi8qKlxuICogXHU2NzgxXHU3QjgwIE1hcmtkb3duIFx1NkUzMlx1NjdEM1x1NTY2OFx1RkYwOHdlYnZpZXcgXHU3QUVGIGlubGluZSBcdTVCOUVcdTczQjBcdUZGMENcdTY1RTBcdTdCMkNcdTRFMDlcdTY1QjlcdTRGOURcdThENTZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTk4OThcdTVFOTNcdTUxODVcdTVCQjlcdTUzMDVcdTU0MkJcdTU5MjdcdTkxQ0YgTWFya2Rvd25cdUZGMUFcdTY4MDdcdTk4OThcdUZGMDhgI2AvYCMjYC4uLlx1RkYwOVx1MzAwMVx1N0M5N1x1NEY1M1x1RkYwOGAqKi4uLioqYFx1RkYwOVx1MzAwMVx1NEVFM1x1NzgwMVx1NTc1N1x1MzAwMVxuICogXHU1MjE3XHU4ODY4XHUzMDAxXHU4ODY4XHU2ODNDXHUzMDAxXHU1RjE1XHU3NTI4XHUzMDAxXHU1MjA2XHU1MjcyXHU3RUJGXHUzMDAxXHU5NEZFXHU2M0E1XHU3QjQ5XHUzMDAyV2VidmlldyBcdTVGQzVcdTk4N0JcdTYyOEFcdTVCODNcdTRFRUNcdTRFRTVcdTYzOTJcdTcyNDhcdTUzQ0JcdTU5N0RcdTc2ODQgSFRNTFxuICogXHU1NDQ4XHU3M0IwXHVGRjBDXHU1NDI2XHU1MjE5XHU1MzlGXHU2NTg3IGAqKmAgYFxcbmAgYCNgIFx1NEYxQVx1NzZGNFx1NjNBNVx1NjYzRVx1NzkzQVx1NTcyOFx1OTc2Mlx1Njc3Rlx1NEUwQVx1RkYwQ1x1NEY1M1x1OUE4Q1x1NUY4OFx1NURFRVx1MzAwMlxuICpcbiAqIFx1NzUzMVx1NEU4RSBWUyBDb2RlIFdlYnZpZXcgXHU3Njg0IENTUCBcdTlFRDhcdThCQTRcdTc5ODFcdTZCNjJcdTU5MTZcdTkwRThcdTgxMUFcdTY3MkNcdTRFMEVcdTY4MzdcdTVGMEZcdUZGMENcdTVGMTVcdTUxNjVcdTdCMkNcdTRFMDlcdTY1QjkgbWFya2Rvd25cbiAqIFx1NUU5M1x1NEYxQVx1OEJBOVx1Njc4NFx1NUVGQS9cdTYyNTNcdTUzMDUvXHU4RDQ0XHU2RTkwXHU1MkEwXHU4RjdEXHU2NkY0XHU1OTBEXHU2NzQyXHVGRjFCXHU2NzJDXHU2MjY5XHU1QzU1XHU0RTVGXHU0RTBEXHU5NzAwXHU4OTgxIEdGTSBcdTUxNjhcdTcyNzlcdTYwMjdcdUZGMENcdTU2RTBcdTZCNjRcdTgxRUFcdTUxOTlcdTRFMDBcdTRFMkFcbiAqIFwiXHU1OTFGXHU3NTI4XCIgXHU3Njg0XHU2RTMyXHU2N0QzXHU1NjY4XHVGRjBDXHU4OTg2XHU3NkQ2XHU1OTgyXHU0RTBCXHU1QjUwXHU5NkM2XHVGRjFBXG4gKlxuICogIC0gQVRYIFx1NjgwN1x1OTg5OCBgIyBIMWAgfiBgIyMjIyMjIEg2YFxuICogIC0gXHU2QkI1XHU4NDNEXHVGRjA4XHU1M0NDXHU2MzYyXHU4ODRDXHU0RjVDXHU1MjA2XHU5Njk0XHVGRjA5XG4gKiAgLSBcdTY1RTBcdTVFOEZcdTUyMTdcdTg4NjhcdUZGMDhgLWAgYCpgIGArYFx1RkYwOS8gXHU2NzA5XHU1RThGXHU1MjE3XHU4ODY4XHVGRjA4YDEuYFx1RkYwOVxuICogIC0gXHU1RjE1XHU3NTI4XHU1NzU3IGA+IC4uLmBcdUZGMDhcdTkwMTJcdTVGNTJcdTZFMzJcdTY3RDNcdTUxODVcdTkwRTggbWFya2Rvd25cdUZGMDlcbiAqICAtIFx1NTZGNFx1NjgwRlx1NEVFM1x1NzgwMVx1NTc1NyBgYGAgbGFuZyAuLi4gYGBgXHVGRjA4XHU4QkVEXHU4QTAwXHU0RkUxXHU2MDZGXHU1M0VBXHU1M0Q2XHU5OTk2XHU2QkI1XHVGRjBDXHU1RkZEXHU3NTY1IGBpZD1cIi4uLlwiYCBcdTdCNDlcdTUxNDNcdTY1NzBcdTYzNkVcdUZGMDlcbiAqICAtIFx1NTIwNlx1NTI3Mlx1N0VCRiBgLS0tYCAvIGAqKipgXG4gKiAgLSBcdTdCODBcdTUzNTVcdTdCQTFcdTkwNTNcdTg4NjhcdTY4M0MgYHwgaCB8IGggfFxcbnwgLSB8IC0gfFxcbnwgYyB8IGMgfGBcbiAqICAtIFx1ODg0Q1x1NTE4NVx1RkYxQWBjb2RlYFx1MzAwMSoqYm9sZCoqXHUzMDAxKml0YWxpYypcdTMwMDFbbGlua10odXJsKVx1MzAwMWA8Y29kZT5gIFx1NURGMlx1ODhBQlx1OEY2Q1x1NEU0OVxuICpcbiAqIFx1NjI0MFx1NjcwOVx1NzUyOFx1NjIzN1x1NjU4N1x1NjcyQ1x1OEZEQlx1NTE2NVx1NkUzMlx1NjdEM1x1NTY2OFx1NEU0Qlx1NTI0RFx1OTBGRFx1NEYxQVx1NTE0OFx1NTA1QSBIVE1MIFx1OEY2Q1x1NEU0OVx1RkYxQlx1NTcyOFx1OEY2Q1x1NEU0OVx1NTQwRVx1NzY4NFx1NjU4N1x1NjcyQ1x1NEUwQVx1NTA1QVx1NkI2M1x1NTIxOVx1NjZGRlx1NjM2Mlx1RkYwQ1xuICogXHU2NUUyXHU5MDdGXHU1MTREIFhTU1x1RkYwOHdlYnZpZXcgXHU1MTg1XHU1MzczXHU0RkJGXHU2NzA5IHZzY29kZS1hcGkgXHU0RTVGXHU0RTBEXHU1RTBDXHU2NzFCXHU2MjY3XHU4ODRDXHU2Q0U4XHU1MTY1XHVGRjA5XHVGRjBDXHU1M0M4XHU0RkREXHU4QkMxXHU0RUUzXHU3ODAxXHU1NzU3XG4gKiBcdTUxODVcdTc2ODQgYDxgIGA+YCBgJmAgXHU1MzlGXHU2ODM3XHU1QzU1XHU3OTNBXHUzMDAyXG4gKlxuICogXHU4QkU1XHU2QTIxXHU1NzU3XHU0RTBEXHU0RjlEXHU4RDU2IERPTVx1RkYxQlx1OEMwM1x1NzUyOFx1NjVCOVx1NjJGRlx1NTIzMFx1NUI1N1x1N0IyNlx1NEUzMlx1NTQwRVx1OEQ0Qlx1NTAzQ1x1N0VEOSBgaW5uZXJIVE1MYFx1MzAwMlxuICpcbiAqIFx1NEVFM1x1NzgwMVx1NTc1N1x1NzY4NFx1OEJFRFx1NkNENVx1Nzc0MFx1ODI3Mlx1NTlENFx1NjI1OFx1N0VEOSBgaGlnaGxpZ2h0LnRzYFx1RkYxQVx1NTcyOFx1NTZGNFx1NjgwRlx1NEVFM1x1NzgwMVx1NTc1N1x1NkUzMlx1NjdEM1x1NTkwNFx1OEMwM1x1NzUyOFxuICogYGhpZ2hsaWdodChjb2RlLCBsYW5nKWAgXHU3NkY0XHU2M0E1XHU2MkZGXHU1MjMwXHU1REYyXHU4RjZDXHU0RTQ5XHU0RTE0XHU1MzA1XHU0RTg2IGA8c3BhbiBjbGFzcz1cImhsLSpcIj5gIFx1NzY4NCBIVE1MXHVGRjBDXG4gKiBcdTU2RTBcdTZCNjRcdTY3MkNcdTY1ODdcdTRFRjZcdTVCRjlcdTRFRTNcdTc4MDFcdTU3NTdcdTUxODVcdTVCQjlcdTRFMERcdTUxOERcdTRFOENcdTZCMjEgZXNjYXBlSHRtbFx1MzAwMlxuICovXG5cbmltcG9ydCB7IGhpZ2hsaWdodCB9IGZyb20gJy4vaGlnaGxpZ2h0LmpzJztcblxuLyoqIFx1NjI4QVx1NUI1N1x1N0IyNlx1NEUzMlx1OEY2Q1x1NEU0OVx1NEUzQVx1NUI4OVx1NTE2OFx1NzY4NCBIVE1MIFx1NjU4N1x1NjcyQ1x1ODI4Mlx1NzBCOVx1NTE4NVx1NUJCOVx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xufVxuXG4vKiogXHU2MjhBIG1hcmtkb3duIFx1NUI1N1x1N0IyNlx1NEUzMlx1NkUzMlx1NjdEM1x1NEUzQSBIVE1MIFx1NUI1N1x1N0IyNlx1NEUzMlx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlck1hcmtkb3duKHNyYzogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghc3JjKSByZXR1cm4gJyc7XG4gIHJldHVybiBibG9ja1JlbmRlcihub3JtYWxpemVOZXdsaW5lcyhzcmMpKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBcdTUxODVcdTkwRThcdTVCOUVcdTczQjBcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBub3JtYWxpemVOZXdsaW5lcyhzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcy5yZXBsYWNlKC9cXHJcXG4/L2csICdcXG4nKTtcbn1cblxuLyoqXG4gKiBcdTU3NTdcdTdFQTdcdTZFMzJcdTY3RDNcdTMwMDJcdTkwMTBcdTg4NENcdTYyNkJcdTYzQ0ZcdUZGMENcdTY4MzlcdTYzNkVcdTg4NENcdTk5OTZcdTcyNzlcdTVGODFcdTUxQjNcdTVCOUFcdTU3NTdcdTdDN0JcdTU3OEJcdUZGMUJcdTZCQjVcdTg0M0RcdTc1MzFcdTdBN0FcdTg4NENcdTUyMDZcdTk2OTRcdTMwMDJcbiAqXG4gKiBcdTVCOUVcdTczQjBcdTYyMTBcdTY3MDlcdTk2NTBcdTcyQjZcdTYwMDFcdTYyNkJcdTYzQ0ZcdUZGMENcdTRGQkZcdTRFOEVcdTU3MjhcdTRFMERcdTVGMTVcdTUxNjUgdG9rZW4gXHU3QzdCXHU3Njg0XHU1MjREXHU2M0QwXHU0RTBCXHU0RkREXHU2MzAxXHU3RUJGXHU2MDI3XHU1OTBEXHU2NzQyXHU1RUE2XHUzMDAyXG4gKi9cbmZ1bmN0aW9uIGJsb2NrUmVuZGVyKHNyYzogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBzcmMuc3BsaXQoJ1xcbicpO1xuICBjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG4gIGxldCBpID0gMDtcbiAgbGV0IHBhcmFncmFwaDogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGxpc3RLaW5kOiAndWwnIHwgJ29sJyB8IG51bGwgPSBudWxsO1xuICBjb25zdCBsaXN0SXRlbXM6IHN0cmluZ1tdID0gW107XG5cbiAgY29uc3QgZmx1c2hQYXJhZ3JhcGggPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKHBhcmFncmFwaC5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBvdXQucHVzaChgPHA+JHtpbmxpbmVSZW5kZXIocGFyYWdyYXBoLmpvaW4oJyAnKSl9PC9wPmApO1xuICAgIHBhcmFncmFwaCA9IFtdO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoTGlzdCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAobGlzdEtpbmQgPT09IG51bGwpIHJldHVybjtcbiAgICBvdXQucHVzaChgPCR7bGlzdEtpbmR9PiR7bGlzdEl0ZW1zLmpvaW4oJycpfTwvJHtsaXN0S2luZH0+YCk7XG4gICAgbGlzdEl0ZW1zLmxlbmd0aCA9IDA7XG4gICAgbGlzdEtpbmQgPSBudWxsO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoQWxsID0gKCk6IHZvaWQgPT4ge1xuICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgZmx1c2hMaXN0KCk7XG4gIH07XG5cbiAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV0gPz8gJyc7XG5cbiAgICAvLyBcdTU2RjRcdTY4MEZcdTRFRTNcdTc4MDFcdTU3NTdcbiAgICBjb25zdCBmZW5jZSA9IC9eYGBgXFxzKihbXlxcc2BdKikvLmV4ZWMobGluZSk7XG4gICAgaWYgKGZlbmNlKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgY29uc3QgbGFuZ1JhdyA9IGZlbmNlWzFdID8/ICcnO1xuICAgICAgLy8gXHU1M0Q2XHU5OTk2XHU0RTJBXHU3QTdBXHU3NjdEXHU1MjREXHU3Njg0XHU5MEU4XHU1MjA2XHU0RjVDXHU0RTNBXHU4QkVEXHU4QTAwXHVGRjBDXHU1RkZEXHU3NTY1IGBpZD1cInowXCJgIFx1N0I0OVx1OTg5RFx1NTkxNlx1NjgwN1x1OEJCMFxuICAgICAgY29uc3QgbGFuZyA9IGxhbmdSYXcuc3BsaXQoL1xccy8pWzBdID8/ICcnO1xuICAgICAgY29uc3QgY29kZUxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaSsrO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgIS9eYGBgXFxzKiQvLnRlc3QobGluZXNbaV0gPz8gJycpKSB7XG4gICAgICAgIGNvZGVMaW5lcy5wdXNoKGxpbmVzW2ldID8/ICcnKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgLy8gXHU4REYzXHU4RkM3XHU3RUQzXHU2NzVGXHU1NkY0XHU2ODBGXHVGRjA4XHU4MkU1XHU2NTg3XHU0RUY2XHU2NzJCXHU1QzNFXHU2NUUwXHU3RUQzXHU2NzVGXHU3QjI2XHU0RTVGXHU1QkI5XHU1RkNEXHVGRjA5XG4gICAgICBpZiAoaSA8IGxpbmVzLmxlbmd0aCkgaSsrO1xuICAgICAgY29uc3QgbGFuZ0NsYXNzID0gbGFuZyA/IGAgY2xhc3M9XCJsYW5nLSR7ZXNjYXBlQXR0cihsYW5nKX1cImAgOiAnJztcbiAgICAgIG91dC5wdXNoKFxuICAgICAgICBgPHByZT48Y29kZSR7bGFuZ0NsYXNzfT4ke2hpZ2hsaWdodChjb2RlTGluZXMuam9pbignXFxuJyksIGxhbmcpfTwvY29kZT48L3ByZT5gLFxuICAgICAgKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIFx1NjgwN1x1OTg5OFxuICAgIGNvbnN0IGhlYWRpbmcgPSAvXigjezEsNn0pXFxzKyguKikkLy5leGVjKGxpbmUpO1xuICAgIGlmIChoZWFkaW5nKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgY29uc3QgbGV2ZWwgPSAoaGVhZGluZ1sxXSA/PyAnJykubGVuZ3RoO1xuICAgICAgb3V0LnB1c2goYDxoJHtsZXZlbH0+JHtpbmxpbmVSZW5kZXIoaGVhZGluZ1syXSA/PyAnJyl9PC9oJHtsZXZlbH0+YCk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBcdTUyMDZcdTUyNzJcdTdFQkZcbiAgICBpZiAoL15cXHMqKFstKl9dKVxcMXsyLH1cXHMqJC8udGVzdChsaW5lKSkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIG91dC5wdXNoKCc8aHIvPicpO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU1RjE1XHU3NTI4XHU1NzU3XHVGRjA4XHU4RkRFXHU3RUVEXHU3Njg0IGA+YCBcdTg4NENcdUZGMDlcbiAgICBpZiAoL15cXHMqPi8udGVzdChsaW5lKSkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGNvbnN0IHF1b3RlTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICB3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiAvXlxccyo+Ly50ZXN0KGxpbmVzW2ldID8/ICcnKSkge1xuICAgICAgICBxdW90ZUxpbmVzLnB1c2goKGxpbmVzW2ldID8/ICcnKS5yZXBsYWNlKC9eXFxzKj5cXHM/LywgJycpKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgb3V0LnB1c2goYDxibG9ja3F1b3RlPiR7YmxvY2tSZW5kZXIocXVvdGVMaW5lcy5qb2luKCdcXG4nKSl9PC9ibG9ja3F1b3RlPmApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU4ODY4XHU2ODNDXHVGRjFBXHU4ODY4XHU1OTM0XHU4ODRDICsgXHU1MjA2XHU5Njk0XHU4ODRDICsgXHU0RUZCXHU2MTBGXHU2NTcwXHU2MzZFXHU4ODRDXG4gICAgaWYgKFxuICAgICAgaXNUYWJsZVJvdyhsaW5lKSAmJlxuICAgICAgaSArIDEgPCBsaW5lcy5sZW5ndGggJiZcbiAgICAgIGlzVGFibGVTZXBhcmF0b3IobGluZXNbaSArIDFdID8/ICcnKVxuICAgICkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGNvbnN0IGhlYWRlckNlbGxzID0gcGFyc2VUYWJsZVJvdyhsaW5lKTtcbiAgICAgIGkgKz0gMjsgLy8gXHU4REYzXHU4RkM3XHU4ODY4XHU1OTM0XHU0RTBFXHU1MjA2XHU5Njk0XHU3QjI2XG4gICAgICBjb25zdCBib2R5Um93czogc3RyaW5nW11bXSA9IFtdO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgaXNUYWJsZVJvdyhsaW5lc1tpXSA/PyAnJykpIHtcbiAgICAgICAgYm9keVJvd3MucHVzaChwYXJzZVRhYmxlUm93KGxpbmVzW2ldID8/ICcnKSk7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgICAgIGxldCB0YWJsZSA9ICc8dGFibGU+PHRoZWFkPjx0cj4nO1xuICAgICAgZm9yIChjb25zdCBjIG9mIGhlYWRlckNlbGxzKSB0YWJsZSArPSBgPHRoPiR7aW5saW5lUmVuZGVyKGMpfTwvdGg+YDtcbiAgICAgIHRhYmxlICs9ICc8L3RyPjwvdGhlYWQ+PHRib2R5Pic7XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiBib2R5Um93cykge1xuICAgICAgICB0YWJsZSArPSAnPHRyPic7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiByb3cpIHRhYmxlICs9IGA8dGQ+JHtpbmxpbmVSZW5kZXIoYyl9PC90ZD5gO1xuICAgICAgICB0YWJsZSArPSAnPC90cj4nO1xuICAgICAgfVxuICAgICAgdGFibGUgKz0gJzwvdGJvZHk+PC90YWJsZT4nO1xuICAgICAgb3V0LnB1c2godGFibGUpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU2NUUwXHU1RThGIC8gXHU2NzA5XHU1RThGXHU1MjE3XHU4ODY4XG4gICAgY29uc3QgdWwgPSAvXlxccypbLSorXVxccysoLiopJC8uZXhlYyhsaW5lKTtcbiAgICBjb25zdCBvbCA9IC9eXFxzKlxcZCtcXC5cXHMrKC4qKSQvLmV4ZWMobGluZSk7XG4gICAgaWYgKHVsIHx8IG9sKSB7XG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xuICAgICAgY29uc3Qga2luZDogJ3VsJyB8ICdvbCcgPSB1bCA/ICd1bCcgOiAnb2wnO1xuICAgICAgaWYgKGxpc3RLaW5kICE9PSBudWxsICYmIGxpc3RLaW5kICE9PSBraW5kKSB7XG4gICAgICAgIGZsdXNoTGlzdCgpO1xuICAgICAgfVxuICAgICAgbGlzdEtpbmQgPSBraW5kO1xuICAgICAgY29uc3QgdGV4dCA9ICh1bCA/IHVsWzFdIDogb2w/LlsxXSkgPz8gJyc7XG4gICAgICBsaXN0SXRlbXMucHVzaChgPGxpPiR7aW5saW5lUmVuZGVyKHRleHQpfTwvbGk+YCk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBcdTdBN0FcdTg4NENcdUZGMUFcdTZCQjVcdTg0M0RcdTUyMDZcdTk2OTRcbiAgICBpZiAobGluZS50cmltKCkgPT09ICcnKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU2NjZFXHU5MDFBXHU2QkI1XHU4NDNEXHU4ODRDXG4gICAgZmx1c2hMaXN0KCk7XG4gICAgcGFyYWdyYXBoLnB1c2gobGluZSk7XG4gICAgaSsrO1xuICB9XG5cbiAgZmx1c2hBbGwoKTtcbiAgcmV0dXJuIG91dC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gaXNUYWJsZVJvdyhsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eXFxzKlxcfC4qXFx8XFxzKiQvLnRlc3QobGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzVGFibGVTZXBhcmF0b3IobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAvXlxccypcXHw/XFxzKjo/LXsyLH06P1xccyooXFx8XFxzKjo/LXsyLH06P1xccyopK1xcfD9cXHMqJC8udGVzdChsaW5lKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VUYWJsZVJvdyhsaW5lOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGxldCBzID0gbGluZS50cmltKCk7XG4gIGlmIChzLnN0YXJ0c1dpdGgoJ3wnKSkgcyA9IHMuc2xpY2UoMSk7XG4gIGlmIChzLmVuZHNXaXRoKCd8JykpIHMgPSBzLnNsaWNlKDAsIC0xKTtcbiAgcmV0dXJuIHMuc3BsaXQoJ3wnKS5tYXAoKGMpID0+IGMudHJpbSgpKTtcbn1cblxuLyoqIFx1ODg0Q1x1NTE4NVx1NkUzMlx1NjdEM1x1RkYxQVx1NTE0OFx1OEY2Q1x1NEU0OVx1RkYwQ1x1NTE4RFx1NTkwNFx1NzQwNiBpbmxpbmUgY29kZVx1RkYwOFx1NTM2MFx1NEY0RFx1NEZERFx1NjJBNFx1RkYwOVx1RkYwQ1x1NTE4RFx1NTkwNFx1NzQwNlx1NTE3Nlx1NEY1OVx1NjgwN1x1OEJCMFx1MzAwMiAqL1xuZnVuY3Rpb24gaW5saW5lUmVuZGVyKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBvdXQgPSBlc2NhcGVIdG1sKHMpO1xuXG4gIC8vIDEpIFx1ODg0Q1x1NTE4NVx1NEVFM1x1NzgwMVx1RkYxQVx1NzUyOFx1NTM2MFx1NEY0RFx1N0IyNlx1NjZGRlx1NjM2Mlx1NEVFNVx1OTA3Rlx1NTE0RFx1ODhBQlx1NTQwRVx1N0VFRFx1ODlDNFx1NTIxOVx1OEJFRlx1NEYyNFxuICBjb25zdCBjb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgb3V0ID0gb3V0LnJlcGxhY2UoL2AoW15gXFxuXSs/KWAvZywgKF8sIGNvZGU6IHN0cmluZykgPT4ge1xuICAgIGNvZGVzLnB1c2goYDxjb2RlPiR7Y29kZX08L2NvZGU+YCk7XG4gICAgcmV0dXJuIGBcXHUwMDAwQyR7Y29kZXMubGVuZ3RoIC0gMX1cXHUwMDAwYDtcbiAgfSk7XG5cbiAgLy8gMikgXHU5NEZFXHU2M0E1IFt0ZXh0XSh1cmwpIFx1MjAxNFx1MjAxNCBcdTRFQzVcdTUxNDFcdThCQjggaHR0cC9odHRwcy9tYWlsdG8gXHU0RTBFXHU3NkY4XHU1QkY5XHU4REVGXHU1Rjg0XHVGRjBDXHU4OUM0XHU5MDdGIGphdmFzY3JpcHQ6XG4gIG91dCA9IG91dC5yZXBsYWNlKFxuICAgIC9cXFsoW15cXF1dKylcXF1cXCgoW14pXSspXFwpL2csXG4gICAgKF8sIHRleHQ6IHN0cmluZywgaHJlZjogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBzYWZlID0gc2FuaXRpemVIcmVmKGhyZWYpO1xuICAgICAgcmV0dXJuIGA8YSBocmVmPVwiJHtzYWZlfVwiIHRhcmdldD1cIl9ibGFua1wiIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIj4ke3RleHR9PC9hPmA7XG4gICAgfSxcbiAgKTtcblxuICAvLyAzKSBcdTUyQTBcdTdDOTcgKyBcdTY1OUNcdTRGNTMgLyBcdTUyQTBcdTdDOTcgLyBcdTY1OUNcdTRGNTNcdUZGMDhcdTk4N0FcdTVFOEZcdTRFMERcdTgwRkRcdTk4QTBcdTUwMTJcdUZGMDlcbiAgb3V0ID0gb3V0LnJlcGxhY2UoL1xcKlxcKlxcKihbXipdKz8pXFwqXFwqXFwqL2csICc8c3Ryb25nPjxlbT4kMTwvZW0+PC9zdHJvbmc+Jyk7XG4gIG91dCA9IG91dC5yZXBsYWNlKC9cXCpcXCooW14qXSs/KVxcKlxcKi9nLCAnPHN0cm9uZz4kMTwvc3Ryb25nPicpO1xuICAvLyBcdTY1OUNcdTRGNTNcdUZGMUFcdTkwN0ZcdTUxNERcdTU0MUVcdTYzODlcdTYyMTBcdTVCRjlcdTUyQTBcdTdDOTdcdTc2ODRcdTUyNjlcdTRGNTkgYCpgXHVGRjBDXHU4OTgxXHU2QzQyXHU1REU2XHU1M0YzXHU5NzVFIGAqYFxuICBvdXQgPSBvdXQucmVwbGFjZSgvKF58W14qXSlcXCooW14qXFxuXSs/KVxcKig/IVxcKikvZywgJyQxPGVtPiQyPC9lbT4nKTtcblxuICAvLyA0KSBcdThGRDhcdTUzOUYgaW5saW5lIGNvZGUgXHU1MzYwXHU0RjREXG4gIG91dCA9IG91dC5yZXBsYWNlKC9cXHUwMDAwQyhcXGQrKVxcdTAwMDAvZywgKF8sIGlkeDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgaSA9IE51bWJlcihpZHgpO1xuICAgIHJldHVybiBjb2Rlc1tpXSA/PyAnJztcbiAgfSk7XG5cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVIcmVmKGhyZWY6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRyaW1tZWQgPSBocmVmLnRyaW0oKTtcbiAgaWYgKC9eKGh0dHBzPzp8bWFpbHRvOnwjfFxcL3xcXC5cXC4/XFwvKS9pLnRlc3QodHJpbW1lZCkpIHtcbiAgICByZXR1cm4gZXNjYXBlQXR0cih0cmltbWVkKTtcbiAgfVxuICAvLyBcdTRFMERcdThCQzZcdTUyMkJcdTc2ODRcdTUzNEZcdThCQUVcdUZGMDhcdTU0MkIgamF2YXNjcmlwdDpcdUZGMDlcdTRFMDBcdTVGOEJcdTk2NERcdTdFQTdcdTRFM0FcdTk1MUFcdTcwQjlcdUZGMENcdTkwN0ZcdTUxNERcdTgxMUFcdTY3MkNcdTYyNjdcdTg4NENcbiAgcmV0dXJuICcjJztcbn1cblxuZnVuY3Rpb24gZXNjYXBlQXR0cihzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xufVxuIiwgIi8qKlxuICogV2VidmlldyBcdTdBRUZcdTUxNjVcdTUzRTNcdUZGMDhQcmFjdGljZSBcdTk3NjJcdTY3N0ZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTU3Mjggd2VidmlldyBpZnJhbWUgXHU1MTg1XHU4RkQwXHU4ODRDXHVGRjBDXHU5MDFBXHU4RkM3IGBhY3F1aXJlVnNDb2RlQXBpKClgIFx1NEUwRVx1NjI2OVx1NUM1NVx1OEZEQlx1N0EwQlx1OTAxQVx1NEZFMVx1MzAwMlxuICpcbiAqIFVJIFx1N0VEM1x1Njc4NFx1RkYwOFx1NEUwRSBwYW5lbC50cyBcdTUxODVcdTVENEMgSFRNTCBcdTU0MENcdTZCNjVcdUZGMDlcdUZGMUFcbiAqICAgLSAucS1oZWFkXHVGRjA4bWV0YSBcdTVGQkRcdTdBRTAgKyBcdTY4MDdcdTk4OTggKyBcdTY1MzZcdTg1Q0ZcdTYzMDlcdTk0QUVcdUZGMDlcbiAqICAgLSAjcXVlc3Rpb24tY29udGVudC5tZFx1RkYwOFx1OTg5OFx1OTc2MiBtYXJrZG93biBcdTZFMzJcdTY3RDNcdUZGMDlcbiAqICAgLSAjdGVzdC1jYXNlc1x1RkYwOFx1NEVDNVx1NEVFM1x1NzgwMVx1OTg5OFx1RkYwOVxuICogICAtIC5hbnN3ZXItdG9nZ2xlID4gI2J0bi1zaG93LWFuc3dlclx1RkYwOFx1NzBCOVx1NTFGQlx1NUM1NVx1NUYwMFx1N0I1NFx1Njg0OFx1RkYxQlx1NUM1NVx1NUYwMFx1NTQwRVx1NjU3NFx1NEY1M1x1OTY5MFx1ODVDRlx1RkYwOVxuICogICAtICNhbnN3ZXItYXJlYVx1RkYwOFx1NTQyQiAjYnRuLWNvbGxhcHNlLWFuc3dlciBcdTU3MDZcdTVGNjIgXHUyMTkxIFx1NjMwOVx1OTRBRSArICNhbnN3ZXItY29udGVudFx1RkYwOVxuICogICAtICNmb2xsb3ctdXBzXHVGRjA4XHU5NUVFXHU3QjU0XHU5ODk4XHU4RkZEXHU5NUVFXHVGRjA5XG4gKlxuICogXHU2RTMyXHU2N0QzXHU3QjU2XHU3NTY1XHVGRjFBXHU5ODk4XHU5NzYyIC8gXHU4QkU2XHU3RUM2XHU4OUUzXHU2NzkwIC8gXHU3QjgwXHU3QjU0IC8gXHU4RkZEXHU5NUVFXHU3QjU0XHU2ODQ4XHU1NzQ3XHU4RDcwIGByZW5kZXJNYXJrZG93bmBcdUZGMENcbiAqIFx1NTE3Nlx1NEY1OVx1NzdFRFx1NUI1N1x1N0IyNlx1NEUzMlx1NUI1N1x1NkJCNVx1OEQ3MCBgZXNjYXBlSHRtbGBcdUZGMUJcdTRFRTNcdTc4MDFcdTk4OThcdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDhcdThENzAgYGhpZ2hsaWdodCgpYCBcdTc3NDBcdTgyNzJcdTMwMDJcbiAqL1xuXG5pbXBvcnQgeyBoaWdobGlnaHQgfSBmcm9tICcuL2hpZ2hsaWdodC5qcyc7XG5pbXBvcnQgeyBlc2NhcGVIdG1sLCByZW5kZXJNYXJrZG93biB9IGZyb20gJy4vbWFya2Rvd24uanMnO1xuXG5kZWNsYXJlIGZ1bmN0aW9uIGFjcXVpcmVWc0NvZGVBcGkoKToge1xuICBwb3N0TWVzc2FnZShtc2c6IHVua25vd24pOiB2b2lkO1xuICBnZXRTdGF0ZSgpOiB1bmtub3duO1xuICBzZXRTdGF0ZShzdGF0ZTogdW5rbm93bik6IHZvaWQ7XG59O1xuXG5pbnRlcmZhY2UgSG9zdFRvV2Vidmlld01lc3NhZ2Uge1xuICB0eXBlOiBzdHJpbmc7XG4gIHBheWxvYWQ/OiB1bmtub3duO1xuICBvaz86IGJvb2xlYW47XG4gIHJlYXNvbj86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIExlYXJuaW5nU3RhdGUge1xuICBtYXN0ZXJ5OiAndW5sZWFybmVkJyB8ICdsZWFybmluZycgfCAnbWFzdGVyZWQnIHwgJ25vdF9tYXN0ZXJlZCc7XG4gIGZhdm9yaXRlRmxhZzogYm9vbGVhbjtcbiAgd3JvbmdGbGFnOiBib29sZWFuO1xuICBoYXNOb3RlOiBib29sZWFuO1xuICBsYXN0UHJhY3RpY2VkQXQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBRdWVzdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdjb2RlJyB8ICdxYSc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgdGFnczogc3RyaW5nW107XG4gIGRpZmZpY3VsdHk6ICdlYXN5JyB8ICdtZWRpdW0nIHwgJ2hhcmQnIHwgc3RyaW5nO1xuICBsYW5ndWFnZT86IHN0cmluZztcbiAgYW5zd2VyOiBzdHJpbmc7XG4gIHRlc3RDYXNlcz86IEFycmF5PHtcbiAgICBuYW1lPzogc3RyaW5nO1xuICAgIGlucHV0Pzogc3RyaW5nO1xuICAgIGV4cGVjdGVkPzogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICB9PjtcbiAgZm9sbG93VXBzPzogQXJyYXk8eyBxdWVzdGlvbjogc3RyaW5nOyBhbnN3ZXI/OiBzdHJpbmcgfT47XG59XG5cbmNvbnN0IHZzY29kZSA9IGFjcXVpcmVWc0NvZGVBcGkoKTtcblxubGV0IGN1cnJlbnRRdWVzdGlvbjogUXVlc3Rpb24gfCB1bmRlZmluZWQ7XG5cbmZ1bmN0aW9uICQoaWQ6IHN0cmluZyk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG59XG5cbmZ1bmN0aW9uIGRpZmZpY3VsdHlMYWJlbChkOiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGQpIHtcbiAgICBjYXNlICdlYXN5JzpcbiAgICAgIHJldHVybiAnXHU3QjgwXHU1MzU1JztcbiAgICBjYXNlICdtZWRpdW0nOlxuICAgICAgcmV0dXJuICdcdTRFMkRcdTdCNDknO1xuICAgIGNhc2UgJ2hhcmQnOlxuICAgICAgcmV0dXJuICdcdTU2RjBcdTk2QkUnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZDtcbiAgfVxufVxuXG5mdW5jdGlvbiBkaWZmaWN1bHR5Q2xhc3MoZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChkKSB7XG4gICAgY2FzZSAnZWFzeSc6XG4gICAgICByZXR1cm4gJ2RpZmYtZWFzeSc7XG4gICAgY2FzZSAnbWVkaXVtJzpcbiAgICAgIHJldHVybiAnZGlmZi1tZWRpdW0nO1xuICAgIGNhc2UgJ2hhcmQnOlxuICAgICAgcmV0dXJuICdkaWZmLWhhcmQnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuLyoqXG4gKiBcdTkxQ0RcdTdGNkVcdTdCNTRcdTY4NDhcdTUzM0FcdTUyMzBcIlx1NjcyQVx1NUM1NVx1NUYwMFwiXHU3MkI2XHU2MDAxXHUzMDAyXG4gKlxuICogXHU2Q0U4XHU2MTBGXHU1M0VBXHU2RTA1XHU3QTdBIGAjYW5zd2VyLWNvbnRlbnRgIFx1ODAwQ1x1NEUwRFx1NjYyRiBgI2Fuc3dlci1hcmVhYFx1RkYwQ1x1NTZFMFx1NEUzQVx1NTQwRVx1ODAwNVx1OEZEOFx1NTMwNVx1NTQyQlxuICogXHU2NTM2XHU4RDc3XHU2MzA5XHU5NEFFIGAjYnRuLWNvbGxhcHNlLWFuc3dlcmBcdUZGMENcdTY1NzRcdTRGNTNcdTZFMDVcdTdBN0FcdTRGMUFcdTRFMjJcdTU5MzFcdTYzMDlcdTk0QUVcdTMwMDJcbiAqL1xuZnVuY3Rpb24gaGlkZUFuc3dlclNlY3Rpb24oKTogdm9pZCB7XG4gIGNvbnN0IGFyZWEgPSAkKCdhbnN3ZXItYXJlYScpO1xuICBpZiAoYXJlYSkgYXJlYS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgY29uc3QgY29udGVudCA9ICQoJ2Fuc3dlci1jb250ZW50Jyk7XG4gIGlmIChjb250ZW50KSBjb250ZW50LmlubmVySFRNTCA9ICcnO1xuICBjb25zdCBmb2xsb3dVcHNFbCA9ICQoJ2ZvbGxvdy11cHMnKTtcbiAgaWYgKGZvbGxvd1Vwc0VsKSBmb2xsb3dVcHNFbC5pbm5lckhUTUwgPSAnJztcbiAgLy8gbWFzdGVyeS1mYWIgXHU1NzI4XHU3QjU0XHU2ODQ4XHU1QzU1XHU1RjAwXHU2NUY2XHU4OEFCXHU3OUZCXHU1MjMwIC5hbnN3ZXItYWN0aW9uc1x1RkYwQ1x1OEZEOVx1OTFDQ1x1ODk4MVx1NjI4QVx1NUI4M1x1NjQyQ1x1NTZERVx1NTIzMCAuYW5zd2VyLXRvZ2dsZVxuICAvLyBcdTk4NzZcdTkwRThcdTRGNERcdTdGNkVcdUZGMUJcdThGRDlcdTY4MzdcdTY3MkFcdTVDNTVcdTVGMDBcdTcyQjZcdTYwMDFcdTRFMEJcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTYzMDlcdTk0QUVcdTU5Q0JcdTdFQzhcdTU3MjggXCJcdTY3RTVcdTc3MEJcdTdCNTRcdTY4NDhcIiBcdTg4NENcdTc2ODRcdTUzRjNcdTRGQTdcdTMwMDJcbiAgbW92ZU1hc3RlcnlUb1RvZ2dsZSgpO1xuICBjb25zdCB0b2dnbGUgPSAkKCdhbnN3ZXItdG9nZ2xlJyk7XG4gIGlmICh0b2dnbGUpIHRvZ2dsZS5oaWRkZW4gPSBmYWxzZTtcbiAgY29uc3Qgc2hvd0J0biA9ICQoJ2J0bi1zaG93LWFuc3dlcicpO1xuICBpZiAoc2hvd0J0bikgc2hvd0J0bi5yZW1vdmVBdHRyaWJ1dGUoJ2hpZGRlbicpO1xuICBoaWRlTWFzdGVyeU9wdGlvbnMoKTtcbn1cblxuLyoqXG4gKiBcdTYyOEEgI21hc3RlcnktZmFiIFx1NzlGQlx1NTIzMFx1N0I1NFx1Njg0OFx1NUM1NVx1NUYwMFx1NjVGNlx1NzY4NFx1NUJCOVx1NTY2OFx1RkYwOC5hbnN3ZXItYWN0aW9ucyBcdTUxODVcdTMwMDFcdTY1MzZcdThENzdcdTYzMDlcdTk0QUVcdTVERTZcdThGQjlcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTc1MjggRE9NIFx1NzlGQlx1NTJBOFx1ODAwQ1x1NEUwRFx1NjYyRlx1NTNDQ1x1NEVGRCBET00gXHU1QjlFXHU0RjhCXHVGRjBDXHU5MDdGXHU1MTREXHU2MzA5XHU5NEFFXCJcdTVDNTVcdTVGMDAvXHU5MDA5XHU0RTJEXCJcdTcyQjZcdTYwMDFcdTU3MjhcdTRFMjRcdTU5MDRcdTRFMERcdTU0MENcdTZCNjVcdTMwMDJcbiAqL1xuZnVuY3Rpb24gbW92ZU1hc3RlcnlUb0Fuc3dlcigpOiB2b2lkIHtcbiAgY29uc3QgZmFiID0gJCgnbWFzdGVyeS1mYWInKTtcbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hbnN3ZXItYWN0aW9ucycpO1xuICBjb25zdCBjb2xsYXBzZSA9ICQoJ2J0bi1jb2xsYXBzZS1hbnN3ZXInKTtcbiAgaWYgKCFmYWIgfHwgIWFjdGlvbnMgfHwgIWNvbGxhcHNlKSByZXR1cm47XG4gIGlmIChmYWIucGFyZW50RWxlbWVudCA9PT0gYWN0aW9ucykgcmV0dXJuO1xuICBhY3Rpb25zLmluc2VydEJlZm9yZShmYWIsIGNvbGxhcHNlKTtcbn1cblxuLyoqIFx1NjI4QSAjbWFzdGVyeS1mYWIgXHU3OUZCXHU1NkRFXHU2NzJBXHU1QzU1XHU1RjAwXHU3MkI2XHU2MDAxXHU3Njg0XHU1QkI5XHU1NjY4XHVGRjA4LmFuc3dlci10b2dnbGUgXHU1MTg1XHUzMDAxXHU2N0U1XHU3NzBCXHU3QjU0XHU2ODQ4XHU2MzA5XHU5NEFFXHU1M0YzXHU4RkI5XHVGRjA5XHUzMDAyICovXG5mdW5jdGlvbiBtb3ZlTWFzdGVyeVRvVG9nZ2xlKCk6IHZvaWQge1xuICBjb25zdCBmYWIgPSAkKCdtYXN0ZXJ5LWZhYicpO1xuICBjb25zdCB0b2dnbGUgPSAkKCdhbnN3ZXItdG9nZ2xlJyk7XG4gIGlmICghZmFiIHx8ICF0b2dnbGUpIHJldHVybjtcbiAgaWYgKGZhYi5wYXJlbnRFbGVtZW50ID09PSB0b2dnbGUpIHJldHVybjtcbiAgdG9nZ2xlLmFwcGVuZENoaWxkKGZhYik7XG59XG5cbi8qKiBcdTUxNzNcdTk1RURcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTZENkVcdTUyQThcdTkwMDlcdTk4NzlcdTgzRENcdTUzNTVcdTMwMDIgKi9cbmZ1bmN0aW9uIGhpZGVNYXN0ZXJ5T3B0aW9ucygpOiB2b2lkIHtcbiAgY29uc3Qgb3B0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tYXN0ZXJ5LW9wdGlvbnMnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChvcHRzKSBvcHRzLmhpZGRlbiA9IHRydWU7XG4gIGNvbnN0IHRyaWdnZXIgPSAkKCdidG4tbWFzdGVyeScpO1xuICBpZiAodHJpZ2dlcikgdHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcbn1cblxuLyoqIFx1NjI4QSBtYXN0ZXJ5IFx1NTAzQ1x1NjYyMFx1NUMwNFx1NjIxMFx1NEUzQlx1NjMwOVx1OTRBRVx1NEUyRFx1NTkyRVx1NjYzRVx1NzkzQVx1NzY4NFx1NUI1N1x1N0IyNlx1MzAwMiAqL1xuZnVuY3Rpb24gbWFzdGVyeUljb24obTogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChtKSB7XG4gICAgY2FzZSAnbWFzdGVyZWQnOlxuICAgICAgcmV0dXJuICdcdTI3MTMnO1xuICAgIGNhc2UgJ25vdF9tYXN0ZXJlZCc6XG4gICAgICByZXR1cm4gJ1x1MjVENCc7XG4gICAgY2FzZSAnbGVhcm5pbmcnOlxuICAgICAgcmV0dXJuICdcdTI1RDQnO1xuICAgIGNhc2UgJ3VubGVhcm5lZCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnXHUyNUNCJztcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJRdWVzdGlvbihxdWVzdGlvbjogUXVlc3Rpb24pOiB2b2lkIHtcbiAgY3VycmVudFF1ZXN0aW9uID0gcXVlc3Rpb247XG5cbiAgY29uc3QgdGl0bGVFbCA9ICQoJ3F1ZXN0aW9uLXRpdGxlJyk7XG4gIGlmICh0aXRsZUVsKSB0aXRsZUVsLnRleHRDb250ZW50ID0gcXVlc3Rpb24udGl0bGU7XG5cbiAgLy8gbWV0YSBcdTVGQkRcdTdBRTAgLyBcdTY4MDdcdTdCN0VcbiAgY29uc3QgbWV0YUVsID0gJCgncXVlc3Rpb24tbWV0YScpO1xuICBpZiAobWV0YUVsKSB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgcGFydHMucHVzaChcbiAgICAgIGA8c3BhbiBjbGFzcz1cInBpbGwgJHtxdWVzdGlvbi50eXBlID09PSAnY29kZScgPyAndHlwZS1jb2RlJyA6ICd0eXBlLXFhJ31cIj4ke1xuICAgICAgICBxdWVzdGlvbi50eXBlID09PSAnY29kZScgPyAnXHU0RUUzXHU3ODAxXHU5ODk4JyA6ICdcdTk1RUVcdTdCNTRcdTk4OTgnXG4gICAgICB9PC9zcGFuPmAsXG4gICAgKTtcbiAgICBwYXJ0cy5wdXNoKFxuICAgICAgYDxzcGFuIGNsYXNzPVwicGlsbCAke2RpZmZpY3VsdHlDbGFzcyhxdWVzdGlvbi5kaWZmaWN1bHR5KX1cIj4ke2VzY2FwZUh0bWwoXG4gICAgICAgIGRpZmZpY3VsdHlMYWJlbChxdWVzdGlvbi5kaWZmaWN1bHR5KSxcbiAgICAgICl9PC9zcGFuPmAsXG4gICAgKTtcbiAgICBpZiAocXVlc3Rpb24uY2F0ZWdvcnkpIHtcbiAgICAgIHBhcnRzLnB1c2goXG4gICAgICAgIGA8c3BhbiBjbGFzcz1cInBpbGwgY2F0ZWdvcnlcIj4ke2VzY2FwZUh0bWwocXVlc3Rpb24uY2F0ZWdvcnkpfTwvc3Bhbj5gLFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocXVlc3Rpb24udGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgdCBvZiBxdWVzdGlvbi50YWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdCA9PT0gJ3N0cmluZycgJiYgdC5sZW5ndGggPiAwICYmIHQgIT09IHF1ZXN0aW9uLmNhdGVnb3J5KSB7XG4gICAgICAgICAgcGFydHMucHVzaChgPHNwYW4gY2xhc3M9XCJ0YWdcIj4ke2VzY2FwZUh0bWwodCl9PC9zcGFuPmApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChxdWVzdGlvbi50eXBlID09PSAnY29kZScgJiYgcXVlc3Rpb24ubGFuZ3VhZ2UpIHtcbiAgICAgIHBhcnRzLnB1c2goYDxzcGFuIGNsYXNzPVwidGFnXCI+JHtlc2NhcGVIdG1sKHF1ZXN0aW9uLmxhbmd1YWdlKX08L3NwYW4+YCk7XG4gICAgfVxuICAgIG1ldGFFbC5pbm5lckhUTUwgPSBwYXJ0cy5qb2luKCcnKTtcbiAgfVxuXG4gIC8vIFx1OTg5OFx1OTc2Mlx1RkYxQW1hcmtkb3duIFx1NkUzMlx1NjdEM1xuICBjb25zdCBjb250ZW50RWwgPSAkKCdxdWVzdGlvbi1jb250ZW50Jyk7XG4gIGlmIChjb250ZW50RWwpIGNvbnRlbnRFbC5pbm5lckhUTUwgPSByZW5kZXJNYXJrZG93bihxdWVzdGlvbi5jb250ZW50KTtcblxuICAvLyBcdTZENEJcdThCRDVcdTc1MjhcdTRGOEJcbiAgY29uc3QgdGVzdENhc2VzRWwgPSAkKCd0ZXN0LWNhc2VzJyk7XG4gIGlmICh0ZXN0Q2FzZXNFbCkge1xuICAgIGlmIChcbiAgICAgIHF1ZXN0aW9uLnR5cGUgPT09ICdjb2RlJyAmJlxuICAgICAgQXJyYXkuaXNBcnJheShxdWVzdGlvbi50ZXN0Q2FzZXMpICYmXG4gICAgICBxdWVzdGlvbi50ZXN0Q2FzZXMubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgbGV0IGh0bWwgPSAnPGgyPlx1NkQ0Qlx1OEJENVx1NzUyOFx1NEY4QjwvaDI+JztcbiAgICAgIGZvciAoY29uc3QgdGMgb2YgcXVlc3Rpb24udGVzdENhc2VzKSB7XG4gICAgICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJ0ZXN0LWNhc2VcIj4nO1xuICAgICAgICBpZiAodGMubmFtZSkge1xuICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJ0ZXN0LWNhc2UtbmFtZVwiPiR7ZXNjYXBlSHRtbCh0Yy5uYW1lKX08L2Rpdj5gO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0Yy5pbnB1dCkge1xuICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJ0ZXN0LWNhc2Utcm93XCI+PHNwYW4gY2xhc3M9XCJ0ZXN0LWNhc2UtbGFiZWxcIj5cdThGOTNcdTUxNjU8L3NwYW4+PGNvZGU+JHtlc2NhcGVIdG1sKHRjLmlucHV0KX08L2NvZGU+PC9kaXY+YDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGMuZXhwZWN0ZWQpIHtcbiAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwidGVzdC1jYXNlLXJvd1wiPjxzcGFuIGNsYXNzPVwidGVzdC1jYXNlLWxhYmVsXCI+XHU5ODg0XHU2NzFGPC9zcGFuPjxjb2RlPiR7ZXNjYXBlSHRtbCh0Yy5leHBlY3RlZCl9PC9jb2RlPjwvZGl2PmA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRjLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInRlc3QtY2FzZS1yb3dcIj48c3BhbiBjbGFzcz1cInRlc3QtY2FzZS1sYWJlbFwiPlx1OEJGNFx1NjYwRTwvc3Bhbj48c3Bhbj4ke2VzY2FwZUh0bWwodGMuZGVzY3JpcHRpb24pfTwvc3Bhbj48L2Rpdj5gO1xuICAgICAgICB9XG4gICAgICAgIGh0bWwgKz0gJzwvZGl2Pic7XG4gICAgICB9XG4gICAgICB0ZXN0Q2FzZXNFbC5pbm5lckhUTUwgPSBodG1sO1xuICAgIH0gZWxzZSB7XG4gICAgICB0ZXN0Q2FzZXNFbC5pbm5lckhUTUwgPSAnJztcbiAgICB9XG4gIH1cblxuICAvLyBcdTUyMDdcdTk4OThcdTY1RjZcdTkxQ0RcdTdGNkVcdTdCNTRcdTY4NDhcdTUzM0FcdTUyMzBcdTY3MkFcdTVDNTVcdTVGMDBcdTcyQjZcdTYwMDFcbiAgaGlkZUFuc3dlclNlY3Rpb24oKTtcbn1cblxuLyoqXG4gKiBcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTc2RjhcdTUxNzMgVUkgXHU2NkY0XHU2NUIwXHUzMDAyXG4gKlxuICogXHU2ODA3XHU5ODk4XHU2ODBGXHU1M0YzXHU0RkE3XHU3Njg0XHU2NTM2XHU4NUNGXHU2NjFGXHU2MzA5XHU5NEFFICsgXHU3QjU0XHU2ODQ4IHRvZ2dsZSBcdTg4NENcdTUzRjNcdTRGQTdcdTc2ODRcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTZENkVcdTUyQThcdTYzMDlcdTk0QUVcdTdFQzRcdUZGMUFcbiAqICAtIFx1NjUzNlx1ODVDRlx1RkYxQWFjdGl2ZSBjbGFzcyArIGFyaWEgXHU2NTg3XHU2ODQ4XHVGRjFCXG4gKiAgLSBcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTRFM0JcdTYzMDlcdTk0QUVcdUZGMUFcdTY2M0VcdTc5M0FcdTYzOENcdTYzRTFcdTcyQjZcdTYwMDFcdUZGMUJcdTk1MTlcdTk4OThcdTY4MDdcdThCQjBcdTVGMDBcdTU0MkZcdTY1RjZcdTRGMThcdTUxNDhcdTY2M0VcdTc5M0FcdTk1MTlcdTk4OThcdUZGMUJcbiAqICAtIFx1NjM4Q1x1NjNFMVx1NzJCNlx1NjAwMVx1NEUwRVx1OTUxOVx1OTg5OFx1NjMwOVx1OTRBRVx1NTIwNlx1NTIyQlx1N0VGNFx1NjJBNFx1ODFFQVx1NURGMVx1NzY4NCBhY3RpdmUgXHU5QUQ4XHU0RUFFXHUzMDAyXG4gKlxuICogXHU1MTY1XHU1M0MyXHU3QzdCXHU1NzhCXHU0RUNEXHU0RkREXHU3NTU5XHU1QjhDXHU2NTc0IExlYXJuaW5nU3RhdGVcdUZGMENcdTYyNjlcdTVDNTVcdTdBRUZcdTUzNEZcdThCQUVcdTRFMERcdTUzRDhcdTMwMDJcbiAqL1xuZnVuY3Rpb24gdXBkYXRlTGVhcm5pbmdVSShsZWFybmluZzogTGVhcm5pbmdTdGF0ZSk6IHZvaWQge1xuICBjb25zdCBmYXZCdG4gPSAkKCdidG4tZmF2b3JpdGUnKTtcbiAgaWYgKGZhdkJ0bikge1xuICAgIGZhdkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBsZWFybmluZy5mYXZvcml0ZUZsYWcpO1xuICAgIGZhdkJ0bi5zZXRBdHRyaWJ1dGUoXG4gICAgICAnYXJpYS1sYWJlbCcsXG4gICAgICBsZWFybmluZy5mYXZvcml0ZUZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU2NTM2XHU4NUNGJyA6ICdcdTY1MzZcdTg1Q0YnLFxuICAgICk7XG4gICAgZmF2QnRuLnNldEF0dHJpYnV0ZSgndGl0bGUnLCBsZWFybmluZy5mYXZvcml0ZUZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU2NTM2XHU4NUNGJyA6ICdcdTY1MzZcdTg1Q0YnKTtcbiAgfVxuXG4gIC8vIFx1NjM4Q1x1NjNFMVx1NzJCNlx1NjAwMVx1NjMwOVx1OTRBRVx1NzY4NCBhY3RpdmUgY2xhc3NcdUZGMDhsZWFybmluZyBcdTRFQzVcdTRFM0FcdTY1RTdcdTY1NzBcdTYzNkVcdTUxN0NcdTVCQjlcdUZGMENcdTRFMERcdTUxOERcdTYzRDBcdTRGOUJcdTYzMDlcdTk0QUVcdUZGMDlcbiAgY29uc3QgbWFzdGVyeVZhbHVlcyA9IFsndW5sZWFybmVkJywgJ2xlYXJuaW5nJywgJ21hc3RlcmVkJywgJ25vdF9tYXN0ZXJlZCddO1xuICBmb3IgKGNvbnN0IG0gb2YgbWFzdGVyeVZhbHVlcykge1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICBgW2RhdGEtbWFzdGVyeT1cIiR7bX1cIl1gLFxuICAgICkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghYnRuKSBjb250aW51ZTtcbiAgICBidG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgbSA9PT0gbGVhcm5pbmcubWFzdGVyeSk7XG4gIH1cblxuICBjb25zdCB3cm9uZ0J0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXdyb25nXScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgaWYgKHdyb25nQnRuKSB7XG4gICAgd3JvbmdCdG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgbGVhcm5pbmcud3JvbmdGbGFnKTtcbiAgICB3cm9uZ0J0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsZWFybmluZy53cm9uZ0ZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU5NTE5XHU5ODk4XHU2ODA3XHU4QkIwJyA6ICdcdTY4MDdcdThCQjBcdTRFM0FcdTk1MTlcdTk4OTgnKTtcbiAgICB3cm9uZ0J0bi5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgbGVhcm5pbmcud3JvbmdGbGFnID8gJ1x1NTNENlx1NkQ4OFx1OTUxOVx1OTg5OFx1NjgwN1x1OEJCMCcgOiAnXHU2ODA3XHU4QkIwXHU0RTNBXHU5NTE5XHU5ODk4Jyk7XG4gIH1cblxuICAvLyBcdTRFM0JcdTg5RTZcdTUzRDFcdTYzMDlcdTk0QUVcdUZGMUFcdTZFMDVcdTYzODlcdTYyNDBcdTY3MDkgaXMtKiBcdTUxOERcdTUyQTBcdTVGNTNcdTUyNEQgbWFzdGVyeSBcdTc2ODQgY2xhc3NcdUZGMENcdTY2RjRcdTY1QjBcdTRFMkRcdTVGQzNcdTVCNTdcdTdCMjZcbiAgY29uc3QgdHJpZ2dlciA9ICQoJ2J0bi1tYXN0ZXJ5Jyk7XG4gIGlmICh0cmlnZ2VyKSB7XG4gICAgZm9yIChjb25zdCBtIG9mIG1hc3RlcnlWYWx1ZXMpIHtcbiAgICAgIHRyaWdnZXIuY2xhc3NMaXN0LnJlbW92ZShgaXMtJHttfWApO1xuICAgIH1cbiAgICB0cmlnZ2VyLmNsYXNzTGlzdC5yZW1vdmUoJ2lzLXdyb25nJyk7XG4gICAgdHJpZ2dlci5jbGFzc0xpc3QuYWRkKGxlYXJuaW5nLndyb25nRmxhZyA/ICdpcy13cm9uZycgOiBgaXMtJHtsZWFybmluZy5tYXN0ZXJ5fWApO1xuICAgIGNvbnN0IGljb24gPSB0cmlnZ2VyLnF1ZXJ5U2VsZWN0b3IoJy5tYXN0ZXJ5LWljb24nKTtcbiAgICBpZiAoaWNvbikgaWNvbi50ZXh0Q29udGVudCA9IGxlYXJuaW5nLndyb25nRmxhZyA/ICdcdTI3MTcnIDogbWFzdGVyeUljb24obGVhcm5pbmcubWFzdGVyeSk7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEFuc3dlclBheWxvYWQge1xuICBxdWVzdGlvblR5cGU6ICdjb2RlJyB8ICdxYSc7XG4gIGFuc3dlcjpcbiAgICB8IHtcbiAgICAgICAga2luZDogJ3JlZmVyZW5jZSc7XG4gICAgICAgIGNvZGU/OiBzdHJpbmc7XG4gICAgICAgIGJyaWVmQW5zd2VyPzogc3RyaW5nO1xuICAgICAgICBkZXRhaWxlZEFuc3dlcj86IHN0cmluZztcbiAgICAgICAgZm9sbG93VXBzPzogQXJyYXk8eyBxdWVzdGlvbjogc3RyaW5nOyBhbnN3ZXI/OiBzdHJpbmcgfT47XG4gICAgICB9XG4gICAgfCB7IGtpbmQ6ICdub25lJzsgaGludDogc3RyaW5nIH07XG59XG5cbmZ1bmN0aW9uIHNob3dBbnN3ZXIocGF5bG9hZDogQW5zd2VyUGF5bG9hZCk6IHZvaWQge1xuICBjb25zdCBhcmVhID0gJCgnYW5zd2VyLWFyZWEnKTtcbiAgY29uc3QgY29udGVudCA9ICQoJ2Fuc3dlci1jb250ZW50Jyk7XG4gIGlmICghYXJlYSB8fCAhY29udGVudCkgcmV0dXJuO1xuXG4gIGFyZWEuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cbiAgY29uc3QgYW5zID0gcGF5bG9hZC5hbnN3ZXI7XG4gIGlmIChhbnMua2luZCA9PT0gJ25vbmUnKSB7XG4gICAgY29udGVudC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJhbnN3ZXItbGFiZWxcIj5cdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDg8L3NwYW4+PHA+JHtlc2NhcGVIdG1sKFxuICAgICAgYW5zLmhpbnQgPz8gJ1x1OEJFNVx1OTg5OFx1NjY4Mlx1NjVFMFx1NTNDMlx1ODAwM1x1N0I1NFx1Njg0OCcsXG4gICAgKX08L3A+YDtcbiAgfSBlbHNlIHtcbiAgICBsZXQgaHRtbCA9ICc8c3BhbiBjbGFzcz1cImFuc3dlci1sYWJlbFwiPlx1NTNDMlx1ODAwM1x1N0I1NFx1Njg0ODwvc3Bhbj4nO1xuICAgIGlmIChwYXlsb2FkLnF1ZXN0aW9uVHlwZSA9PT0gJ2NvZGUnKSB7XG4gICAgICBjb25zdCBsYW5nID1cbiAgICAgICAgY3VycmVudFF1ZXN0aW9uICYmIGN1cnJlbnRRdWVzdGlvbi50eXBlID09PSAnY29kZSdcbiAgICAgICAgICA/IGN1cnJlbnRRdWVzdGlvbi5sYW5ndWFnZSA/PyAnJ1xuICAgICAgICAgIDogJyc7XG4gICAgICBjb25zdCBsYW5nQ2xhc3MgPSBsYW5nID8gYCBjbGFzcz1cImxhbmctJHtlc2NhcGVIdG1sKGxhbmcpfVwiYCA6ICcnO1xuICAgICAgaHRtbCArPSBgPHByZT48Y29kZSR7bGFuZ0NsYXNzfT4ke2hpZ2hsaWdodChhbnMuY29kZSA/PyAnJywgbGFuZyl9PC9jb2RlPjwvcHJlPmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChhbnMuYnJpZWZBbnN3ZXIpIHtcbiAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImJyaWVmIG1kXCI+JHtyZW5kZXJNYXJrZG93bihhbnMuYnJpZWZBbnN3ZXIpfTwvZGl2PmA7XG4gICAgICB9XG4gICAgICBpZiAoYW5zLmRldGFpbGVkQW5zd2VyKSB7XG4gICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJkZXRhaWxlZCBtZFwiPjxoMz5cdThCRTZcdTdFQzZcdTg5RTNcdTY3OTA8L2gzPiR7cmVuZGVyTWFya2Rvd24oYW5zLmRldGFpbGVkQW5zd2VyKX08L2Rpdj5gO1xuICAgICAgfVxuICAgIH1cbiAgICBjb250ZW50LmlubmVySFRNTCA9IGh0bWw7XG4gIH1cblxuICAvLyBcdThGRkRcdTk1RUVcdUZGMDhcdTRFQzUgUUEgXHU5ODk4XHU0RTE0IHJlZmVyZW5jZVx1RkYwOVxuICBjb25zdCBmb2xsb3dVcHNFbCA9ICQoJ2ZvbGxvdy11cHMnKTtcbiAgaWYgKGZvbGxvd1Vwc0VsKSB7XG4gICAgaWYgKFxuICAgICAgYW5zLmtpbmQgPT09ICdyZWZlcmVuY2UnICYmXG4gICAgICBwYXlsb2FkLnF1ZXN0aW9uVHlwZSA9PT0gJ3FhJyAmJlxuICAgICAgQXJyYXkuaXNBcnJheShhbnMuZm9sbG93VXBzKSAmJlxuICAgICAgYW5zLmZvbGxvd1Vwcy5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICBsZXQgZnVIdG1sID0gJzxoMiBjbGFzcz1cImZvbGxvd3Vwcy10aXRsZVwiPlx1OEZGRFx1OTVFRTwvaDI+JztcbiAgICAgIGZvciAoY29uc3QgZnUgb2YgYW5zLmZvbGxvd1Vwcykge1xuICAgICAgICBmdUh0bWwgKz0gJzxkaXYgY2xhc3M9XCJmb2xsb3ctdXBcIj4nO1xuICAgICAgICBmdUh0bWwgKz0gYDxkaXYgY2xhc3M9XCJmb2xsb3ctdXAtcVwiPiR7ZXNjYXBlSHRtbChmdS5xdWVzdGlvbil9PC9kaXY+YDtcbiAgICAgICAgaWYgKGZ1LmFuc3dlcikge1xuICAgICAgICAgIGZ1SHRtbCArPSBgPGRpdiBjbGFzcz1cImZvbGxvdy11cC1hIG1kXCI+JHtyZW5kZXJNYXJrZG93bihmdS5hbnN3ZXIpfTwvZGl2PmA7XG4gICAgICAgIH1cbiAgICAgICAgZnVIdG1sICs9ICc8L2Rpdj4nO1xuICAgICAgfVxuICAgICAgZm9sbG93VXBzRWwuaW5uZXJIVE1MID0gZnVIdG1sO1xuICAgIH0gZWxzZSB7XG4gICAgICBmb2xsb3dVcHNFbC5pbm5lckhUTUwgPSAnJztcbiAgICB9XG4gIH1cblxuICAvLyBcdTUyMDdcdTYzNjIgdG9nZ2xlIFx1NTMzQVx1NTIzMFx1OTY5MFx1ODVDRlx1NzJCNlx1NjAwMVx1RkYwOFx1NTQwQ1x1NjVGNlx1NjI4QSBzaG93IFx1NjMwOVx1OTRBRSBoaWRlXHVGRjBDXHU0RUU1XHU1OTA3XHU1QzA2XHU2NzY1XHU5MUNEXHU2NUIwXHU2NjNFXHU3OTNBXHVGRjA5XHVGRjFCXG4gIC8vIFx1NjI4QSBtYXN0ZXJ5LWZhYiBET00gXHU3OUZCXHU1MjMwXHU3QjU0XHU2ODQ4XHU1MzNBXHU1RTk1XHU5MEU4XHU1M0YzXHU0RTBCXHU4OUQyXHU3Njg0IC5hbnN3ZXItYWN0aW9ucyBcdTUxODVcdTMwMDJcbiAgY29uc3QgdG9nZ2xlID0gJCgnYW5zd2VyLXRvZ2dsZScpO1xuICBpZiAodG9nZ2xlKSB0b2dnbGUuaGlkZGVuID0gdHJ1ZTtcbiAgY29uc3Qgc2hvd0J0biA9ICQoJ2J0bi1zaG93LWFuc3dlcicpO1xuICBpZiAoc2hvd0J0bikgc2hvd0J0bi5zZXRBdHRyaWJ1dGUoJ2hpZGRlbicsICcnKTtcbiAgaGlkZU1hc3RlcnlPcHRpb25zKCk7XG4gIG1vdmVNYXN0ZXJ5VG9BbnN3ZXIoKTtcbn1cblxubGV0IHN0YXR1c1RpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gc2hvd1N0YXR1cyhtc2c6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBlbCA9ICQoJ3N0YXR1cy1tZXNzYWdlJyk7XG4gIGlmICghZWwpIHJldHVybjtcbiAgZWwudGV4dENvbnRlbnQgPSBtc2c7XG4gIGVsLmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTtcbiAgaWYgKHN0YXR1c1RpbWVyICE9PSB1bmRlZmluZWQpIGNsZWFyVGltZW91dChzdGF0dXNUaW1lcik7XG4gIHN0YXR1c1RpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpO1xuICB9LCAyNDAwKTtcbn1cblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgJCgnYnRuLXNob3ctYW5zd2VyJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdyZXF1ZXN0QW5zd2VyJyB9KTtcbiAgfSk7XG5cbiAgJCgnYnRuLWNvbGxhcHNlLWFuc3dlcicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICBoaWRlQW5zd2VyU2VjdGlvbigpO1xuICB9KTtcblxuICAkKCdidG4tZmF2b3JpdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3RvZ2dsZUZhdm9yaXRlJyB9KTtcbiAgfSk7XG5cbiAgLy8gXHU1QjY2XHU0RTYwXHU3MkI2XHU2MDAxXHU0RTNCXHU2MzA5XHU5NEFFXHVGRjFBdG9nZ2xlIDQgXHU0RTJBXHU5MDA5XHU5ODc5XHU3Njg0XHU1M0VGXHU4OUMxXHU2MDI3XG4gICQoJ2J0bi1tYXN0ZXJ5Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGNvbnN0IG9wdHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubWFzdGVyeS1vcHRpb25zJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IHRyaWdnZXIgPSAkKCdidG4tbWFzdGVyeScpO1xuICAgIGlmICghb3B0cykgcmV0dXJuO1xuICAgIGNvbnN0IHdpbGxTaG93ID0gb3B0cy5oaWRkZW47XG4gICAgb3B0cy5oaWRkZW4gPSAhd2lsbFNob3c7XG4gICAgaWYgKHRyaWdnZXIpIHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgd2lsbFNob3cgPyAndHJ1ZScgOiAnZmFsc2UnKTtcbiAgfSk7XG5cbiAgLy8gNCBcdTRFMkFcdTkwMDlcdTk4NzlcdTYzMDlcdTk0QUVcdUZGMUFcdTUzRDFcdTUxRkEgc2V0TWFzdGVyeVx1RkYwQ1x1NUU3Nlx1N0FDQlx1NTIzQlx1NTE3M1x1OTVFRFx1NkQ2RVx1NTJBOFx1ODNEQ1x1NTM1NVxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1tYXN0ZXJ5XScpLmZvckVhY2goKGJ0bikgPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgY29uc3QgdmFsdWUgPSAoYnRuIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydtYXN0ZXJ5J107XG4gICAgICBpZiAodmFsdWUpIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdzZXRNYXN0ZXJ5JywgdmFsdWUgfSk7XG4gICAgICBoaWRlTWFzdGVyeU9wdGlvbnMoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtd3JvbmddJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICd0b2dnbGVXcm9uZycgfSk7XG4gICAgaGlkZU1hc3RlcnlPcHRpb25zKCk7XG4gIH0pO1xuXG4gIC8vIFx1NzBCOVx1NTFGQiBmYWIgXHU0RTRCXHU1OTE2XHU3Njg0XHU0RUZCXHU2MTBGXHU0RjREXHU3RjZFXHU1MTczXHU5NUVEXHU2RDZFXHU1MkE4XHU4M0RDXHU1MzU1XHVGRjA4XHU0RTBEXHU5NjNCXHU2QjYyXHU0RThCXHU0RUY2XHVGRjBDXHU4QkE5XHU1MzlGXHU2NzJDXHU3Njg0XHU3MEI5XHU1MUZCXHU0RUNEXHU3NTFGXHU2NTQ4XHVGRjA5XG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBjb25zdCBmYWIgPSAkKCdtYXN0ZXJ5LWZhYicpO1xuICAgIGlmICghZmFiKSByZXR1cm47XG4gICAgaWYgKGZhYi5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSkgcmV0dXJuO1xuICAgIGhpZGVNYXN0ZXJ5T3B0aW9ucygpO1xuICB9KTtcblxuICB2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAncmVhZHknIH0pO1xufSk7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgKGV2ZW50KSA9PiB7XG4gIGNvbnN0IG1zZyA9IGV2ZW50LmRhdGEgYXMgSG9zdFRvV2Vidmlld01lc3NhZ2U7XG4gIHN3aXRjaCAobXNnLnR5cGUpIHtcbiAgICBjYXNlICdpbml0Jzoge1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1zZy5wYXlsb2FkIGFzIHsgcXVlc3Rpb246IFF1ZXN0aW9uOyBsZWFybmluZzogTGVhcm5pbmdTdGF0ZSB9O1xuICAgICAgcmVuZGVyUXVlc3Rpb24ocGF5bG9hZC5xdWVzdGlvbik7XG4gICAgICB1cGRhdGVMZWFybmluZ1VJKHBheWxvYWQubGVhcm5pbmcpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ3Nob3dBbnN3ZXInOiB7XG4gICAgICBzaG93QW5zd2VyKG1zZy5wYXlsb2FkIGFzIEFuc3dlclBheWxvYWQpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ3JvbGxiYWNrJzpcbiAgICBjYXNlICdyZWZyZXNoTGVhcm5pbmcnOiB7XG4gICAgICBjb25zdCBsZWFybmluZyA9IG1zZy5wYXlsb2FkIGFzIExlYXJuaW5nU3RhdGU7XG4gICAgICBpZiAobGVhcm5pbmcpIHVwZGF0ZUxlYXJuaW5nVUkobGVhcm5pbmcpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ2Zhdm9yaXRlQWNrJzoge1xuICAgICAgaWYgKCFtc2cub2spIHNob3dTdGF0dXMoYFx1NjUzNlx1ODVDRlx1NjRDRFx1NEY1Q1x1NTkzMVx1OEQyNTogJHttc2cucmVhc29uID8/ICdcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUYnfWApO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ21hc3RlcnlBY2snOiB7XG4gICAgICBpZiAoIW1zZy5vaykgc2hvd1N0YXR1cyhgXHU2MzhDXHU2M0UxXHU3MkI2XHU2MDAxXHU2NkY0XHU2NUIwXHU1OTMxXHU4RDI1OiAke21zZy5yZWFzb24gPz8gJ1x1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRid9YCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnd3JvbmdBY2snOiB7XG4gICAgICBpZiAoIW1zZy5vaykgc2hvd1N0YXR1cyhgXHU5NTE5XHU5ODk4XHU2ODA3XHU4QkIwXHU2NkY0XHU2NUIwXHU1OTMxXHU4RDI1OiAke21zZy5yZWFzb24gPz8gJ1x1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRid9YCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbn0pO1xuIl0sCiAgIm1h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
