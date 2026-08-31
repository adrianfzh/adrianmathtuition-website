import { describe, it, expect } from 'vitest';
import {
  whitePointFor, pageEdgeFor, greyHistogram, curveLut, looksLikeAreaTone, midShare,
  PAGE_FRAC, PAGE_WIN, WP_FLOOR, CURVE_GAMMA, MIN_MIDTONE, FAINT_MIN, AREA_RATIO_MIN,
} from './figure-clean';
import fixtures from './__fixtures__/figure-histograms.json';

/** Real greyscale histograms off real bank figures, normalised to 100k pixels.
 *  Synthetic bands were tried first and were useless here: a perfect step edge
 *  interacts with the smoothing window quite differently from a real scan's
 *  shoulder, so the numbers they pinned were not the numbers production sees. */
type Fixture = { note: string; hist: number[] };
const FX = fixtures as unknown as Record<string, Fixture>;

describe('pageEdgeFor', () => {
  it('finds the bottom of a hazy page, above the ink', () => {
    // GCE 2022 EM P2 Q3 as scanned. 228 is just under the haze and well above
    // the grid a student reads values off.
    expect(pageEdgeFor(FX.hazyPage.hist)).toBe(228);
  });

  it('does NOT follow a dense grid down — the bug that erased graph paper', () => {
    // Bendemeer 2022 EM_NA Q22: the grid is most of the image, so the old
    // "80% of pixels lie above this" rule answered 182 and the lift then sent
    // the whole grid to white. The page is at 238 and the grid must survive.
    expect(pageEdgeFor(FX.graphPaper.hist)).toBe(238);
    expect(pageEdgeFor(FX.graphPaper.hist)).toBeGreaterThan(235);
  });

  it('reads a white page as white, and a fine grid as sitting under it', () => {
    expect(pageEdgeFor(FX.whitePage.hist)).toBe(244);
    expect(pageEdgeFor(FX.fineGrid.hist)).toBe(242);
  });
});

describe('whitePointFor', () => {
  it('cleans a hazy page at the haze, not at the ink', () => {
    expect(whitePointFor(FX.hazyPage.hist)).toBe(228);
  });

  it('still runs on a white page that has faint ink to deepen', () => {
    expect(whitePointFor(FX.whitePage.hist)).toBe(244);
  });

  it('holds a mostly-ink figure at the floor rather than blowing it out', () => {
    // A photograph reports a page of 77 — nonsense, because it has no page.
    expect(pageEdgeFor(FX.inkHeavy.hist)).toBeLessThan(WP_FLOOR);
    expect(whitePointFor(FX.inkHeavy.hist)).toBe(WP_FLOOR);
    // (and the area-tone guard refuses it outright before this ever renders)
  });

  it('leaves clean line art alone', () => {
    // Black lines, a whisker of anti-alias fringe, white page: nothing to gain.
    const h = new Array(256).fill(0);
    h[0] = 1000; h[255] = 8900;
    for (let v = 150; v <= 230; v++) h[v] += 100 / 81;
    expect(whitePointFor(h)).toBeNull();
  });

  it('throws rather than divide by zero on an empty image', () => {
    expect(() => whitePointFor(new Array(256).fill(0))).toThrow();
  });
});

describe('curveLut', () => {
  it('sends the page and everything above it to pure white', () => {
    const lut = curveLut(238);
    expect(lut[238]).toBe(255);
    expect(lut[255]).toBe(255);
  });

  it('DARKENS mid-grey instead of lightening it — the second bug', () => {
    // The old linear stretch sent grey 200 to 213 with a page of 235. A curve
    // must send it the other way, or a faint grid only gets fainter.
    const lut = curveLut(238);
    expect(lut[200]).toBeLessThan(200);
    expect(lut[150]).toBeLessThan(150);
    expect(lut[100]).toBeLessThan(100);
  });

  it('keeps black black and never inverts', () => {
    const lut = curveLut(240);
    expect(lut[0]).toBe(0);
    for (let v = 1; v < 256; v++) expect(lut[v]).toBeGreaterThanOrEqual(lut[v - 1]);
  });

  it('gamma 1 is the old lightening stretch, which is why it is not the default', () => {
    expect(curveLut(238, 1.0)[200]).toBeGreaterThan(200);
    expect(CURVE_GAMMA).toBeGreaterThan(1);
  });
});

describe('looksLikeAreaTone', () => {
  const AREA: [string, number, number][] = [
    ['BWSS 2023 table photograph', 0.9098, 0.9134],
    ['CHIJ 2020 baby pictograms', 0.1490, 0.2021],
    ['East Spring 2018 shaded region', 0.2983, 0.4095],
    ['GCE 2020 shaded trapezium', 0.1952, 0.2975],
  ];
  const STROKES: [string, number, number][] = [
    ['GCE 2022 ogive', 0.1000, 0.3091],
    ['SCGS 2022 cum-freq', 0.1370, 0.4625],
    ['Greenridge 2025 grid', 0.1185, 0.4008],
    ['Bukit Merah 2023 tables', 0.0919, 0.3382],
    ['ACS 2025 hatched region', 0.0459, 0.1856],
  ];

  it.each(AREA)('protects %s', (_n, full, small) => {
    expect(looksLikeAreaTone(full, small)).toBe(true);
  });
  it.each(STROKES)('still cleans %s', (_n, full, small) => {
    expect(looksLikeAreaTone(full, small)).toBe(false);
  });

  it('keeps a real margin either side of the bar', () => {
    const worstArea = Math.max(...AREA.map(([, f, s]) => s / f));
    const bestStroke = Math.min(...STROKES.map(([, f, s]) => s / f));
    expect(worstArea).toBeLessThan(AREA_RATIO_MIN);
    expect(bestStroke).toBeGreaterThan(AREA_RATIO_MIN);
    expect(bestStroke - worstArea).toBeGreaterThan(1.0);
  });

  it('ignores a figure with almost no mid-tone at all', () => {
    expect(looksLikeAreaTone(0.001, 0.0005)).toBe(false);
  });

  it('midShare counts only the mid band', () => {
    expect(midShare(Uint8Array.from([0, 10, 100, 200, 250, 255]))).toBeCloseTo(2 / 6);
  });
});

it('keeps the tuned constants where the figures were measured', () => {
  expect(PAGE_FRAC).toBe(0.15);
  expect(PAGE_WIN).toBe(10);
  expect(WP_FLOOR).toBe(170);
  expect(CURVE_GAMMA).toBe(1.6);
  expect(MIN_MIDTONE).toBe(0.005);
  expect(FAINT_MIN).toBe(0.02);
});
