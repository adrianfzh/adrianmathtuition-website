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
  it('prose caught between two currency signs is NOT math', () => {
    expect(looksLikeMath('x. In addition, they ordered some dishes from the menu at ')).toBe(false);
    expect(looksLikeMath('96. All dishes from the a la carte menu would be entitled to ')).toBe(false);
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
