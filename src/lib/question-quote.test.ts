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
});

describe('quoteIsShort — which pieces jump out', () => {
  it('an expression or a short phrase jumps out; a long sentence only lights', () => {
    expect(quoteIsShort('$\\left(px^2 + \\frac{q}{x}\\right)^6$')).toBe(true);
    expect(quoteIsShort('as far as its third term')).toBe(true);
    expect(quoteIsShort('as far as its third term, starting with the highest power of $x$ and simplifying each term')).toBe(false);
  });
});
