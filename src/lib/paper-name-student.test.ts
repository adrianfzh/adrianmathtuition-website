import { describe, it, expect } from 'vitest';
import { studentFromPaperName } from './paper-name-student';
import type { RosterStudent } from './scan-inbox';

const roster: RosterStudent[] = [
  { id: 'recLakshanya', name: 'Lakshanya Arunita Rajmohan' },
  { id: 'recKiara', name: 'Kiara Tan Jia Min' },
  { id: 'recLucasTan', name: 'Lucas Tan Wei Jie' },
  { id: 'recLucasLim', name: 'Lucas Lim' },
  { id: 'recIan', name: 'Ian Goh' },
  { id: 'recSijia', name: 'Tan Sijia' },
];

const who = (name: string) => {
  const m = studentFromPaperName(name, roster);
  return m.kind === 'tag' ? m.student.id : `ask:${m.reason}`;
};

describe('studentFromPaperName — whose paper, from the name Adrian gave it', () => {
  it('the two real names from 25–27 Oct 2026', () => {
    expect(who('lakshanya h2 math tys 2023 p1')).toBe('recLakshanya');
    expect(who('lakshanya h2 math tys specimen paper p1')).toBe('recLakshanya');
    expect(who('kiara am tys 2023 p1')).toBe('recKiara');
    expect(who('kiara am tys 2023 p2')).toBe('recKiara');
  });

  it('finds the name anywhere in the title, as a whole word', () => {
    expect(who('H2 TYS 2023 P1 - Lakshanya')).toBe('recLakshanya');
    expect(who('2024 prelim p2 (kiara)')).toBe('recKiara');
    expect(who('rajmohan practice set 3')).toBe('recLakshanya');
  });

  it('never guesses between two students with the same first name', () => {
    expect(who('lucas am tys 2023 p1')).toBe('ask:ambiguous');
    expect(who('em prelim 2024 p2 lucas')).toBe('ask:ambiguous');
    // …but a second word that settles it does
    expect(who('lucas lim am tys 2023 p1')).toBe('recLucasLim');
    expect(who('em prelim 2024 lucas lim')).toBe('recLucasLim');
    // "tan" is a maths word, so it cannot settle it from the end of the title — ask
    expect(who('em prelim 2024 lucas tan')).toBe('ask:ambiguous');
  });

  it('a name inside another word is not a match ("ian" in "kian")', () => {
    expect(who('kian am tys 2023 p1')).toBe('ask:none');
    expect(who('trigonometry with brian')).toBe('ask:none');
    expect(who('ian am tys 2023 p1')).toBe('recIan');
  });

  it('maths words are never read as names ("tan" is not Tan Sijia or Kiara Tan)', () => {
    expect(who('tan graphs worksheet')).toBe('ask:none');
    expect(who('sin cos tan practice')).toBe('ask:none');
  });

  it('two different students in one title → ask', () => {
    expect(who('practice set 2 kiara and lakshanya')).toBe('ask:ambiguous');
  });

  it('no name at all → ask', () => {
    expect(who('worksheet (3 photos)')).toBe('ask:none');
    expect(who('GCE 2024 Paper 1')).toBe('ask:none');
    expect(who('')).toBe('ask:none');
    expect(studentFromPaperName('kiara am tys 2023 p1', []).kind).toBe('ask');
  });
});
