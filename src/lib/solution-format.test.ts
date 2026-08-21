import { describe, it, expect } from 'vitest';
import { normalizeMathDelimiters, alignedRows, formatSolution } from './solution-format';

describe('normalizeMathDelimiters', () => {
  it('rewrites \\( … \\) to inline dollars', () => {
    expect(normalizeMathDelimiters('Expand \\(\\left(x^3 - \\frac{3}{x^2}\\right)^{10}\\) fully.'))
      .toBe('Expand $\\left(x^3 - \\frac{3}{x^2}\\right)^{10}$ fully.');
  });
  it('rewrites \\[ … \\] to a block on its own paragraph', () => {
    expect(normalizeMathDelimiters('Hence \\[ x = 2 \\] as required.'))
      .toBe('Hence \n\n$$\nx = 2\n$$\n\n as required.');
  });
  it('leaves KaTeX line breaks \\\\[2pt] and escaped \\\\( alone', () => {
    const src = '$a \\\\[2pt] b$ and \\\\(not math\\\\)';
    expect(normalizeMathDelimiters(src)).toBe(src);
  });
  it('leaves dollar math untouched', () => {
    expect(normalizeMathDelimiters('$\\frac{1}{2}$')).toBe('$\\frac{1}{2}$');
  });
});

describe('alignedRows', () => {
  it('aligns a single equation on its =', () => {
    expect(alignedRows('T_{r+1} = \\binom{10}{r} (x^3)^{10-r} \\left(-\\frac{3}{x^2}\\right)^r'))
      .toEqual(['T_{r+1} &= \\binom{10}{r} (x^3)^{10-r} \\left(-\\frac{3}{x^2}\\right)^r']);
  });
  it('breaks a = chain into continuation rows', () => {
    expect(alignedRows('a = b + c = d')).toEqual(['a &= b + c', '&= d']);
  });
  it('never splits on = inside braces or parentheses', () => {
    expect(alignedRows('\\sum_{r=1}^{n} (k=2) = 3')).toEqual(['\\sum_{r=1}^{n} (k=2) &= 3']);
  });
  it('ignores escaped braces when tracking depth', () => {
    expect(alignedRows('\\{ x = 1 \\} = S')).toEqual(['\\{ x = 1 \\} &= S']);
  });
  it('splits ⇒ chains into arrow-prefixed rows', () => {
    expect(alignedRows('30 - 5r = 5 \\Rightarrow 5r = 25 \\Rightarrow r = 5'))
      .toEqual(['30 - 5r &= 5', '\\Rightarrow 5r &= 25', '\\Rightarrow r &= 5']);
  });
  it('does not chain-split when another relation or comma is present', () => {
    expect(alignedRows('x = 1, y = 2')).toEqual(['x &= 1, y = 2']);
    expect(alignedRows('0 < a = b = c')).toEqual(['0 < a &= b = c']);
  });
  it('handles a line with no = at all', () => {
    expect(alignedRows('\\therefore x > 3')).toEqual(['&\\therefore x > 3']);
  });
  it('keeps a space between a command and a following letter', () => {
    expect(alignedRows('\\sin x = \\cos x')).toEqual(['\\sin x &= \\cos x']);
  });
});

