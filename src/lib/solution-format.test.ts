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
  it('hoists a short "label:" prefix out of a math line', () => {
    const out = formatSolution('General term: $T_{r+1} = 2^r$\n$r = 3$');
    expect(out).toBe('General term:\n\n$$\n\\begin{aligned}\nT_{r+1} &= 2^r \\\\\nr &= 3\n\\end{aligned}\n$$');
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
