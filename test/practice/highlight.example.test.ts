import { describe, expect, it } from 'vitest';

import { highlight } from '../../src/practice/webview/highlight.js';

describe('Java syntax highlighting', () => {
  it('highlights Java keywords, types, methods, numbers, and comments', () => {
    const html = highlight(
      `// sliding window\npublic class Solution {\n  public int solve(String s) {\n    return Math.max(0, s.length());\n  }\n}`,
      'java',
    );

    expect(html).toContain('<span class="hl-com">// sliding window</span>');
    expect(html).toContain('<span class="hl-kw">public</span>');
    expect(html).toContain('<span class="hl-kw">class</span>');
    expect(html).toContain('<span class="hl-ty">int</span>');
    expect(html).toContain('<span class="hl-ty">String</span>');
    expect(html).toContain('<span class="hl-fn">solve</span>');
    expect(html).toContain('<span class="hl-num">0</span>');
  });

  it('keeps keywords inside Java strings and comments in one token', () => {
    const html = highlight('String s = "public class"; // return null', 'java');

    expect(html).toContain('<span class="hl-str">&quot;public class&quot;</span>');
    expect(html).toContain('<span class="hl-com">// return null</span>');
  });

  it('escapes generic brackets while highlighting their types', () => {
    const html = highlight('List<String> values = new ArrayList<>();', 'java');

    expect(html).toContain('<span class="hl-ty">List</span>&lt;<span class="hl-ty">String</span>&gt;');
    expect(html).toContain('<span class="hl-kw">new</span>');
  });
});

describe('TypeScript, JSX, TSX, and Go syntax highlighting', () => {
  it('highlights TypeScript-specific declarations', () => {
    const html = highlight(
      'interface User { readonly id: number }\nconst load = async (): Promise<User> => user;',
      'ts',
    );

    expect(html).toContain('<span class="hl-kw">interface</span>');
    expect(html).toContain('<span class="hl-kw">readonly</span>');
    expect(html).toContain('<span class="hl-ty">User</span>');
    expect(html).toContain('<span class="hl-ty">Promise</span>');
  });

  it.each(['jsx', 'tsx'])('highlights component and HTML tags in %s', (language) => {
    const html = highlight(
      'const App = () => <main><Card title="Hello" /></main>;',
      language,
    );

    expect(html).toContain('<span class="hl-tag">&lt;main</span>');
    expect(html).toContain('<span class="hl-tag">&lt;Card</span>');
    expect(html).toContain('<span class="hl-tag">&lt;/main</span>');
  });

  it('does not treat comparison operators as JSX tags', () => {
    const html = highlight('const visible = value > limit ? <Card /> : null;', 'tsx');

    expect(html).toContain('value &gt; limit');
    expect(html).not.toContain('<span class="hl-tag">&gt;</span>');
    expect(html).toContain('<span class="hl-tag">&lt;Card</span> /&gt;');
  });

  it('highlights Go keywords, built-in types, functions, and literals', () => {
    const html = highlight(
      'package main\n\nfunc solve(values []int) map[string]int {\n  return nil\n}',
      'go',
    );

    expect(html).toContain('<span class="hl-kw">package</span>');
    expect(html).toContain('<span class="hl-kw">func</span>');
    expect(html).toContain('<span class="hl-fn">solve</span>');
    expect(html).toContain('<span class="hl-ty">int</span>');
    expect(html).toContain('<span class="hl-ty">string</span>');
    expect(html).toContain('<span class="hl-bool">nil</span>');
  });
});
