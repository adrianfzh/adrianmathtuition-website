import { describe, it, expect } from 'vitest';
import { allowedSubjects, subjectAllowed, subjectPill, paperSubjectFromName } from './portal-subjects';

describe('allowedSubjects — the subject gate', () => {
  it('E Math only sees E Math; both see both, in display order', () => {
    expect(allowedSubjects({ subjects: ['E Math'], level: 'Sec 4' })).toEqual(['E Math']);
    expect(allowedSubjects({ subjects: ['E Math', 'A Math'], level: 'Sec 4' })).toEqual(['A Math', 'E Math']);
    expect(allowedSubjects({ subjects: ['A Math'], level: 'Sec 3' })).toEqual(['A Math']);
  });
  it('JC is H2 whatever the tokens say; IP Math and plain Math are the O-Level family', () => {
    expect(allowedSubjects({ subjects: ['Math'], level: 'JC1' })).toEqual(['H2 Math']);
    expect(allowedSubjects({ subjects: ['IP Math'], level: 'Sec 3' })).toEqual(['A Math', 'E Math']);
    expect(allowedSubjects({ subjects: ['Math'], level: 'Sec 2' })).toEqual(['A Math', 'E Math']);
  });
  it('no subjects on the account hides nothing by accident', () => {
    expect(allowedSubjects({ subjects: null, level: 'Sec 4' })).toEqual(['E Math', 'A Math']);
    expect(allowedSubjects(null)).toEqual(['A Math', 'E Math', 'H2 Math']);
  });
});

describe('subjectAllowed and the pill', () => {
  it('Other is visible to everyone and has no tile', () => {
    expect(subjectAllowed({ subjects: ['E Math'] }, 'Other')).toBe(true);
    expect(subjectAllowed({ subjects: ['E Math'] }, 'A Math')).toBe(false);
    expect(subjectAllowed({ subjects: ['E Math'] }, null)).toBe(true);
  });
  it('pills read AM / EM / H2', () => {
    expect(subjectPill('A Math')).toEqual({ text: 'AM', tone: 'am' });
    expect(subjectPill('E Math')).toEqual({ text: 'EM', tone: 'em' });
    expect(subjectPill(null)).toBeNull();
  });
});

describe('paperSubjectFromName mirrors the bot', () => {
  it('reads the paper name', () => {
    expect(paperSubjectFromName('kiara am tys 2022 p1')).toBe('A Math');
    expect(paperSubjectFromName('Emath O2022')).toBe('E Math');
    expect(paperSubjectFromName('sample paper')).toBeNull();
  });
});
