// Two-page spread photos (an open booklet photographed as ONE wide image) are the
// enemy of the whole marking pipeline: printed, the single wide PDF page fits one
// A4 sheet so each exam page comes out ~A5; marked, the 1280px marking copy gives
// each page only ~640px and the annotation placer falls back to margin piles
// (measured 2026-08-11: 10/10 margin-fallback runs were low-res spreads). The fix
// is the same for both — split the spread into two full-resolution portrait pages
// BEFORE anything downstream sees it.
//
// The pure geometry lives here (unit-tested); the canvas work is a thin wrapper.
// Shared by /admin/mark-paper intake and the student portal's /app/submit — the
// two surfaces must never disagree about what counts as a spread.

/** Width must exceed height by this factor to count as a spread — same heuristic
 * as the bot's line-mark spread retry (ai/photo-overlay.js, w > h*1.15). */
export const SPREAD_RATIO = 1.15;

/** Each half keeps a sliver past the midline (3% of width per side): phone photos
 * are never perfectly centred, and a hard mid-cut through a slightly-off gutter
 * slices the inner edge of one page's working. The duplicated strip prints like a
 * photocopied book gutter — harmless. */
export const SPREAD_OVERLAP_FRAC = 0.03;

export interface SpreadCrop { x: number; y: number; width: number; height: number }

/**
 * Which way the writing runs on a wide image — the difference between an open
 * booklet (two upright pages side by side, which the splitter should cut) and
 * ONE page scanned sideways (which it must not: Gavin Woon's EM Practice Set 3
 * P1, 11 Sep 2026 — page 2 lay landscape in the PDF, was cut in half, and the
 * two halves were marked as two pages; Adrian: "fix the splitter so a rotated
 * page isn't split"). The bot turns a sideways page upright itself before
 * reading it (detectRotation), so leaving it whole is all the intake must do.
 *
 * Text lines are horizontal bands of ink: the row-by-row ink profile of an
 * upright page wobbles once per line at a fine scale, the column profile is
 * smooth by comparison. Sideways, the roles swap. Two measures of that fine
 * wobble are taken on each profile — its high-frequency energy (the mean
 * change over three samples) and the spread of its residual once the broad
 * shading of a photographed page is subtracted — and the page is called
 * sideways only when BOTH say the columns wobble clearly more than the rows.
 * Measured on 36 real marked pages turned sideways and paired into spreads
 * (11 Sep 2026): every sideways page scored ≥ 1.7 on the first measure, every
 * spread ≤ 0.5, one sparse spread 0.9 → "unsure", which keeps the old cut.
 * Pure: `gray` is w×h luminance values (0 dark … 255 paper), row-major;
 * `rows` / `cols` are the two axes' wobble scores.
 */
export type TextAxis = { rows: number; cols: number; kind: 'upright' | 'sideways' | 'unsure' };

export function textAxis(gray: ArrayLike<number>, w: number, h: number): TextAxis {
  if (!(w > 8) || !(h > 8) || gray.length < w * h) return { rows: 0, cols: 0, kind: 'unsure' };
  const rowInk = new Float64Array(h), colInk = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) {
      const ink = 255 - Number(gray[off + x]);
      rowInk[y] += ink / w; colInk[x] += ink / h;     // mean ink per pixel along the line
    }
  }
  const wobble = (prof: Float64Array) => {
    const n = prof.length;
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) sm[i] = (prof[Math.max(0, i - 1)] + prof[i] + prof[Math.min(n - 1, i + 1)]) / 3;
    let hf = 0;
    for (let i = 3; i < n; i++) hf += Math.abs(sm[i] - sm[i - 3]);
    hf /= Math.max(1, n - 3);
    const win = Math.max(4, Math.round(n / 12));
    let sq = 0;
    for (let i = 0; i < n; i++) {
      let acc = 0, k = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) { acc += sm[j]; k++; }
      const r = sm[i] - acc / k;
      sq += r * r;
    }
    return { hf, sd: Math.sqrt(sq / n) };
  };
  const r = wobble(rowInk), c = wobble(colInk);
  const M = 1.25;
  const kind = c.hf > r.hf * M && c.sd > r.sd * M ? 'sideways'
    : r.hf > c.hf * M && r.sd > c.sd * M ? 'upright'
    : 'unsure';
  return { rows: r.hf, cols: c.hf, kind };
}

/** Sample size for the orientation test — enough rows to see text lines, cheap to scan. */
export const TEXT_AXIS_SAMPLE = 320;

/**
 * Decide whether an image of the given dimensions is a two-page spread, and if so
 * where to cut. Returns null for portrait/square/mildly-landscape images (single
 * pages photographed slightly wide must NOT be split in half).
 */
export function spreadSplitPlan(
  width: number,
  height: number,
): { left: SpreadCrop; right: SpreadCrop } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (width <= height * SPREAD_RATIO) return null;
  const halfW = Math.round(width * (0.5 + SPREAD_OVERLAP_FRAC));
  return {
    left: { x: 0, y: 0, width: halfW, height },
    right: { x: width - halfW, y: 0, width: halfW, height },
  };
}

/**
 * Downscale a photo to a bounded JPEG (EXIF-upright) for upload. Returns the
 * original file untouched when the browser can't decode it (HEIC on Chrome) or
 * it's already within bounds — best-effort, never rejects. Browser-only.
 */
export async function resizeToJpeg(file: File, maxEdge = 3500, quality = 0.88): Promise<File> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { return file; }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale === 1 && (file.type === 'image/jpeg' || file.type === 'image/png')) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    const stem = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '');
    return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' });
  } finally {
    bmp.close?.();
  }
}

/**
 * Split a picked photo into [left page, right page] when it is a spread, at FULL
 * resolution (downscaling stays the caller's job — that is the point: each half
 * gets the whole pixel budget). Best-effort, never rejects a photo: anything the
 * browser can't decode (HEIC on Chrome) or can't re-encode passes through as-is.
 * Browser-only — call from client components.
 */
export async function splitFileIfSpread(file: File): Promise<{ files: File[]; split: boolean; sideways?: boolean }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);   // EXIF-upright, same as every other intake path
  } catch {
    return { files: [file], split: false };
  }
  try {
    const plan = spreadSplitPlan(bmp.width, bmp.height);
    if (!plan) return { files: [file], split: false };
    // A wide image is a spread only when the writing runs upright across it. A
    // single page lying sideways is left whole for the marker to turn (11 Sep 2026).
    try {
      const sw = TEXT_AXIS_SAMPLE, sh = Math.max(2, Math.round(TEXT_AXIS_SAMPLE * bmp.height / bmp.width));
      const probe = document.createElement('canvas');
      probe.width = sw; probe.height = sh;
      const ctx = probe.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0, sw, sh);
      const px = ctx.getImageData(0, 0, sw, sh).data;
      const gray = new Uint8Array(sw * sh);
      for (let i = 0; i < gray.length; i++) gray[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
      if (textAxis(gray, sw, sh).kind === 'sideways') return { files: [file], split: false, sideways: true };
    } catch { /* an undecodable probe falls back to the old behaviour: split */ }
    const stem = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '');
    const halves: File[] = [];
    for (const [suffix, crop] of [['p1', plan.left], ['p2', plan.right]] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = crop.width; canvas.height = crop.height;
      canvas.getContext('2d')!.drawImage(bmp, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) return { files: [file], split: false };   // half failed → keep the original whole
      halves.push(new File([blob], `${stem}-${suffix}.jpg`, { type: 'image/jpeg' }));
    }
    return { files: halves, split: true };
  } finally {
    bmp.close?.();
  }
}
