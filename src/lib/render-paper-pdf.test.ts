import { describe, expect, it } from 'vitest';
import { richText, buildPaperHTML } from './render-paper-pdf';

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

describe('marks placement (JPJC 2025 P2 Q11, 13 Sep 2026)', () => {
  const html = buildPaperHTML({
    title: 't', metaLine: 'm', workingSpace: false, answerKey: false,
    questions: [{
      qnum: '11', marks: 10, stem: 'Stem text', images: [], missingFigure: false, answerLines: [],
      parts: [
        { label: 'a', marks: 2, text: 'Draw it.' },
        { label: 'b', marks: 8, text: 'Eight cities.', subparts: [{ label: 'i', marks: 2, text: 'Draw a scatter diagram.' }, { label: 'ii', marks: 1, text: 'Explain.' }] },
      ],
    }],
  });
  it('a parent whose sub-parts carry marks prints no total of its own', () => {
    expect(html).not.toContain('[8]');
    expect(html).toContain('[2]');
    expect(html).toContain('[1]');
    expect(html).not.toContain('[10]');   // the question total lives in the parts too
  });
  it('marks sit in the same line-box as the text, after it, never floated', () => {
    expect(html).toMatch(/<div class="pp-part-text"><span class="pp-txt">.*Draw it\.<\/span><span class="pp-mk">\[2\]<\/span><\/div>/);
    expect(html).not.toContain('float:right');
  });
});
