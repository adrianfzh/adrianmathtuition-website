import { describe, it, expect } from 'vitest';
import {
  buildIndex, summarise, summaryLine, filterLines, groupLines, statusText, bankText, shortReason,
  isSchemeFile, isCutBook, subjectLevel, paperNo, noteLines,
  type SourceRow, type BankPaper,
} from './paper-index';

let n = 0;
const src = (o: Partial<SourceRow>): SourceRow => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`, kind: 'source', status: 'done',
  storage_path: `sources/x/${n}.pdf`, source_file: `f${n}.pdf`, level: 'EM', year: 2025, paper: 'p1',
  school: 'Bedok South', exam_type: 'Prelim', subject: 'math', notes: null, size_bytes: 1000, ...o,
});
const bank = (o: Partial<BankPaper>): BankPaper => ({
  subject: 'maths', level: 'EM', school: 'Bedok South', year: 2025, exam_type: 'Prelim', paper: '1',
  n: 20, n_scheme: 20, n_from_answers: 0, n_worked: 0, n_none: 0, figures_missing: 0, ...o,
});

describe('subjectLevel', () => {
  it('names maths and science levels', () => {
    expect(subjectLevel('math', 'EM_NA')).toMatchObject({ family: 'maths', subject: 'E Math', level: 'Sec 4/5 N(A)' });
    expect(subjectLevel('maths', 'JC2_H1')).toMatchObject({ subject: 'H1 Math' });
    expect(subjectLevel('physics', 'CS_PHYS')).toMatchObject({ family: 'science', subject: 'Physics', level: 'Combined Science' });
    expect(subjectLevel('science', 'S2')).toMatchObject({ subject: 'Lower Sec Science', level: 'Sec 2' });
    expect(subjectLevel('social_studies', 'SS')).toMatchObject({ family: 'humanities', subject: 'Social Studies' });
  });
  it('a maths S1 is not a science S1', () => {
    expect(subjectLevel('math', 'S1').subject).toBe('Lower Sec Math');
  });
});

describe('small rules', () => {
  it('paper numbers', () => {
    expect(paperNo('p2')).toBe('2'); expect(paperNo('2')).toBe('2'); expect(paperNo('all')).toBeNull();
  });
  it('a scheme file is never a paper', () => {
    expect(isSchemeFile({ source_file: 'AM PRELIM 2021 Peirce P2 MS.pdf', notes: null })).toBe(true);
    expect(isSchemeFile({ source_file: 'x.pdf', notes: 'a mark scheme, not a paper to extract — kept' })).toBe(true);
    expect(isSchemeFile({ source_file: 'AM PRELIM 2021 Peirce P2.pdf', notes: null })).toBe(false);
    expect(isSchemeFile({ source_file: 'O Level AM TYS 2025 (Questions).pdf', notes: null })).toBe(false);
  });
  it('a cut book is not listed', () => {
    expect(isCutBook({ status: 'skipped', notes: 'split by the watcher on 2026-09-30 into 2 papers' })).toBe(true);
    expect(isCutBook({ status: 'done', notes: 'split by the watcher' })).toBe(false);
  });
  it('short reasons in plain words', () => {
    expect(shortReason('held', 'x | ON HOLD 2 Oct 2026: outside the priority set (2023-2025 …)')).toMatch(/not in this round/);
    expect(shortReason('skipped', 'Status: SKIPPED (duplicate: same school/year)')).toBe('already in the bank');
    expect(shortReason('skipped', 'SKIPPED - pre-2018 syllabus: cover reads 5076')).toBe('old syllabus');
    expect(shortReason('skipped', '3 Oct 2026: flag closed as skipped — the queue holds the wrong file for this name')).toBe('the wrong file under this name');
    expect(shortReason('flagged', 'first | [2026-10-01] cover says Paper 3 but the name says P1')).toBe('cover says Paper 3 but the name says P1');
    expect(shortReason('done', 'anything')).toBeNull();
  });
  it('notes split into lines', () => {
    expect(noteLines('a | b\nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('buildIndex', () => {
  it('puts the bank count on the inbox paper and lists unmatched bank papers as older', () => {
    const lines = buildIndex(
      [src({ paper: 'p1' }), src({ paper: 'p2', status: 'queued' })],
      [bank({ paper: '1', n: 25, n_scheme: 20, n_from_answers: 5 }), bank({ school: 'Anderson', year: 2019, n: 30 })],
    );
    expect(lines).toHaveLength(3);
    const p1 = lines.find(l => l.school === 'Bedok South' && l.paper === '1')!;
    expect(p1).toMatchObject({ status: 'banked', questions: 25, answersFrom: 'answers from the scheme' });
    expect(lines.find(l => l.paper === '2' && l.school === 'Bedok South')!.status).toBe('queue');
    const old = lines.find(l => l.school === 'Anderson')!;
    expect(old.status).toBe('older');
    expect(statusText(old)).toBe('Banked (older), no source file');
  });
  it('matches school spelling loosely and a whole-file row takes every paper', () => {
    const lines = buildIndex(
      [src({ paper: 'all', school: 'Chung Cheng High (Yishun)' })],
      [bank({ school: 'chung cheng high yishun', paper: '1', n: 10 }), bank({ school: 'Chung Cheng High (Yishun)', paper: '2', n: 12 })],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ paper: null, questions: 22, name: 'Chung Cheng High (Yishun) · Prelim · All papers' });
  });
  it('merges re-sent versions of one paper and keeps the most advanced status', () => {
    const lines = buildIndex([src({ status: 'skipped', notes: 'Status: SKIPPED (duplicate)' }), src({ status: 'done' })], [bank({})]);
    expect(lines).toHaveLength(1);
    expect(lines[0].status).toBe('banked');
    expect(lines[0].sourceIds).toHaveLength(2);
  });
  it('hangs schemes and library files on the paper, never as lines', () => {
    const lines = buildIndex(
      [src({ source_file: 'EM PRELIM 2025 Bedok South P1 MS.pdf', status: 'skipped', storage_path: 'ms.pdf' }), src({})],
      [bank({}), bank({ school: 'Beatty', year: 2010, paper: '2' })],
      [
        { ...src({ kind: 'questions', school: 'Beatty', year: 2010, paper: 'p2', exam_type: null, storage_path: 'EM/2010/Beatty/p2/questions.pdf' }) },
        { ...src({ kind: 'solutions', school: 'Beatty', year: 2010, paper: 'p2', exam_type: null, storage_path: 'EM/2010/Beatty/p2/solutions.pdf' }) },
      ],
    );
    expect(lines).toHaveLength(2);
    expect(lines.find(l => l.school === 'Bedok South')!.scheme?.path).toBe('ms.pdf');
    const beatty = lines.find(l => l.school === 'Beatty')!;
    expect(beatty.file?.path).toBe('EM/2010/Beatty/p2/questions.pdf');
    expect(beatty.scheme?.path).toBe('EM/2010/Beatty/p2/solutions.pdf');
    expect(statusText(beatty)).toBe('Banked (older)');
  });
  it('drops cut books and says when a banked paper has nothing in the bank', () => {
    const lines = buildIndex([src({ status: 'skipped', paper: 'all', notes: 'split by the watcher into 2 papers' }), src({ school: 'Ghost' })], []);
    expect(lines).toHaveLength(1);
    expect(bankText(lines[0])).toBe('no questions found in the bank under this name');
  });
  it('keeps maths and science apart', () => {
    const lines = buildIndex(
      [src({ subject: 'physics', level: 'PHYS', school: 'GCE', exam_type: 'GCE' })],
      [bank({ subject: 'physics', level: 'PHYS', school: 'GCE', exam_type: 'GCE', n: 40, figures_missing: 2 })],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ subject: 'Physics', questions: 40, figuresMissing: 2 });
    expect(bankText(lines[0])).toBe('40 questions in the bank · answers from the scheme · 2 figures missing');
  });
});

describe('summary, filter, groups', () => {
  const lines = buildIndex(
    [src({}), src({ paper: 'p2', status: 'flagged', notes: 'cover mismatch' }), src({ level: 'AM', status: 'held', notes: 'ON HOLD: outside the priority set' })],
    [bank({}), bank({ year: 2018, school: 'Anderson' })],
  );
  it('counts per subject in one sentence', () => {
    const s = summarise(lines);
    expect(s.map(x => x.subject)).toEqual(['E Math', 'A Math']);
    expect(summaryLine(s[0])).toBe('E Math: 2 papers banked, 1 needs a decision');
    expect(summaryLine(s[1])).toBe('A Math: 0 papers banked, 1 on hold');
  });
  it('filters by status, years and words', () => {
    expect(filterLines(lines, { status: 'banked-any' })).toHaveLength(2);
    expect(filterLines(lines, { yearFrom: 2020 })).toHaveLength(3);
    expect(filterLines(lines, { q: 'anderson' })).toHaveLength(1);
    expect(filterLines(lines, { q: 'paper 2 decision' })).toHaveLength(1);
  });
  it('groups subject → level → year, newest year first', () => {
    const g = groupLines(lines);
    expect(g[0].subject).toBe('E Math');
    expect(g[0].levels[0].years.map(y => y.year)).toEqual([2025, 2018]);
    expect(g[0].count).toBe(3);
  });
});
