import { describe, it, expect } from 'vitest';
import { splitQuote, quoteOfBeat, quoteIsShort } from './question-quote';

const Q = 'The constants $p$ and $q$ are non-zero. Expand $\\left(px^2 + \\frac{q}{x}\\right)^6$ as far as its third term, starting with the highest power of $x$ and simplifying each term.';

describe('splitQuote — the piece of the question the voice is on', () => {
  it('cuts around an exact piece with whole maths', () => {
    const s = splitQuote(Q, 'Expand $\\left(px^2 + \\frac{q}{x}\\right)^6$');
    expect(s?.part).toBe('Expand $\\left(px^2 + \\frac{q}{x}\\right)^6$');
    expect(s!.before + s!.part + s!.after).toBe(Q);
  });
  it('matches across a different run of spaces', () => {
    expect(splitQuote(Q, 'as far as   its third term')?.part).toBe('as far as its third term');
  });
  it('refuses a piece that would cut a $…$ span in half', () => {
    expect(splitQuote(Q, 'px^2 + \\frac{q}{x}')).toBeNull();
  });
  it('refuses a piece that is not in the question, or nothing', () => {
    expect(splitQuote(Q, 'the lowest power')).toBeNull();
    expect(splitQuote(Q, '')).toBeNull();
    expect(splitQuote(Q, null)).toBeNull();
  });
});

describe('quoteOfBeat', () => {
  it('reads the quote of the beat on screen only', () => {
    const beats = [{ do: [{ do: 'quote', text: 'Expand' }] }, { do: [{ do: 'write' }] }];
    expect(quoteOfBeat(beats, 0)).toBe('Expand');
    expect(quoteOfBeat(beats, 1)).toBeNull();
    expect(quoteOfBeat(undefined, 0)).toBeNull();
  });
  it('two pieces read in one beat each light at their own words (5 Nov 2026)', () => {
    // "find k": "ten plus k x …" then "the coefficient of x cubed" — the second never lit before.
    const beats = [{ do: [{ do: 'quote', text: 'A' }, { do: 'write' }, { do: 'quote', text: 'B' }] }];
    expect(quoteOfBeat(beats, 0, 0)).toBeNull();   // the voice has not reached it: nothing lit yet
    expect(quoteOfBeat(beats, 0, 1)).toBe('A');
    expect(quoteOfBeat(beats, 0, 2)).toBe('A');
    expect(quoteOfBeat(beats, 0, 3)).toBe('B');
    expect(quoteOfBeat(beats, 0, 9)).toBe('B');
  });
});

describe('quoteIsShort — which pieces jump out', () => {
  it('an expression or a short phrase jumps out; a long sentence only lights', () => {
    expect(quoteIsShort('$\\left(px^2 + \\frac{q}{x}\\right)^6$')).toBe(true);
    expect(quoteIsShort('as far as its third term')).toBe(true);
    expect(quoteIsShort('as far as its third term, starting with the highest power of $x$ and simplifying each term')).toBe(false);
  });
});

describe('splitQuote — a piece of a longer maths span (5 Nov 2026)', () => {
  const Q = 'Given that $(1-2x)^n = 1 + bx + 112x^2 + \\dots$, find the value of $n$ and of $b$.';
  it('lights the bracket alone', () => {
    const c = splitQuote(Q, '$(1-2x)^n$')!;
    expect(c.part).toBe('$(1-2x)^n$');
    expect(c.before).toBe('Given that ');
    expect(c.after).toBe('$ = 1 + bx + 112x^2 + \\dots$, find the value of $n$ and of $b$.');
  });
  it('lights the expansion alone', () => {
    const c = splitQuote(Q, '$1 + bx + 112x^2 + \\dots$')!;
    expect(c.before).toBe('Given that $(1-2x)^n = $');
    expect(c.part).toBe('$1 + bx + 112x^2 + \\dots$');
    expect(c.after).toBe(', find the value of $n$ and of $b$.');
  });
  it('never cuts through braces or a \\left … \\right pair', () => {
    expect(splitQuote('Find $\\left(2x+1\\right)^5$ now.', '$2x+1$')).toBeNull();
    expect(splitQuote('Find $\\frac{1}{2x}$ now.', '$2x$')).toBeNull();
  });
});
