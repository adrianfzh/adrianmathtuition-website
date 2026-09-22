// GET /api/portal/marking-pdf?run=<paper_marking_runs.id>&kind=marked|full
//
// The student's own marked script, streamed same-origin with a proper filename
// (lib/marked-pdf-filename.ts): "Kassandra Lim — am tys 2021 p1 — 3 Sep 2026.pdf".
// Until 3 Sep 2026 /app/marking linked straight at Vercel Blob, so an opened or
// saved copy carried the Blob timestamp path as its name (Adrian: "the pdf should
// be properly named"). Nothing is stored: the bytes pass through.
//
// Access control mirrors /app/marking and practice-pdf exactly: the session
// student's Airtable identity, released runs only. `kind=marked` = Adrian's pen
// > the red-pen page images > the full report (the same precedence
// buildStudentMarking uses for `pdfUrl`); `kind=full` = the full report only.

import { NextRequest, NextResponse } from 'next/server';
import { currentStudent, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isOurFileUrl, fetchOurFile } from '@/lib/student-files';
import { markedPdfFilename, contentDisposition } from '@/lib/marked-pdf-filename';
import { displayPaperName } from '@/lib/paper-display-name';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { strokesToSvg } from '@/lib/annotate/layer';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { TEACHER_INK_IDENTITY } from '@/lib/student-ink';
import type { InkPages } from '@/lib/student-ink';
import { notesChoice, layersFor, notesSuffix } from '@/lib/marking-notes-layers';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COLUMNS = 'id, created_at, paper_name, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, total_awarded, total_max, paper_subject, student_label, student_id';

export async function GET(req: NextRequest) {
  // Adrian's admin sign-in downloads any released paper (18 Sep 2026, the read-only viewer);
  // a student must be signed in (currentStudent redirects to /login otherwise).
  const isAdmin = verifyAdminSession(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  const account = isAdmin ? null : (await currentStudent()).account;

  const runId = (req.nextUrl.searchParams.get('run') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'run is required' }, { status: 400 });
  const kind = req.nextUrl.searchParams.get('kind') === 'full' ? 'full' : 'marked';
  // ✍️ ?notes=1 (17 Sep 2026, SPEC-STUDENT-FIRST §12): the marked pages with the
  // student's own ink baked in — built on request from the page images and the
  // student_ink layer, never stored, never touching the marked copy.
  // 22 Sep 2026: three-way — ?notes=mine (the student's ink), ?notes=adrian (Adrian's
  // notes on their paper), ?notes=1|all (both, the legacy value).
  const notes = notesChoice(req.nextUrl.searchParams.get('notes'));
  const withNotes = notes !== 'none';

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('paper_marking_runs')
    .select(COLUMNS)
    .eq('id', runId)
    .not('released_at', 'is', null)
    .maybeSingle();
  if (data && account && (data as { student_id?: string | null }).student_id !== portalIdentity(account)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const row = data as { created_at: string; paper_name: string | null; annotated_pdf_url: string | null; photos_pdf_url: string | null; pdf_url: string | null };
  if (withNotes) {
    const { papers } = buildStudentMarking([data as unknown as MarkingRunRow], { studentName: (account?.display_name ?? null) ?? null });
    const paper = papers[0];
    if (!paper || !paper.pages.length) return NextResponse.json({ error: 'no pages' }, { status: 404 });
    // The chosen layers ride into the download: Adrian's notes first, the student's on top.
    const want = layersFor(notes);
    const { data: inkRows } = await sb.from('student_ink').select('identity, pages').eq('run_id', runId).in('identity', [String((data as { student_id?: string | null }).student_id ?? ''), TEACHER_INK_IDENTITY]);
    const ink: InkPages = {}; const teacher: InkPages = {};
    for (const r of (inkRows ?? []) as { identity: string; pages: InkPages }[]) Object.assign(r.identity === TEACHER_INK_IDENTITY ? teacher : ink, r.pages ?? {});
    const pdfDoc = await PDFDocument.create();
    const PAGE_W = 595;
    for (const p of paper.pages) {
      const r = await fetchOurFile(p.url);
      if (!r.ok) continue;
      let buf: Buffer = Buffer.from(await r.arrayBuffer());
      const layers = Number.isInteger(p.index) ? [want.teacher ? teacher[p.index] : undefined, want.student ? ink[p.index] : undefined].filter((l): l is InkPages[number] => !!l && l.strokes.length > 0) : [];
      if (layers.length) {
        const meta = await sharp(buf).metadata();
        const overlays = layers.map(layer => {
          const w = meta.width ?? layer.w, h = meta.height ?? layer.h;
          return { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${layer.w} ${layer.h}">${strokesToSvg(layer.strokes)}</svg>`), top: 0, left: 0 };
        });
        buf = await sharp(buf).composite(overlays).jpeg({ quality: 90 }).toBuffer();
      }
      const img = await pdfDoc.embedJpg(buf).catch(() => pdfDoc.embedPng(buf));
      const drawH = Math.round(PAGE_W * (img.height / img.width));
      const page = pdfDoc.addPage([PAGE_W, drawH]);
      page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: drawH });
    }
    const bytes = await pdfDoc.save();
    const base = markedPdfFilename({ studentName: (account?.display_name ?? null), paperName: displayPaperName(row.paper_name, (account?.display_name ?? null)), dateISO: row.created_at, kind: 'marked' });
    const name = base.replace(/\.pdf$/i, '') + notesSuffix(notes) + '.pdf';
    return new NextResponse(Buffer.from(bytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(name, 'inline'), 'Cache-Control': 'private, no-store' },
    });
  }
  const url = kind === 'full'
    ? row.pdf_url
    : (row.annotated_pdf_url || row.photos_pdf_url || row.pdf_url);
  if (!url || !isOurFileUrl(url)) return NextResponse.json({ error: 'no pdf' }, { status: 404 });

  const filename = markedPdfFilename({
    // The paper's name the way the student knows it ("A Math · GCE 2022 · Paper 1"),
    // not the internal one Adrian typed ("rainie am tys 2022 p1") — same as the list.
    studentName: (account?.display_name ?? null), paperName: displayPaperName(row.paper_name, (account?.display_name ?? null)), dateISO: row.created_at, kind,
  });

  const r = await fetchOurFile(url);
  if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
  return new NextResponse(r.body, {
    headers: {
      'Content-Type': 'application/pdf',
      // inline: it still opens in the tab the link targets; the name is what
      // Safari's Share / "Save to Files" and a desktop download use.
      'Content-Disposition': contentDisposition(filename, 'inline'),
      'Cache-Control': 'private, no-store',
    },
  });
}
