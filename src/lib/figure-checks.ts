// Evidence for a figure review.
//
// Releasing a flagged figure on "looks fine" at thumbnail size is exactly how
// 569 figures got flagged in 86 minutes. So the review shows measurements
// beside the picture: things a glance misses, and things a glance should not
// have to carry.
//
// The interesting one is TEXT IN THE CROP. Plenty of bank figures were cropped
// with the question's own words above the diagram — and the stem is stored
// separately, so the question then prints its text twice. Measured on Fuhua
// 2021 (every figure has it) against a spread of clean diagrams:
//
//   Fuhua  Q4b 14.0% · Q6 13.4% · Q10a 13.2% · Q4c 10.8% · Q4a 10.5% · Q2 6.2%
//   clean  NJC 0% · Canberra 0% · TKGS 0% · Admiralty 0% · RVHS 0% · TPJC 0%
//
// and it independently caught two the eye had passed: Greendale 2022 Q20
// (36.3% — the "figure" is the TEXT of Q21) and Regent 2025 Q10 (8.9% — a stray
// sentence above the cone). 4% sits in the gap.
import sharp from 'sharp';

export const TEXT_BAND = 0.42;   // text sits above the diagram, so look at the top
export const TEXT_MIN = 0.04;    // share of band rows that look like text lines
export const SMALL_PX = 220;     // a figure this small cannot be read in print
export const BLANK_INK = 0.01;   // less ink than this and there is nothing there

/**
 * Share of rows in the top band that look like a line of TEXT rather than part
 * of a drawing: ink spread across the width in many SHORT runs. A diagram's
 * rows are either near-empty or carry one long stroke. PURE.
 */
export function textLineShare(grey: Uint8Array | Buffer, w: number, h: number): number {
  const band = Math.max(1, Math.round(h * TEXT_BAND));
  let textRows = 0;
  for (let y = 0; y < band; y++) {
    let ink = 0, runs = 0, run = 0, maxRun = 0;
    let inRun = false;
    for (let x = 0; x < w; x++) {
      if (grey[y * w + x] < 160) {
        ink++; run++;
        if (!inRun) { runs++; inRun = true; }
      } else {
        inRun = false;
        if (run > maxRun) maxRun = run;
        run = 0;
      }
    }
    if (run > maxRun) maxRun = run;
    const cover = ink / w;
    if (cover > 0.10 && cover < 0.75 && runs >= 12 && maxRun < w * 0.35) textRows++;
  }
  return textRows / band;
}

export type FigureChecks = {
  width: number; height: number;
  inkShare: number; textShare: number;
  small: boolean; blank: boolean; textInCrop: boolean;
};

export async function inspectFigure(buf: Buffer): Promise<FigureChecks> {
  const meta = await sharp(buf).metadata();
  const W = Math.min(900, meta.width ?? 900);
  const { data, info } = await sharp(buf).flatten({ background: '#fff' }).greyscale()
    .resize({ width: W }).raw().toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (const v of data) if (v < 160) ink++;
  const inkShare = data.length ? ink / data.length : 0;
  const textShare = textLineShare(data, info.width, info.height);
  return {
    width: meta.width ?? 0, height: meta.height ?? 0,
    inkShare, textShare,
    small: Math.max(meta.width ?? 0, meta.height ?? 0) < SMALL_PX,
    blank: inkShare < BLANK_INK,
    textInCrop: textShare >= TEXT_MIN,
  };
}
