import { describe, expect, it } from 'vitest';
import { richText } from './render-paper-pdf';

describe('richText pipe tables', () => {
  it('converts an embedded table, keeps surrounding prose escaped pre-wrap', () => {
    const html = richText('Measurements below.\n| t | 1 | 2 |\n| --- | --- | --- |\n| m | 15.6 | 12.1 |\nPlot the graph.');
    expect(html).toContain('Measurements below.');
    expect(html).toContain('<table class="pp-table">');
    expect(html).toContain('<th>t</th>');
    expect(html).toContain('<td>12.1</td>');
    expect(html).not.toContain('| ---');
    expect(html).toContain('Plot the graph.');
  });

  it('keeps $…$ TeX inside cells for the KaTeX pass', () => {
    const html = richText('| $t$ | $m$ |\n| --- | --- |\n| 1 | 15.6 |');
    expect(html).toContain('<th>$t$</th>');
  });

  it('escapes HTML in prose and cells', () => {
    const html = richText('a < b\n| x<y | ok |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('a &lt; b');
    expect(html).toContain('<th>x&lt;y</th>');
  });

  it('text without tables is plain escaped text', () => {
    expect(richText('either P or Q holds')).toBe('either P or Q holds');
  });
});
