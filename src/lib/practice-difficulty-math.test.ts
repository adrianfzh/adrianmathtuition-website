import { describe, it, expect } from 'vitest';
import {
  mathLevelOf, mathAttemptWrong, tallyMathFirstAttempts, mathLevelFromWrongShare, planMathLevel, mathWeeklyLine,
  type MathAttempt, type FirstAttemptTally,
} from './practice-difficulty';

const a = (student: string, q: string, t: string, score: number | null, outOf: number | null, verdict = 'partial', helpSteps = 0): MathAttempt =>
  ({ student, questionId: q, attemptedAt: t, score, outOf, verdict, helpSteps });
const tally = (attempts: number, wrong: number): FirstAttemptTally => ({ questionId: 'q1', attempts, wrong, wrongShare: wrong / attempts });

describe('mathLevelOf', () => {
  it('reads the three stored values, anything else is Core', () => {
    expect(mathLevelOf('Advanced')).toBe('Advanced');
    expect(mathLevelOf('Challenging')).toBe('Challenging');
    expect(mathLevelOf('Standard')).toBe('Standard');
    expect(mathLevelOf(null)).toBe('Standard');
    expect(mathLevelOf('Medium')).toBe('Standard');
  });
});

describe('mathAttemptWrong', () => {
  it('wrong = under half the marks', () => {
    expect(mathAttemptWrong(a('s', 'q', 't', 2, 5))).toBe(true);
    expect(mathAttemptWrong(a('s', 'q', 't', 3, 6))).toBe(false);   // exactly half is not wrong
    expect(mathAttemptWrong(a('s', 'q', 't', 6, 6, 'correct'))).toBe(false);
  });
  it('any help step counts as wrong, even full marks', () => {
    expect(mathAttemptWrong(a('s', 'q', 't', 6, 6, 'correct', 1))).toBe(true);
  });
  it('no marks recorded → the verdict', () => {
    expect(mathAttemptWrong(a('s', 'q', 't', null, null, 'correct'))).toBe(false);
    expect(mathAttemptWrong(a('s', 'q', 't', null, null, 'partial'))).toBe(true);
  });
});

describe('tallyMathFirstAttempts', () => {
  it('counts each student\'s first try only, and leaves out the preview student', () => {
    const t = tallyMathFirstAttempts([
      a('s1', 'q1', '2026-10-02', 6, 6), a('s1', 'q1', '2026-10-01', 0, 6),   // earlier one counts: wrong
      a('s2', 'q1', '2026-10-01', 5, 6),
      a('prev', 'q1', '2026-10-01', 0, 6),
    ], new Set(['prev']));
    expect(t).toEqual([{ questionId: 'q1', attempts: 2, wrong: 1, wrongShare: 0.5 }]);
  });
});

describe('mathLevelFromWrongShare', () => {
  it('Core under 25 %, Advanced over 55 %, otherwise no change', () => {
    expect(mathLevelFromWrongShare(0.2)).toBe('Standard');
    expect(mathLevelFromWrongShare(0.4)).toBeNull();
    expect(mathLevelFromWrongShare(0.6)).toBe('Advanced');
  });
});

