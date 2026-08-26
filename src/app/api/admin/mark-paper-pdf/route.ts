import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { PDFDocument } from 'pdf-lib';
import { renderMarkingPNG, type MarkingOutput } from '@/lib/render-marking';
import { orderMarkedPages } from '@/lib/marked-pdf-order';
import { pickAnnotatedPhotoUrl } from '@/lib/annotated-photo-source';
import { markedPdfColumn } from '@/lib/marked-pdf-column';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
// Page width + paper-total strip are SHARED with the ✏️ Annotate assemble route —
// see lib/marked-pdf-layout.ts. Change layout there, never inline here.
import { PAGE_W, drawPaperTotal, stripHeight, shouldStampPaperTotal } from '@/lib/marked-pdf-layout';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Each question is its own headless-Chrome page, and nearly all of the ~3.5s it took
// was WAITING — fonts and the KaTeX CDN over networkidle0, then the render poll. Run
// several at once against the one shared browser and a 30-question paper stops taking
// two minutes, which is the window in which the browser gave up on the request at all
// ("Failed to fetch", Adrian, 19 Aug 2026). Memory for the extra tabs is in vercel.json.
const RENDER_CONCURRENCY = 4;

type ResultIn = { question_number: string; marking_output: MarkingOutput | null; photo_index?: number | null };

/** Put the finished URL on the run HERE, server-side, before answering the browser.
 *  It used to be a fire-and-forget call from the page after the response arrived, so a
 *  dropped connection threw away a PDF that was already built and uploaded — two
 *  minutes of work with nothing to show. Written first, the page can simply re-read
 *  the run and find it. Best-effort: a failed link never fails the build. */
