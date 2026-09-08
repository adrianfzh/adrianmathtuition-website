import { describe, it, expect } from 'vitest';
import {
  decideInboxFile, inboxSummary, isSettled, isSourceFile, parseSourceFilename,
  sourceKey, sourceStoragePath, type KnownSource,
} from './extraction-inbox';

describe("parseSourceFilename — the fleet law's filename conventions", () => {
  it('reads the common Sec 4 prelim shape', () => {
    const p = parseSourceFilename('AM PRELIM 2025 Bedok South.pdf');
    expect(p).toMatchObject({ ok: true, level: 'AM', year: 2025, school: 'Bedok South', examType: 'Prelim', paper: 'all', ext: 'pdf' });
  });
  it('reads a JC mid-year docx and keeps the school exactly as staged (RI stays RI)', () => {
    expect(parseSourceFilename('JC2 MY 2011 RI.docx')).toMatchObject({ ok: true, level: 'JC2', year: 2011, school: 'RI', examType: 'MY', ext: 'docx' });
    expect(parseSourceFilename('JC1 Promo 2014 DHS.docx')).toMatchObject({ ok: true, level: 'JC1', examType: 'Promo', school: 'DHS' });
  });
  it('keeps a multi-school or suffixed name whole', () => {
    expect(parseSourceFilename('JC1 MY 2013 IJC or SRJC or YJC.docx')).toMatchObject({ ok: true, school: 'IJC or SRJC or YJC' });
    expect(parseSourceFilename('EM PRELIM 2025 Chung Cheng High (Yishun).pdf')).toMatchObject({ ok: true, level: 'EM', school: 'Chung Cheng High (Yishun)' });
  });
  it('applies the level precedence: (NT) before (NA) before bare, S3+AM before AM, AM+(NA)', () => {
    expect(parseSourceFilename('EM S3 SA2 2023 (NT) Fajar.docx')).toMatchObject({ ok: true, level: 'S3_EM_NT' });
    expect(parseSourceFilename('EM S3 SA2 2021 (NA) Fajar.docx')).toMatchObject({ level: 'S3_EM_NA', examType: 'SA2', school: 'Fajar' });
    expect(parseSourceFilename('EM S4 PRELIM (NA) 2024 Pierce.pdf')).toMatchObject({ level: 'EM_NA', year: 2024, school: 'Pierce', examType: 'Prelim' });
    expect(parseSourceFilename('AM (NA) Prelim 2022 Beatty P1.pdf')).toMatchObject({ level: 'AM_NA', school: 'Beatty', paper: 'p1' });
    expect(parseSourceFilename('AM S3 SA2 2021 Pierce.pdf')).toMatchObject({ level: 'S3_AM', examType: 'SA2' });
    expect(parseSourceFilename('EM S2 SA2 2014 Raffles Institution.docx')).toMatchObject({ level: 'S2', school: 'Raffles Institution' });
  });
  it('picks up a paper number and maps EOY to SA2', () => {
    expect(parseSourceFilename('AM PRELIM 2021 Bukit Panjang Government High P1.pdf')).toMatchObject({ paper: 'p1', school: 'Bukit Panjang Government High' });
    expect(parseSourceFilename('EM GCE 2021 Paper 2.pdf')).toMatchObject({ paper: 'p2', examType: 'GCE', school: 'GCE' });
    expect(parseSourceFilename('AM EOY 2021 Nanyang Girls.pdf')).toMatchObject({ examType: 'SA2', school: 'Nanyang Girls' });
  });
  it('files a specimen as Specimen with school GCE, never as the live GCE paper', () => {
    expect(parseSourceFilename('AM GCE 2021 Specimen P1.pdf')).toMatchObject({ examType: 'Specimen', school: 'GCE', paper: 'p1' });
    expect(parseSourceFilename('EM GCE 2004 GCE P2.pdf')).toMatchObject({ examType: 'GCE', school: 'GCE', paper: 'p2' });
  });
  it('refuses what the fleet law could not file, with a reason', () => {
    expect(parseSourceFilename('2021 Sec 4 A-Math Prelim Paper (Set A)-12s upd1.pdf')).toMatchObject({ ok: false, reason: expect.stringContaining('no level') });
    expect(parseSourceFilename('AM PRELIM Bedok South.pdf')).toMatchObject({ ok: false, reason: expect.stringContaining('year') });
    expect(parseSourceFilename('AM PRELIM 2025.pdf')).toMatchObject({ ok: false, reason: expect.stringContaining('no school') });
    expect(parseSourceFilename('notes.txt')).toMatchObject({ ok: false, ext: null });
  });
});

