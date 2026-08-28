import { describe, it, expect } from 'vitest';
import { fixMathFences, katexOptions } from './math-markdown';

// remark-math v6 only treats `$$` as display math when the delimiters sit on
// their own line. The authored content in `content_snippets` does not, so
// fixMathFences bridges the two. When this breaks, cards render literal "$$".

describe('fixMathFences', () => {
  it('breaks a line after an opening $$ that hugs its math', () => {
    expect(fixMathFences('$$x^2$$')).toBe('$$\nx^2\n$$');
  });

  it('handles the authored \\begin{aligned} shape from the DB', () => {
    const src = '$$\\begin{aligned} a &= b \\end{aligned}$$';
    expect(fixMathFences(src)).toBe('$$\n\\begin{aligned} a &= b \\end{aligned}\n$$');
  });

  it('splits display math that is glued to surrounding prose', () => {
    expect(fixMathFences('The result is$$y=mx+c$$here')).toBe(
      'The result is\n$$\ny=mx+c\n$$\nhere',
    );
  });

  it('leaves already-fenced display math untouched', () => {
    const src = '$$\nx^2 + y^2 = r^2\n$$';
    expect(fixMathFences(src)).toBe(src);
  });

  it('leaves single-$ inline math alone', () => {
    const src = 'Let $x = 3$ and $y = 4$.';
    expect(fixMathFences(src)).toBe(src);
  });

  it('is idempotent — re-running never adds more newlines', () => {
    const src = 'Solve:$$\\frac{a}{b}$$done';
    const once = fixMathFences(src);
    expect(fixMathFences(once)).toBe(once);
  });

  it('fixes every occurrence, not just the first', () => {
    expect(fixMathFences('$$a$$then$$b$$')).toBe('$$\na\n$$\nthen\n$$\nb\n$$');
  });

  // Space-PADDED delimiters fence too (was a documented limit until Adrian's
  // 2026-08-29 phone review: a practice stem authored as "$$ 5^{x} = … $$"
  // rendered as raw dollars — only hugging delimiters were being caught).
  it('fences space-padded delimiters, eating the padding', () => {
    expect(fixMathFences('the equations $$ 5^{x} = 4\\sqrt{2^{3y}}. $$ [4]')).toBe(
      'the equations\n$$\n5^{x} = 4\\sqrt{2^{3y}}.\n$$\n[4]',
    );
    expect(fixMathFences('$$a$$ then $$b$$')).toBe('$$\na\n$$\nthen\n$$\nb\n$$');
  });

  it('stays idempotent on the padded form as well', () => {
    const once = fixMathFences('prose $$ x+1 $$ more');
    expect(fixMathFences(once)).toBe(once);
  });

  it('passes plain prose through unchanged', () => {
    const src = 'No math here at all.';
    expect(fixMathFences(src)).toBe(src);
  });
});

describe('katexOptions', () => {
  // Authored content contains \tfrac and raw HTML; strict/throwing KaTeX would
  // blank out whole cards on a single bad expression.
  it('never throws on malformed input', () => {
    expect(katexOptions.throwOnError).toBe(false);
    expect(katexOptions.strict).toBe(false);
  });

  it('keeps the \\tfrac macro the content relies on', () => {
    expect(katexOptions.macros['\\tfrac']).toBe('\\frac');
  });

  it('emits MathML alongside HTML for accessibility', () => {
    expect(katexOptions.output).toBe('htmlAndMathml');
  });
});
