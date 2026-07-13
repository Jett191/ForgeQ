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
      metaEl.innerHTML = parts.join("");
    }
    const contentEl = $("question-content");
    if (contentEl) contentEl.innerHTML = renderMarkdown(question.content);
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
      if (ans.briefAnswer) {
        html += `<div class="brief md">${renderMarkdown(ans.briefAnswer)}</div>`;
      }
      if (ans.detailedAnswer) {
        html += `<div class="detailed md"><h3>\u8BE6\u7EC6\u89E3\u6790</h3>${renderMarkdown(ans.detailedAnswer)}</div>`;
      }
      content.innerHTML = html;
    }
    const followUpsEl = $("follow-ups");
    if (followUpsEl) {
      if (ans.kind === "reference" && Array.isArray(ans.followUps) && ans.followUps.length > 0) {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ByYWN0aWNlL3dlYnZpZXcvaGlnaGxpZ2h0LnRzIiwgIi4uLy4uL3NyYy9wcmFjdGljZS93ZWJ2aWV3L21hcmtkb3duLnRzIiwgIi4uLy4uL3NyYy9wcmFjdGljZS93ZWJ2aWV3L21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogXHU2NzgxXHU3QjgwXHU4QkVEXHU2Q0Q1XHU5QUQ4XHU0RUFFXHVGRjA4d2VidmlldyBcdTUxODVcdTVENENcdUZGMENcdTk2RjZcdTRGOURcdThENTZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTkxNERcdTU0MDggYG1hcmtkb3duLnRzYCBcdTU3MjhcdTUyNERcdTdBRUZcdTk3NjJcdThCRDVcdTk4OThcdTRFRTNcdTc4MDFcdTU3NTdcdTRFMEFcdTYzRDBcdTRGOUIgR2l0SHViIFx1OThDRVx1NjgzQ1x1NzY4NFx1Nzc0MFx1ODI3Mlx1RkYxQVxuICogIC0ganMgLyB0cyAvIGpzeCAvIHRzeCAvIGphdmFzY3JpcHQgLyB0eXBlc2NyaXB0XHVGRjA4XHU2NzAwXHU1QjhDXHU2NTc0XHVGRjA5XG4gKiAgLSBjc3MgLyBzY3NzIC8gbGVzc1x1RkYwOFx1NUM1RVx1NjAyNyAvIFx1NjU3MFx1NTAzQyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQSAvIFx1OTg5Q1x1ODI3Mlx1RkYwOVxuICogIC0gaHRtbCAvIHhtbCAvIHZ1ZSAvIHN2Z1x1RkYwOFx1NjgwN1x1N0I3RSAvIFx1NUM1RVx1NjAyNyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQVx1RkYwOVxuICogIC0ganNvbiAvIGpzb241XHVGRjA4a2V5IC8gXHU1QjU3XHU3QjI2XHU0RTMyIC8gXHU2NTcwXHU1QjU3IC8gXHU1RTAzXHU1QzE0XHVGRjA5XG4gKiAgLSBweSAvIHB5dGhvblx1MzAwMXNoIC8gYmFzaCAvIHpzaFx1RkYwOFx1NTdGQVx1Nzg0MFx1NTE3M1x1OTUyRVx1NUI1NyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQVx1RkYwOVxuICogXHU1MTc2XHU1QjgzXHU4QkVEXHU4QTAwXHU5NjREXHU3RUE3XHU0RTNBXHU3RUFGXHU2NTg3XHU2NzJDXHVGRjA4XHU0RUM1XHU1MDVBIEhUTUwgXHU4RjZDXHU0RTQ5XHVGRjA5XHUzMDAyXG4gKlxuICogdG9rZW5pemUgXHU3NTI4IHN0aWNreSBcdTZCNjNcdTUyMTlcdTYzMDlcdTg5QzRcdTUyMTlcdTRGMThcdTUxNDhcdTdFQTdcdTUyNERcdTdGMDBcdTUzMzlcdTkxNERcdUZGMENcdTUzNTVcdTkwNERcdTYyNkJcdTYzQ0YgTyhuIFx1MDBENyBydWxlcylcdTMwMDJcbiAqIFx1OEY5M1x1NTFGQVx1NTMwNVx1ODhDNVx1NEUzQSBgPHNwYW4gY2xhc3M9XCJobC0ke2tpbmR9XCI+XHUyMDI2PC9zcGFuPmBcdUZGMENcdTkxNERcdTgyNzJcdTc1MzEgc3R5bGVzLmNzcyBcdTYzRDBcdTRGOUJcbiAqIFx1NEVBRSAvIFx1NjY5N1x1NTNDQ1x1NTk1N1x1RkYwQ1x1NEY5RFx1OTc2MCB3ZWJ2aWV3IGJvZHkgXHU0RTBBXHU3Njg0IGAudnNjb2RlLWxpZ2h0YCAvIGAudnNjb2RlLWRhcmtgXG4gKiBjbGFzcyBcdTUyMDdcdTYzNjJcdTMwMDJcbiAqXG4gKiBcdTRFMEUgbWFya2Rvd24udHMgXHU4OUUzXHU4MDI2XHVGRjFBXHU0RTBEXHU1QkZDXHU1MTY1XHU1QjgzXHVGRjBDZXNjYXBlSHRtbCBcdTU3MjhcdTY3MkNcdTY1ODdcdTRFRjZcdTcyRUNcdTdBQ0JcdTVCOUVcdTczQjBcdUZGMENcdTkwN0ZcdTUxNERcdTVGQUFcdTczQUZcdTRGOURcdThENTZcdTMwMDJcbiAqL1xuXG5pbnRlcmZhY2UgUnVsZSB7XG4gIGtpbmQ6IHN0cmluZztcbiAgcmU6IFJlZ0V4cDtcbn1cblxuZnVuY3Rpb24gZXNjYXBlSHRtbChzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG59XG5cbi8qKlxuICogXHU2MjhBXHU2RTkwXHU3ODAxXHU2MzA5XHU4OUM0XHU1MjE5XHU2NTcwXHU3RUM0IHRva2VuaXplIFx1NjIxMFx1NUUyNiBobC1jbGFzcyBcdTc2ODQgSFRNTFx1MzAwMlxuICpcbiAqIC0gXHU4OUM0XHU1MjE5XHU2MzA5XHU2NTcwXHU3RUM0XHU5ODdBXHU1RThGXHU0RjE4XHU1MTQ4XHU3RUE3XHU1MjREXHU3RjAwXHU1MzM5XHU5MTREXHVGRjFCXHU0RTBEXHU1MzM5XHU5MTREXHU1MjE5XHU1RjUyXHU1MTY1XCJwbGFpblwiXHU2QkI1XHU4NDNEXHVGRjBDXHU3RURGXHU0RTAwXHU4RjZDXHU0RTQ5XHU1NDBFXHU4RjkzXHU1MUZBXHUzMDAyXG4gKiAtIFx1NjI0MFx1NjcwOSBSZWdFeHAgXHU1RkM1XHU5ODdCXHU2NjJGIHN0aWNreVx1RkYwOGB5YCBcdTY4MDdcdTVGRDdcdUZGMDlcdUZGMENsYXN0SW5kZXggXHU2MjREXHU0RjFBXHU4OEFCXHU1QzBBXHU5MUNEXHUzMDAyXG4gKi9cbmZ1bmN0aW9uIHRva2VuaXplKHNyYzogc3RyaW5nLCBydWxlczogUmVhZG9ubHlBcnJheTxSdWxlPik6IHN0cmluZyB7XG4gIGxldCBvdXQgPSAnJztcbiAgbGV0IHBsYWluID0gJyc7XG4gIGNvbnN0IGZsdXNoID0gKCk6IHZvaWQgPT4ge1xuICAgIGlmIChwbGFpbikge1xuICAgICAgb3V0ICs9IGVzY2FwZUh0bWwocGxhaW4pO1xuICAgICAgcGxhaW4gPSAnJztcbiAgICB9XG4gIH07XG4gIGxldCBpID0gMDtcbiAgd2hpbGUgKGkgPCBzcmMubGVuZ3RoKSB7XG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IHIgb2YgcnVsZXMpIHtcbiAgICAgIHIucmUubGFzdEluZGV4ID0gaTtcbiAgICAgIGNvbnN0IG0gPSByLnJlLmV4ZWMoc3JjKTtcbiAgICAgIGlmIChtICYmIG0uaW5kZXggPT09IGkpIHtcbiAgICAgICAgZmx1c2goKTtcbiAgICAgICAgb3V0ICs9IGA8c3BhbiBjbGFzcz1cImhsLSR7ci5raW5kfVwiPiR7ZXNjYXBlSHRtbChtWzBdKX08L3NwYW4+YDtcbiAgICAgICAgaSA9IHIucmUubGFzdEluZGV4O1xuICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghbWF0Y2hlZCkge1xuICAgICAgcGxhaW4gKz0gc3JjW2ldO1xuICAgICAgaSsrO1xuICAgIH1cbiAgfVxuICBmbHVzaCgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFx1NTQwNFx1OEJFRFx1OEEwMFx1ODlDNFx1NTIxOVx1ODg2OFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogSlMgLyBUUyBcdTg5QzRcdTUyMTlcdTMwMDJcdTZDRThcdTYxMEZcdUZGMUFcbiAqICAtIFx1NkNFOFx1OTFDQVx1MzAwMVx1NUI1N1x1N0IyNlx1NEUzMlx1MzAwMVx1NkEyMVx1Njc3Rlx1NUI1N1x1N0IyNlx1NEUzMlx1NjUzRVx1NjcwMFx1NTI0RFx1RkYwQ1x1OTA3Rlx1NTE0RFx1OTFDQ1x1OTc2Mlx1NzY4NFx1NTE3M1x1OTUyRVx1NUI1N1x1ODhBQlx1OEJFRlx1NjdEM1x1MzAwMlxuICogIC0gYHR5YFx1RkYwOFx1NTkyN1x1NTE5OVx1NUYwMFx1NTkzNFx1NjgwN1x1OEJDNlx1N0IyNlx1RkYwOVx1NjUzRVx1NTcyOCBgZm5gIFx1NTI0RFx1RkYwQ1x1OEJBOSBgTXlDbGFzcyguLi4pYCBcdTY3RDNcdTYyMTBcdTdDN0JcdTU3OEJcdTgyNzJcdTgwMENcdTRFMERcdTY2MkZcdTUxRkRcdTY1NzBcdTgyNzJcdTMwMDJcbiAqICAtIFx1NkEyMVx1Njc3Rlx1NUI1N1x1N0IyNlx1NEUzMlx1OTFDQ1x1NzY4NCBgJHtleHByfWAgXHU0RTBEXHU1MDVBXHU1RDRDXHU1OTU3XHU4OUUzXHU2NzkwXHVGRjBDXHU2NTc0XHU0RjUzXHU1RjUzXHU1QjU3XHU3QjI2XHU0RTMyXHU1OTA0XHU3NDA2XHVGRjA4XHU5NzYyXHU4QkQ1XHU5ODk4XHU0RUUzXHU3ODAxXHU1OTFGXHU3NTI4XHVGRjA5XHUzMDAyXG4gKi9cbmNvbnN0IEpTX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcL1teXFxuXSoveSB9LFxuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcKltcXHNcXFNdKj9cXCpcXC8veSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogL1wiKD86XFxcXC58W15cIlxcXFxcXG5dKSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJyg/OlxcXFwufFteJ1xcXFxcXG5dKSonL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9gKD86XFxcXC58W15gXFxcXF0pKmAveSB9LFxuICB7XG4gICAga2luZDogJ2t3JyxcbiAgICByZTogL1xcYig/OmNvbnN0fGxldHx2YXJ8ZnVuY3Rpb258Y2xhc3N8ZXh0ZW5kc3xpbXBsZW1lbnRzfGludGVyZmFjZXx0eXBlfGVudW18bmFtZXNwYWNlfGRlY2xhcmV8bW9kdWxlfGltcG9ydHxleHBvcnR8ZnJvbXxhc3xkZWZhdWx0fHJldHVybnxpZnxlbHNlfGZvcnx3aGlsZXxkb3xzd2l0Y2h8Y2FzZXxicmVha3xjb250aW51ZXxuZXd8ZGVsZXRlfHRoaXN8c3VwZXJ8dHlwZW9mfGluc3RhbmNlb2Z8aW58b2Z8dHJ5fGNhdGNofGZpbmFsbHl8dGhyb3d8YXN5bmN8YXdhaXR8eWllbGR8c3RhdGljfGdldHxzZXR8cHVibGljfHByaXZhdGV8cHJvdGVjdGVkfHJlYWRvbmx5fGFic3RyYWN0fG92ZXJyaWRlfHZvaWR8YW55fHVua25vd258bmV2ZXJ8d2l0aClcXGIveSxcbiAgfSxcbiAgeyBraW5kOiAnYm9vbCcsIHJlOiAvXFxiKD86dHJ1ZXxmYWxzZXxudWxsfHVuZGVmaW5lZHxOYU58SW5maW5pdHkpXFxiL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdudW0nLFxuICAgIHJlOiAvXFxiKD86MFt4WF1bMC05YS1mQS1GXSt8MFtiQl1bMDFdK3wwW29PXVswLTddK3xcXGQrKD86XFwuXFxkKyk/KD86W2VFXVsrLV0/XFxkKyk/KW4/XFxiL3ksXG4gIH0sXG4gIHsga2luZDogJ3R5JywgcmU6IC9cXGJbQS1aXVtcXHckXSpcXGIveSB9LFxuICB7IGtpbmQ6ICdmbicsIHJlOiAvXFxiW2EtekEtWl8kXVtcXHckXSooPz1cXHMqXFwoKS95IH0sXG5dO1xuXG4vKiogQ1NTIC8gU0NTUyAvIExFU1MgXHU4OUM0XHU1MjE5XHUzMDAyU2VsZWN0b3IgXHU0RTBEXHU1MDVBXHU3Q0JFXHU3RUM2XHU5QUQ4XHU0RUFFXHVGRjBDXHU5MUNEXHU3MEI5XHU1NzI4IHByb3AgLyB2YWx1ZSAvIFx1OTg5Q1x1ODI3Mlx1MzAwMiAqL1xuY29uc3QgQ1NTX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcKltcXHNcXFNdKj9cXCpcXC8veSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogL1wiKD86W15cIlxcXFxcXG5dfFxcXFwuKSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJyg/OlteJ1xcXFxcXG5dfFxcXFwuKSonL3kgfSxcbiAgeyBraW5kOiAndmFsJywgcmU6IC8jWzAtOWEtZkEtRl17Myw4fVxcYi95IH0sXG4gIHsga2luZDogJ2t3JywgcmU6IC9AW2EtekEtWi1dKy95IH0sXG4gIHsga2luZDogJ3Byb3AnLCByZTogLy0/W2EtekEtWl1bXFx3LV0qKD89XFxzKjopL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdudW0nLFxuICAgIHJlOiAvLT9cXGQrKD86XFwuXFxkKyk/KD86cHh8ZW18cmVtfCV8dmh8dnd8dm1pbnx2bWF4fHN8bXN8ZGVnfHJhZHx0dXJufGZyfHB0fHBjfGV4fGNoKT9cXGIveSxcbiAgfSxcbiAge1xuICAgIGtpbmQ6ICdib29sJyxcbiAgICByZTogL1xcYig/Om5vbmV8aW5oZXJpdHxpbml0aWFsfHVuc2V0fGF1dG98aW5saW5lfGJsb2NrfGZsZXh8Z3JpZHxhYnNvbHV0ZXxyZWxhdGl2ZXxmaXhlZHxzdGF0aWN8c3RpY2t5fGhpZGRlbnx2aXNpYmxlKVxcYi95LFxuICB9LFxuXTtcblxuLyoqIEhUTUwgLyBYTUwgXHU4OUM0XHU1MjE5XHUzMDAyYDxgIGA+YCBcdTg4QUJcdTdFQjNcdTUxNjUgdGFnIFx1NkJCNVx1NEVFNVx1OTA3Rlx1NTE0RFx1ODhBQiBlc2NhcGVIdG1sIFx1OEY2Q1x1NjIxMCAmbHQ7IFx1NTQwRVx1NEUyMlx1NTkzMVx1ODlDNlx1ODlDOVx1MzAwMiAqL1xuY29uc3QgSFRNTF9SVUxFUzogUmVhZG9ubHlBcnJheTxSdWxlPiA9IFtcbiAgeyBraW5kOiAnY29tJywgcmU6IC88IS0tW1xcc1xcU10qPy0tPi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCJbXlwiXFxuXSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJ1teJ1xcbl0qJy95IH0sXG4gIHsga2luZDogJ3RhZycsIHJlOiAvPFxcLz9bYS16QS1aXVtcXHctXSoveSB9LFxuICB7IGtpbmQ6ICd0YWcnLCByZTogL1xcLz8+L3kgfSxcbiAgeyBraW5kOiAnYXR0cicsIHJlOiAvXFxiW2EtekEtWl1bXFx3LV0qKD89PSkveSB9LFxuXTtcblxuLyoqIEpTT04gXHU4OUM0XHU1MjE5XHUzMDAya2V5IFx1NkJENCBzdHIgXHU0RjE4XHU1MTQ4XHU1MzM5XHU5MTREXHVGRjA4YFwieFwiYCBcdTU0MEVcdThEREYgYDpgIFx1NjYyRiBrZXlcdUZGMDlcdTMwMDIgKi9cbmNvbnN0IEpTT05fUlVMRVM6IFJlYWRvbmx5QXJyYXk8UnVsZT4gPSBbXG4gIHsga2luZDogJ2F0dHInLCByZTogL1wiKD86XFxcXC58W15cIlxcXFxdKSpcIig/PVxccyo6KS95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCIoPzpcXFxcLnxbXlwiXFxcXF0pKlwiL3kgfSxcbiAgeyBraW5kOiAnYm9vbCcsIHJlOiAvXFxiKD86dHJ1ZXxmYWxzZXxudWxsKVxcYi95IH0sXG4gIHsga2luZDogJ251bScsIHJlOiAvLT9cXGQrKD86XFwuXFxkKyk/KD86W2VFXVsrLV0/XFxkKyk/L3kgfSxcbl07XG5cbmNvbnN0IFBZX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogLyNbXlxcbl0qL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9cIlwiXCJbXFxzXFxTXSo/XCJcIlwiL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC8nJydbXFxzXFxTXSo/JycnL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9cIig/OlxcXFwufFteXCJcXFxcXFxuXSkqXCIveSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogLycoPzpcXFxcLnxbXidcXFxcXFxuXSkqJy95IH0sXG4gIHtcbiAgICBraW5kOiAna3cnLFxuICAgIHJlOiAvXFxiKD86ZGVmfGNsYXNzfHJldHVybnxpZnxlbGlmfGVsc2V8Zm9yfHdoaWxlfGJyZWFrfGNvbnRpbnVlfHBhc3N8aW1wb3J0fGZyb218YXN8dHJ5fGV4Y2VwdHxmaW5hbGx5fHJhaXNlfHdpdGh8eWllbGR8bGFtYmRhfGdsb2JhbHxub25sb2NhbHxpbnxpc3xub3R8YW5kfG9yfGFzeW5jfGF3YWl0KVxcYi95LFxuICB9LFxuICB7IGtpbmQ6ICdib29sJywgcmU6IC9cXGIoPzpUcnVlfEZhbHNlfE5vbmUpXFxiL3kgfSxcbiAgeyBraW5kOiAnbnVtJywgcmU6IC9cXGJcXGQrKD86XFwuXFxkKyk/XFxiL3kgfSxcbiAgeyBraW5kOiAnZm4nLCByZTogL1xcYlthLXpBLVpfXVxcdyooPz1cXHMqXFwoKS95IH0sXG5dO1xuXG5jb25zdCBTSF9SVUxFUzogUmVhZG9ubHlBcnJheTxSdWxlPiA9IFtcbiAgeyBraW5kOiAnY29tJywgcmU6IC8jW15cXG5dKi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCIoPzpcXFxcLnxbXlwiXFxcXF0pKlwiL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC8nW14nXSonL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdrdycsXG4gICAgcmU6IC9cXGIoPzppZnx0aGVufGVsc2V8ZWxpZnxmaXxmb3J8d2hpbGV8ZG98ZG9uZXxjYXNlfGVzYWN8aW58ZnVuY3Rpb258cmV0dXJufGV4cG9ydHxsb2NhbHxyZWFkb25seSlcXGIveSxcbiAgfSxcbiAgeyBraW5kOiAnZm4nLCByZTogL1xcJFxce1tefV0rXFx9fFxcJFxcdysveSB9LFxuXTtcblxuZnVuY3Rpb24gbGFuZ0tleShsYW5nOiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGxhbmcudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2pzJzpcbiAgICBjYXNlICdqc3gnOlxuICAgIGNhc2UgJ2phdmFzY3JpcHQnOlxuICAgIGNhc2UgJ3RzJzpcbiAgICBjYXNlICd0c3gnOlxuICAgIGNhc2UgJ3R5cGVzY3JpcHQnOlxuICAgICAgcmV0dXJuICdqcyc7XG4gICAgY2FzZSAnY3NzJzpcbiAgICBjYXNlICdzY3NzJzpcbiAgICBjYXNlICdsZXNzJzpcbiAgICAgIHJldHVybiAnY3NzJztcbiAgICBjYXNlICdodG1sJzpcbiAgICBjYXNlICd4bWwnOlxuICAgIGNhc2UgJ3Z1ZSc6XG4gICAgY2FzZSAnc3ZnJzpcbiAgICAgIHJldHVybiAnaHRtbCc7XG4gICAgY2FzZSAnanNvbic6XG4gICAgY2FzZSAnanNvbjUnOlxuICAgICAgcmV0dXJuICdqc29uJztcbiAgICBjYXNlICdweSc6XG4gICAgY2FzZSAncHl0aG9uJzpcbiAgICAgIHJldHVybiAncHknO1xuICAgIGNhc2UgJ3NoJzpcbiAgICBjYXNlICdiYXNoJzpcbiAgICBjYXNlICdzaGVsbCc6XG4gICAgY2FzZSAnenNoJzpcbiAgICAgIHJldHVybiAnc2gnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuLyoqXG4gKiBcdTUxNkNcdTUxNzFcdTUxNjVcdTUzRTNcdUZGMUFcdTYyOEEgYGNvZGVgIFx1NjMwOSBgbGFuZ2AgXHU2RTMyXHU2N0QzXHU0RTNBXHU1REYyXHU4RjZDXHU0RTQ5XHU3Njg0IEhUTUwgXHU1QjU3XHU3QjI2XHU0RTMyXHUzMDAyXG4gKlxuICogXHU4QzAzXHU3NTI4XHU2NUI5XHU2MkZGXHU1MjMwXHU3RUQzXHU2NzlDXHU1NDBFXHU3NkY0XHU2M0E1XHU2MkZDXHU1MjMwIGA8cHJlPjxjb2RlPi4uLjwvY29kZT48L3ByZT5gIFx1NTE4NVx1NTM3M1x1NTNFRlx1RkYwQ1x1NjVFMFx1OTcwMFx1NTE4RFx1NkIyMVx1OEY2Q1x1NEU0OVx1MzAwMlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGlnaGxpZ2h0KGNvZGU6IHN0cmluZywgbGFuZzogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChsYW5nS2V5KGxhbmcpKSB7XG4gICAgY2FzZSAnanMnOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIEpTX1JVTEVTKTtcbiAgICBjYXNlICdjc3MnOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIENTU19SVUxFUyk7XG4gICAgY2FzZSAnaHRtbCc6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgSFRNTF9SVUxFUyk7XG4gICAgY2FzZSAnanNvbic6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgSlNPTl9SVUxFUyk7XG4gICAgY2FzZSAncHknOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIFBZX1JVTEVTKTtcbiAgICBjYXNlICdzaCc6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgU0hfUlVMRVMpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZXNjYXBlSHRtbChjb2RlKTtcbiAgfVxufVxuIiwgIi8qKlxuICogXHU2NzgxXHU3QjgwIE1hcmtkb3duIFx1NkUzMlx1NjdEM1x1NTY2OFx1RkYwOHdlYnZpZXcgXHU3QUVGIGlubGluZSBcdTVCOUVcdTczQjBcdUZGMENcdTY1RTBcdTdCMkNcdTRFMDlcdTY1QjlcdTRGOURcdThENTZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTk4OThcdTVFOTNcdTUxODVcdTVCQjlcdTUzMDVcdTU0MkJcdTU5MjdcdTkxQ0YgTWFya2Rvd25cdUZGMUFcdTY4MDdcdTk4OThcdUZGMDhgI2AvYCMjYC4uLlx1RkYwOVx1MzAwMVx1N0M5N1x1NEY1M1x1RkYwOGAqKi4uLioqYFx1RkYwOVx1MzAwMVx1NEVFM1x1NzgwMVx1NTc1N1x1MzAwMVxuICogXHU1MjE3XHU4ODY4XHUzMDAxXHU4ODY4XHU2ODNDXHUzMDAxXHU1RjE1XHU3NTI4XHUzMDAxXHU1MjA2XHU1MjcyXHU3RUJGXHUzMDAxXHU5NEZFXHU2M0E1XHU3QjQ5XHUzMDAyV2VidmlldyBcdTVGQzVcdTk4N0JcdTYyOEFcdTVCODNcdTRFRUNcdTRFRTVcdTYzOTJcdTcyNDhcdTUzQ0JcdTU5N0RcdTc2ODQgSFRNTFxuICogXHU1NDQ4XHU3M0IwXHVGRjBDXHU1NDI2XHU1MjE5XHU1MzlGXHU2NTg3IGAqKmAgYFxcbmAgYCNgIFx1NEYxQVx1NzZGNFx1NjNBNVx1NjYzRVx1NzkzQVx1NTcyOFx1OTc2Mlx1Njc3Rlx1NEUwQVx1RkYwQ1x1NEY1M1x1OUE4Q1x1NUY4OFx1NURFRVx1MzAwMlxuICpcbiAqIFx1NzUzMVx1NEU4RSBWUyBDb2RlIFdlYnZpZXcgXHU3Njg0IENTUCBcdTlFRDhcdThCQTRcdTc5ODFcdTZCNjJcdTU5MTZcdTkwRThcdTgxMUFcdTY3MkNcdTRFMEVcdTY4MzdcdTVGMEZcdUZGMENcdTVGMTVcdTUxNjVcdTdCMkNcdTRFMDlcdTY1QjkgbWFya2Rvd25cbiAqIFx1NUU5M1x1NEYxQVx1OEJBOVx1Njc4NFx1NUVGQS9cdTYyNTNcdTUzMDUvXHU4RDQ0XHU2RTkwXHU1MkEwXHU4RjdEXHU2NkY0XHU1OTBEXHU2NzQyXHVGRjFCXHU2NzJDXHU2MjY5XHU1QzU1XHU0RTVGXHU0RTBEXHU5NzAwXHU4OTgxIEdGTSBcdTUxNjhcdTcyNzlcdTYwMjdcdUZGMENcdTU2RTBcdTZCNjRcdTgxRUFcdTUxOTlcdTRFMDBcdTRFMkFcbiAqIFwiXHU1OTFGXHU3NTI4XCIgXHU3Njg0XHU2RTMyXHU2N0QzXHU1NjY4XHVGRjBDXHU4OTg2XHU3NkQ2XHU1OTgyXHU0RTBCXHU1QjUwXHU5NkM2XHVGRjFBXG4gKlxuICogIC0gQVRYIFx1NjgwN1x1OTg5OCBgIyBIMWAgfiBgIyMjIyMjIEg2YFxuICogIC0gXHU2QkI1XHU4NDNEXHVGRjA4XHU1M0NDXHU2MzYyXHU4ODRDXHU0RjVDXHU1MjA2XHU5Njk0XHVGRjA5XG4gKiAgLSBcdTY1RTBcdTVFOEZcdTUyMTdcdTg4NjhcdUZGMDhgLWAgYCpgIGArYFx1RkYwOS8gXHU2NzA5XHU1RThGXHU1MjE3XHU4ODY4XHVGRjA4YDEuYFx1RkYwOVxuICogIC0gXHU1RjE1XHU3NTI4XHU1NzU3IGA+IC4uLmBcdUZGMDhcdTkwMTJcdTVGNTJcdTZFMzJcdTY3RDNcdTUxODVcdTkwRTggbWFya2Rvd25cdUZGMDlcbiAqICAtIFx1NTZGNFx1NjgwRlx1NEVFM1x1NzgwMVx1NTc1NyBgYGAgbGFuZyAuLi4gYGBgXHVGRjA4XHU4QkVEXHU4QTAwXHU0RkUxXHU2MDZGXHU1M0VBXHU1M0Q2XHU5OTk2XHU2QkI1XHVGRjBDXHU1RkZEXHU3NTY1IGBpZD1cIi4uLlwiYCBcdTdCNDlcdTUxNDNcdTY1NzBcdTYzNkVcdUZGMDlcbiAqICAtIFx1NTIwNlx1NTI3Mlx1N0VCRiBgLS0tYCAvIGAqKipgXG4gKiAgLSBcdTdCODBcdTUzNTVcdTdCQTFcdTkwNTNcdTg4NjhcdTY4M0MgYHwgaCB8IGggfFxcbnwgLSB8IC0gfFxcbnwgYyB8IGMgfGBcbiAqICAtIFx1ODg0Q1x1NTE4NVx1RkYxQWBjb2RlYFx1MzAwMSoqYm9sZCoqXHUzMDAxKml0YWxpYypcdTMwMDFbbGlua10odXJsKVx1MzAwMWA8Y29kZT5gIFx1NURGMlx1ODhBQlx1OEY2Q1x1NEU0OVxuICpcbiAqIFx1NjI0MFx1NjcwOVx1NzUyOFx1NjIzN1x1NjU4N1x1NjcyQ1x1OEZEQlx1NTE2NVx1NkUzMlx1NjdEM1x1NTY2OFx1NEU0Qlx1NTI0RFx1OTBGRFx1NEYxQVx1NTE0OFx1NTA1QSBIVE1MIFx1OEY2Q1x1NEU0OVx1RkYxQlx1NTcyOFx1OEY2Q1x1NEU0OVx1NTQwRVx1NzY4NFx1NjU4N1x1NjcyQ1x1NEUwQVx1NTA1QVx1NkI2M1x1NTIxOVx1NjZGRlx1NjM2Mlx1RkYwQ1xuICogXHU2NUUyXHU5MDdGXHU1MTREIFhTU1x1RkYwOHdlYnZpZXcgXHU1MTg1XHU1MzczXHU0RkJGXHU2NzA5IHZzY29kZS1hcGkgXHU0RTVGXHU0RTBEXHU1RTBDXHU2NzFCXHU2MjY3XHU4ODRDXHU2Q0U4XHU1MTY1XHVGRjA5XHVGRjBDXHU1M0M4XHU0RkREXHU4QkMxXHU0RUUzXHU3ODAxXHU1NzU3XG4gKiBcdTUxODVcdTc2ODQgYDxgIGA+YCBgJmAgXHU1MzlGXHU2ODM3XHU1QzU1XHU3OTNBXHUzMDAyXG4gKlxuICogXHU4QkU1XHU2QTIxXHU1NzU3XHU0RTBEXHU0RjlEXHU4RDU2IERPTVx1RkYxQlx1OEMwM1x1NzUyOFx1NjVCOVx1NjJGRlx1NTIzMFx1NUI1N1x1N0IyNlx1NEUzMlx1NTQwRVx1OEQ0Qlx1NTAzQ1x1N0VEOSBgaW5uZXJIVE1MYFx1MzAwMlxuICpcbiAqIFx1NEVFM1x1NzgwMVx1NTc1N1x1NzY4NFx1OEJFRFx1NkNENVx1Nzc0MFx1ODI3Mlx1NTlENFx1NjI1OFx1N0VEOSBgaGlnaGxpZ2h0LnRzYFx1RkYxQVx1NTcyOFx1NTZGNFx1NjgwRlx1NEVFM1x1NzgwMVx1NTc1N1x1NkUzMlx1NjdEM1x1NTkwNFx1OEMwM1x1NzUyOFxuICogYGhpZ2hsaWdodChjb2RlLCBsYW5nKWAgXHU3NkY0XHU2M0E1XHU2MkZGXHU1MjMwXHU1REYyXHU4RjZDXHU0RTQ5XHU0RTE0XHU1MzA1XHU0RTg2IGA8c3BhbiBjbGFzcz1cImhsLSpcIj5gIFx1NzY4NCBIVE1MXHVGRjBDXG4gKiBcdTU2RTBcdTZCNjRcdTY3MkNcdTY1ODdcdTRFRjZcdTVCRjlcdTRFRTNcdTc4MDFcdTU3NTdcdTUxODVcdTVCQjlcdTRFMERcdTUxOERcdTRFOENcdTZCMjEgZXNjYXBlSHRtbFx1MzAwMlxuICovXG5cbmltcG9ydCB7IGhpZ2hsaWdodCB9IGZyb20gJy4vaGlnaGxpZ2h0LmpzJztcblxuLyoqIFx1NjI4QVx1NUI1N1x1N0IyNlx1NEUzMlx1OEY2Q1x1NEU0OVx1NEUzQVx1NUI4OVx1NTE2OFx1NzY4NCBIVE1MIFx1NjU4N1x1NjcyQ1x1ODI4Mlx1NzBCOVx1NTE4NVx1NUJCOVx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xufVxuXG4vKiogXHU2MjhBIG1hcmtkb3duIFx1NUI1N1x1N0IyNlx1NEUzMlx1NkUzMlx1NjdEM1x1NEUzQSBIVE1MIFx1NUI1N1x1N0IyNlx1NEUzMlx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlck1hcmtkb3duKHNyYzogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghc3JjKSByZXR1cm4gJyc7XG4gIHJldHVybiBibG9ja1JlbmRlcihub3JtYWxpemVOZXdsaW5lcyhzcmMpKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBcdTUxODVcdTkwRThcdTVCOUVcdTczQjBcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBub3JtYWxpemVOZXdsaW5lcyhzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcy5yZXBsYWNlKC9cXHJcXG4/L2csICdcXG4nKTtcbn1cblxuLyoqXG4gKiBcdTU3NTdcdTdFQTdcdTZFMzJcdTY3RDNcdTMwMDJcdTkwMTBcdTg4NENcdTYyNkJcdTYzQ0ZcdUZGMENcdTY4MzlcdTYzNkVcdTg4NENcdTk5OTZcdTcyNzlcdTVGODFcdTUxQjNcdTVCOUFcdTU3NTdcdTdDN0JcdTU3OEJcdUZGMUJcdTZCQjVcdTg0M0RcdTc1MzFcdTdBN0FcdTg4NENcdTUyMDZcdTk2OTRcdTMwMDJcbiAqXG4gKiBcdTVCOUVcdTczQjBcdTYyMTBcdTY3MDlcdTk2NTBcdTcyQjZcdTYwMDFcdTYyNkJcdTYzQ0ZcdUZGMENcdTRGQkZcdTRFOEVcdTU3MjhcdTRFMERcdTVGMTVcdTUxNjUgdG9rZW4gXHU3QzdCXHU3Njg0XHU1MjREXHU2M0QwXHU0RTBCXHU0RkREXHU2MzAxXHU3RUJGXHU2MDI3XHU1OTBEXHU2NzQyXHU1RUE2XHUzMDAyXG4gKi9cbmZ1bmN0aW9uIGJsb2NrUmVuZGVyKHNyYzogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBzcmMuc3BsaXQoJ1xcbicpO1xuICBjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG4gIGxldCBpID0gMDtcbiAgbGV0IHBhcmFncmFwaDogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGxpc3RLaW5kOiAndWwnIHwgJ29sJyB8IG51bGwgPSBudWxsO1xuICBjb25zdCBsaXN0SXRlbXM6IHN0cmluZ1tdID0gW107XG5cbiAgY29uc3QgZmx1c2hQYXJhZ3JhcGggPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKHBhcmFncmFwaC5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBvdXQucHVzaChgPHA+JHtpbmxpbmVSZW5kZXIocGFyYWdyYXBoLmpvaW4oJyAnKSl9PC9wPmApO1xuICAgIHBhcmFncmFwaCA9IFtdO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoTGlzdCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAobGlzdEtpbmQgPT09IG51bGwpIHJldHVybjtcbiAgICBvdXQucHVzaChgPCR7bGlzdEtpbmR9PiR7bGlzdEl0ZW1zLmpvaW4oJycpfTwvJHtsaXN0S2luZH0+YCk7XG4gICAgbGlzdEl0ZW1zLmxlbmd0aCA9IDA7XG4gICAgbGlzdEtpbmQgPSBudWxsO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoQWxsID0gKCk6IHZvaWQgPT4ge1xuICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgZmx1c2hMaXN0KCk7XG4gIH07XG5cbiAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV0gPz8gJyc7XG5cbiAgICAvLyBcdTU2RjRcdTY4MEZcdTRFRTNcdTc4MDFcdTU3NTdcbiAgICBjb25zdCBmZW5jZSA9IC9eYGBgXFxzKihbXlxcc2BdKikvLmV4ZWMobGluZSk7XG4gICAgaWYgKGZlbmNlKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgY29uc3QgbGFuZ1JhdyA9IGZlbmNlWzFdID8/ICcnO1xuICAgICAgLy8gXHU1M0Q2XHU5OTk2XHU0RTJBXHU3QTdBXHU3NjdEXHU1MjREXHU3Njg0XHU5MEU4XHU1MjA2XHU0RjVDXHU0RTNBXHU4QkVEXHU4QTAwXHVGRjBDXHU1RkZEXHU3NTY1IGBpZD1cInowXCJgIFx1N0I0OVx1OTg5RFx1NTkxNlx1NjgwN1x1OEJCMFxuICAgICAgY29uc3QgbGFuZyA9IGxhbmdSYXcuc3BsaXQoL1xccy8pWzBdID8/ICcnO1xuICAgICAgY29uc3QgY29kZUxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaSsrO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgIS9eYGBgXFxzKiQvLnRlc3QobGluZXNbaV0gPz8gJycpKSB7XG4gICAgICAgIGNvZGVMaW5lcy5wdXNoKGxpbmVzW2ldID8/ICcnKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgLy8gXHU4REYzXHU4RkM3XHU3RUQzXHU2NzVGXHU1NkY0XHU2ODBGXHVGRjA4XHU4MkU1XHU2NTg3XHU0RUY2XHU2NzJCXHU1QzNFXHU2NUUwXHU3RUQzXHU2NzVGXHU3QjI2XHU0RTVGXHU1QkI5XHU1RkNEXHVGRjA5XG4gICAgICBpZiAoaSA8IGxpbmVzLmxlbmd0aCkgaSsrO1xuICAgICAgY29uc3QgbGFuZ0NsYXNzID0gbGFuZyA/IGAgY2xhc3M9XCJsYW5nLSR7ZXNjYXBlQXR0cihsYW5nKX1cImAgOiAnJztcbiAgICAgIG91dC5wdXNoKFxuICAgICAgICBgPHByZT48Y29kZSR7bGFuZ0NsYXNzfT4ke2hpZ2hsaWdodChjb2RlTGluZXMuam9pbignXFxuJyksIGxhbmcpfTwvY29kZT48L3ByZT5gLFxuICAgICAgKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIFx1NjgwN1x1OTg5OFxuICAgIGNvbnN0IGhlYWRpbmcgPSAvXigjezEsNn0pXFxzKyguKikkLy5leGVjKGxpbmUpO1xuICAgIGlmIChoZWFkaW5nKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgY29uc3QgbGV2ZWwgPSAoaGVhZGluZ1sxXSA/PyAnJykubGVuZ3RoO1xuICAgICAgb3V0LnB1c2goYDxoJHtsZXZlbH0+JHtpbmxpbmVSZW5kZXIoaGVhZGluZ1syXSA/PyAnJyl9PC9oJHtsZXZlbH0+YCk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBcdTUyMDZcdTUyNzJcdTdFQkZcbiAgICBpZiAoL15cXHMqKFstKl9dKVxcMXsyLH1cXHMqJC8udGVzdChsaW5lKSkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIG91dC5wdXNoKCc8aHIvPicpO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU1RjE1XHU3NTI4XHU1NzU3XHVGRjA4XHU4RkRFXHU3RUVEXHU3Njg0IGA+YCBcdTg4NENcdUZGMDlcbiAgICBpZiAoL15cXHMqPi8udGVzdChsaW5lKSkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGNvbnN0IHF1b3RlTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICB3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiAvXlxccyo+Ly50ZXN0KGxpbmVzW2ldID8/ICcnKSkge1xuICAgICAgICBxdW90ZUxpbmVzLnB1c2goKGxpbmVzW2ldID8/ICcnKS5yZXBsYWNlKC9eXFxzKj5cXHM/LywgJycpKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgb3V0LnB1c2goYDxibG9ja3F1b3RlPiR7YmxvY2tSZW5kZXIocXVvdGVMaW5lcy5qb2luKCdcXG4nKSl9PC9ibG9ja3F1b3RlPmApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU4ODY4XHU2ODNDXHVGRjFBXHU4ODY4XHU1OTM0XHU4ODRDICsgXHU1MjA2XHU5Njk0XHU4ODRDICsgXHU0RUZCXHU2MTBGXHU2NTcwXHU2MzZFXHU4ODRDXG4gICAgaWYgKFxuICAgICAgaXNUYWJsZVJvdyhsaW5lKSAmJlxuICAgICAgaSArIDEgPCBsaW5lcy5sZW5ndGggJiZcbiAgICAgIGlzVGFibGVTZXBhcmF0b3IobGluZXNbaSArIDFdID8/ICcnKVxuICAgICkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGNvbnN0IGhlYWRlckNlbGxzID0gcGFyc2VUYWJsZVJvdyhsaW5lKTtcbiAgICAgIGkgKz0gMjsgLy8gXHU4REYzXHU4RkM3XHU4ODY4XHU1OTM0XHU0RTBFXHU1MjA2XHU5Njk0XHU3QjI2XG4gICAgICBjb25zdCBib2R5Um93czogc3RyaW5nW11bXSA9IFtdO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgaXNUYWJsZVJvdyhsaW5lc1tpXSA/PyAnJykpIHtcbiAgICAgICAgYm9keVJvd3MucHVzaChwYXJzZVRhYmxlUm93KGxpbmVzW2ldID8/ICcnKSk7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgICAgIGxldCB0YWJsZSA9ICc8dGFibGU+PHRoZWFkPjx0cj4nO1xuICAgICAgZm9yIChjb25zdCBjIG9mIGhlYWRlckNlbGxzKSB0YWJsZSArPSBgPHRoPiR7aW5saW5lUmVuZGVyKGMpfTwvdGg+YDtcbiAgICAgIHRhYmxlICs9ICc8L3RyPjwvdGhlYWQ+PHRib2R5Pic7XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiBib2R5Um93cykge1xuICAgICAgICB0YWJsZSArPSAnPHRyPic7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiByb3cpIHRhYmxlICs9IGA8dGQ+JHtpbmxpbmVSZW5kZXIoYyl9PC90ZD5gO1xuICAgICAgICB0YWJsZSArPSAnPC90cj4nO1xuICAgICAgfVxuICAgICAgdGFibGUgKz0gJzwvdGJvZHk+PC90YWJsZT4nO1xuICAgICAgb3V0LnB1c2godGFibGUpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU2NUUwXHU1RThGIC8gXHU2NzA5XHU1RThGXHU1MjE3XHU4ODY4XG4gICAgY29uc3QgdWwgPSAvXlxccypbLSorXVxccysoLiopJC8uZXhlYyhsaW5lKTtcbiAgICBjb25zdCBvbCA9IC9eXFxzKlxcZCtcXC5cXHMrKC4qKSQvLmV4ZWMobGluZSk7XG4gICAgaWYgKHVsIHx8IG9sKSB7XG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xuICAgICAgY29uc3Qga2luZDogJ3VsJyB8ICdvbCcgPSB1bCA/ICd1bCcgOiAnb2wnO1xuICAgICAgaWYgKGxpc3RLaW5kICE9PSBudWxsICYmIGxpc3RLaW5kICE9PSBraW5kKSB7XG4gICAgICAgIGZsdXNoTGlzdCgpO1xuICAgICAgfVxuICAgICAgbGlzdEtpbmQgPSBraW5kO1xuICAgICAgY29uc3QgdGV4dCA9ICh1bCA/IHVsWzFdIDogb2w/LlsxXSkgPz8gJyc7XG4gICAgICBsaXN0SXRlbXMucHVzaChgPGxpPiR7aW5saW5lUmVuZGVyKHRleHQpfTwvbGk+YCk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBcdTdBN0FcdTg4NENcdUZGMUFcdTZCQjVcdTg0M0RcdTUyMDZcdTk2OTRcbiAgICBpZiAobGluZS50cmltKCkgPT09ICcnKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU2NjZFXHU5MDFBXHU2QkI1XHU4NDNEXHU4ODRDXG4gICAgZmx1c2hMaXN0KCk7XG4gICAgcGFyYWdyYXBoLnB1c2gobGluZSk7XG4gICAgaSsrO1xuICB9XG5cbiAgZmx1c2hBbGwoKTtcbiAgcmV0dXJuIG91dC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gaXNUYWJsZVJvdyhsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eXFxzKlxcfC4qXFx8XFxzKiQvLnRlc3QobGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzVGFibGVTZXBhcmF0b3IobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAvXlxccypcXHw/XFxzKjo/LXsyLH06P1xccyooXFx8XFxzKjo/LXsyLH06P1xccyopK1xcfD9cXHMqJC8udGVzdChsaW5lKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VUYWJsZVJvdyhsaW5lOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGxldCBzID0gbGluZS50cmltKCk7XG4gIGlmIChzLnN0YXJ0c1dpdGgoJ3wnKSkgcyA9IHMuc2xpY2UoMSk7XG4gIGlmIChzLmVuZHNXaXRoKCd8JykpIHMgPSBzLnNsaWNlKDAsIC0xKTtcbiAgcmV0dXJuIHMuc3BsaXQoJ3wnKS5tYXAoKGMpID0+IGMudHJpbSgpKTtcbn1cblxuLyoqIFx1ODg0Q1x1NTE4NVx1NkUzMlx1NjdEM1x1RkYxQVx1NTE0OFx1OEY2Q1x1NEU0OVx1RkYwQ1x1NTE4RFx1NTkwNFx1NzQwNiBpbmxpbmUgY29kZVx1RkYwOFx1NTM2MFx1NEY0RFx1NEZERFx1NjJBNFx1RkYwOVx1RkYwQ1x1NTE4RFx1NTkwNFx1NzQwNlx1NTE3Nlx1NEY1OVx1NjgwN1x1OEJCMFx1MzAwMiAqL1xuZnVuY3Rpb24gaW5saW5lUmVuZGVyKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBvdXQgPSBlc2NhcGVIdG1sKHMpO1xuXG4gIC8vIDEpIFx1ODg0Q1x1NTE4NVx1NEVFM1x1NzgwMVx1RkYxQVx1NzUyOFx1NTM2MFx1NEY0RFx1N0IyNlx1NjZGRlx1NjM2Mlx1NEVFNVx1OTA3Rlx1NTE0RFx1ODhBQlx1NTQwRVx1N0VFRFx1ODlDNFx1NTIxOVx1OEJFRlx1NEYyNFxuICBjb25zdCBjb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgb3V0ID0gb3V0LnJlcGxhY2UoL2AoW15gXFxuXSs/KWAvZywgKF8sIGNvZGU6IHN0cmluZykgPT4ge1xuICAgIGNvZGVzLnB1c2goYDxjb2RlPiR7Y29kZX08L2NvZGU+YCk7XG4gICAgcmV0dXJuIGBcXHUwMDAwQyR7Y29kZXMubGVuZ3RoIC0gMX1cXHUwMDAwYDtcbiAgfSk7XG5cbiAgLy8gMikgXHU5NEZFXHU2M0E1IFt0ZXh0XSh1cmwpIFx1MjAxNFx1MjAxNCBcdTRFQzVcdTUxNDFcdThCQjggaHR0cC9odHRwcy9tYWlsdG8gXHU0RTBFXHU3NkY4XHU1QkY5XHU4REVGXHU1Rjg0XHVGRjBDXHU4OUM0XHU5MDdGIGphdmFzY3JpcHQ6XG4gIG91dCA9IG91dC5yZXBsYWNlKFxuICAgIC9cXFsoW15cXF1dKylcXF1cXCgoW14pXSspXFwpL2csXG4gICAgKF8sIHRleHQ6IHN0cmluZywgaHJlZjogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBzYWZlID0gc2FuaXRpemVIcmVmKGhyZWYpO1xuICAgICAgcmV0dXJuIGA8YSBocmVmPVwiJHtzYWZlfVwiIHRhcmdldD1cIl9ibGFua1wiIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIj4ke3RleHR9PC9hPmA7XG4gICAgfSxcbiAgKTtcblxuICAvLyAzKSBcdTUyQTBcdTdDOTcgKyBcdTY1OUNcdTRGNTMgLyBcdTUyQTBcdTdDOTcgLyBcdTY1OUNcdTRGNTNcdUZGMDhcdTk4N0FcdTVFOEZcdTRFMERcdTgwRkRcdTk4QTBcdTUwMTJcdUZGMDlcbiAgb3V0ID0gb3V0LnJlcGxhY2UoL1xcKlxcKlxcKihbXipdKz8pXFwqXFwqXFwqL2csICc8c3Ryb25nPjxlbT4kMTwvZW0+PC9zdHJvbmc+Jyk7XG4gIG91dCA9IG91dC5yZXBsYWNlKC9cXCpcXCooW14qXSs/KVxcKlxcKi9nLCAnPHN0cm9uZz4kMTwvc3Ryb25nPicpO1xuICAvLyBcdTY1OUNcdTRGNTNcdUZGMUFcdTkwN0ZcdTUxNERcdTU0MUVcdTYzODlcdTYyMTBcdTVCRjlcdTUyQTBcdTdDOTdcdTc2ODRcdTUyNjlcdTRGNTkgYCpgXHVGRjBDXHU4OTgxXHU2QzQyXHU1REU2XHU1M0YzXHU5NzVFIGAqYFxuICBvdXQgPSBvdXQucmVwbGFjZSgvKF58W14qXSlcXCooW14qXFxuXSs/KVxcKig/IVxcKikvZywgJyQxPGVtPiQyPC9lbT4nKTtcblxuICAvLyA0KSBcdThGRDhcdTUzOUYgaW5saW5lIGNvZGUgXHU1MzYwXHU0RjREXG4gIG91dCA9IG91dC5yZXBsYWNlKC9cXHUwMDAwQyhcXGQrKVxcdTAwMDAvZywgKF8sIGlkeDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgaSA9IE51bWJlcihpZHgpO1xuICAgIHJldHVybiBjb2Rlc1tpXSA/PyAnJztcbiAgfSk7XG5cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVIcmVmKGhyZWY6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRyaW1tZWQgPSBocmVmLnRyaW0oKTtcbiAgaWYgKC9eKGh0dHBzPzp8bWFpbHRvOnwjfFxcL3xcXC5cXC4/XFwvKS9pLnRlc3QodHJpbW1lZCkpIHtcbiAgICByZXR1cm4gZXNjYXBlQXR0cih0cmltbWVkKTtcbiAgfVxuICAvLyBcdTRFMERcdThCQzZcdTUyMkJcdTc2ODRcdTUzNEZcdThCQUVcdUZGMDhcdTU0MkIgamF2YXNjcmlwdDpcdUZGMDlcdTRFMDBcdTVGOEJcdTk2NERcdTdFQTdcdTRFM0FcdTk1MUFcdTcwQjlcdUZGMENcdTkwN0ZcdTUxNERcdTgxMUFcdTY3MkNcdTYyNjdcdTg4NENcbiAgcmV0dXJuICcjJztcbn1cblxuZnVuY3Rpb24gZXNjYXBlQXR0cihzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xufVxuIiwgIi8qKlxuICogV2VidmlldyBcdTdBRUZcdTUxNjVcdTUzRTNcdUZGMDhQcmFjdGljZSBcdTk3NjJcdTY3N0ZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTU3Mjggd2VidmlldyBpZnJhbWUgXHU1MTg1XHU4RkQwXHU4ODRDXHVGRjBDXHU5MDFBXHU4RkM3IGBhY3F1aXJlVnNDb2RlQXBpKClgIFx1NEUwRVx1NjI2OVx1NUM1NVx1OEZEQlx1N0EwQlx1OTAxQVx1NEZFMVx1MzAwMlxuICpcbiAqIFVJIFx1N0VEM1x1Njc4NFx1RkYwOFx1NEUwRSBwYW5lbC50cyBcdTUxODVcdTVENEMgSFRNTCBcdTU0MENcdTZCNjVcdUZGMDlcdUZGMUFcbiAqICAgLSAucS1oZWFkXHVGRjA4bWV0YSBcdTVGQkRcdTdBRTAgKyBcdTY4MDdcdTk4OTggKyBcdTY1MzZcdTg1Q0ZcdTYzMDlcdTk0QUVcdUZGMDlcbiAqICAgLSAjcXVlc3Rpb24tY29udGVudC5tZFx1RkYwOFx1OTg5OFx1OTc2MiBtYXJrZG93biBcdTZFMzJcdTY3RDNcdUZGMDlcbiAqICAgLSAuYW5zd2VyLXRvZ2dsZSA+ICNidG4tc2hvdy1hbnN3ZXJcdUZGMDhcdTcwQjlcdTUxRkJcdTVDNTVcdTVGMDBcdTdCNTRcdTY4NDhcdUZGMUJcdTVDNTVcdTVGMDBcdTU0MEVcdTY1NzRcdTRGNTNcdTk2OTBcdTg1Q0ZcdUZGMDlcbiAqICAgLSAjYW5zd2VyLWFyZWFcdUZGMDhcdTU0MkIgI2J0bi1jb2xsYXBzZS1hbnN3ZXIgXHU1NzA2XHU1RjYyIFx1MjE5MSBcdTYzMDlcdTk0QUUgKyAjYW5zd2VyLWNvbnRlbnRcdUZGMDlcbiAqICAgLSAjZm9sbG93LXVwc1x1RkYwOFx1OTg5OFx1NzZFRVx1OEZGRFx1OTVFRVx1RkYwOVxuICpcbiAqIFx1NkUzMlx1NjdEM1x1N0I1Nlx1NzU2NVx1RkYxQVx1OTg5OFx1OTc2MiAvIFx1OEJFNlx1N0VDNlx1ODlFM1x1Njc5MCAvIFx1N0I4MFx1N0I1NCAvIFx1OEZGRFx1OTVFRVx1N0I1NFx1Njg0OFx1NTc0N1x1OEQ3MCBgcmVuZGVyTWFya2Rvd25gXHVGRjBDXG4gKiBcdTUxNzZcdTRGNTlcdTc3RURcdTVCNTdcdTdCMjZcdTRFMzJcdTVCNTdcdTZCQjVcdThENzAgYGVzY2FwZUh0bWxgXHUzMDAyXHU5ODk4XHU1NzhCXHU1M0VBXHU2NTM5XHU1M0Q4XHU1RkJEXHU3QUUwXHU2NTg3XHU1QjU3XHU0RTBFXHU3QjVCXHU5MDA5XHU3RUQzXHU2NzlDXHUzMDAyXG4gKi9cblxuaW1wb3J0IHsgZXNjYXBlSHRtbCwgcmVuZGVyTWFya2Rvd24gfSBmcm9tICcuL21hcmtkb3duLmpzJztcblxuZGVjbGFyZSBmdW5jdGlvbiBhY3F1aXJlVnNDb2RlQXBpKCk6IHtcbiAgcG9zdE1lc3NhZ2UobXNnOiB1bmtub3duKTogdm9pZDtcbiAgZ2V0U3RhdGUoKTogdW5rbm93bjtcbiAgc2V0U3RhdGUoc3RhdGU6IHVua25vd24pOiB2b2lkO1xufTtcblxuaW50ZXJmYWNlIEhvc3RUb1dlYnZpZXdNZXNzYWdlIHtcbiAgdHlwZTogc3RyaW5nO1xuICBwYXlsb2FkPzogdW5rbm93bjtcbiAgb2s/OiBib29sZWFuO1xuICByZWFzb24/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBMZWFybmluZ1N0YXRlIHtcbiAgbWFzdGVyeTogJ3VubGVhcm5lZCcgfCAnbGVhcm5pbmcnIHwgJ21hc3RlcmVkJyB8ICdub3RfbWFzdGVyZWQnO1xuICBmYXZvcml0ZUZsYWc6IGJvb2xlYW47XG4gIHdyb25nRmxhZzogYm9vbGVhbjtcbiAgaGFzTm90ZTogYm9vbGVhbjtcbiAgbGFzdFByYWN0aWNlZEF0PzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUXVlc3Rpb24ge1xuICBpZDogc3RyaW5nO1xuICB0eXBlOiAnY29kZScgfCAncWEnO1xuICB0aXRsZTogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG4gIHRhZ3M6IHN0cmluZ1tdO1xuICBkaWZmaWN1bHR5OiAnZWFzeScgfCAnbWVkaXVtJyB8ICdoYXJkJyB8IHN0cmluZztcbiAgYW5zd2VyOiBzdHJpbmc7XG4gIGZvbGxvd1Vwcz86IEFycmF5PHsgcXVlc3Rpb246IHN0cmluZzsgYW5zd2VyPzogc3RyaW5nIH0+O1xufVxuXG5jb25zdCB2c2NvZGUgPSBhY3F1aXJlVnNDb2RlQXBpKCk7XG5cbmZ1bmN0aW9uICQoaWQ6IHN0cmluZyk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG59XG5cbmZ1bmN0aW9uIGRpZmZpY3VsdHlMYWJlbChkOiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGQpIHtcbiAgICBjYXNlICdlYXN5JzpcbiAgICAgIHJldHVybiAnXHU3QjgwXHU1MzU1JztcbiAgICBjYXNlICdtZWRpdW0nOlxuICAgICAgcmV0dXJuICdcdTRFMkRcdTdCNDknO1xuICAgIGNhc2UgJ2hhcmQnOlxuICAgICAgcmV0dXJuICdcdTU2RjBcdTk2QkUnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZDtcbiAgfVxufVxuXG5mdW5jdGlvbiBkaWZmaWN1bHR5Q2xhc3MoZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChkKSB7XG4gICAgY2FzZSAnZWFzeSc6XG4gICAgICByZXR1cm4gJ2RpZmYtZWFzeSc7XG4gICAgY2FzZSAnbWVkaXVtJzpcbiAgICAgIHJldHVybiAnZGlmZi1tZWRpdW0nO1xuICAgIGNhc2UgJ2hhcmQnOlxuICAgICAgcmV0dXJuICdkaWZmLWhhcmQnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuLyoqXG4gKiBcdTkxQ0RcdTdGNkVcdTdCNTRcdTY4NDhcdTUzM0FcdTUyMzBcIlx1NjcyQVx1NUM1NVx1NUYwMFwiXHU3MkI2XHU2MDAxXHUzMDAyXG4gKlxuICogXHU2Q0U4XHU2MTBGXHU1M0VBXHU2RTA1XHU3QTdBIGAjYW5zd2VyLWNvbnRlbnRgIFx1ODAwQ1x1NEUwRFx1NjYyRiBgI2Fuc3dlci1hcmVhYFx1RkYwQ1x1NTZFMFx1NEUzQVx1NTQwRVx1ODAwNVx1OEZEOFx1NTMwNVx1NTQyQlxuICogXHU2NTM2XHU4RDc3XHU2MzA5XHU5NEFFIGAjYnRuLWNvbGxhcHNlLWFuc3dlcmBcdUZGMENcdTY1NzRcdTRGNTNcdTZFMDVcdTdBN0FcdTRGMUFcdTRFMjJcdTU5MzFcdTYzMDlcdTk0QUVcdTMwMDJcbiAqL1xuZnVuY3Rpb24gaGlkZUFuc3dlclNlY3Rpb24oKTogdm9pZCB7XG4gIGNvbnN0IGFyZWEgPSAkKCdhbnN3ZXItYXJlYScpO1xuICBpZiAoYXJlYSkgYXJlYS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgY29uc3QgY29udGVudCA9ICQoJ2Fuc3dlci1jb250ZW50Jyk7XG4gIGlmIChjb250ZW50KSBjb250ZW50LmlubmVySFRNTCA9ICcnO1xuICBjb25zdCBmb2xsb3dVcHNFbCA9ICQoJ2ZvbGxvdy11cHMnKTtcbiAgaWYgKGZvbGxvd1Vwc0VsKSBmb2xsb3dVcHNFbC5pbm5lckhUTUwgPSAnJztcbiAgLy8gbWFzdGVyeS1mYWIgXHU1NzI4XHU3QjU0XHU2ODQ4XHU1QzU1XHU1RjAwXHU2NUY2XHU4OEFCXHU3OUZCXHU1MjMwIC5hbnN3ZXItYWN0aW9uc1x1RkYwQ1x1OEZEOVx1OTFDQ1x1ODk4MVx1NjI4QVx1NUI4M1x1NjQyQ1x1NTZERVx1NTIzMCAuYW5zd2VyLXRvZ2dsZVxuICAvLyBcdTk4NzZcdTkwRThcdTRGNERcdTdGNkVcdUZGMUJcdThGRDlcdTY4MzdcdTY3MkFcdTVDNTVcdTVGMDBcdTcyQjZcdTYwMDFcdTRFMEJcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTYzMDlcdTk0QUVcdTU5Q0JcdTdFQzhcdTU3MjggXCJcdTY3RTVcdTc3MEJcdTdCNTRcdTY4NDhcIiBcdTg4NENcdTc2ODRcdTUzRjNcdTRGQTdcdTMwMDJcbiAgbW92ZU1hc3RlcnlUb1RvZ2dsZSgpO1xuICBjb25zdCB0b2dnbGUgPSAkKCdhbnN3ZXItdG9nZ2xlJyk7XG4gIGlmICh0b2dnbGUpIHRvZ2dsZS5oaWRkZW4gPSBmYWxzZTtcbiAgY29uc3Qgc2hvd0J0biA9ICQoJ2J0bi1zaG93LWFuc3dlcicpO1xuICBpZiAoc2hvd0J0bikgc2hvd0J0bi5yZW1vdmVBdHRyaWJ1dGUoJ2hpZGRlbicpO1xuICBoaWRlTWFzdGVyeU9wdGlvbnMoKTtcbn1cblxuLyoqXG4gKiBcdTYyOEEgI21hc3RlcnktZmFiIFx1NzlGQlx1NTIzMFx1N0I1NFx1Njg0OFx1NUM1NVx1NUYwMFx1NjVGNlx1NzY4NFx1NUJCOVx1NTY2OFx1RkYwOC5hbnN3ZXItYWN0aW9ucyBcdTUxODVcdTMwMDFcdTY1MzZcdThENzdcdTYzMDlcdTk0QUVcdTVERTZcdThGQjlcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTc1MjggRE9NIFx1NzlGQlx1NTJBOFx1ODAwQ1x1NEUwRFx1NjYyRlx1NTNDQ1x1NEVGRCBET00gXHU1QjlFXHU0RjhCXHVGRjBDXHU5MDdGXHU1MTREXHU2MzA5XHU5NEFFXCJcdTVDNTVcdTVGMDAvXHU5MDA5XHU0RTJEXCJcdTcyQjZcdTYwMDFcdTU3MjhcdTRFMjRcdTU5MDRcdTRFMERcdTU0MENcdTZCNjVcdTMwMDJcbiAqL1xuZnVuY3Rpb24gbW92ZU1hc3RlcnlUb0Fuc3dlcigpOiB2b2lkIHtcbiAgY29uc3QgZmFiID0gJCgnbWFzdGVyeS1mYWInKTtcbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hbnN3ZXItYWN0aW9ucycpO1xuICBjb25zdCBjb2xsYXBzZSA9ICQoJ2J0bi1jb2xsYXBzZS1hbnN3ZXInKTtcbiAgaWYgKCFmYWIgfHwgIWFjdGlvbnMgfHwgIWNvbGxhcHNlKSByZXR1cm47XG4gIGlmIChmYWIucGFyZW50RWxlbWVudCA9PT0gYWN0aW9ucykgcmV0dXJuO1xuICBhY3Rpb25zLmluc2VydEJlZm9yZShmYWIsIGNvbGxhcHNlKTtcbn1cblxuLyoqIFx1NjI4QSAjbWFzdGVyeS1mYWIgXHU3OUZCXHU1NkRFXHU2NzJBXHU1QzU1XHU1RjAwXHU3MkI2XHU2MDAxXHU3Njg0XHU1QkI5XHU1NjY4XHVGRjA4LmFuc3dlci10b2dnbGUgXHU1MTg1XHUzMDAxXHU2N0U1XHU3NzBCXHU3QjU0XHU2ODQ4XHU2MzA5XHU5NEFFXHU1M0YzXHU4RkI5XHVGRjA5XHUzMDAyICovXG5mdW5jdGlvbiBtb3ZlTWFzdGVyeVRvVG9nZ2xlKCk6IHZvaWQge1xuICBjb25zdCBmYWIgPSAkKCdtYXN0ZXJ5LWZhYicpO1xuICBjb25zdCB0b2dnbGUgPSAkKCdhbnN3ZXItdG9nZ2xlJyk7XG4gIGlmICghZmFiIHx8ICF0b2dnbGUpIHJldHVybjtcbiAgaWYgKGZhYi5wYXJlbnRFbGVtZW50ID09PSB0b2dnbGUpIHJldHVybjtcbiAgdG9nZ2xlLmFwcGVuZENoaWxkKGZhYik7XG59XG5cbi8qKiBcdTUxNzNcdTk1RURcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTZENkVcdTUyQThcdTkwMDlcdTk4NzlcdTgzRENcdTUzNTVcdTMwMDIgKi9cbmZ1bmN0aW9uIGhpZGVNYXN0ZXJ5T3B0aW9ucygpOiB2b2lkIHtcbiAgY29uc3Qgb3B0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tYXN0ZXJ5LW9wdGlvbnMnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChvcHRzKSBvcHRzLmhpZGRlbiA9IHRydWU7XG4gIGNvbnN0IHRyaWdnZXIgPSAkKCdidG4tbWFzdGVyeScpO1xuICBpZiAodHJpZ2dlcikgdHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcbn1cblxuLyoqIFx1NjI4QSBtYXN0ZXJ5IFx1NTAzQ1x1NjYyMFx1NUMwNFx1NjIxMFx1NEUzQlx1NjMwOVx1OTRBRVx1NEUyRFx1NTkyRVx1NjYzRVx1NzkzQVx1NzY4NFx1NUI1N1x1N0IyNlx1MzAwMiAqL1xuZnVuY3Rpb24gbWFzdGVyeUljb24obTogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChtKSB7XG4gICAgY2FzZSAnbWFzdGVyZWQnOlxuICAgICAgcmV0dXJuICdcdTI3MTMnO1xuICAgIGNhc2UgJ25vdF9tYXN0ZXJlZCc6XG4gICAgICByZXR1cm4gJ1x1MjVENCc7XG4gICAgY2FzZSAnbGVhcm5pbmcnOlxuICAgICAgcmV0dXJuICdcdTI1RDQnO1xuICAgIGNhc2UgJ3VubGVhcm5lZCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnXHUyNUNCJztcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJRdWVzdGlvbihxdWVzdGlvbjogUXVlc3Rpb24pOiB2b2lkIHtcbiAgY29uc3QgdGl0bGVFbCA9ICQoJ3F1ZXN0aW9uLXRpdGxlJyk7XG4gIGlmICh0aXRsZUVsKSB0aXRsZUVsLnRleHRDb250ZW50ID0gcXVlc3Rpb24udGl0bGU7XG5cbiAgLy8gbWV0YSBcdTVGQkRcdTdBRTAgLyBcdTY4MDdcdTdCN0VcbiAgY29uc3QgbWV0YUVsID0gJCgncXVlc3Rpb24tbWV0YScpO1xuICBpZiAobWV0YUVsKSB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgcGFydHMucHVzaChcbiAgICAgIGA8c3BhbiBjbGFzcz1cInBpbGwgJHtxdWVzdGlvbi50eXBlID09PSAnY29kZScgPyAndHlwZS1jb2RlJyA6ICd0eXBlLXFhJ31cIj4ke1xuICAgICAgICBxdWVzdGlvbi50eXBlID09PSAnY29kZScgPyAnXHU0RUUzXHU3ODAxXHU5ODk4JyA6ICdcdTk1RUVcdTdCNTRcdTk4OTgnXG4gICAgICB9PC9zcGFuPmAsXG4gICAgKTtcbiAgICBwYXJ0cy5wdXNoKFxuICAgICAgYDxzcGFuIGNsYXNzPVwicGlsbCAke2RpZmZpY3VsdHlDbGFzcyhxdWVzdGlvbi5kaWZmaWN1bHR5KX1cIj4ke2VzY2FwZUh0bWwoXG4gICAgICAgIGRpZmZpY3VsdHlMYWJlbChxdWVzdGlvbi5kaWZmaWN1bHR5KSxcbiAgICAgICl9PC9zcGFuPmAsXG4gICAgKTtcbiAgICBpZiAocXVlc3Rpb24uY2F0ZWdvcnkpIHtcbiAgICAgIHBhcnRzLnB1c2goXG4gICAgICAgIGA8c3BhbiBjbGFzcz1cInBpbGwgY2F0ZWdvcnlcIj4ke2VzY2FwZUh0bWwocXVlc3Rpb24uY2F0ZWdvcnkpfTwvc3Bhbj5gLFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocXVlc3Rpb24udGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgdCBvZiBxdWVzdGlvbi50YWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdCA9PT0gJ3N0cmluZycgJiYgdC5sZW5ndGggPiAwICYmIHQgIT09IHF1ZXN0aW9uLmNhdGVnb3J5KSB7XG4gICAgICAgICAgcGFydHMucHVzaChgPHNwYW4gY2xhc3M9XCJ0YWdcIj4ke2VzY2FwZUh0bWwodCl9PC9zcGFuPmApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIG1ldGFFbC5pbm5lckhUTUwgPSBwYXJ0cy5qb2luKCcnKTtcbiAgfVxuXG4gIC8vIFx1OTg5OFx1OTc2Mlx1RkYxQW1hcmtkb3duIFx1NkUzMlx1NjdEM1xuICBjb25zdCBjb250ZW50RWwgPSAkKCdxdWVzdGlvbi1jb250ZW50Jyk7XG4gIGlmIChjb250ZW50RWwpIGNvbnRlbnRFbC5pbm5lckhUTUwgPSByZW5kZXJNYXJrZG93bihxdWVzdGlvbi5jb250ZW50KTtcblxuICAvLyBcdTUyMDdcdTk4OThcdTY1RjZcdTkxQ0RcdTdGNkVcdTdCNTRcdTY4NDhcdTUzM0FcdTUyMzBcdTY3MkFcdTVDNTVcdTVGMDBcdTcyQjZcdTYwMDFcbiAgaGlkZUFuc3dlclNlY3Rpb24oKTtcbn1cblxuLyoqXG4gKiBcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTc2RjhcdTUxNzMgVUkgXHU2NkY0XHU2NUIwXHUzMDAyXG4gKlxuICogXHU2ODA3XHU5ODk4XHU2ODBGXHU1M0YzXHU0RkE3XHU3Njg0XHU2NTM2XHU4NUNGXHU2NjFGXHU2MzA5XHU5NEFFICsgXHU3QjU0XHU2ODQ4IHRvZ2dsZSBcdTg4NENcdTUzRjNcdTRGQTdcdTc2ODRcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTZENkVcdTUyQThcdTYzMDlcdTk0QUVcdTdFQzRcdUZGMUFcbiAqICAtIFx1NjUzNlx1ODVDRlx1RkYxQWFjdGl2ZSBjbGFzcyArIGFyaWEgXHU2NTg3XHU2ODQ4XHVGRjFCXG4gKiAgLSBcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTRFM0JcdTYzMDlcdTk0QUVcdUZGMUFcdTY2M0VcdTc5M0FcdTYzOENcdTYzRTFcdTcyQjZcdTYwMDFcdUZGMUJcdTk1MTlcdTk4OThcdTY4MDdcdThCQjBcdTVGMDBcdTU0MkZcdTY1RjZcdTRGMThcdTUxNDhcdTY2M0VcdTc5M0FcdTk1MTlcdTk4OThcdUZGMUJcbiAqICAtIFx1NjM4Q1x1NjNFMVx1NzJCNlx1NjAwMVx1NEUwRVx1OTUxOVx1OTg5OFx1NjMwOVx1OTRBRVx1NTIwNlx1NTIyQlx1N0VGNFx1NjJBNFx1ODFFQVx1NURGMVx1NzY4NCBhY3RpdmUgXHU5QUQ4XHU0RUFFXHUzMDAyXG4gKlxuICogXHU1MTY1XHU1M0MyXHU3QzdCXHU1NzhCXHU0RUNEXHU0RkREXHU3NTU5XHU1QjhDXHU2NTc0IExlYXJuaW5nU3RhdGVcdUZGMENcdTYyNjlcdTVDNTVcdTdBRUZcdTUzNEZcdThCQUVcdTRFMERcdTUzRDhcdTMwMDJcbiAqL1xuZnVuY3Rpb24gdXBkYXRlTGVhcm5pbmdVSShsZWFybmluZzogTGVhcm5pbmdTdGF0ZSk6IHZvaWQge1xuICBjb25zdCBmYXZCdG4gPSAkKCdidG4tZmF2b3JpdGUnKTtcbiAgaWYgKGZhdkJ0bikge1xuICAgIGZhdkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBsZWFybmluZy5mYXZvcml0ZUZsYWcpO1xuICAgIGZhdkJ0bi5zZXRBdHRyaWJ1dGUoXG4gICAgICAnYXJpYS1sYWJlbCcsXG4gICAgICBsZWFybmluZy5mYXZvcml0ZUZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU2NTM2XHU4NUNGJyA6ICdcdTY1MzZcdTg1Q0YnLFxuICAgICk7XG4gICAgZmF2QnRuLnNldEF0dHJpYnV0ZSgndGl0bGUnLCBsZWFybmluZy5mYXZvcml0ZUZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU2NTM2XHU4NUNGJyA6ICdcdTY1MzZcdTg1Q0YnKTtcbiAgfVxuXG4gIC8vIFx1NjM4Q1x1NjNFMVx1NzJCNlx1NjAwMVx1NjMwOVx1OTRBRVx1NzY4NCBhY3RpdmUgY2xhc3NcdUZGMDhsZWFybmluZyBcdTRFQzVcdTRFM0FcdTY1RTdcdTY1NzBcdTYzNkVcdTUxN0NcdTVCQjlcdUZGMENcdTRFMERcdTUxOERcdTYzRDBcdTRGOUJcdTYzMDlcdTk0QUVcdUZGMDlcbiAgY29uc3QgbWFzdGVyeVZhbHVlcyA9IFsndW5sZWFybmVkJywgJ2xlYXJuaW5nJywgJ21hc3RlcmVkJywgJ25vdF9tYXN0ZXJlZCddO1xuICBmb3IgKGNvbnN0IG0gb2YgbWFzdGVyeVZhbHVlcykge1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICBgW2RhdGEtbWFzdGVyeT1cIiR7bX1cIl1gLFxuICAgICkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghYnRuKSBjb250aW51ZTtcbiAgICBidG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgbSA9PT0gbGVhcm5pbmcubWFzdGVyeSk7XG4gIH1cblxuICBjb25zdCB3cm9uZ0J0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXdyb25nXScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgaWYgKHdyb25nQnRuKSB7XG4gICAgd3JvbmdCdG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgbGVhcm5pbmcud3JvbmdGbGFnKTtcbiAgICB3cm9uZ0J0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsZWFybmluZy53cm9uZ0ZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU5NTE5XHU5ODk4XHU2ODA3XHU4QkIwJyA6ICdcdTY4MDdcdThCQjBcdTRFM0FcdTk1MTlcdTk4OTgnKTtcbiAgICB3cm9uZ0J0bi5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgbGVhcm5pbmcud3JvbmdGbGFnID8gJ1x1NTNENlx1NkQ4OFx1OTUxOVx1OTg5OFx1NjgwN1x1OEJCMCcgOiAnXHU2ODA3XHU4QkIwXHU0RTNBXHU5NTE5XHU5ODk4Jyk7XG4gIH1cblxuICAvLyBcdTRFM0JcdTg5RTZcdTUzRDFcdTYzMDlcdTk0QUVcdUZGMUFcdTZFMDVcdTYzODlcdTYyNDBcdTY3MDkgaXMtKiBcdTUxOERcdTUyQTBcdTVGNTNcdTUyNEQgbWFzdGVyeSBcdTc2ODQgY2xhc3NcdUZGMENcdTY2RjRcdTY1QjBcdTRFMkRcdTVGQzNcdTVCNTdcdTdCMjZcbiAgY29uc3QgdHJpZ2dlciA9ICQoJ2J0bi1tYXN0ZXJ5Jyk7XG4gIGlmICh0cmlnZ2VyKSB7XG4gICAgZm9yIChjb25zdCBtIG9mIG1hc3RlcnlWYWx1ZXMpIHtcbiAgICAgIHRyaWdnZXIuY2xhc3NMaXN0LnJlbW92ZShgaXMtJHttfWApO1xuICAgIH1cbiAgICB0cmlnZ2VyLmNsYXNzTGlzdC5yZW1vdmUoJ2lzLXdyb25nJyk7XG4gICAgdHJpZ2dlci5jbGFzc0xpc3QuYWRkKGxlYXJuaW5nLndyb25nRmxhZyA/ICdpcy13cm9uZycgOiBgaXMtJHtsZWFybmluZy5tYXN0ZXJ5fWApO1xuICAgIGNvbnN0IGljb24gPSB0cmlnZ2VyLnF1ZXJ5U2VsZWN0b3IoJy5tYXN0ZXJ5LWljb24nKTtcbiAgICBpZiAoaWNvbikgaWNvbi50ZXh0Q29udGVudCA9IGxlYXJuaW5nLndyb25nRmxhZyA/ICdcdTI3MTcnIDogbWFzdGVyeUljb24obGVhcm5pbmcubWFzdGVyeSk7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEFuc3dlclBheWxvYWQge1xuICBxdWVzdGlvblR5cGU6ICdjb2RlJyB8ICdxYSc7XG4gIGFuc3dlcjpcbiAgICB8IHtcbiAgICAgIGtpbmQ6ICdyZWZlcmVuY2UnO1xuICAgICAgICBicmllZkFuc3dlcj86IHN0cmluZztcbiAgICAgICAgZGV0YWlsZWRBbnN3ZXI/OiBzdHJpbmc7XG4gICAgICAgIGZvbGxvd1Vwcz86IEFycmF5PHsgcXVlc3Rpb246IHN0cmluZzsgYW5zd2VyPzogc3RyaW5nIH0+O1xuICAgICAgfVxuICAgIHwgeyBraW5kOiAnbm9uZSc7IGhpbnQ6IHN0cmluZyB9O1xufVxuXG5mdW5jdGlvbiBzaG93QW5zd2VyKHBheWxvYWQ6IEFuc3dlclBheWxvYWQpOiB2b2lkIHtcbiAgY29uc3QgYXJlYSA9ICQoJ2Fuc3dlci1hcmVhJyk7XG4gIGNvbnN0IGNvbnRlbnQgPSAkKCdhbnN3ZXItY29udGVudCcpO1xuICBpZiAoIWFyZWEgfHwgIWNvbnRlbnQpIHJldHVybjtcblxuICBhcmVhLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXG4gIGNvbnN0IGFucyA9IHBheWxvYWQuYW5zd2VyO1xuICBpZiAoYW5zLmtpbmQgPT09ICdub25lJykge1xuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiYW5zd2VyLWxhYmVsXCI+XHU1M0MyXHU4MDAzXHU3QjU0XHU2ODQ4PC9zcGFuPjxwPiR7ZXNjYXBlSHRtbChcbiAgICAgIGFucy5oaW50ID8/ICdcdThCRTVcdTk4OThcdTY2ODJcdTY1RTBcdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDgnLFxuICAgICl9PC9wPmA7XG4gIH0gZWxzZSB7XG4gICAgbGV0IGh0bWwgPSAnPHNwYW4gY2xhc3M9XCJhbnN3ZXItbGFiZWxcIj5cdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDg8L3NwYW4+JztcbiAgICBpZiAoYW5zLmJyaWVmQW5zd2VyKSB7XG4gICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiYnJpZWYgbWRcIj4ke3JlbmRlck1hcmtkb3duKGFucy5icmllZkFuc3dlcil9PC9kaXY+YDtcbiAgICB9XG4gICAgaWYgKGFucy5kZXRhaWxlZEFuc3dlcikge1xuICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImRldGFpbGVkIG1kXCI+PGgzPlx1OEJFNlx1N0VDNlx1ODlFM1x1Njc5MDwvaDM+JHtyZW5kZXJNYXJrZG93bihhbnMuZGV0YWlsZWRBbnN3ZXIpfTwvZGl2PmA7XG4gICAgfVxuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gaHRtbDtcbiAgfVxuXG4gIC8vIFx1OEZGRFx1OTVFRVx1RkYwOFx1NEUyNFx1NzlDRFx1OTg5OFx1NTc4Qlx1NTE3MVx1NzUyOFx1RkYwOVxuICBjb25zdCBmb2xsb3dVcHNFbCA9ICQoJ2ZvbGxvdy11cHMnKTtcbiAgaWYgKGZvbGxvd1Vwc0VsKSB7XG4gICAgaWYgKFxuICAgICAgYW5zLmtpbmQgPT09ICdyZWZlcmVuY2UnICYmXG4gICAgICBBcnJheS5pc0FycmF5KGFucy5mb2xsb3dVcHMpICYmXG4gICAgICBhbnMuZm9sbG93VXBzLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIGxldCBmdUh0bWwgPSAnPGgyIGNsYXNzPVwiZm9sbG93dXBzLXRpdGxlXCI+XHU4RkZEXHU5NUVFPC9oMj4nO1xuICAgICAgZm9yIChjb25zdCBmdSBvZiBhbnMuZm9sbG93VXBzKSB7XG4gICAgICAgIGZ1SHRtbCArPSAnPGRpdiBjbGFzcz1cImZvbGxvdy11cFwiPic7XG4gICAgICAgIGZ1SHRtbCArPSBgPGRpdiBjbGFzcz1cImZvbGxvdy11cC1xXCI+JHtlc2NhcGVIdG1sKGZ1LnF1ZXN0aW9uKX08L2Rpdj5gO1xuICAgICAgICBpZiAoZnUuYW5zd2VyKSB7XG4gICAgICAgICAgZnVIdG1sICs9IGA8ZGl2IGNsYXNzPVwiZm9sbG93LXVwLWEgbWRcIj4ke3JlbmRlck1hcmtkb3duKGZ1LmFuc3dlcil9PC9kaXY+YDtcbiAgICAgICAgfVxuICAgICAgICBmdUh0bWwgKz0gJzwvZGl2Pic7XG4gICAgICB9XG4gICAgICBmb2xsb3dVcHNFbC5pbm5lckhUTUwgPSBmdUh0bWw7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvbGxvd1Vwc0VsLmlubmVySFRNTCA9ICcnO1xuICAgIH1cbiAgfVxuXG4gIC8vIFx1NTIwN1x1NjM2MiB0b2dnbGUgXHU1MzNBXHU1MjMwXHU5NjkwXHU4NUNGXHU3MkI2XHU2MDAxXHVGRjA4XHU1NDBDXHU2NUY2XHU2MjhBIHNob3cgXHU2MzA5XHU5NEFFIGhpZGVcdUZGMENcdTRFRTVcdTU5MDdcdTVDMDZcdTY3NjVcdTkxQ0RcdTY1QjBcdTY2M0VcdTc5M0FcdUZGMDlcdUZGMUJcbiAgLy8gXHU2MjhBIG1hc3RlcnktZmFiIERPTSBcdTc5RkJcdTUyMzBcdTdCNTRcdTY4NDhcdTUzM0FcdTVFOTVcdTkwRThcdTUzRjNcdTRFMEJcdTg5RDJcdTc2ODQgLmFuc3dlci1hY3Rpb25zIFx1NTE4NVx1MzAwMlxuICBjb25zdCB0b2dnbGUgPSAkKCdhbnN3ZXItdG9nZ2xlJyk7XG4gIGlmICh0b2dnbGUpIHRvZ2dsZS5oaWRkZW4gPSB0cnVlO1xuICBjb25zdCBzaG93QnRuID0gJCgnYnRuLXNob3ctYW5zd2VyJyk7XG4gIGlmIChzaG93QnRuKSBzaG93QnRuLnNldEF0dHJpYnV0ZSgnaGlkZGVuJywgJycpO1xuICBoaWRlTWFzdGVyeU9wdGlvbnMoKTtcbiAgbW92ZU1hc3RlcnlUb0Fuc3dlcigpO1xufVxuXG5sZXQgc3RhdHVzVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBzaG93U3RhdHVzKG1zZzogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IGVsID0gJCgnc3RhdHVzLW1lc3NhZ2UnKTtcbiAgaWYgKCFlbCkgcmV0dXJuO1xuICBlbC50ZXh0Q29udGVudCA9IG1zZztcbiAgZWwuY2xhc3NMaXN0LmFkZCgnc2hvdycpO1xuICBpZiAoc3RhdHVzVGltZXIgIT09IHVuZGVmaW5lZCkgY2xlYXJUaW1lb3V0KHN0YXR1c1RpbWVyKTtcbiAgc3RhdHVzVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdzaG93Jyk7XG4gIH0sIDI0MDApO1xufVxuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAkKCdidG4tc2hvdy1hbnN3ZXInKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3JlcXVlc3RBbnN3ZXInIH0pO1xuICB9KTtcblxuICAkKCdidG4tY29sbGFwc2UtYW5zd2VyJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGhpZGVBbnN3ZXJTZWN0aW9uKCk7XG4gIH0pO1xuXG4gICQoJ2J0bi1mYXZvcml0ZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICB2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAndG9nZ2xlRmF2b3JpdGUnIH0pO1xuICB9KTtcblxuICAvLyBcdTVCNjZcdTRFNjBcdTcyQjZcdTYwMDFcdTRFM0JcdTYzMDlcdTk0QUVcdUZGMUF0b2dnbGUgNCBcdTRFMkFcdTkwMDlcdTk4NzlcdTc2ODRcdTUzRUZcdTg5QzFcdTYwMjdcbiAgJCgnYnRuLW1hc3RlcnknKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgY29uc3Qgb3B0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tYXN0ZXJ5LW9wdGlvbnMnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgdHJpZ2dlciA9ICQoJ2J0bi1tYXN0ZXJ5Jyk7XG4gICAgaWYgKCFvcHRzKSByZXR1cm47XG4gICAgY29uc3Qgd2lsbFNob3cgPSBvcHRzLmhpZGRlbjtcbiAgICBvcHRzLmhpZGRlbiA9ICF3aWxsU2hvdztcbiAgICBpZiAodHJpZ2dlcikgdHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCB3aWxsU2hvdyA/ICd0cnVlJyA6ICdmYWxzZScpO1xuICB9KTtcblxuICAvLyA0IFx1NEUyQVx1OTAwOVx1OTg3OVx1NjMwOVx1OTRBRVx1RkYxQVx1NTNEMVx1NTFGQSBzZXRNYXN0ZXJ5XHVGRjBDXHU1RTc2XHU3QUNCXHU1MjNCXHU1MTczXHU5NUVEXHU2RDZFXHU1MkE4XHU4M0RDXHU1MzU1XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLW1hc3RlcnldJykuZm9yRWFjaCgoYnRuKSA9PiB7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICBjb25zdCB2YWx1ZSA9IChidG4gYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRbJ21hc3RlcnknXTtcbiAgICAgIGlmICh2YWx1ZSkgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3NldE1hc3RlcnknLCB2YWx1ZSB9KTtcbiAgICAgIGhpZGVNYXN0ZXJ5T3B0aW9ucygpO1xuICAgIH0pO1xuICB9KTtcblxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS13cm9uZ10nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3RvZ2dsZVdyb25nJyB9KTtcbiAgICBoaWRlTWFzdGVyeU9wdGlvbnMoKTtcbiAgfSk7XG5cbiAgLy8gXHU3MEI5XHU1MUZCIGZhYiBcdTRFNEJcdTU5MTZcdTc2ODRcdTRFRkJcdTYxMEZcdTRGNERcdTdGNkVcdTUxNzNcdTk1RURcdTZENkVcdTUyQThcdTgzRENcdTUzNTVcdUZGMDhcdTRFMERcdTk2M0JcdTZCNjJcdTRFOEJcdTRFRjZcdUZGMENcdThCQTlcdTUzOUZcdTY3MkNcdTc2ODRcdTcwQjlcdTUxRkJcdTRFQ0RcdTc1MUZcdTY1NDhcdUZGMDlcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGNvbnN0IGZhYiA9ICQoJ21hc3RlcnktZmFiJyk7XG4gICAgaWYgKCFmYWIpIHJldHVybjtcbiAgICBpZiAoZmFiLmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgaGlkZU1hc3RlcnlPcHRpb25zKCk7XG4gIH0pO1xuXG4gIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdyZWFkeScgfSk7XG59KTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZXZlbnQpID0+IHtcbiAgY29uc3QgbXNnID0gZXZlbnQuZGF0YSBhcyBIb3N0VG9XZWJ2aWV3TWVzc2FnZTtcbiAgc3dpdGNoIChtc2cudHlwZSkge1xuICAgIGNhc2UgJ2luaXQnOiB7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbXNnLnBheWxvYWQgYXMgeyBxdWVzdGlvbjogUXVlc3Rpb247IGxlYXJuaW5nOiBMZWFybmluZ1N0YXRlIH07XG4gICAgICByZW5kZXJRdWVzdGlvbihwYXlsb2FkLnF1ZXN0aW9uKTtcbiAgICAgIHVwZGF0ZUxlYXJuaW5nVUkocGF5bG9hZC5sZWFybmluZyk7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnc2hvd0Fuc3dlcic6IHtcbiAgICAgIHNob3dBbnN3ZXIobXNnLnBheWxvYWQgYXMgQW5zd2VyUGF5bG9hZCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAncm9sbGJhY2snOlxuICAgIGNhc2UgJ3JlZnJlc2hMZWFybmluZyc6IHtcbiAgICAgIGNvbnN0IGxlYXJuaW5nID0gbXNnLnBheWxvYWQgYXMgTGVhcm5pbmdTdGF0ZTtcbiAgICAgIGlmIChsZWFybmluZykgdXBkYXRlTGVhcm5pbmdVSShsZWFybmluZyk7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnZmF2b3JpdGVBY2snOiB7XG4gICAgICBpZiAoIW1zZy5vaykgc2hvd1N0YXR1cyhgXHU2NTM2XHU4NUNGXHU2NENEXHU0RjVDXHU1OTMxXHU4RDI1OiAke21zZy5yZWFzb24gPz8gJ1x1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRid9YCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnbWFzdGVyeUFjayc6IHtcbiAgICAgIGlmICghbXNnLm9rKSBzaG93U3RhdHVzKGBcdTYzOENcdTYzRTFcdTcyQjZcdTYwMDFcdTY2RjRcdTY1QjBcdTU5MzFcdThEMjU6ICR7bXNnLnJlYXNvbiA/PyAnXHU2NzJBXHU3N0U1XHU5NTE5XHU4QkVGJ31gKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICd3cm9uZ0Fjayc6IHtcbiAgICAgIGlmICghbXNnLm9rKSBzaG93U3RhdHVzKGBcdTk1MTlcdTk4OThcdTY4MDdcdThCQjBcdTY2RjRcdTY1QjBcdTU5MzFcdThEMjU6ICR7bXNnLnJlYXNvbiA/PyAnXHU2NzJBXHU3N0U1XHU5NTE5XHU4QkVGJ31gKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUF3QkEsV0FBUyxXQUFXLEdBQW1CO0FBQ3JDLFdBQU8sRUFDSixRQUFRLE1BQU0sT0FBTyxFQUNyQixRQUFRLE1BQU0sTUFBTSxFQUNwQixRQUFRLE1BQU0sTUFBTSxFQUNwQixRQUFRLE1BQU0sUUFBUSxFQUN0QixRQUFRLE1BQU0sT0FBTztBQUFBLEVBQzFCO0FBUUEsV0FBUyxTQUFTLEtBQWEsT0FBb0M7QUFDakUsUUFBSSxNQUFNO0FBQ1YsUUFBSSxRQUFRO0FBQ1osVUFBTSxRQUFRLE1BQVk7QUFDeEIsVUFBSSxPQUFPO0FBQ1QsZUFBTyxXQUFXLEtBQUs7QUFDdkIsZ0JBQVE7QUFBQSxNQUNWO0FBQUEs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LGFBQWEsaUJBQWlCLFdBQVcsU0FBUyxPQUFPO0FBQUEsSUFDaEYsQ0FBQztBQUdELGFBQVMsaUJBQWlCLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxRQUFRO0FBQzNELFVBQUksaUJBQWlCLFNBQVMsQ0FBQyxNQUFNO0FBQ25DLFVBQUUsZ0JBQWdCO0FBQ2xCLGNBQU0sUUFBUyxJQUFvQixRQUFRLFNBQVM7QUFDcEQsWUFBSSxNQUFPLFFBQU8sWUFBWSxFQUFFLE1BQU0sY0FBYyxNQUFNLENBQUM7QUFDM0QsMkJBQW1CO0FBQUEsTUFDckIsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUVELGFBQVMsY0FBYyxjQUFjLEdBQUcsaUJBQWlCLFNBQVMsQ0FBQyxNQUFNO0FBQ3ZFLFFBQUUsZ0JBQWdCO0FBQ2xCLGFBQU8sWUFBWSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQzFDLHlCQUFtQjtBQUFBLElBQ3JCLENBQUM7QUFHRCxhQUFTLGlCQUFpQixTQUFTLENBQUMsTUFBTTtBQUN4QyxZQUFNLE1BQU0sRUFBRSxhQUFhO0FBQzNCLFVBQUksQ0FBQyxJQUFLO0FBQ1YsVUFBSSxJQUFJLFNBQVMsRUFBRSxNQUFjLEVBQUc7QUFDcEMseUJBQW1CO0FBQUEsSUFDckIsQ0FBQztBQUVELFdBQU8sWUFBWSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDdEMsQ0FBQztBQUVELFNBQU8saUJBQWlCLFdBQVcsQ0FBQyxVQUFVO0FBQzVDLFVBQU0sTUFBTSxNQUFNO0FBQ2xCLFlBQVEsSUFBSSxNQUFNO0FBQUEsTUFDaEIsS0FBSyxRQUFRO0FBQ1gsY0FBTSxVQUFVLElBQUk7QUFDcEIsdUJBQWUsUUFBUSxRQUFRO0FBQy9CLHlCQUFpQixRQUFRLFFBQVE7QUFDakM7QUFBQSxNQUNGO0FBQUEsTUFDQSxLQUFLLGNBQWM7QUFDakIsbUJBQVcsSUFBSSxPQUF3QjtBQUN2QztBQUFBLE1BQ0Y7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMLEtBQUssbUJBQW1CO0FBQ3RCLGNBQU0sV0FBVyxJQUFJO0FBQ3JCLFlBQUksU0FBVSxrQkFBaUIsUUFBUTtBQUN2QztBQUFBLE1BQ0Y7QUFBQSxNQUNBLEtBQUssZUFBZTtBQUNsQixZQUFJLENBQUMsSUFBSSxHQUFJLFlBQVcseUNBQVcsSUFBSSxVQUFVLDBCQUFNLEVBQUU7QUFDekQ7QUFBQSxNQUNGO0FBQUEsTUFDQSxLQUFLLGNBQWM7QUFDakIsWUFBSSxDQUFDLElBQUksR0FBSSxZQUFXLHFEQUFhLElBQUksVUFBVSwwQkFBTSxFQUFFO0FBQzNEO0FBQUEsTUFDRjtBQUFBLE1BQ0EsS0FBSyxZQUFZO0FBQ2YsWUFBSSxDQUFDLElBQUksR0FBSSxZQUFXLHFEQUFhLElBQUksVUFBVSwwQkFBTSxFQUFFO0FBQzNEO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImVzY2FwZUh0bWwiLCAiZXNjYXBlSHRtbCJdCn0K
