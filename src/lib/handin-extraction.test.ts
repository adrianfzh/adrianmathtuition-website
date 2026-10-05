import { describe, it, expect } from 'vitest';
import {
  cleanPrintedPages, enoughPages, paperIdentity, handoffFileName, schemeFileName, heldLine, sameSchool,
  decideHandoff, handoffNote, namesStudent, attachedScheme, attachedPaperPdf, backfillOrder, identityKey,
  type HandinRun, type PaperIdentity,
} from './handin-extraction';

const pc = (kinds: string[]) => kinds.map((kind, photo_index) => ({ kind, photo_index }));
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ photo_index: i, original_url: `https://www.adrianmathtuition.com/api/files/handins/recX/${i}.jpeg` }));
const isOurs = (u: string) => u.startsWith('https://www.adrianmathtuition.com/api/files/');

describe('cleanPrintedPages — which pages may leave the student\'s files', () => {
  it('takes only pages the pre-pass AND the read both call printed-only', () => {
    const rj = {
      page_classification: pc(['cover', 'question_paper', 'mixed', 'question_paper', 'working', 'question_paper']),
      non_work_pages: [{ kind: 'cover', photo_index: 0 }, { kind: 'question_paper', photo_index: 1 }, { kind: 'question_paper', photo_index: 3 }],
      results: [{ photo_index: 2 }, { photo_index: 4 }, { photo_index: 5 }],
    };
    const p = cleanPrintedPages(rj);
    expect(p.clean).toEqual([1, 3]);          // never the cover, never mixed / working
    expect(p.disputed).toEqual([5]);           // the read marked an answer on photo 5 → kept back
    expect(p.printed).toBe(4);
  });
  it('a printed page with a marked answer on it is kept back even if listed non-work', () => {
    const rj = { page_classification: pc(['question_paper']), non_work_pages: [{ kind: 'question_paper', photo_index: 0 }], results: [{ photo_index: 0 }] };
    expect(cleanPrintedPages(rj).clean).toEqual([]);
  });
  it('nothing without both signals (an old run with no non_work_pages)', () => {
    expect(cleanPrintedPages({ page_classification: pc(['question_paper', 'question_paper']) }).clean).toEqual([]);
  });
});

describe('enoughPages', () => {
  it('refuses a paper whose printed pages carry the working', () => {
    expect(enoughPages({ clean: [], printed: 20, disputed: [] })).toMatchObject({ ok: false, reason: 'no-printed-pages' });
    expect(enoughPages({ clean: [3], printed: 20, disputed: [] })).toMatchObject({ ok: false, reason: 'too-few-printed-pages' });
    expect(enoughPages({ clean: [1, 2, 3, 4, 5], printed: 15, disputed: [] })).toMatchObject({ ok: false });
  });
  it('takes a mostly clean paper, partial when some pages were left out', () => {
    expect(enoughPages({ clean: [2, 3, 4, 5, 6, 7, 8, 9, 10], printed: 9, disputed: [] })).toEqual({ ok: true, partial: false });
    expect(enoughPages({ clean: [1, 2, 3], printed: 5, disputed: [] })).toEqual({ ok: true, partial: true });
  });
});

const mathRun = (paper_name: string, parsed: Record<string, unknown>, extra: Record<string, unknown> = {}): HandinRun => ({
  id: 'r1', paper_name, subject: 'math', queue_status: 'done',
  result_json: { results: [{ photo_index: 0 }], paper_match: { key: 'k', parsed, reasons: [], source: 'none' }, ...extra },
});

