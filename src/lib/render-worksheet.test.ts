import { describe, expect, it } from 'vitest';
import { mdToHtml } from './render-worksheet';

describe('mdToHtml pipe tables', () => {
  it('renders a GFM table with header, separator and data rows', () => {
    const html = mdToHtml('| t | 1 | 2 |\n| --- | --- | --- |\n| m | 15.6 | 12.1 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>t</th>');
    expect(html).toContain('<td>15.6</td>');
    expect(html).not.toContain('| ---');
  });

  it('keeps math inside cells intact', () => {
    const html = mdToHtml('| $x$ | $y^2$ |\n| --- | --- |\n| 1 | 4 |');
    expect(html).toContain('<th>$x$</th>');
    expect(html).toContain('<td>4</td>');
  });

  it('a table between paragraphs closes cleanly', () => {
    const html = mdToHtml('Values below.\n| a | b |\n| --- | --- |\n| 1 | 2 |\nUse the graph.');
    expect(html).toContain('<p>Values below.</p>');
    expect(html).toContain('</table>');
    expect(html).toContain('<p>Use the graph.</p>');
  });

  it('plain prose with a lone pipe is not a table', () => {
    const html = mdToHtml('either P or Q holds');
    expect(html).not.toContain('<table>');
  });
});

describe('mdToHtml inline HTML from the bank', () => {
  it('renders <b>/<i>/<sup> as markup instead of printing the tags (6 Sep 2026)', () => {
    const html = mdToHtml('<b>Do not use a calculator.</b> Using <i>part b(i)</i>, find x<sup>2</sup>.');
    expect(html).toContain('<strong>Do not use a calculator.</strong>');
    expect(html).toContain('<em>part b(i)</em>');
    expect(html).toContain('x<sup>2</sup>');
    expect(html).not.toContain('&lt;b&gt;');
  });
  it('still escapes tags outside the whitelist', () => {
    const html = mdToHtml('<script>alert(1)</script> and 3 < 4');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('3 &lt; 4');
  });
});
