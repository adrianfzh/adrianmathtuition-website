import { describe, expect, it } from 'vitest';
import { askSubjectFor, isOwnAccount, splitLabel, studentSubjects } from './stuck-store';

describe('stuck-store pure pieces', () => {
  it('subjects from the Airtable multi-select', () => {
    expect(studentSubjects(['A Math', 'E Math'], 'Sec 4')).toEqual(['AM', 'EM']);
    expect(studentSubjects(['Math'], 'Sec 2')).toEqual(['EM']);
    expect(studentSubjects(undefined, 'JC1')).toEqual(['H2']);
  });
  it('an unprefixed topic goes to the one subject it can be', () => {
    const s = { id: 'r', name: 'x', level: 'Sec 4', subjects: ['AM' as const], active: true };
    expect(askSubjectFor('Trigonometry (Identities)', s)).toBe('AM');
    expect(askSubjectFor('Vectors', { ...s, subjects: ['EM'] })).toBe('EM');
    expect(askSubjectFor('Indices', s)).toBe('AM');                      // in both lists; the student takes A Math only
    expect(askSubjectFor('Indices', { ...s, subjects: ['AM', 'EM'] })).toBeNull(); // cannot tell → left out
  });
  it('one lost question per label part', () => {
    expect(splitLabel('Q11(a), Q20')).toEqual(['Q11(a)', 'Q20']);
    expect(splitLabel(null)).toEqual(['']);
  });
  it("leaves Adrian's own record out", () => {
    expect(isOwnAccount(' Adrian  Fong ')).toBe(true);
    expect(isOwnAccount('Adriana Fong')).toBe(false);
  });
});
