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
    const toggle = document.querySelector(".answer-toggle");
    if (toggle) toggle.hidden = false;
    const showBtn = $("btn-show-answer");
    if (showBtn) showBtn.removeAttribute("hidden");
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
    if (!favBtn) return;
    favBtn.classList.toggle("active", learning.favoriteFlag);
    favBtn.setAttribute(
      "aria-label",
      learning.favoriteFlag ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF"
    );
    favBtn.setAttribute("title", learning.favoriteFlag ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF");
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
    const toggle = document.querySelector(".answer-toggle");
    if (toggle) toggle.hidden = true;
    const showBtn = $("btn-show-answer");
    if (showBtn) showBtn.setAttribute("hidden", "");
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
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ByYWN0aWNlL3dlYnZpZXcvaGlnaGxpZ2h0LnRzIiwgIi4uLy4uL3NyYy9wcmFjdGljZS93ZWJ2aWV3L21hcmtkb3duLnRzIiwgIi4uLy4uL3NyYy9wcmFjdGljZS93ZWJ2aWV3L21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogXHU2NzgxXHU3QjgwXHU4QkVEXHU2Q0Q1XHU5QUQ4XHU0RUFFXHVGRjA4d2VidmlldyBcdTUxODVcdTVENENcdUZGMENcdTk2RjZcdTRGOURcdThENTZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTkxNERcdTU0MDggYG1hcmtkb3duLnRzYCBcdTU3MjhcdTUyNERcdTdBRUZcdTk3NjJcdThCRDVcdTk4OThcdTRFRTNcdTc4MDFcdTU3NTdcdTRFMEFcdTYzRDBcdTRGOUIgR2l0SHViIFx1OThDRVx1NjgzQ1x1NzY4NFx1Nzc0MFx1ODI3Mlx1RkYxQVxuICogIC0ganMgLyB0cyAvIGpzeCAvIHRzeCAvIGphdmFzY3JpcHQgLyB0eXBlc2NyaXB0XHVGRjA4XHU2NzAwXHU1QjhDXHU2NTc0XHVGRjA5XG4gKiAgLSBjc3MgLyBzY3NzIC8gbGVzc1x1RkYwOFx1NUM1RVx1NjAyNyAvIFx1NjU3MFx1NTAzQyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQSAvIFx1OTg5Q1x1ODI3Mlx1RkYwOVxuICogIC0gaHRtbCAvIHhtbCAvIHZ1ZSAvIHN2Z1x1RkYwOFx1NjgwN1x1N0I3RSAvIFx1NUM1RVx1NjAyNyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQVx1RkYwOVxuICogIC0ganNvbiAvIGpzb241XHVGRjA4a2V5IC8gXHU1QjU3XHU3QjI2XHU0RTMyIC8gXHU2NTcwXHU1QjU3IC8gXHU1RTAzXHU1QzE0XHVGRjA5XG4gKiAgLSBweSAvIHB5dGhvblx1MzAwMXNoIC8gYmFzaCAvIHpzaFx1RkYwOFx1NTdGQVx1Nzg0MFx1NTE3M1x1OTUyRVx1NUI1NyAvIFx1NUI1N1x1N0IyNlx1NEUzMiAvIFx1NkNFOFx1OTFDQVx1RkYwOVxuICogXHU1MTc2XHU1QjgzXHU4QkVEXHU4QTAwXHU5NjREXHU3RUE3XHU0RTNBXHU3RUFGXHU2NTg3XHU2NzJDXHVGRjA4XHU0RUM1XHU1MDVBIEhUTUwgXHU4RjZDXHU0RTQ5XHVGRjA5XHUzMDAyXG4gKlxuICogdG9rZW5pemUgXHU3NTI4IHN0aWNreSBcdTZCNjNcdTUyMTlcdTYzMDlcdTg5QzRcdTUyMTlcdTRGMThcdTUxNDhcdTdFQTdcdTUyNERcdTdGMDBcdTUzMzlcdTkxNERcdUZGMENcdTUzNTVcdTkwNERcdTYyNkJcdTYzQ0YgTyhuIFx1MDBENyBydWxlcylcdTMwMDJcbiAqIFx1OEY5M1x1NTFGQVx1NTMwNVx1ODhDNVx1NEUzQSBgPHNwYW4gY2xhc3M9XCJobC0ke2tpbmR9XCI+XHUyMDI2PC9zcGFuPmBcdUZGMENcdTkxNERcdTgyNzJcdTc1MzEgc3R5bGVzLmNzcyBcdTYzRDBcdTRGOUJcbiAqIFx1NEVBRSAvIFx1NjY5N1x1NTNDQ1x1NTk1N1x1RkYwQ1x1NEY5RFx1OTc2MCB3ZWJ2aWV3IGJvZHkgXHU0RTBBXHU3Njg0IGAudnNjb2RlLWxpZ2h0YCAvIGAudnNjb2RlLWRhcmtgXG4gKiBjbGFzcyBcdTUyMDdcdTYzNjJcdTMwMDJcbiAqXG4gKiBcdTRFMEUgbWFya2Rvd24udHMgXHU4OUUzXHU4MDI2XHVGRjFBXHU0RTBEXHU1QkZDXHU1MTY1XHU1QjgzXHVGRjBDZXNjYXBlSHRtbCBcdTU3MjhcdTY3MkNcdTY1ODdcdTRFRjZcdTcyRUNcdTdBQ0JcdTVCOUVcdTczQjBcdUZGMENcdTkwN0ZcdTUxNERcdTVGQUFcdTczQUZcdTRGOURcdThENTZcdTMwMDJcbiAqL1xuXG5pbnRlcmZhY2UgUnVsZSB7XG4gIGtpbmQ6IHN0cmluZztcbiAgcmU6IFJlZ0V4cDtcbn1cblxuZnVuY3Rpb24gZXNjYXBlSHRtbChzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG59XG5cbi8qKlxuICogXHU2MjhBXHU2RTkwXHU3ODAxXHU2MzA5XHU4OUM0XHU1MjE5XHU2NTcwXHU3RUM0IHRva2VuaXplIFx1NjIxMFx1NUUyNiBobC1jbGFzcyBcdTc2ODQgSFRNTFx1MzAwMlxuICpcbiAqIC0gXHU4OUM0XHU1MjE5XHU2MzA5XHU2NTcwXHU3RUM0XHU5ODdBXHU1RThGXHU0RjE4XHU1MTQ4XHU3RUE3XHU1MjREXHU3RjAwXHU1MzM5XHU5MTREXHVGRjFCXHU0RTBEXHU1MzM5XHU5MTREXHU1MjE5XHU1RjUyXHU1MTY1XCJwbGFpblwiXHU2QkI1XHU4NDNEXHVGRjBDXHU3RURGXHU0RTAwXHU4RjZDXHU0RTQ5XHU1NDBFXHU4RjkzXHU1MUZBXHUzMDAyXG4gKiAtIFx1NjI0MFx1NjcwOSBSZWdFeHAgXHU1RkM1XHU5ODdCXHU2NjJGIHN0aWNreVx1RkYwOGB5YCBcdTY4MDdcdTVGRDdcdUZGMDlcdUZGMENsYXN0SW5kZXggXHU2MjREXHU0RjFBXHU4OEFCXHU1QzBBXHU5MUNEXHUzMDAyXG4gKi9cbmZ1bmN0aW9uIHRva2VuaXplKHNyYzogc3RyaW5nLCBydWxlczogUmVhZG9ubHlBcnJheTxSdWxlPik6IHN0cmluZyB7XG4gIGxldCBvdXQgPSAnJztcbiAgbGV0IHBsYWluID0gJyc7XG4gIGNvbnN0IGZsdXNoID0gKCk6IHZvaWQgPT4ge1xuICAgIGlmIChwbGFpbikge1xuICAgICAgb3V0ICs9IGVzY2FwZUh0bWwocGxhaW4pO1xuICAgICAgcGxhaW4gPSAnJztcbiAgICB9XG4gIH07XG4gIGxldCBpID0gMDtcbiAgd2hpbGUgKGkgPCBzcmMubGVuZ3RoKSB7XG4gICAgbGV0IG1hdGNoZWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IHIgb2YgcnVsZXMpIHtcbiAgICAgIHIucmUubGFzdEluZGV4ID0gaTtcbiAgICAgIGNvbnN0IG0gPSByLnJlLmV4ZWMoc3JjKTtcbiAgICAgIGlmIChtICYmIG0uaW5kZXggPT09IGkpIHtcbiAgICAgICAgZmx1c2goKTtcbiAgICAgICAgb3V0ICs9IGA8c3BhbiBjbGFzcz1cImhsLSR7ci5raW5kfVwiPiR7ZXNjYXBlSHRtbChtWzBdKX08L3NwYW4+YDtcbiAgICAgICAgaSA9IHIucmUubGFzdEluZGV4O1xuICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghbWF0Y2hlZCkge1xuICAgICAgcGxhaW4gKz0gc3JjW2ldO1xuICAgICAgaSsrO1xuICAgIH1cbiAgfVxuICBmbHVzaCgpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFx1NTQwNFx1OEJFRFx1OEEwMFx1ODlDNFx1NTIxOVx1ODg2OFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogSlMgLyBUUyBcdTg5QzRcdTUyMTlcdTMwMDJcdTZDRThcdTYxMEZcdUZGMUFcbiAqICAtIFx1NkNFOFx1OTFDQVx1MzAwMVx1NUI1N1x1N0IyNlx1NEUzMlx1MzAwMVx1NkEyMVx1Njc3Rlx1NUI1N1x1N0IyNlx1NEUzMlx1NjUzRVx1NjcwMFx1NTI0RFx1RkYwQ1x1OTA3Rlx1NTE0RFx1OTFDQ1x1OTc2Mlx1NzY4NFx1NTE3M1x1OTUyRVx1NUI1N1x1ODhBQlx1OEJFRlx1NjdEM1x1MzAwMlxuICogIC0gYHR5YFx1RkYwOFx1NTkyN1x1NTE5OVx1NUYwMFx1NTkzNFx1NjgwN1x1OEJDNlx1N0IyNlx1RkYwOVx1NjUzRVx1NTcyOCBgZm5gIFx1NTI0RFx1RkYwQ1x1OEJBOSBgTXlDbGFzcyguLi4pYCBcdTY3RDNcdTYyMTBcdTdDN0JcdTU3OEJcdTgyNzJcdTgwMENcdTRFMERcdTY2MkZcdTUxRkRcdTY1NzBcdTgyNzJcdTMwMDJcbiAqICAtIFx1NkEyMVx1Njc3Rlx1NUI1N1x1N0IyNlx1NEUzMlx1OTFDQ1x1NzY4NCBgJHtleHByfWAgXHU0RTBEXHU1MDVBXHU1RDRDXHU1OTU3XHU4OUUzXHU2NzkwXHVGRjBDXHU2NTc0XHU0RjUzXHU1RjUzXHU1QjU3XHU3QjI2XHU0RTMyXHU1OTA0XHU3NDA2XHVGRjA4XHU5NzYyXHU4QkQ1XHU5ODk4XHU0RUUzXHU3ODAxXHU1OTFGXHU3NTI4XHVGRjA5XHUzMDAyXG4gKi9cbmNvbnN0IEpTX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcL1teXFxuXSoveSB9LFxuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcKltcXHNcXFNdKj9cXCpcXC8veSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogL1wiKD86XFxcXC58W15cIlxcXFxcXG5dKSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJyg/OlxcXFwufFteJ1xcXFxcXG5dKSonL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9gKD86XFxcXC58W15gXFxcXF0pKmAveSB9LFxuICB7XG4gICAga2luZDogJ2t3JyxcbiAgICByZTogL1xcYig/OmNvbnN0fGxldHx2YXJ8ZnVuY3Rpb258Y2xhc3N8ZXh0ZW5kc3xpbXBsZW1lbnRzfGludGVyZmFjZXx0eXBlfGVudW18bmFtZXNwYWNlfGRlY2xhcmV8bW9kdWxlfGltcG9ydHxleHBvcnR8ZnJvbXxhc3xkZWZhdWx0fHJldHVybnxpZnxlbHNlfGZvcnx3aGlsZXxkb3xzd2l0Y2h8Y2FzZXxicmVha3xjb250aW51ZXxuZXd8ZGVsZXRlfHRoaXN8c3VwZXJ8dHlwZW9mfGluc3RhbmNlb2Z8aW58b2Z8dHJ5fGNhdGNofGZpbmFsbHl8dGhyb3d8YXN5bmN8YXdhaXR8eWllbGR8c3RhdGljfGdldHxzZXR8cHVibGljfHByaXZhdGV8cHJvdGVjdGVkfHJlYWRvbmx5fGFic3RyYWN0fG92ZXJyaWRlfHZvaWR8YW55fHVua25vd258bmV2ZXJ8d2l0aClcXGIveSxcbiAgfSxcbiAgeyBraW5kOiAnYm9vbCcsIHJlOiAvXFxiKD86dHJ1ZXxmYWxzZXxudWxsfHVuZGVmaW5lZHxOYU58SW5maW5pdHkpXFxiL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdudW0nLFxuICAgIHJlOiAvXFxiKD86MFt4WF1bMC05YS1mQS1GXSt8MFtiQl1bMDFdK3wwW29PXVswLTddK3xcXGQrKD86XFwuXFxkKyk/KD86W2VFXVsrLV0/XFxkKyk/KW4/XFxiL3ksXG4gIH0sXG4gIHsga2luZDogJ3R5JywgcmU6IC9cXGJbQS1aXVtcXHckXSpcXGIveSB9LFxuICB7IGtpbmQ6ICdmbicsIHJlOiAvXFxiW2EtekEtWl8kXVtcXHckXSooPz1cXHMqXFwoKS95IH0sXG5dO1xuXG4vKiogQ1NTIC8gU0NTUyAvIExFU1MgXHU4OUM0XHU1MjE5XHUzMDAyU2VsZWN0b3IgXHU0RTBEXHU1MDVBXHU3Q0JFXHU3RUM2XHU5QUQ4XHU0RUFFXHVGRjBDXHU5MUNEXHU3MEI5XHU1NzI4IHByb3AgLyB2YWx1ZSAvIFx1OTg5Q1x1ODI3Mlx1MzAwMiAqL1xuY29uc3QgQ1NTX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogL1xcL1xcKltcXHNcXFNdKj9cXCpcXC8veSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogL1wiKD86W15cIlxcXFxcXG5dfFxcXFwuKSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJyg/OlteJ1xcXFxcXG5dfFxcXFwuKSonL3kgfSxcbiAgeyBraW5kOiAndmFsJywgcmU6IC8jWzAtOWEtZkEtRl17Myw4fVxcYi95IH0sXG4gIHsga2luZDogJ2t3JywgcmU6IC9AW2EtekEtWi1dKy95IH0sXG4gIHsga2luZDogJ3Byb3AnLCByZTogLy0/W2EtekEtWl1bXFx3LV0qKD89XFxzKjopL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdudW0nLFxuICAgIHJlOiAvLT9cXGQrKD86XFwuXFxkKyk/KD86cHh8ZW18cmVtfCV8dmh8dnd8dm1pbnx2bWF4fHN8bXN8ZGVnfHJhZHx0dXJufGZyfHB0fHBjfGV4fGNoKT9cXGIveSxcbiAgfSxcbiAge1xuICAgIGtpbmQ6ICdib29sJyxcbiAgICByZTogL1xcYig/Om5vbmV8aW5oZXJpdHxpbml0aWFsfHVuc2V0fGF1dG98aW5saW5lfGJsb2NrfGZsZXh8Z3JpZHxhYnNvbHV0ZXxyZWxhdGl2ZXxmaXhlZHxzdGF0aWN8c3RpY2t5fGhpZGRlbnx2aXNpYmxlKVxcYi95LFxuICB9LFxuXTtcblxuLyoqIEhUTUwgLyBYTUwgXHU4OUM0XHU1MjE5XHUzMDAyYDxgIGA+YCBcdTg4QUJcdTdFQjNcdTUxNjUgdGFnIFx1NkJCNVx1NEVFNVx1OTA3Rlx1NTE0RFx1ODhBQiBlc2NhcGVIdG1sIFx1OEY2Q1x1NjIxMCAmbHQ7IFx1NTQwRVx1NEUyMlx1NTkzMVx1ODlDNlx1ODlDOVx1MzAwMiAqL1xuY29uc3QgSFRNTF9SVUxFUzogUmVhZG9ubHlBcnJheTxSdWxlPiA9IFtcbiAgeyBraW5kOiAnY29tJywgcmU6IC88IS0tW1xcc1xcU10qPy0tPi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCJbXlwiXFxuXSpcIi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvJ1teJ1xcbl0qJy95IH0sXG4gIHsga2luZDogJ3RhZycsIHJlOiAvPFxcLz9bYS16QS1aXVtcXHctXSoveSB9LFxuICB7IGtpbmQ6ICd0YWcnLCByZTogL1xcLz8+L3kgfSxcbiAgeyBraW5kOiAnYXR0cicsIHJlOiAvXFxiW2EtekEtWl1bXFx3LV0qKD89PSkveSB9LFxuXTtcblxuLyoqIEpTT04gXHU4OUM0XHU1MjE5XHUzMDAya2V5IFx1NkJENCBzdHIgXHU0RjE4XHU1MTQ4XHU1MzM5XHU5MTREXHVGRjA4YFwieFwiYCBcdTU0MEVcdThEREYgYDpgIFx1NjYyRiBrZXlcdUZGMDlcdTMwMDIgKi9cbmNvbnN0IEpTT05fUlVMRVM6IFJlYWRvbmx5QXJyYXk8UnVsZT4gPSBbXG4gIHsga2luZDogJ2F0dHInLCByZTogL1wiKD86XFxcXC58W15cIlxcXFxdKSpcIig/PVxccyo6KS95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCIoPzpcXFxcLnxbXlwiXFxcXF0pKlwiL3kgfSxcbiAgeyBraW5kOiAnYm9vbCcsIHJlOiAvXFxiKD86dHJ1ZXxmYWxzZXxudWxsKVxcYi95IH0sXG4gIHsga2luZDogJ251bScsIHJlOiAvLT9cXGQrKD86XFwuXFxkKyk/KD86W2VFXVsrLV0/XFxkKyk/L3kgfSxcbl07XG5cbmNvbnN0IFBZX1JVTEVTOiBSZWFkb25seUFycmF5PFJ1bGU+ID0gW1xuICB7IGtpbmQ6ICdjb20nLCByZTogLyNbXlxcbl0qL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9cIlwiXCJbXFxzXFxTXSo/XCJcIlwiL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC8nJydbXFxzXFxTXSo/JycnL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC9cIig/OlxcXFwufFteXCJcXFxcXFxuXSkqXCIveSB9LFxuICB7IGtpbmQ6ICdzdHInLCByZTogLycoPzpcXFxcLnxbXidcXFxcXFxuXSkqJy95IH0sXG4gIHtcbiAgICBraW5kOiAna3cnLFxuICAgIHJlOiAvXFxiKD86ZGVmfGNsYXNzfHJldHVybnxpZnxlbGlmfGVsc2V8Zm9yfHdoaWxlfGJyZWFrfGNvbnRpbnVlfHBhc3N8aW1wb3J0fGZyb218YXN8dHJ5fGV4Y2VwdHxmaW5hbGx5fHJhaXNlfHdpdGh8eWllbGR8bGFtYmRhfGdsb2JhbHxub25sb2NhbHxpbnxpc3xub3R8YW5kfG9yfGFzeW5jfGF3YWl0KVxcYi95LFxuICB9LFxuICB7IGtpbmQ6ICdib29sJywgcmU6IC9cXGIoPzpUcnVlfEZhbHNlfE5vbmUpXFxiL3kgfSxcbiAgeyBraW5kOiAnbnVtJywgcmU6IC9cXGJcXGQrKD86XFwuXFxkKyk/XFxiL3kgfSxcbiAgeyBraW5kOiAnZm4nLCByZTogL1xcYlthLXpBLVpfXVxcdyooPz1cXHMqXFwoKS95IH0sXG5dO1xuXG5jb25zdCBTSF9SVUxFUzogUmVhZG9ubHlBcnJheTxSdWxlPiA9IFtcbiAgeyBraW5kOiAnY29tJywgcmU6IC8jW15cXG5dKi95IH0sXG4gIHsga2luZDogJ3N0cicsIHJlOiAvXCIoPzpcXFxcLnxbXlwiXFxcXF0pKlwiL3kgfSxcbiAgeyBraW5kOiAnc3RyJywgcmU6IC8nW14nXSonL3kgfSxcbiAge1xuICAgIGtpbmQ6ICdrdycsXG4gICAgcmU6IC9cXGIoPzppZnx0aGVufGVsc2V8ZWxpZnxmaXxmb3J8d2hpbGV8ZG98ZG9uZXxjYXNlfGVzYWN8aW58ZnVuY3Rpb258cmV0dXJufGV4cG9ydHxsb2NhbHxyZWFkb25seSlcXGIveSxcbiAgfSxcbiAgeyBraW5kOiAnZm4nLCByZTogL1xcJFxce1tefV0rXFx9fFxcJFxcdysveSB9LFxuXTtcblxuZnVuY3Rpb24gbGFuZ0tleShsYW5nOiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGxhbmcudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2pzJzpcbiAgICBjYXNlICdqc3gnOlxuICAgIGNhc2UgJ2phdmFzY3JpcHQnOlxuICAgIGNhc2UgJ3RzJzpcbiAgICBjYXNlICd0c3gnOlxuICAgIGNhc2UgJ3R5cGVzY3JpcHQnOlxuICAgICAgcmV0dXJuICdqcyc7XG4gICAgY2FzZSAnY3NzJzpcbiAgICBjYXNlICdzY3NzJzpcbiAgICBjYXNlICdsZXNzJzpcbiAgICAgIHJldHVybiAnY3NzJztcbiAgICBjYXNlICdodG1sJzpcbiAgICBjYXNlICd4bWwnOlxuICAgIGNhc2UgJ3Z1ZSc6XG4gICAgY2FzZSAnc3ZnJzpcbiAgICAgIHJldHVybiAnaHRtbCc7XG4gICAgY2FzZSAnanNvbic6XG4gICAgY2FzZSAnanNvbjUnOlxuICAgICAgcmV0dXJuICdqc29uJztcbiAgICBjYXNlICdweSc6XG4gICAgY2FzZSAncHl0aG9uJzpcbiAgICAgIHJldHVybiAncHknO1xuICAgIGNhc2UgJ3NoJzpcbiAgICBjYXNlICdiYXNoJzpcbiAgICBjYXNlICdzaGVsbCc6XG4gICAgY2FzZSAnenNoJzpcbiAgICAgIHJldHVybiAnc2gnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuLyoqXG4gKiBcdTUxNkNcdTUxNzFcdTUxNjVcdTUzRTNcdUZGMUFcdTYyOEEgYGNvZGVgIFx1NjMwOSBgbGFuZ2AgXHU2RTMyXHU2N0QzXHU0RTNBXHU1REYyXHU4RjZDXHU0RTQ5XHU3Njg0IEhUTUwgXHU1QjU3XHU3QjI2XHU0RTMyXHUzMDAyXG4gKlxuICogXHU4QzAzXHU3NTI4XHU2NUI5XHU2MkZGXHU1MjMwXHU3RUQzXHU2NzlDXHU1NDBFXHU3NkY0XHU2M0E1XHU2MkZDXHU1MjMwIGA8cHJlPjxjb2RlPi4uLjwvY29kZT48L3ByZT5gIFx1NTE4NVx1NTM3M1x1NTNFRlx1RkYwQ1x1NjVFMFx1OTcwMFx1NTE4RFx1NkIyMVx1OEY2Q1x1NEU0OVx1MzAwMlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGlnaGxpZ2h0KGNvZGU6IHN0cmluZywgbGFuZzogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChsYW5nS2V5KGxhbmcpKSB7XG4gICAgY2FzZSAnanMnOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIEpTX1JVTEVTKTtcbiAgICBjYXNlICdjc3MnOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIENTU19SVUxFUyk7XG4gICAgY2FzZSAnaHRtbCc6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgSFRNTF9SVUxFUyk7XG4gICAgY2FzZSAnanNvbic6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgSlNPTl9SVUxFUyk7XG4gICAgY2FzZSAncHknOlxuICAgICAgcmV0dXJuIHRva2VuaXplKGNvZGUsIFBZX1JVTEVTKTtcbiAgICBjYXNlICdzaCc6XG4gICAgICByZXR1cm4gdG9rZW5pemUoY29kZSwgU0hfUlVMRVMpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZXNjYXBlSHRtbChjb2RlKTtcbiAgfVxufVxuIiwgIi8qKlxuICogXHU2NzgxXHU3QjgwIE1hcmtkb3duIFx1NkUzMlx1NjdEM1x1NTY2OFx1RkYwOHdlYnZpZXcgXHU3QUVGIGlubGluZSBcdTVCOUVcdTczQjBcdUZGMENcdTY1RTBcdTdCMkNcdTRFMDlcdTY1QjlcdTRGOURcdThENTZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTk4OThcdTVFOTNcdTUxODVcdTVCQjlcdTUzMDVcdTU0MkJcdTU5MjdcdTkxQ0YgTWFya2Rvd25cdUZGMUFcdTY4MDdcdTk4OThcdUZGMDhgI2AvYCMjYC4uLlx1RkYwOVx1MzAwMVx1N0M5N1x1NEY1M1x1RkYwOGAqKi4uLioqYFx1RkYwOVx1MzAwMVx1NEVFM1x1NzgwMVx1NTc1N1x1MzAwMVxuICogXHU1MjE3XHU4ODY4XHUzMDAxXHU4ODY4XHU2ODNDXHUzMDAxXHU1RjE1XHU3NTI4XHUzMDAxXHU1MjA2XHU1MjcyXHU3RUJGXHUzMDAxXHU5NEZFXHU2M0E1XHU3QjQ5XHUzMDAyV2VidmlldyBcdTVGQzVcdTk4N0JcdTYyOEFcdTVCODNcdTRFRUNcdTRFRTVcdTYzOTJcdTcyNDhcdTUzQ0JcdTU5N0RcdTc2ODQgSFRNTFxuICogXHU1NDQ4XHU3M0IwXHVGRjBDXHU1NDI2XHU1MjE5XHU1MzlGXHU2NTg3IGAqKmAgYFxcbmAgYCNgIFx1NEYxQVx1NzZGNFx1NjNBNVx1NjYzRVx1NzkzQVx1NTcyOFx1OTc2Mlx1Njc3Rlx1NEUwQVx1RkYwQ1x1NEY1M1x1OUE4Q1x1NUY4OFx1NURFRVx1MzAwMlxuICpcbiAqIFx1NzUzMVx1NEU4RSBWUyBDb2RlIFdlYnZpZXcgXHU3Njg0IENTUCBcdTlFRDhcdThCQTRcdTc5ODFcdTZCNjJcdTU5MTZcdTkwRThcdTgxMUFcdTY3MkNcdTRFMEVcdTY4MzdcdTVGMEZcdUZGMENcdTVGMTVcdTUxNjVcdTdCMkNcdTRFMDlcdTY1QjkgbWFya2Rvd25cbiAqIFx1NUU5M1x1NEYxQVx1OEJBOVx1Njc4NFx1NUVGQS9cdTYyNTNcdTUzMDUvXHU4RDQ0XHU2RTkwXHU1MkEwXHU4RjdEXHU2NkY0XHU1OTBEXHU2NzQyXHVGRjFCXHU2NzJDXHU2MjY5XHU1QzU1XHU0RTVGXHU0RTBEXHU5NzAwXHU4OTgxIEdGTSBcdTUxNjhcdTcyNzlcdTYwMjdcdUZGMENcdTU2RTBcdTZCNjRcdTgxRUFcdTUxOTlcdTRFMDBcdTRFMkFcbiAqIFwiXHU1OTFGXHU3NTI4XCIgXHU3Njg0XHU2RTMyXHU2N0QzXHU1NjY4XHVGRjBDXHU4OTg2XHU3NkQ2XHU1OTgyXHU0RTBCXHU1QjUwXHU5NkM2XHVGRjFBXG4gKlxuICogIC0gQVRYIFx1NjgwN1x1OTg5OCBgIyBIMWAgfiBgIyMjIyMjIEg2YFxuICogIC0gXHU2QkI1XHU4NDNEXHVGRjA4XHU1M0NDXHU2MzYyXHU4ODRDXHU0RjVDXHU1MjA2XHU5Njk0XHVGRjA5XG4gKiAgLSBcdTY1RTBcdTVFOEZcdTUyMTdcdTg4NjhcdUZGMDhgLWAgYCpgIGArYFx1RkYwOS8gXHU2NzA5XHU1RThGXHU1MjE3XHU4ODY4XHVGRjA4YDEuYFx1RkYwOVxuICogIC0gXHU1RjE1XHU3NTI4XHU1NzU3IGA+IC4uLmBcdUZGMDhcdTkwMTJcdTVGNTJcdTZFMzJcdTY3RDNcdTUxODVcdTkwRTggbWFya2Rvd25cdUZGMDlcbiAqICAtIFx1NTZGNFx1NjgwRlx1NEVFM1x1NzgwMVx1NTc1NyBgYGAgbGFuZyAuLi4gYGBgXHVGRjA4XHU4QkVEXHU4QTAwXHU0RkUxXHU2MDZGXHU1M0VBXHU1M0Q2XHU5OTk2XHU2QkI1XHVGRjBDXHU1RkZEXHU3NTY1IGBpZD1cIi4uLlwiYCBcdTdCNDlcdTUxNDNcdTY1NzBcdTYzNkVcdUZGMDlcbiAqICAtIFx1NTIwNlx1NTI3Mlx1N0VCRiBgLS0tYCAvIGAqKipgXG4gKiAgLSBcdTdCODBcdTUzNTVcdTdCQTFcdTkwNTNcdTg4NjhcdTY4M0MgYHwgaCB8IGggfFxcbnwgLSB8IC0gfFxcbnwgYyB8IGMgfGBcbiAqICAtIFx1ODg0Q1x1NTE4NVx1RkYxQWBjb2RlYFx1MzAwMSoqYm9sZCoqXHUzMDAxKml0YWxpYypcdTMwMDFbbGlua10odXJsKVx1MzAwMWA8Y29kZT5gIFx1NURGMlx1ODhBQlx1OEY2Q1x1NEU0OVxuICpcbiAqIFx1NjI0MFx1NjcwOVx1NzUyOFx1NjIzN1x1NjU4N1x1NjcyQ1x1OEZEQlx1NTE2NVx1NkUzMlx1NjdEM1x1NTY2OFx1NEU0Qlx1NTI0RFx1OTBGRFx1NEYxQVx1NTE0OFx1NTA1QSBIVE1MIFx1OEY2Q1x1NEU0OVx1RkYxQlx1NTcyOFx1OEY2Q1x1NEU0OVx1NTQwRVx1NzY4NFx1NjU4N1x1NjcyQ1x1NEUwQVx1NTA1QVx1NkI2M1x1NTIxOVx1NjZGRlx1NjM2Mlx1RkYwQ1xuICogXHU2NUUyXHU5MDdGXHU1MTREIFhTU1x1RkYwOHdlYnZpZXcgXHU1MTg1XHU1MzczXHU0RkJGXHU2NzA5IHZzY29kZS1hcGkgXHU0RTVGXHU0RTBEXHU1RTBDXHU2NzFCXHU2MjY3XHU4ODRDXHU2Q0U4XHU1MTY1XHVGRjA5XHVGRjBDXHU1M0M4XHU0RkREXHU4QkMxXHU0RUUzXHU3ODAxXHU1NzU3XG4gKiBcdTUxODVcdTc2ODQgYDxgIGA+YCBgJmAgXHU1MzlGXHU2ODM3XHU1QzU1XHU3OTNBXHUzMDAyXG4gKlxuICogXHU4QkU1XHU2QTIxXHU1NzU3XHU0RTBEXHU0RjlEXHU4RDU2IERPTVx1RkYxQlx1OEMwM1x1NzUyOFx1NjVCOVx1NjJGRlx1NTIzMFx1NUI1N1x1N0IyNlx1NEUzMlx1NTQwRVx1OEQ0Qlx1NTAzQ1x1N0VEOSBgaW5uZXJIVE1MYFx1MzAwMlxuICpcbiAqIFx1NEVFM1x1NzgwMVx1NTc1N1x1NzY4NFx1OEJFRFx1NkNENVx1Nzc0MFx1ODI3Mlx1NTlENFx1NjI1OFx1N0VEOSBgaGlnaGxpZ2h0LnRzYFx1RkYxQVx1NTcyOFx1NTZGNFx1NjgwRlx1NEVFM1x1NzgwMVx1NTc1N1x1NkUzMlx1NjdEM1x1NTkwNFx1OEMwM1x1NzUyOFxuICogYGhpZ2hsaWdodChjb2RlLCBsYW5nKWAgXHU3NkY0XHU2M0E1XHU2MkZGXHU1MjMwXHU1REYyXHU4RjZDXHU0RTQ5XHU0RTE0XHU1MzA1XHU0RTg2IGA8c3BhbiBjbGFzcz1cImhsLSpcIj5gIFx1NzY4NCBIVE1MXHVGRjBDXG4gKiBcdTU2RTBcdTZCNjRcdTY3MkNcdTY1ODdcdTRFRjZcdTVCRjlcdTRFRTNcdTc4MDFcdTU3NTdcdTUxODVcdTVCQjlcdTRFMERcdTUxOERcdTRFOENcdTZCMjEgZXNjYXBlSHRtbFx1MzAwMlxuICovXG5cbmltcG9ydCB7IGhpZ2hsaWdodCB9IGZyb20gJy4vaGlnaGxpZ2h0LmpzJztcblxuLyoqIFx1NjI4QVx1NUI1N1x1N0IyNlx1NEUzMlx1OEY2Q1x1NEU0OVx1NEUzQVx1NUI4OVx1NTE2OFx1NzY4NCBIVE1MIFx1NjU4N1x1NjcyQ1x1ODI4Mlx1NzBCOVx1NTE4NVx1NUJCOVx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xufVxuXG4vKiogXHU2MjhBIG1hcmtkb3duIFx1NUI1N1x1N0IyNlx1NEUzMlx1NkUzMlx1NjdEM1x1NEUzQSBIVE1MIFx1NUI1N1x1N0IyNlx1NEUzMlx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlck1hcmtkb3duKHNyYzogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghc3JjKSByZXR1cm4gJyc7XG4gIHJldHVybiBibG9ja1JlbmRlcihub3JtYWxpemVOZXdsaW5lcyhzcmMpKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBcdTUxODVcdTkwRThcdTVCOUVcdTczQjBcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBub3JtYWxpemVOZXdsaW5lcyhzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcy5yZXBsYWNlKC9cXHJcXG4/L2csICdcXG4nKTtcbn1cblxuLyoqXG4gKiBcdTU3NTdcdTdFQTdcdTZFMzJcdTY3RDNcdTMwMDJcdTkwMTBcdTg4NENcdTYyNkJcdTYzQ0ZcdUZGMENcdTY4MzlcdTYzNkVcdTg4NENcdTk5OTZcdTcyNzlcdTVGODFcdTUxQjNcdTVCOUFcdTU3NTdcdTdDN0JcdTU3OEJcdUZGMUJcdTZCQjVcdTg0M0RcdTc1MzFcdTdBN0FcdTg4NENcdTUyMDZcdTk2OTRcdTMwMDJcbiAqXG4gKiBcdTVCOUVcdTczQjBcdTYyMTBcdTY3MDlcdTk2NTBcdTcyQjZcdTYwMDFcdTYyNkJcdTYzQ0ZcdUZGMENcdTRGQkZcdTRFOEVcdTU3MjhcdTRFMERcdTVGMTVcdTUxNjUgdG9rZW4gXHU3QzdCXHU3Njg0XHU1MjREXHU2M0QwXHU0RTBCXHU0RkREXHU2MzAxXHU3RUJGXHU2MDI3XHU1OTBEXHU2NzQyXHU1RUE2XHUzMDAyXG4gKi9cbmZ1bmN0aW9uIGJsb2NrUmVuZGVyKHNyYzogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBzcmMuc3BsaXQoJ1xcbicpO1xuICBjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG4gIGxldCBpID0gMDtcbiAgbGV0IHBhcmFncmFwaDogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGxpc3RLaW5kOiAndWwnIHwgJ29sJyB8IG51bGwgPSBudWxsO1xuICBjb25zdCBsaXN0SXRlbXM6IHN0cmluZ1tdID0gW107XG5cbiAgY29uc3QgZmx1c2hQYXJhZ3JhcGggPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKHBhcmFncmFwaC5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBvdXQucHVzaChgPHA+JHtpbmxpbmVSZW5kZXIocGFyYWdyYXBoLmpvaW4oJyAnKSl9PC9wPmApO1xuICAgIHBhcmFncmFwaCA9IFtdO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoTGlzdCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAobGlzdEtpbmQgPT09IG51bGwpIHJldHVybjtcbiAgICBvdXQucHVzaChgPCR7bGlzdEtpbmR9PiR7bGlzdEl0ZW1zLmpvaW4oJycpfTwvJHtsaXN0S2luZH0+YCk7XG4gICAgbGlzdEl0ZW1zLmxlbmd0aCA9IDA7XG4gICAgbGlzdEtpbmQgPSBudWxsO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoQWxsID0gKCk6IHZvaWQgPT4ge1xuICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgZmx1c2hMaXN0KCk7XG4gIH07XG5cbiAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV0gPz8gJyc7XG5cbiAgICAvLyBcdTU2RjRcdTY4MEZcdTRFRTNcdTc4MDFcdTU3NTdcbiAgICBjb25zdCBmZW5jZSA9IC9eYGBgXFxzKihbXlxcc2BdKikvLmV4ZWMobGluZSk7XG4gICAgaWYgKGZlbmNlKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgY29uc3QgbGFuZ1JhdyA9IGZlbmNlWzFdID8/ICcnO1xuICAgICAgLy8gXHU1M0Q2XHU5OTk2XHU0RTJBXHU3QTdBXHU3NjdEXHU1MjREXHU3Njg0XHU5MEU4XHU1MjA2XHU0RjVDXHU0RTNBXHU4QkVEXHU4QTAwXHVGRjBDXHU1RkZEXHU3NTY1IGBpZD1cInowXCJgIFx1N0I0OVx1OTg5RFx1NTkxNlx1NjgwN1x1OEJCMFxuICAgICAgY29uc3QgbGFuZyA9IGxhbmdSYXcuc3BsaXQoL1xccy8pWzBdID8/ICcnO1xuICAgICAgY29uc3QgY29kZUxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaSsrO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgIS9eYGBgXFxzKiQvLnRlc3QobGluZXNbaV0gPz8gJycpKSB7XG4gICAgICAgIGNvZGVMaW5lcy5wdXNoKGxpbmVzW2ldID8/ICcnKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgLy8gXHU4REYzXHU4RkM3XHU3RUQzXHU2NzVGXHU1NkY0XHU2ODBGXHVGRjA4XHU4MkU1XHU2NTg3XHU0RUY2XHU2NzJCXHU1QzNFXHU2NUUwXHU3RUQzXHU2NzVGXHU3QjI2XHU0RTVGXHU1QkI5XHU1RkNEXHVGRjA5XG4gICAgICBpZiAoaSA8IGxpbmVzLmxlbmd0aCkgaSsrO1xuICAgICAgY29uc3QgbGFuZ0NsYXNzID0gbGFuZyA/IGAgY2xhc3M9XCJsYW5nLSR7ZXNjYXBlQXR0cihsYW5nKX1cImAgOiAnJztcbiAgICAgIG91dC5wdXNoKFxuICAgICAgICBgPHByZT48Y29kZSR7bGFuZ0NsYXNzfT4ke2hpZ2hsaWdodChjb2RlTGluZXMuam9pbignXFxuJyksIGxhbmcpfTwvY29kZT48L3ByZT5gLFxuICAgICAgKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIFx1NjgwN1x1OTg5OFxuICAgIGNvbnN0IGhlYWRpbmcgPSAvXigjezEsNn0pXFxzKyguKikkLy5leGVjKGxpbmUpO1xuICAgIGlmIChoZWFkaW5nKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgY29uc3QgbGV2ZWwgPSAoaGVhZGluZ1sxXSA/PyAnJykubGVuZ3RoO1xuICAgICAgb3V0LnB1c2goYDxoJHtsZXZlbH0+JHtpbmxpbmVSZW5kZXIoaGVhZGluZ1syXSA/PyAnJyl9PC9oJHtsZXZlbH0+YCk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBcdTUyMDZcdTUyNzJcdTdFQkZcbiAgICBpZiAoL15cXHMqKFstKl9dKVxcMXsyLH1cXHMqJC8udGVzdChsaW5lKSkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIG91dC5wdXNoKCc8aHIvPicpO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU1RjE1XHU3NTI4XHU1NzU3XHVGRjA4XHU4RkRFXHU3RUVEXHU3Njg0IGA+YCBcdTg4NENcdUZGMDlcbiAgICBpZiAoL15cXHMqPi8udGVzdChsaW5lKSkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGNvbnN0IHF1b3RlTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICB3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiAvXlxccyo+Ly50ZXN0KGxpbmVzW2ldID8/ICcnKSkge1xuICAgICAgICBxdW90ZUxpbmVzLnB1c2goKGxpbmVzW2ldID8/ICcnKS5yZXBsYWNlKC9eXFxzKj5cXHM/LywgJycpKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgb3V0LnB1c2goYDxibG9ja3F1b3RlPiR7YmxvY2tSZW5kZXIocXVvdGVMaW5lcy5qb2luKCdcXG4nKSl9PC9ibG9ja3F1b3RlPmApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU4ODY4XHU2ODNDXHVGRjFBXHU4ODY4XHU1OTM0XHU4ODRDICsgXHU1MjA2XHU5Njk0XHU4ODRDICsgXHU0RUZCXHU2MTBGXHU2NTcwXHU2MzZFXHU4ODRDXG4gICAgaWYgKFxuICAgICAgaXNUYWJsZVJvdyhsaW5lKSAmJlxuICAgICAgaSArIDEgPCBsaW5lcy5sZW5ndGggJiZcbiAgICAgIGlzVGFibGVTZXBhcmF0b3IobGluZXNbaSArIDFdID8/ICcnKVxuICAgICkge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGNvbnN0IGhlYWRlckNlbGxzID0gcGFyc2VUYWJsZVJvdyhsaW5lKTtcbiAgICAgIGkgKz0gMjsgLy8gXHU4REYzXHU4RkM3XHU4ODY4XHU1OTM0XHU0RTBFXHU1MjA2XHU5Njk0XHU3QjI2XG4gICAgICBjb25zdCBib2R5Um93czogc3RyaW5nW11bXSA9IFtdO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgaXNUYWJsZVJvdyhsaW5lc1tpXSA/PyAnJykpIHtcbiAgICAgICAgYm9keVJvd3MucHVzaChwYXJzZVRhYmxlUm93KGxpbmVzW2ldID8/ICcnKSk7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgICAgIGxldCB0YWJsZSA9ICc8dGFibGU+PHRoZWFkPjx0cj4nO1xuICAgICAgZm9yIChjb25zdCBjIG9mIGhlYWRlckNlbGxzKSB0YWJsZSArPSBgPHRoPiR7aW5saW5lUmVuZGVyKGMpfTwvdGg+YDtcbiAgICAgIHRhYmxlICs9ICc8L3RyPjwvdGhlYWQ+PHRib2R5Pic7XG4gICAgICBmb3IgKGNvbnN0IHJvdyBvZiBib2R5Um93cykge1xuICAgICAgICB0YWJsZSArPSAnPHRyPic7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiByb3cpIHRhYmxlICs9IGA8dGQ+JHtpbmxpbmVSZW5kZXIoYyl9PC90ZD5gO1xuICAgICAgICB0YWJsZSArPSAnPC90cj4nO1xuICAgICAgfVxuICAgICAgdGFibGUgKz0gJzwvdGJvZHk+PC90YWJsZT4nO1xuICAgICAgb3V0LnB1c2godGFibGUpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU2NUUwXHU1RThGIC8gXHU2NzA5XHU1RThGXHU1MjE3XHU4ODY4XG4gICAgY29uc3QgdWwgPSAvXlxccypbLSorXVxccysoLiopJC8uZXhlYyhsaW5lKTtcbiAgICBjb25zdCBvbCA9IC9eXFxzKlxcZCtcXC5cXHMrKC4qKSQvLmV4ZWMobGluZSk7XG4gICAgaWYgKHVsIHx8IG9sKSB7XG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xuICAgICAgY29uc3Qga2luZDogJ3VsJyB8ICdvbCcgPSB1bCA/ICd1bCcgOiAnb2wnO1xuICAgICAgaWYgKGxpc3RLaW5kICE9PSBudWxsICYmIGxpc3RLaW5kICE9PSBraW5kKSB7XG4gICAgICAgIGZsdXNoTGlzdCgpO1xuICAgICAgfVxuICAgICAgbGlzdEtpbmQgPSBraW5kO1xuICAgICAgY29uc3QgdGV4dCA9ICh1bCA/IHVsWzFdIDogb2w/LlsxXSkgPz8gJyc7XG4gICAgICBsaXN0SXRlbXMucHVzaChgPGxpPiR7aW5saW5lUmVuZGVyKHRleHQpfTwvbGk+YCk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBcdTdBN0FcdTg4NENcdUZGMUFcdTZCQjVcdTg0M0RcdTUyMDZcdTk2OTRcbiAgICBpZiAobGluZS50cmltKCkgPT09ICcnKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU2NjZFXHU5MDFBXHU2QkI1XHU4NDNEXHU4ODRDXG4gICAgZmx1c2hMaXN0KCk7XG4gICAgcGFyYWdyYXBoLnB1c2gobGluZSk7XG4gICAgaSsrO1xuICB9XG5cbiAgZmx1c2hBbGwoKTtcbiAgcmV0dXJuIG91dC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gaXNUYWJsZVJvdyhsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eXFxzKlxcfC4qXFx8XFxzKiQvLnRlc3QobGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzVGFibGVTZXBhcmF0b3IobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAvXlxccypcXHw/XFxzKjo/LXsyLH06P1xccyooXFx8XFxzKjo/LXsyLH06P1xccyopK1xcfD9cXHMqJC8udGVzdChsaW5lKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VUYWJsZVJvdyhsaW5lOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIGxldCBzID0gbGluZS50cmltKCk7XG4gIGlmIChzLnN0YXJ0c1dpdGgoJ3wnKSkgcyA9IHMuc2xpY2UoMSk7XG4gIGlmIChzLmVuZHNXaXRoKCd8JykpIHMgPSBzLnNsaWNlKDAsIC0xKTtcbiAgcmV0dXJuIHMuc3BsaXQoJ3wnKS5tYXAoKGMpID0+IGMudHJpbSgpKTtcbn1cblxuLyoqIFx1ODg0Q1x1NTE4NVx1NkUzMlx1NjdEM1x1RkYxQVx1NTE0OFx1OEY2Q1x1NEU0OVx1RkYwQ1x1NTE4RFx1NTkwNFx1NzQwNiBpbmxpbmUgY29kZVx1RkYwOFx1NTM2MFx1NEY0RFx1NEZERFx1NjJBNFx1RkYwOVx1RkYwQ1x1NTE4RFx1NTkwNFx1NzQwNlx1NTE3Nlx1NEY1OVx1NjgwN1x1OEJCMFx1MzAwMiAqL1xuZnVuY3Rpb24gaW5saW5lUmVuZGVyKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBvdXQgPSBlc2NhcGVIdG1sKHMpO1xuXG4gIC8vIDEpIFx1ODg0Q1x1NTE4NVx1NEVFM1x1NzgwMVx1RkYxQVx1NzUyOFx1NTM2MFx1NEY0RFx1N0IyNlx1NjZGRlx1NjM2Mlx1NEVFNVx1OTA3Rlx1NTE0RFx1ODhBQlx1NTQwRVx1N0VFRFx1ODlDNFx1NTIxOVx1OEJFRlx1NEYyNFxuICBjb25zdCBjb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgb3V0ID0gb3V0LnJlcGxhY2UoL2AoW15gXFxuXSs/KWAvZywgKF8sIGNvZGU6IHN0cmluZykgPT4ge1xuICAgIGNvZGVzLnB1c2goYDxjb2RlPiR7Y29kZX08L2NvZGU+YCk7XG4gICAgcmV0dXJuIGBcXHUwMDAwQyR7Y29kZXMubGVuZ3RoIC0gMX1cXHUwMDAwYDtcbiAgfSk7XG5cbiAgLy8gMikgXHU5NEZFXHU2M0E1IFt0ZXh0XSh1cmwpIFx1MjAxNFx1MjAxNCBcdTRFQzVcdTUxNDFcdThCQjggaHR0cC9odHRwcy9tYWlsdG8gXHU0RTBFXHU3NkY4XHU1QkY5XHU4REVGXHU1Rjg0XHVGRjBDXHU4OUM0XHU5MDdGIGphdmFzY3JpcHQ6XG4gIG91dCA9IG91dC5yZXBsYWNlKFxuICAgIC9cXFsoW15cXF1dKylcXF1cXCgoW14pXSspXFwpL2csXG4gICAgKF8sIHRleHQ6IHN0cmluZywgaHJlZjogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBzYWZlID0gc2FuaXRpemVIcmVmKGhyZWYpO1xuICAgICAgcmV0dXJuIGA8YSBocmVmPVwiJHtzYWZlfVwiIHRhcmdldD1cIl9ibGFua1wiIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIj4ke3RleHR9PC9hPmA7XG4gICAgfSxcbiAgKTtcblxuICAvLyAzKSBcdTUyQTBcdTdDOTcgKyBcdTY1OUNcdTRGNTMgLyBcdTUyQTBcdTdDOTcgLyBcdTY1OUNcdTRGNTNcdUZGMDhcdTk4N0FcdTVFOEZcdTRFMERcdTgwRkRcdTk4QTBcdTUwMTJcdUZGMDlcbiAgb3V0ID0gb3V0LnJlcGxhY2UoL1xcKlxcKlxcKihbXipdKz8pXFwqXFwqXFwqL2csICc8c3Ryb25nPjxlbT4kMTwvZW0+PC9zdHJvbmc+Jyk7XG4gIG91dCA9IG91dC5yZXBsYWNlKC9cXCpcXCooW14qXSs/KVxcKlxcKi9nLCAnPHN0cm9uZz4kMTwvc3Ryb25nPicpO1xuICAvLyBcdTY1OUNcdTRGNTNcdUZGMUFcdTkwN0ZcdTUxNERcdTU0MUVcdTYzODlcdTYyMTBcdTVCRjlcdTUyQTBcdTdDOTdcdTc2ODRcdTUyNjlcdTRGNTkgYCpgXHVGRjBDXHU4OTgxXHU2QzQyXHU1REU2XHU1M0YzXHU5NzVFIGAqYFxuICBvdXQgPSBvdXQucmVwbGFjZSgvKF58W14qXSlcXCooW14qXFxuXSs/KVxcKig/IVxcKikvZywgJyQxPGVtPiQyPC9lbT4nKTtcblxuICAvLyA0KSBcdThGRDhcdTUzOUYgaW5saW5lIGNvZGUgXHU1MzYwXHU0RjREXG4gIG91dCA9IG91dC5yZXBsYWNlKC9cXHUwMDAwQyhcXGQrKVxcdTAwMDAvZywgKF8sIGlkeDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgaSA9IE51bWJlcihpZHgpO1xuICAgIHJldHVybiBjb2Rlc1tpXSA/PyAnJztcbiAgfSk7XG5cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVIcmVmKGhyZWY6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRyaW1tZWQgPSBocmVmLnRyaW0oKTtcbiAgaWYgKC9eKGh0dHBzPzp8bWFpbHRvOnwjfFxcL3xcXC5cXC4/XFwvKS9pLnRlc3QodHJpbW1lZCkpIHtcbiAgICByZXR1cm4gZXNjYXBlQXR0cih0cmltbWVkKTtcbiAgfVxuICAvLyBcdTRFMERcdThCQzZcdTUyMkJcdTc2ODRcdTUzNEZcdThCQUVcdUZGMDhcdTU0MkIgamF2YXNjcmlwdDpcdUZGMDlcdTRFMDBcdTVGOEJcdTk2NERcdTdFQTdcdTRFM0FcdTk1MUFcdTcwQjlcdUZGMENcdTkwN0ZcdTUxNERcdTgxMUFcdTY3MkNcdTYyNjdcdTg4NENcbiAgcmV0dXJuICcjJztcbn1cblxuZnVuY3Rpb24gZXNjYXBlQXR0cihzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gc1xuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xufVxuIiwgIi8qKlxuICogV2VidmlldyBcdTdBRUZcdTUxNjVcdTUzRTNcdUZGMDhQcmFjdGljZSBcdTk3NjJcdTY3N0ZcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTU3Mjggd2VidmlldyBpZnJhbWUgXHU1MTg1XHU4RkQwXHU4ODRDXHVGRjBDXHU5MDFBXHU4RkM3IGBhY3F1aXJlVnNDb2RlQXBpKClgIFx1NEUwRVx1NjI2OVx1NUM1NVx1OEZEQlx1N0EwQlx1OTAxQVx1NEZFMVx1MzAwMlxuICpcbiAqIFVJIFx1N0VEM1x1Njc4NFx1RkYwOFx1NEUwRSBwYW5lbC50cyBcdTUxODVcdTVENEMgSFRNTCBcdTU0MENcdTZCNjVcdUZGMDlcdUZGMUFcbiAqICAgLSAucS1oZWFkXHVGRjA4bWV0YSBcdTVGQkRcdTdBRTAgKyBcdTY4MDdcdTk4OTggKyBcdTY1MzZcdTg1Q0ZcdTYzMDlcdTk0QUVcdUZGMDlcbiAqICAgLSAjcXVlc3Rpb24tY29udGVudC5tZFx1RkYwOFx1OTg5OFx1OTc2MiBtYXJrZG93biBcdTZFMzJcdTY3RDNcdUZGMDlcbiAqICAgLSAjdGVzdC1jYXNlc1x1RkYwOFx1NEVDNVx1NEVFM1x1NzgwMVx1OTg5OFx1RkYwOVxuICogICAtIC5hbnN3ZXItdG9nZ2xlID4gI2J0bi1zaG93LWFuc3dlclx1RkYwOFx1NzBCOVx1NTFGQlx1NUM1NVx1NUYwMFx1N0I1NFx1Njg0OFx1RkYxQlx1NUM1NVx1NUYwMFx1NTQwRVx1NjU3NFx1NEY1M1x1OTY5MFx1ODVDRlx1RkYwOVxuICogICAtICNhbnN3ZXItYXJlYVx1RkYwOFx1NTQyQiAjYnRuLWNvbGxhcHNlLWFuc3dlciBcdTU3MDZcdTVGNjIgXHUyMTkxIFx1NjMwOVx1OTRBRSArICNhbnN3ZXItY29udGVudFx1RkYwOVxuICogICAtICNmb2xsb3ctdXBzXHVGRjA4XHU5NUVFXHU3QjU0XHU5ODk4XHU4RkZEXHU5NUVFXHVGRjA5XG4gKlxuICogXHU2RTMyXHU2N0QzXHU3QjU2XHU3NTY1XHVGRjFBXHU5ODk4XHU5NzYyIC8gXHU4QkU2XHU3RUM2XHU4OUUzXHU2NzkwIC8gXHU3QjgwXHU3QjU0IC8gXHU4RkZEXHU5NUVFXHU3QjU0XHU2ODQ4XHU1NzQ3XHU4RDcwIGByZW5kZXJNYXJrZG93bmBcdUZGMENcbiAqIFx1NTE3Nlx1NEY1OVx1NzdFRFx1NUI1N1x1N0IyNlx1NEUzMlx1NUI1N1x1NkJCNVx1OEQ3MCBgZXNjYXBlSHRtbGBcdUZGMUJcdTRFRTNcdTc4MDFcdTk4OThcdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDhcdThENzAgYGhpZ2hsaWdodCgpYCBcdTc3NDBcdTgyNzJcdTMwMDJcbiAqL1xuXG5pbXBvcnQgeyBoaWdobGlnaHQgfSBmcm9tICcuL2hpZ2hsaWdodC5qcyc7XG5pbXBvcnQgeyBlc2NhcGVIdG1sLCByZW5kZXJNYXJrZG93biB9IGZyb20gJy4vbWFya2Rvd24uanMnO1xuXG5kZWNsYXJlIGZ1bmN0aW9uIGFjcXVpcmVWc0NvZGVBcGkoKToge1xuICBwb3N0TWVzc2FnZShtc2c6IHVua25vd24pOiB2b2lkO1xuICBnZXRTdGF0ZSgpOiB1bmtub3duO1xuICBzZXRTdGF0ZShzdGF0ZTogdW5rbm93bik6IHZvaWQ7XG59O1xuXG5pbnRlcmZhY2UgSG9zdFRvV2Vidmlld01lc3NhZ2Uge1xuICB0eXBlOiBzdHJpbmc7XG4gIHBheWxvYWQ/OiB1bmtub3duO1xuICBvaz86IGJvb2xlYW47XG4gIHJlYXNvbj86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIExlYXJuaW5nU3RhdGUge1xuICBtYXN0ZXJ5OiAndW5sZWFybmVkJyB8ICdsZWFybmluZycgfCAnbWFzdGVyZWQnIHwgJ25vdF9tYXN0ZXJlZCc7XG4gIGZhdm9yaXRlRmxhZzogYm9vbGVhbjtcbiAgd3JvbmdGbGFnOiBib29sZWFuO1xuICBoYXNOb3RlOiBib29sZWFuO1xuICBsYXN0UHJhY3RpY2VkQXQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBRdWVzdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdjb2RlJyB8ICdxYSc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgdGFnczogc3RyaW5nW107XG4gIGRpZmZpY3VsdHk6ICdlYXN5JyB8ICdtZWRpdW0nIHwgJ2hhcmQnIHwgc3RyaW5nO1xuICBsYW5ndWFnZT86IHN0cmluZztcbiAgYW5zd2VyOiBzdHJpbmc7XG4gIHRlc3RDYXNlcz86IEFycmF5PHtcbiAgICBuYW1lPzogc3RyaW5nO1xuICAgIGlucHV0Pzogc3RyaW5nO1xuICAgIGV4cGVjdGVkPzogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICB9PjtcbiAgZm9sbG93VXBzPzogQXJyYXk8eyBxdWVzdGlvbjogc3RyaW5nOyBhbnN3ZXI/OiBzdHJpbmcgfT47XG59XG5cbmNvbnN0IHZzY29kZSA9IGFjcXVpcmVWc0NvZGVBcGkoKTtcblxubGV0IGN1cnJlbnRRdWVzdGlvbjogUXVlc3Rpb24gfCB1bmRlZmluZWQ7XG5cbmZ1bmN0aW9uICQoaWQ6IHN0cmluZyk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG59XG5cbmZ1bmN0aW9uIGRpZmZpY3VsdHlMYWJlbChkOiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGQpIHtcbiAgICBjYXNlICdlYXN5JzpcbiAgICAgIHJldHVybiAnXHU3QjgwXHU1MzU1JztcbiAgICBjYXNlICdtZWRpdW0nOlxuICAgICAgcmV0dXJuICdcdTRFMkRcdTdCNDknO1xuICAgIGNhc2UgJ2hhcmQnOlxuICAgICAgcmV0dXJuICdcdTU2RjBcdTk2QkUnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZDtcbiAgfVxufVxuXG5mdW5jdGlvbiBkaWZmaWN1bHR5Q2xhc3MoZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChkKSB7XG4gICAgY2FzZSAnZWFzeSc6XG4gICAgICByZXR1cm4gJ2RpZmYtZWFzeSc7XG4gICAgY2FzZSAnbWVkaXVtJzpcbiAgICAgIHJldHVybiAnZGlmZi1tZWRpdW0nO1xuICAgIGNhc2UgJ2hhcmQnOlxuICAgICAgcmV0dXJuICdkaWZmLWhhcmQnO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuLyoqXG4gKiBcdTkxQ0RcdTdGNkVcdTdCNTRcdTY4NDhcdTUzM0FcdTUyMzBcIlx1NjcyQVx1NUM1NVx1NUYwMFwiXHU3MkI2XHU2MDAxXHUzMDAyXG4gKlxuICogXHU2Q0U4XHU2MTBGXHU1M0VBXHU2RTA1XHU3QTdBIGAjYW5zd2VyLWNvbnRlbnRgIFx1ODAwQ1x1NEUwRFx1NjYyRiBgI2Fuc3dlci1hcmVhYFx1RkYwQ1x1NTZFMFx1NEUzQVx1NTQwRVx1ODAwNVx1OEZEOFx1NTMwNVx1NTQyQlxuICogXHU2NTM2XHU4RDc3XHU2MzA5XHU5NEFFIGAjYnRuLWNvbGxhcHNlLWFuc3dlcmBcdUZGMENcdTY1NzRcdTRGNTNcdTZFMDVcdTdBN0FcdTRGMUFcdTRFMjJcdTU5MzFcdTYzMDlcdTk0QUVcdTMwMDJcbiAqL1xuZnVuY3Rpb24gaGlkZUFuc3dlclNlY3Rpb24oKTogdm9pZCB7XG4gIGNvbnN0IGFyZWEgPSAkKCdhbnN3ZXItYXJlYScpO1xuICBpZiAoYXJlYSkgYXJlYS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgY29uc3QgY29udGVudCA9ICQoJ2Fuc3dlci1jb250ZW50Jyk7XG4gIGlmIChjb250ZW50KSBjb250ZW50LmlubmVySFRNTCA9ICcnO1xuICBjb25zdCBmb2xsb3dVcHNFbCA9ICQoJ2ZvbGxvdy11cHMnKTtcbiAgaWYgKGZvbGxvd1Vwc0VsKSBmb2xsb3dVcHNFbC5pbm5lckhUTUwgPSAnJztcbiAgY29uc3QgdG9nZ2xlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmFuc3dlci10b2dnbGUnKTtcbiAgaWYgKHRvZ2dsZSkgKHRvZ2dsZSBhcyBIVE1MRWxlbWVudCkuaGlkZGVuID0gZmFsc2U7XG4gIGNvbnN0IHNob3dCdG4gPSAkKCdidG4tc2hvdy1hbnN3ZXInKTtcbiAgaWYgKHNob3dCdG4pIHNob3dCdG4ucmVtb3ZlQXR0cmlidXRlKCdoaWRkZW4nKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUXVlc3Rpb24ocXVlc3Rpb246IFF1ZXN0aW9uKTogdm9pZCB7XG4gIGN1cnJlbnRRdWVzdGlvbiA9IHF1ZXN0aW9uO1xuXG4gIGNvbnN0IHRpdGxlRWwgPSAkKCdxdWVzdGlvbi10aXRsZScpO1xuICBpZiAodGl0bGVFbCkgdGl0bGVFbC50ZXh0Q29udGVudCA9IHF1ZXN0aW9uLnRpdGxlO1xuXG4gIC8vIG1ldGEgXHU1RkJEXHU3QUUwIC8gXHU2ODA3XHU3QjdFXG4gIGNvbnN0IG1ldGFFbCA9ICQoJ3F1ZXN0aW9uLW1ldGEnKTtcbiAgaWYgKG1ldGFFbCkge1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcnRzLnB1c2goXG4gICAgICBgPHNwYW4gY2xhc3M9XCJwaWxsICR7cXVlc3Rpb24udHlwZSA9PT0gJ2NvZGUnID8gJ3R5cGUtY29kZScgOiAndHlwZS1xYSd9XCI+JHtcbiAgICAgICAgcXVlc3Rpb24udHlwZSA9PT0gJ2NvZGUnID8gJ1x1NEVFM1x1NzgwMVx1OTg5OCcgOiAnXHU5NUVFXHU3QjU0XHU5ODk4J1xuICAgICAgfTwvc3Bhbj5gLFxuICAgICk7XG4gICAgcGFydHMucHVzaChcbiAgICAgIGA8c3BhbiBjbGFzcz1cInBpbGwgJHtkaWZmaWN1bHR5Q2xhc3MocXVlc3Rpb24uZGlmZmljdWx0eSl9XCI+JHtlc2NhcGVIdG1sKFxuICAgICAgICBkaWZmaWN1bHR5TGFiZWwocXVlc3Rpb24uZGlmZmljdWx0eSksXG4gICAgICApfTwvc3Bhbj5gLFxuICAgICk7XG4gICAgaWYgKHF1ZXN0aW9uLmNhdGVnb3J5KSB7XG4gICAgICBwYXJ0cy5wdXNoKFxuICAgICAgICBgPHNwYW4gY2xhc3M9XCJwaWxsIGNhdGVnb3J5XCI+JHtlc2NhcGVIdG1sKHF1ZXN0aW9uLmNhdGVnb3J5KX08L3NwYW4+YCxcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KHF1ZXN0aW9uLnRhZ3MpKSB7XG4gICAgICBmb3IgKGNvbnN0IHQgb2YgcXVlc3Rpb24udGFncykge1xuICAgICAgICBpZiAodHlwZW9mIHQgPT09ICdzdHJpbmcnICYmIHQubGVuZ3RoID4gMCAmJiB0ICE9PSBxdWVzdGlvbi5jYXRlZ29yeSkge1xuICAgICAgICAgIHBhcnRzLnB1c2goYDxzcGFuIGNsYXNzPVwidGFnXCI+JHtlc2NhcGVIdG1sKHQpfTwvc3Bhbj5gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAocXVlc3Rpb24udHlwZSA9PT0gJ2NvZGUnICYmIHF1ZXN0aW9uLmxhbmd1YWdlKSB7XG4gICAgICBwYXJ0cy5wdXNoKGA8c3BhbiBjbGFzcz1cInRhZ1wiPiR7ZXNjYXBlSHRtbChxdWVzdGlvbi5sYW5ndWFnZSl9PC9zcGFuPmApO1xuICAgIH1cbiAgICBtZXRhRWwuaW5uZXJIVE1MID0gcGFydHMuam9pbignJyk7XG4gIH1cblxuICAvLyBcdTk4OThcdTk3NjJcdUZGMUFtYXJrZG93biBcdTZFMzJcdTY3RDNcbiAgY29uc3QgY29udGVudEVsID0gJCgncXVlc3Rpb24tY29udGVudCcpO1xuICBpZiAoY29udGVudEVsKSBjb250ZW50RWwuaW5uZXJIVE1MID0gcmVuZGVyTWFya2Rvd24ocXVlc3Rpb24uY29udGVudCk7XG5cbiAgLy8gXHU2RDRCXHU4QkQ1XHU3NTI4XHU0RjhCXG4gIGNvbnN0IHRlc3RDYXNlc0VsID0gJCgndGVzdC1jYXNlcycpO1xuICBpZiAodGVzdENhc2VzRWwpIHtcbiAgICBpZiAoXG4gICAgICBxdWVzdGlvbi50eXBlID09PSAnY29kZScgJiZcbiAgICAgIEFycmF5LmlzQXJyYXkocXVlc3Rpb24udGVzdENhc2VzKSAmJlxuICAgICAgcXVlc3Rpb24udGVzdENhc2VzLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIGxldCBodG1sID0gJzxoMj5cdTZENEJcdThCRDVcdTc1MjhcdTRGOEI8L2gyPic7XG4gICAgICBmb3IgKGNvbnN0IHRjIG9mIHF1ZXN0aW9uLnRlc3RDYXNlcykge1xuICAgICAgICBodG1sICs9ICc8ZGl2IGNsYXNzPVwidGVzdC1jYXNlXCI+JztcbiAgICAgICAgaWYgKHRjLm5hbWUpIHtcbiAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwidGVzdC1jYXNlLW5hbWVcIj4ke2VzY2FwZUh0bWwodGMubmFtZSl9PC9kaXY+YDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGMuaW5wdXQpIHtcbiAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwidGVzdC1jYXNlLXJvd1wiPjxzcGFuIGNsYXNzPVwidGVzdC1jYXNlLWxhYmVsXCI+XHU4RjkzXHU1MTY1PC9zcGFuPjxjb2RlPiR7ZXNjYXBlSHRtbCh0Yy5pbnB1dCl9PC9jb2RlPjwvZGl2PmA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRjLmV4cGVjdGVkKSB7XG4gICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInRlc3QtY2FzZS1yb3dcIj48c3BhbiBjbGFzcz1cInRlc3QtY2FzZS1sYWJlbFwiPlx1OTg4NFx1NjcxRjwvc3Bhbj48Y29kZT4ke2VzY2FwZUh0bWwodGMuZXhwZWN0ZWQpfTwvY29kZT48L2Rpdj5gO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0Yy5kZXNjcmlwdGlvbikge1xuICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJ0ZXN0LWNhc2Utcm93XCI+PHNwYW4gY2xhc3M9XCJ0ZXN0LWNhc2UtbGFiZWxcIj5cdThCRjRcdTY2MEU8L3NwYW4+PHNwYW4+JHtlc2NhcGVIdG1sKHRjLmRlc2NyaXB0aW9uKX08L3NwYW4+PC9kaXY+YDtcbiAgICAgICAgfVxuICAgICAgICBodG1sICs9ICc8L2Rpdj4nO1xuICAgICAgfVxuICAgICAgdGVzdENhc2VzRWwuaW5uZXJIVE1MID0gaHRtbDtcbiAgICB9IGVsc2Uge1xuICAgICAgdGVzdENhc2VzRWwuaW5uZXJIVE1MID0gJyc7XG4gICAgfVxuICB9XG5cbiAgLy8gXHU1MjA3XHU5ODk4XHU2NUY2XHU5MUNEXHU3RjZFXHU3QjU0XHU2ODQ4XHU1MzNBXHU1MjMwXHU2NzJBXHU1QzU1XHU1RjAwXHU3MkI2XHU2MDAxXG4gIGhpZGVBbnN3ZXJTZWN0aW9uKCk7XG59XG5cbi8qKlxuICogXHU1QjY2XHU0RTYwXHU3MkI2XHU2MDAxXHU3NkY4XHU1MTczIFVJIFx1NjZGNFx1NjVCMFx1MzAwMlxuICpcbiAqIFx1NjVCMFx1NzI0OCBVSSBcdTVERjJcdTc5RkJcdTk2NjQgbWFzdGVyeSA0IFx1NkJCNVx1OTAwOVx1NjJFOVx1NTY2OFx1RkYwQ1x1NTNFQVx1NEZERFx1NzU1OVx1NjgwN1x1OTg5OFx1NjgwRlx1NTNGM1x1NEZBN1x1NzY4NFx1NjUzNlx1ODVDRlx1NjYxRlx1NjMwOVx1OTRBRVx1RkYwQ1xuICogXHU1NkUwXHU2QjY0XHU2NzJDXHU1MUZEXHU2NTcwXHU1M0VBXHU2NkY0XHU2NUIwIGAjYnRuLWZhdm9yaXRlYCBcdTc2ODQgYWN0aXZlIFx1NzJCNlx1NjAwMVx1NEUwRSBhcmlhIFx1NjU4N1x1Njg0OFx1MzAwMlxuICogXHU1MTY1XHU1M0MyXHU3QzdCXHU1NzhCXHU0RUNEXHU0RkREXHU3NTU5XHU1QjhDXHU2NTc0IExlYXJuaW5nU3RhdGVcdUZGMENcdTRGQkZcdTRFOEVcdTYyNjlcdTVDNTVcdTdBRUZcdTUzNEZcdThCQUVcdTRFMERcdTUzRDhcdTMwMDJcbiAqL1xuZnVuY3Rpb24gdXBkYXRlTGVhcm5pbmdVSShsZWFybmluZzogTGVhcm5pbmdTdGF0ZSk6IHZvaWQge1xuICBjb25zdCBmYXZCdG4gPSAkKCdidG4tZmF2b3JpdGUnKTtcbiAgaWYgKCFmYXZCdG4pIHJldHVybjtcbiAgZmF2QnRuLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGxlYXJuaW5nLmZhdm9yaXRlRmxhZyk7XG4gIGZhdkJ0bi5zZXRBdHRyaWJ1dGUoXG4gICAgJ2FyaWEtbGFiZWwnLFxuICAgIGxlYXJuaW5nLmZhdm9yaXRlRmxhZyA/ICdcdTUzRDZcdTZEODhcdTY1MzZcdTg1Q0YnIDogJ1x1NjUzNlx1ODVDRicsXG4gICk7XG4gIGZhdkJ0bi5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgbGVhcm5pbmcuZmF2b3JpdGVGbGFnID8gJ1x1NTNENlx1NkQ4OFx1NjUzNlx1ODVDRicgOiAnXHU2NTM2XHU4NUNGJyk7XG59XG5cbmludGVyZmFjZSBBbnN3ZXJQYXlsb2FkIHtcbiAgcXVlc3Rpb25UeXBlOiAnY29kZScgfCAncWEnO1xuICBhbnN3ZXI6XG4gICAgfCB7XG4gICAgICAgIGtpbmQ6ICdyZWZlcmVuY2UnO1xuICAgICAgICBjb2RlPzogc3RyaW5nO1xuICAgICAgICBicmllZkFuc3dlcj86IHN0cmluZztcbiAgICAgICAgZGV0YWlsZWRBbnN3ZXI/OiBzdHJpbmc7XG4gICAgICAgIGZvbGxvd1Vwcz86IEFycmF5PHsgcXVlc3Rpb246IHN0cmluZzsgYW5zd2VyPzogc3RyaW5nIH0+O1xuICAgICAgfVxuICAgIHwgeyBraW5kOiAnbm9uZSc7IGhpbnQ6IHN0cmluZyB9O1xufVxuXG5mdW5jdGlvbiBzaG93QW5zd2VyKHBheWxvYWQ6IEFuc3dlclBheWxvYWQpOiB2b2lkIHtcbiAgY29uc3QgYXJlYSA9ICQoJ2Fuc3dlci1hcmVhJyk7XG4gIGNvbnN0IGNvbnRlbnQgPSAkKCdhbnN3ZXItY29udGVudCcpO1xuICBpZiAoIWFyZWEgfHwgIWNvbnRlbnQpIHJldHVybjtcblxuICBhcmVhLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXG4gIGNvbnN0IGFucyA9IHBheWxvYWQuYW5zd2VyO1xuICBpZiAoYW5zLmtpbmQgPT09ICdub25lJykge1xuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiYW5zd2VyLWxhYmVsXCI+XHU1M0MyXHU4MDAzXHU3QjU0XHU2ODQ4PC9zcGFuPjxwPiR7ZXNjYXBlSHRtbChcbiAgICAgIGFucy5oaW50ID8/ICdcdThCRTVcdTk4OThcdTY2ODJcdTY1RTBcdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDgnLFxuICAgICl9PC9wPmA7XG4gIH0gZWxzZSB7XG4gICAgbGV0IGh0bWwgPSAnPHNwYW4gY2xhc3M9XCJhbnN3ZXItbGFiZWxcIj5cdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDg8L3NwYW4+JztcbiAgICBpZiAocGF5bG9hZC5xdWVzdGlvblR5cGUgPT09ICdjb2RlJykge1xuICAgICAgY29uc3QgbGFuZyA9XG4gICAgICAgIGN1cnJlbnRRdWVzdGlvbiAmJiBjdXJyZW50UXVlc3Rpb24udHlwZSA9PT0gJ2NvZGUnXG4gICAgICAgICAgPyBjdXJyZW50UXVlc3Rpb24ubGFuZ3VhZ2UgPz8gJydcbiAgICAgICAgICA6ICcnO1xuICAgICAgY29uc3QgbGFuZ0NsYXNzID0gbGFuZyA/IGAgY2xhc3M9XCJsYW5nLSR7ZXNjYXBlSHRtbChsYW5nKX1cImAgOiAnJztcbiAgICAgIGh0bWwgKz0gYDxwcmU+PGNvZGUke2xhbmdDbGFzc30+JHtoaWdobGlnaHQoYW5zLmNvZGUgPz8gJycsIGxhbmcpfTwvY29kZT48L3ByZT5gO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoYW5zLmJyaWVmQW5zd2VyKSB7XG4gICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJicmllZiBtZFwiPiR7cmVuZGVyTWFya2Rvd24oYW5zLmJyaWVmQW5zd2VyKX08L2Rpdj5gO1xuICAgICAgfVxuICAgICAgaWYgKGFucy5kZXRhaWxlZEFuc3dlcikge1xuICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiZGV0YWlsZWQgbWRcIj48aDM+XHU4QkU2XHU3RUM2XHU4OUUzXHU2NzkwPC9oMz4ke3JlbmRlck1hcmtkb3duKGFucy5kZXRhaWxlZEFuc3dlcil9PC9kaXY+YDtcbiAgICAgIH1cbiAgICB9XG4gICAgY29udGVudC5pbm5lckhUTUwgPSBodG1sO1xuICB9XG5cbiAgLy8gXHU4RkZEXHU5NUVFXHVGRjA4XHU0RUM1IFFBIFx1OTg5OFx1NEUxNCByZWZlcmVuY2VcdUZGMDlcbiAgY29uc3QgZm9sbG93VXBzRWwgPSAkKCdmb2xsb3ctdXBzJyk7XG4gIGlmIChmb2xsb3dVcHNFbCkge1xuICAgIGlmIChcbiAgICAgIGFucy5raW5kID09PSAncmVmZXJlbmNlJyAmJlxuICAgICAgcGF5bG9hZC5xdWVzdGlvblR5cGUgPT09ICdxYScgJiZcbiAgICAgIEFycmF5LmlzQXJyYXkoYW5zLmZvbGxvd1VwcykgJiZcbiAgICAgIGFucy5mb2xsb3dVcHMubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgbGV0IGZ1SHRtbCA9ICc8aDIgY2xhc3M9XCJmb2xsb3d1cHMtdGl0bGVcIj5cdThGRkRcdTk1RUU8L2gyPic7XG4gICAgICBmb3IgKGNvbnN0IGZ1IG9mIGFucy5mb2xsb3dVcHMpIHtcbiAgICAgICAgZnVIdG1sICs9ICc8ZGl2IGNsYXNzPVwiZm9sbG93LXVwXCI+JztcbiAgICAgICAgZnVIdG1sICs9IGA8ZGl2IGNsYXNzPVwiZm9sbG93LXVwLXFcIj4ke2VzY2FwZUh0bWwoZnUucXVlc3Rpb24pfTwvZGl2PmA7XG4gICAgICAgIGlmIChmdS5hbnN3ZXIpIHtcbiAgICAgICAgICBmdUh0bWwgKz0gYDxkaXYgY2xhc3M9XCJmb2xsb3ctdXAtYSBtZFwiPiR7cmVuZGVyTWFya2Rvd24oZnUuYW5zd2VyKX08L2Rpdj5gO1xuICAgICAgICB9XG4gICAgICAgIGZ1SHRtbCArPSAnPC9kaXY+JztcbiAgICAgIH1cbiAgICAgIGZvbGxvd1Vwc0VsLmlubmVySFRNTCA9IGZ1SHRtbDtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9sbG93VXBzRWwuaW5uZXJIVE1MID0gJyc7XG4gICAgfVxuICB9XG5cbiAgLy8gXHU1MjA3XHU2MzYyIHRvZ2dsZSBcdTUzM0FcdTUyMzBcdTk2OTBcdTg1Q0ZcdTcyQjZcdTYwMDFcdUZGMDhcdTU0MENcdTY1RjZcdTYyOEEgc2hvdyBcdTYzMDlcdTk0QUUgaGlkZVx1RkYwQ1x1NEVFNVx1NTkwN1x1NUMwNlx1Njc2NVx1OTFDRFx1NjVCMFx1NjYzRVx1NzkzQVx1RkYwOVxuICBjb25zdCB0b2dnbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuYW5zd2VyLXRvZ2dsZScpO1xuICBpZiAodG9nZ2xlKSAodG9nZ2xlIGFzIEhUTUxFbGVtZW50KS5oaWRkZW4gPSB0cnVlO1xuICBjb25zdCBzaG93QnRuID0gJCgnYnRuLXNob3ctYW5zd2VyJyk7XG4gIGlmIChzaG93QnRuKSBzaG93QnRuLnNldEF0dHJpYnV0ZSgnaGlkZGVuJywgJycpO1xufVxuXG5sZXQgc3RhdHVzVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBzaG93U3RhdHVzKG1zZzogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IGVsID0gJCgnc3RhdHVzLW1lc3NhZ2UnKTtcbiAgaWYgKCFlbCkgcmV0dXJuO1xuICBlbC50ZXh0Q29udGVudCA9IG1zZztcbiAgZWwuY2xhc3NMaXN0LmFkZCgnc2hvdycpO1xuICBpZiAoc3RhdHVzVGltZXIgIT09IHVuZGVmaW5lZCkgY2xlYXJUaW1lb3V0KHN0YXR1c1RpbWVyKTtcbiAgc3RhdHVzVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdzaG93Jyk7XG4gIH0sIDI0MDApO1xufVxuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAkKCdidG4tc2hvdy1hbnN3ZXInKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3JlcXVlc3RBbnN3ZXInIH0pO1xuICB9KTtcblxuICAkKCdidG4tY29sbGFwc2UtYW5zd2VyJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGhpZGVBbnN3ZXJTZWN0aW9uKCk7XG4gIH0pO1xuXG4gICQoJ2J0bi1mYXZvcml0ZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICB2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAndG9nZ2xlRmF2b3JpdGUnIH0pO1xuICB9KTtcblxuICB2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAncmVhZHknIH0pO1xufSk7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgKGV2ZW50KSA9PiB7XG4gIGNvbnN0IG1zZyA9IGV2ZW50LmRhdGEgYXMgSG9zdFRvV2Vidmlld01lc3NhZ2U7XG4gIHN3aXRjaCAobXNnLnR5cGUpIHtcbiAgICBjYXNlICdpbml0Jzoge1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1zZy5wYXlsb2FkIGFzIHsgcXVlc3Rpb246IFF1ZXN0aW9uOyBsZWFybmluZzogTGVhcm5pbmdTdGF0ZSB9O1xuICAgICAgcmVuZGVyUXVlc3Rpb24ocGF5bG9hZC5xdWVzdGlvbik7XG4gICAgICB1cGRhdGVMZWFybmluZ1VJKHBheWxvYWQubGVhcm5pbmcpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ3Nob3dBbnN3ZXInOiB7XG4gICAgICBzaG93QW5zd2VyKG1zZy5wYXlsb2FkIGFzIEFuc3dlclBheWxvYWQpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ3JvbGxiYWNrJzpcbiAgICBjYXNlICdyZWZyZXNoTGVhcm5pbmcnOiB7XG4gICAgICBjb25zdCBsZWFybmluZyA9IG1zZy5wYXlsb2FkIGFzIExlYXJuaW5nU3RhdGU7XG4gICAgICBpZiAobGVhcm5pbmcpIHVwZGF0ZUxlYXJuaW5nVUkobGVhcm5pbmcpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ2Zhdm9yaXRlQWNrJzoge1xuICAgICAgaWYgKCFtc2cub2spIHNob3dTdGF0dXMoYFx1NjUzNlx1ODVDRlx1NjRDRFx1NEY1Q1x1NTkzMVx1OEQyNTogJHttc2cucmVhc29uID8/ICdcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUYnfWApO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQXdCQSxXQUFTLFdBQVcsR0FBbUI7QUFDckMsV0FBTyxFQUNKLFFBQVEsTUFBTSxPQUFPLEVBQ3JCLFFBQVEsTUFBTSxNQUFNLEVBQ3BCLFFBQVEsTUFBTSxNQUFNLEVBQ3BCLFFBQVEsTUFBTSxRQUFRLEVBQ3RCLFFBQVEsTUFBTSxPQUFPO0FBQUEsRUFDMUI7QUFRQSxXQUFTLFNBQVMsS0FBYSxPQUFvQztBQUNqRSxRQUFJLE1BQU07QUFDVixRQUFJLFFBQVE7QUFDWixVQUFNLFFBQVEsTUFBWTtBQUN4QixVQUFJLE9BQU87QUFDVCxlQUFPLFdBQVcsS0FBSztBQUN2QixnQkFBUTtBQUFBLE1BQ1Y7QUFBQSxJQUNGO0FBQ0EsUUFBSSxJQUFJO0FBQ1IsV0FBTyxJQUFJLElBQUksUUFBUTtBQUNyQixVQUFJLFVBQVU7QUFDZCxpQkFBVyxLQUFLLE9BQU87QUFDckIsVUFBRSxHQUFHLFlBQVk7QUFDakIsY0FBTSxJQUFJLEVBQUUsR0FBRyxLQUFLLEdBQUc7QUFDdkIsWUFBSSxLQUFLLEVBQUUsVUFBVSxHQUFHO0FBQ3RCLGdCQUFNO0FBQ04saUJBQU8sbUJBQW1CLEVBQUUsSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNyRCxjQUFJLEVBQUUsR0FBRztBQUNULG9CQUFVO0FBQ1Y7QUFBQSxRQUNG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QVcsQ0FBQyxVQUFVO0FBQzVDLFVBQU0sTUFBTSxNQUFNO0FBQ2xCLFlBQVEsSUFBSSxNQUFNO0FBQUEsTUFDaEIsS0FBSyxRQUFRO0FBQ1gsY0FBTSxVQUFVLElBQUk7QUFDcEIsdUJBQWUsUUFBUSxRQUFRO0FBQy9CLHlCQUFpQixRQUFRLFFBQVE7QUFDakM7QUFBQSxNQUNGO0FBQUEsTUFDQSxLQUFLLGNBQWM7QUFDakIsbUJBQVcsSUFBSSxPQUF3QjtBQUN2QztBQUFBLE1BQ0Y7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMLEtBQUssbUJBQW1CO0FBQ3RCLGNBQU0sV0FBVyxJQUFJO0FBQ3JCLFlBQUksU0FBVSxrQkFBaUIsUUFBUTtBQUN2QztBQUFBLE1BQ0Y7QUFBQSxNQUNBLEtBQUssZUFBZTtBQUNsQixZQUFJLENBQUMsSUFBSSxHQUFJLFlBQVcseUNBQVcsSUFBSSxVQUFVLDBCQUFNLEVBQUU7QUFDekQ7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiZXNjYXBlSHRtbCIsICJlc2NhcGVIdG1sIl0KfQo=
