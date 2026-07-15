/**
 * Markdown 渲染器（webview 端 inline 实现，数学公式交给 KaTeX）。
 *
 * 题库内容包含大量 Markdown：标题（`#`/`##`...）、粗体（`**...**`）、代码块、
 * 列表、表格、引用、分割线、链接等。Webview 必须把它们以排版友好的 HTML
 * 呈现，否则原文 `**` `\n` `#` 会直接显示在面板上，体验很差。
 *
 * 由于 VS Code Webview 的 CSP 默认禁止外部脚本与样式，引入第三方 markdown
 * 库会让构建/打包/资源加载更复杂；本扩展也不需要 GFM 全特性，因此自写一个
 * "够用" 的渲染器，覆盖如下子集：
 *
 *  - ATX 标题 `# H1` ~ `###### H6`
 *  - 段落（双换行作分隔）
 *  - 无序列表（`-` `*` `+`）/ 有序列表（`1.`）
 *  - 引用块 `> ...`（递归渲染内部 markdown）
 *  - 围栏代码块 ``` lang ... ```（语言信息只取首段，忽略 `id="..."` 等元数据）
 *  - 分割线 `---` / `***`
 *  - 简单管道表格 `| h | h |\n| - | - |\n| c | c |`
 *  - 行内：`code`、**bold**、*italic*、[link](url)、HTTPS 图片、`<code>` 已被转义
 *  - LaTeX 数学公式：`$...$` 行内公式和 `$$...$$` 展示公式
 *
 * 普通用户文本进入渲染器之前都会先做 HTML 转义；LaTeX 公式只交给
 * `trust: false` 的 KaTeX。这样既避免 XSS，也保证代码块里的 `<` `>` `&`
 * 原样展示。
 *
 * 该模块不依赖 DOM；调用方拿到字符串后赋值给 `innerHTML`。
 *
 * 代码块的语法着色委托给 `highlight.ts`：在围栏代码块渲染处调用
 * `highlight(code, lang)` 直接拿到已转义且包了 `<span class="hl-*">` 的 HTML，
 * 因此本文件对代码块内容不再二次 escapeHtml。
 */

import katex from 'katex';

import { highlight } from './highlight.js';

/** 把字符串转义为安全的 HTML 文本节点内容。 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把 markdown 字符串渲染为 HTML 字符串。 */
export function renderMarkdown(src: string | undefined | null): string {
  if (!src) return '';
  return blockRender(normalizeNewlines(src));
}

// ---------------------------------------------------------------------------
// 内部实现
// ---------------------------------------------------------------------------

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

/**
 * 块级渲染。逐行扫描，根据行首特征决定块类型；段落由空行分隔。
 *
 * 实现成有限状态扫描，便于在不引入 token 类的前提下保持线性复杂度。
 */
