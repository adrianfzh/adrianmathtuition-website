import { describe, it, expect } from 'vitest';
import { textLineShare, TEXT_MIN, TEXT_BAND, SMALL_PX, BLANK_INK } from './figure-checks';

/** Build a greyscale raster: rows of text-like ink, then a diagram-like stroke. */
function raster(w: number, h: number, paint: (x: number, y: number) => boolean): Uint8Array {
  const g = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (paint(x, y)) g[y * w + x] = 0;
  return g;
}

describe('textLineShare', () => {
  it('sees a block of text lines', () => {
    // Words: short ink runs spread across most of the width, every few rows.
    const g = raster(400, 100, (x, y) => y % 6 < 2 && x > 20 && x < 360 && Math.floor(x / 7) % 3 !== 2);
    expect(textLineShare(g, 400, 100)).toBeGreaterThan(TEXT_MIN);
  });

  it('does not mistake a drawing for text', () => {
    // One long horizontal rule plus a diagonal — a diagram, not prose.
    const g = raster(400, 100, (x, y) => y === 50 || Math.abs(y - Math.round(x / 4)) < 2);
    expect(textLineShare(g, 400, 100)).toBeLessThan(TEXT_MIN);
  });

  it('ignores a solid band — that is a filled shape, not words', () => {
    const g = raster(400, 100, (_x, y) => y > 10 && y < 30);
    expect(textLineShare(g, 400, 100)).toBe(0);
  });

  it('is blind to text BELOW the band it looks at', () => {
    // The defect is words cropped in ABOVE the diagram; a label under it is fine.
    const g = raster(400, 100, (x, y) => y > 80 && x > 20 && x < 360 && Math.floor(x / 7) % 3 !== 2);
    expect(textLineShare(g, 400, 100)).toBe(0);
  });

  it('returns 0 for an empty image', () => {
    expect(textLineShare(raster(50, 50, () => false), 50, 50)).toBe(0);
  });

  it('keeps the thresholds where the figures were measured', () => {
    // Fuhua 2021's text-crops scored 6.2-14.0%, clean diagrams 0%, and the two
    // the eye had passed came in at 8.9% and 36.3%. 4% sits in that gap.
    expect(TEXT_MIN).toBe(0.04);
    expect(TEXT_BAND).toBe(0.42);
    expect(SMALL_PX).toBe(220);
    expect(BLANK_INK).toBe(0.01);
  });
});
