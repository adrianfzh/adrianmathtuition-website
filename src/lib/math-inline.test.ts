import { describe, expect, it } from 'vitest';
import { escapeHtml, looksLikeMath, mathHtml } from './math-inline';

describe('looksLikeMath', () => {
  it('TeX commands and structure are math', () => {
    expect(looksLikeMath('\\overrightarrow{SQ}=\\tfrac{5}{3}\\overrightarrow{OS}')).toBe(true);
    expect(looksLikeMath('x^2-20x-a')).toBe(true);
  });
  it('short equations are math', () => {
    expect(looksLikeMath('x = 138')).toBe(true);
    expect(looksLikeMath('OS:OQ=3:8')).toBe(true);
  });
  it('bare symbols are math', () => {
    expect(looksLikeMath('x')).toBe(true);
    expect(looksLikeMath('96')).toBe(true);
  });
  it('numeric coordinates are math (the stationary-point answer case)', () => {
    expect(looksLikeMath('(1, 6)')).toBe(true);
    expect(looksLikeMath('(-1.5, 2)')).toBe(true);
    expect(looksLikeMath('5, ')).toBe(false); // numeric span between prices: "$5, $6"
  });
  it('bare numeric lists are math (the "$2, 3$" study-note leak, Kayla 2026-08-29)', () => {
    expect(looksLikeMath('2, 3')).toBe(true);
    expect(looksLikeMath('1.5, 2, 3')).toBe(true);
    expect(looksLikeMath('-1, 4')).toBe(true);
    expect(looksLikeMath('5, ')).toBe(false);   // still the between-prices span
  });
  it('spaced-minus expressions are math (the "$e - 2$" kinematics leak)', () => {
    expect(looksLikeMath('e - 2')).toBe(true);
    expect(looksLikeMath('20 - 11.472')).toBe(true);
    expect(looksLikeMath('x − 4')).toBe(true);        // unicode minus
    expect(looksLikeMath('5 - ')).toBe(false);        // "$5 - $10" between prices
    expect(looksLikeMath('one-off fee at just ')).toBe(false);
  });
  it('prose caught between two currency signs is NOT math', () => {
    expect(looksLikeMath('x. In addition, they ordered some dishes from the menu at ')).toBe(false);
    expect(looksLikeMath('96. All dishes from the a la carte menu would be entitled to ')).toBe(false);
  });
  it('two+ function words = sentence, even with an operator (subgroups #416/#509)', () => {
    expect(looksLikeMath('8.50/2 and y baskets at ')).toBe(false);
    expect(looksLikeMath('3360 to UK pounds at the rate £1 = S')).toBe(false);
    expect(looksLikeMath(' is the concentration (gram/litre) of ')).toBe(false);
  });
  it('uppercase geometry labels are NOT function words', () => {
    expect(looksLikeMath('OF = OF')).toBe(true);   // common side in congruence proofs
    expect(looksLikeMath('= (AT + TB)(AT)')).toBe(true);
  });
});

describe('mathHtml', () => {
  it('renders a TeX span via KaTeX and escapes the rest', () => {
    const out = mathHtml('You wrote $\\tfrac{3}{5}$ but <b>should</b> not');
    expect(out).toContain('katex');
    expect(out).toContain('&lt;b&gt;should&lt;/b&gt;');
    expect(out).not.toContain('\\tfrac');
  });
  it('leaves currency prose untouched (dollar signs preserved as text)', () => {
    const s = 'a set meal at $96. They also ordered from the à-la-carte menu at $x per dish later.';
    const out = mathHtml(s);
    expect(out).toContain('$96');
    // Nothing between the two $ was typeset as math.
    expect(out).not.toContain('katex');
  });
  it('mixed: math span renders, currency span stays literal', () => {
    const out = mathHtml('Since $x = 138$ the bill was $138 exactly, and the meal cost was fixed then.');
    expect(out).toContain('katex');
    expect(out).toContain('$138 exactly');
  });
  it('plain text passes through escaped only', () => {
    expect(mathHtml('no math here')).toBe('no math here');
    expect(escapeHtml('a<b & c>d')).toBe('a&lt;b &amp; c&gt;d');
  });
});

