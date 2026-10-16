import { describe, it, expect } from 'vitest';
import { leafParts, seedPartLabelRows, SOURCE } from './twin-part-labels.mjs';

const seed = { id: 'S', parts: [{ label: 'a', marks: 2 }, { label: 'b', subparts: [{ label: 'i', marks: 1 }, { label: 'ii', marks: 3 }] }] };
const twin = { id: 'T', parts: JSON.stringify([{ label: '(a)', marks: 2 }, { label: 'b', parts: [{ label: 'i', marks: 1 }, { label: 'ii', marks: 3 }] }]) };
const rows = [
  { part_path: 'a', subgroup_id: 10, marks: 2, confidence: 0.9 },
  { part_path: 'b.ii', subgroup_id: 11, marks: 3, confidence: 0.9 },
];

describe('twin part labels from the seed', () => {
  it('leaf paths are the bot filer\'s (a, b.i, b.ii), brackets stripped, string parts parsed', () => {
    expect(leafParts(twin)).toEqual([{ path: 'a', marks: 2 }, { path: 'b.i', marks: 1 }, { path: 'b.ii', marks: 3 }]);
    expect(leafParts({ parts: [{ label: 'a', marks: 4 }] })).toEqual([]);
  });
  it('copies every seed label to the twin when paths and marks line up', () => {
    const r = seedPartLabelRows(twin, seed, rows);
    expect(r.why).toBeNull();
    expect(r.rows).toEqual([
      { question_id: 'T', part_path: 'a', subgroup_id: 10, marks: 2, confidence: 0.9, reason: 'copied from seed S', source: SOURCE },
      { question_id: 'T', part_path: 'b.ii', subgroup_id: 11, marks: 3, confidence: 0.9, reason: 'copied from seed S', source: SOURCE },
    ]);
  });
  it('copies nothing when a mark differs', () => {
    const t2 = { id: 'T', parts: [{ label: 'a', marks: 3 }, { label: 'b', subparts: [{ label: 'i', marks: 1 }, { label: 'ii', marks: 3 }] }] };
    expect(seedPartLabelRows(t2, seed, rows).rows).toEqual([]);
  });
  it('copies nothing when the part paths differ', () => {
    const t3 = { id: 'T', parts: [{ label: 'a', marks: 2 }, { label: 'b', marks: 1 }, { label: 'c', marks: 3 }] };
    expect(seedPartLabelRows(t3, seed, rows).rows).toEqual([]);
  });
  it('copies nothing when the seed has no labels', () => {
    expect(seedPartLabelRows(twin, seed, []).why).toBe('seed has no part labels');
  });
  it('every publish path calls it', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['scripts/twins/twin.mjs', 'scripts/science-twins/sci-stwin.mjs', 'src/lib/twin-store.ts']) expect(readFileSync(f, 'utf8')).toContain('copySeedPartLabels(');
  });
});
