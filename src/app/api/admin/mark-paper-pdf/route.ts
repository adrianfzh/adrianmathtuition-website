import { NextRequest, NextResponse } from 'next/server';
import { putStudentFile, fetchOurFile, runKey, uploadKey } from '@/lib/student-files';
import { PDFDocument } from 'pdf-lib';
import { renderMarkingPNG, type MarkingOutput } from '@/lib/render-marking';
import { coverPhotoIndexes, orderMarkedPages } from '@/lib/marked-pdf-order';
import { pickAnnotatedPhotoUrl, type MarkedPdfMode } from '@/lib/annotated-photo-source';
import { markedPdfColumn } from '@/lib/marked-pdf-column';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
// Page width + paper-total strip are SHARED with the ✏️ Annotate assemble route —
// see lib/marked-pdf-layout.ts. Change layout there, never inline here.
import { PAGE_W, drawPaperTotal, stripHeight, shouldStampPaperTotal } from '@/lib/marked-pdf-layout';
import { analyse, worstQuestions, type LostPart } from '@/lib/paper-analysis';
import { readDiagnosis, themesFromDiagnosis } from '@/lib/sheet-diagnosis';
import { errorKindTotals } from '@/lib/error-kinds';
import { renderFrontPagePng } from '@/lib/render-front-page';
import { bookletItems } from '@/lib/solutions-booklet-html';
import { renderSolutionsBookletPng } from '@/lib/render-solutions-booklet';

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

  let body: { results?: ResultIn[]; annotated_photos?: { photo_index: number; url: string; url_with_solutions?: string | null }[]; totals?: { awarded: number; max: number; counted_max?: number; max_source?: string }; student?: { name?: string; level?: string }; multi?: boolean; mode?: string; runId?: string; paperName?: string; frontPage?: boolean; booklet?: boolean };
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

  // ── Worked-solutions booklet (🖼 photos mode, Adrian 1 Sep 2026) ─────────────
  // The -sol twins' footers made pages up to 1.97×A4, so "fit to page" printed
  // them at half scale. Instead: worked solutions render as ONE typeset document,
  // sliced into A4 chunks for the back of the PDF — and only once that render is
  // in hand do the marked pages switch to the clean twins ('photos-booklet').
  // Ordering matters: this must be decided BEFORE the photo fetch below, because
  // it changes which copy of each page is fetched. Fail-soft in every direction —
  // a failed booklet falls back to plain 'photos' (solutions in the footers, tall
  // pages and all), never to a document with no solutions at all.
  let bookletPages: Buffer[] = [];
  let photoMode: MarkedPdfMode = mode;
  if (mode === 'photos' && body.booklet !== false) {
    try {
      const items = bookletItems(results);
      if (!items.length) {
        // Nothing lost anywhere → no solutions exist on any twin either; the
        // clean pages are simply the same pages without a redundant block.
        photoMode = 'photos-booklet';
      } else {
        const png = await renderSolutionsBookletPng({
          paperName: body.paperName ?? null, studentName: student.name || null, items,
        });
        if (png) {
          const { sliceTallPng } = await import('@/lib/pdf-paginate');
          bookletPages = await sliceTallPng(png);
          if (bookletPages.length) photoMode = 'photos-booklet';
        }
      }
    } catch (e) { console.warn('[mark-paper-pdf] booklet skipped:', (e as Error).message); }
  }

  // Fetch the annotated ORIGINAL photos (PNGs from Blob) — these go in the PDF first.
  // The marker sends two copies of each page; which one belongs in THIS document is
  // pickAnnotatedPhotoUrl's call (see that module for why it is not inlined here).
  const annotated: { photo_index: number; buf: Buffer }[] = [];
  for (const ap of (body.annotated_photos || [])) {
    const src = pickAnnotatedPhotoUrl(ap, photoMode);
    try {
      const r = await fetchOurFile(src);
      if (r.ok) annotated.push({ photo_index: ap.photo_index, buf: Buffer.from(await r.arrayBuffer()) });
      else if (src !== ap.url) {
        const r2 = await fetchOurFile(ap.url);   // twin went missing — the plain page still marks the work
        if (r2.ok) annotated.push({ photo_index: ap.photo_index, buf: Buffer.from(await r2.arrayBuffer()) });
      }
    } catch (e) { console.error('[mark-paper-pdf] fetch annotated failed', (e as Error).message); }
  }
  annotated.sort((a, b) => a.photo_index - b.photo_index);

  if (!pngs.length && !annotated.length) return NextResponse.json({ error: 'Nothing to render' }, { status: 500 });

  const id = ts.replace(/[:.]/g, '-');
  const single = !body.multi && pngs.length === 1 && annotated.length === 0;

  if (single) {
    const blob = await putStudentFile({
      key: runId ? runKey(runId, `marked-${mode}.png`) : uploadKey(`marked-${id}.png`),
      body: pngs[0].buf, contentType: 'image/png',
    });
    await linkToRun(runId, blob.url, mode);
    return NextResponse.json({ url: blob.url, kind: 'image', totalAwarded: pngs[0].awarded, totalMax: pngs[0].max });
  }

  // Totals from the marking results (works even in photos mode, where there are no typeset pages).
  const perQ = results.map(r => ({ awarded: r.marking_output!.marks?.awarded ?? 0, max: r.marking_output!.marks?.max ?? 0 }));
  const totalAwarded = body.totals?.awarded ?? perQ.reduce((s, q) => s + q.awarded, 0);
  const totalMax = body.totals?.max ?? perQ.reduce((s, q) => s + q.max, 0);

  // Assemble a PDF: each annotated photo followed by ITS OWN transcript sheets.
  const pdfDoc = await PDFDocument.create();

  // ── The paper's own cover sheet goes first (Adrian, 6 Sep 2026) ──────────────
  // "Cover page is the first page": when the hand-in includes the printed MOE /
  // school front sheet (page classification kind 'cover'), it opens the PDF,
  // the "Where your marks went" page follows, then the marked pages. A paper
  // without a cover sheet is unchanged. The paper-total strip lands on the first
  // page drawn, so on such a paper it sits on the cover — where a total belongs.
  let coverSet = new Set<number>();
  if (runId && annotated.length) {
    try {
      const { data } = await getSupabaseAdmin().from('paper_marking_runs')
        .select('page_classification:result_json->page_classification').eq('id', runId).maybeSingle();
      coverSet = new Set(coverPhotoIndexes((data as { page_classification?: unknown } | null)?.page_classification));
    } catch (e) { console.warn('[mark-paper-pdf] page classification unavailable, no cover-first:', (e as Error).message); }
  }
  const coverPhotos = annotated.filter(a => coverSet.has(a.photo_index));
  const bodyPhotos = annotated.filter(a => !coverSet.has(a.photo_index));
  // Practices get no PAPER TOTAL strip — only papers with an OFFICIAL denominator
  // (registry-matched or the "out of ___" box) are exam/test papers. Starting
  // totalDrawn true skips the strip and the stamp entirely.
  let totalDrawn = !shouldStampPaperTotal(body.totals?.max_source);
  const embedPage = async (pg: ReturnType<typeof orderMarkedPages<typeof annotated[number], typeof pngs[number]>>[number]) => {
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
  };
  for (const cp of coverPhotos) await embedPage({ kind: 'photo', item: cp });
  // ── Page 1: where the marks went (Adrian, 1 Sep 2026) ──────────────────────
  // A student opening a marked script sees twenty pages of red before they see
  // what to DO about it. This puts the answer first: what to work on, ranked by
  // what they are still getting wrong, read across every paper they have handed
  // in so a habit can be told from a bad day.
  //
  // Fail-soft by construction (renderFrontPagePng never throws): a paper without
  // its cover is still a paper, and nothing here may cost a student their marked
  // script. `frontPage: false` skips it for callers that do not want one.
  if (runId && body.frontPage !== false) {
    try {
      const fp = await buildFrontPage(runId, {
        paperName: body.paperName ?? null, awarded: totalAwarded, max: totalMax,
        studentName: student.name ?? null,
      });
      if (fp) {
        const img = await pdfDoc.embedPng(fp);
        const h = Math.round(PAGE_W * (img.height / img.width));
        const page = pdfDoc.addPage([PAGE_W, h]);
        page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: h });
      }
    } catch (e) { console.warn('[mark-paper-pdf] front page skipped:', (e as Error).message); }
  }

  const pages = orderMarkedPages(
    bodyPhotos.map(a => ({ photo_index: a.photo_index, item: a })),
    pngs.map(p => ({ photo_index: p.photo_index, label: p.label, item: p })),
  );
  for (const pg of pages) await embedPage(pg);
  // ── Worked solutions at the back — the model-answers booklet ────────────────
  for (const buf of bookletPages) {
    try {
      const img = await pdfDoc.embedPng(buf);
      const h = Math.round(PAGE_W * (img.height / img.width));
      const page = pdfDoc.addPage([PAGE_W, h]);
      page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: h });
    } catch (e) { console.error('[mark-paper-pdf] booklet embed failed', (e as Error).message); }
  }
  const pdfBytes = await pdfDoc.save();
  // One fixed name per run and mode — a rebuild REPLACES the machine's copy
  // (the Dropbox "Marked (AI).pdf" rule, now in the private store). Runs without
  // an id (a bare page build) land under uploads/.
  const blob = await putStudentFile({
    key: runId ? runKey(runId, mode === 'photos' ? 'marked-photos.pdf' : 'marked-full.pdf') : uploadKey(`marked-${mode}-${id}.pdf`),
    body: Buffer.from(pdfBytes), contentType: 'application/pdf',
  });
  await linkToRun(runId, blob.url, mode);
  return NextResponse.json({ url: blob.url, kind: 'pdf', totalAwarded, totalMax });
}