describe('planMathLevel', () => {
  it('too few tries: keeps the level, records the counts and the starting level', () => {
    const p = planMathLevel('Advanced', null, tally(19, 0));
    expect(p.write).toBeNull();
    expect(p.row).toMatchObject({ starting_level: 'Advanced', level: 'Advanced', source: 'start', attempts: 19 });
  });
  it('a tapped Advanced most students get → Core, starting level kept, change logged', () => {
    const p = planMathLevel('Advanced', null, tally(20, 2));
    expect(p.write).toBe('Standard');
    expect(p.change).toEqual({ from: 'Advanced', to: 'Standard' });
    expect(p.row).toMatchObject({ starting_level: 'Advanced', level: 'Standard', source: 'results' });
  });
  it('Core that most get wrong → Advanced', () => {
    expect(planMathLevel('Standard', null, tally(20, 12)).write).toBe('Advanced');
  });
  it('the middle band changes nothing', () => {
    const p = planMathLevel('Advanced', null, tally(30, 12));
    expect(p.write).toBeNull();
    expect(p.change).toBeNull();
  });
  it('Advanced that 3 in 4 get wrong → Challenge; one step at a time from Core (4 Nov 2026)', () => {
    expect(planMathLevel('Advanced', null, tally(40, 31)).write).toBe('Challenging');   // 77.5 %
    expect(planMathLevel('Advanced', null, tally(40, 30)).write).toBeNull();            // exactly 75 %: stays
    expect(planMathLevel('Standard', null, tally(40, 40)).write).toBe('Advanced');      // one step only
  });
  it('at most one move per 4 weeks', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    const recent = { starting_level: 'Standard', level: 'Advanced', source: 'results' as const, pinned: false, changed_at: '2026-11-20T00:00:00Z' };
    expect(planMathLevel('Advanced', recent, tally(40, 39), 20, now).write).toBeNull();
    const old = { ...recent, changed_at: '2026-10-20T00:00:00Z' };
    expect(planMathLevel('Advanced', old, tally(40, 39), 20, now).write).toBe('Challenging');
  });
  it('a Challenge question most students get first time → Advanced (4 Nov 2026)', () => {
    const p = planMathLevel('Challenging', null, tally(20, 9));   // 45% wrong
    expect(p.write).toBe('Advanced');
    expect(p.change).toEqual({ from: 'Challenging', to: 'Advanced' });
    expect(p.row).toMatchObject({ starting_level: 'Challenging', level: 'Advanced', source: 'results' });
  });
  it('a Challenge question stays while half or more get it wrong, or with too few tries', () => {
    expect(planMathLevel('Challenging', null, tally(20, 10)).write).toBeNull();   // exactly half: stays
    expect(planMathLevel('Challenging', null, tally(30, 25)).write).toBeNull();
    expect(planMathLevel('Challenging', null, tally(19, 0)).write).toBeNull();    // under 20 tries
  });
  it('even an easy Challenge question drops one step a night, not straight to Core', () => {
    expect(planMathLevel('Challenging', null, tally(40, 1)).write).toBe('Advanced');
  });
  it('set back to Challenge by hand after results → pinned, results leave it alone', () => {
    const stored = { starting_level: 'Challenging', level: 'Advanced', source: 'results' as const, pinned: false };
    const p = planMathLevel('Challenging', stored, tally(40, 2));
    expect(p.write).toBeNull();
    expect(p.row).toMatchObject({ pinned: true, level: 'Challenging' });
  });
  it('the starting level survives a second move', () => {
    const stored = { starting_level: 'Advanced', level: 'Standard', source: 'results' as const, pinned: false };
    const p = planMathLevel('Standard', stored, tally(40, 30));
    expect(p.write).toBe('Advanced');
    expect(p.row?.starting_level).toBe('Advanced');
  });
  it('a hand change after results pins the question: his tap wins', () => {
    const stored = { starting_level: 'Advanced', level: 'Standard', source: 'results' as const, pinned: false };
    const p = planMathLevel('Advanced', stored, tally(40, 2));
    expect(p.write).toBeNull();
    expect(p.row).toMatchObject({ pinned: true, level: 'Advanced' });
    const again = planMathLevel('Advanced', p.row, tally(50, 2));
    expect(again.write).toBeNull();
  });
});

describe('mathWeeklyLine', () => {
  it('empty week → nothing', () => expect(mathWeeklyLine([])).toBe(''));
  it('lists moves down first, then up, with the level words', () => {
    const line = mathWeeklyLine([
      { from_level: 'Advanced', to_level: 'Standard', starting_level: 'Advanced', attempts: 20, wrong: 2, label: 'A Math · Logarithms' },
      { from_level: 'Standard', to_level: 'Advanced', starting_level: 'Standard', attempts: 22, wrong: 14, label: 'E Math · Sets' },
      { from_level: 'Challenging', to_level: 'Advanced', starting_level: 'Challenging', attempts: 24, wrong: 6, label: 'E Math · Matrices' },
      { from_level: 'Advanced', to_level: 'Challenging', starting_level: 'Advanced', attempts: 30, wrong: 25, label: 'A Math · Proof' },
    ]);
    expect(line).toMatch(/moved 4 questions/);
    expect(line).toMatch(/2 moved down/);
    expect(line).toMatch(/A Math · Logarithms: Advanced → Core — 2 of 20 wrong/);
    expect(line).toMatch(/E Math · Matrices: Challenge → Advanced — 6 of 24 wrong/);
    expect(line).toMatch(/2 moved up/);
    expect(line).toMatch(/A Math · Proof: Advanced → Challenge — 25 of 30 wrong/);
    expect(line.indexOf('moved down')).toBeLessThan(line.indexOf('moved up'));
  });
});
