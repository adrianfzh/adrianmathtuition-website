// Cleaning a scanned bank figure.
//
// Two things are wrong with a photocopied figure and both are fixed here:
// the PAGE is a grey haze rather than white, and the INK is faint. The fix is
// one lookup table — everything at or above the page's own level goes to pure
// white, and everything below is DARKENED by a gamma curve.
//
// It moves no geometry, so unlike a redraw it can never change what a question
// asks. What it can do is take something away, which is what the guards below
// exist to prevent.
//
// ── the two mistakes this file has already made ──────────────────────────────
// Both were found by measuring output, not by reading code, and both are the
// reason the constants here are pinned by tests:
//
// 1. FINDING THE PAGE BY QUANTILE. The page used to be "the grey at or above
//    which 80% of pixels lie". That assumes the background is most of the
//    image — true of a photo of a worksheet, false of GRAPH PAPER, where the
//    grid is most of the image. On six graph-paper figures the rule put the
//    page at 173-187 instead of ~240, and the lift then mapped the whole grid
//    to white. A student reads coordinates off that grid.
//    The page is now found as the bottom edge of the histogram's own top
//    peak, which is what "the page" actually is.
//
// 2. LIFTING TO DARKEN. A linear stretch onto [0,255] LIGHTENS everything
//    above roughly grey 127 — so the faint grid it was meant to deepen got
//    fainter. Darkening needs a curve, not a stretch. Measured on the same
//    figures, the gamma below turns -15% area tone into -0%, and turns Q3's
//    -11% into +19%.
import sharp from 'sharp';

/** Page finder: smoothing window, and the fraction of the page peak's density
 *  at which the page is judged to have ended. Tuned against six figures whose
 *  right answer was known by eye — every one lands within ~5 greys. */
export const PAGE_WIN = 10;
export const PAGE_FRAC = 0.15;
/** A mostly-INK figure would otherwise report a dark page and be blown out. */
export const WP_FLOOR = 170;
/** How hard the ink is darkened. 1.0 is the old lightening stretch. */
export const CURVE_GAMMA = 1.6;

/** Below this share of mid-tones there is nothing to work on. */
export const MIN_MIDTONE = 0.005;
/** The faint band, and how much of it a white-paged figure needs before the
 *  curve is worth running: clean vector art is black lines plus an anti-alias
 *  fringe, and has nothing to gain. */
export const FAINT_LO = 150;
export const FAINT_MIN = 0.02;

/**
 * The area-tone guard.
 *
 * Sending the page to white destroys a GREY FILL: "find the shaded area" loses
 * its shading, a photograph washes out. Telling a fill from a line needs more
 * than a histogram — both are mid-grey. SCALE separates them: shrink the image
 * and a thin stroke spreads over its neighbours so its mid-tone share CLIMBS,
 * while a solid area holds the same share at any size. Measured:
 *
 *   photo 1.00 · pictograms 1.36 · shaded 1.37 · shaded 1.52     <- area
 *   ogive 3.09 · cum-freq 3.38 · grid 3.38 · tables 3.68 · hatch 4.04  <- strokes
 */
export const AREA_SCALE = 12;
export const AREA_MID_LO = 60;
export const AREA_MID_HI = 235;
export const AREA_RATIO_MIN = 2.2;
export const AREA_MIN_SHARE = 0.005;

/**
 * The one thing this guard CANNOT catch, recorded so it is not re-litigated.
 *
 * A fill only a little paler than the page is the SAME SIGNAL as haze in a
 * histogram, and the page finder swallows it. Measured on NJC 2019 JC1 Q12: a
 * pink tint at grey 237 against a page whose edge was found at 226, so the
 * tint mapped to white. Colour does not help either — that pink is 0.07%
 * saturated, less than a figure with no fill at all.
 *
 * Separating them needs SPATIAL reasoning (a fill is a contiguous region, haze
 * is everywhere), not another histogram rule, and a rule strict enough to
 * protect it would refuse every genuinely hazy scan — which is the main job.
 *
 * So: darker fills are safe (YIJC 2023 JC2 Q1's beige strips and HCI 2024 JC2
 * Q8's grey region both came through the same pass intact), very pale ones are
 * not, and `scripts/figure-maintenance/audit-clean.ts` is how you find the
 * casualties — it put that figure in the worst six of 1,337. A row carrying
 * `gen_meta.figure_no_clean` has been ruled out by hand and is skipped.
 */