async function linkToRun(runId: string | undefined, url: string, mode: string) {
  if (!runId) return;
  try {
    await getSupabaseAdmin()
      .from('paper_marking_runs')
      .update({ [markedPdfColumn(mode)]: url })
      .eq('id', runId);
  } catch (e) {
    console.error('[mark-paper-pdf] link to run failed', (e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { results?: ResultIn[]; annotated_photos?: { photo_index: number; url: string; url_with_solutions?: string | null }[]; totals?: { awarded: number; max: number; counted_max?: number; max_source?: string }; student?: { name?: string; level?: string }; multi?: boolean; mode?: string; runId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const mode = body.mode === 'photos' ? 'photos' : 'full';   // 'photos' = annotated originals only (no typeset)
  const results = (body.results || []).filter(r => r.marking_output && Array.isArray(r.marking_output.lines));
  const runId = typeof body.runId === 'string' && body.runId ? body.runId : undefined;

  const student = { name: body.student?.name || '', level: body.student?.level || '' };
  const ts = new Date().toISOString();

  // Render each question to a typeset PNG (skipped in photos-only mode). Pooled, but
  // the output stays in question order — orderMarkedPages relies on it.
  type Png = { label: string; buf: Buffer; awarded: number; max: number; photo_index?: number | null };
  let pngs: Png[] = [];
  if (mode !== 'photos') {
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(RENDER_CONCURRENCY);
    const rendered = await Promise.all(results.map((r) => limit(async (): Promise<Png | null> => {
      const mo = r.marking_output!;
      try {
        const buf = await renderMarkingPNG({ marking: mo, student, timestamp: ts });
        return { label: String(r.question_number), buf, awarded: mo.marks?.awarded ?? 0, max: mo.marks?.max ?? 0, photo_index: r.photo_index };
      } catch (e) {
        console.error('[mark-paper-pdf] render failed for', r.question_number, (e as Error).message);
        return null;
      }
    })));
    pngs = rendered.filter((p): p is Png => p !== null);
    // A sheet taller than ~1.1 A4 pages is sliced into A4-height chunks at white
    // rows before embedding, so "fit to page" printing never shrinks a long
    // solution to unreadable (lib/pdf-paginate.ts). Best-effort per sheet — a
    // failed slice keeps the tall page, never loses it.
    const { sliceTallPng } = await import('@/lib/pdf-paginate');
    const paginated: Png[] = [];
    for (const p of pngs) {
      const parts = await sliceTallPng(p.buf);
      for (const buf of parts) paginated.push({ ...p, buf });
    }
    pngs = paginated;
  }
  // Fetch the annotated ORIGINAL photos (PNGs from Blob) — these go in the PDF first.
  // The marker sends two copies of each page; which one belongs in THIS document is
  // pickAnnotatedPhotoUrl's call (see that module for why it is not inlined here).
  const annotated: { photo_index: number; buf: Buffer }[] = [];
  for (const ap of (body.annotated_photos || [])) {
    const src = pickAnnotatedPhotoUrl(ap, mode);
    try {
      const r = await fetch(src);
      if (r.ok) annotated.push({ photo_index: ap.photo_index, buf: Buffer.from(await r.arrayBuffer()) });
      else if (src !== ap.url) {
        const r2 = await fetch(ap.url);   // twin went missing from Blob — the plain page still marks the work
        if (r2.ok) annotated.push({ photo_index: ap.photo_index, buf: Buffer.from(await r2.arrayBuffer()) });
      }
    } catch (e) { console.error('[mark-paper-pdf] fetch annotated failed', (e as Error).message); }
  }
  annotated.sort((a, b) => a.photo_index - b.photo_index);

  if (!pngs.length && !annotated.length) return NextResponse.json({ error: 'Nothing to render' }, { status: 500 });

  const id = ts.replace(/[:.]/g, '-');
  const single = !body.multi && pngs.length === 1 && annotated.length === 0;

  if (single) {
    const blob = await put(`mark-paper/${id}.png`, pngs[0].buf, { access: 'public', contentType: 'image/png', allowOverwrite: true });
    await linkToRun(runId, blob.url, mode);
    return NextResponse.json({ url: blob.url, kind: 'image', totalAwarded: pngs[0].awarded, totalMax: pngs[0].max });
  }

  // Totals from the marking results (works even in photos mode, where there are no typeset pages).
  const perQ = results.map(r => ({ awarded: r.marking_output!.marks?.awarded ?? 0, max: r.marking_output!.marks?.max ?? 0 }));
  const totalAwarded = body.totals?.awarded ?? perQ.reduce((s, q) => s + q.awarded, 0);
  const totalMax = body.totals?.max ?? perQ.reduce((s, q) => s + q.max, 0);

  // Assemble a PDF: each annotated photo followed by ITS OWN transcript sheets.
  const pdfDoc = await PDFDocument.create();
  const pages = orderMarkedPages(
    annotated.map(a => ({ photo_index: a.photo_index, item: a })),
    pngs.map(p => ({ photo_index: p.photo_index, label: p.label, item: p })),
  );
  // Practices get no PAPER TOTAL strip — only papers with an OFFICIAL denominator
  // (registry-matched or the "out of ___" box) are exam/test papers. Starting
  // totalDrawn true skips the strip and the stamp entirely.
  let totalDrawn = !shouldStampPaperTotal(body.totals?.max_source);
  for (const pg of pages) {
    try {
      const buf = pg.item.buf;
      // Annotated photos come off Blob as JPEG; typeset sheets are always PNG.
      const img = pg.kind === 'photo'
        ? await pdfDoc.embedJpg(buf).catch(() => pdfDoc.embedPng(buf))
        : await pdfDoc.embedPng(buf);
      // Uniform width, proportional height — see PAGE_W.
      const drawH = Math.round(PAGE_W * (img.height / img.width));
      // First page only: grow the sheet by a header strip and stamp the paper total there.
      const strip = totalDrawn ? 0 : stripHeight(PAGE_W);
      const page = pdfDoc.addPage([PAGE_W, drawH + strip]);
      page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: drawH });
      if (!totalDrawn) {
        totalDrawn = true;   // set first: a failed stamp must not push the strip onto page 2
        await drawPaperTotal(pdfDoc, page, {
          width: PAGE_W, imgHeight: drawH,
          studentName: student.name, studentLevel: student.level, totalAwarded, totalMax,
        });
      }
    } catch (e) { console.error('[mark-paper-pdf] embed failed', pg.kind, (e as Error).message); }
  }
  const pdfBytes = await pdfDoc.save();
  const blob = await put(`mark-paper/${id}.pdf`, Buffer.from(pdfBytes), { access: 'public', contentType: 'application/pdf', allowOverwrite: true });
  await linkToRun(runId, blob.url, mode);
  return NextResponse.json({ url: blob.url, kind: 'pdf', totalAwarded, totalMax });
}