describe('paperIdentity', () => {
  it('maths reads the bot\'s parsed key; TYS is the GCE paper', () => {
    const r = paperIdentity(mathRun('chloe zhang em tys 2016 p2', { exam: 'GCE', year: 2016, level: 'EM', paper: 2, school: null }));
    expect(r).toEqual({ ok: true, id: { subject: 'math', level: 'EM', year: 2016, school: 'GCE', examType: 'GCE', paper: 2 } });
  });
  it('maths: H2 → JC2, a school prelim keeps its school', () => {
    const r = paperIdentity(mathRun('lakshanya h2 math prelim vjc 2024 p2', { exam: 'PRELIM', year: 2024, level: 'H2', paper: 2, school: 'VJC' }));
    expect(r).toMatchObject({ ok: true, id: { level: 'JC2', school: 'VJC', examType: 'Prelim', paper: 2 } });
  });
  it('never guesses: no school, no exam, an unknown acronym, a WA', () => {
    expect(paperIdentity(mathRun('2026 em prelim p1', { exam: 'PRELIM', year: 2026, level: 'EM', paper: 1, school: null }))).toMatchObject({ ok: false, reason: 'unknown-paper' });
    expect(paperIdentity(mathRun('St Gabriel 2025 EM paper 2', { exam: null, year: 2025, level: 'EM', paper: 2, school: 'St Gabriel' }))).toMatchObject({ ok: false });
    const acr = mathRun('rainie am prelim sjc 2024 p1', { exam: 'PRELIM', year: 2024, level: 'AM', paper: 1, school: 'Sjc' });
    (acr.result_json as { paper_match: { reasons: string[] } }).paper_match.reasons = ['school-unverified'];
    expect(paperIdentity(acr)).toMatchObject({ ok: false, reason: 'unknown-paper' });
    expect(paperIdentity(mathRun('hua yi wa2 2026 em p1', { exam: 'WA2', year: 2026, level: 'EM', paper: 1, school: 'Hua Yi' }))).toMatchObject({ ok: false });
  });
  it('a run with no paper key reads the typed name; the level can come from paper_subject', () => {
    const old: HandinRun = { id: 'o', paper_name: 'sophie em prelim zhonghua 2025 p1', student_name: 'Sophie Tan', subject: 'math', result_json: { results: [{}] } };
    expect(paperIdentity(old)).toMatchObject({ ok: true, id: { level: 'EM', school: 'Zhonghua', examType: 'Prelim', year: 2025, paper: 1 } });
    const acs = mathRun('ACS Barker Road Prelim Paper 2 Year 2025', { exam: 'PRELIM', year: 2025, level: null, paper: 2, school: 'Anglo Chinese School (Barker Road)' });
    expect(paperIdentity({ ...acs, paper_subject: 'E Math' })).toMatchObject({ ok: true, id: { level: 'EM', school: 'Anglo Chinese School (Barker Road)' } });
  });
  it('a school is named only by the alias table — never the student\'s own name', () => {
    const r = mathRun('rainie am prelim 2024 p1', { exam: 'PRELIM', year: 2024, level: 'AM', paper: 1, school: 'Rainie' });
    (r.result_json as { paper_match: { reasons: string[] } }).paper_match.reasons = ['school-unverified'];
    expect(paperIdentity(r)).toMatchObject({ ok: false, reason: 'unknown-paper' });
    const tk = mathRun('tanjong katong girls sch em paper 1 prelim 2025', { exam: 'PRELIM', year: 2025, level: 'EM', paper: 1, school: 'Tanjong Katong' });
    (tk.result_json as { paper_match: { reasons: string[] } }).paper_match.reasons = ['school-from-token'];
    expect(paperIdentity(tk)).toMatchObject({ ok: false, reason: 'unknown-paper' });   // TK Girls' is not Tanjong Katong
    expect(namesStudent('AM PRELIM 2024 Hua Yi Paper 1.pdf', 'Rainie Lim')).toBe(false);
    expect(namesStudent('AM PRELIM 2024 Rainie Paper 1.pdf', 'Rainie Lim')).toBe(true);
  });
  it('our own sheets are never sent', () => {
    for (const n of ['kenneth am eoy practice set 1 p1', 'denise am tys 2021 p2 practice again', 'BENCH · physics · AHS 2025 Prelim Physics P2', 'CALIBRATION S3 EOY Practice Set 2 P1']) {
      expect(paperIdentity(mathRun(n, { exam: 'GCE', year: 2021, level: 'AM', paper: 2 }))).toMatchObject({ ok: false, reason: 'own-sheet' });
    }
  });
  it('science reads the typed name', () => {
    const run: HandinRun = { id: 's', paper_name: 'Queenstown Secondary School Prelim Paper 2 Year 2026', subject: 'chemistry', result_json: {} };
    expect(paperIdentity(run)).toEqual({ ok: true, id: { subject: 'chemistry', level: 'CHEM', year: 2026, school: 'Queenstown', examType: 'Prelim', paper: 2 } });
    const cs: HandinRun = { id: 's', paper_name: 'Hua Yi prelim 2025 p3', subject: 'physics', result_json: { science_track: 'combined' } };
    expect(paperIdentity(cs)).toMatchObject({ ok: true, id: { level: 'CS_PHYS', school: 'Hua Yi', paper: 3 } });
  });
  it('science: no year, no paper, an unknown acronym → unknown', () => {
    for (const n of ['Queenstown Paper 2', 'ges prelim 2026 paper', 'plmgs 2026 prelim', 'scss prelim 2026 pp4']) {
      expect(paperIdentity({ id: 's', paper_name: n, subject: 'chemistry', result_json: {} })).toMatchObject({ ok: false, reason: 'unknown-paper' });
    }
  });
});

