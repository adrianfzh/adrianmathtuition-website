import { describe, it, expect } from 'vitest';
import {
  levelFromWrongShare, tallyFirstAttempts, resultsRows, tallySummary, estimateLevel, testSolveOf,
  MIN_FIRST_ATTEMPTS, type McqAttempt,
} from './practice-difficulty';

const at = (student: string, q: string, t: string, correct: boolean): McqAttempt => ({ student, questionId: q, attemptedAt: t, correct });

describe('levelFromWrongShare', () => {
  it('cuts at 25 % and 55 %', () => {
    expect(levelFromWrongShare(0)).toBe('core');
    expect(levelFromWrongShare(0.249)).toBe('core');
    expect(levelFromWrongShare(0.25)).toBe('exam');
    expect(levelFromWrongShare(0.55)).toBe('exam');
    expect(levelFromWrongShare(0.551)).toBe('challenge');
  });
});

describe('tallyFirstAttempts', () => {
  it('counts only each student\'s first try, by time', () => {
    const rows = [
      at('s1', 'q1', '2026-10-05T02:00:00Z', true),   // second try — ignored
      at('s1', 'q1', '2026-10-05T01:00:00Z', false),  // first try — wrong
      at('s2', 'q1', '2026-10-05T01:00:00Z', true),
    ];
    expect(tallyFirstAttempts(rows)).toEqual([{ questionId: 'q1', attempts: 2, wrong: 1, wrongShare: 0.5 }]);
  });
  it('leaves out the preview identity', () => {
    const rows = [at('demo', 'q1', '2026-10-05T01:00:00Z', false), at('s2', 'q1', '2026-10-05T01:00:00Z', true)];
    expect(tallyFirstAttempts(rows, new Set(['demo']))).toEqual([{ questionId: 'q1', attempts: 1, wrong: 0, wrongShare: 0 }]);
  });
});

describe('resultsRows', () => {
  it('writes only questions with enough first attempts', () => {
    const many = Array.from({ length: MIN_FIRST_ATTEMPTS }, (_, i) => at(`s${i}`, 'qA', '2026-10-05T01:00:00Z', i >= 12)); // 12 wrong of 20
    const few = Array.from({ length: MIN_FIRST_ATTEMPTS - 1 }, (_, i) => at(`s${i}`, 'qB', '2026-10-05T01:00:00Z', false));
    const t = tallyFirstAttempts([...many, ...few]);
    const rows = resultsRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ question_id: 'qA', level: 'challenge', source: 'results', attempts: 20, wrong: 12, wrong_share: 0.6 });
    expect(tallySummary(t)).toEqual({ questionsTried: 2, firstAttempts: 39, enough: 1, maxOnOne: 20 });
  });
});

describe('estimate', () => {
  it('reads the test solve tries', () => {
    expect(testSolveOf([true, true])).toBe('right');
    expect(testSolveOf([false, false])).toBe('wrong');
    expect(testSolveOf([true, false])).toBe('split');
    expect(testSolveOf([null])).toBeNull();
  });
  it('work score sets the level, the test solve moves it', () => {
    expect(estimateLevel(1, 'right')).toBe('core');
    expect(estimateLevel(2, 'split')).toBe('core');
    // a wrong test solve moves a question up only from work 3 (5 Oct 2026)
    expect(estimateLevel(1, 'wrong')).toBe('core');
    expect(estimateLevel(2, 'wrong')).toBe('core');
    expect(estimateLevel(3, 'right')).toBe('exam');
    expect(estimateLevel(3, 'wrong')).toBe('challenge');
    expect(estimateLevel(4, 'right')).toBe('exam');
    expect(estimateLevel(4, 'split')).toBe('challenge');
    expect(estimateLevel(5, 'right')).toBe('challenge');
  });
});

describe('SERVED_DIFFICULTY_SOURCES', () => {
  it('serves results, estimates and science twins — never the sample', async () => {
    const { SERVED_DIFFICULTY_SOURCES } = await import('./practice-difficulty');
    expect([...SERVED_DIFFICULTY_SOURCES].sort()).toEqual(['estimate', 'results', 'twin']);
    expect(SERVED_DIFFICULTY_SOURCES).not.toContain('estimate-sample');
  });
});

import { stepFromResults, movedRecently, planScienceRows, MATH_STEPS, SCIENCE_STEPS, type ScienceStored } from './practice-difficulty';

describe('stepFromResults — every level up and down, one step, with a margin (4 Nov 2026)', () => {
  it('maths lines: Core↔Advanced 25/55 %, Advanced↔Challenge 50/75 %', () => {
    expect(stepFromResults(0, 0.56, MATH_STEPS)).toBe(1);
    expect(stepFromResults(0, 0.9, MATH_STEPS)).toBe(1);          // never two steps
    expect(stepFromResults(1, 0.24, MATH_STEPS)).toBe(0);
    expect(stepFromResults(1, 0.76, MATH_STEPS)).toBe(2);
    expect(stepFromResults(1, 0.5, MATH_STEPS)).toBeNull();
    expect(stepFromResults(2, 0.49, MATH_STEPS)).toBe(1);
    expect(stepFromResults(2, 0.6, MATH_STEPS)).toBeNull();
  });
  it('the margin: a question just past a line does not bounce straight back', () => {
    // moved up to Advanced at 56 % wrong; at 30 % it does NOT drop back (needs under 25 %)
    expect(stepFromResults(1, 0.3, MATH_STEPS)).toBeNull();
    // science: up to Exam at 31 %, back to Core only under 20 %
    expect(stepFromResults(0, 0.31, SCIENCE_STEPS)).toBe(1);
    expect(stepFromResults(1, 0.22, SCIENCE_STEPS)).toBeNull();
    expect(stepFromResults(1, 0.19, SCIENCE_STEPS)).toBe(0);
  });
});

describe('movedRecently', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  it('within 28 days → true; older or never → false', () => {
    expect(movedRecently('2026-11-10T00:00:00Z', now)).toBe(true);
    expect(movedRecently('2026-10-01T00:00:00Z', now)).toBe(false);
    expect(movedRecently(null, now)).toBe(false);
  });
});

describe('planScienceRows', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  const t = (id: string, attempts: number, wrong: number) => ({ questionId: id, attempts, wrong, wrongShare: wrong / attempts });
  it('the first results sort replaces an estimate outright', () => {
    const ex = new Map<string, ScienceStored>([['a', { level: 'core', source: 'estimate' }]]);
    const { rows, moves } = planScienceRows([t('a', 20, 15)], ex, now);
    expect(rows[0].level).toBe('challenge');
    expect(moves).toEqual([{ question_id: 'a', from: 'core', to: 'challenge' }]);
    expect(rows[0].detail.moved_at).toBe(now.toISOString());
  });
  it('after that: one step, and not again within 4 weeks', () => {
    const ex = new Map<string, ScienceStored>([
      ['a', { level: 'core', source: 'results', detail: { moved_at: '2026-10-01T00:00:00Z' } }],
      ['b', { level: 'core', source: 'results', detail: { moved_at: '2026-11-25T00:00:00Z' } }],
    ]);
    const { rows, moves } = planScienceRows([t('a', 20, 18), t('b', 20, 18)], ex, now);
    expect(rows.find(r => r.question_id === 'a')?.level).toBe('exam');      // one step, not challenge
    expect(rows.find(r => r.question_id === 'b')?.level).toBe('core');      // moved 6 days ago: stays
    expect(moves).toHaveLength(1);
  });
  it('under 20 tries: no row', () => {
    expect(planScienceRows([t('a', 19, 19)], new Map(), now).rows).toHaveLength(0);
  });
});
