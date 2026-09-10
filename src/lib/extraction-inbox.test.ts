import { describe, it, expect } from 'vitest';
import {
  decideInboxFile, inboxSummary, isSettled, isSourceFile, parseSourceFilename,
  sourceKey, sourceStoragePath, libraryKindOf, libraryKeyOf, libraryRowFor,
  libraryLabel, runsToReground, regroundNotice,
  type KnownSource, type RegroundRun,
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
  it('a Ten-Year-Series / O Level / A Level name IS the national paper: exam GCE, school GCE (10 Sep 2026)', () => {
    expect(parseSourceFilename('O Level AM TYS 2025 (Questions).pdf')).toMatchObject({ ok: true, level: 'AM', year: 2025, school: 'GCE', examType: 'GCE', paper: 'all' });
    expect(parseSourceFilename('O Level EM TYS 2025 (Questions).pdf')).toMatchObject({ ok: true, level: 'EM', school: 'GCE', examType: 'GCE', paper: 'all' });
    expect(parseSourceFilename('A Level H2 Math TYS 2025 (Questions).pdf')).toMatchObject({ ok: true, level: 'JC2', year: 2025, school: 'GCE', examType: 'GCE', paper: 'all' });
    expect(parseSourceFilename('AM TYS 2019 Paper 2 (Solutions).pdf')).toMatchObject({ ok: true, school: 'GCE', examType: 'GCE', paper: 'p2' });
    // …but a real school's paper is never rewritten
    expect(parseSourceFilename('AM PRELIM 2025 Bedok South.pdf')).toMatchObject({ school: 'Bedok South', examType: 'Prelim' });
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

// ── the marker's half of the tick (Adrian, 10 Sep 2026) ─────────────────────
// "what does the system do if there are no questions or mark scheme available?
// — we should have a robust solution." The bytes for the 2025 GCE papers were
// already in this inbox; only the extraction fleet's row was ever written, so
// Isabelle's AM TYS 2025 P2 was marked blind against a paper sitting in the
// very folder that had received it.

describe('libraryKindOf — the same name test the exam-library indexer uses', () => {
  it('a scheme by any of its names', () => {
    expect(libraryKindOf('EM GCE 2004 Paper 2 (Solutions).pdf')).toBe('solutions');
    expect(libraryKindOf('AM PRELIM 2025 Bedok South ANS.pdf')).toBe('solutions');
    expect(libraryKindOf('AM 2021 marking scheme.pdf')).toBe('solutions');
    expect(libraryKindOf('EM 2019 P1 MS.pdf')).toBe('solutions');
    expect(libraryKindOf('AM PRELIM 2025 Bedok South answers.pdf')).toBe('solutions');
  });
  it('everything else is the paper', () => {
    expect(libraryKindOf('AM GCE 2025 Paper 2.pdf')).toBe('questions');
    expect(libraryKindOf('EM PRELIM 2025 Catholic High.pdf')).toBe('questions');
    expect(libraryKindOf('O Level AM TYS 2025 (Questions).pdf')).toBe('questions');
  });
});

describe('libraryKeyOf / libraryRowFor — the key the MARKER looks a paper up by', () => {
  it('rebuilds the keys the four hand-filed 2025 papers already carry', () => {
    for (const [name, key] of [
      ['AM GCE 2025 Paper 2.pdf', 'am 2025 p2 gce'],
      ['AM GCE 2025 Paper 1.pdf', 'am 2025 p1 gce'],
      ['EM GCE 2025 Paper 1.pdf', 'em 2025 p1 gce'],
      ['EM GCE 2025 Paper 2.pdf', 'em 2025 p2 gce'],
    ] as const) {
      const r = libraryRowFor(parseSourceFilename(name), name);
      expect(r).toMatchObject({ row: { key, kind: 'questions', level: name.slice(0, 2), school: 'GCE', examType: 'GCE' } });
    }
  });

  it('and a school prelim keyed the way lib/paper-key names it', () => {
    const name = 'EM PRELIM 2025 Catholic High P1.pdf';
    expect(libraryRowFor(parseSourceFilename(name), name)).toMatchObject({
      row: { key: 'em 2025 p1 catholic high', kind: 'questions', school: 'Catholic High', paper: 'p1' },
    });
    expect(libraryKeyOf({ level: 'AM', year: 2025, paper: 'p1', school: 'Bedok South' })).toBe('am 2025 p1 bedok south');
  });

  it('the solutions file fills the scheme slot under the SAME key', () => {
    // The fleet's parser leaves "(Solutions)" behind as the school; the marker's
    // key must not become "am 2025 p2 (solutions)", which nothing looks up.
    const name = 'AM GCE 2025 Paper 2 (Solutions).pdf';
    expect(libraryRowFor(parseSourceFilename(name), name)).toMatchObject({ row: { key: 'am 2025 p2 gce', kind: 'solutions', school: 'GCE' } });
  });

  it('keeps the brackets a real school carries — the bank spells them that way', () => {
    const name = 'EM PRELIM 2025 Chung Cheng High (Yishun) P2.pdf';
    expect(libraryRowFor(parseSourceFilename(name), name)).toMatchObject({
      row: { key: 'em 2025 p2 chung cheng high (yishun)', school: 'Chung Cheng High (Yishun)' },
    });
    const acs = 'AM PRELIM 2024 Anglo Chinese School (Barker Road) P1.pdf';
    expect(libraryRowFor(parseSourceFilename(acs), acs)).toMatchObject({
      row: { key: 'am 2024 p1 anglo chinese school (barker road)' },
    });
  });

  it('a national paper is filed under GCE whatever the file calls it', () => {
    for (const name of ['O Level AM TYS 2025 Paper 1.pdf', 'AM GCE 2021 Specimen P1.pdf', 'EM Ten Year Series 2019 Paper 2.pdf']) {
      const r = libraryRowFor(parseSourceFilename(name), name);
      expect('row' in r && r.row.school).toBe('GCE');
      expect('row' in r && r.row.key).toMatch(/ gce$/);
    }
  });

  it('a combined Ten-Year-Series book names no paper — kept for the fleet, not filed for the marker', () => {
    const name = 'O Level AM TYS 2025 (Questions).pdf';
    const r = libraryRowFor(parseSourceFilename(name), name);
    expect('skip' in r && r.skip).toMatch(/split the book into one file per paper/);
    expect('skip' in r && r.skip).toMatch(/AM GCE 2025 Paper 1\.pdf/);
  });

  it('a name the fleet itself could not file is never filed for the marker either', () => {
    expect(libraryRowFor(parseSourceFilename('scan001.pdf'), 'scan001.pdf')).toMatchObject({ skip: expect.any(String) });
  });

  it('labels a filed paper the way Adrian reads it', () => {
    expect(libraryLabel({ school: 'GCE', year: 2025, level: 'AM', paper: 'p2' })).toBe('GCE 2025 AM P2');
    expect(libraryLabel({ school: 'Bedok South', year: 2025, level: 'EM', paper: 'p1' })).toBe('Bedok South 2025 EM P1');
  });
});

describe('runsToReground — which papers were marked without the paper that just arrived', () => {
  // The two sides spell the paper differently on purpose: the marker's own key is
  // "gce 2025 am p2", the library's is "am 2025 p2 gce". Matching is on the FIELDS.
  const target = { key: 'am 2025 p2 gce', school: 'GCE', year: 2025, level: 'AM', paper: 'p2' };
  const stamp = { key: 'gce 2025 am p2', filter: { school: 'GCE', year: 2025, level: 'AM', paper: '2' } };
  const parsedAmP2 = { exam: 'GCE', level: 'AM', year: 2025, paper: 2, school: null };

  const run = (id: string, rj: Record<string, unknown>): RegroundRun => ({
    id, paper_name: 'isabelle TYS AM 2025 P2', student_name: 'Isabelle Toh Si Xian',
    created_at: '2026-09-08T04:59:01Z', result_json: { source: { photos: [{}, {}] }, ...rj },
  });

  it('takes the run the bot stamped, matching the stamp\'s filter to the arriving file', () => {
    const rows = [run('a', { paper_match: { key: 'gce 2025 am p2', parsed: parsedAmP2, ungrounded: stamp }, results: [{}] })];
    expect(runsToReground(rows, target).map(r => r.id)).toEqual(['a']);
    // …and not the other 2025 paper.
    expect(runsToReground(rows, { ...target, paper: 'p1', key: 'am 2025 p1 gce' })).toEqual([]);
    expect(runsToReground(rows, { ...target, level: 'EM', key: 'em 2025 p2 gce' })).toEqual([]);
  });

  it('takes an older run with no stamp: same paper, nothing grounded it, questions never found', () => {
    const rows = [run('b', {
      paper_match: { key: 'gce 2025 am p2', parsed: parsedAmP2 }, grounding: { source: null },
      results: [{ question_found: false }, { question_found: false }],
    })];
    expect(runsToReground(rows, target).map(r => r.id)).toEqual(['b']);
  });

  it('reads an H2 run\'s level the way the library spells it', () => {
    const rows = [run('h2', {
      paper_match: { parsed: { exam: 'GCE', level: 'H2', year: 2022, paper: 1, school: null }, ungrounded: { key: 'gce 2022 h2 p1' } },
      results: [{}],
    })];
    expect(runsToReground(rows, { key: 'jc2 2022 p1 gce', school: 'GCE', year: 2022, level: 'JC2', paper: 'p1' }).map(r => r.id)).toEqual(['h2']);
  });

  it('leaves a GROUNDED run of the same paper alone', () => {
    const rows = [run('c', {
      paper_match: { key: 'gce 2025 am p2', parsed: parsedAmP2 }, grounding: { source: 'bank' },
      results: [{ question_found: false }],
    })];
    expect(runsToReground(rows, target)).toEqual([]);
  });

  it('never re-marks the same run twice for the same paper', () => {
    const rows = [run('d', {
      paper_match: { parsed: parsedAmP2, ungrounded: stamp, regrounded_key: 'am 2025 p2 gce', regrounded_at: '2026-09-10T12:00:00Z' },
      results: [{}],
    })];
    expect(runsToReground(rows, target)).toEqual([]);
    // …but the OTHER paper of the same series still goes through.
    const other = [run('d2', {
      paper_match: { parsed: { ...parsedAmP2, paper: 1 }, ungrounded: { key: 'gce 2025 am p1' }, regrounded_key: 'am 2025 p2 gce' },
      results: [{}],
    })];
    expect(runsToReground(other, { ...target, paper: 'p1', key: 'am 2025 p1 gce' }).map(r => r.id)).toEqual(['d2']);
  });

  it('skips a run with nothing to re-mark from, and one still sitting in the queue', () => {
    const noPhotos: RegroundRun = {
      ...run('e', {}), result_json: { paper_match: { parsed: parsedAmP2, ungrounded: stamp }, results: [{}] },
    };
    expect(runsToReground([noPhotos], target)).toEqual([]);
    const queued = run('f', { paper_match: { parsed: parsedAmP2, ungrounded: stamp }, queue: { model: 'opus' } });
    expect(runsToReground([queued], target)).toEqual([]);
    // …but a MARKED run whose queue marker merely survived the fill is fair game.
    const marked = run('g', { paper_match: { parsed: parsedAmP2, ungrounded: stamp }, queue: { model: 'opus' }, results: [{}] });
    expect(runsToReground([marked], target).map(r => r.id)).toEqual(['g']);
  });

  it('a run that names no paper at all matches nothing', () => {
    const rows = [run('h', { paper_match: { key: null, parsed: null, ungrounded: {} }, results: [{}] })];
    expect(runsToReground(rows, target)).toEqual([]);
    expect(runsToReground(rows, { ...target, school: '' })).toEqual([]);
  });
});

describe('regroundNotice', () => {
  it('says what arrived, whose paper is going back through, and what to look for', () => {
    expect(regroundNotice('GCE 2025 AM P2', { student_name: 'Isabelle Toh Si Xian', paper_name: 'isabelle TYS AM 2025 P2' }))
      .toBe('📥 GCE 2025 AM P2 is in — re-marking Isabelle’s paper against it; the changed parts will be purple.');
  });
  it('an untagged run is named by its paper', () => {
    expect(regroundNotice('GCE 2025 EM P1', { student_name: null, paper_name: 'em tys 2025 p1' }))
      .toContain('re-marking “em tys 2025 p1” against it');
  });
});
