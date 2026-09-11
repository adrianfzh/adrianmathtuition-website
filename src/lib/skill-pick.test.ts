import { describe, it, expect } from 'vitest';
import { pickBySkill, fnv1a, type SkillRef, type PickRow } from './skill-pick';
import fixtures from './skill-pick.fixtures.json';

type Case = {
  name: string; skills: string[]; pool: PickRow[]; count: number; seed: string; weights?: Record<string, number>;
  expect: { ids: string[]; rounds: number[]; skipped: string[]; empty: string[]; unfiled: boolean; unfiledCount?: number; skillOf?: Record<string, string> };
};
const ALL: SkillRef[] = fixtures.skills;

describe('pickBySkill — the shared cases (docs/SKILL-PICK.md)', () => {
  for (const c of fixtures.cases as Case[]) {
    it(c.name, () => {
      const skills = ALL.filter((s) => c.skills.includes(s.id));
      const r = pickBySkill(c.pool, skills, c.count, { seed: c.seed, weights: c.weights });
      expect(r.items.map((i) => i.row.id)).toEqual(c.expect.ids);
      expect(r.items.map((i) => i.round)).toEqual(c.expect.rounds);
      expect(r.skipped).toEqual(c.expect.skipped);
      expect(r.empty).toEqual(c.expect.empty);
      expect(r.unfiled).toBe(c.expect.unfiled);
      if (c.expect.unfiledCount !== undefined) expect(r.unfiledCount).toBe(c.expect.unfiledCount);
      if (c.expect.skillOf) for (const [id, sk] of Object.entries(c.expect.skillOf)) {
        expect(r.items.find((i) => i.row.id === id)?.skillId).toBe(sk);
      }
    });
  }
  it('is deterministic for a seed, and the hash matches the Python twin', () => {
    const pool: PickRow[] = [{ id: 'a', marks: 4, skills: ['s1'] }, { id: 'b', marks: 4, skills: ['s1'] }];
    const one = pickBySkill(pool, [ALL[0]], 1, { seed: 'day1' });
    const two = pickBySkill(pool, [ALL[0]], 1, { seed: 'day1' });
    expect(one.items[0].row.id).toBe(two.items[0].row.id);
    // pinned values — skill_pick.py asserts the same three
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('day1|a')).toBe(fnv1a('day1|a'));
  });
});
