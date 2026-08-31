// Cleaning a scanned bank figure — a WHITE-POINT LIFT, nothing more.
//
// A photocopied figure is ink sitting on a grey haze. Lifting the page
// background to pure white and stretching the ink down with it makes the
// figure read at display size without moving a single line — so unlike a
// redraw it can never change what the question asks. That is the whole point
// of preferring it: it is the safe half of "make this figure better".
//
// The white point is read off the image's OWN histogram — the grey at or above
// which PAGE_FRACTION of the page still lies — never a fixed guess. On a real
// scan of graph paper that lands just under the haze (233 on the GCE 2022 EM
// P2 ogive) and leaves intact the light grid lines a student reads values off.
import sharp from 'sharp';

export const PAGE_FRACTION = 0.80;
/**
 * A CEILING on the white point, and the second half of the job.
 *
 * PAGE_FRACTION alone only ever fixed the PAGE. Once the background is white it
 * reports ~254, the lift becomes the identity, and the button says "nothing to
 * clean" while the figure still reads faint — which is exactly what happened on
 * the GCE 2022 EM P2 ogive after its background was whitened. The faintness
 * left is the INK: on that scan the graph-paper grid averages grey 139 at full
 * size, and the browser then squeezes 2164px into ~760, mixing each 1px line
 * with its white neighbours until it lands near 214. Capping the white point
 * here pulls that ink down instead of leaving it alone.
 * 235 is above where real grid ink sits and below the page, so it deepens lines
 * without touching the background.
 */
export const INK_CEILING = 235;
/** A mostly-INK figure (a dark solid diagram) reports a low background; lifting
 *  that to white would blow the drawing out. Never go below this. */
export const WP_FLOOR = 170;
export const BLACK_POINT = 20;
/** Below this share of mid-tones there is nothing left to deepen — the art is
 *  already black-on-white (a vector render, a previous clean). Doing nothing
 *  beats burning a bucket object and an undo entry on an invisible change. */
export const MIN_MIDTONE = 0.005;
/**
 * The faint-ink band, and the guard that keeps the ink pass off clean art.
 *
 * Most of this bank is NOT photocopies — it is digital diagrams extracted from
 * DOCX, whose only mid-tones are the anti-alias fringe on a black line. Running
 * the ink pass over those gains nothing and shaves the fringe: measured over 40
 * sampled figures, ones with under ~1% faint ink came back with LESS ink than
 * they started with (VJC 2017 JC2 Q5: 2.14% -> 2.10%), while genuine scans
 * gained a lot (Catholic High 2013 S1 Q9: 4.47% -> 6.68%).
 *
 * So when the PAGE is already white, only deepen ink if there is faint ink
 * worth deepening. A grey page still cleans regardless — there the lift is
 * fixing the background, which always helps.
 */
export const FAINT_LO = 150;
export const FAINT_MIN = 0.02;

/**
 * The area-tone guard — the one that stops this destroying figures.
 *
 * A white-point lift sends everything at or above the white point to pure
 * white. On a thin grid line that is exactly what you want. On a GREY FILL it
 * is a disaster: "find the shaded area" loses its shading (East Spring 2018 S1
 * Q9 lost it outright, GCE 2020 AM Q11 faded to near-nothing), and a
 * photograph or halftone washes out (BWSS 2023 EM_NA Q12's table, CHIJ 2020 S2
 * Q1's pictograms). Found by eye on the first applied batch of 45, which was
 * reverted.
 *
 * Telling a fill from a line needs more than a histogram, because both are
 * "mid-grey". SCALE is what separates them: shrink the image and a thin stroke
 * spreads over its neighbours, so the mid-tone share CLIMBS, while a solid area
 * keeps the same share at any size. Measured on those figures:
 *
 *     photo 1.00 · pictograms 1.36 · shaded 1.37 · shaded 1.52     <- area
 *     ogive 3.09 · cum-freq 3.38 · grid 3.38 · tables 3.68 · hatch 4.04  <- strokes
 *
 * The gap is wide and the bar sits in the middle of it.
 */