describe('handoffFileName — the paper key, never the student', () => {
  const id = (o: Partial<PaperIdentity>): PaperIdentity => ({ subject: 'math', level: 'EM', year: 2025, school: 'GCE', examType: 'GCE', paper: 1, ...o });
  it('builds names the inbox reads back to the same paper', () => {
    expect(handoffFileName(id({}))).toBe('EM GCE 2025 Paper 1.pdf');
    expect(handoffFileName(id({ subject: 'chemistry', level: 'CHEM', school: 'Queenstown', examType: 'Prelim', paper: 2 }))).toBe('CHEM PRELIM 2025 Queenstown Paper 2.pdf');
    expect(handoffFileName(id({ level: 'JC2', school: 'VJC', examType: 'Prelim', year: 2024, paper: 2 }))).toBe('JC2 PRELIM 2024 VJC Paper 2.pdf');
    expect(handoffFileName(id({ subject: 'physics', level: 'CS_PHYS', school: 'Hua Yi', examType: 'Prelim', paper: 3 }))).toBe('CS PHY PRELIM 2025 Hua Yi Paper 3.pdf');
  });
  it('refuses a specimen (it would read back as the live GCE paper)', () => {
    expect(handoffFileName(id({ examType: 'Specimen' }))).toBeNull();
  });
  it('the scheme sits beside it as an MS file', () => {
    expect(schemeFileName('CHEM PRELIM 2025 Queenstown Paper 2.pdf')).toBe('CHEM PRELIM 2025 Queenstown Paper 2 MS.pdf');
  });
});

describe('heldLine / sameSchool', () => {
  const line = (o: Record<string, unknown>) => ({ levelCode: 'CHEM', year: 2026, school: 'Queenstown Secondary', paper: '2', status: 'banked', name: 'x', ...o }) as never;
  it('matches across "Secondary"', () => {
    expect(sameSchool('Queenstown', 'Queenstown Secondary')).toBe(true);
    expect(sameSchool('Catholic High', 'Catholic')).toBe(false);
  });
  it('finds a banked or queued line; a whole-file line covers every paper', () => {
    const id: PaperIdentity = { subject: 'chemistry', level: 'CHEM', year: 2026, school: 'Queenstown', examType: 'Prelim', paper: 2 };
    expect(heldLine(id, [line({})])).not.toBeNull();
    expect(heldLine(id, [line({ paper: null, status: 'queue' })])).not.toBeNull();
    expect(heldLine(id, [line({ paper: '1' })])).toBeNull();
    expect(heldLine(id, [line({ year: 2025 })])).toBeNull();
  });
});

