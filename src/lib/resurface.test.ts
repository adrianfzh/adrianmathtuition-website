import { describe, expect, it } from 'vitest';
import { pickResurface, resurfaceCandidates, resurfaceLine } from './resurface';
import type { StreamItem } from './notebook-stream';

const item = (id: string, kind: StreamItem['kind'], extra: Partial<StreamItem> = {}): StreamItem => ({
  id, kind, title: id, subtitle: '', at: '2026-09-01T00:00:00Z', haystack: id, ...extra,
});
const live = (id: string) => item(id, 'mistake', { mistake: { id, state: 'dark', live: true, seen: 2, cameBack: false, where: '', practice: [] } });
const fixed = (id: string) => item(id, 'mistake', { mistake: { id, state: 'fixed', live: false, seen: 2, cameBack: false, where: '', practice: [] } });

describe('resurfaceCandidates', () => {
  it('takes live mistakes, saved answers and read photos; not fixed mistakes, pages or unread photos', () => {
    const pool = resurfaceCandidates([live('m1'), fixed('m2'), item('s1', 'saved'), item('p1', 'adrian'), item('ph1', 'photo'), item('ph2', 'photo', { tag: { text: 'Chain rule', tone: 'sky' } })]);
    expect(pool.map(i => i.id)).toEqual(['m1', 's1', 'ph2']);
  });
});

describe('pickResurface', () => {
  const items = [live('m1'), live('m2'), item('s1', 'saved'), item('s2', 'saved')];
  it('is deterministic for a student and a day', () => {
    expect(pickResurface(items, 'rec1', '2026-09-11')?.id).toBe(pickResurface(items, 'rec1', '2026-09-11')?.id);
  });
  it('rotates across days and reaches every bucket over a week', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 9; d++) seen.add(pickResurface(items, 'rec1', `2026-09-0${d}`.replace('-0', d < 10 ? '-0' : '-'))!.id);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect([...seen].some(id => id.startsWith('s'))).toBe(true);
    expect([...seen].some(id => id.startsWith('m'))).toBe(true);
  });
  it('gives nothing with an empty book, and a saved answer when there are no live mistakes', () => {
    expect(pickResurface([], 'rec1', '2026-09-11')).toBeNull();
    expect(pickResurface([fixed('m9'), item('s1', 'saved')], 'rec1', '2026-09-11')?.id).toBe('s1');
  });
});

describe('resurfaceLine', () => {
  it('speaks to the kind', () => {
    expect(resurfaceLine(live('m1'))).toMatch(/Thirty seconds/);
    expect(resurfaceLine(item('s1', 'saved'))).toMatch(/without looking/);
  });
});
