import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer, numbersMatch, checkTypedAnswer, applyVerdict,
  buildEntriesFromPapers, entryKey, sgtToday, addDaysIso,
  ARCHIVE_STREAK, DUE_AFTER_CORRECT_DAYS, DUE_AFTER_WRONG_DAYS,
} from './notebook';
import type { StudentPaper, StudentQuestion, StudentPracticeItem } from './portal-marking';

describe('normalizeAnswer', () => {
  it('strips TeX chrome, spaces, and case', () => {
    expect(normalizeAnswer('$x = 2$')).toBe('x=2');
    expect(normalizeAnswer('\\frac{3}{4}')).toBe('(3)/(4)');
    expect(normalizeAnswer('3 × 5')).toBe('3*5');
    expect(normalizeAnswer('45°')).toBe('45');
    expect(normalizeAnswer('45^{\\circ}')).toBe('45');
    expect(normalizeAnswer('\\text{odd}')).toBe('odd');
  });
  it('unifies unicode minus', () => {
    expect(normalizeAnswer('−3')).toBe('-3');
  });
});

describe('numbersMatch (awrt tolerance)', () => {
  it('accepts 3 s.f. rounding drift', () => {
    expect(numbersMatch(3.61, 3.6055)).toBe(true);
    expect(numbersMatch(0.106, 0.1056)).toBe(true);
  });
  it('rejects genuinely different values', () => {
    expect(numbersMatch(3.61, 3.7)).toBe(false);
    expect(numbersMatch(12, 13)).toBe(false);
  });
});

describe('checkTypedAnswer', () => {
  it('exact after normalisation → correct', () => {
    expect(checkTypedAnswer('x=2', '$x = 2$')).toBe('correct');
  });
  it('numeric within tolerance → correct; clean mismatch → wrong', () => {
    expect(checkTypedAnswer('3.61', '3.6055')).toBe('correct');
    expect(checkTypedAnswer('3.7', '3.6055')).toBe('wrong');
  });
  it('fraction equals its decimal', () => {
    expect(checkTypedAnswer('3/4', '0.75')).toBe('correct');
  });
  it('"x=" lead-in is ignored on either side', () => {
    expect(checkTypedAnswer('2', '$x = 2$')).toBe('correct');
    expect(checkTypedAnswer('x=5', '5')).toBe('correct');
  });
  it('multi-part: both roots in any order → correct', () => {
    expect(checkTypedAnswer('x=5 or x=2', '$x = 2$ or $x = 5$')).toBe('correct');
    expect(checkTypedAnswer('2, 5', 'x = 2 or x = 5')).toBe('correct');
  });
  it('multi-part: one of two roots → unclear (never wrong)', () => {
    expect(checkTypedAnswer('x=2', 'x = 2 or x = 5')).toBe('unclear');
  });
  it('symbolic disagreement → unclear, not wrong', () => {
    expect(checkTypedAnswer('2(x+1)', '2x+2')).toBe('unclear');
  });
  it('empty input or missing official answer → unclear', () => {
    expect(checkTypedAnswer('', '3')).toBe('unclear');
    expect(checkTypedAnswer('3', '')).toBe('unclear');
  });
});

describe('applyVerdict scheduling', () => {
  const today = '2026-08-23';
  it('first correct: streak 1, due +7d, still live', () => {
    expect(applyVerdict({ streak: 0 }, 'correct', today)).toEqual({
      streak: 1, status: 'live', next_due: addDaysIso(today, DUE_AFTER_CORRECT_DAYS),
    });
  });
  it(`correct at streak ${ARCHIVE_STREAK - 1}: archived`, () => {
    expect(applyVerdict({ streak: ARCHIVE_STREAK - 1 }, 'correct', today)).toEqual({
      streak: ARCHIVE_STREAK, status: 'archived', next_due: null,
    });
  });
  it('wrong resets the streak and comes back sooner', () => {
    expect(applyVerdict({ streak: 1 }, 'wrong', today)).toEqual({
      streak: 0, status: 'live', next_due: addDaysIso(today, DUE_AFTER_WRONG_DAYS),
    });
  });
});

describe('sgtToday', () => {
  it('rolls to the next day after 16:00 UTC', () => {
    expect(sgtToday(new Date('2026-08-23T15:59:00Z'))).toBe('2026-08-23');
    expect(sgtToday(new Date('2026-08-23T16:01:00Z'))).toBe('2026-08-24');
  });
});

function q(over: Partial<StudentQuestion>): StudentQuestion {
  return {
    questionNumber: '1', awarded: 1, max: 3, topic: 'Algebra', comment: 'c',
    slips: ['(a): slipped'], full: false, prompt: 'Factorise…', revise: null, ...over,
  };
}
function paper(over: Partial<StudentPaper>): StudentPaper {
  return {
    id: 'run-1', date: '2026-08-20', name: 'Paper A', awarded: 10, max: 20, pct: 50,
    questions: [], dropped: [], pdfUrl: null, practice: [], practiceDocxUrl: null, ...over,
  };
}
const variant: StudentPracticeItem = {
  for: '1', question: 'Variant Q', answer: '42', topic: 'Algebra', origin: null, note: null,
};

describe('buildEntriesFromPapers', () => {
  it('one entry per dropped question, variant matched on `for`', () => {
    const p = paper({ dropped: [q({}), q({ questionNumber: '3' })], practice: [variant] });
    const rows = buildEntriesFromPapers('recX', [p], new Set(), '2026-08-23');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      run_id: 'run-1', question_number: '1', variant_question: 'Variant Q',
      variant_answer: '42', next_due: '2026-08-23', max_marks: 3, awarded: 1,
    });
    // Q3 has no practice item — entry still exists, variant fields null.
    expect(rows[1]).toMatchObject({ question_number: '3', variant_question: null });
  });
  it('skips entries already in the notebook', () => {
    const p = paper({ dropped: [q({})] });
    const existing = new Set([entryKey('run-1', '1')]);
    expect(buildEntriesFromPapers('recX', [p], existing, '2026-08-23')).toHaveLength(0);
  });
});
