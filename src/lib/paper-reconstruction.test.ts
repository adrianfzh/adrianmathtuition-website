import { describe, it, expect } from 'vitest';
import {
  assessCoverage, workingSpaceLines, workingSpaceMm, answerKeyLines,
} from './paper-reconstruction';

// Grouping (count / marks_total / numbered per paper) lives in the Supabase
// paper_index view — see the migration named in paper-reconstruction.ts.

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
