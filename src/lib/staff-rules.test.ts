import { describe, expect, it } from 'vitest';
import { cleanRuleInput, groupRules, moveWithinGroup, positionForNew, type StaffRule } from './staff-rules';

const r = (id: string, section: string, position: number): StaffRule => ({ id, section, body: id, important: false, position, updatedAt: '' });
const rules = [r('a', 'Students', 10), r('b', 'Students', 20), r('c', 'App', 30), r('d', 'Students', 40)];

describe('cleanRuleInput', () => {
  it('trims, squeezes spaces, defaults the group', () => {
    expect(cleanRuleInput({ body: '  Be   kind. ', section: '' })).toEqual({ ok: true, section: 'General', body: 'Be kind.', important: false });
  });
  it('refuses an empty rule', () => {
    expect(cleanRuleInput({ body: '   ' }).ok).toBe(false);
  });
  it('important only when exactly true', () => {
    expect(cleanRuleInput({ body: 'x', important: 'yes' })).toMatchObject({ important: false });
    expect(cleanRuleInput({ body: 'x', important: true })).toMatchObject({ important: true });
  });
});

describe('groupRules', () => {
  it('keeps groups in first-appearance order, rules by position', () => {
    const g = groupRules(rules);
    expect(g.map((x) => x.section)).toEqual(['Students', 'App']);
    expect(g[0].rules.map((x) => x.id)).toEqual(['a', 'b', 'd']);
  });
});

describe('positionForNew', () => {
  it('goes after the last rule of its group', () => {
    expect(positionForNew(rules, 'App')).toBe(35);
    expect(positionForNew(rules, 'Students')).toBe(50);
  });
  it('a new group goes at the end', () => {
    expect(positionForNew(rules, 'New')).toBe(50);
    expect(positionForNew([], 'New')).toBe(10);
  });
});

describe('moveWithinGroup', () => {
  it('swaps with the neighbour in the same group, skipping other groups', () => {
    expect(moveWithinGroup(rules, 'd', 'up')).toEqual([{ id: 'd', position: 20 }, { id: 'b', position: 40 }]);
  });
  it('cannot move past the ends', () => {
    expect(moveWithinGroup(rules, 'a', 'up')).toEqual([]);
    expect(moveWithinGroup(rules, 'c', 'down')).toEqual([]);
  });
});
