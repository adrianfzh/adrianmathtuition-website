import { describe, expect, it } from 'vitest';
import { arrayMove, checkSlotPermutation, reassignSlots, slotChanges } from './unit-reorder';

const u = (id: string, unit_order: number | null, extra: Record<string, unknown> = {}) => ({
  id,
  unit_order,
  ...extra,
});

describe('arrayMove', () => {
  it('moves an item forward and back', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('does not mutate the input', () => {
    const list = ['a', 'b', 'c'];
    arrayMove(list, 0, 2);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});

describe('reassignSlots', () => {
  const units = [u('a', 112.01), u('b', 112.035), u('c', 112.05), u('d', 112.06)];

  it('keeps the slot set fixed and moves units across it (drag down)', () => {
    const out = reassignSlots(units, 0, 2);
    expect(out.map(x => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(out.map(x => x.unit_order)).toEqual([112.01, 112.035, 112.05, 112.06]);
  });

  it('drag up', () => {
    const out = reassignSlots(units, 3, 0);
    expect(out.map(x => x.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(out.map(x => x.unit_order)).toEqual([112.01, 112.035, 112.05, 112.06]);
  });

  it('mints no new numbers — the multiset of slots is unchanged', () => {
    const before = units.map(x => x.unit_order).sort();
    const after = reassignSlots(units, 1, 3).map(x => x.unit_order).sort();
    expect(after).toEqual(before);
  });

  it('carries every other field across untouched', () => {
    const rich = [u('a', 1, { title: 'A', kind: 'core' }), u('b', 2, { title: 'B', kind: 'try' })];
    const out = reassignSlots(rich, 0, 1);
    expect(out).toEqual([
      { id: 'b', unit_order: 1, title: 'B', kind: 'try' },
      { id: 'a', unit_order: 2, title: 'A', kind: 'core' },
    ]);
  });

  it('crosses a Part boundary by taking the other Part\'s slot (no Part rule, as learn-review)', () => {
    const parts = [u('p1a', 601.01), u('p1b', 601.02), u('p2a', 602.01), u('p2b', 602.02)];
    const out = reassignSlots(parts, 1, 2);
    // p1b now holds Part 2's first slot; p2a moved up into Part 1.
    expect(out.map(x => [x.id, x.unit_order])).toEqual([
      ['p1a', 601.01],
      ['p2a', 601.02],
      ['p1b', 602.01],
      ['p2b', 602.02],
    ]);
  });

  it('returns an unchanged copy when from === to or an index is out of range', () => {
    expect(reassignSlots(units, 2, 2)).toEqual(units);
    expect(reassignSlots(units, -1, 2)).toEqual(units);
    expect(reassignSlots(units, 0, 4)).toEqual(units);
    expect(reassignSlots(units, 1.5, 2)).toEqual(units);
    expect(reassignSlots(units, 0, 2)).not.toBe(units);
  });

  it('handles the empty and single-unit groups', () => {
    expect(reassignSlots([], 0, 0)).toEqual([]);
    expect(reassignSlots([u('only', 5)], 0, 0)).toEqual([u('only', 5)]);
  });

  it('normalises an unsorted input: slots are handed out ascending down the new order', () => {
    const unsorted = [u('x', 3), u('y', 1), u('z', 2)];
    const out = reassignSlots(unsorted, 0, 1);
    expect(out.map(x => [x.id, x.unit_order])).toEqual([
      ['y', 1],
      ['x', 2],
      ['z', 3],
    ]);
  });

  it('sorts a null slot as 0, like learn-review', () => {
    const withNull = [u('n', null), u('a', 1), u('b', 2)];
    const out = reassignSlots(withNull, 2, 0);
    expect(out.map(x => [x.id, x.unit_order])).toEqual([
      ['b', null],
      ['n', 1],
      ['a', 2],
    ]);
  });

  it('does not mutate the input units', () => {
    const copy = units.map(x => ({ ...x }));
    reassignSlots(units, 0, 3);
    expect(units).toEqual(copy);
  });
});

describe('slotChanges', () => {
  const before = [u('a', 1), u('b', 2), u('c', 3)];

  it('lists only the units whose slot moved', () => {
    const after = reassignSlots(before, 0, 1); // b:1 a:2 c:3
    expect(slotChanges(before, after)).toEqual([
      { id: 'b', unit_order: 1 },
      { id: 'a', unit_order: 2 },
    ]);
  });

  it('is empty when nothing moved', () => {
    expect(slotChanges(before, before)).toEqual([]);
  });

  it('ignores ids that were not in the before list', () => {
    expect(slotChanges(before, [u('zzz', 9)])).toEqual([]);
  });

  it('the changed subset is itself a permutation (what the route will check)', () => {
    const after = reassignSlots(before, 2, 0); // c:1 a:2 b:3 — all three move
    const changes = slotChanges(before, after);
    const was = new Map(before.map(x => [x.id, x.unit_order]));
    const have = changes.map(c => was.get(c.id)).sort();
    const want = changes.map(c => c.unit_order).sort();
    expect(have).toEqual(want);
  });
});

describe('checkSlotPermutation', () => {
  const topic = [u('a', 112.01), u('b', 112.02), u('c', 112.03), u('other', 112.9)];

  it('accepts a swap and reports only the rows that differ', () => {
    const r = checkSlotPermutation(topic, [
      { id: 'a', unit_order: 112.02 },
      { id: 'b', unit_order: 112.01 },
      { id: 'c', unit_order: 112.03 },
    ]);
    expect(r).toEqual({
      ok: true,
      changes: [
        { id: 'a', unit_order: 112.02 },
        { id: 'b', unit_order: 112.01 },
      ],
    });
  });

  it('accepts the changed-only body slotChanges produces', () => {
    const after = reassignSlots(topic.slice(0, 3), 2, 0);
    const r = checkSlotPermutation(topic, slotChanges(topic, after));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.changes.map(c => c.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('400s an id outside the topic', () => {
    const r = checkSlotPermutation(topic, [{ id: 'stranger', unit_order: 112.01 }]);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect((r as { error: string }).error).toMatch(/not in this topic/);
  });

  it('400s an empty body, a duplicate id, a non-string id and a non-finite slot', () => {
    expect(checkSlotPermutation(topic, [])).toMatchObject({ ok: false, status: 400 });
    expect(
      checkSlotPermutation(topic, [
        { id: 'a', unit_order: 112.02 },
        { id: 'a', unit_order: 112.01 },
      ]),
    ).toMatchObject({ ok: false, status: 400 });
    expect(checkSlotPermutation(topic, [{ id: 7, unit_order: 112.01 }])).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(checkSlotPermutation(topic, [{ id: 'a', unit_order: 'x' }])).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(checkSlotPermutation(topic, [{ id: 'a', unit_order: NaN }])).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('409s a slot the units do not currently hold (stale page / invented number)', () => {
    const r = checkSlotPermutation(topic, [
      { id: 'a', unit_order: 112.02 },
      { id: 'b', unit_order: 112.05 },
    ]);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it('409s a slot borrowed from a unit outside the request', () => {
    // `other` holds 112.9; a alone cannot take it — that would collide.
    expect(checkSlotPermutation(topic, [{ id: 'a', unit_order: 112.9 }])).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it('409s when a requested unit has no slot yet', () => {
    const withNull = [...topic, u('n', null)];
    const r = checkSlotPermutation(withNull, [
      { id: 'n', unit_order: 112.01 },
      { id: 'a', unit_order: 0 },
    ]);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((r as { error: string }).error).toMatch(/learn-review/);
  });

  it('a no-op body is ok with no changes', () => {
    expect(checkSlotPermutation(topic, [{ id: 'a', unit_order: 112.01 }])).toEqual({
      ok: true,
      changes: [],
    });
  });
});
