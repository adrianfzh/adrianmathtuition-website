import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer, numbersMatch, checkTypedAnswer, applyVerdict,
  buildEntriesFromPapers, entryKey, sgtToday, addDaysIso, retryOrder,
  ARCHIVE_STREAK, DUE_AFTER_CORRECT_DAYS, DUE_AFTER_WRONG_DAYS,
  type RetrySource,
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
  it('coordinate points grade as ordered tuples, brackets optional when typing', () => {
    // Turning-point answers — the classic Quadratic Functions check.
    expect(checkTypedAnswer('(2, 8)', '$(2, 8)$')).toBe('correct');
    expect(checkTypedAnswer('2,8', '$(2, 8)$')).toBe('correct');
    expect(checkTypedAnswer('h=2, k=8', '$(2, 8)$')).toBe('correct');
    expect(checkTypedAnswer('(2, -8)', '$(2, 8)$')).toBe('wrong');
    expect(checkTypedAnswer('(8, 2)', '$(2, 8)$')).toBe('wrong');       // order matters
    expect(checkTypedAnswer('8', '$(2, 8)$')).toBe('unclear');          // half an answer
    expect(checkTypedAnswer('(2, 8, 1)', '$(2, 8)$')).toBe('unclear');
    // Fractions normalise to (a)/(b) and still parse.
    expect(checkTypedAnswer('(9/2, 19/2)', '$\\left(\\frac{9}{2}, \\frac{19}{2}\\right)$')).toBe('correct');
    expect(checkTypedAnswer('(4.5, 9.5)', '$\\left(\\frac{9}{2}, \\frac{19}{2}\\right)$')).toBe('correct');
  });
  it('a bare comma list is still an unordered root list, not a point', () => {
    expect(checkTypedAnswer('5, 2', '2, 5')).toBe('correct');
    expect(checkTypedAnswer('x=5, x=2', 'x = 2 or x = 5')).toBe('correct');
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
    slips: ['(a): slipped'], full: false, prompt: 'Factorise…', schemes: [], solution: null, revise: null, ...over,
  };
}
function paper(over: Partial<StudentPaper>): StudentPaper {
  return {
    id: 'run-1', date: '2026-08-20', name: 'Paper A', awarded: 10, max: 20, pct: 50,
    questions: [], dropped: [], pdfUrl: null, fullPdfUrl: null, pages: [], practice: [], practiceDocxUrl: null, ...over,
  };
}
const variant: StudentPracticeItem = {
  for: '1', id: 'qb-uuid-1', question: 'Variant Q', answer: '42', topic: 'Algebra', origin: null, note: null,
};

describe('buildEntriesFromPapers', () => {
  it('one entry per dropped question, variant matched on `for`', () => {
    const p = paper({ dropped: [q({}), q({ questionNumber: '3' })], practice: [variant] });
    const rows = buildEntriesFromPapers('recX', [p], new Set(), '2026-08-23');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      run_id: 'run-1', question_number: '1', variant_question: 'Variant Q',
      variant_answer: '42', variant_qb_id: 'qb-uuid-1',
      next_due: '2026-08-23', max_marks: 3, awarded: 1,
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

describe('retryOrder (My Notebook "Questions to retry")', () => {
  const e = (over: Partial<RetrySource>): RetrySource => ({
    status: 'live', topic: 'Algebra', paper_date: '2026-08-01', question_number: '1', ...over,
  });

  it('drops archived (conquered) entries', () => {
    const rows = retryOrder([e({}), e({ status: 'archived', question_number: '2' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].question_number).toBe('1');
  });

  it('groups by topic A→Z with untagged entries last', () => {
    const rows = retryOrder([
      e({ topic: null, question_number: '9' }),
      e({ topic: 'Vectors', question_number: '5' }),
      e({ topic: 'Algebra', question_number: '2' }),
    ]);
    expect(rows.map(r => r.topic)).toEqual(['Algebra', 'Vectors', null]);
  });

  it('newest paper first inside a topic, numeric question order as tiebreak', () => {
    const rows = retryOrder([
      e({ paper_date: '2026-07-01', question_number: '3' }),
      e({ paper_date: '2026-08-20', question_number: '10' }),
      e({ paper_date: '2026-08-20', question_number: '9' }),
      e({ paper_date: null, question_number: '1' }),
    ]);
    expect(rows.map(r => [r.paper_date, r.question_number])).toEqual([
      ['2026-08-20', '9'],
      ['2026-08-20', '10'], // numeric-aware: 10 after 9, not after 1
      ['2026-07-01', '3'],
      [null, '1'], // undated sorts oldest
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [e({ topic: 'Vectors' }), e({ topic: 'Algebra' })];
    const before = [...input];
    retryOrder(input);
    expect(input).toEqual(before);
  });
});
