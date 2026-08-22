import { describe, it, expect } from 'vitest';
import { prepareMath, DOLLAR_MACRO } from './math-prep';

// Regression for the "\18,000 .MrLimmadeadownpaymentof" rendering (2026-08-23):
// remark-math does not honour `\$` inside `$…$`, so a LaTeX-escaped dollar
// amount closed the span early and flipped the rest of the sentence into math.

describe('prepareMath', () => {
  it('swaps \\$ inside inline math for the KaTeX macro', () => {
    expect(prepareMath('is $\\$18\\,000$. Mr Lim')).toBe(`is $${DOLLAR_MACRO}{}18\\,000$. Mr Lim`);
  });

  it('leaves \\$ outside math alone (CommonMark escape → literal $)', () => {
    expect(prepareMath('costs \\$5 each')).toBe('costs \\$5 each');
  });

  it('handles \\$ inside \\text{} inside a $$ array', () => {
    const src = '$$\\begin{array}{|l|c|} \\hline \\text{Flag} & \\$3.20 \\\\ \\hline \\end{array}$$';
    expect(prepareMath(src)).toBe(`$$\\begin{array}{|l|c|} \\hline \\text{Flag} & ${DOLLAR_MACRO}{}3.20 \\\\ \\hline \\end{array}$$`);
  });

  it('a \\$ never opens or closes a span, so later $ pairs stay paired', () => {
    const src = 'A \\$ sign, then $x^2$ and $y$.';
    expect(prepareMath(src)).toBe(src);
  });

  it('treats \\\\ as one escape pair so \\\\$ is a row break + delimiter', () => {
    expect(prepareMath('$a \\\\$ text')).toBe('$a \\\\$ text');
  });

  it('rewrites \\textbf / \\textit outside math to markdown', () => {
    expect(prepareMath('\\textbf{Option 1}: flag down. \\textit{Note} $\\textbf{x}$'))
      .toBe('**Option 1**: flag down. *Note* $\\textbf{x}$');
  });

  it('handles \\$ inside a \\textbf group outside math', () => {
    expect(prepareMath('\\textbf{Cost \\$5}')).toBe('**Cost \\$5**');
  });

  it('leaves an unclosed \\textbf{ as-is', () => {
    expect(prepareMath('\\textbf{oops')).toBe('\\textbf{oops');
  });

  it('is idempotent', () => {
    const once = prepareMath('is $\\$18\\,000$ and \\textbf{b}');
    expect(prepareMath(once)).toBe(once);
  });

  it('is a no-op on strings without a backslash', () => {
    const s = 'Let $x = 3$ and $$y = 4$$.';
    expect(prepareMath(s)).toBe(s);
  });
});
