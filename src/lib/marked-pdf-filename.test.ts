import { describe, it, expect } from 'vitest';
import { markedPdfFilename, prettyDate, contentDisposition, adminPdfName, adminPdfHref } from './marked-pdf-filename';

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


describe('adminPdfName — whose paper it is, on an admin page', () => {
  // Adrian, 15 Sep 2026: "from /admin/desk when i view the pdfs, and try to import them
  // to notability, they are always named something like marked-photos".
  const run = { studentName: 'Sophie Tan', paperName: 'sophie am tys 2021 p1', dateISO: '2026-08-30T04:12:00Z' };

  it('reads the paper the way the app prints it, with the dots flattened for a filename', () => {
    expect(adminPdfName(run)).toBe('Sophie Tan — A Math GCE 2021 Paper 1 — 30 Aug 2026.pdf');
  });

  it('does not say the student twice when Adrian typed their name into the paper', () => {
    expect(adminPdfName(run).match(/sophie/gi)).toHaveLength(1);
  });

  it('tells the three copies of one paper apart', () => {
    expect(adminPdfName(run, 'annotated')).toContain('(annotated)');
    expect(adminPdfName(run, 'full')).toContain('(full report)');
    expect(adminPdfName(run, 'sheet')).toContain('(Practice Again)');
    // The copy Adrian hands out keeps the bare name — the mark-paper convention.
    expect(adminPdfName(run, 'marked')).toBe('Sophie Tan — A Math GCE 2021 Paper 1 — 30 Aug 2026.pdf');
  });

  it('still names an untagged, unnamed run something a person can read', () => {
    expect(adminPdfName({ studentName: null, paperName: null, dateISO: null })).toBe('Marked paper.pdf');
  });
});

describe('adminPdfHref — the name has to be in the PATH, not only the header', () => {
  // Safari's share sheet titles an inline-viewed PDF from the URL's last path
  // segment and ignores Content-Disposition; that is the whole reason for the
  // decorative /[name] segment on the download route.
  const name = adminPdfName({ studentName: 'Sophie Tan', paperName: 'sophie am tys 2021 p1', dateISO: '2026-08-30' });
  const url = 'https://www.adrianmathtuition.com/api/files/runs/abc/marked-photos.pdf';

  it('puts the filename in the last path segment', () => {
    const href = adminPdfHref(url, name);
    const path = href.split('?')[0];
    expect(decodeURIComponent(path.split('/').pop()!)).toBe(name);
    expect(path.startsWith('/api/admin/mark-paper-download/')).toBe(true);
  });

  it('asks for the file inline, under the same name, from the stored URL', () => {
    const q = new URLSearchParams(adminPdfHref(url, name).split('?')[1]);
    expect(q.get('url')).toBe(url);
    expect(q.get('name')).toBe(name);
    expect(q.get('disposition')).toBe('inline');
  });

  it('only stamps ✓ Checked when the caller is the send row', () => {
    expect(adminPdfHref(url, name)).not.toContain('run=');
    expect(new URLSearchParams(adminPdfHref(url, name, { run: 'r1' }).split('?')[1]).get('run')).toBe('r1');
  });

  it('produces a header a browser accepts, end to end', () => {
    expect(() => new Headers({ 'Content-Disposition': contentDisposition(name, 'inline') })).not.toThrow();
  });
});
