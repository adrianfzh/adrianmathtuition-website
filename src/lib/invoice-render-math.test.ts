import { describe, it, expect } from 'vitest';
import { reconciliationGap, renderedRowsSum, extraItemsTotal, invoiceFinalAmount } from './invoice-render-math';

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

describe('extraItemsTotal', () => {
  it('sums numeric and user-typed string amounts; garbage counts as 0', () => {
    expect(extraItemsTotal([{ amount: 350 }, { amount: '-70' }, { amount: 'abc' }])).toBe(280);
  });
  it('handles null/undefined/empty', () => {
    expect(extraItemsTotal(null)).toBe(0);
    expect(extraItemsTotal(undefined)).toBe(0);
    expect(extraItemsTotal([])).toBe(0);
  });
});

describe('invoiceFinalAmount', () => {
  it('base + adjustment + extras, nulls as zero', () => {
    expect(invoiceFinalAmount(280, 140, 0)).toBe(420);
    expect(invoiceFinalAmount(280, null, null)).toBe(280);
    expect(invoiceFinalAmount(null, null, null)).toBe(0);
  });
  it('rounds float dust to cents (never stores 420.00000000000006 in Airtable)', () => {
    expect(invoiceFinalAmount(0.1, 0.2, 0)).toBe(0.3);
    expect(invoiceFinalAmount(280, 69.996, 70.006)).toBe(420);
  });
});
