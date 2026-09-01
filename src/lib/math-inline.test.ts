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


describe('mathHtml — sub-group description span shapes (2026-09-02 EM/S1/S2 TeX pass)', () => {
  // Every shape below is verbatim from a rewritten `subgroups.description`.
  // The /notes topic folds, sub-group ledes and CardLink rows all pass those
  // strings through mathHtml; if looksLikeMath ever rejects one of these, the
  // student sees raw "$…$" again. One assertion per shape, so a regression
  // names the exact row family that broke.
  const shapes: [string, string][] = [
    ['subscript sequence term (#751)', 'find the linear nth-term $T_n = an + b$'],
    ['consecutive-term difference (#754)', 'Compute $T_{n+1} - T_n$ (or sum/product of consecutive terms)'],
    ['ratio with no operator, no spaces (#969)', 'express the scale in the form $1:n$ by reducing'],
    ['symbolic ratio chain (#1490)', 'Example: $a:b = 5:6$ and $b:c = 9:4$ → $a:b:c = 15:18:8$.'],
    ['side equation with unit outside (#489)', 'with $AB = 6.8$ cm, $BC = 8.5$ cm, $AC = 7.5$ cm.'],
    ['degree sign inside a span (#428)', 'angles $79°$, $(2x+6)°$, $120°$, $82°$, $(3x-47)°$ — find $x$.'],
    ['angle-sum formula with cdot (#426)', 'interior angle $= (n-2) \\cdot 180°/n$ and exterior angle $= 360°/n$'],
    ['set expression with primes (#766)', 'shade a given expression like $(A \\cup B\')\'$ on the diagram'],
    ['braced set literal (#767)', 'giving $\\{4, 8, 10, 14\\}$.'],
    ['symbol list, one span each (#769)', 'symbols ($\\in$, $\\notin$, $\\subset$, $\\subseteq$, $\\not\\subset$, $\\varnothing$).'],
    ['function name via \\text (#993)', 'relations like $\\text{LCM}(A, B) = \\dots$, $A \\mid B$, or $B/A$ = constant.'],
    ['probability with \\text words (#835)', 'find $P(\\text{both} > 360\\text{ g})$.'],
    ['numeric product run (#988)', 'e.g. $2250 = 2 \\times 3^2 \\times 5^3$ or $1400 = 2^3 \\times 5^2 \\times 7$.'],
    ['tfrac area formula (#1143)', 'formulas $s = r\\theta$ and $A = \\tfrac{1}{2}r^2\\theta$.'],
    ['mixed number (#932)', 'express $1\\tfrac{2}{3}$ kg : 450 g : 300 g in simplest form.'],
    ['trig equation with inequality range (#1142)', 'Example: $3 \\sin x = 1$ in $0° \\le x \\le 180°$;'],
    ['plus-minus rational exponents (#1093)', 'a fraction such as $\\pm 1/2$, $\\pm 1/3$, $\\pm 2/3$'],
    ['caret standard form (#949)', 'or "$(5.87 \\times 10^6) / (3.94 \\times 10^{-2})$."'],
    ['named angles (#898)', 'find $\\angle AOB$, $\\angle DAB$, $\\angle ATB$.'],
    ['parallel segments (#393)', 'Example: $PQ \\parallel RS$ with two zig-zag angles'],
    ['telescoping sum (#755)', '$T_n = \\tfrac{1}{2}(1/n - 1/(n+1))$ → $\\Sigma T_k$ telescopes'],
  ];
  for (const [label, s] of shapes) {
    it(`renders every span: ${label}`, () => {
      const spans = (s.match(/\$[^$]+\$/g) ?? []).length;
      const out = mathHtml(s);
      expect((out.match(/class="katex"/g) ?? []).length).toBe(spans);
      expect(out).not.toContain('$'); // nothing left unrendered
    });
  }

  it('escaped currency beside a real ratio span stays a dollar (#421)', () => {
    const out = mathHtml('share \\$680 in $p:(2p-1):(2p+1)$; sweets in $3:x:5$ with $C = A + 32$, find $x$.');
    expect(out).toContain('$680 in ');
    expect((out.match(/class="katex"/g) ?? []).length).toBe(4);
  });

  it('escaped currency inside a quoted example keeps the formula span (#1013)', () => {
    const out = mathHtml("Apply compound interest $A = P(1 + r/n)^{nt}$ at any frequency. Example: '\\$5000 at 4% per annum'");
    expect(out).toContain('katex');
    expect(out).toContain("'$5000 at 4%");
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
