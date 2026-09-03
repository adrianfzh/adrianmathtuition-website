import { describe, it, expect } from 'vitest';
import { markedPdfFilename, prettyDate, contentDisposition } from './marked-pdf-filename';

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


describe('contentDisposition — a header a browser will actually accept', () => {
  const name = markedPdfFilename({ studentName: 'Chloe Zhang', paperName: 'chloe am tys 2022 p1', dateISO: '2026-08-30' });

  it('folds the em dash out of the quoted filename and keeps the real name in filename*', () => {
    const h = contentDisposition(name);
    expect(h).toContain('filename="Chloe Zhang - chloe am tys 2022 p1 - 30 Aug 2026.pdf"');
    expect(h).toContain("filename*=UTF-8''Chloe%20Zhang%20%E2%80%94");
  });

  it('is a legal header value — the exact failure students hit on 3 Sep 2026', () => {
    // The pretty name alone throws "Cannot convert argument to a ByteString".
    expect(() => new Headers({ 'Content-Disposition': `inline; filename="${name}"` })).toThrow();
    expect(() => new Headers({ 'Content-Disposition': contentDisposition(name) })).not.toThrow();
    expect(() => new Headers({ 'Content-Disposition': contentDisposition('Ångström — 日本.pdf', 'attachment') })).not.toThrow();
  });

  it('never yields an empty quoted name', () => {
    // The one that was failing for a real reason: an em dash folds to '-', which is
    // truthy, so a plain `|| fallback` let a file called "-" through (peer, 3 Sep 2026).
    expect(contentDisposition('—')).toContain('filename="marked-paper.pdf"');
    expect(contentDisposition('')).toContain('filename="marked-paper.pdf"');
    expect(contentDisposition('日本')).toContain('filename="marked-paper.pdf"');
  });
});
