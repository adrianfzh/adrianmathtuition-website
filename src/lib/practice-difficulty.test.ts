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
