import { describe, it, expect } from 'vitest';
import { parseTypedFunction, parseDomain, sketchQuestions, sketchQuestionById, headline, checklist, deductionLine, type SketchReport } from './sketch-check';

describe('parseTypedFunction', () => {
  const ok = (s: string) => {
    const r = parseTypedFunction(s);
    if (!r.ok) throw new Error(r.error);
    return r.expr;
  };
  it('drops "y =" and "f(x) =" and reads what a paper prints', () => {
    expect(ok('y = (x²+4x−5)/(x−5)')).toBe('(x^2+4x-5)/(x-5)');
    expect(ok('f(x) = 3 + |(2x+1)/(x-1)|')).toBe('3+abs((2x+1)/(x-1))');
    expect(ok('C: y = ln x / x')).toBe('ln(x)/x');
    expect(ok('y = e^(-x^2) + 2')).toBe('exp(-x^2)+2');
    expect(ok('y = √(x+1)')).toBe('sqrt(x+1)');
    expect(ok('y = arctan x')).toBe('atan(x)');
  });
  it('says plainly what it cannot read', () => {
    expect(parseTypedFunction('')).toEqual({ ok: false, error: 'Type the function first.' });
    expect(parseTypedFunction('y = (x+1')).toMatchObject({ ok: false, error: 'A bracket is not closed.' });
    expect(parseTypedFunction('y = |x+1')).toMatchObject({ ok: false });
    expect(parseTypedFunction('y = (ax+b)/(x-2)')).toMatchObject({ ok: false });
    expect(parseTypedFunction('y = 5')).toMatchObject({ ok: false, error: 'The function needs an x.' });
    expect(parseTypedFunction('y = x; drop table')).toMatchObject({ ok: false });
  });
});

describe('parseDomain', () => {
  it('reads one or two ends, null when empty or upside down', () => {
    expect(parseDomain('', '')).toBeNull();
    expect(parseDomain('0', '')).toEqual([0, null]);
    expect(parseDomain('−2', '3')).toEqual([-2, 3]);
    expect(parseDomain('3', '1')).toBeNull();
  });
});

describe('the question list', () => {
  const qs = sketchQuestions();
  it('has ids that are unique and functions in the grammar', () => {
    expect(qs.length).toBeGreaterThanOrEqual(20);
    expect(new Set(qs.map(q => q.id)).size).toBe(qs.length);
    for (const q of qs) {
      expect(parseTypedFunction(q.expr)).toEqual({ ok: true, expr: q.expr });
      expect(q.asks.length).toBeGreaterThan(0);
      expect(q.source).toMatch(/\d{4}/);
    }
  });
  it('never carries a national (GCE) paper', () => {
    for (const q of qs) expect(q.source).not.toMatch(/\bGCE\b|A-Level|SEAB/i);
  });
  it('finds one by id', () => {
    expect(sketchQuestionById('cjc-2024-promo-4a')?.expr).toBe('(x^2-4x+4)/(x-1)');
    expect(sketchQuestionById('nope')).toBeNull();
  });
});

describe('the report on the page', () => {
  const report: SketchReport = {
    items: [], groups: {}, features: [], refused: [],
    summary: [
      { ok: false, text: 'y = x − 3: missing', fix: 'Draw the asymptote y = x − 3 (dashed) and label it.' },
      { ok: false, check: true, text: 'Check — Piece 1 of 2: the left end should run below its asymptote.', fix: '' },
      { ok: true, text: 'x = 1: drawn and labelled', fix: '' },
    ],
    deductions: ['the asymptotes mark — every asymptote drawn with its equation'],
  };
  it('one headline, the checklist marks, the deduction', () => {
    expect(headline(report, 'checked')).toBe('One mark would go. Fix the line in red.');
    expect(headline(null, 'checking')).toBe('Checking your sketch…');
    expect(checklist(report).map(l => l.mark)).toEqual(['✗', '?', '✓']);
    expect(deductionLine({ ...report, deductions: [] })).toMatch(/every mark/);
  });
});