describe('formatSolution', () => {
  it('groups consecutive pure-math lines into one aligned block', () => {
    const out = formatSolution('$T_{r+1} = \\binom{10}{r} x^{30-5r}$\n$30 - 5r = 0$\n$r = 6$');
    expect(out).toBe(
      '$$\n\\begin{aligned}\nT_{r+1} &= \\binom{10}{r} x^{30-5r} \\\\\n30 - 5r &= 0 \\\\\nr &= 6\n\\end{aligned}\n$$',
    );
  });
  it('puts text lines in their own paragraphs and restarts alignment after them', () => {
    const out = formatSolution('$a = 1$\nFor the constant term, the power of $x$ is zero.\n$b = 2$');
    expect(out.split('\n\n')).toEqual([
      '$$\n\\begin{aligned}\na &= 1\n\\end{aligned}\n$$',
      'For the constant term, the power of $x$ is zero.',
      '$$\n\\begin{aligned}\nb &= 2\n\\end{aligned}\n$$',
    ]);
  });
  it('keeps a short "label:" lead-in inside the aligned block as \\text{}', () => {
    const out = formatSolution('General term: $T_{r+1} = 2^r$\n$r = 3$');
    expect(out).toBe('$$\n\\begin{aligned}\n\\text{General term: } T_{r+1} &= 2^r \\\\\nr &= 3\n\\end{aligned}\n$$');
  });
  it('keeps a short no-colon lead-in ("Then", "Coefficient of") on its equation', () => {
    const out = formatSolution('Then $a = \\frac{5}{10} = \\frac12$.\nCoefficient of $x^2 = 2 \\cdot 3 = 6$.');
    expect(out).toBe(
      '$$\n\\begin{aligned}\n\\text{Then } a &= \\frac{5}{10} \\\\\n&= \\frac12 \\\\\n\\text{Coefficient of } x^2 &= 2 \\cdot 3 \\\\\n&= 6\n\\end{aligned}\n$$',
    );
  });
  it('embeds a short label carrying inline math; hoists a long one into its own paragraph', () => {
    expect(formatSolution('Coefficient of $x$: $\\binom{n}{1}a = na = 5$.')).toBe(
      '$$\n\\begin{aligned}\n\\text{Coefficient of $x$: } \\binom{n}{1}a &= na \\\\\n&= 5\n\\end{aligned}\n$$',
    );
    expect(formatSolution('Perpendicular distance from Q to the line OP: $d = 3$').split('\n\n')).toEqual([
      'Perpendicular distance from Q to the line OP:',
      '$$\n\\begin{aligned}\nd &= 3\n\\end{aligned}\n$$',
    ]);
  });
  it('moves a trailing = in the lead-in into the equation', () => {
    expect(formatSolution('Constant term = $3 \\times 1 = 3$.\nCoefficient of $x^2$ = $3(4) + 4(-4) = -4$.')).toBe(
      '$$\n\\begin{aligned}\n\\text{Constant term } &= 3 \\times 1 \\\\\n&= 3 \\\\\n\\text{Coefficient of $x^2$ } &= 3(4) + 4(-4) \\\\\n&= -4\n\\end{aligned}\n$$',
    );
  });
  it('treats a line starting with a bare = as a continuation row', () => {
    expect(formatSolution('$(1+x)^2$\n= $1 + 2x + x^2 = x^2 + 2x + 1$')).toBe(
      '$$\n(1+x)^2\n$$\n\n$$\n\\begin{aligned}\n&= 1 + 2x + x^2 \\\\\n&= x^2 + 2x + 1\n\\end{aligned}\n$$',
    );
  });
  it('drops a full stop closed inside the math but keeps \\ldots', () => {
    expect(formatSolution('$r = 3.$\n$S = 1 + x + \\ldots$')).toBe(
      '$$\n\\begin{aligned}\nr &= 3 \\\\\nS &= 1 + x + \\ldots\n\\end{aligned}\n$$',
    );
  });
  it('leaves a lead-in + math with no = as a plain sentence', () => {
    expect(formatSolution('Hence $x > 3$.')).toBe('Hence $x > 3$.');
  });
  it('does not treat inline math before a no-colon lead-in as a label', () => {
    expect(formatSolution('Since $u = 2^x > 0$, $u = 4$.')).toBe('Since $u = 2^x > 0$, $u = 4$.');
  });
  it('accepts \\( … \\) source lines and trailing punctuation', () => {
    const out = formatSolution('\\(x = 2\\).\n\\(y = 3\\),');
    expect(out).toBe('$$\n\\begin{aligned}\nx &= 2 \\\\\ny &= 3\n\\end{aligned}\n$$');
  });
  it('passes image lines through untouched', () => {
    const out = formatSolution('$a = 1$\n{{IMG:abc}}\n$b = 2$');
    expect(out.split('\n\n')[1]).toBe('{{IMG:abc}}');
  });
  it('drops blank lines and handles empty input', () => {
    expect(formatSolution('')).toBe('');
    expect(formatSolution(null)).toBe('');
    expect(formatSolution('\n\n$x = 1$\n\n')).toBe('$$\n\\begin{aligned}\nx &= 1\n\\end{aligned}\n$$');
  });
  it('gives a math line with no = its own flush-left display line', () => {
    const out = formatSolution('$y = 5(0) - 7$\n$\\therefore P(0, -7)$\n$x = 1$');
    expect(out.split('\n\n')).toEqual([
      '$$\n\\begin{aligned}\ny &= 5(0) - 7\n\\end{aligned}\n$$',
      '$$\n\\therefore P(0, -7)\n$$',
      '$$\n\\begin{aligned}\nx &= 1\n\\end{aligned}\n$$',
    ]);
  });
  it('keeps \\[ … \\] on one line inside a solution so per-line splitting survives', () => {
    const out = formatSolution('Hence\n\\[ x = 2 \\]\n$y = 3$');
    expect(out).toBe('Hence\n\n$$\n\\begin{aligned}\nx &= 2 \\\\\ny &= 3\n\\end{aligned}\n$$');
  });
  it('treats a line with two separate math runs as text, not aligned math', () => {
    const out = formatSolution('$x = 2$ or $x = -3$');
    expect(out).toBe('$x = 2$ or $x = -3$');
  });
});
