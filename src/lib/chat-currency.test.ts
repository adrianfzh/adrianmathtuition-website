import { describe, it, expect } from 'vitest';
import { markCurrencyDollars, CURRENCY_MARK as M } from './chat-currency';
import { formatMessage, renderToElement } from './chat-solver';
import katex from 'katex';

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

// The three answers of 3 Oct 2026 (A$-to-euro rate question, two students, same
// minute). Belle's reply to the first: "i cant see the working properly".
const BELLE_OPUS = "Reading: 16-oz bottle costs A\\$60, 500 ml bottle, €1 = A\\$1.65, 1 oz = 29.5735 ml, answer to the nearest 10 cents.\n\nYour first step is correct. $\\frac{500}{29.5735} = 16.90703$ oz, so the 500 ml bottle holds 16.90703 oz.\n\nNow use the **same rate** (price per oz), then convert currency.\n\n**Step 2: Price per oz in Australia**\n$$\\frac{60}{16} = 3.75 \\text{ A\\$ per oz}$$\n\n**Step 3: Price of the 500 ml bottle in A\\$**\n$$16.90703 \\times 3.75 = 63.40136 \\text{ A\\$}$$\n\n**Step 4: Convert to euros**\nSince €1 = A\\$1.65, you divide by 1.65 to go from A\\$ to €.\n$$\\frac{63.40136}{1.65} = 38.42506$$\nTo the nearest 10 cents, this is €38.40.\n\n**Answer: €38.40**";
const ISABELLE_OPUS = "Reading: 16-oz bottle costs A$60; €1 = A$1.65; 1 oz = 29.5735 ml; the price is for a 500 ml bottle, to the nearest 10 cents.\n\nThis is a **unit conversion and rate** problem. Your first line is correct: you converted 500 ml into ounces.\n\n**1. Volume of the French bottle in oz** (your step)\n$$\\frac{500}{29.5735} = 16.90702 \\text{ oz}$$\n\n**2. Price per oz in Australia**\n$$\\frac{\\text{A}\\$60}{16} = \\text{A}\\$3.75 \\text{ per oz}$$\n\n**3. Price of 16.90702 oz in A\\$**\n$$3.75 \\times 16.90702 = \\text{A}\\$63.40135$$\n\n**4. Convert to euros**\nSince €1 = A$1.65, divide by 1.65:\n$$\\frac{63.40135}{1.65} = €38.42506$$\n\n**5. Round to the nearest 10 cents**\n€38.42506 → €38.40\n\n**Answer: €38.40**";
const BELLE_RESEND = "No problem — here's the full working laid out clearly.\n\n**Given information:**\n- 16-oz bottle costs A\\$60 in Australia\n- Need to price a 500 ml bottle at the same rate, in euros\n- €1 = A\\$1.65\n- 1 oz = 29.5735 ml\n\n**Step 1: Convert 500 ml to oz** (so we can compare like-for-like)\n$$\\frac{500}{29.5735} = 16.907 \\text{ oz (to 3 d.p.)}$$\n\n**Step 2: Find the price per oz in Australia**\n$$\\frac{\\text{A\\$}60}{16 \\text{ oz}} = \\text{A\\$}3.75 \\text{ per oz}$$\n\n**Step 3: Find the price of the 500 ml bottle, in Australian dollars**\n$$16.907 \\times 3.75 = \\text{A\\$}63.40 \\text{ (to 2 d.p.)}$$\n\n**Step 4: Convert from Australian dollars to euros**\nSince €1 = A\\$1.65, to turn A\\$ into € you **divide by 1.65**:\n$$\\frac{63.40}{1.65} = 38.42 \\text{ (to 2 d.p.)}$$\n\n**Step 5: Round to the nearest 10 cents**\n$$38.42 \\rightarrow €38.40$$\n\n**Answer: €38.40**";

describe('an escaped \\$ never breaks a typeset block (3 Oct 2026)', () => {
  const render = (text: string) => {
    const g = globalThis as unknown as { window?: unknown };
    const had = g.window;
    g.window = { katex };
    const el = { innerHTML: '' } as unknown as HTMLDivElement;
    try { renderToElement(el, text); } finally { g.window = had; }
    return el.innerHTML;
  };
  // What the student reads, with the typeset maths taken out.
  const prose = (html: string) => html.replace(/<span class="katex[\s\S]*?<\/span>(?=<br>|$|[^<]*<br>)/g, '');

  for (const [name, answer, blocks] of [
    ['Belle, first answer (rec3aWLWv93UgVt3Q)', BELLE_OPUS, 3],
    ['Isabelle (recK5XXbrlxS338FC)', ISABELLE_OPUS, 4],
    ['Belle, the re-send (recGsvOfyCCf41z7x)', BELLE_RESEND, 5],
  ] as const) {
    it(name + ': every line of working is typeset, nothing shows as raw TeX', () => {
      const html = render(answer);
      expect(html).not.toContain('katex-error');
      expect(html).not.toContain('$$');
      expect((html.match(/class="katex-display"/g) ?? []).length).toBe(blocks);
      // No TeX command survives outside the typeset spans' own annotations.
      const visible = html.replace(/<annotation[\s\S]*?<\/annotation>/g, '');
      expect(visible).not.toMatch(/\\(?:frac|text|times)/);
      expect(visible).not.toContain('\\$');
    });
  }

  it('prose keeps its prices as plain text ("A$60", "A$1.65", "in A$")', () => {
    const html = render(BELLE_OPUS);
    expect(html).toContain('costs A$60, 500 ml bottle, €1 = A$1.65,');
    expect(html).toContain('bottle in A$</strong>');
    expect(html).toContain('to go from A$ to €.');
  });

  it('a restored answer: \\$ stays escaped inside maths, becomes a price span in prose', () => {
    const html = formatMessage(ISABELLE_OPUS);
    expect(html).toContain('$$\\frac{\\text{A}\\$60}{16} = \\text{A}\\$3.75 \\text{ per oz}$$');
    expect(html).toContain('oz in A<span class="cur">$</span></strong>');
    expect(html).not.toContain('\uE003');
  });

  it('answers with no escaped dollar are untouched by the mask', () => {
    const plain = 'Alice paid $400 for $x$ packs.\n$$x^{2} = 4$$';
    expect(render(plain)).toContain('Alice paid $400 for ');
    expect((render(plain).match(/class="katex-display"/g) ?? []).length).toBe(1);
  });
});
