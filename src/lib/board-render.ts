// 🧑‍🏫 One page of a shared board as a picture (server only) — the page (template, photo, PDF page or
// blank), its photo stickers, then both people's writing on top. The PDF download and the handwriting
// reader (lib/board-read) both draw pages here, so what is searched is exactly what is shown.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchOurFile } from '@/lib/student-files';
import { strokesToSvg } from '@/lib/annotate/layer';
import { isPaperUrl, type BoardPage, type Sticker } from '@/lib/shared-board';
import type { InkPages } from '@/lib/student-ink';

export type RenderableBoard = { pages: BoardPage[]; tutor_ink: InkPages; student_ink: InkPages; stickers: Sticker[] };

export async function renderBoardPage(board: RenderableBoard, i: number, opts: { quality?: number; maxWidth?: number } = {}): Promise<Buffer> {
  const bg = board.pages?.[i]?.url ?? null;
  let buf: Buffer | null = null;
  if (bg) {
    // A template page is a picture in public/board (traced into the board routes, next.config); anything else is in the private store.
    if (isPaperUrl(bg)) buf = await readFile(join(process.cwd(), 'public', bg)).catch(() => null);
    else {
      const r = await fetchOurFile(bg).catch(() => null);
      if (r?.ok) buf = Buffer.from(await r.arrayBuffer());
    }
  }
  if (!buf) buf = await sharp({ create: { width: 1000, height: 1414, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const ink = [board.tutor_ink?.[i], board.student_ink?.[i]].filter(l => l && l.strokes?.length);
  const meta = await sharp(buf).rotate().metadata();
  const w = meta.autoOrient?.width ?? meta.width ?? 1000, h = meta.autoOrient?.height ?? meta.height ?? 1414;
  let img = sharp(buf).rotate();
  // Stickers first (they lie under the writing), scaled from the page's ink box to this picture.
  const layers: sharp.OverlayOptions[] = [];
  const inkBox = ink[0] ? { w: ink[0]!.w, h: ink[0]!.h } : { w, h };
  for (const st of (board.stickers ?? []).filter(x => x.page === i)) {
    const r = await fetchOurFile(st.url).catch(() => null);
    if (!r?.ok) continue;
    const k = w / inkBox.w;
    const sw = Math.max(1, Math.round(st.w * k)), sh = Math.max(1, Math.round(st.h * k));
    const left = Math.round(st.x * k), top = Math.round(st.y * k);
    // Cut the part that hangs off the page (sharp refuses an overlay outside the picture).
    const cx0 = Math.max(0, -left), cy0 = Math.max(0, -top);
    const cw = Math.min(sw, w - left) - cx0, ch = Math.min(sh, h - top) - cy0;
    if (cw <= 0 || ch <= 0) continue;
    const piece = await sharp(Buffer.from(await r.arrayBuffer())).rotate().resize(sw, sh, { fit: 'fill' })
      .extract({ left: cx0, top: cy0, width: cw, height: ch }).png().toBuffer();
    layers.push({ input: piece, left: left + cx0, top: top + cy0 });
  }
  for (const l of ink) layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${l!.w} ${l!.h}">${strokesToSvg(l!.strokes)}</svg>`), top: 0, left: 0 });
  if (layers.length) img = img.composite(layers);
  const out = await img.jpeg({ quality: opts.quality ?? 88 }).toBuffer();
  return opts.maxWidth && w > opts.maxWidth ? sharp(out).resize({ width: opts.maxWidth }).jpeg({ quality: opts.quality ?? 85 }).toBuffer() : out;
}
