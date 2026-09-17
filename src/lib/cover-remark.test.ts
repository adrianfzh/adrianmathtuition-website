import { describe, it, expect } from 'vitest';
import { coverRemark, REMARK_BANK } from './cover-remark';
import { emptyErrorKindTotals } from './error-kinds';

const kinds = (o: Partial<{ careless: number; concept: number; incomplete: number; unlabelled: number }>) => {
  const t = emptyErrorKindTotals();
  t.careless = o.careless ?? 0; t.concept = o.concept ?? 0; t.incomplete = o.incomplete ?? 0; t.unlabelled = o.unlabelled ?? 0;
  t.lostTotal = t.careless + t.concept + t.incomplete + t.unlabelled;
  return t;
};

describe('coverRemark — a specific sentence or nothing', () => {
  it('full marks', () => {
    expect(coverRemark({ awarded: 80, max: 80, kinds: null })).toMatch(/^Full marks/);
  });
  it("Adrian's own example: a few marks, all careless", () => {
    expect(coverRemark({ awarded: 87, max: 90, kinds: kinds({ careless: 3 }) }))
      .toBe('Well done. The marks you lost are all careless mistakes, and those are the easiest to get back.');
  });
  it('mostly careless names the numbers', () => {
    expect(coverRemark({ awarded: 70, max: 80, kinds: kinds({ careless: 7, concept: 3 }) }))
      .toMatch(/^7 of the 10 marks you lost were careless mistakes\./);
  });
  it('mostly method points at the sections', () => {
    expect(coverRemark({ awarded: 60, max: 80, kinds: kinds({ careless: 4, concept: 14, incomplete: 2 }) }))
      .toMatch(/^14 of the 20 marks you lost were from using the wrong method\./);
  });
  it('stopping short', () => {
    expect(coverRemark({ awarded: 70, max: 80, kinds: kinds({ incomplete: 6, careless: 2, concept: 2 }) }))
      .toMatch(/^6 of the 10 marks you lost were because you stopped before the final answer\./);
  });
  it('says NOTHING when the kinds are mostly unlabelled or absent — never a generic line', () => {
    expect(coverRemark({ awarded: 60, max: 80, kinds: kinds({ careless: 2, unlabelled: 18 }) })).toBeNull();
    expect(coverRemark({ awarded: 60, max: 80, kinds: null })).toBeNull();
    expect(coverRemark({ awarded: 60, max: 0, kinds: null })).toBeNull();
  });
  it('adds the comparison only for a move of three points or more', () => {
    const base = { awarded: 72, max: 80, kinds: kinds({ careless: 8 }) };
    expect(coverRemark({ ...base, previous: { awarded: 60, max: 80 } })).toMatch(/Up from 75% last paper — keep it up\.$/);
    expect(coverRemark({ ...base, previous: { awarded: 78, max: 80 } })).toMatch(/Down from 98% last paper\.$/);
    expect(coverRemark({ ...base, previous: { awarded: 71, max: 80 } })).not.toMatch(/last paper/);
  });
});

it('every remark stays short — at most 25 words before the comparison', () => {
  for (const [k, t] of Object.entries(REMARK_BANK)) {
    if (k === 'up' || k === 'down') continue;
    expect((t as string).split(/\s+/).length, k).toBeLessThanOrEqual(25);
  }
});
