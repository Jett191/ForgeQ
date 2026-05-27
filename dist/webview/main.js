"use strict";
(() => {
  // src/practice/webview/main.ts
  var vscode = acquireVsCodeApi();
  var currentLearning;
  function $(id) {
    return document.getElementById(id);
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function renderQuestion(question) {
    const title = $("question-title");
    if (title) title.textContent = question.title;
    const typeEl = $("question-type");
    if (typeEl) typeEl.textContent = question.type === "code" ? "\u4EE3\u7801" : "\u95EE\u7B54";
    const diffEl = $("question-difficulty");
    if (diffEl) diffEl.textContent = question.difficulty;
    const catEl = $("question-category");
    if (catEl) catEl.textContent = question.category;
    const contentEl = $("question-content");
    if (contentEl) contentEl.textContent = question.content;
    const testCasesEl = $("test-cases");
    if (testCasesEl && question.type === "code" && question.testCases && question.testCases.length > 0) {
      let html = "<h2>\u6D4B\u8BD5\u7528\u4F8B</h2>";
      for (const tc of question.testCases) {
        html += '<div class="test-case">';
        if (tc.name) html += `<div class="test-case-name">${escapeHtml(tc.name)}</div>`;
        if (tc.input) html += `<div><strong>\u8F93\u5165:</strong> <code>${escapeHtml(tc.input)}</code></div>`;
        if (tc.expected) html += `<div><strong>\u9884\u671F:</strong> <code>${escapeHtml(tc.expected)}</code></div>`;
        if (tc.description) html += `<div>${escapeHtml(tc.description)}</div>`;
        html += "</div>";
      }
      testCasesEl.innerHTML = html;
    }
  }
  function updateLearningUI(learning) {
    currentLearning = learning;
    const favBtn = $("btn-favorite");
    if (favBtn) {
      favBtn.textContent = learning.favoriteFlag ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF";
      if (learning.favoriteFlag) {
        favBtn.classList.add("active");
      } else {
        favBtn.classList.remove("active");
      }
    }
    const masteryValues = ["unlearned", "learning", "mastered", "not_mastered"];
    for (const m of masteryValues) {
      const btn = document.querySelector(`[data-mastery="${m}"]`);
      if (btn) {
        if (m === learning.mastery) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    }
  }
  function showAnswer(payload) {
    const area = $("answer-area");
    if (!area) return;
    area.classList.remove("hidden");
    const answer = payload.answer;
    if (answer.kind === "none") {
      area.innerHTML = `<p class="status-message">${escapeHtml(answer.hint ?? "\u8BE5\u9898\u6682\u65E0\u53C2\u8003\u7B54\u6848")}</p>`;
      return;
    }
    if (payload.questionType === "code") {
      area.innerHTML = `<h2>\u53C2\u8003\u7B54\u6848</h2><pre><code>${escapeHtml(answer.code ?? "")}</code></pre>`;
    } else {
      let html = `<h2>\u53C2\u8003\u7B54\u6848</h2><p>${escapeHtml(answer.briefAnswer ?? "")}</p>`;
      if (answer.detailedAnswer) {
        html += `<h3>\u8BE6\u7EC6\u89E3\u6790</h3><div class="content-area">${escapeHtml(answer.detailedAnswer)}</div>`;
      }
      area.innerHTML = html;
      const followUpsEl = $("follow-ups");
      if (followUpsEl && answer.followUps && answer.followUps.length > 0) {
        let fuHtml = "<h2>\u8FFD\u95EE</h2>";
        for (const fu of answer.followUps) {
          fuHtml += '<div class="follow-up">';
          fuHtml += `<div class="follow-up-question">${escapeHtml(fu.question)}</div>`;
          if (fu.answer) fuHtml += `<div>${escapeHtml(fu.answer)}</div>`;
          fuHtml += "</div>";
        }
        followUpsEl.innerHTML = fuHtml;
      }
    }
    const btn = $("btn-show-answer");
    if (btn) btn.style.display = "none";
  }
  function showStatus(msg) {
    const el = $("status-message");
    if (el) {
      el.textContent = msg;
      setTimeout(() => {
        el.textContent = "";
      }, 3e3);
    }
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
        if (value) {
          vscode.postMessage({ type: "setMastery", value });
        }
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
        if (!msg.ok) {
          showStatus(`\u638C\u63E1\u72B6\u6001\u66F4\u65B0\u5931\u8D25: ${msg.reason ?? "\u672A\u77E5\u9519\u8BEF"}`);
        }
        break;
      }
      case "favoriteAck": {
        if (!msg.ok) {
          showStatus(`\u6536\u85CF\u64CD\u4F5C\u5931\u8D25: ${msg.reason ?? "\u672A\u77E5\u9519\u8BEF"}`);
        }
        break;
      }
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3ByYWN0aWNlL3dlYnZpZXcvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBXZWJ2aWV3IFx1N0FFRlx1ODExQVx1NjcyQ1x1RkYwOFRhc2sgMTlcdUZGMDlcdTMwMDJcbiAqXG4gKiBcdTU3MjggV2VidmlldyBpZnJhbWUgXHU1MTg1XHU4RkQwXHU4ODRDXHVGRjBDXHU5MDFBXHU4RkM3IGBhY3F1aXJlVnNDb2RlQXBpKClgIFx1NEUwRSBFeHRlbnNpb24gSG9zdCBcdTkwMUFcdTRGRTFcdTMwMDJcbiAqL1xuXG5kZWNsYXJlIGZ1bmN0aW9uIGFjcXVpcmVWc0NvZGVBcGkoKToge1xuICBwb3N0TWVzc2FnZShtc2c6IHVua25vd24pOiB2b2lkO1xuICBnZXRTdGF0ZSgpOiB1bmtub3duO1xuICBzZXRTdGF0ZShzdGF0ZTogdW5rbm93bik6IHZvaWQ7XG59O1xuXG5pbnRlcmZhY2UgSG9zdFRvV2Vidmlld01lc3NhZ2Uge1xuICB0eXBlOiBzdHJpbmc7XG4gIHBheWxvYWQ/OiB1bmtub3duO1xuICBvaz86IGJvb2xlYW47XG4gIHJlYXNvbj86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIExlYXJuaW5nU3RhdGUge1xuICBtYXN0ZXJ5OiBzdHJpbmc7XG4gIGZhdm9yaXRlRmxhZzogYm9vbGVhbjtcbiAgd3JvbmdGbGFnOiBib29sZWFuO1xuICBoYXNOb3RlOiBib29sZWFuO1xuICBsYXN0UHJhY3RpY2VkQXQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBRdWVzdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHR5cGU6ICdjb2RlJyB8ICdxYSc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgdGFnczogc3RyaW5nW107XG4gIGRpZmZpY3VsdHk6IHN0cmluZztcbiAgYW5zd2VyOiBzdHJpbmc7XG4gIHRlc3RDYXNlcz86IEFycmF5PHsgbmFtZT86IHN0cmluZzsgaW5wdXQ/OiBzdHJpbmc7IGV4cGVjdGVkPzogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9PjtcbiAgZm9sbG93VXBzPzogQXJyYXk8eyBxdWVzdGlvbjogc3RyaW5nOyBhbnN3ZXI/OiBzdHJpbmcgfT47XG59XG5cbmNvbnN0IHZzY29kZSA9IGFjcXVpcmVWc0NvZGVBcGkoKTtcblxubGV0IGN1cnJlbnRMZWFybmluZzogTGVhcm5pbmdTdGF0ZSB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gJChpZDogc3RyaW5nKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgZGl2LnRleHRDb250ZW50ID0gdGV4dDtcbiAgcmV0dXJuIGRpdi5pbm5lckhUTUw7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclF1ZXN0aW9uKHF1ZXN0aW9uOiBRdWVzdGlvbik6IHZvaWQge1xuICBjb25zdCB0aXRsZSA9ICQoJ3F1ZXN0aW9uLXRpdGxlJyk7XG4gIGlmICh0aXRsZSkgdGl0bGUudGV4dENvbnRlbnQgPSBxdWVzdGlvbi50aXRsZTtcblxuICBjb25zdCB0eXBlRWwgPSAkKCdxdWVzdGlvbi10eXBlJyk7XG4gIGlmICh0eXBlRWwpIHR5cGVFbC50ZXh0Q29udGVudCA9IHF1ZXN0aW9uLnR5cGUgPT09ICdjb2RlJyA/ICdcdTRFRTNcdTc4MDEnIDogJ1x1OTVFRVx1N0I1NCc7XG5cbiAgY29uc3QgZGlmZkVsID0gJCgncXVlc3Rpb24tZGlmZmljdWx0eScpO1xuICBpZiAoZGlmZkVsKSBkaWZmRWwudGV4dENvbnRlbnQgPSBxdWVzdGlvbi5kaWZmaWN1bHR5O1xuXG4gIGNvbnN0IGNhdEVsID0gJCgncXVlc3Rpb24tY2F0ZWdvcnknKTtcbiAgaWYgKGNhdEVsKSBjYXRFbC50ZXh0Q29udGVudCA9IHF1ZXN0aW9uLmNhdGVnb3J5O1xuXG4gIGNvbnN0IGNvbnRlbnRFbCA9ICQoJ3F1ZXN0aW9uLWNvbnRlbnQnKTtcbiAgaWYgKGNvbnRlbnRFbCkgY29udGVudEVsLnRleHRDb250ZW50ID0gcXVlc3Rpb24uY29udGVudDtcblxuICAvLyBSZW5kZXIgdGVzdCBjYXNlcyBmb3IgY29kZSBxdWVzdGlvbnNcbiAgY29uc3QgdGVzdENhc2VzRWwgPSAkKCd0ZXN0LWNhc2VzJyk7XG4gIGlmICh0ZXN0Q2FzZXNFbCAmJiBxdWVzdGlvbi50eXBlID09PSAnY29kZScgJiYgcXVlc3Rpb24udGVzdENhc2VzICYmIHF1ZXN0aW9uLnRlc3RDYXNlcy5sZW5ndGggPiAwKSB7XG4gICAgbGV0IGh0bWwgPSAnPGgyPlx1NkQ0Qlx1OEJENVx1NzUyOFx1NEY4QjwvaDI+JztcbiAgICBmb3IgKGNvbnN0IHRjIG9mIHF1ZXN0aW9uLnRlc3RDYXNlcykge1xuICAgICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInRlc3QtY2FzZVwiPic7XG4gICAgICBpZiAodGMubmFtZSkgaHRtbCArPSBgPGRpdiBjbGFzcz1cInRlc3QtY2FzZS1uYW1lXCI+JHtlc2NhcGVIdG1sKHRjLm5hbWUpfTwvZGl2PmA7XG4gICAgICBpZiAodGMuaW5wdXQpIGh0bWwgKz0gYDxkaXY+PHN0cm9uZz5cdThGOTNcdTUxNjU6PC9zdHJvbmc+IDxjb2RlPiR7ZXNjYXBlSHRtbCh0Yy5pbnB1dCl9PC9jb2RlPjwvZGl2PmA7XG4gICAgICBpZiAodGMuZXhwZWN0ZWQpIGh0bWwgKz0gYDxkaXY+PHN0cm9uZz5cdTk4ODRcdTY3MUY6PC9zdHJvbmc+IDxjb2RlPiR7ZXNjYXBlSHRtbCh0Yy5leHBlY3RlZCl9PC9jb2RlPjwvZGl2PmA7XG4gICAgICBpZiAodGMuZGVzY3JpcHRpb24pIGh0bWwgKz0gYDxkaXY+JHtlc2NhcGVIdG1sKHRjLmRlc2NyaXB0aW9uKX08L2Rpdj5gO1xuICAgICAgaHRtbCArPSAnPC9kaXY+JztcbiAgICB9XG4gICAgdGVzdENhc2VzRWwuaW5uZXJIVE1MID0gaHRtbDtcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVMZWFybmluZ1VJKGxlYXJuaW5nOiBMZWFybmluZ1N0YXRlKTogdm9pZCB7XG4gIGN1cnJlbnRMZWFybmluZyA9IGxlYXJuaW5nO1xuXG4gIC8vIFVwZGF0ZSBmYXZvcml0ZSBidXR0b25cbiAgY29uc3QgZmF2QnRuID0gJCgnYnRuLWZhdm9yaXRlJyk7XG4gIGlmIChmYXZCdG4pIHtcbiAgICBmYXZCdG4udGV4dENvbnRlbnQgPSBsZWFybmluZy5mYXZvcml0ZUZsYWcgPyAnXHU1M0Q2XHU2RDg4XHU2NTM2XHU4NUNGJyA6ICdcdTY1MzZcdTg1Q0YnO1xuICAgIGlmIChsZWFybmluZy5mYXZvcml0ZUZsYWcpIHtcbiAgICAgIGZhdkJ0bi5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmF2QnRuLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVwZGF0ZSBtYXN0ZXJ5IGJ1dHRvbnNcbiAgY29uc3QgbWFzdGVyeVZhbHVlcyA9IFsndW5sZWFybmVkJywgJ2xlYXJuaW5nJywgJ21hc3RlcmVkJywgJ25vdF9tYXN0ZXJlZCddO1xuICBmb3IgKGNvbnN0IG0gb2YgbWFzdGVyeVZhbHVlcykge1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLW1hc3Rlcnk9XCIke219XCJdYCkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmIChidG4pIHtcbiAgICAgIGlmIChtID09PSBsZWFybmluZy5tYXN0ZXJ5KSB7XG4gICAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2hvd0Fuc3dlcihwYXlsb2FkOiB7IHF1ZXN0aW9uVHlwZTogc3RyaW5nOyBhbnN3ZXI6IHVua25vd24gfSk6IHZvaWQge1xuICBjb25zdCBhcmVhID0gJCgnYW5zd2VyLWFyZWEnKTtcbiAgaWYgKCFhcmVhKSByZXR1cm47XG4gIGFyZWEuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cbiAgY29uc3QgYW5zd2VyID0gcGF5bG9hZC5hbnN3ZXIgYXMgeyBraW5kOiBzdHJpbmc7IGNvZGU/OiBzdHJpbmc7IGJyaWVmQW5zd2VyPzogc3RyaW5nOyBkZXRhaWxlZEFuc3dlcj86IHN0cmluZzsgaGludD86IHN0cmluZzsgZm9sbG93VXBzPzogQXJyYXk8eyBxdWVzdGlvbjogc3RyaW5nOyBhbnN3ZXI/OiBzdHJpbmcgfT4gfTtcblxuICBpZiAoYW5zd2VyLmtpbmQgPT09ICdub25lJykge1xuICAgIGFyZWEuaW5uZXJIVE1MID0gYDxwIGNsYXNzPVwic3RhdHVzLW1lc3NhZ2VcIj4ke2VzY2FwZUh0bWwoYW5zd2VyLmhpbnQgPz8gJ1x1OEJFNVx1OTg5OFx1NjY4Mlx1NjVFMFx1NTNDMlx1ODAwM1x1N0I1NFx1Njg0OCcpfTwvcD5gO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChwYXlsb2FkLnF1ZXN0aW9uVHlwZSA9PT0gJ2NvZGUnKSB7XG4gICAgYXJlYS5pbm5lckhUTUwgPSBgPGgyPlx1NTNDMlx1ODAwM1x1N0I1NFx1Njg0ODwvaDI+PHByZT48Y29kZT4ke2VzY2FwZUh0bWwoYW5zd2VyLmNvZGUgPz8gJycpfTwvY29kZT48L3ByZT5gO1xuICB9IGVsc2Uge1xuICAgIGxldCBodG1sID0gYDxoMj5cdTUzQzJcdTgwMDNcdTdCNTRcdTY4NDg8L2gyPjxwPiR7ZXNjYXBlSHRtbChhbnN3ZXIuYnJpZWZBbnN3ZXIgPz8gJycpfTwvcD5gO1xuICAgIGlmIChhbnN3ZXIuZGV0YWlsZWRBbnN3ZXIpIHtcbiAgICAgIGh0bWwgKz0gYDxoMz5cdThCRTZcdTdFQzZcdTg5RTNcdTY3OTA8L2gzPjxkaXYgY2xhc3M9XCJjb250ZW50LWFyZWFcIj4ke2VzY2FwZUh0bWwoYW5zd2VyLmRldGFpbGVkQW5zd2VyKX08L2Rpdj5gO1xuICAgIH1cbiAgICBhcmVhLmlubmVySFRNTCA9IGh0bWw7XG5cbiAgICAvLyBSZW5kZXIgZm9sbG93LXVwc1xuICAgIGNvbnN0IGZvbGxvd1Vwc0VsID0gJCgnZm9sbG93LXVwcycpO1xuICAgIGlmIChmb2xsb3dVcHNFbCAmJiBhbnN3ZXIuZm9sbG93VXBzICYmIGFuc3dlci5mb2xsb3dVcHMubGVuZ3RoID4gMCkge1xuICAgICAgbGV0IGZ1SHRtbCA9ICc8aDI+XHU4RkZEXHU5NUVFPC9oMj4nO1xuICAgICAgZm9yIChjb25zdCBmdSBvZiBhbnN3ZXIuZm9sbG93VXBzKSB7XG4gICAgICAgIGZ1SHRtbCArPSAnPGRpdiBjbGFzcz1cImZvbGxvdy11cFwiPic7XG4gICAgICAgIGZ1SHRtbCArPSBgPGRpdiBjbGFzcz1cImZvbGxvdy11cC1xdWVzdGlvblwiPiR7ZXNjYXBlSHRtbChmdS5xdWVzdGlvbil9PC9kaXY+YDtcbiAgICAgICAgaWYgKGZ1LmFuc3dlcikgZnVIdG1sICs9IGA8ZGl2PiR7ZXNjYXBlSHRtbChmdS5hbnN3ZXIpfTwvZGl2PmA7XG4gICAgICAgIGZ1SHRtbCArPSAnPC9kaXY+JztcbiAgICAgIH1cbiAgICAgIGZvbGxvd1Vwc0VsLmlubmVySFRNTCA9IGZ1SHRtbDtcbiAgICB9XG4gIH1cblxuICAvLyBIaWRlIHRoZSBidXR0b25cbiAgY29uc3QgYnRuID0gJCgnYnRuLXNob3ctYW5zd2VyJyk7XG4gIGlmIChidG4pIGJ0bi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xufVxuXG5mdW5jdGlvbiBzaG93U3RhdHVzKG1zZzogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IGVsID0gJCgnc3RhdHVzLW1lc3NhZ2UnKTtcbiAgaWYgKGVsKSB7XG4gICAgZWwudGV4dENvbnRlbnQgPSBtc2c7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7IGVsLnRleHRDb250ZW50ID0gJyc7IH0sIDMwMDApO1xuICB9XG59XG5cbi8vIEV2ZW50IGxpc3RlbmVyc1xuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgJCgnYnRuLXNob3ctYW5zd2VyJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdyZXF1ZXN0QW5zd2VyJyB9KTtcbiAgfSk7XG5cbiAgJCgnYnRuLWZhdm9yaXRlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICd0b2dnbGVGYXZvcml0ZScgfSk7XG4gIH0pO1xuXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLW1hc3RlcnldJykuZm9yRWFjaCgoYnRuKSA9PiB7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSAoYnRuIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0WydtYXN0ZXJ5J107XG4gICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3NldE1hc3RlcnknLCB2YWx1ZSB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgJCgnbGluay1vcGVuLW5vdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAnb3Blbk5hdGl2ZUVkaXRvcicsIHRhcmdldDogJ25vdGUnIH0pO1xuICB9KTtcblxuICAkKCdsaW5rLW5vdGUtcHJldmlldycpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdyZXF1ZXN0Tm90ZVByZXZpZXcnIH0pO1xuICB9KTtcblxuICAvLyBOb3RpZnkgaG9zdCB0aGF0IHdlYnZpZXcgaXMgcmVhZHlcbiAgdnNjb2RlLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3JlYWR5JyB9KTtcbn0pO1xuXG4vLyBMaXN0ZW4gZm9yIG1lc3NhZ2VzIGZyb20gaG9zdFxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZXZlbnQpID0+IHtcbiAgY29uc3QgbXNnID0gZXZlbnQuZGF0YSBhcyBIb3N0VG9XZWJ2aWV3TWVzc2FnZTtcbiAgc3dpdGNoIChtc2cudHlwZSkge1xuICAgIGNhc2UgJ2luaXQnOiB7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbXNnLnBheWxvYWQgYXMgeyBxdWVzdGlvbjogUXVlc3Rpb247IGxlYXJuaW5nOiBMZWFybmluZ1N0YXRlIH07XG4gICAgICByZW5kZXJRdWVzdGlvbihwYXlsb2FkLnF1ZXN0aW9uKTtcbiAgICAgIHVwZGF0ZUxlYXJuaW5nVUkocGF5bG9hZC5sZWFybmluZyk7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSAnc2hvd0Fuc3dlcic6IHtcbiAgICAgIHNob3dBbnN3ZXIobXNnLnBheWxvYWQgYXMgeyBxdWVzdGlvblR5cGU6IHN0cmluZzsgYW5zd2VyOiB1bmtub3duIH0pO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ3JvbGxiYWNrJzpcbiAgICBjYXNlICdyZWZyZXNoTGVhcm5pbmcnOiB7XG4gICAgICBjb25zdCBsZWFybmluZyA9IG1zZy5wYXlsb2FkIGFzIExlYXJuaW5nU3RhdGU7XG4gICAgICBpZiAobGVhcm5pbmcpIHVwZGF0ZUxlYXJuaW5nVUkobGVhcm5pbmcpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgJ21hc3RlcnlBY2snOiB7XG4gICAgICBpZiAoIW1zZy5vaykge1xuICAgICAgICBzaG93U3RhdHVzKGBcdTYzOENcdTYzRTFcdTcyQjZcdTYwMDFcdTY2RjRcdTY1QjBcdTU5MzFcdThEMjU6ICR7bXNnLnJlYXNvbiA/PyAnXHU2NzJBXHU3N0U1XHU5NTE5XHU4QkVGJ31gKTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlICdmYXZvcml0ZUFjayc6IHtcbiAgICAgIGlmICghbXNnLm9rKSB7XG4gICAgICAgIHNob3dTdGF0dXMoYFx1NjUzNlx1ODVDRlx1NjRDRFx1NEY1Q1x1NTkzMVx1OEQyNTogJHttc2cucmVhc29uID8/ICdcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUYnfWApO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQXdDQSxNQUFNLFNBQVMsaUJBQWlCO0FBRWhDLE1BQUk7QUFFSixXQUFTLEVBQUUsSUFBZ0M7QUFDekMsV0FBTyxTQUFTLGVBQWUsRUFBRTtBQUFBLEVBQ25DO0FBRUEsV0FBUyxXQUFXLE1BQXNCO0FBQ3hDLFVBQU0sTUFBTSxTQUFTLGNBQWMsS0FBSztBQUN4QyxRQUFJLGNBQWM7QUFDbEIsV0FBTyxJQUFJO0FBQUEsRUFDYjtBQUVBLFdBQVMsZUFBZSxVQUEwQjtBQUNoRCxVQUFNLFFBQVEsRUFBRSxnQkFBZ0I7QUFDaEMsUUFBSSxNQUFPLE9BQU0sY0FBYyxTQUFTO0FBRXhDLFVBQU0sU0FBUyxFQUFFLGVBQWU7QUFDaEMsUUFBSSxPQUFRLFFBQU8sY0FBYyxTQUFTLFNBQVMsU0FBUyxpQkFBTztBQUVuRSxVQUFNLFNBQVMsRUFBRSxxQkFBcUI7QUFDdEMsUUFBSSxPQUFRLFFBQU8sY0FBYyxTQUFTO0FBRTFDLFVBQU0sUUFBUSxFQUFFLG1CQUFtQjtBQUNuQyxRQUFJLE1BQU8sT0FBTSxjQUFjLFNBQVM7QUFFeEMsVUFBTSxZQUFZLEVBQUUsa0JBQWtCO0FBQ3RDLFFBQUksVUFBVyxXQUFVLGNBQWMsU0FBUztBQUdoRCxVQUFNLGNBQWMsRUFBRSxZQUFZO0FBQ2xDLFFBQUksZUFBZSxTQUFTLFNBQVMsVUFBVSxTQUFTLGFBQWEsU0FBUyxVQUFVLFNBQVMsR0FBRztB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