describe('mathHtml — two prices pairing with each other (2026-08-28 sweep)', () => {
  // The paired span between two currency amounts must stay literal even when it
  // slips past looksLikeMath. All strings below are verbatim from live rows.
  it('marker price comparison stays literal ("$24 < $32")', () => {
    const out = mathHtml('p = 12, q = 5; choose two 7-day SIM cards ($24 < $32)');
    expect(out).toContain('$24 &lt; $32');
    expect(out).not.toContain('katex');
  });
  it('marker working with two prices stays literal ("2 × $12 = $24")', () => {
    const out = mathHtml('write 2 × $12 = $24 and compare with the $32 12-day card.');
    expect(out).toContain('$12 = $24');
    expect(out).not.toContain('katex');
  });
  it('subgroups #416: currency prose keeps both prices readable', () => {
    const out = mathHtml(
      'expression for total cost of x cushions at $8.50/2 and y baskets at $12 each.',
    );
    expect(out).toContain('$8.50/2 and y baskets at $12 each');
    expect(out).not.toContain('katex');
  });
  it('subgroups #509: S$ conversion sentence stays literal', () => {
    const out = mathHtml('change S$3360 to UK pounds at the rate £1 = S$1.68.');
    expect(out).toContain('S$3360 to UK pounds');
    expect(out).toContain('S$1.68');
    expect(out).not.toContain('katex');
  });
  it('collision wins even when the inner passes the TeX-structure test (^)', () => {
    const out = mathHtml('(a) 177%; (b) $258.25; (ci) 1.22 × 10^10; (cii) $180');
    expect(out).not.toContain('katex');
  });
  it('bold heading sandwiched between $$ display blocks stays literal', () => {
    const out = mathHtml('$$x^2$$ **Area of the segment:** $$y^2$$');
    expect(out).toContain('**Area of the segment:**');
  });
  // …while authored TeX that merely LOOKS price-adjacent still renders:
  it('digit-open span whose closing $ is NOT followed by a digit renders', () => {
    const out = mathHtml('April: SGD $1 = $ JPY $114.5$; profit follows.');
    expect(out).toContain('katex');
    expect(out).not.toContain('$1 = $');
  });
  it('currency-code-prefixed TeX amounts render ("RM$3000$")', () => {
    const out = mathHtml('If Andy bought RM$3000$, calculate the amount he paid.');
    expect(out).toContain('katex');
    expect(out).not.toContain('$3000$');
  });
  it('trailing-space TeX before a word renders ("$5 < 15 = $ radius")', () => {
    const out = mathHtml('Since $5 < 15 = $ radius$^{2}$, the point lies inside.');
    expect(out).toContain('katex');
  });
});


describe('mathHtml — escaped currency dollars', () => {
  // Sub-group descriptions are TeX-authored and write currency as "\\$75"
  // (2026-08-29 vetting pass) — the backslash must never leak to the page
  // and the literal dollar must never open a math span.
  it('renders \\$ as a plain dollar in prose', () => {
    expect(mathHtml('this year’s \\$75 680 is 3.5% higher')).toContain('$75 680');
    expect(mathHtml('costs \\$5')).not.toContain('\\');
  });

  it('never pairs a literal dollar with a math delimiter', () => {
    const out = mathHtml('S\\$ prices differ; solve $x + 1 = 2$ first');
    expect(out).toContain('S$ prices differ');
    expect(out).toContain('katex'); // the real math span still renders
  });

  it('leaves no mask sentinel behind in any path', () => {
    for (const s of ['\\$5 and $x^2$', 'plain', '$\\$3 + \\$4$']) {
      expect(mathHtml(s)).not.toContain('\u0000');
    }
  });
});
