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
export async function resizeToJpeg(file: File, maxEdge = 2600, quality = 0.88): Promise<File> {
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
export async function splitFileIfSpread(file: File): Promise<{ files: File[]; split: boolean }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);   // EXIF-upright, same as every other intake path
  } catch {
    return { files: [file], split: false };
  }
  try {
    const plan = spreadSplitPlan(bmp.width, bmp.height);
    if (!plan) return { files: [file], split: false };
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
