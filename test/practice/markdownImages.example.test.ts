import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '../../src/practice/webview/markdown.js';

describe('Markdown HTTPS images', () => {
  it('renders an HTTPS image with privacy and loading attributes', () => {
    const html = renderMarkdown('![流程图](https://example.com/flow.png)');

    expect(html).toContain('<img src="https://example.com/flow.png" alt="流程图"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  it('supports an optional image title and escapes attributes', () => {
    const html = renderMarkdown(
      '![A & B](https://example.com/image.png "示意 & 说明")',
    );

    expect(html).toContain('alt="A &amp; B"');
    expect(html).toContain('title="示意 &amp; 说明"');
  });

  it.each([
    '![HTTP](http://example.com/a.png)',
    '![Data](data:image/png;base64,abc)',
    '![Local](./images/a.png)',
    '![Script](javascript:alert(1))',
  ])('does not render a disallowed image source: %s', (markdown) => {
    const html = renderMarkdown(markdown);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a');
  });

  it('does not interpret image syntax inside inline code', () => {
    const html = renderMarkdown('`![图](https://example.com/a.png)`');

    expect(html).toContain('<code>![图](https://example.com/a.png)</code>');
    expect(html).not.toContain('<img');
  });
});
