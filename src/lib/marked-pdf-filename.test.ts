import { describe, it, expect } from 'vitest';
import { markedPdfFilename, prettyDate } from './marked-pdf-filename';

describe('prettyDate', () => {
  it('turns an ISO date or instant into the day-month-year Adrian writes', () => {
    expect(prettyDate('2026-09-03')).toBe('3 Sep 2026');
    expect(prettyDate('2026-08-28T12:42:31.232Z')).toBe('28 Aug 2026');
  });
  it('is empty for junk rather than throwing', () => {
    expect(prettyDate(null)).toBe('');
    expect(prettyDate('yesterday')).toBe('');
    expect(prettyDate('2026-13-01')).toBe('');
  });
});

describe('markedPdfFilename — Student — Paper name — date.pdf', () => {
  it('follows the send row convention', () => {
    expect(markedPdfFilename({ studentName: 'Kassandra Lim', paperName: 'am tys 2021 p1', dateISO: '2026-09-03' }))
      .toBe('Kassandra Lim — am tys 2021 p1 — 3 Sep 2026.pdf');
  });
  it('marks the full report apart from the marked pages', () => {
    expect(markedPdfFilename({ studentName: 'Kassandra Lim', paperName: 'am tys 2021 p1', dateISO: '2026-09-03', kind: 'full' }))
      .toBe('Kassandra Lim — am tys 2021 p1 — 3 Sep 2026 (full report).pdf');
  });
  it('drops what is missing instead of printing blanks', () => {
    expect(markedPdfFilename({ paperName: 'xinmin prelim p2' })).toBe('xinmin prelim p2.pdf');
    expect(markedPdfFilename({})).toBe('Marked paper.pdf');
  });
  it('strips characters a file system or a header cannot carry', () => {
    const f = markedPdfFilename({ studentName: 'A "B"', paperName: 'p1/p2: <x>?', dateISO: '2026-09-03' });
    expect(f).toBe('A B — p1-p2- -x- — 3 Sep 2026.pdf');
    expect(f).not.toMatch(/["\\/:*?<>|]/);
  });
  it('caps a runaway name', () => {
    expect(markedPdfFilename({ paperName: 'x'.repeat(300) }).length).toBeLessThanOrEqual(124);
  });
});
