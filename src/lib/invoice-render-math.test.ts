import { describe, it, expect } from 'vitest';
import { reconciliationGap, renderedRowsSum } from './invoice-render-math';

describe('reconciliationGap', () => {
  // REGRESSION — Tan Heng Kang, July 2026: invoice sent to the parent showed
  // AMOUNT DUE $420 with only 4 × $70 = $280 itemised. The $140 of June
  // additional lessons lived solely in the Adjustment Amount field and never
  // rendered. The gap must surface as an explicit Adjustments row.
  it('surfaces a hand-amended adjustment that has no line item', () => {
    const items = [{ rate: 70 }, { rate: 70 }, { rate: 70 }, { rate: 70 }];
    expect(reconciliationGap(420, items, [], 70)).toBe(140);
  });

  it('is zero when rows fully explain the total', () => {
    const items = [{ rate: 70 }, { rate: 70 }, { rate: 70 }];
    expect(reconciliationGap(210, items, [], 70)).toBe(0);
  });

  it('uses the invoice rate when items carry no per-item rate', () => {
    expect(reconciliationGap(280, [{}, {}, {}, {}], [], 70)).toBe(0);
  });

  it('counts extras (incl. negative credits) toward the visible sum', () => {
    const extras = [{ amount: 350 }, { amount: '-70' }];
    expect(reconciliationGap(560, [{ rate: 70 }, { rate: 70 }, { rate: 70 }, { rate: 70 }], extras, 70)).toBe(0);
  });

  it('reports a negative gap for an unexplained credit', () => {
    expect(reconciliationGap(210, [{ rate: 70 }, { rate: 70 }, { rate: 70 }, { rate: 70 }], [], 70)).toBe(-70);
  });

  it('ignores sub-cent float noise', () => {
    expect(reconciliationGap(280.004, [{ rate: 70 }, { rate: 70 }, { rate: 70 }, { rate: 70 }], [], 70)).toBe(0);
  });
});

describe('renderedRowsSum', () => {
  it('handles missing arrays', () => {
    expect(renderedRowsSum(undefined, undefined, 70)).toBe(0);
  });
});
