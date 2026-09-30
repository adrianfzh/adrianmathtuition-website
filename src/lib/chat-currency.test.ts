import { describe, it, expect } from 'vitest';
import { markCurrencyDollars, CURRENCY_MARK as M } from './chat-currency';
import { formatMessage } from './chat-solver';

// The chat renderer's own inline pairing, applied to the scan's output: which
// spans would KaTeX typeset?
const typeset = (t: string) =>
  [...t.replace(/\$\$[\s\S]*?\$\$/g, '').matchAll(/(?<!\$)\$([^$]{1,2000}?)\$(?!\$)/g)].map(m => m[1]);

describe('markCurrencyDollars — a price never pairs with a maths $', () => {
  it("Isabelle's answer (rec5lDlsiSVTqO64a, 27 Sep 2026): only the real maths is typeset", () => {
    const answer = 'Reading: Alice paid $400 for $x$ packs, gave away 50 packs, and made a profit of $1.30 on each pack sold. Total sales were $2925. Part (a) asks you to show $13x^{2} - 25900x - 200000 = 0$.\n\n1. **Cost price of one pack.** Write it in terms of $x$, using the $400 she paid for $x$ packs.\n2. The $1.30 is profit, not the selling price.';
    const out = markCurrencyDollars(answer);
    expect(typeset(out)).toEqual(['x', '13x^{2} - 25900x - 200000 = 0', 'x', 'x']);
    expect(out).toContain(`${M}400 for `);
    expect(out).toContain(`${M}1.30 on each`);
    expect(out).toContain(`${M}2925.`);
  });

  it('prices with no maths at all stay prices', () => {
    const out = markCurrencyDollars('the $400 she paid for x packs, the $1.30 profit, total sales ($2925).');
    expect(typeset(out)).toEqual([]);
  });

  it('colliding prices ("$24 < $32") are prices, not the maths "24 <"', () => {
    expect(typeset(markCurrencyDollars('Shop A charges $24 < $32 at Shop B.'))).toEqual([]);
  });

  it('maths that starts with a digit is still maths', () => {
    for (const m of ['$5$', '$60 + 72 = 132$', '$2925 \\text{ dollars}$', '$13x^{2} = 0$', '$0.5$'])
      expect(typeset(markCurrencyDollars(`so ${m} here`))).toEqual([m.slice(1, -1)]);
  });

  it('maths that does not start with a digit is never touched', () => {
    const t = 'Let $x$ be the cost and $\\frac{400}{x} + 1.3$ the price.';
    expect(markCurrencyDollars(t)).toBe(t);
  });

  it('display blocks are skipped whole', () => {
    const t = 'Cost $400.\n$$\\frac{400}{x} + 1.3 = y$$\nThen $x = 5$.';
    const out = markCurrencyDollars(t);
    expect(out).toContain('$$\\frac{400}{x} + 1.3 = y$$');
    expect(typeset(out)).toEqual(['x = 5']);
  });

  it('a thin-spaced amount is a price too (web answer 1054, 16 Sep 2026)', () => {
    const t = '**Answer: $512\\,210 (nearest dollar), or $512\\,000 (3 s.f.)**\n\nKeep the full value of $(1.021)^4$ in your calculator.';
    expect(typeset(markCurrencyDollars(t))).toEqual(['(1.021)^4']);
  });

  it('an unpaired $ is left alone', () => {
    expect(markCurrencyDollars('It costs $5.')).toBe('It costs $5.');
  });

  it('ratios, long sums and coefficients stay maths (the July–Sep sweep)', () => {
    for (const m of ['$2 : 3$', '$1 : n^2$', '$6 : 1$', '$5(36) + 4(40) + 2(68) = 180 + 160 + 136 = 476$',
      '$8a - 5b - 3(2a+3b) = 8a - 5b - 6a - 9b = 2a - 14b$', '$271 \\times 0.45 = 121.95$', '$60 mins$', '$3 ABC$'])
      expect(typeset(markCurrencyDollars(`and ${m} then $x$.`))).toEqual([m.slice(1, -1), 'x']);
  });
});

describe('formatMessage — a restored answer keeps its prices as text', () => {
  it('a price $ becomes its own span, the maths $ pairs intact', () => {
    const html = formatMessage('Alice paid $400 for $x$ packs.');
    expect(html).toBe('Alice paid <span class="cur">$</span>400 for $x$ packs.');
  });
});
