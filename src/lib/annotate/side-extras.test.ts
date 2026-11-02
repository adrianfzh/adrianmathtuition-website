import { describe, it, expect } from 'vitest';
import { fullScheme, stripCodes, sameApartFromCodes, hasOwnCodes, solutionTexts, applyExtras } from './side-extras';
import type { SolutionsItem } from '@/lib/render-solutions-pdf';

const item = (over: Partial<SolutionsItem> = {}): SolutionsItem => ({
  qnum: '3', questionText: 'f(x) = ln(1 + sin 3x).', solution: "$f'(x) = \\frac{3\\cos 3x}{1+\\sin 3x}$\n$k = -9$",
  answer: 'k = -9', parts: null, solutionImages: [], codes: 'M1 M1 A1', ...over,
});

describe('side panel extras', () => {
  it('the worked solution earns every mark', () => {
    expect(fullScheme('M1 A0 A1ft')).toBe('M1 A1 A1');
    expect(fullScheme('B1 M0')).toBe('B1 M1');
    expect(fullScheme('')).toBe('');
  });

  it('accepts a copy that only added codes, refuses one that changed the working', () => {
    const orig = "$f'(x) = 3$\n$k = -9$";
    expect(sameApartFromCodes(orig, "$f'(x) = 3$ [M1]\n$k = -9$ [M1 A1]")).toBe(true);
    expect(sameApartFromCodes(orig, "$f'(x) = 3$ [M1]\n$k = 9$ [A1]")).toBe(false);
    expect(sameApartFromCodes(orig, orig)).toBe(false); // nothing placed
    expect(stripCodes('$x$ [A1ft]')).toBe('$x$');
  });

  it("leaves the bank's own mark notes alone", () => {
    expect(hasOwnCodes('$x = 2$ [M1 for factorising]')).toBe(true);
    expect(hasOwnCodes('$x = [2, 3]$')).toBe(false);
  });

  it('keys part solutions by their path', () => {
    const it2 = item({ solutionFromParts: true, parts: [{ label: '(a)', solution: 'A' }, { label: 'b', subparts: [{ label: 'ii', solution: 'B' }] }] });
    expect(solutionTexts(it2)).toEqual({ a: 'A', 'b.ii': 'B' });
  });

  it('lays the codes on the lines and drops the grey tag that repeated them', () => {
    const out = applyExtras(item(), { questionLatex: '$f(x) = \\ln(1 + \\sin 3x)$.', marked: { '': "$f'(x) = \\frac{3\\cos 3x}{1+\\sin 3x}$ [M1]\n$k = -9$ [M1 A1]" } });
    expect(out.solution).toContain('[M1 A1]');
    expect(out.codes).toBeNull();
    expect(out.questionText).toBe('$f(x) = \\ln(1 + \\sin 3x)$.');
    // A changed copy is refused: the page keeps the original and its tag.
    const bad = applyExtras(item(), { questionLatex: '', marked: { '': '$k = 9$ [A1]' } });
    expect(bad.solution).toBe(item().solution);
    expect(bad.codes).toBe('M1 M1 A1');
  });

  it("never replaces a bank question that is already typeset", () => {
    const out = applyExtras(item({ questionText: 'Given $y = x^2$' }), { questionLatex: 'other', marked: {} });
    expect(out.questionText).toBe('Given $y = x^2$');
  });
});
