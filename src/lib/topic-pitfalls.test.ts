import { describe, it, expect } from 'vitest';
import { pitfallSubjectForLevel, selectPitfalls, type PitfallRow } from './topic-pitfalls';

const row = (topic: string, wrong_move: string): PitfallRow => ({
  subject: 'AM', topic, wrong_move, why_wrong: null, corrective_cue: null,
});

describe('pitfallSubjectForLevel', () => {
  it('maps the plain levels', () => {
    expect(pitfallSubjectForLevel('AM')).toBe('AM');
    expect(pitfallSubjectForLevel('EM')).toBe('EM');
    expect(pitfallSubjectForLevel('S1')).toBe('S1');
    expect(pitfallSubjectForLevel('S2')).toBe('S2');
  });

  it('folds Sec 3 levels into their parent subject', () => {
    expect(pitfallSubjectForLevel('S3_AM')).toBe('AM');
    expect(pitfallSubjectForLevel('S3_EM')).toBe('EM');
    expect(pitfallSubjectForLevel('S3_EM_NA')).toBe('EM');
    expect(pitfallSubjectForLevel('S3_EM_NT')).toBe('EM');
  });

  it('folds every JC level onto JC', () => {
    expect(pitfallSubjectForLevel('JC1')).toBe('JC');
    expect(pitfallSubjectForLevel('JC2')).toBe('JC');
    expect(pitfallSubjectForLevel('JC2_H1')).toBe('JC');
  });

  it('maps the Normal (Academic) O-Level onto EM', () => {
    expect(pitfallSubjectForLevel('EM_NA')).toBe('EM');
  });

  it('returns null rather than guessing when the level is unknown or empty', () => {
    expect(pitfallSubjectForLevel('')).toBeNull();
    expect(pitfallSubjectForLevel(null)).toBeNull();
    expect(pitfallSubjectForLevel(undefined)).toBeNull();
    expect(pitfallSubjectForLevel('PHYSICS')).toBeNull();
  });

  it('S1/S2 win over the substring rules (S2 must not read as EM)', () => {
    // Regression: an `includes('EM')`-first ordering would never reach S1/S2.
    expect(pitfallSubjectForLevel('S1')).not.toBe('EM');
    expect(pitfallSubjectForLevel('S2')).not.toBe('EM');
  });
});

describe('selectPitfalls', () => {
  const rows = [
    row('Vectors', 'Writing ab or a/b for two vectors'),
    row('Vectors', 'Treating collinearity without a common point'),
    row('Logarithms', 'Keeping a negative root of a log equation'),
  ];

  it('returns only traps whose topic the question actually carries', () => {
    const got = selectPitfalls(rows, ['Vectors']);
    expect(got).toHaveLength(2);
    expect(got.every(r => r.topic === 'Vectors')).toBe(true);
  });

  it('matches topics case- and whitespace-insensitively', () => {
    expect(selectPitfalls(rows, ['  vectors '])).toHaveLength(2);
  });

  it('caps the list so the grader is never handed a long checklist', () => {
    const many = Array.from({ length: 20 }, (_, i) => row('Vectors', `trap ${i}`));
    expect(selectPitfalls(many, ['Vectors'], 4)).toHaveLength(4);
  });

  it('dedupes identical wrong moves', () => {
    const dupes = [row('Vectors', 'Same slip'), row('Vectors', 'same slip  ')];
    expect(selectPitfalls(dupes, ['Vectors'])).toHaveLength(1);
  });

  it('returns nothing when the question has no topics or nothing matches', () => {
    expect(selectPitfalls(rows, [])).toEqual([]);
    expect(selectPitfalls(rows, ['Kinematics'])).toEqual([]);
    expect(selectPitfalls([], ['Vectors'])).toEqual([]);
  });

  it('skips rows with no wrong_move rather than emitting a blank bullet', () => {
    const blank = [{ ...row('Vectors', ''), wrong_move: '' }];
    expect(selectPitfalls(blank, ['Vectors'])).toEqual([]);
  });
});

describe('selectPitfalls relevance ranking', () => {
  // The real motivator: AM "Logarithms" holds 15 traps but only 4 are sent, so
  // an unranked slice usually drops the one that actually applies.
  const many: PitfallRow[] = [
    row('Logarithms', 'Dropping the minus sign when rounding a negative display'),
    row('Logarithms', 'Reading the minus in lg(2-x) as a flip in the x axis'),
    row('Logarithms', 'Setting the expression inside the log equal to one'),
    row('Logarithms', 'Drawing the model curve for negative time as well'),
    row('Logarithms', 'Bringing the square down: treating a squared logarithm as a multiple'),
  ];

  it('promotes the trap whose wording overlaps the question', () => {
    const got = selectPitfalls(many, ['Logarithms'], 2,
      'Solve the equation where a squared logarithm appears; bringing the square down loses a root');
    expect(got[0].wrong_move).toContain('Bringing the square down');
  });

  it('keeps original order when no context is supplied', () => {
    const got = selectPitfalls(many, ['Logarithms'], 2);
    expect(got[0].wrong_move).toContain('Dropping the minus sign');
  });

  it('does not rank when everything already fits under the cap', () => {
    const got = selectPitfalls(many, ['Logarithms'], 10, 'squared logarithm');
    expect(got).toHaveLength(5);
    expect(got[0].wrong_move).toContain('Dropping the minus sign');
  });

  it('is stable — equal overlap falls back to original order', () => {
    const got = selectPitfalls(many, ['Logarithms'], 3, 'completely unrelated wording');
    expect(got.map(r => r.wrong_move)).toEqual(many.slice(0, 3).map(r => r.wrong_move));
  });
});
