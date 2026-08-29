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
