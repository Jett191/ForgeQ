import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '../../src/practice/webview/markdown.js';

describe('Markdown LaTeX math', () => {
  it('renders inline formulas without exposing dollar delimiters', () => {
    const html = renderMarkdown(
      String.raw`遍历 $l_1$ 和 $l_2$，复杂度 $O(\max(m,n))$。`,
    );

    expect(html).toContain('class="katex"');
    expect(html).not.toContain('$l_1$');
    expect(html).not.toContain('$O(\\max(m,n))$');
  });

  it('renders display formulas', () => {
    const html = renderMarkdown(String.raw`$$\sum_{i=1}^{n} i$$`);

    expect(html).toContain('class="katex-display"');
    expect(html).toContain('class="katex"');
  });

  it('does not interpret formulas inside inline code', () => {
    const html = renderMarkdown('`$O(n)$`');

    expect(html).toContain('<code>$O(n)$</code>');
    expect(html).not.toContain('class="katex"');
  });
});