/**
 * The front page's data: the lost parts of THIS run and nothing else. The first
 * version read the student's last 12 papers so a weakness could be told from a
 * bad day; Adrian, 2 Sep 2026: "we should just analyze that particular exam
 * paper, not across 5 papers".
 *
 * THE SHEET'S DIAGNOSIS WINS (Adrian, 2 Sep 2026: "the sheet's diagnosis should
 * drive the cover, not the cover the sheet"). When the self-study worker has
 * written its diagnosis back onto the run (`result_json.diagnosis`, via the
 * sheet-jobs `done` action), the themes are built from it, in the sheet's own
 * section order — lib/sheet-diagnosis.ts. The keyword classifier over the
 * marker's notes is the fallback for a paper with no sheet yet. The "Where the
 * marks went" question bars come from the marker's parts either way.
 *
 * Returns null — not an error — whenever there is nothing worth fronting: a
 * paper with no losses, a database hiccup. The caller then assembles exactly
 * the PDF it always did. (buildPdf's link-recovery behaviour — docs/MARKING.md —
 * is untouched by anything here.)
 */
async function buildFrontPage(
  runId: string,
  meta: { paperName: string | null; awarded: number; max: number; studentName: string | null },
): Promise<Buffer | null> {
  const sb = getSupabaseAdmin();
  const { data: run } = await sb.from('paper_marking_runs')
    .select('id, student_name, paper_name, created_at, result_json').eq('id', runId).maybeSingle();
  if (!run) return null;

  const rows = [run as { id: string; paper_name: string | null; created_at: string; result_json: unknown }];

  const parts: LostPart[] = [];
  for (const r of rows) {
    const res = (r.result_json as { results?: unknown[] } | null)?.results;
    if (!Array.isArray(res)) continue;
    for (const q of res as Record<string, never>[]) {
      const mo = (q as { marking_output?: { parts?: Record<string, unknown>[]; meta?: { topic_detected?: unknown } } }).marking_output;
      const topic = String(mo?.meta?.topic_detected ?? '');
      for (const p of (mo?.parts ?? [])) {
        const mx = Number(p.max), aw = Number(p.awarded);
        if (!Number.isFinite(mx) || !Number.isFinite(aw) || aw >= mx) continue;
        parts.push({
          paperId: r.id, paperName: r.paper_name || 'a paper', createdAt: r.created_at,
          question: String((q as { question_number?: unknown }).question_number ?? '?'),
          label: String(p.label ?? ''), lost: mx - aw, max: mx,
          blank: p.not_attempted === true, why: String(p.error_summary ?? ''), topic,
        });
      }
    }
  }
  const diagnosis = readDiagnosis(run.result_json);
  // Nothing lost anywhere: a cover page saying so would be noise on a clean script.
  if (!parts.length && !diagnosis) return null;

  // Marks lost by KIND of error, from the marker's `parts[].error_kind` labels
  // (lib/error-kinds.ts — the contract with the bot). The page hides the row
  // when nothing is labelled, so a run from before the labels is unchanged;
  // and a bad results shape costs the row, never the cover.
  let errorKinds = null;
  try {
    errorKinds = errorKindTotals((run.result_json as { results?: unknown } | null)?.results);
  } catch (e) { console.warn('[mark-paper-pdf] error kinds skipped:', (e as Error).message); }

  return renderFrontPagePng({
    errorKinds,
    studentName: meta.studentName || run.student_name,
    paperName: meta.paperName || run.paper_name,
    markedOn: null,
    awarded: meta.awarded, max: meta.max,
    papersRead: 1,
    themes: diagnosis ? themesFromDiagnosis(diagnosis, run.paper_name || 'this paper') : analyse(parts, runId),
    themesSource: diagnosis ? 'sheet' : 'marker',
    worstQuestions: worstQuestions(parts, runId),
  });
}
