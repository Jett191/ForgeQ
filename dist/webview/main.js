"use strict";
(() => {
  // src/practice/webview/markdown.ts
  function escapeHtml(s) {
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
          `<pre><code${langClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`
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
    let out = escapeHtml(s);
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
        `<span class="pill ${difficultyClass(question.difficulty)}">${escapeHtml(
          difficultyLabel(question.difficulty)
        )}</span>`
      );
      if (question.category) {
        parts.push(
          `<span class="pill category">${escapeHtml(question.category)}</span>`
        );
      }
      if (Array.isArray(question.tags)) {
        for (const t of question.tags) {
          if (typeof t === "string" && t.length > 0 && t !== question.category) {
            parts.push(`<span class="tag">${escapeHtml(t)}</span>`);
          }
        }
      }
      if (question.type === "code" && question.language) {
        parts.push(`<span class="tag">${escapeHtml(question.language)}</span>`);
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
            html += `<div class="test-case-name">${escapeHtml(tc.name)}</div>`;
          }
          if (tc.input) {
            html += `<div class="test-case-row"><span class="test-case-label">\u8F93\u5165</span><code>${escapeHtml(tc.input)}</code></div>`;
          }
          if (tc.expected) {
            html += `<div class="test-case-row"><span class="test-case-label">\u9884\u671F</span><code>${escapeHtml(tc.expected)}</code></div>`;
          }
          if (tc.description) {
            html += `<div class="test-case-row"><span class="test-case-label">\u8BF4\u660E</span><span>${escapeHtml(tc.description)}</span></div>`;
          }
          html += "</div>";
        }
        testCasesEl.innerHTML = html;
      } else {
        testCasesEl.innerHTML = "";
      }
    }
    const answerEl = $("answer-area");
    if (answerEl) {
      answerEl.classList.add("hidden");
      answerEl.innerHTML = "";
    }
    const followUpsEl = $("follow-ups");
    if (followUpsEl) followUpsEl.innerHTML = "";
    const showBtn = $("btn-show-answer");
    if (showBtn) showBtn.removeAttribute("hidden");
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
  }
  function showAnswer(payload) {
    const area = $("answer-area");
    if (!area) return;
    area.classList.remove("hidden");
    const ans = payload.answer;
    if (ans.kind === "none") {
      area.innerHTML = `<span class="answer-label">\u53C2\u8003\u7B54\u6848</span><p>${escapeHtml(
        ans.hint ?? "\u8BE5\u9898\u6682\u65E0\u53C2\u8003\u7B54\u6848"
      )}</p>`;
      const btn2 = $("btn-show-answer");
      if (btn2) btn2.setAttribute("hidden", "");
      return;
    }
    let html = '<span class="answer-label">\u53C2\u8003\u7B54\u6848</span>';
    if (payload.questionType === "code") {
      const lang = currentQuestion && currentQuestion.type === "code" ? currentQuestion.language ?? "" : "";
      const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
      html += `<pre><code${langClass}>${escapeHtml(ans.code ?? "")}</code></pre>`;
    } else {
      if (ans.briefAnswer) {
        html += `<div class="brief md">${renderMarkdown(ans.briefAnswer)}</div>`;
      }
      if (ans.detailedAnswer) {
        html += `<div class="detailed md"><h3>\u8BE6\u7EC6\u89E3\u6790</h3>${renderMarkdown(ans.detailedAnswer)}</div>`;
      }
    }
    area.innerHTML = html;
    const followUpsEl = $("follow-ups");
    if (followUpsEl && payload.questionType === "qa" && Array.isArray(ans.followUps) && ans.followUps.length > 0) {
      let fuHtml = '<h2 class="followups-title">\u8FFD\u95EE</h2>';
      for (const fu of ans.followUps) {
        fuHtml += '<div class="follow-up">';
        fuHtml += `<div class="follow-up-q">${escapeHtml(fu.question)}</div>`;
        if (fu.answer) {
          fuHtml += `<div class="follow-up-a md">${renderMarkdown(fu.answer)}</div>`;
        }
        fuHtml += "</div>";
      }
      followUpsEl.innerHTML = fuHtml;
    } else if (followUpsEl) {
      followUpsEl.innerHTML = "";
    }
    const btn = $("btn-show-answer");
    if (btn) btn.setAttribute("hidden", "");
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
    $("btn-favorite")?.addEventListener("click", () => {
      vscode.postMessage({ type: "toggleFavorite" });
    });
    document.querySelectorAll("[data-mastery]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset["mastery"];
        if (value) vscode.postMessage({ type: "setMastery", value });
      });
    });
    $("link-open-note")?.addEventListener("click", (e) => {
      e.preventDefault();
      vscode.postMessage({ type: "openNativeEditor", target: "note" });
    });
    $("link-note-preview")?.addEventListener("click", (e) => {
      e.preventDefault();
      vscode.postMessage({ type: "requestNotePreview" });
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
      case "masteryAck": {
        if (!msg.ok) showStatus(`\u638C\u63E1\u72B6\u6001\u66F4\u65B0\u5931\u8D25: ${msg.reason ?? "\u672A\u77E5\u9519\u8BEF"}`);
        break;
      }
      case "favoriteAck": {
        if (!msg.ok) showStatus(`\u6536\u85CF\u64CD\u4F5C\u5931\u8D25: ${msg.reason ?? "\u672A\u77E5\u9519\u8BEF"}`);
        break;
      }
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ByYWN0aWNlL3dlYnZpZXcvbWFya2Rvd24udHMiLCAiLi4vLi4vc3JjL3ByYWN0aWNlL3dlYnZpZXcvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBcdTY3ODFcdTdCODAgTWFya2Rvd24gXHU2RTMyXHU2N0QzXHU1NjY4XHVGRjA4d2VidmlldyBcdTdBRUYgaW5saW5lIFx1NUI5RVx1NzNCMFx1RkYwQ1x1NjVFMFx1N0IyQ1x1NEUwOVx1NjVCOVx1NEY5RFx1OEQ1Nlx1RkYwOVx1MzAwMlxuICpcbiAqIFx1OTg5OFx1NUU5M1x1NTE4NVx1NUJCOVx1NTMwNVx1NTQyQlx1NTkyN1x1OTFDRiBNYXJrZG93blx1RkYxQVx1NjgwN1x1OTg5OFx1RkYwOGAjYC9gIyNgLi4uXHVGRjA5XHUzMDAxXHU3Qzk3XHU0RjUzXHVGRjA4YCoqLi4uKipgXHVGRjA5XHUzMDAxXHU0RUUzXHU3ODAxXHU1NzU3XHUzMDAxXG4gKiBcdTUyMTdcdTg4NjhcdTMwMDFcdTg4NjhcdTY4M0NcdTMwMDFcdTVGMTVcdTc1MjhcdTMwMDFcdTUyMDZcdTUyNzJcdTdFQkZcdTMwMDFcdTk0RkVcdTYzQTVcdTdCNDlcdTMwMDJXZWJ2aWV3IFx1NUZDNVx1OTg3Qlx1NjI4QVx1NUI4M1x1NEVFQ1x1NEVFNVx1NjM5Mlx1NzI0OFx1NTNDQlx1NTk3RFx1NzY4NCBIVE1MXG4gKiBcdTU0NDhcdTczQjBcdUZGMENcdTU0MjZcdTUyMTlcdTUzOUZcdTY1ODcgYCoqYCBgXFxuYCBgI2AgXHU0RjFBXHU3NkY0XHU2M0E1XHU2NjNFXHU3OTNBXHU1NzI4XHU5NzYyXHU2NzdGXHU0RTBBXHVGRjBDXHU0RjUzXHU5QThDXHU1Rjg4XHU1REVFXHUzMDAyXG4gKlxuICogXHU3NTMxXHU0RThFIFZTIENvZGUgV2VidmlldyBcdTc2ODQgQ1NQIFx1OUVEOFx1OEJBNFx1Nzk4MVx1NkI2Mlx1NTkxNlx1OTBFOFx1ODExQVx1NjcyQ1x1NEUwRVx1NjgzN1x1NUYwRlx1RkYwQ1x1NUYxNVx1NTE2NVx1N0IyQ1x1NEUwOVx1NjVCOSBtYXJrZG93blxuICogXHU1RTkzXHU0RjFBXHU4QkE5XHU2Nzg0XHU1RUZBL1x1NjI1M1x1NTMwNS9cdThENDRcdTZFOTBcdTUyQTBcdThGN0RcdTY2RjRcdTU5MERcdTY3NDJcdUZGMUJcdTY3MkNcdTYyNjlcdTVDNTVcdTRFNUZcdTRFMERcdTk3MDBcdTg5ODEgR0ZNIFx1NTE2OFx1NzI3OVx1NjAyN1x1RkYwQ1x1NTZFMFx1NkI2NFx1ODFFQVx1NTE5OVx1NEUwMFx1NEUyQVxuICogXCJcdTU5MUZcdTc1MjhcIiBcdTc2ODRcdTZFMzJcdTY3RDNcdTU2NjhcdUZGMENcdTg5ODZcdTc2RDZcdTU5ODJcdTRFMEJcdTVCNTBcdTk2QzZcdUZGMUFcbiAqXG4gKiAgLSBBVFggXHU2ODA3XHU5ODk4IGAjIEgxYCB+IGAjIyMjIyMgSDZgXG4gKiAgLSBcdTZCQjVcdTg0M0RcdUZGMDhcdTUzQ0NcdTYzNjJcdTg4NENcdTRGNUNcdTUyMDZcdTk2OTRcdUZGMDlcbiAqICAtIFx1NjVFMFx1NUU4Rlx1NTIxN1x1ODg2OFx1RkYwOGAtYCBgKmAgYCtgXHVGRjA5LyBcdTY3MDlcdTVFOEZcdTUyMTdcdTg4NjhcdUZGMDhgMS5gXHVGRjA5XG4gKiAgLSBcdTVGMTVcdTc1MjhcdTU3NTcgYD4gLi4uYFx1RkYwOFx1OTAxMlx1NUY1Mlx1NkUzMlx1NjdEM1x1NTE4NVx1OTBFOCBtYXJrZG93blx1RkYwOVxuICogIC0gXHU1NkY0XHU2ODBGXHU0RUUzXHU3ODAxXHU1NzU3IGBgYCBsYW5nIC4uLiBgYGBcdUZGMDhcdThCRURcdThBMDBcdTRGRTFcdTYwNkZcdTUzRUFcdTUzRDZcdTk5OTZcdTZCQjVcdUZGMENcdTVGRkRcdTc1NjUgYGlkPVwiLi4uXCJgIFx1N0I0OVx1NTE0M1x1NjU3MFx1NjM2RVx1RkYwOVxuICogIC0gXHU1MjA2XHU1MjcyXHU3RUJGIGAtLS1gIC8gYCoqKmBcbiAqICAtIFx1N0I4MFx1NTM1NVx1N0JBMVx1OTA1M1x1ODg2OFx1NjgzQyBgfCBoIHwgaCB8XFxufCAtIHwgLSB8XFxufCBjIHwgYyB8YFxuICogIC0gXHU4ODRDXHU1MTg1XHVGRjFBYGNvZGVgXHUzMDAxKipib2xkKipcdTMwMDEqaXRhbGljKlx1MzAwMVtsaW5rXSh1cmwpXHUzMDAxYDxjb2RlPmAgXHU1REYyXHU4OEFCXHU4RjZDXHU0RTQ5XG4gKlxuICogXHU2MjQwXHU2NzA5XHU3NTI4XHU2MjM3XHU2NTg3XHU2NzJDXHU4RkRCXHU1MTY1XHU2RTMyXHU2N0QzXHU1NjY4XHU0RTRCXHU1MjREXHU5MEZEXHU0RjFBXHU1MTQ4XHU1MDVBIEhUTUwgXHU4RjZDXHU0RTQ5XHVGRjFCXHU1NzI4XHU4RjZDXHU0RTQ5XHU1NDBFXHU3Njg0XHU2NTg3XHU2NzJDXHU0RTBBXHU1MDVBXHU2QjYzXHU1MjE5XHU2NkZGXHU2MzYyXHVGRjBDXG4gKiBcdTY1RTJcdTkwN0ZcdTUxNEQgWFNTXHVGRjA4d2VidmlldyBcdTUxODVcdTUzNzNcdTRGQkZcdTY3MDkgdnNjb2RlLWFwaSBcdTRFNUZcdTRFMERcdTVFMENcdTY3MUJcdTYyNjdcdTg4NENcdTZDRThcdTUxNjVcdUZGMDlcdUZGMENcdTUzQzhcdTRGRERcdThCQzFcdTRFRTNcdTc4MDFcdTU3NTdcbiAqIFx1NTE4NVx1NzY4NCBgPGAgYD5gIGAmYCBcdTUzOUZcdTY4MzdcdTVDNTVcdTc5M0FcdTMwMDJcbiAqXG4gKiBcdThCRTVcdTZBMjFcdTU3NTdcdTRFMERcdTRGOURcdThENTYgRE9NXHVGRjFCXHU4QzAzXHU3NTI4XHU2NUI5XHU2MkZGXHU1MjMwXHU1QjU3XHU3QjI2XHU0RTMyXHU1NDBFXHU4RDRCXHU1MDNDXHU3RUQ5IGBpbm5lckhUTUxgXHUzMDAyXG4gKi9cblxuLyoqIFx1NjI4QVx1NUI1N1x1N0IyNlx1NEUzMlx1OEY2Q1x1NEU0OVx1NEUzQVx1NUI4OVx1NTE2OFx1NzY4NCBIVE1MIFx1NjU4N1x1NjcyQ1x1ODI4Mlx1NzBCOVx1NTE4NVx1NUJCOVx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xufVxuXG4vKiogXHU2MjhBIG1hcmtkb3duIFx1NUI1N1x1N0IyNlx1NEUzMlx1NkUzMlx1NjdEM1x1NEUzQSBIVE1MIFx1NUI1N1x1N0IyNlx1NEUzMlx1MzAwMiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlck1hcmtkb3duKHNyYzogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghc3JjKSByZXR1cm4gJyc7XG4gIHJldHVybiBibG9ja1JlbmRlcihub3JtYWxpemVOZXdsaW5lcyhzcmMpKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBcdTUxODVcdTkwRThcdTVCOUVcdTczQjBcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBub3JtYWxpemVOZXdsaW5lcyhzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcy5yZXBsYWNlKC9cXHJcXG4/L2csICdcXG4nKTtcbn1cblxuLyoqXG4gKiBcdTU3NTdcdTdFQTdcdTZFMzJcdTY3RDNcdTMwMDJcdTkwMTBcdTg4NENcdTYyNkJcdTYzQ0ZcdUZGMENcdTY4MzlcdTYzNkVcdTg4NENcdTk5OTZcdTcyNzlcdTVGODFcdTUxQjNcdTVCOUFcdTU3NTdcdTdDN0JcdTU3OEJcdUZGMUJcdTZCQjVcdTg0M0RcdTc1MzFcdTdBN0FcdTg4NENcdTUyMDZcdTk2OTRcdTMwMDJcbiAqXG4gKiBcdTVCOUVcdTczQjBcdTYyMTBcdTY3MDlcdTk2NTBcdTcyQjZcdTYwMDFcdTYyNkJcdTYzQ0ZcdUZGMENcdTRGQkZcdTRFOEVcdTU3MjhcdTRFMERcdTVGMTVcdTUxNjUgdG9rZW4gXHU3QzdCXHU3Njg0XHU1MjREXHU2M0QwXHU0RTBCXHU0RkREXHU2MzAxXHU3RUJGXHU2MDI3XHU1OTBEXHU2NzQyXHU1RUE2XHUzMDAyXG4gKi9cbmZ1bmN0aW9uIGJsb2NrUmVuZGVyKHNyYzogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBzcmMuc3BsaXQoJ1xcbicpO1xuICBjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG4gIGxldCBpID0gMDtcbiAgbGV0IHBhcmFncmFwaDogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGxpc3RLaW5kOiAndWwnIHwgJ29sJyB8IG51bGwgPSBudWxsO1xuICBjb25zdCBsaXN0SXRlbXM6IHN0cmluZ1tdID0gW107XG5cbiAgY29uc3QgZmx1c2hQYXJhZ3JhcGggPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKHBhcmFncmFwaC5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBvdXQucHVzaChgPHA+JHtpbmxpbmVSZW5kZXIocGFyYWdyYXBoLmpvaW4oJyAnKSl9PC9wPmApO1xuICAgIHBhcmFncmFwaCA9IFtdO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoTGlzdCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAobGlzdEtpbmQgPT09IG51bGwpIHJldHVybjtcbiAgICBvdXQucHVzaChgPCR7bGlzdEtpbmR9PiR7bGlzdEl0ZW1zLmpvaW4oJycpfTwvJHtsaXN0S2luZH0+YCk7XG4gICAgbGlzdEl0ZW1zLmxlbmd0aCA9IDA7XG4gICAgbGlzdEtpbmQgPSBudWxsO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoQWxsID0gKCk6IHZvaWQgPT4ge1xuICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgZmx1c2hMaXN0KCk7XG4gIH07XG5cbiAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV0gPz8gJyc7XG5cbiAgICAvLyBcdTU2RjRcdTY4MEZcdTRFRTNcdTc4MDFcdTU3NTdcbiAgICBjb25zdCBmZW5jZSA9IC9eYGBgXFxzKihbXlxcc2BdKikvLmV4ZWMobGluZSk7XG4gICAgaWYgKGZlbmNlKSB7XG4gICAgICBmbHVzaEFsbCgpO1xuICAgICAgY29uc3QgbGFuZ1JhdyA9IGZlbmNlWzFdID8/ICcnO1xuICAgICAgLy8gXHU1M0Q2XHU5OTk2XHU0RTJBXHU3QTdBXHU3NjdEXHU1MjREXHU3Njg0XHU5MEU4XHU1MjA2XHU0RjVDXHU0RTNBXHU4QkVEXHU4QTAwXHVGRjBDXHU1RkZEXHU3NTY1IGBpZD1cInowXCJgIFx1N0I0OVx1OTg5RFx1NTkxNlx1NjgwN1x1OEJCMFxuICAgICAgY29uc3QgbGFuZyA9IGxhbmdSYXcuc3BsaXQoL1xccy8pWzBdID8/ICcnO1xuICAgICAgY29uc3QgY29kZUxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaSsrO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgIS9eYGBgXFxzKiQvLnRlc3QobGluZXNbaV0gPz8gJycpKSB7XG4gICAgICAgIGNvZGVMaW5lcy5wdXNoKGxpbmVzW2ldID8/ICcnKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgLy8gXHU4REYzXHU4RkM3XHU3RUQzXHU2NzVGXHU1NkY0XHU2ODBGXHVGRjA4XHU4MkU1XHU2NTg3XHU0RUY2XHU2NzJCXHU1QzNFXHU2NUUwXHU3RUQzXHU2NzVGXHU3QjI2XHU0RTVGXHU1QkI5XHU1RkNEXHVGRjA5XG4gICAgICBpZiAoaSA8IGxpbmVzLmxlbmd0aCkgaSsrO1xuICAgICAgY29uc3QgbGFuZ0NsYXNzID0gbGFuZyA/IGAgY2xhc3M9XCJsYW5nLSR7ZXNjYXBlQXR0cihsYW5nKX1cImAgOiAnJztcbiAgICAgIG91dC5wdXNoKFxuICAgICAgICBgPHByZT48Y29kZSR7bGFuZ0NsYXNzfT4ke2VzY2FwZUh0bWwoY29kZUxpbmVzLmpvaW4oJ1xcbicpKX08L2NvZGU+PC9wcmU+YCxcbiAgICAgICk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBcdTY4MDdcdTk4OThcbiAgICBjb25zdCBoZWFkaW5nID0gL14oI3sxLDZ9KVxccysoLiopJC8uZXhlYyhsaW5lKTtcbiAgICBpZiAoaGVhZGluZykge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGNvbnN0IGxldmVsID0gKGhlYWRpbmdbMV0gPz8gJycpLmxlbmd0aDtcbiAgICAgIG91dC5wdXNoKGA8aCR7bGV2ZWx9PiR7aW5saW5lUmVuZGVyKGhlYWRpbmdbMl0gPz8gJycpfTwvaCR7bGV2ZWx9PmApO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU1MjA2XHU1MjcyXHU3RUJGXG4gICAgaWYgKC9eXFxzKihbLSpfXSlcXDF7Mix9XFxzKiQvLnRlc3QobGluZSkpIHtcbiAgICAgIGZsdXNoQWxsKCk7XG4gICAgICBvdXQucHVzaCgnPGhyLz4nKTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIFx1NUYxNVx1NzUyOFx1NTc1N1x1RkYwOFx1OEZERVx1N0VFRFx1NzY4NCBgPmAgXHU4ODRDXHVGRjA5XG4gICAgaWYgKC9eXFxzKj4vLnRlc3QobGluZSkpIHtcbiAgICAgIGZsdXNoQWxsKCk7XG4gICAgICBjb25zdCBxdW90ZUxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgd2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgL15cXHMqPi8udGVzdChsaW5lc1tpXSA/PyAnJykpIHtcbiAgICAgICAgcXVvdGVMaW5lcy5wdXNoKChsaW5lc1tpXSA/PyAnJykucmVwbGFjZSgvXlxccyo+XFxzPy8sICcnKSk7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgICAgIG91dC5wdXNoKGA8YmxvY2txdW90ZT4ke2Jsb2NrUmVuZGVyKHF1b3RlTGluZXMuam9pbignXFxuJykpfTwvYmxvY2txdW90ZT5gKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIFx1ODg2OFx1NjgzQ1x1RkYxQVx1ODg2OFx1NTkzNFx1ODg0QyArIFx1NTIwNlx1OTY5NFx1ODg0QyArIFx1NEVGQlx1NjEwRlx1NjU3MFx1NjM2RVx1ODg0Q1xuICAgIGlmIChcbiAgICAgIGlzVGFibGVSb3cobGluZSkgJiZcbiAgICAgIGkgKyAxIDwgbGluZXMubGVuZ3RoICYmXG4gICAgICBpc1RhYmxlU2VwYXJhdG9yKGxpbmVzW2kgKyAxXSA/PyAnJylcbiAgICApIHtcbiAgICAgIGZsdXNoQWxsKCk7XG4gICAgICBjb25zdCBoZWFkZXJDZWxscyA9IHBhcnNlVGFibGVSb3cobGluZSk7XG4gICAgICBpICs9IDI7IC8vIFx1OERGM1x1OEZDN1x1ODg2OFx1NTkzNFx1NEUwRVx1NTIwNlx1OTY5NFx1N0IyNlxuICAgICAgY29uc3QgYm9keVJvd3M6IHN0cmluZ1tdW10gPSBbXTtcbiAgICAgIHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGlzVGFibGVSb3cobGluZXNbaV0gPz8gJycpKSB7XG4gICAgICAgIGJvZHlSb3dzLnB1c2gocGFyc2VUYWJsZVJvdyhsaW5lc1tpXSA/PyAnJykpO1xuICAgICAgICBpKys7XG4gICAgICB9XG4gICAgICBsZXQgdGFibGUgPSAnPHRhYmxlPjx0aGVhZD48dHI+JztcbiAgICAgIGZvciAoY29uc3QgYyBvZiBoZWFkZXJDZWxscykgdGFibGUgKz0gYDx0aD4ke2lubGluZVJlbmRlcihjKX08L3RoPmA7XG4gICAgICB0YWJsZSArPSAnPC90cj48L3RoZWFkPjx0Ym9keT4nO1xuICAgICAgZm9yIChjb25zdCByb3cgb2YgYm9keVJvd3MpIHtcbiAgICAgICAgdGFibGUgKz0gJzx0cj4nO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2Ygcm93KSB0YWJsZSArPSBgPHRkPiR7aW5saW5lUmVuZGVyKGMpfTwvdGQ+YDtcbiAgICAgICAgdGFibGUgKz0gJzwvdHI+JztcbiAgICAgIH1cbiAgICAgIHRhYmxlICs9ICc8L3Rib2R5PjwvdGFibGU+JztcbiAgICAgIG91dC5wdXNoKHRhYmxlKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIFx1NjVFMFx1NUU4RiAvIFx1NjcwOVx1NUU4Rlx1NTIxN1x1ODg2OFxuICAgIGNvbnN0IHVsID0gL15cXHMqWy0qK11cXHMrKC4qKSQvLmV4ZWMobGluZSk7XG4gICAgY29uc3Qgb2wgPSAvXlxccypcXGQrXFwuXFxzKyguKikkLy5leGVjKGxpbmUpO1xuICAgIGlmICh1bCB8fCBvbCkge1xuICAgICAgZmx1c2hQYXJhZ3JhcGgoKTtcbiAgICAgIGNvbnN0IGtpbmQ6ICd1bCcgfCAnb2wnID0gdWwgPyAndWwnIDogJ29sJztcbiAgICAgIGlmIChsaXN0S2luZCAhPT0gbnVsbCAmJiBsaXN0S2luZCAhPT0ga2luZCkge1xuICAgICAgICBmbHVzaExpc3QoKTtcbiAgICAgIH1cbiAgICAgIGxpc3RLaW5kID0ga2luZDtcbiAgICAgIGNvbnN0IHRleHQgPSAodWwgPyB1bFsxXSA6IG9sPy5bMV0pID8/ICcnO1xuICAgICAgbGlzdEl0ZW1zLnB1c2goYDxsaT4ke2lubGluZVJlbmRlcih0ZXh0KX08L2xpPmApO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gXHU3QTdBXHU4ODRDXHVGRjFBXHU2QkI1XHU4NDNEXHU1MjA2XHU5Njk0XG4gICAgaWYgKGxpbmUudHJpbSgpID09PSAnJykge1xuICAgICAgZmx1c2hBbGwoKTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIFx1NjY2RVx1OTAxQVx1NkJCNVx1ODQzRFx1ODg0Q1xuICAgIGZsdXNoTGlzdCgpO1xuICAgIHBhcmFncmFwaC5wdXNoKGxpbmUpO1xuICAgIGkrKztcbiAgfVxuXG4gIGZsdXNoQWxsKCk7XG4gIHJldHVybiBvdXQuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGlzVGFibGVSb3cobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAvXlxccypcXHwuKlxcfFxccyokLy50ZXN0KGxpbmUpO1xufVxuXG5mdW5jdGlvbiBpc1RhYmxlU2VwYXJhdG9yKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gL15cXHMqXFx8P1xccyo6Py17Mix9Oj9cXHMqKFxcfFxccyo6Py17Mix9Oj9cXHMqKStcXHw/XFxzKiQvLnRlc3QobGluZSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlVGFibGVSb3cobGluZTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBsZXQgcyA9IGxpbmUudHJpbSgpO1xuICBpZiAocy5zdGFydHNXaXRoKCd8JykpIHMgPSBzLnNsaWNlKDEpO1xuICBpZiAocy5lbmRzV2l0aCgnfCcpKSBzID0gcy5zbGljZSgwLCAtMSk7XG4gIHJldHVybiBzLnNwbGl0KCd8JykubWFwKChjKSA9PiBjLnRyaW0oKSk7XG59XG5cbi8qKiBcdTg4NENcdTUxODVcdTZFMzJcdTY3RDNcdUZGMUFcdTUxNDhcdThGNkNcdTRFNDlcdUZGMENcdTUxOERcdTU5MDRcdTc0MDYgaW5saW5lIGNvZGVcdUZGMDhcdTUzNjBcdTRGNERcdTRGRERcdTYyQTRcdUZGMDlcdUZGMENcdTUxOERcdTU5MDRcdTc0MDZcdTUxNzZcdTRGNTlcdTY4MDdcdThCQjBcdTMwMDIgKi9cbmZ1bmN0aW9uIGlubGluZVJlbmRlcihzOiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgb3V0ID0gZXNjYXBlSHRtbChzKTtcblxuICAvLyAxKSBcdTg4NENcdTUxODVcdTRFRTNcdTc4MDFcdUZGMUFcdTc1MjhcdTUzNjBcdTRGNERcdTdCMjZcdTY2RkZcdTYzNjJcdTRFRTVcdTkwN0ZcdTUxNERcdTg4QUJcdTU0MEVcdTdFRURcdTg5QzRcdTUyMTlcdThCRUZcdTRGMjRcbiAgY29uc3QgY29kZXM6IHN0cmluZ1tdID0gW107XG4gIG91dCA9IG91dC5yZXBsYWNlKC9gKFteYFxcbl0rPylgL2csIChfLCBjb2RlOiBzdHJpbmcpID0+IHtcbiAgICBjb2Rlcy5wdXNoKGA8Y29kZT4ke2NvZGV9PC9jb2RlPmApO1xuICAgIHJldHVybiBgXFx1MDAwMEMke2NvZGVzLmxlbmd0aCAtIDF9XFx1MDAwMGA7XG4gIH0pO1xuXG4gIC8vIDIpIFx1OTRGRVx1NjNBNSBbdGV4dF0odXJsKSBcdTIwMTRcdTIwMTQgXHU0RUM1XHU1MTQxXHU4QkI4IGh0dHAvaHR0cHMvbWFpbHRvIFx1NEUwRVx1NzZGOFx1NUJGOVx1OERFRlx1NUY4NFx1RkYwQ1x1ODlDNFx1OTA3RiBqYXZhc2NyaXB0OlxuICBvdXQgPSBvdXQucmVwbGFjZShcbiAgICAvXFxbKFteXFxdXSspXFxdXFwoKFteKV0rKVxcKS9nLFxuICAgIChfLCB0ZXh0OiBzdHJpbmcsIGhyZWY6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3Qgc2FmZSA9IHNhbml0aXplSHJlZihocmVmKTtcbiAgICAgIHJldHVybiBgPGEgaHJlZj1cIiR7c2FmZX1cIiB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCI+JHt0ZXh0fTwvYT5gO1xuICAgIH0sXG4gICk7XG5cbiAgLy8gMykgXHU1MkEwXHU3Qzk3ICsgXHU2NTlDXHU0RjUzIC8gXHU1MkEwXHU3Qzk3IC8gXHU2NTlDXHU0RjUzXHVGRjA4XHU5ODdBXHU1RThGXHU0RTBEXHU4MEZEXHU5OEEwXHU1MDEyXHVGRjA5XG4gIG91dCA9IG91dC5yZXBsYWNlKC9cXCpcXCpcXCooW14qXSs/KVxcKlxcKlxcKi9nLCAnPHN0cm9uZz48ZW0+JDE8L2VtPjwvc3Ryb25nPicpO1xuICBvdXQgPSBvdXQucmVwbGFjZSgvXFwqXFwqKFteKl0rPylcXCpcXCovZywgJzxzdHJvbmc+JDE8L3N0cm9uZz4nKTtcbiAgLy8gXHU2NTlDXHU0RjUzXHVGRjFBXHU5MDdGXHU1MTREXHU1NDFFXHU2Mzg5XHU2MjEwXHU1QkY5XHU1MkEwXHU3Qzk3XHU3Njg0XHU1MjY5XHU0RjU5IGAqYFx1RkYwQ1x1ODk4MVx1NkM0Mlx1NURFNlx1NTNGM1x1OTc1RSBgKmBcbiAgb3V0ID0gb3V0LnJlcGxhY2UoLyhefFteKl0pXFwqKFteKlxcbl0rPylcXCooPyFcXCopL2csICckMTxlbT4kMjwvZW0+Jyk7XG5cbiAgLy8gNCkgXHU4RkQ4XHU1MzlGIGlubGluZSBjb2RlIFx1NTM2MFx1NEY0RFxuICBvdXQgPSBvdXQucmVwbGFjZSgvXFx1MDAwMEMoXFxkKylcXHUwMDAwL2csIChfLCBpZHg6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IGkgPSBOdW1iZXIoaWR4KTtcbiAgICByZXR1cm4gY29kZXNbaV0gPz8gJyc7XG4gIH0pO1xuXG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplSHJlZihocmVmOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCB0cmltbWVkID0gaHJlZi50cmltKCk7XG4gIGlmICgvXihodHRwcz86fG1haWx0bzp8I3xcXC98XFwuXFwuP1xcLykvaS50ZXN0KHRyaW1tZWQpKSB7XG4gICAgcmV0dXJuIGVzY2FwZUF0dHIodHJpbW1lZCk7XG4gIH1cbiAgLy8gXHU0RTBEXHU4QkM2XHU1MjJCXHU3Njg0XHU1MzRGXHU4QkFFXHVGRjA4XHU1NDJCIGphdmFzY3JpcHQ6XHVGRjA5XHU0RTAwXHU1RjhCXHU5NjREXHU3RUE3XHU0RTNBXHU5NTFBXHU3MEI5XHVGRjBDXHU5MDdGXHU1MTREXHU4MTFBXHU2NzJDXHU2MjY3XHU4ODRDXG4gIHJldHVybiAnIyc7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUF0dHIoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbn1cbiIsICIvKipcbiAqIFdlYnZpZXcgXHU3QUVGXHU1MTY1XHU1M0UzXHVGRjA4UHJhY3RpY2UgXHU5NzYyXHU2NzdGXHVGRjA5XHUzMDAyXG4gKlxuICogXHU1NzI4IHdlYnZpZXcgaWZyYW1lIFx1NTE4NVx1OEZEMFx1ODg0Q1x1RkYwQ1x1OTAxQVx1OEZDNyBgYWNxdWlyZVZzQ29kZUFwaSgpYCBcdTRFMEVcdTYyNjlcdTVDNTVcdThGREJcdTdBMEJcdTkwMUFcdTRGRTFcdTMwMDJcbiAqXG4gKiBVSSBcdTdFRDNcdTY3ODRcdUZGMDhcdTRFMEUgcGFuZWwudHMgXHU1MTg1XHU1RDRDIEhUTUwgXHU1NDBDXHU2QjY1XHVGRjA5XHVGRjFBXG4gKiAgIC0gLnEtaGVhZFx1RkYwOG1ldGEgXHU1RkJEXHU3QUUwICsgXHU2ODA3XHU5ODk4ICsgXHU2NTM2XHU4NUNGXHU2MzA5XHU5NEFFXHVGRjA5XG4gKiAgIC0gI3F1ZXN0aW9uLWNvbnRlbnQubWRcdUZGMDhcdTk4OThcdTk3NjIgbWFya2Rvd24gXHU2RTMyXHU2N0QzXHVGRjA5XG4gKiAgIC0gI3Rlc3QtY2FzZXNcdUZGMDhcdTRFQzVcdTRFRTNcdTc4MDFcdTk4OThcdUZGMDlcbiAqICAgLSAuYW5zd2VyLWFyZWFcdUZGMDhcdTcwQjlcdTUxRkJcIlx1NjdFNVx1NzcwQlx1N0I1NFx1Njg0OFwiXHU1NDBFXHU1ODZCXHU1MTQ1XHU1RTc2XHU2NjNFXHU3OTNBXHVGRjA5XG4gKiAgIC0gLmZvbGxvdy11cHNcdUZGMDhcdTk1RUVcdTdCNTRcdTk4OThcdThGRkRcdTk1RUVcdUZGMDlcbiAqICAgLSAuYWN0aW9uLWJhclx1RkYwOFx1NEUzQlx1NjMwOVx1OTRBRSArIE1hc3RlcnkgKyBcdTdCMTRcdThCQjBcdTk0RkVcdTYzQTVcdUZGMDlcbiAqXG4gKiBcdTZFMzJcdTY3RDNcdTdCNTZcdTc1NjVcdUZGMUFcdTk4OThcdTk3NjIgLyBcdThCRTZcdTdFQzZcdTg5RTNcdTY3OTAgLyBcdTdCODBcdTdCNTQgLyBcdThGRkRcdTk1RUVcdTdCNTRcdTY4NDhcdTU3NDdcdThENzAgYHJlbmRlck1hcmtkb3duYFx1RkYwQ1xuICogXHU1MTc2XHU0RjU5XHU3N0VEXHU1QjU3XHU3QjI2XHU0RTMyXHU1QjU3XHU2QkI1XHU4RDcwIGBlc2NhcGVIdG1sYFx1MzAwMlxuICovXG5cbmltcG9ydCB7IGVzY2FwZUh0bWwsIHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi9tYXJrZG93bi5qcyc7XG5cbmRlY2xhcmUgZnVuY3Rpb24gYWNxdWlyZVZzQ29kZUFwaSgpOiB7XG4gIHBvc3RNZXNzYWdlKG1zZzogdW5rbm93bik6IHZvaWQ7XG4gIGdldFN0YXRlKCk6IHVua25vd247XG4gIHNldFN0YXRlKHN0YXRlOiB1bmtub3duKTogdm9pZDtcbn07XG5cbmludGVyZmFjZSBIb3N0VG9XZWJ2aWV3TWVzc2FnZSB7XG4gIHR5cGU6IHN0cmluZztcbiAgcGF5bG9hZD86IHVua25vd247XG4gIG9rPzogYm9vbGVhbjtcbiAgcmVhc29uPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgTGVhcm5pbmdTdGF0ZSB7XG4gIG1hc3Rlcnk6ICd1bmxlYXJuZWQnIHwgJ2xlYXJuaW5nJyB8ICdtYXN0ZXJlZCcgfCAnbm90X21hc3RlcmVkJztcbiAgZmF2b3JpdGVGbGFnOiBib29sZWFuO1xuICB3cm9uZ0ZsYWc6IGJvb2xlYW47XG4gIGhhc05vdGU6IGJvb2xlYW47XG4gIGxhc3RQcmFjdGljZWRBdD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFF1ZXN0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgdHlwZTogJ2NvZGUnIHwgJ3FhJztcbiAgdGl0bGU6IHN0cmluZztcbiAgY29udGVudDogc3RyaW5nO1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICB0YWdzOiBzdHJpbmdbXTtcbiAgZGlmZmljdWx0eTogJ2Vhc3knIHwgJ21lZGl1bScgfCAnaGFyZCcgfCBzdHJpbmc7XG4gIGxhbmd1YWdlPzogc3RyaW5nO1xuICBhbnN3ZXI6IHN0cmluZztcbiAgdGVzdENhc2VzPzogQXJyYXk8e1xuICAgIG5hbWU/OiBzdHJpbmc7XG4gICAgaW5wdXQ/OiBzdHJpbmc7XG4gICAgZXhwZWN0ZWQ/OiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG4gIH0+O1xuICBmb2xsb3dVcHM/OiBBcnJheTx7IHF1ZXN0aW9uOiBzdHJpbmc7IGFuc3dlcj86IHN0cmluZyB9Pjtcbn1cblxuY29uc3QgdnNjb2RlID0gYWNxdWlyZVZzQ29kZUFwaSgpO1xuXG5sZXQgY3VycmVudFF1ZXN0aW9uOiBRdWVzdGlvbiB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gJChpZDogc3RyaW5nKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbn1cblxuZnVuY3Rpb24gZGlmZmljdWx0eUxhYmVsKGQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoZCkge1xuICAgIGNhc2UgJ2Vhc3knOlxuICAgICAgcmV0dXJuICdcdTdCODBcdTUzNTUnO1xuICAgIGNhc2UgJ21lZGl1bSc6XG4gICAgICByZXR1cm4gJ1x1NEUyRFx1N0I0OSc7XG4gICAgY2FzZSAnaGFyZCc6XG4gICAgICByZXR1cm4gJ1x1NTZGMFx1OTZCRSc7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBkO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRpZmZpY3VsdHlDbGFzcyhkOiBzdHJpbmcpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGQpIHtcbiAgICBjYXNlICdlYXN5JzpcbiAgICAgIHJldHVybiAnZGlmZi1lYXN5JztcbiAgICBjYXNlICdtZWRpdW0nOlxuICAgICAgcmV0dXJuICdkaWZmLW1lZGl1bSc7XG4gICAgY2FzZSAnaGFyZCc6XG4gICAgICByZXR1cm4gJ2RpZmYtaGFyZCc7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJRdWVzdGlvbihxdWVzdGlvbjogUXVlc3Rpb24pOiB2b2lkIHtcbiAgY3VycmVudFF1ZXN0aW9uID0gcXVlc3Rpb247XG5cbiAgY29uc3QgdGl0bGVFbCA9ICQoJ3F1ZXN0aW9uLXRpdGxlJyk7XG4gIGlmICh0aXRsZUVsKSB0aXRsZUVsLnRleHRDb250ZW50ID0gcXVlc3Rpb24udGl0bGU7XG5cbiAgLy8gbWV0YSBcdTVGQkRcdTdBRTAgLyBcdTY4MDdcdTdCN0VcbiAgY29uc3QgbWV0YUVsID0gJCgncXVlc3Rpb24tbWV0YScpO1xuICBpZiAobWV0YUVsKSB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgcGFydHMucHVzaChcbiAgICAgIGA8c3BhbiBjbGFzcz1cInBpbGwgJHtxdWVzdGlvbi50eXBlID09PSAnY29kZScgPyAndHlwZS1jb2RlJyA6ICd0eXBlLXFhJ31cIj4ke1xuICAgICAgICBxdWVzdGlvbi50eXBlID09PSAnY29kZScgPyAnXHU0RUUzXHU3ODAxXHU5ODk4JyA6ICdcdTk1RUVcdTdCNTRcdTk4OTgnXG4gICAgICB9PC9zcGFuPmAsXG4gICAgKTtcbiAgICBwYXJ0cy5wdXNoKFxuICAgICAgYDxzcGFuIGNsYXNzPVwicGlsbCAke2RpZmZpY3VsdHlDbGFzcyhxdWVzdGlvbi5kaWZmaWN1bHR5KX1cIj4ke2VzY2FwZUh0bWwoXG4gICAgICAgIGRpZmZpY3VsdHlMYWJlbChxdWVzdGlvbi5kaWZmaWN1bHR5KSxcbiAgICAgICl9PC9zcGFuPmAsXG4gICAgKTtcbiAgICBpZiAocXVlc3Rpb24uY2F0ZWdvcnkpIHtcbiAgICAgIHBhcnRzLnB1c2goXG4gICAgICAgIGA8c3BhbiBjbGFzcz1cInBpbGwgY2F0ZWdvcnlcIj4ke2VzY2FwZUh0bWwocXVlc3Rpb24uY2F0ZWdvcnkpfTwvc3Bhbj5gLFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocXVlc3Rpb24udGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgdCBvZiBxdWVzdGlvbi50YWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdCA9PT0gJ3N0cmluZycgJiYgdC5sZW5ndGggPiAwICYmIHQgIT09IHF1ZXN0aW9uLmNhdGVnb3J5KSB7XG4gICAgICAgICAgcGFydHMucHVzaChgPHNwYW4gY2xhc3M9XCJ0YWdcIj4ke2VzY2FwZUh0bWwodCl9PC9zcGFuPmApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChxdWVzdGlvbi50eXBlID09PSAnY29kZScgJiYgcXVlc3Rpb24ubGFuZ3VhZ2UpIHtcbiAgICAgIHBhcnRzLnB1c2goYDxzcGFuIGNsYXNzPVwidGFnXCI+JHtlc2NhcGVIdG1sKHF1ZXN0aW9uLmxhbmd1YWdlKX08L3NwYW4+YCk7XG4gICAgfVxuICAgIG1ldGFFbC5pbm5lckhUTUwgPSBwYXJ0cy5qb2luKCcnKTtcbiAgfVxuXG4gIC8vIFx1OTg5OFx1OTc2Mlx1RkYxQW1hcmtkb3duIFx1NkUzMlx1NjdEM1xuICBjb25zdCBjb250ZW50RWwgPSAkKCdxdWVzdGlvbi1jb250ZW50Jyk7XG4gIGlmIChjb250ZW50RWwpIGNvbnRlbnRFbC5pbm5lckhUTUwgPSByZW5kZXJNYXJrZG93bihxdWVzdGlvbi5jb250ZW50KTtcblxuICAvLyBcdTZENEJcdThCRDVcdTc1MjhcdTRGOEJcbiAgY29uc3QgdGVzdENhc2VzRWwgPSAkKCd0ZXN0LWNhc2VzJyk7XG4gIGlmICh0ZXN0Q2FzZXNFbCkge1xuICAgIGlmIChcbiAgICAgIHF1ZXN0aW9uLnR5cGUgPT09ICdjb2RlJyAmJlxuICAgICAgQXJyYXkuaXNBcnJheShxdWVzdGlvbi50ZXN0Q2FzZXMpICYmXG4gICAgICBxdWVzdGlvbi50ZXN0Q2FzZXMubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgbGV0IGh0bWwgPSAnPGgyPlx1NkQ0Qlx1OEJENVx1NzUyOFx1NEY4QjwvaDI+JztcbiAgICAgIGZvciAoY29uc3QgdGMgb2YgcXVlc3Rpb24udGVzdENhc2VzKSB7XG4gICAgICAgIGh0bWwgKz0gJzxkaXYgY2xhc3M9XCJ0ZXN0LWNhc2VcIj4nO1xuICAgICAgICBpZiAodGMubmFtZSkge1xuICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJ0ZXN0LWNhc2UtbmFtZVwiPiR7ZXNjYXBlSHRtbCh0Yy5uYW1lKX08L2Rpdj5gO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0Yy5pbnB1dCkge1xuICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJ0ZXN0LWNhc2Utcm93XCI+PHNwYW4gY2xhc3M9XCJ0ZXN0LWNhc2UtbGFiZWxcIj5cdThGOTNcdTUxNjU8L3NwYW4+PGNvZGU+JHtlc2NhcGVIdG1sKHRjLmlucHV0KX08L2NvZGU+PC9kaXY+YDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGMuZXhwZWN0ZWQpIHtcbiAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwidGVzdC1jYXNlLXJvd1wiPjxzcGFuIGNsYXNzPVwidGVzdC1jYXNlLWxhYmVsXCI+XHU5ODg0XHU2NzFGPC9zcGFuPjxjb2RlPiR7ZXNjYXBlSHRtbCh0Yy5leHBlY3RlZCl9PC9jb2RlPjwvZGl2PmA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRjLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInRlc3QtY2FzZS1yb3dcIj48c3BhbiBjbGFzcz1cInRlc3QtY2FzZS1sYWJlbFwiPlx1OEJGNFx1NjYwRTwvc3Bhbj48c3Bhbj4ke2VzY2FwZUh0bWwodGMuZGVzY3JpcHRpb24pfTwvc3Bhbj48L2Rpdj5gO1xuICAgICAgICB9XG4gICAgICAgIGh0bWwgKz0gJzwvZGl2Pic7XG4gICAgICB9XG4gICAgICB0ZXN0Q2FzZXNFbC5pbm5lckhUTUwgPSBodG1sO1xuICAgIH0gZWxzZSB7XG4gICAgICB0ZXN0Q2FzZXNFbC5pbm5lckhUTUwgPSAnJztcbiAgICB9XG4gIH1cblxuICAvLyBcdTkxQ0RcdTdGNkVcdTdCNTRcdTY4NDhcdTUzM0FcdTRFMEVcdThGRkRcdTk1RUVcdTUzM0FcdUZGMENcdTkwN0ZcdTUxNERcdTUyMDdcdTk4OThcdTY1RjZcdTZCOEJcdTc1NTlcdTRFMEFcdTRFMDBcdTk4OThcdTcyQjZcdTYwMDFcbiAgY29uc3QgYW5zd2VyRWwgPSAkKCdhbnN3ZXItYXJlYScpO1xuICBpZiAoYW5zd2VyRWwpIHtcbiAgICBhbnN3ZXJFbC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICBhbnN3ZXJFbC5pbm5lckhUTUwgPSAnJztcbiAgfVxuICBjb25zdCBmb2xsb3dVcHNFbCA9ICQoJ2ZvbGxvdy11cHMnKTtcbiAgaWYgKGZvbGxvd1Vwc0VsKSBmb2xsb3dVcHNFbC5pbm5lckhUTUwgPSAnJztcbiAgY29uc3Qgc2hvd0J0biA9ICQoJ2J0bi1zaG93LWFuc3dlcicpO1xuICBpZiAoc2hvd0J0bikgc2hvd0J0bi5yZW1vdmVBdHRyaWJ1dGUoJ2hpZGRlbicpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVMZWFybmluZ1VJKGxlYXJuaW5nOiBMZWFybmluZ1N0YXRlKTogdm9pZCB7XG4gIC8vIFx1NjUzNlx1ODVDRlx1NjMwOVx1OTRBRVxuICBjb25zdCBmYXZCdG4gPSAkKCdidG4tZmF2b3JpdGUnKTtcbiAgaWYgKGZhdkJ0bikge1xuICAgIGZhdkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBsZWFybmluZy5mYXZvcml0ZUZsYWcpO1xuICAgIGZhdkJ0bi5zZXRBdHRyaWJ1dGUoXG4gICAgICAnYXJpYS1sYWJlbCcsXG4gICAgICBsZWFybmluZy5mYXZvcml0ZUZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU2NTM2XHU4NUNGJyA6ICdcdTY1MzZcdTg1Q0YnLFxuICAgICk7XG4gICAgZmF2QnRuLnNldEF0dHJpYnV0ZSgndGl0bGUnLCBsZWFybmluZy5mYXZvcml0ZUZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU2NTM2XHU4NUNGJyA6ICdcdTY1MzZcdTg1Q0YnKTtcbiAgfVxuXG4gIC8vIE1hc3RlcnkgNCBcdTZCQjVcdTVGMEZcbiAgY29uc3QgbWFzdGVyeVZhbHVlcyA9IFsndW5sZWFybmVkJywgJ2xlYXJuaW5nJywgJ21hc3RlcmVkJywgJ25vdF9tYXN0ZXJlZCddO1xuICBmb3IgKGNvbnN0IG0gb2YgbWFzdGVyeVZhbHVlcykge1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICBgW2RhdGEtbWFzdGVyeT1cIiR7bX1cIl1gLFxuICAgICkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghYnRuKSBjb250aW51ZTtcbiAgICBidG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgbSA9PT0gbGVhcm5pbmcubWFzdGVyeSk7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEFuc3dlclBheWxvYWQge1xuICBxdWVzdGlvblR5cGU6ICdjb2RlJyB8ICdxYSc7XG4gIGFuc3dlcjpcbiAgICB8IHsga2luZDogJ3JlZmVyZW5jZSc7IGNvZGU/OiBzdHJpbmc7IGJyaWVmQW5zd2VyPzogc3RyaW5nOyBkZXRhaWxlZEFuc3dlcj86IHN0cmluZzsgZm9sbG93VXBzPzogQXJyYXk8eyBxdWVzdGlvbjogc3RyaW5nOyBhbnN3ZXI/OiBzdHJpbmcgfT4gfVxuICAgIHwgeyBraW5kOiAnbm9uZSc7IGhpbnQ6IHN0cmluZyB9O1xufVxuXG5mdW5jdGlvbiBzaG93QW5zd2VyKHBheWxvYWQ6IEFuc3dlclBheWxvYWQpOiB2b2lkIHtcbiAgY29uc3QgYXJlYSA9ICQoJ2Fuc3dlci1hcmVhJyk7XG4gIGlmICghYXJlYSkgcmV0dXJuO1xuICBhcmVhLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXG4gIGNvbnN0IGFucyA9IHBheWxvYWQuYW5zd2VyO1xuICBpZiAoYW5zLmtpbmQgPT09ICdub25lJykge1xuICAgIGFyZWEuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiYW5zd2VyLWxhYmVsXCI+XHU1M0MyXHU4MDAzXHU3QjU0XHU2ODQ4PC9zcGFuPjxwPiR7ZXNjYXBlSHRtbChcbiAgICAgIGFucy5oaW50ID8/ICdcdThCRTVcdTk4OThcdTY2ODJcdTY1RTBcdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDgnLFxuICAgICl9PC9wPmA7XG4gICAgY29uc3QgYnRuID0gJCgnYnRuLXNob3ctYW5zd2VyJyk7XG4gICAgaWYgKGJ0bikgYnRuLnNldEF0dHJpYnV0ZSgnaGlkZGVuJywgJycpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBodG1sID0gJzxzcGFuIGNsYXNzPVwiYW5zd2VyLWxhYmVsXCI+XHU1M0MyXHU4MDAzXHU3QjU0XHU2ODQ4PC9zcGFuPic7XG5cbiAgaWYgKHBheWxvYWQucXVlc3Rpb25UeXBlID09PSAnY29kZScpIHtcbiAgICBjb25zdCBsYW5nID1cbiAgICAgIGN1cnJlbnRRdWVzdGlvbiAmJiBjdXJyZW50UXVlc3Rpb24udHlwZSA9PT0gJ2NvZGUnXG4gICAgICAgID8gY3VycmVudFF1ZXN0aW9uLmxhbmd1YWdlID8/ICcnXG4gICAgICAgIDogJyc7XG4gICAgY29uc3QgbGFuZ0NsYXNzID0gbGFuZyA/IGAgY2xhc3M9XCJsYW5nLSR7ZXNjYXBlSHRtbChsYW5nKX1cImAgOiAnJztcbiAgICBodG1sICs9IGA8cHJlPjxjb2RlJHtsYW5nQ2xhc3N9PiR7ZXNjYXBlSHRtbChhbnMuY29kZSA/PyAnJyl9PC9jb2RlPjwvcHJlPmA7XG4gIH0gZWxzZSB7XG4gICAgaWYgKGFucy5icmllZkFuc3dlcikge1xuICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cImJyaWVmIG1kXCI+JHtyZW5kZXJNYXJrZG93bihhbnMuYnJpZWZBbnN3ZXIpfTwvZGl2PmA7XG4gICAgfVxuICAgIGlmIChhbnMuZGV0YWlsZWRBbnN3ZXIpIHtcbiAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJkZXRhaWxlZCBtZFwiPjxoMz5cdThCRTZcdTdFQzZcdTg5RTNcdTY3OTA8L2gzPiR7cmVuZGVyTWFya2Rvd24oYW5zLmRldGFpbGVkQW5zd2VyKX08L2Rpdj5gO1xuICAgIH1cbiAgfVxuXG4gIGFyZWEuaW5uZXJIVE1MID0gaHRtbDtcblxuICAvLyBcdThGRkRcdTk1RUVcdUZGMDhcdTRFQzUgUUEgXHU5ODk4XHVGRjA5XG4gIGNvbnN0IGZvbGxvd1Vwc0VsID0gJCgnZm9sbG93LXVwcycpO1xuICBpZiAoXG4gICAgZm9sbG93VXBzRWwgJiZcbiAgICBwYXlsb2FkLnF1ZXN0aW9uVHlwZSA9PT0gJ3FhJyAmJlxuICAgIEFycmF5LmlzQXJyYXkoYW5zLmZvbGxvd1VwcykgJiZcbiAgICBhbnMuZm9sbG93VXBzLmxlbmd0aCA+IDBcbiAgKSB7XG4gICAgbGV0IGZ1SHRtbCA9ICc8aDIgY2xhc3M9XCJmb2xsb3d1cHMtdGl0bGVcIj5cdThGRkRcdTk1RUU8L2gyPic7XG4gICAgZm9yIChjb25zdCBmdSBvZiBhbnMuZm9sbG93VXBzKSB7XG4gICAgICBmdUh0bWwgKz0gJzxkaXYgY2xhc3M9XCJmb2xsb3ctdXBcIj4nO1xuICAgICAgZnVIdG1sICs9IGA8ZGl2IGNsYXNzPVwiZm9sbG93LXVwLXFcIj4ke2VzY2FwZUh0bWwoZnUucXVlc3Rpb24pfTwvZGl2PmA7XG4gICAgICBpZiAoZnUuYW5zd2VyKSB7XG4gICAgICAgIGZ1SHRtbCArPSBgPGRpdiBjbGFzcz1cImZvbGxvdy11cC1hIG1kXCI+JHtyZW5kZXJNYXJrZG93bihmdS5hbnN3ZXIpfTwvZGl2PmA7XG4gICAgICB9XG4gICAgICBmdUh0bWwgKz0gJzwvZGl2Pic7XG4gICAgfVxuICAgIGZvbGxvd1Vwc0VsLmlubmVySFRNTCA9IGZ1SHRtbDtcbiAgfSBlbHNlIGlmIChmb2xsb3dVcHNFbCkge1xuICAgIGZvbGxvd1Vwc0VsLmlubmVySFRNTCA9ICcnO1xuICB9XG5cbiAgY29uc3QgYnRuID0gJCgnYnRuLXNob3ctYW5zd2VyJyk7XG4gIGlmIChidG4pIGJ0bi5zZXRBdHRyaWJ1dGUoJ2hpZGRlbicsICcnKTtcbn1cblxubGV0IHN0YXR1c1RpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gc2hvd1N0YXR1cyhtc2c6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBlbCA9ICQoJ3N0YXR1cy1tZXNzYWdlJyk7XG4gIGlmICghZWwpIHJldHVybjtcbiAgZWwudGV4dENvbnRlbnQgPSBtc2c7XG4gIGVsLmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTtcbiAgaWYgKHN0YXR1c1RpbWVyICE9PSB1bmRlZmluZWQpIGNsZWFyVGltZW91dChzdGF0dXNUaW1lcik7XG4gIHN0YXR1c1RpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpO1xuICB9LCAyNDAwKTtcbn1cblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgJCgnYnRuLXNob3ctYW5zd2VyJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdyZXF1ZXN0QW5zd2VyJyB9KTtcbiAgfSk7XG5cbiAgJCgnYnRuLWZhdm9yaXRlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICd0b2dnbGVGYXZvcml0ZScgfSk7XG4gIH0pO1xuXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLW1hc3RlcnldJykuZm9yRWFjaCgoYnRuKSA9PiB7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSAoYnRuIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydtYXN0ZXJ5J107XG4gICAgICBpZiAodmFsdWUpIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdzZXRNYXN0ZXJ5JywgdmFsdWUgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gICQoJ2xpbmstb3Blbi1ub3RlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ29wZW5OYXRpdmVFZGl0b3InLCB0YXJnZXQ6ICdub3RlJyB9KTtcbiAgfSk7XG5cbiAgJCgnbGluay1ub3RlLXByZXZpZXcnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAncmVxdWVzdE5vdGVQcmV2aWV3JyB9KTtcbiAgfSk7XG5cbiAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3JlYWR5JyB9KTtcbn0pO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xuICBjb25zdCBtc2cgPSBldmVudC5kYXRhIGFzIEhvc3RUb1dlYnZpZXdNZXNzYWdlO1xuICBzd2l0Y2ggKG1zZy50eXBlKSB7XG4gICAgY2FzZSAnaW5pdCc6IHtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBtc2cucGF5bG9hZCBhcyB7IHF1ZXN0aW9uOiBRdWVzdGlvbjsgbGVhcm5pbmc6IExlYXJuaW5nU3RhdGUgfTtcbiAgICAgIHJlbmRlclF1ZXN0aW9uKHBheWxvYWQucXVlc3Rpb24pO1xuICAgICAgdXBkYXRlTGVhcm5pbmdVSShwYXlsb2FkLmxlYXJuaW5nKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICdzaG93QW5zd2VyJzoge1xuICAgICAgc2hvd0Fuc3dlcihtc2cucGF5bG9hZCBhcyBBbnN3ZXJQYXlsb2FkKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICdyb2xsYmFjayc6XG4gICAgY2FzZSAncmVmcmVzaExlYXJuaW5nJzoge1xuICAgICAgY29uc3QgbGVhcm5pbmcgPSBtc2cucGF5bG9hZCBhcyBMZWFybmluZ1N0YXRlO1xuICAgICAgaWYgKGxlYXJuaW5nKSB1cGRhdGVMZWFybmluZ1VJKGxlYXJuaW5nKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICdtYXN0ZXJ5QWNrJzoge1xuICAgICAgaWYgKCFtc2cub2spIHNob3dTdGF0dXMoYFx1NjM4Q1x1NjNFMVx1NzJCNlx1NjAwMVx1NjZGNFx1NjVCMFx1NTkzMVx1OEQyNTogJHttc2cucmVhc29uID8/ICdcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUYnfWApO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ2Zhdm9yaXRlQWNrJzoge1xuICAgICAgaWYgKCFtc2cub2spIHNob3dTdGF0dXMoYFx1NjUzNlx1ODVDRlx1NjRDRFx1NEY1Q1x1NTkzMVx1OEQyNTogJHttc2cucmVhc29uID8/ICdcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUYnfWApO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQTRCTyxXQUFTLFdBQVcsR0FBbUI7QUFDNUMsV0FBTyxFQUNKLFFBQVEsTUFBTSxPQUFPLEVBQ3JCLFFBQVEsTUFBTSxNQUFNLEVBQ3BCLFFBQVEsTUFBTSxNQUFNLEVBQ3BCLFFBQVEsTUFBTSxRQUFRLEVBQ3RCLFFBQVEsTUFBTSxPQUFPO0FBQUEsRUFDMUI7QUFHTyxXQUFTLGVBQWUsS0FBd0M7QUFDckUsUUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixXQUFPLFlBQVksa0JBQWtCLEdBQUcsQ0FBQztBQUFBLEVBQzNDO0FBTUEsV0FBUyxrQkFBa0IsR0FBbUI7QUFDNUMsV0FBTyxFQUFFLFFBQVEsVUFBVSxJQUFJO0FBQUEsRUFDakM7QUFPQSxXQUFTLFlBQVksS0FBcUI7QUFDeEMsVUFBTSxRQUFRLElBQUksTUFBTSxJQUFJO0FBQzVCLFVBQU0sTUFBZ0IsQ0FBQztBQUN2QixRQUFJLElBQUk7QUFDUixRQUFJLFlBQXNCLENBQUM7QUFDM0IsUUFBSSxXQUErQjtBQUNuQyxVQUFNLFlBQXNCLENBQUM7QUFFN0IsVUFBTSxpQkFBaUIsTUFBWTtBQUNqQyxVQUFJLFVBQVUsV0FBVyxFQUFHO0FBQzVCLFVBQUksS0FBSyxNQUFNLGFBQWEsVUFBVSxLQUFLLEdBQUcsQ0FBQyxDQUFDLE1BQU07QUFDdEQsa0JBQVksQ0FBQztBQUFBLElBQ2Y7QUFFQSxVQUFNLFlBQVksTUFBWTtBQUM1QixVQUFJLGFBQWEsS0FBTTtBQUN2QixVQUFJLEtBQUssSUFBSSxRQUFRLElBQUksVUFBVSxLQUFLLEVBQUUsQ0FB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QUFDO0FBQUEsSUFDL0MsQ0FBQztBQUVELGFBQVMsaUJBQWlCLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxRQUFRO0FBQzNELFVBQUksaUJBQWlCLFNBQVMsTUFBTTtBQUNsQyxjQUFNLFFBQVMsSUFBb0IsUUFBUSxTQUFTO0FBQ3BELFlBQUksTUFBTyxRQUFPLFlBQVksRUFBRSxNQUFNLGNBQWMsTUFBTSxDQUFDO0FBQUEsTUFDN0QsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUVELE1BQUUsZ0JBQWdCLEdBQUcsaUJBQWlCLFNBQVMsQ0FBQyxNQUFNO0FBQ3BELFFBQUUsZUFBZTtBQUNqQixhQUFPLFlBQVksRUFBRSxNQUFNLG9CQUFvQixRQUFRLE9BQU8sQ0FBQztBQUFBLElBQ2pFLENBQUM7QUFFRCxNQUFFLG1CQUFtQixHQUFHLGlCQUFpQixTQUFTLENBQUMsTUFBTTtBQUN2RCxRQUFFLGVBQWU7QUFDakIsYUFBTyxZQUFZLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUFBLElBQ25ELENBQUM7QUFFRCxXQUFPLFlBQVksRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFFRCxTQUFPLGlCQUFpQixXQUFXLENBQUMsVUFBVTtBQUM1QyxVQUFNLE1BQU0sTUFBTTtBQUNsQixZQUFRLElBQUksTUFBTTtBQUFBLE1BQ2hCLEtBQUssUUFBUTtBQUNYLGNBQU0sVUFBVSxJQUFJO0FBQ3BCLHVCQUFlLFFBQVEsUUFBUTtBQUMvQix5QkFBaUIsUUFBUSxRQUFRO0FBQ2pDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsS0FBSyxjQUFjO0FBQ2pCLG1CQUFXLElBQUksT0FBd0I7QUFDdkM7QUFBQSxNQUNGO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTCxLQUFLLG1CQUFtQjtBQUN0QixjQUFNLFdBQVcsSUFBSTtBQUNyQixZQUFJLFNBQVUsa0JBQWlCLFFBQVE7QUFDdkM7QUFBQSxNQUNGO0FBQUEsTUFDQSxLQUFLLGNBQWM7QUFDakIsWUFBSSxDQUFDLElBQUksR0FBSSxZQUFXLHFEQUFhLElBQUksVUFBVSwwQkFBTSxFQUFFO0FBQzNEO0FBQUEsTUFDRjtBQUFBLE1BQ0EsS0FBSyxlQUFlO0FBQ2xCLFlBQUksQ0FBQyxJQUFJLEdBQUksWUFBVyx5Q0FBVyxJQUFJLFVBQVUsMEJBQU0sRUFBRTtBQUN6RDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJidG4iXQp9Cg==
