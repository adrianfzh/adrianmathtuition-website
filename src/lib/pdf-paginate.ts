// ─── A4 pagination for tall transcript sheets ───────────────────────────────────
//
// The marked PDF's pages are uniform WIDTH (PAGE_W) with proportional height, so a
// long typeset transcript sheet becomes one very tall PDF page — fine on screen,
// but a printer's "fit to page" then shrinks the whole sheet to fit A4 and a long
// solution prints tiny (Adrian, 26 Aug 2026: "if a pdf page becomes too long, how
// does printing it out becomes?"). Sheets taller than ~1.1 A4 are therefore sliced
// into A4-height chunks BEFORE embedding, each cut placed on the whitest raster row
// near the ideal cut so a chunk boundary never lands mid-text-line.
//
// Only typeset sheets are sliced — annotated photo pages are photo-shaped already,
// and cutting a student's page in half would be worse than any shrink.
//
// chooseCutRows is pure and unit-tested; sliceTallPng is the thin sharp wrapper.

export const A4_RATIO = 842 / 595;

/**
 * Choose the pixel rows to cut at. `rowInk[r]` = how much ink row r carries;
 * `maxChunk` = the tallest a chunk may be (px); `window` = how far above the
 * ideal cut we may move to find a whiter row. Cuts are returned in order; the
 * final chunk (whatever remains) is implicit. A page within 10% of one chunk is
 * left whole — a sliver page is uglier than a slightly-shrunk print.
 */
export function chooseCutRows(rowInk: number[], maxChunk: number, window: number): number[] {
  const n = rowInk.length;
  if (!Number.isFinite(maxChunk) || maxChunk <= 0) return [];
  const cuts: number[] = [];
  let p = 0;
  while (n - p > maxChunk * 1.1) {
    const ideal = Math.min(p + Math.floor(maxChunk), n - 1);
    // Never cut in the top 55% of a chunk — a whiter row up there would make a
    // sliver chunk and push every later cut into worse places.
    const lo = Math.max(p + Math.floor(maxChunk * 0.55), ideal - Math.max(0, Math.floor(window)));
    let best = ideal;
    let bestInk = Infinity;
    for (let r = ideal; r >= lo; r--) {
      const ink = rowInk[r] ?? 0;
      if (ink < bestInk) {
        bestInk = ink;
        best = r;
        if (ink === 0) break;   // first blank row scanning UP from the ideal — nearest-to-ideal wins
      }
    }
    if (best <= p) break;       // safety: no progress means no cut
    cuts.push(best);
    p = best;
  }
  return cuts;
}

/**
 * Slice a PNG taller than ~1.1 A4 pages into A4-height chunks at white rows.
 * Returns [buf] untouched for anything short enough, and on ANY failure — a
 * shrunk print is annoying, a lost sheet is not acceptable.
 */
export async function sliceTallPng(buf: Buffer): Promise<Buffer[]> {
  try {
    const { default: sharp } = await import('sharp');
    const img = sharp(buf);
    const meta = await img.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return [buf];
    const maxChunk = Math.floor(width * A4_RATIO);
    if (height <= maxChunk * 1.1) return [buf];

    // Per-row ink: count of dark pixels. Greyscale can come back with an alpha
    // band attached — stride past it rather than reading alpha as brightness.
    const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels || 1;
    const rowInk = new Array<number>(info.height).fill(0);
    for (let r = 0; r < info.height; r++) {
      let ink = 0;
      const base = r * info.width * ch;
      for (let c = 0; c < info.width; c++) if (data[base + c * ch] < 200) ink++;
      rowInk[r] = ink;
    }

    const cuts = chooseCutRows(rowInk, maxChunk, Math.floor(width * 0.12));
    if (!cuts.length) return [buf];
    const bounds = [0, ...cuts, height];
    const out: Buffer[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const top = bounds[i];
      const h = bounds[i + 1] - top;
      if (h <= 0) continue;
      out.push(await sharp(buf).extract({ left: 0, top, width, height: h }).png().toBuffer());
    }
    return out.length ? out : [buf];
  } catch (e) {
    console.error('[pdf-paginate] slice failed — keeping the tall page:', (e as Error).message);
    return [buf];
  }
}
