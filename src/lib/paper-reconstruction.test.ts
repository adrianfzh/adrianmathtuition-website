import { describe, it, expect } from 'vitest';
import {
  paperKey, groupPapers, assessCoverage,
  workingSpaceLines, workingSpaceMm, answerKeyLines,
  type PaperKeyRow,
} from './paper-reconstruction';

const row = (over: Partial<PaperKeyRow>): PaperKeyRow => ({
  school: 'CJC', year: 2025, level: 'JC1', paper: '1', exam_type: 'Promo',
  total_marks: 8, question_number: '1', ...over,
});

describe('groupPapers', () => {
  it('groups by (school, year, level, paper, exam_type) and sums coverage', () => {
    const rows = [
      row({ question_number: '1', total_marks: 8 }),
      row({ question_number: '2', total_marks: 12 }),
      row({ question_number: null, total_marks: 5 }),
      row({ paper: '2', question_number: '1', total_marks: 10 }), // different paper
    ];
    const groups = groupPapers(rows);
    expect(groups.size).toBe(2);
    const p1 = groups.get(paperKey({ school: 'CJC', year: 2025, level: 'JC1', paper: '1', exam_type: 'Promo' }))!;
    expect(p1.count).toBe(3);
    expect(p1.marksTotal).toBe(25);
    expect(p1.numbered).toBe(2); // the null-qnum row is counted but not numbered
    const p2 = groups.get(paperKey({ school: 'CJC', year: 2025, level: 'JC1', paper: '2', exam_type: 'Promo' }))!;
    expect(p2.count).toBe(1);
  });

  it('skips rows without school or year — they belong to no paper', () => {
    const groups = groupPapers([
      row({ school: null }),
      row({ year: null }),
      row({}),
    ]);
    expect(groups.size).toBe(1);
  });

  it('null level/paper/exam_type still form their own bucket (paper_index parity)', () => {
    const groups = groupPapers([
      row({ level: null, paper: null, exam_type: null }),
      row({ level: null, paper: null, exam_type: null }),
    ]);
    expect(groups.size).toBe(1);
    expect([...groups.values()][0].count).toBe(2);
  });

  it('treats missing/zero/negative marks as 0, and blank question numbers as unnumbered', () => {
    const groups = groupPapers([
      row({ total_marks: null, question_number: '  ' }),
      row({ total_marks: -3, question_number: '3' }),
    ]);
    const g = [...groups.values()][0];
    expect(g.marksTotal).toBe(0);
    expect(g.numbered).toBe(1);
  });
});

describe('assessCoverage', () => {
  it('CJC 2025 Promo P1: 12 questions / 100 marks → complete', () => {
    const c = assessCoverage(100, 12);
    expect(c.status).toBe('complete');
    expect(c.assumedTotal).toBe(100);
    expect(c.label).toBe('');
  });

  it('tolerates ±2 marks of extraction noise', () => {
    expect(assessCoverage(89, 10).status).toBe('complete');
    expect(assessCoverage(98, 10).status).toBe('complete');
    expect(assessCoverage(78, 10).status).toBe('complete'); // 80-mark old P1
  });

  it('flags a partial paper with the missing-marks count', () => {
    const c = assessCoverage(47, 6);
    expect(c.status).toBe('partial');
    expect(c.assumedTotal).toBe(80); // nearest standard total
    expect(c.missingMarks).toBe(33);
    expect(c.label).toContain('partial — 33 marks missing');
  });

  it('ties between standard totals resolve to the higher paper', () => {
    const c85 = assessCoverage(85, 9); // 80 vs 90 equidistant
    expect(c85.assumedTotal).toBe(90);
    expect(c85.missingMarks).toBe(5);
    const c95 = assessCoverage(95, 11); // 90 vs 100 equidistant
    expect(c95.assumedTotal).toBe(100);
    expect(c95.status).toBe('partial');
  });

  it('flags an over-full paper (likely duplicates) instead of calling it complete', () => {
    const c = assessCoverage(112, 14);
    expect(c.status).toBe('overfull');
    expect(c.assumedTotal).toBe(100);
    expect(c.missingMarks).toBe(12);
  });

  it('is honest when it cannot judge', () => {
    expect(assessCoverage(0, 5).status).toBe('unknown');
    expect(assessCoverage(50, 0).status).toBe('unknown');
  });

  it('JC papers are always judged against 100 marks', () => {
    const c = assessCoverage(75, 10, 'JC1'); // NOT "5 short of 80"
    expect(c.assumedTotal).toBe(100);
    expect(c.missingMarks).toBe(25);
    expect(assessCoverage(100, 12, 'JC2').status).toBe('complete');
    expect(assessCoverage(80, 10, 'JC2_H1').assumedTotal).toBe(100);
    expect(assessCoverage(80, 10, 'AM').status).toBe('complete'); // Sec keeps 80
  });
});

describe('workingSpaceLines — mirrors create-exam-paper exam_lib.SQm', () => {
  it('max(2, round(marks * 2.5)) with Python half-to-even rounding', () => {
    expect(workingSpaceLines(1)).toBe(2); // 2.5 → 2 (banker's), then max(2, …)
    expect(workingSpaceLines(2)).toBe(5);
    expect(workingSpaceLines(3)).toBe(8); // 7.5 → 8 (even)
    expect(workingSpaceLines(4)).toBe(10);
    expect(workingSpaceLines(5)).toBe(12); // 12.5 → 12 (banker's), NOT 13
    expect(workingSpaceLines(6)).toBe(15);
  });

  it('floors at 2 lines for markless parts', () => {
    expect(workingSpaceLines(0)).toBe(2);
    expect(workingSpaceLines(null)).toBe(2);
    expect(workingSpaceLines(undefined)).toBe(2);
  });
});

describe('workingSpaceMm', () => {
  it('is lines × 8mm', () => {
    expect(workingSpaceMm(2)).toBe(40); // 5 lines
    expect(workingSpaceMm(4)).toBe(80); // 10 lines
  });
  it('caps so one part never exceeds a page', () => {
    expect(workingSpaceMm(30)).toBe(180);
  });
});

describe('answerKeyLines', () => {
  it('labels nested part answers and skips answerless parts', () => {
    const lines = answerKeyLines(
      [
        { label: 'a', answer: 'x = 3' },
        { label: 'b', subparts: [{ label: 'i', answer: 'k = -2' }, { label: 'ii' }] },
      ],
      'ignored — parts win',
    );
    expect(lines).toEqual(['(a) x = 3', '(b)(i) k = -2']);
  });

  it('normalises already-parenthesised labels instead of doubling them', () => {
    expect(answerKeyLines([{ label: '(a)', answer: '7' }], null)).toEqual(['(a) 7']);
  });

  it('falls back to the row-level answer, and to nothing', () => {
    expect(answerKeyLines(null, ' y = 2x ')).toEqual(['y = 2x']);
    expect(answerKeyLines([{ label: 'a' }], null)).toEqual([]);
    expect(answerKeyLines(null, '  ')).toEqual([]);
  });
});
