import { describe, expect, it } from 'vitest';
// The GCE Set scripts' grid-width rule (scripts/gce-paper/figure-size.mjs) — publish.mjs
// stores its result, /app/print prints the grid at it.
import { gridColumns, gridWidthFromPixels } from '../../scripts/gce-paper/figure-size.mjs';

// A white greyscale image with full-height vertical lines at the given columns.
function image(width: number, height: number, lines: number[]) {
  const data = new Uint8Array(width * height).fill(255);
  for (const x of lines) for (let y = 0; y < height; y++) data[y * width + x] = 180;
  // a short text-like mark that must not count as a grid line
  for (let y = 0; y < height / 10; y++) data[y * width + 2] = 0;
  return data;
}

describe('grid width (24 Sep 2026: "is the graph to scale?")', () => {
  it('counts major squares from the spec', () => {
    expect(gridColumns({ xAxis: { min: 0, max: 16, step: 1, majorsPerStep: 1 } })).toBe(16);
    expect(gridColumns({ xAxis: { min: 0, max: 2, step: 0.5 } })).toBe(4);
    expect(gridColumns({})).toBeNull();
  });

  it('prints the PNG so one major square is 10 mm, margins included', () => {
    // 4 majors between x = 10 and x = 90 (20 px each) in a 100 px PNG → 5 majors' worth → 50 mm
    const data = image(100, 60, [10, 30, 50, 70, 90]);
    expect(gridWidthFromPixels(data, 100, 60, 1, 4)).toBe(50);
  });

  it('gives up rather than guess when there is no grid', () => {
    const blank = new Uint8Array(100 * 60).fill(255);
    expect(gridWidthFromPixels(blank, 100, 60, 1, 4)).toBeNull();
  });
});
