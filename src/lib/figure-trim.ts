// Tight crops for bank figures (30 Sep 2026). Adrian: "crops should not leave
// too much white space". A figure keeps a thin white border — about 2% of its
// longer side, never under 8 px or over 20 px — and nothing more. Used as the
// net when a repaired or redrawn figure is approved (the figures-bank route), and
// by the one-off pass over the candidates already waiting on the Check page.
import sharp from 'sharp';

/** The white border a figure keeps on every side, in pixels. */
export function tightPad(width: number, height: number): number {
  return Math.min(20, Math.max(8, Math.round(Math.max(width, height) * 0.02)));
}

/** Does a crop with these margins leave too much white? Only then is it trimmed:
 *  a figure already inside the rule keeps its bytes exactly. */
export function needsTrim(
  margins: { top: number; right: number; bottom: number; left: number },
  inner: { width: number; height: number },
): boolean {
  const pad = tightPad(inner.width, inner.height);
  return Math.max(margins.top, margins.right, margins.bottom, margins.left) > pad + 2;
}

/** Trim the white round a figure down to `tightPad`. Returns the input untouched
 *  when it is already tight, blank, or not an image sharp can read. */
export async function trimWhite(bytes: Buffer): Promise<{ bytes: Buffer; trimmed: boolean }> {
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return { bytes, trimmed: false };
    const t = await sharp(bytes).flatten({ background: '#ffffff' })
      .trim({ background: '#ffffff', threshold: 10 }).toBuffer({ resolveWithObject: true });
    const w = t.info.width, h = t.info.height;
    if (!w || !h || w < 4 || h < 4) return { bytes, trimmed: false };
    const left = -(t.info.trimOffsetLeft ?? 0), top = -(t.info.trimOffsetTop ?? 0);
    const margins = { top, left, right: meta.width - w - left, bottom: meta.height - h - top };
    if (!needsTrim(margins, { width: w, height: h })) return { bytes, trimmed: false };
    const pad = tightPad(w, h);
    const out = await sharp(t.data)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#ffffff' })
      .png().toBuffer();
    return { bytes: out, trimmed: true };
  } catch {
    return { bytes, trimmed: false };
  }
}
