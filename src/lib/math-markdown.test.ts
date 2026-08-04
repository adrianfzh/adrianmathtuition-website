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

  // Documents a deliberate limit of the production behaviour: only delimiters
  // GLUED to non-whitespace get a line break. `$$ then $$` keeps its spaces, so
  // the inner delimiters stay on the prose line. Left as-is — this is the
  // long-standing /revise behaviour and the authored content does not hit it.
  it('leaves space-separated delimiters on the prose line', () => {
    expect(fixMathFences('$$a$$ then $$b$$')).toBe('$$\na\n$$ then $$\nb\n$$');
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
