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
/** A mostly-INK figure (a dark solid diagram) reports a low background; lifting
 *  that to white would blow the drawing out. Never go below this. */
export const WP_FLOOR = 170;
/** At or above this the page is already white — do nothing rather than burn a
 *  bucket object re-saving an unchanged image (and a bogus undo entry). */
export const SKIP_ABOVE = 248;
export const BLACK_POINT = 20;

/** Grey levels 0-255 → how many pixels. */
export type Histogram = number[];

export function greyHistogram(data: Uint8Array | Buffer): Histogram {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v]++;
  return hist;
}

/**
 * The white point for this histogram, or null when the page is already white.
 * PURE — this is the decision the whole clean turns on, so it is testable
 * without an image.
 */
export function whitePointFor(hist: Histogram): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) throw new Error('unreadable image');
  const want = total * PAGE_FRACTION;
  let acc = 0;
  let wp = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= want) { wp = v; break; }
  }
  if (wp >= SKIP_ABOVE) return null;
  return Math.max(wp, WP_FLOOR);
}

/**
 * Lift the white point on a scan. Returns null when nothing needed doing.
 * The measurement is greyscale but the lift runs on the COLOUR channels, so a
 * colour figure stays colour.
 */
export async function cleanScan(src: Buffer): Promise<{ out: Buffer; whitePoint: number } | null> {
  const { data } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
  const whitePoint = whitePointFor(greyHistogram(data));
  if (whitePoint === null) return null;
  const a = 255 / (whitePoint - BLACK_POINT);
  const out = await sharp(src).linear(a, -BLACK_POINT * a).png({ compressionLevel: 9 }).toBuffer();
  return { out, whitePoint };
}