describe('decideHandoff', () => {
  const clean9 = {
    page_classification: pc(['cover', 'blank', ...Array(9).fill('question_paper'), 'working']),
    non_work_pages: Array.from({ length: 9 }, (_, i) => ({ kind: 'question_paper', photo_index: i + 2 })),
    results: [{ photo_index: 11 }],
    source: { photos: photos(12) },
  };
  const run = (extra: Record<string, unknown> = {}) => mathRun('x am prelim 2025 hua yi p1', { exam: 'PRELIM', year: 2025, level: 'AM', paper: 1, school: 'Hua Yi' }, { ...clean9, ...extra });
  const ctx = (lines: never[] = []) => ({ lines, seen: new Set<string>(), isOurs });

  it('queues the clean printed pages, in order', () => {
    const d = decideHandoff(run(), ctx());
    expect(d).toMatchObject({ action: 'queue', file: 'AM PRELIM 2025 Hua Yi Paper 1.pdf', source: { kind: 'pages', pages: [2, 3, 4, 5, 6, 7, 8, 9, 10], partial: false } });
  });
  it('skips a paper the bank holds, or one already queued, or a second hand-in', () => {
    const held = [{ levelCode: 'AM', year: 2025, school: 'Hua Yi', paper: '1', status: 'older', name: 'Hua Yi · Prelim · Paper 1' }] as never[];
    expect(decideHandoff(run(), ctx(held))).toMatchObject({ action: 'skip', reason: 'in-bank' });
    const q = [{ levelCode: 'AM', year: 2025, school: 'Hua Yi', paper: '1', status: 'queue', name: 'x' }] as never[];
    expect(decideHandoff(run(), ctx(q))).toMatchObject({ action: 'skip', reason: 'already-queued' });
    const c = ctx();
    const first = decideHandoff(run(), c);
    if (first.action === 'queue') c.seen.add(first.key);
    expect(decideHandoff(run(), c)).toMatchObject({ action: 'skip', reason: 'duplicate-handin' });
  });
  it('an attached question-paper PDF goes whole; one already in the library does not count', () => {
    const own = 'https://www.adrianmathtuition.com/api/files/uploads/abc/paper.pdf';
    expect(decideHandoff(run({ source: { photos: photos(12), paper_pdf_url: own } }), ctx())).toMatchObject({ action: 'queue', source: { kind: 'attached-pdf', url: own } });
    const lib = 'https://x.supabase.co/storage/v1/object/sign/paper-library/AM/2021/GCE/p1/questions.pdf?token=1';
    expect(decideHandoff(run({ source: { photos: photos(12), paper_pdf_url: lib } }), ctx())).toMatchObject({ action: 'queue', source: { kind: 'pages' } });
  });
  it('skips an unmarked or superseded run', () => {
    expect(decideHandoff({ ...run(), queue_status: 'queued' }, ctx())).toMatchObject({ reason: 'not-marked' });
    expect(decideHandoff({ ...run(), superseded_by: 'r2' }, ctx())).toMatchObject({ reason: 'superseded' });
  });
});

describe('attached scheme / paper', () => {
  it('a student\'s scheme PDF or photos ride along; a library scheme does not', () => {
    const pdf = 'https://www.adrianmathtuition.com/api/files/handins/recU/a.pdf';
    expect(attachedScheme({ source: { scheme_source: { pdf_url: pdf, attached_by: 'student' } } }, isOurs)).toEqual({ kind: 'pdf', url: pdf });
    expect(attachedScheme({ source: { scheme_source: { pages: [{ url: pdf }] } } }, isOurs)).toEqual({ kind: 'photos', urls: [pdf] });
    expect(attachedScheme({ source: { scheme_source: { pdf_url: 'https://x.supabase.co/storage/v1/object/sign/paper-library/EM/a.pdf' } } }, isOurs)).toBeNull();
    expect(attachedPaperPdf({ source: { paper_pdf_url: 'https://www.adrianmathtuition.com/api/files/runs/r/practice-again.pdf' } }, isOurs)).toBeNull();
  });
});

describe('notes + order', () => {
  it('the note names the run and the photos, never a student', () => {
    const n = handoffNote('run-1', { kind: 'pages', pages: [2, 3, 4], partial: true, printed: 5 }, '2026-10-05');
    expect(n).toContain('run run-1');
    expect(n).toContain('photos 3, 4, 5');
    expect(n).toContain('PARTIAL');
  });
  it('science Sec 4 first, then the busiest level, newest first', () => {
    const mk = (id: string, level: string | null, created: string) => ({ run: { id, paper_name: '', result_json: {}, created_at: created }, level });
    const out = backfillOrder([mk('a', 'EM', '2026-10-01'), mk('b', 'CHEM', '2026-09-01'), mk('c', 'AM', '2026-10-02'), mk('d', 'EM', '2026-10-03')],
      new Map([['EM', 10], ['AM', 3]]));
    expect(out.map(o => o.run.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('identityKey folds "Secondary"', () => {
    const a: PaperIdentity = { subject: 'chemistry', level: 'CHEM', year: 2026, school: 'Queenstown', examType: 'Prelim', paper: 2 };
    expect(identityKey(a)).toBe(identityKey({ ...a, school: 'Queenstown Secondary' }));
  });
});
