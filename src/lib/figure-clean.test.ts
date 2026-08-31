import { describe, it, expect } from 'vitest';
import { whitePointFor, greyHistogram, PAGE_FRACTION, WP_FLOOR, INK_CEILING, MIN_MIDTONE } from './figure-clean';

/** A histogram with `n` pixels spread over the given [grey, count] pairs. */
const hist = (pairs: [number, number][]) => {
  const h = new Array(256).fill(0);
  for (const [v, c] of pairs) h[v] += c;
  return h;
};

describe('whitePointFor', () => {
  it('finds the haze under a photocopied page', () => {
    // The real shape of the GCE 2022 EM P2 ogive scan: ~15% ink and grid below
    // 228, the rest a background smear from 228 up to pure white.
    const h = hist([[60, 1500], [180, 1000], [200, 1200], [230, 8900], [240, 13700], [248, 22000], [255, 41000]]);
    const wp = whitePointFor(h);
    expect(wp).not.toBeNull();
    expect(wp!).toBeGreaterThan(225);
    expect(wp!).toBeLessThan(245);
  });

  it('still deepens the INK on a page that is already white', () => {
    // The regression this exists for: once the ogive's background was whitened,
    // the old rule reported ~254, the lift became the identity and the button
    // said "nothing to clean" while the grid still read faint. A white page
    // must be held at the ink ceiling so the LINES get pulled down.
    expect(whitePointFor(hist([[60, 500], [200, 500], [255, 9000]]))).toBe(INK_CEILING);
  });

  it('returns null on art that is already black and white', () => {
    // A vector render or an already-cleaned scan: no mid-tones to deepen, so
    // doing nothing beats burning a bucket object on an invisible change.
    expect(whitePointFor(hist([[0, 1200], [255, 8800]]))).toBeNull();
  });

  it('treats a whisker of mid-tone as already clean, but not a real grid', () => {
    // Just under the threshold (anti-aliasing on vector art) → no-op …
    expect(whitePointFor(hist([[0, 1000], [150, 30], [255, 8970]]))).toBeNull();
    // … and just over it (a genuine faint grid) → clean.
    expect(whitePointFor(hist([[0, 1000], [150, 200], [255, 8800]]))).toBe(INK_CEILING);
  });

  it('never lifts a mostly-ink figure past the floor', () => {
    // A dark solid diagram: 80% of it is below 120. Without the clamp the white
    // point would land there and the lift would blow the drawing to white.
    // Asserted against a LITERAL, not WP_FLOOR — comparing to the constant
    // would just track any change to it and pin nothing.
    const wp = whitePointFor(hist([[30, 5000], [90, 3000], [120, 1000], [255, 1000]]));
    expect(wp).toBe(170);
    expect(wp!).toBeGreaterThan(120); // must not follow the ink down
  });

  it('reads the fraction from the top down, not the bottom up', () => {
    // 80% of this page is >= 200; a bottom-up reading would answer ~40.
    const wp = whitePointFor(hist([[40, 2000], [200, 4000], [255, 4000]]));
    expect(wp).toBe(200);
  });

  it('throws rather than divide by zero on an empty image', () => {
    expect(() => whitePointFor(new Array(256).fill(0))).toThrow();
  });

  it('greyHistogram counts every pixel exactly once', () => {
    const h = greyHistogram(Uint8Array.from([0, 0, 128, 255, 255, 255]));
    expect(h[0]).toBe(2); expect(h[128]).toBe(1); expect(h[255]).toBe(3);
    expect(h.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('keeps the tuned constants where the scans were measured', () => {
    // These three numbers ARE the behaviour; changing one silently changes
    // every clean in the bank, so pin them.
    expect(PAGE_FRACTION).toBe(0.80);
    expect(WP_FLOOR).toBe(170);
    expect(INK_CEILING).toBe(235);
    expect(MIN_MIDTONE).toBe(0.005);
  });
});
