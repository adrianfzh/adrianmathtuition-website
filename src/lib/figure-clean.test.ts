import { describe, it, expect } from 'vitest';
import {
  whitePointFor, greyHistogram, looksLikeAreaTone, midShare,
  PAGE_FRACTION, WP_FLOOR, INK_CEILING, MIN_MIDTONE, FAINT_MIN, AREA_RATIO_MIN,
} from './figure-clean';

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

  it('leaves clean line art alone even though it is not pure bilevel', () => {
    // A digital diagram: black lines with a thin anti-alias fringe on a white
    // page. Measured, the ink pass takes ink OFF these. 0.5% faint is under the
    // 2% bar, so nothing happens — this is most of the bank.
    expect(whitePointFor(hist([[0, 800], [190, 50], [255, 9150]]))).toBeNull();
  });

  it('still deepens the INK on a page that is already white', () => {
    // The regression this exists for: once the ogive's background was whitened,
    // the old rule reported ~254, the lift became the identity and the button
    // said "nothing to clean" while the grid still read faint. A white page
    // must be held at the ink ceiling so the LINES get pulled down.
    // 5% of the page is faint grid ink — a scan, and over the 2% bar.
    expect(whitePointFor(hist([[60, 500], [200, 500], [255, 9000]]))).toBe(INK_CEILING);
  });

  it('returns null on art that is already black and white', () => {
    // A vector render or an already-cleaned scan: no mid-tones to deepen, so
    // doing nothing beats burning a bucket object on an invisible change.
    expect(whitePointFor(hist([[0, 1200], [255, 8800]]))).toBeNull();
  });

  it('treats a whisker of faint ink as already clean, but not a real grid', () => {
    // Under the 2% faint bar (anti-aliasing on vector art) → no-op …
    expect(whitePointFor(hist([[0, 1000], [180, 150], [255, 8850]]))).toBeNull();
    // … and over it (a genuine faint grid) → clean.
    expect(whitePointFor(hist([[0, 1000], [180, 400], [255, 8600]]))).toBe(INK_CEILING);
  });

  it('a GREY page still cleans however little faint ink it has', () => {
    // There the lift is fixing the background, which always helps — the faint
    // bar only gates the ink-pass-alone case.
    const h = hist([[60, 300], [230, 8000], [240, 900], [255, 800]]);
    expect(whitePointFor(h)).toBeLessThan(INK_CEILING);
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
    expect(FAINT_MIN).toBe(0.02);
  });
});

describe('looksLikeAreaTone', () => {
  // The real measurements from the batch of 45 that had to be reverted:
  // [full-res mid share, 1/12-scale mid share].
  const AREA: [string, number, number][] = [
    ['BWSS 2023 table photograph', 0.9098, 0.9134],
    ['CHIJ 2020 baby pictograms',  0.1490, 0.2021],
    ['East Spring 2018 shaded region', 0.2983, 0.4095],
    ['GCE 2020 shaded trapezium',  0.1952, 0.2975],
  ];
  const STROKES: [string, number, number][] = [
    ['GCE 2022 ogive',          0.1000, 0.3091],
    ['SCGS 2022 cum-freq',      0.1370, 0.4625],
    ['Greenridge 2025 grid',    0.1185, 0.4008],
    ['Bukit Merah 2023 tables', 0.0919, 0.3382],
    ['ACS 2025 hatched region', 0.0459, 0.1856],
  ];

  it.each(AREA)('protects %s (a lift would wash it out)', (_n, full, small) => {
    expect(looksLikeAreaTone(full, small)).toBe(true);
  });

  it.each(STROKES)('still cleans %s (thin strokes, not area)', (_n, full, small) => {
    expect(looksLikeAreaTone(full, small)).toBe(false);
  });

  it('keeps a real margin either side of the bar', () => {
    // The worst area case and the best stroke case must not be adjacent, or the
    // guard is luck rather than a measurement.
    const worstArea = Math.max(...AREA.map(([, f, s]) => s / f));
    const bestStroke = Math.min(...STROKES.map(([, f, s]) => s / f));
    expect(worstArea).toBeLessThan(AREA_RATIO_MIN);
    expect(bestStroke).toBeGreaterThan(AREA_RATIO_MIN);
    expect(bestStroke - worstArea).toBeGreaterThan(1.0);
  });

  it('ignores a figure with almost no mid-tone at all', () => {
    // Pure black-on-white line art has no area to protect; the ratio there is
    // noise, so it must not be allowed to veto anything.
    expect(looksLikeAreaTone(0.001, 0.0005)).toBe(false);
  });

  it('midShare counts only the mid band', () => {
    expect(midShare(Uint8Array.from([0, 10, 100, 200, 250, 255]))).toBeCloseTo(2 / 6);
  });
});
