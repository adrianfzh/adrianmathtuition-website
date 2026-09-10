import { describe, it, expect } from 'vitest';
import { isUngroundedTotal, overCount, paperTotalText } from './paper-total-text';

// Adrian, 3 Sep 2026 (Kassandra, parts summed to 94 on a paper out of 90, 92
// awarded): "92 out of 90 is not possible … build it".
describe('paperTotalText — how the strip words the score', () => {
  it('a normal score is the plain label over a fraction', () => {
    expect(paperTotalText({ awarded: 89, max: 90 })).toEqual({ label: 'PAPER TOTAL', score: '89 / 90' });
  });

  it('full marks are normal — equal is not over', () => {
    expect(paperTotalText({ awarded: 90, max: 90 })).toEqual({ label: 'PAPER TOTAL', score: '90 / 90' });
    expect(overCount({ awarded: 90, max: 90 })).toBe(false);
  });

  it('a score above the total says so and never reads as a fraction', () => {
    expect(paperTotalText({ awarded: 92, max: 90 })).toEqual({
      label: 'PAPER TOTAL · NEEDS A CHECK', score: '92 of 90',
    });
    expect(overCount({ awarded: 92, max: 90 })).toBe(true);
  });

  it('one mark over is enough', () => {
    expect(paperTotalText({ awarded: 91, max: 90 }).score).toBe('91 of 90');
  });

  it('a paper with no usable total is never over-count — there is nothing to be over', () => {
    expect(overCount({ awarded: 5, max: 0 })).toBe(false);
    expect(overCount({ awarded: 5, max: NaN })).toBe(false);
    expect(paperTotalText({ awarded: 5, max: 0 })).toEqual({ label: 'PAPER TOTAL', score: '5 / 0' });
  });
});

// ── Marked without the question paper (Adrian, 10 Sep 2026) ─────────────────
// Isabelle's AM TYS 2025 P2: nothing to ground on, the marker's guessed
// allocations summing to 73, the registry insisting the paper is out of 90 —
// and the strip printing "68 / 90" as if that were a score.

describe('isUngroundedTotal — was this marked with no paper to check it against?', () => {
  const isabelle = { groundingSource: null, maxSource: 'registry', countedMax: 73, max: 90 };

  it('fires on Isabelle\'s run: nothing grounded it and 17 marks were never located', () => {
    expect(isUngroundedTotal(isabelle)).toBe(true);
  });

  it('never fires on a GROUNDED run, however short the counted total', () => {
    expect(isUngroundedTotal({ ...isabelle, groundingSource: 'bank' })).toBe(false);
    expect(isUngroundedTotal({ ...isabelle, groundingSource: 'attached' })).toBe(false);
    expect(isUngroundedTotal({ ...isabelle, groundingSource: 'stored-approved' })).toBe(false);
  });

  it('never fires when the denominator IS the counted sum — that total is honest', () => {
    expect(isUngroundedTotal({ ...isabelle, maxSource: 'counted' })).toBe(false);
    // …nor when the printed brackets were re-read and became the denominator.
    expect(isUngroundedTotal({ ...isabelle, maxSource: 'brackets' })).toBe(false);
  });

  it('never fires when the questions add up to the whole paper', () => {
    expect(isUngroundedTotal({ ...isabelle, countedMax: 90 })).toBe(false);
    expect(isUngroundedTotal({ ...isabelle, countedMax: 92 })).toBe(false);
  });

  it('a run whose shape it cannot read keeps yesterday\'s cover', () => {
    expect(isUngroundedTotal({})).toBe(false);
    expect(isUngroundedTotal({ maxSource: 'registry', max: 90 })).toBe(false);
    expect(isUngroundedTotal({ maxSource: 'registry', countedMax: 0, max: 90 })).toBe(false);
  });
});

describe('paperTotalText — the strip when the paper was missing', () => {
  it('prints what the marker could see, and says it is not the official total', () => {
    expect(paperTotalText({ awarded: 68, max: 90, countedMax: 73, ungrounded: true })).toEqual({
      label: 'MARKS SEEN · NOT THE OFFICIAL TOTAL', score: '68 / 73',
    });
  });

  it('a score above the paper total still outranks it', () => {
    expect(paperTotalText({ awarded: 92, max: 90, countedMax: 73, ungrounded: true }).label)
      .toBe('PAPER TOTAL · NEEDS A CHECK');
  });

  it('with no counted total to fall back on, nothing changes', () => {
    expect(paperTotalText({ awarded: 68, max: 90, countedMax: null, ungrounded: true })).toEqual({
      label: 'PAPER TOTAL', score: '68 / 90',
    });
  });

  it('every ordinary strip is byte-identical to the one it printed yesterday', () => {
    expect(paperTotalText({ awarded: 68, max: 90, countedMax: 73 })).toEqual({ label: 'PAPER TOTAL', score: '68 / 90' });
  });
});
