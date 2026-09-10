import { describe, it, expect } from 'vitest';
import {
  chunkRanges, describeParts, parseCoverAnswer, partFileName, planSplit,
  MIN_PAPER_PAGES, type CoverHit,
} from './paper-book-split';

const cover = (page: number, paper: number | null = 1, year: number | null = 2025, code: string | null = null): CoverHit => ({ page, paper, year, code });

describe('parseCoverAnswer — the model’s JSON, tolerantly', () => {
  it('reads the documented shape', () => {
    expect(parseCoverAnswer('{"covers":[{"page":1,"paper":1,"year":2025,"code":"4049/01"},{"page":17,"paper":2,"year":2025,"code":"4049/02"}]}'))
      .toEqual([cover(1, 1, 2025, '4049/01'), cover(17, 2, 2025, '4049/02')]);
  });
  it('tolerates prose and a code fence around the JSON, and a bare array', () => {
    expect(parseCoverAnswer('Here you go:\n```json\n{"covers":[{"page":3,"paper":2}]}\n```')).toEqual([cover(3, 2, null, null)]);
    expect(parseCoverAnswer('[{"page":5,"paper":1,"year":"2024"}]')).toEqual([cover(5, 1, 2024, null)]);
  });
  it('offsets a chunk’s page numbers into the book’s', () => {
    expect(parseCoverAnswer('{"covers":[{"page":1,"paper":2}]}', 100)).toEqual([cover(101, 2, null, null)]);
  });
  it('drops what it cannot use and never throws', () => {
    expect(parseCoverAnswer('no json here')).toEqual([]);
    expect(parseCoverAnswer('{"covers":"nope"}')).toEqual([]);
    expect(parseCoverAnswer('{"covers":[{"page":0,"paper":1},{"page":"x"},{"page":4,"paper":9,"year":1800,"code":""}]}'))
      .toEqual([cover(4, null, null, null)]);
  });
});

describe('chunkRanges — ≤ N pages a call', () => {
  it('splits 1-based inclusive ranges', () => {
    expect(chunkRanges(0)).toEqual([]);
    expect(chunkRanges(1)).toEqual([[1, 1]]);
    expect(chunkRanges(100)).toEqual([[1, 100]]);
    expect(chunkRanges(101)).toEqual([[1, 100], [101, 101]]);
    expect(chunkRanges(250, 100)).toEqual([[1, 100], [101, 200], [201, 250]]);
  });
});

describe('planSplit — where the book is cut', () => {
  it('two covers → two parts; the leading and trailing pages ride with their neighbours', () => {
    const plan = planSplit([cover(2, 1), cover(18, 2)], 34);
    expect(plan).toEqual({ kind: 'split', parts: [
      { from: 1, to: 17, paper: 1, year: 2025, code: null },
      { from: 18, to: 34, paper: 2, year: 2025, code: null },
    ] });
  });
  it('a whole Ten-Year-Series: one part per (year, paper), in page order', () => {
    const plan = planSplit([cover(30, 2, 2023), cover(1, 1, 2024), cover(15, 2, 2024), cover(45, 1, 2023)], 60);
    expect(plan.kind).toBe('split');
    if (plan.kind !== 'split') return;
    expect(plan.parts.map(p => [p.from, p.to, p.year, p.paper])).toEqual([[1, 14, 2024, 1], [15, 29, 2024, 2], [30, 44, 2023, 2], [45, 60, 2023, 1]]);
  });
  it('a second "cover" within a paper’s length of the first is the same cover seen twice', () => {
    const plan = planSplit([cover(1, 1), cover(2, 1), cover(17, 2), cover(17 + MIN_PAPER_PAGES - 1, 2)], 34);
    expect(plan).toEqual({ kind: 'split', parts: [
      { from: 1, to: 16, paper: 1, year: 2025, code: null },
      { from: 17, to: 34, paper: 2, year: 2025, code: null },
    ] });
  });
  it('one cover → single, with the number it printed', () => {
    expect(planSplit([cover(1, 2, 2024)], 20)).toEqual({ kind: 'single', paper: 2, year: 2024 });
    expect(planSplit([cover(1, null, null)], 20)).toEqual({ kind: 'single', paper: null, year: null });
  });
  it('refuses when the covers contradict each other, saying why', () => {
    expect(planSplit([], 20)).toMatchObject({ kind: 'none', reason: 'no cover page found' });
    expect(planSplit([cover(1, 1), cover(12, null)], 24)).toMatchObject({ kind: 'none', reason: expect.stringContaining('no paper number') });
    expect(planSplit([cover(1, 1, 2025), cover(12, 1, 2025)], 24)).toMatchObject({ kind: 'none', reason: 'two covers both say 2025 Paper 1' });
    expect(planSplit([cover(1, 1), cover(22, 2)], 24)).toMatchObject({ kind: 'none', reason: expect.stringContaining('leaves fewer than') });
    expect(planSplit([cover(1, 1)], 0)).toMatchObject({ kind: 'none' });
  });
  it('ignores a cover beyond the last page', () => {
    expect(planSplit([cover(1, 1), cover(99, 2)], 20)).toEqual({ kind: 'single', paper: 1, year: 2025 });
  });
});

describe('partFileName — the fleet’s convention, readable by the inbox parser', () => {
  const gce = { level: 'AM', year: 2025, school: 'GCE', examType: 'GCE' };
  it('a national paper names the exam once', () => {
    expect(partFileName(gce, { paper: 1, year: 2025 })).toBe('AM GCE 2025 Paper 1.pdf');
    expect(partFileName({ ...gce, level: 'JC2' }, { paper: 2, year: null })).toBe('JC2 GCE 2025 Paper 2.pdf');
  });
  it('the cover’s year wins over the book’s (a decade book)', () => {
    expect(partFileName(gce, { paper: 2, year: 2019 })).toBe('AM GCE 2019 Paper 2.pdf');
  });
  it('a school paper keeps its school exactly as staged', () => {
    expect(partFileName({ level: 'EM', year: 2024, school: 'Chung Cheng High (Yishun)', examType: 'Prelim' }, { paper: 1, year: null }))
      .toBe('EM PRELIM 2024 Chung Cheng High (Yishun) Paper 1.pdf');
    expect(partFileName({ level: 'JC2', year: 2014, school: 'MJC', examType: null }, { paper: 2, year: null }, 'pdf'))
      .toBe('JC2 PRELIM 2014 MJC Paper 2.pdf');
  });
});

describe('describeParts', () => {
  it('names each part with its pages', () => {
    expect(describeParts([{ from: 1, to: 16, paper: 1, year: 2025, code: null }, { from: 17, to: 34, paper: 2, year: null, code: null }]))
      .toBe('Paper 1 (2025) pp. 1–16, Paper 2 pp. 17–34');
  });
});
