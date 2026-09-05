import { describe, it, expect } from 'vitest';
import { gateLevelsBySubject, subjectOfLevelKey } from './practice-subject-gate';
import { ALL_QB_LEVELS, qbLevelsFor } from './qb-levels';

describe('subjectOfLevelKey — a QB level key names its paper subject', () => {
  it('reads every maths key the bank uses', () => {
    expect(subjectOfLevelKey('AM')).toBe('A Math');
    expect(subjectOfLevelKey('S3_AM')).toBe('A Math');
    expect(subjectOfLevelKey('EM')).toBe('E Math');
    expect(subjectOfLevelKey('EM_NA')).toBe('E Math');
    expect(subjectOfLevelKey('S3_EM')).toBe('E Math');
    expect(subjectOfLevelKey('JC1')).toBe('H2 Math');
    expect(subjectOfLevelKey('JC2')).toBe('H2 Math');
  });
  it('lower-sec and science keys name no paper subject', () => {
    expect(subjectOfLevelKey('S1')).toBeNull();
    expect(subjectOfLevelKey('S2')).toBeNull();
    expect(subjectOfLevelKey('PHY')).toBeNull();
    expect(subjectOfLevelKey('CHEM')).toBeNull();   // "EM" inside CHEM is not a token
    expect(subjectOfLevelKey('BIO')).toBeNull();
  });
});

describe('gateLevelsBySubject — the explicit gate over the level list', () => {
  it('an E Math-only Sec 4 sees only the EM key', () => {
    const acct = { subjects: ['E Math'], level: 'Sec 4' };
    expect(gateLevelsBySubject(qbLevelsFor(acct.level, acct.subjects), acct).map(l => l.key)).toEqual(['EM']);
    // Even when handed the whole admin list, AM/JC fall away and S1/S2/science stay.
    expect(gateLevelsBySubject(ALL_QB_LEVELS, acct).map(l => l.key))
      .toEqual(['S1', 'S2', 'S3_EM', 'EM', 'EM_NA', 'PHY', 'CHEM', 'BIO']);
  });
  it('both subjects keep both lists', () => {
    const acct = { subjects: ['E Math', 'A Math'], level: 'Sec 3' };
    expect(gateLevelsBySubject(qbLevelsFor(acct.level, acct.subjects), acct).map(l => l.key))
      .toEqual(['S3_EM', 'S3_AM', 'EM', 'AM']);
  });
  it('a JC account is H2 whatever its tokens say', () => {
    const acct = { subjects: ['Math'], level: 'JC1' };
    expect(gateLevelsBySubject(ALL_QB_LEVELS, acct).map(l => l.key))
      .toEqual(['S1', 'S2', 'JC1', 'JC2', 'PHY', 'CHEM', 'BIO']);
  });
  it('never empties a list by accident — a mis-tagged account keeps its level-only list', () => {
    const acct = { subjects: ['H2 Math'], level: 'Sec 4' };
    const levels = qbLevelsFor(acct.level, acct.subjects);   // [EM, AM] — nothing H2 to keep
    expect(gateLevelsBySubject(levels, acct)).toEqual(levels);
  });
  it('a stranger (no account) is gated by nothing', () => {
    expect(gateLevelsBySubject(ALL_QB_LEVELS, null)).toEqual(ALL_QB_LEVELS);
  });
});