export const AREA_SCALE = 12;
export const AREA_MID_LO = 60;
export const AREA_MID_HI = 235;
export const AREA_RATIO_MIN = 2.2;
/** Below this much mid-tone there is no area to protect. */
export const AREA_MIN_SHARE = 0.005;

/**
 * Do this figure's mid-tones look like AREA (a fill, a photo) rather than thin
 * strokes? PURE, so the judgement is testable without an image.
 */
export function looksLikeAreaTone(fullMidShare: number, smallMidShare: number): boolean {
  if (fullMidShare < AREA_MIN_SHARE) return false;
  return smallMidShare / fullMidShare < AREA_RATIO_MIN;
}

/** Share of pixels in the mid band — the measurement both scales feed on. */
export function midShare(data: Uint8Array | Buffer): number {
  let n = 0;
  for (const v of data) if (v >= AREA_MID_LO && v <= AREA_MID_HI) n++;
  return data.length ? n / data.length : 0;
}

export type CleanResult =
  | { ok: true; out: Buffer; whitePoint: number }
  | { ok: false; reason: 'already-clean' | 'area-tone' };
/** A mild unsharp so thin lines survive the browser's downscale. Deliberately
 *  gentle: a hard sharpen puts halos along every grid line. */
export const SHARPEN = { sigma: 1.1, m1: 1, m2: 2 };

/** Grey levels 0-255 → how many pixels. */
export type Histogram = number[];

export function greyHistogram(data: Uint8Array | Buffer): Histogram {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v]++;
  return hist;
}

/**
 * The white point for this histogram, or null when there is nothing to gain.
 * PURE — this is the decision the whole clean turns on, so it is testable
 * without an image.
 */
export function whitePointFor(hist: Histogram): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) throw new Error('unreadable image');

  // Where the page background starts, from the top down.
  const want = total * PAGE_FRACTION;
  let acc = 0;
  let pageWp = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= want) { pageWp = v; break; }
  }

  // A hazy page pulls the point down (233 on the ogive scan); a white page is
  // held at the ink ceiling so the LINES still get deepened. The floor stops a
  // mostly-ink figure from reporting a dark background and being blown out.
  const wp = Math.max(Math.min(pageWp, INK_CEILING), WP_FLOOR);

  // Nothing between black and the white point means nothing to move.
  let mid = 0;
  for (let v = BLACK_POINT + 1; v < wp; v++) mid += hist[v];
  if (mid / total < MIN_MIDTONE) return null;

  // Page already white? Then this would be the ink pass alone, and that only
  // pays on a figure with genuinely faint ink. Clean line art is left alone.
  if (pageWp >= INK_CEILING) {
    let faint = 0;
    for (let v = FAINT_LO; v < wp; v++) faint += hist[v];
    if (faint / total < FAINT_MIN) return null;
  }
  return wp;
}

/**
 * Lift the white point on a scan. Returns null when nothing needed doing.
 * The measurement is greyscale but the lift runs on the COLOUR channels, so a
 * colour figure stays colour.
 */
export async function cleanScan(src: Buffer): Promise<CleanResult> {
  const meta = await sharp(src).metadata();
  const { data } = await sharp(src).flatten({ background: '#fff' }).greyscale()
    .raw().toBuffer({ resolveWithObject: true });
  const whitePoint = whitePointFor(greyHistogram(data));
  if (whitePoint === null) return { ok: false, reason: 'already-clean' };

  // Refuse anything whose mid-tones are area rather than strokes.
  const small = await sharp(src).flatten({ background: '#fff' }).greyscale()
    .resize({ width: Math.max(8, Math.round((meta.width ?? 96) / AREA_SCALE)) })
    .raw().toBuffer({ resolveWithObject: true });
  if (looksLikeAreaTone(midShare(data), midShare(small.data))) return { ok: false, reason: 'area-tone' };

  const a = 255 / (whitePoint - BLACK_POINT);
  const out = await sharp(src)
    .linear(a, -BLACK_POINT * a)
    .sharpen(SHARPEN)
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { ok: true, out, whitePoint };
}