describe('isSourceFile / isSettled', () => {
  it('takes Word and PDF, ignores Office lock files and dotfiles', () => {
    expect(isSourceFile('JC2 Prelim 2016 CJC.docx')).toBe(true);
    expect(isSourceFile('x.PDF')).toBe(true);
    expect(isSourceFile('~$JC2 Prelim 2016 CJC.docx')).toBe(false);
    expect(isSourceFile('.DS_Store')).toBe(false);
    expect(isSourceFile('paper.doc')).toBe(false);
  });
  it('waits 90 s after the last modification', () => {
    const now = new Date('2026-09-08T10:00:00Z');
    expect(isSettled({ name: 'a.pdf', path: '/a.pdf', modified: '2026-09-08T09:59:00Z' }, now)).toBe(false);
    expect(isSettled({ name: 'a.pdf', path: '/a.pdf', modified: '2026-09-08T09:58:00Z' }, now)).toBe(true);
    expect(isSettled({ name: 'a.pdf', path: '/a.pdf' }, now)).toBe(false);
  });
});

describe('sourceKey / sourceStoragePath', () => {
  it('keys by normalised stem, versions by sha when asked', () => {
    expect(sourceKey('JC2  MY 2012 SAJC.docx')).toBe('src jc2 my 2012 sajc');
    expect(sourceKey('JC2 MY 2012 SAJC.docx', 'deadbeef')).toBe('src jc2 my 2012 sajc deadbeef');
  });
  it('files a parsed source under level/year/school and keeps the filename', () => {
    const p = parseSourceFilename('EM PRELIM 2025 Chung Cheng High (Yishun).pdf');
    expect(sourceStoragePath(p, 'EM PRELIM 2025 Chung Cheng High (Yishun).pdf')).toBe('sources/EM/2025/Chung_Cheng_High_(Yishun)/EM PRELIM 2025 Chung Cheng High (Yishun).pdf');
  });
  it('parks an unparsed file under _unfiled so nothing is lost', () => {
    const p = parseSourceFilename('mystery paper.pdf');
    expect(sourceStoragePath(p, 'mystery paper.pdf')).toBe('sources/_unfiled/mystery paper.pdf');
  });
});

describe('decideInboxFile — one file, one decision, idempotent', () => {
  const now = new Date('2026-09-08T10:00:00Z');
  const entry = { name: 'JC2 MY 2012 SAJC.docx', path: '/extraction inbox/jc2 my 2012 sajc.docx', modified: '2026-09-08T09:50:00Z' };
  const row = (o: Partial<KnownSource>): KnownSource => ({ id: 'r1', key: 'src other', sha256: null, status: 'queued', inbox_path: null, source_file: 'other.docx', ...o });

  it('enqueues a fresh, well-named file', () => {
    const d = decideInboxFile(entry, 'abc123def456', [], now);
    expect(d).toMatchObject({ kind: 'enqueue', key: 'src jc2 my 2012 sajc', to: 'queued', storagePath: 'sources/JC2/2012/SAJC/JC2 MY 2012 SAJC.docx' });
  });
  it('waits for a file still being written', () => {
    expect(decideInboxFile({ ...entry, modified: '2026-09-08T09:59:30Z' }, 'abc', [], now)).toEqual({ kind: 'wait' });
  });
  it('finishes only the move when an earlier tick uploaded these bytes from this path and died', () => {
    const d = decideInboxFile(entry, 'abc123', [row({ sha256: 'abc123', inbox_path: entry.path })], now);
    expect(d).toMatchObject({ kind: 'move-only', to: 'queued' });
  });
  it('rejects bytes already known under another file — including a PDF already in the marker library', () => {
    const d = decideInboxFile(entry, 'abc123', [row({ sha256: 'abc123', status: 'library', inbox_path: null, source_file: 'JC2 MY 2012 SAJC.pdf' })], now);
    expect(d).toMatchObject({ kind: 'duplicate', to: 'rejected' });
  });
  it('keeps a same-named but different file as a new version, keyed by sha', () => {
    const d = decideInboxFile(entry, 'ffee0011aabb', [row({ key: 'src jc2 my 2012 sajc', sha256: 'olderbytes' })], now);
    expect(d).toMatchObject({ kind: 'enqueue', key: 'src jc2 my 2012 sajc ffee0011', storagePath: 'sources/JC2/2012/SAJC/JC2 MY 2012 SAJC-ffee0011.docx' });
  });
  it('flags a name it cannot file, still uploading it', () => {
    const d = decideInboxFile({ ...entry, name: 'mystery.pdf', path: '/extraction inbox/mystery.pdf' }, 'abc', [], now);
    expect(d).toMatchObject({ kind: 'flag', to: 'rejected', storagePath: 'sources/_unfiled/mystery.pdf' });
  });
  it('ignores a non-source file outright', () => {
    expect(decideInboxFile({ ...entry, name: 'readme.txt' }, 'abc', [], now)).toMatchObject({ kind: 'ignore' });
  });
});

describe('inboxSummary', () => {
  it('says only what happened', () => {
    expect(inboxSummary({ queued: 2, flagged: 0, duplicate: 1, moved: 0, waiting: 0, failed: 0 })).toBe('2 queued, 1 duplicate');
    expect(inboxSummary({ queued: 0, flagged: 1, duplicate: 0, moved: 1, waiting: 3, failed: 1 })).toBe('0 queued, 1 flagged (bad name), 1 re-moved, 1 failed, 3 still settling');
  });
});