export type Histogram = number[];

export function greyHistogram(data: Uint8Array | Buffer): Histogram {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v]++;
  return hist;
}

/**
 * Where the page background ends — the bottom edge of the histogram's topmost
 * peak. PURE.
 *
 * Smoothed first, because the spike at pure white is narrow and tall (a crop
 * border, a flattened alpha) and would otherwise BE the peak; the page's real
 * mass is the broad hump just under it.
 */
export function pageEdgeFor(hist: Histogram): number {
  const sm = new Array(256).fill(0);
  for (let v = 0; v < 256; v++) {
    let sum = 0, n = 0;
    for (let k = v - PAGE_WIN; k <= v + PAGE_WIN; k++) if (k >= 0 && k < 256) { sum += hist[k]; n++; }
    sm[v] = sum / n;
  }
  let peak = 0, peakAt = 255;
  for (let v = 180; v < 256; v++) if (sm[v] > peak) { peak = sm[v]; peakAt = v; }
  let v = peakAt;
  while (v > 60 && sm[v] >= PAGE_FRAC * peak) v--;
  return v;
}

/**
 * The white point to clean at, or null when there is nothing to gain. PURE —
 * this is the decision the whole clean turns on, so it is testable without an
 * image.
 */
export function whitePointFor(hist: Histogram): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) throw new Error('unreadable image');
  const wp = Math.max(pageEdgeFor(hist), WP_FLOOR);

  // Nothing between black and the page means nothing to move.
  let mid = 0;
  for (let v = 1; v < wp; v++) mid += hist[v];
  if (mid / total < MIN_MIDTONE) return null;

  // A page that is already white gains only from the ink curve, and that only
  // pays where there IS faint ink. Clean line art is left alone.
  if (wp >= 240) {
    let faint = 0;
    for (let v = FAINT_LO; v < wp; v++) faint += hist[v];
    if (faint / total < FAINT_MIN) return null;
  }
  return wp;
}

/** page and above → white; below → darkened. Continuous at the page edge. */
export function curveLut(whitePoint: number, gamma = CURVE_GAMMA): Uint8Array {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = v >= whitePoint ? 255 : Math.round(255 * Math.pow(v / whitePoint, gamma));
  }
  return lut;
}

export function looksLikeAreaTone(fullMidShare: number, smallMidShare: number): boolean {
  if (fullMidShare < AREA_MIN_SHARE) return false;
  return smallMidShare / fullMidShare < AREA_RATIO_MIN;
}

export function midShare(data: Uint8Array | Buffer): number {
  let n = 0;
  for (const v of data) if (v >= AREA_MID_LO && v <= AREA_MID_HI) n++;
  return data.length ? n / data.length : 0;
}

export type CleanResult =
  | { ok: true; out: Buffer; whitePoint: number }
  | { ok: false; reason: 'already-clean' | 'area-tone' };

/**
 * Clean a figure. The measurement is greyscale; the curve is applied to every
 * channel, so a colour figure stays colour.
 */
export async function cleanScan(src: Buffer): Promise<CleanResult> {
  const meta = await sharp(src).metadata();
  const flat = sharp(src).flatten({ background: '#fff' });
  const { data } = await flat.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const whitePoint = whitePointFor(greyHistogram(data));
  if (whitePoint === null) return { ok: false, reason: 'already-clean' };

  const small = await sharp(src).flatten({ background: '#fff' }).greyscale()
    .resize({ width: Math.max(8, Math.round((meta.width ?? 96) / AREA_SCALE)) })
    .raw().toBuffer({ resolveWithObject: true });
  if (looksLikeAreaTone(midShare(data), midShare(small.data))) return { ok: false, reason: 'area-tone' };

  const lut = curveLut(whitePoint);
  const raw = await sharp(src).flatten({ background: '#fff' }).raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(raw.data);
  for (let i = 0; i < px.length; i++) px[i] = lut[px[i]];
  const out = await sharp(px, { raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { ok: true, out, whitePoint };
}
