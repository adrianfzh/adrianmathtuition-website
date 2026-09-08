import { describe, expect, it } from 'vitest';
import { blueprintTotal, groupSetPapers, setNumber, setPaperKey, setPaperTitle, type SetQuestionRow } from './print-sets';
import { shapeFromTitle } from './print-paper';

const row = (n: number, marks: number, extra: Partial<SetQuestionRow> = {}): SetQuestionRow => ({
  id: `q${n}${extra.paper ?? '1'}${extra.exam_type ?? ''}`, level: 'AM', exam_type: 'Set 1', paper: '1',
  question_number: String(n), total_marks: marks, ...extra,
});

describe('setNumber / setPaperKey', () => {
  it('reads the bank filing', () => {
    expect(setNumber('Set 1')).toBe(1);
    expect(setNumber('Set 12')).toBe(12);
    expect(setNumber('Prelim')).toBeNull();
    expect(setNumber('Set 0')).toBeNull();
    expect(setNumber(null)).toBeNull();
    expect(setPaperKey('1')).toBe('P1');
    expect(setPaperKey('P2')).toBe('P2');
    expect(setPaperKey('3')).toBeNull();
  });
});

describe('setPaperTitle', () => {
  it('carries the national-exam shape marker so the PDF renders the exam cover', () => {
    const t = setPaperTitle('AM', 1, 'P1');
    expect(t).toBe('A Math · Set 1 · Paper 1 · O-Level format');
    expect(shapeFromTitle(t)).toBe('gce');
    expect(setPaperTitle('JC1', 2, 'P2')).toBe('H2 Mathematics · Set 2 · Paper 2 · A-Level format');
  });
});

describe('groupSetPapers', () => {
  const p1 = [row(1, 4), row(2, 5), row(3, 6)];
  it('assembles a complete paper in question order with refs the PDF route can print', () => {
    const [paper] = groupSetPapers([p1[2], p1[0], p1[1]], () => 15);
    expect(paper.level).toBe('AM');
    expect(paper.set).toBe(1);
    expect(paper.paper).toBe('P1');
    expect(paper.complete).toBe(true);
    expect(paper.totalMarks).toBe(15);
    expect(paper.refs.map(r => r.pos)).toEqual([1, 2, 3]);
    expect(paper.refs[0]).toEqual({ id: 'q11', pos: 1, marks: 4 });
  });
  it('is incomplete with a gap, a duplicate, a zero-mark row, or a total off the blueprint', () => {
    expect(groupSetPapers([row(1, 4), row(3, 6)])[0]).toMatchObject({ complete: false, missing: [2] });
    expect(groupSetPapers([row(1, 4), row(1, 4), row(2, 5)])[0].complete).toBe(false);
    expect(groupSetPapers([row(1, 4), row(2, 0)])[0].complete).toBe(false);
    expect(groupSetPapers(p1, () => 90)[0].complete).toBe(false);
    expect(groupSetPapers(p1, () => null)[0].complete).toBe(true);
  });
  it('keeps papers, sets and levels apart and ignores rows that are not Set filings', () => {
    const rows = [
      ...p1,
      row(1, 40, { paper: '2' }),
      row(1, 7, { exam_type: 'Set 2' }),
      row(1, 7, { level: 'EM' }),
      row(9, 7, { exam_type: 'Prelim' }),
      row(9, 7, { question_number: 'x' }),
    ];
    const papers = groupSetPapers(rows);
    expect(papers.map(p => `${p.level} ${p.set} ${p.paper}`)).toEqual(['AM 1 P1', 'AM 1 P2', 'AM 2 P1', 'EM 1 P1']);
  });
  it('blueprintTotal sums the slots', () => {
    expect(blueprintTotal({ slots: [{ typ: 4 }, { typ: 6 }] })).toBe(10);
    expect(blueprintTotal({ slots: [] })).toBeNull();
    expect(blueprintTotal(null)).toBeNull();
  });
});
