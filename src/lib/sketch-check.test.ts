import { describe, it, expect } from 'vitest';
import { parseTypedFunction, parseDomain, sketchQuestions, sketchQuestionById, headline, checklist, deductionLine, type SketchReport, type SketchItem } from './sketch-check';

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
  const item = (o: Partial<SketchItem>): SketchItem => ({ id: 'x', group: 'turning', kind: 'max', status: 'ok', want: null, wrote: null, at: null, note: '', ...o });
  const report: SketchReport = {
    groups: {}, features: [], refused: [], summary: [],
    items: [
      item({ id: 'a', kind: 'vasym', group: 'asymptotes', status: 'ok', want: 'x = 1', tex: 'x = 1', name: 'Asymptote', short: '' }),
      item({ id: 'b', kind: 'oasym', group: 'asymptotes', status: 'missing', want: 'y = x − 3', tex: 'y = x - 3', name: 'Asymptote', short: 'missing' }),
      item({ id: 'c', kind: 'yint', group: 'intercepts', status: 'wrong', want: '(0, −4)', tex: '\\left(0,\\ -4\\right)', name: 'y-intercept', short: 'wrong label' }),
      item({ id: 'd', kind: 'max', status: 'wrong', want: '(0, −4)', tex: '\\left(0,\\ -4\\right)', name: 'Max point', short: 'wrong label' }),
      item({ id: 'shape0', kind: 'shape', group: 'shape', status: 'check', note: 'Piece 1: left end: below y = x − 3' }),
    ],
    deductions: ['the asymptotes mark', 'the intercepts mark'],
  };
  it('one short line per point, wrong first, a point that is two features once', () => {
    const lines = checklist(report);
    expect(lines.map(l => l.mark)).toEqual(['✗', '✗', '?', '✓']);
    expect(lines[1].name).toBe('y-intercept · Max point');
    expect(lines[1].short).toBe('wrong label');
  });
  it('the headline and the marks-lost line', () => {
    expect(headline(report, 'checked')).toBe('2 marks would go.');
    expect(headline(null, 'checking')).toBe('Checking your sketch…');
    expect(deductionLine(report)).toBe('Marks lost: asymptotes mark · intercepts mark.');
    expect(deductionLine({ ...report, deductions: [] })).toBe('No marks lost.');
  });
});
