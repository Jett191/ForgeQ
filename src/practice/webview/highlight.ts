/**
 * 极简语法高亮（webview 内嵌，零依赖）。
 *
 * 配合 `markdown.ts` 在前端面试题代码块上提供 GitHub 风格的着色：
 *  - js / ts / jsx / tsx / javascript / typescript（最完整）
 *  - css / scss / less（属性 / 数值 / 字符串 / 注释 / 颜色）
 *  - html / xml / vue / svg（标签 / 属性 / 字符串 / 注释）
 *  - json / json5（key / 字符串 / 数字 / 布尔）
 *  - py / python、sh / bash / zsh（基础关键字 / 字符串 / 注释）
 * 其它语言降级为纯文本（仅做 HTML 转义）。
 *
 * tokenize 用 sticky 正则按规则优先级前缀匹配，单遍扫描 O(n × rules)。
 * 输出包装为 `<span class="hl-${kind}">…</span>`，配色由 styles.css 提供
 * 亮 / 暗双套，依靠 webview body 上的 `.vscode-light` / `.vscode-dark`
 * class 切换。
 *
 * 与 markdown.ts 解耦：不导入它，escapeHtml 在本文件独立实现，避免循环依赖。
 */

interface Rule {
  kind: string;
  re: RegExp;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 把源码按规则数组 tokenize 成带 hl-class 的 HTML。
 *
 * - 规则按数组顺序优先级前缀匹配；不匹配则归入"plain"段落，统一转义后输出。
 * - 所有 RegExp 必须是 sticky（`y` 标志），lastIndex 才会被尊重。
 */
function tokenize(src: string, rules: ReadonlyArray<Rule>): string {
  let out = '';
  let plain = '';
  const flush = (): void => {
    if (plain) {
      out += escapeHtml(plain);
      plain = '';
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

// ---------------------------------------------------------------------------
// 各语言规则表
// ---------------------------------------------------------------------------

/**
 * JS / TS 规则。注意：
 *  - 注释、字符串、模板字符串放最前，避免里面的关键字被误染。
 *  - `ty`（大写开头标识符）放在 `fn` 前，让 `MyClass(...)` 染成类型色而不是函数色。
 *  - 模板字符串里的 `${expr}` 不做嵌套解析，整体当字符串处理（面试题代码够用）。
 */
const JS_RULES: ReadonlyArray<Rule> = [
  { kind: 'com', re: /\/\/[^\n]*/y },
  { kind: 'com', re: /\/\*[\s\S]*?\*\//y },
  { kind: 'str', re: /"(?:\\.|[^"\\\n])*"/y },
  { kind: 'str', re: /'(?:\\.|[^'\\\n])*'/y },
  { kind: 'str', re: /`(?:\\.|[^`\\])*`/y },
  {
    kind: 'kw',
    re: /\b(?:const|let|var|function|class|extends|implements|interface|type|enum|namespace|declare|module|import|export|from|as|default|return|if|else|for|while|do|switch|case|break|continue|new|delete|this|super|typeof|instanceof|in|of|try|catch|finally|throw|async|await|yield|static|get|set|public|private|protected|readonly|abstract|override|void|any|unknown|never|with)\b/y,
  },
  { kind: 'bool', re: /\b(?:true|false|null|undefined|NaN|Infinity)\b/y },
  {
    kind: 'num',
    re: /\b(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)n?\b/y,
  },
  { kind: 'ty', re: /\b[A-Z][\w$]*\b/y },
  { kind: 'fn', re: /\b[a-zA-Z_$][\w$]*(?=\s*\()/y },
];

/** CSS / SCSS / LESS 规则。Selector 不做精细高亮，重点在 prop / value / 颜色。 */
const CSS_RULES: ReadonlyArray<Rule> = [
  { kind: 'com', re: /\/\*[\s\S]*?\*\//y },
  { kind: 'str', re: /"(?:[^"\\\n]|\\.)*"/y },
  { kind: 'str', re: /'(?:[^'\\\n]|\\.)*'/y },
  { kind: 'val', re: /#[0-9a-fA-F]{3,8}\b/y },
  { kind: 'kw', re: /@[a-zA-Z-]+/y },
  { kind: 'prop', re: /-?[a-zA-Z][\w-]*(?=\s*:)/y },
  {
    kind: 'num',
    re: /-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|rad|turn|fr|pt|pc|ex|ch)?\b/y,
  },
  {
    kind: 'bool',
    re: /\b(?:none|inherit|initial|unset|auto|inline|block|flex|grid|absolute|relative|fixed|static|sticky|hidden|visible)\b/y,
  },
];

/** HTML / XML 规则。`<` `>` 被纳入 tag 段以避免被 escapeHtml 转成 &lt; 后丢失视觉。 */
const HTML_RULES: ReadonlyArray<Rule> = [
  { kind: 'com', re: /<!--[\s\S]*?-->/y },
  { kind: 'str', re: /"[^"\n]*"/y },
  { kind: 'str', re: /'[^'\n]*'/y },
  { kind: 'tag', re: /<\/?[a-zA-Z][\w-]*/y },
  { kind: 'tag', re: /\/?>/y },
  { kind: 'attr', re: /\b[a-zA-Z][\w-]*(?==)/y },
];

/** JSON 规则。key 比 str 优先匹配（`"x"` 后跟 `:` 是 key）。 */
const JSON_RULES: ReadonlyArray<Rule> = [
  { kind: 'attr', re: /"(?:\\.|[^"\\])*"(?=\s*:)/y },
  { kind: 'str', re: /"(?:\\.|[^"\\])*"/y },
  { kind: 'bool', re: /\b(?:true|false|null)\b/y },
  { kind: 'num', re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
];

const PY_RULES: ReadonlyArray<Rule> = [
  { kind: 'com', re: /#[^\n]*/y },
  { kind: 'str', re: /"""[\s\S]*?"""/y },
  { kind: 'str', re: /'''[\s\S]*?'''/y },
  { kind: 'str', re: /"(?:\\.|[^"\\\n])*"/y },
  { kind: 'str', re: /'(?:\\.|[^'\\\n])*'/y },
  {
    kind: 'kw',
    re: /\b(?:def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|yield|lambda|global|nonlocal|in|is|not|and|or|async|await)\b/y,
  },
  { kind: 'bool', re: /\b(?:True|False|None)\b/y },
  { kind: 'num', re: /\b\d+(?:\.\d+)?\b/y },
  { kind: 'fn', re: /\b[a-zA-Z_]\w*(?=\s*\()/y },
];

const SH_RULES: ReadonlyArray<Rule> = [
  { kind: 'com', re: /#[^\n]*/y },
  { kind: 'str', re: /"(?:\\.|[^"\\])*"/y },
  { kind: 'str', re: /'[^']*'/y },
  {
    kind: 'kw',
    re: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|export|local|readonly)\b/y,
  },
  { kind: 'fn', re: /\$\{[^}]+\}|\$\w+/y },
];

function langKey(lang: string): string {
  switch (lang.toLowerCase()) {
    case 'js':
    case 'jsx':
    case 'javascript':
    case 'ts':
    case 'tsx':
    case 'typescript':
      return 'js';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'html':
    case 'xml':
    case 'vue':
    case 'svg':
      return 'html';
    case 'json':
    case 'json5':
      return 'json';
    case 'py':
    case 'python':
      return 'py';
    case 'sh':
    case 'bash':
    case 'shell':
    case 'zsh':
      return 'sh';
    default:
      return '';
  }
}

/**
 * 公共入口：把 `code` 按 `lang` 渲染为已转义的 HTML 字符串。
 *
 * 调用方拿到结果后直接拼到 `<pre><code>...</code></pre>` 内即可，无需再次转义。
 */
export function highlight(code: string, lang: string): string {
  switch (langKey(lang)) {
    case 'js':
      return tokenize(code, JS_RULES);
    case 'css':
      return tokenize(code, CSS_RULES);
    case 'html':
      return tokenize(code, HTML_RULES);
    case 'json':
      return tokenize(code, JSON_RULES);
    case 'py':
      return tokenize(code, PY_RULES);
    case 'sh':
      return tokenize(code, SH_RULES);
    default:
      return escapeHtml(code);
  }
}