function blockRender(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  let paragraph: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;
  const listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    out.push(`<p>${inlineRender(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = (): void => {
    if (listKind === null) return;
    out.push(`<${listKind}>${listItems.join('')}</${listKind}>`);
    listItems.length = 0;
    listKind = null;
  };

  const flushAll = (): void => {
    flushParagraph();
    flushList();
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // LaTeX 展示公式：支持单行 `$$...$$` 与多行 `$$` 围栏。
    const oneLineMath = /^\s*\$\$([\s\S]+?)\$\$\s*$/.exec(line);
    if (oneLineMath) {
      flushAll();
      out.push(renderMath(oneLineMath[1] ?? '', true));
      i++;
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      flushAll();
      const mathLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i] ?? '')) {
        mathLines.push(lines[i] ?? '');
        i++;
      }
      if (i < lines.length) i++;
      out.push(renderMath(mathLines.join('\n'), true));
      continue;
    }

    // 围栏代码块
    const fence = /^```\s*([^\s`]*)/.exec(line);
    if (fence) {
      flushAll();
      const langRaw = fence[1] ?? '';
      // 取首个空白前的部分作为语言，忽略 `id="z0"` 等额外标记
      const lang = langRaw.split(/\s/)[0] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      // 跳过结束围栏（若文件末尾无结束符也容忍）
      if (i < lines.length) i++;
      const langClass = lang ? ` class="lang-${escapeAttr(lang)}"` : '';
      out.push(
        `<pre><code${langClass}>${highlight(codeLines.join('\n'), lang)}</code></pre>`,
      );
      continue;
    }

    // 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = (heading[1] ?? '').length;
      out.push(`<h${level}>${inlineRender(heading[2] ?? '')}</h${level}>`);
      i++;
      continue;
    }

    // 分割线
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushAll();
      out.push('<hr/>');
      i++;
      continue;
    }

    // 引用块（连续的 `>` 行）
    if (/^\s*>/.test(line)) {
      flushAll();
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) {
        quoteLines.push((lines[i] ?? '').replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${blockRender(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // 表格：表头行 + 分隔行 + 任意数据行
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1] ?? '')
    ) {
      flushAll();
      const headerCells = parseTableRow(line);
      i += 2; // 跳过表头与分隔符
      const bodyRows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        bodyRows.push(parseTableRow(lines[i] ?? ''));
        i++;
      }
      let table = '<table><thead><tr>';
      for (const c of headerCells) table += `<th>${inlineRender(c)}</th>`;
      table += '</tr></thead><tbody>';
      for (const row of bodyRows) {
        table += '<tr>';
        for (const c of row) table += `<td>${inlineRender(c)}</td>`;
        table += '</tr>';
      }
      table += '</tbody></table>';
      out.push(table);
      continue;
    }

    // 无序 / 有序列表
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushParagraph();
      const kind: 'ul' | 'ol' = ul ? 'ul' : 'ol';
      if (listKind !== null && listKind !== kind) {
        flushList();
      }
      listKind = kind;
      const text = (ul ? ul[1] : ol?.[1]) ?? '';
      listItems.push(`<li>${inlineRender(text)}</li>`);
      i++;
      continue;
    }

    // 空行：段落分隔
    if (line.trim() === '') {
      flushAll();
      i++;
      continue;
    }

    // 普通段落行
    flushList();
    paragraph.push(line);
    i++;
  }

  flushAll();
  return out.join('');
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/** 行内渲染：先转义，再处理 inline code（占位保护），再处理其余标记。 */
function inlineRender(s: string): string {
  let out = escapeHtml(s);

  // 1) 行内代码：用占位符替换以避免被后续规则误伤
  const codes: string[] = [];
  out = out.replace(/`([^`\n]+?)`/g, (_, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  // 2) LaTeX 行内公式：代码占位完成后再识别，避免把 `$...$` 代码误渲染。
  const maths: string[] = [];
  out = out.replace(
    /(^|[^\\$])\$(?!\$)([^$\n]+?)\$/g,
    (_, prefix: string, expression: string) => {
      const tex = expression
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
      maths.push(renderMath(tex, false));
      return `${prefix}\u0000M${maths.length - 1}\u0000`;
    },
  );

  // 3) 图片 ![alt](https://url) —— 仅允许 HTTPS；使用占位符避免图片属性
  // 被后续强调语法的正则误处理。无效来源降级为普通替代文字。
  const images: string[] = [];
  out = out.replace(
    /!\[([^\]\n]*)\]\(\s*([^\s)]+)(?:\s+&quot;([^\n]*?)&quot;)?\s*\)/g,
    (_, alt: string, src: string, title: string | undefined) => {
      const safeSrc = sanitizeImageSrc(src);
      const index = images.length;
      if (safeSrc === null) {
        images.push(`<span class="md-image-fallback">${alt || '图片'}</span>`);
      } else {
        const titleAttr = title ? ` title="${title}"` : '';
        images.push(
          `<img src="${safeSrc}" alt="${alt}"${titleAttr} loading="lazy" decoding="async" referrerpolicy="no-referrer" />`,
        );
      }
      return `\u0000I${index}\u0000`;
    },
  );

  // 4) 链接 [text](url) —— 仅允许 http/https/mailto 与相对路径，规避 javascript:
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text: string, href: string) => {
      const safe = sanitizeHref(href);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  );

  // 5) 加粗 + 斜体 / 加粗 / 斜体（顺序不能颠倒）
  out = out.replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  // 斜体：避免吞掉成对加粗的剩余 `*`，要求左右非 `*`
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

  // 6) 还原 inline code、公式与图片占位
  out = out.replace(/\u0000C(\d+)\u0000/g, (_, idx: string) => {
    const i = Number(idx);
    return codes[i] ?? '';
  });
  out = out.replace(/\u0000M(\d+)\u0000/g, (_, idx: string) => {
    const i = Number(idx);
    return maths[i] ?? '';
  });
  out = out.replace(/\u0000I(\d+)\u0000/g, (_, idx: string) => {
    const i = Number(idx);
    return images[i] ?? '';
  });

  return out;
}

function renderMath(expression: string, displayMode: boolean): string {
  return katex.renderToString(expression.trim(), {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
    output: 'htmlAndMathml',
  });
}

/** 验证图片地址，并返回已经过 HTML 转义、可安全写入属性的原值。 */
function sanitizeImageSrc(src: string): string | null {
  // inlineRender 已先执行 escapeHtml；这里只还原 &amp; 用于 URL 语义校验，
  // 返回值仍使用转义后的 src，避免属性注入。
  const candidate = src.replace(/&amp;/g, '&');
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.hostname === '') return null;
    return src;
  } catch {
    return null;
  }
}

function sanitizeHref(href: string): string {
  const trimmed = href.trim();
  if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(trimmed)) {
    return escapeAttr(trimmed);
  }
  // 不识别的协议（含 javascript:）一律降级为锚点，避免脚本执行
  return '#';
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
