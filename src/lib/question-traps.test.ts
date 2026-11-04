import { describe, it, expect } from 'vitest';
import { classifyTrap, trapLine, type TrapStat } from './question-traps';

const s = (students: number, lost: number, kind: string | null = null, kind_students = 0, part_label: string | null = null): TrapStat =>
  ({ question_id: 'q', students, lost, kind, kind_students, part_label, from_papers: students, from_practice: 0 });

describe('classifyTrap', () => {
  it('needs 5 students and MORE than half losing marks', () => {
    expect(classifyTrap(s(4, 4)).is_trap).toBe(false);
    expect(classifyTrap(s(6, 3)).is_trap).toBe(false);        // exactly half: not a trap
    expect(classifyTrap(s(6, 4)).is_trap).toBe(true);
  });
  it('names the mistake when at least half of those who lost marks share it', () => {
    const r = classifyTrap(s(9, 8, 'concept', 4, 'b'));
    expect(r.is_trap).toBe(true);
    expect(r.kind).toBe('concept');
    expect(r.part_label).toBe('b');
  });
  it('a trap with no single mistake when the kinds are spread', () => {
    const r = classifyTrap(s(9, 8, 'sign', 3));
    expect(r.is_trap).toBe(true);
    expect(r.kind).toBeNull();
  });
  it('never names "incomplete", and never a word outside the vocabulary', () => {
    expect(classifyTrap(s(9, 8, 'incomplete', 8)).kind).toBeNull();
    expect(classifyTrap(s(9, 8, 'ratio_inversion', 8)).kind).toBeNull();
  });
  it('not a trap → no kind stored', () => {
    expect(classifyTrap(s(9, 2, 'concept', 2)).kind).toBeNull();
  });
});

describe('trapLine', () => {
  it('reads plainly, with the student word for the kind', () => {
    expect(trapLine({ students: 9, lost: 7, kind: 'transfer', kind_students: 5, part_label: '(b)' })).toBe('7 of 9 lost marks · 5 the same way: copied wrongly, in (b)');
    expect(trapLine({ students: 9, lost: 7, kind: null, kind_students: 0, part_label: null })).toBe('7 of 9 lost marks');
  });
});
