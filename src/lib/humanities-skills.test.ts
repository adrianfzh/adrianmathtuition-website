import { describe, it, expect } from 'vitest';
import { skillPicture, skillLineText, standingOf, SKILL_WINDOW, type SkillRunRow } from './humanities-skills';

let n = 0;
const run = (skill: string, lo: number, hi: number, max = 4, status = 'marked'): SkillRunRow =>
  ({ skill, status, level_lo: lo, level_hi: hi, levels_max: max, created_at: `2026-10-01T00:00:${String(n++).padStart(2, '0')}Z` });

describe('the skill picture', () => {
  it('no read answer, no line', () => {
    expect(skillPicture([])).toEqual([]);
    expect(skillPicture([run('inference', 2, 2, 3, 'queued'), run('inference', 2, 2, 3, 'failed')])).toEqual([]);
    expect(skillPicture([{ skill: 'purpose', status: 'marked', level_lo: null, level_hi: null, levels_max: 4, created_at: '2026-10-01' }])).toEqual([]);
  });

  it('one line per skill, weakest first', () => {
    const lines = skillPicture([
      run('inference', 3, 3, 3), run('reliability', 1, 2), run('comparison', 3, 3), run('reliability', 2, 2), run('reliability', 1, 1),
    ]);
    expect(lines.map(l => l.skill)).toEqual(['reliability', 'comparison', 'inference']);
    expect(lines[0]).toMatchObject({ answered: 3, lo: 1, hi: 2, max: 4, standing: 'practise' });
    expect(lines[2]).toMatchObject({ answered: 1, lo: 3, hi: 3, max: 3, standing: 'top' });
  });

  it('the words on the card', () => {
    expect(skillLineText({ skill: 'inference', answered: 4, lo: 3, hi: 3, max: 4, standing: 'steady' })).toBe('steady at Level 3');
    expect(skillLineText({ skill: 'reliability', answered: 2, lo: 1, hi: 2, max: 4, standing: 'practise' })).toBe('Level 1–2, practise this');
    expect(skillLineText({ skill: 'purpose', answered: 2, lo: 4, hi: 4, max: 4, standing: 'top' })).toBe('at the top, Level 4');
  });

  it('standing: top at the top level, practise two or more below it', () => {
    expect(standingOf(4, 4, 4)).toBe('top');
    expect(standingOf(3, 4, 4)).toBe('steady');
    expect(standingOf(3, 3, 4)).toBe('steady');
    expect(standingOf(2, 2, 4)).toBe('practise');
    expect(standingOf(2, 2, 3)).toBe('steady');
    expect(standingOf(1, 1, 3)).toBe('practise');
  });

  it('only the newest answers set the usual level; the count is all of them', () => {
    const old = Array.from({ length: 4 }, (_, i): SkillRunRow =>
      ({ skill: 'usefulness', status: 'marked', level_lo: 1, level_hi: 1, levels_max: 4, created_at: `2026-09-0${i + 1}T00:00:00Z` }));
    const fresh = Array.from({ length: SKILL_WINDOW }, (_, i): SkillRunRow =>
      ({ skill: 'usefulness', status: 'marked', level_lo: 3, level_hi: 3, levels_max: 4, created_at: `2026-10-0${i + 1}T00:00:00Z` }));
    const [line] = skillPicture([...old, ...fresh]);
    expect(line).toMatchObject({ answered: 9, lo: 3, hi: 3, standing: 'steady' });
  });

  it('a held answer (a wide range) still counts, and never flatters', () => {
    const [line] = skillPicture([run('how_far', 1, 3, 4, 'held'), run('how_far', 2, 2)]);
    expect(line).toMatchObject({ answered: 2, lo: 1, hi: 2 });
  });
});
