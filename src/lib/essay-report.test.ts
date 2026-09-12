import { describe, it, expect } from 'vitest';
import { segmentsFor, bandLine, trendFor, studentStatusLine, type EssayMark } from './essay-report';
import { essayRubricFor, ESSAY_KINDS } from './essay-rubric';
import { ENGLISH_ESSAY_CODES, codeLabel } from './essay-codes';

const TEXT = 'The waves was gentle. He walks in first, then he shouted at me.';
const mark = (quote: string, code: string | null, fix: string | null = null): EssayMark => {
  const start = TEXT.indexOf(quote);
  return { quote, start, end: start + quote.length, fix, code, reason: null };
};

describe('segmentsFor — the student\'s text with the marks laid on it', () => {
  it('cuts the text into plain and marked segments in order, and puts it back together whole', () => {
    const segs = segmentsFor(TEXT, [mark('He walks in', 'tense', 'He walked in'), mark('waves was', 'sva', 'waves were')]);
    expect(segs.map(s => s.text).join('')).toBe(TEXT);
    expect(segs.filter(s => s.mark).map(s => s.text)).toEqual(['waves was', 'He walks in']);
    expect(segs[0]).toEqual({ text: 'The ', mark: null });
  });
  it('skips a mark that overlaps an earlier one or falls outside the text, never draws it wrongly', () => {
    const overlapping: EssayMark = { quote: 'was gentle', start: 10, end: 20, fix: null, code: null, reason: null };
    const outside: EssayMark = { quote: 'x', start: 500, end: 503, fix: null, code: null, reason: null };
    const segs = segmentsFor(TEXT, [mark('waves was', 'sva'), overlapping, outside]);
    expect(segs.filter(s => s.mark)).toHaveLength(1);
    expect(segs.map(s => s.text).join('')).toBe(TEXT);
  });
});

describe('bandLine — a range, never a number', () => {
  it('reads "Band 4 · 7–8 of 10"', () => {
    expect(bandLine({ band: 4, min: 7, max: 8, descriptors: [], evidence: null }, 10)).toBe('Band 4 · 7–8 of 10');
    expect(bandLine(null, 10)).toBe('not decided');
  });
});

describe('trendFor — the habit counts across the last essays, oldest first', () => {
  const run = (day: string, counts: Record<string, number> | null) => ({ marked_at: `2026-09-${day}T10:00:00Z`, created_at: `2026-09-${day}T09:00:00Z`, code_counts: counts });
  it('follows the newest essay\'s top three codes back through the earlier ones', () => {
    const lines = trendFor([run('12', { tense: 2, sva: 1 }), run('01', { tense: 7, sva: 3, spelling: 4 }), run('06', { tense: 4, sva: 2 })]);
    expect(lines).toEqual([{ code: 'tense', counts: [7, 4, 2] }, { code: 'sva', counts: [3, 2, 1] }]);
  });
  it('needs two marked essays; an essay with no counts is skipped', () => {
    expect(trendFor([run('12', { tense: 2 })])).toEqual([]);
    expect(trendFor([run('12', { tense: 2 }), run('11', null)])).toEqual([]);
  });
  it('keeps only the last five', () => {
    const many = ['01', '02', '03', '04', '05', '06', '07'].map(d => run(d, { tense: Number(d) }));
    expect(trendFor(many)[0].counts).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('the seeded English 1184 rubric', () => {
  it('continuous writing is Content /10 + Language /20, bands 5→0 with the document\'s mark ranges', () => {
    const r = essayRubricFor('english', 'continuous_writing')!;
    expect(r.criteria.map(c => [c.key, c.max])).toEqual([['content', 10], ['language', 20]]);
    const lang = r.criteria[1];
    expect(lang.bands.map(b => [b.band, b.mark_min, b.mark_max])).toEqual([[5, 17, 20], [4, 13, 16], [3, 9, 12], [2, 5, 8], [1, 1, 4], [0, 0, 0]]);
    expect(lang.bands[0].descriptors[0]).toMatch(/Coherent and cohesive/);
    expect(r.length_words).toBe(ESSAY_KINDS.continuous_writing.length_words);
  });
  it('situational writing is Task fulfilment /10 + Language /20; unknown kinds and subjects give null', () => {
    const r = essayRubricFor('english', 'situational_writing')!;
    expect(r.criteria.map(c => c.key)).toEqual(['task_fulfilment', 'language']);
    expect(r.criteria[0].assessment_criteria).toHaveLength(3);
    expect(essayRubricFor('english', 'poem')).toBeNull();
    expect(essayRubricFor('chinese', 'continuous_writing')).toBeNull();
  });
});

describe('the fixed English codes', () => {
  it('has the sixteen codes of the spec, each with a label and a hint, and labels an unknown code plainly', () => {
    expect(ENGLISH_ESSAY_CODES).toHaveLength(16);
    expect(new Set(ENGLISH_ESSAY_CODES.map(c => c.code)).size).toBe(16);
    for (const c of ENGLISH_ESSAY_CODES) expect(c.label && c.hint).toBeTruthy();
    expect(codeLabel('english', 'comma_splice')).toBe('Comma splice / run-on');
    expect(codeLabel('english', null)).toBe('Other');
  });
  it('a student never reads an internal hold reason', () => {
    expect(studentStatusLine('held')).not.toMatch(/disagree on/);
  });
});
