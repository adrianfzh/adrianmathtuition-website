import { describe, it, expect } from 'vitest';
import type { Root } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import { classifyLabel, remarkNotesBlocks } from './notes-blocks';

// End-to-end through the same plugin order the notes surface uses, then out to
// HTML — the point of this module is the markup it produces, so assert on that
// rather than on mdast internals.
function render(markdown: string): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkNotesBlocks);
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  return toHtml(toHast(tree));
}

describe('classifyLabel', () => {
  it('recognises the roles authors actually use', () => {
    expect(classifyLabel('Question:')).toEqual({ kind: 'question', label: 'Question' });
    expect(classifyLabel('Step 1.')).toEqual({ kind: 'step', label: 'Step 1' });
    expect(classifyLabel('Step  12')).toEqual({ kind: 'step', label: 'Step 12' });
    expect(classifyLabel('Answer:')).toEqual({ kind: 'answer', label: 'Answer' });
    expect(classifyLabel('Tip:')).toEqual({ kind: 'tip', label: 'Tip' });
    expect(classifyLabel('Why this works:')).toEqual({
      kind: 'tip',
      label: 'Why this works',
    });
    expect(classifyLabel('Sanity check:')).toEqual({
      kind: 'check',
      label: 'Sanity check',
    });
  });

  it('strips emoji decoration from the label', () => {
    expect(classifyLabel('⚠ Watch out:')).toEqual({ kind: 'warn', label: 'Watch out' });
  });

  it('treats part markers as parts', () => {
    expect(classifyLabel('(a)')).toEqual({ kind: 'part', label: '(a)' });
    expect(classifyLabel('(ii) R-form')).toEqual({ kind: 'part', label: '(ii) R-form' });
  });

  it('leaves anything it does not know alone', () => {
    expect(classifyLabel('Coefficient of x^2')).toBeNull();
    expect(classifyLabel('')).toBeNull();
    // Long bold sentences are emphasis, not labels.
    expect(classifyLabel('Every point on it is equidistant from A and B')).toBeNull();
  });
});

describe('remarkNotesBlocks', () => {
  it('wraps a labelled paragraph and drops the label from the body text', () => {
    const html = render('**Question:** Find $n$.');
    expect(html).toContain('<div class="nb" data-nb="question">');
    expect(html).toContain('<span class="nb-label">Question</span>');
    expect(html).toContain('Find');
    // The label must not survive twice — once as the chip, once as bold text.
    expect(html).not.toContain('<strong>Question');
  });

  it('pulls the siblings after a label into that block', () => {
    const html = render(
      // Display maths is pre-fenced here the way fixMathFences hands it over.
      ['**Step 2.** Set up the ratio:', '', '$$', 'a=b', '$$', '', 'Simplify it.'].join(
        '\n',
      ),
    );
    const block = html.slice(html.indexOf('data-nb="step"'));
    expect(block).toContain('Set up the ratio:');
    expect(block).toContain('math-display');
    expect(block).toContain('Simplify it.');
    // One block, not three.
    expect(html.match(/data-nb=/g)).toHaveLength(1);
  });

  it('starts a new block at the next label', () => {
    const html = render(
      ['**Question:** Find $k$.', '', '**Step 1.** Expand.', '', '**Answer:** $k=5$.'].join(
        '\n',
      ),
    );
    expect(html.match(/data-nb="question"/g)).toHaveLength(1);
    expect(html.match(/data-nb="step"/g)).toHaveLength(1);
    expect(html.match(/data-nb="answer"/g)).toHaveLength(1);
  });

  it('handles a label alone on its line before display maths', () => {
    const html = render(['**Solution:**', '', '$$', 'x=1', '$$'].join('\n'));
    expect(html).toContain('data-nb="solution"');
    expect(html).toContain('math-display');
    // No empty paragraph left behind where the label used to be.
    expect(html).not.toContain('<p></p>');
  });

  it('keeps a leading minus in the answer', () => {
    // The separator strip must not eat the sign of a negative answer.
    expect(render('**Answer:** -3x')).toContain('-3x');
  });

  it('leaves an unrecognised bold lead-in as ordinary bold text', () => {
    const html = render('**Coefficient of $x^2$:** $\\binom{n}{2}$');
    expect(html).not.toContain('data-nb=');
    expect(html).toContain('<strong>');
  });

  it('does not treat bold containing maths as a label', () => {
    const html = render('**$x$ Answer:** something');
    expect(html).not.toContain('data-nb=');
  });

  it('ends a block at a heading', () => {
    const html = render(['**Tip:** Cancel first.', '', '## Techniques', '', 'Then this.'].join('\n'));
    const heading = html.indexOf('<h2>');
    expect(heading).toBeGreaterThan(-1);
    expect(html.indexOf('data-nb="tip"')).toBeLessThan(heading);
    expect(html.slice(heading)).toContain('Then this.');
    expect(html.slice(heading)).not.toContain('data-nb=');
  });

  it('leaves content before the first label at the top level', () => {
    const html = render(['Intro sentence.', '', '**Step 1.** Go.'].join('\n'));
    expect(html.indexOf('Intro sentence.')).toBeLessThan(html.indexOf('data-nb='));
  });

  it('recognises an italic label too', () => {
    expect(render('*Reading:* every 10 dB is 10x.')).toContain('data-nb="tip"');
  });
});

describe('hardBreaksInBlockquotes', () => {
  it('keeps one formula per line in a quoted key-facts panel', () => {
    // Verbatim shape from topic_cards / Coordinate Geometry: without this the
    // three formulas render as one run-on line.
    const html = render(
      ['> **Distance** $AB$', '> **Midpoint** $M$', '> **Gradient** $m$'].join('\n'),
    );
    expect(html.match(/<br>/g)).toHaveLength(2);
  });

  it('leaves soft wraps in ordinary prose alone', () => {
    const html = render('A sentence that\nwrapped in the source.');
    expect(html).not.toContain('<br>');
  });
});
