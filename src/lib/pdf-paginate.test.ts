import { describe, it, expect } from 'vitest';
import { chooseCutRows, A4_RATIO } from './pdf-paginate';

const rows = (n: number, ink = 5) => new Array(n).fill(ink);

describe('chooseCutRows', () => {
  it('a page within 1.1 chunks is left whole', () => {
    expect(chooseCutRows(rows(1000), 1000, 100)).toEqual([]);
    expect(chooseCutRows(rows(1099), 1000, 100)).toEqual([]);
  });

  it('cuts land on the blank row nearest the ideal cut', () => {
    const r = rows(2000);
    r[950] = 0;
    r[900] = 0;
    const cuts = chooseCutRows(r, 1000, 200);
    expect(cuts[0]).toBe(950);   // nearest-to-ideal blank wins over an earlier one
  });

  it('with no blank row in the window, the least-inky row wins', () => {
    const r = rows(2000, 50);
    r[920] = 3;
    expect(chooseCutRows(r, 1000, 200)[0]).toBe(920);
  });

  it('never cuts in the top 55% of a chunk', () => {
    const r = rows(2000);
    r[100] = 0;   // blank, but far too early
    const cuts = chooseCutRows(r, 1000, 5000);
    expect(cuts[0]).toBeGreaterThanOrEqual(550);
  });

  it('a very tall page gets multiple monotonically increasing cuts', () => {
    const r = rows(3500);
    for (let i = 0; i < r.length; i += 97) r[i] = 0;
    const cuts = chooseCutRows(r, 1000, 150);
    expect(cuts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]).toBeGreaterThan(cuts[i - 1]);
    // every remaining chunk fits a chunk with tolerance
    const bounds = [0, ...cuts, r.length];
    for (let i = 0; i < bounds.length - 1; i++) expect(bounds[i + 1] - bounds[i]).toBeLessThanOrEqual(1100);
  });

  it('degenerate inputs are safe', () => {
    expect(chooseCutRows([], 100, 10)).toEqual([]);
    expect(chooseCutRows(rows(50), 0, 10)).toEqual([]);
    expect(chooseCutRows(rows(50), NaN, 10)).toEqual([]);
  });

  it('A4_RATIO matches the PDF point geometry', () => {
    expect(A4_RATIO).toBeCloseTo(842 / 595, 5);
  });
});

describe('chooseCutRows — a seam beats a near miss (6 Sep 2026)', () => {
  it('cuts at the blank gap between cards even when it lies above the small window', () => {
    // 1000-px chunks. A card border puts 4 px of ink on every row from 600 to 1400,
    // a 30-px blank gap sits at rows 570–599, and lines of working alternate 0/40.
    const rowInk: number[] = [];
    for (let r = 0; r < 2000; r++) {
      if (r >= 570 && r < 600) rowInk.push(0);
      else if (r >= 600 && r < 1400) rowInk.push(4 + (r % 30 < 15 ? 40 : 0));
      else rowInk.push(r % 30 < 15 ? 40 : 0);
    }
    const cuts = chooseCutRows(rowInk, 1000, 120);
    expect(cuts[0]).toBeGreaterThanOrEqual(570);
    expect(cuts[0]).toBeLessThan(600);
  });
  it('keeps the old behaviour when no blank row exists anywhere in reach', () => {
    const rowInk = new Array(2000).fill(4);
    const cuts = chooseCutRows(rowInk, 1000, 120);
    expect(cuts[0]).toBe(1000);
  });
});
