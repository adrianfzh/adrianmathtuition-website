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
import type { InkPages } from '@/lib/student-ink';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COLUMNS = 'id, created_at, paper_name, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, total_awarded, total_max, paper_subject, student_label';

export async function GET(req: NextRequest) {
  const { account } = await currentStudent(); // no session → redirect to /login

  const runId = (req.nextUrl.searchParams.get('run') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'run is required' }, { status: 400 });
  const kind = req.nextUrl.searchParams.get('kind') === 'full' ? 'full' : 'marked';
  // ✍️ ?notes=1 (17 Sep 2026, SPEC-STUDENT-FIRST §12): the marked pages with the
  // student's own ink baked in — built on request from the page images and the
  // student_ink layer, never stored, never touching the marked copy.
  const withNotes = req.nextUrl.searchParams.get('notes') === '1';

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('paper_marking_runs')
    .select(COLUMNS)
    .eq('id', runId)
    .eq('student_id', portalIdentity(account))
    .not('released_at', 'is', null)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const row = data as { created_at: string; paper_name: string | null; annotated_pdf_url: string | null; photos_pdf_url: string | null; pdf_url: string | null };
  if (withNotes) {
    const { papers } = buildStudentMarking([data as unknown as MarkingRunRow], { studentName: account.display_name ?? null });
    const paper = papers[0];
    if (!paper || !paper.pages.length) return NextResponse.json({ error: 'no pages' }, { status: 404 });
    const { data: inkRow } = await sb.from('student_ink').select('pages').eq('run_id', runId).eq('identity', portalIdentity(account)).maybeSingle();
    const ink = ((inkRow?.pages as InkPages | undefined) ?? {});
    const pdfDoc = await PDFDocument.create();
    const PAGE_W = 595;
    for (const p of paper.pages) {
      const r = await fetchOurFile(p.url);
      if (!r.ok) continue;
      let buf: Buffer = Buffer.from(await r.arrayBuffer());
      const layer = Number.isInteger(p.index) ? ink[p.index] : undefined;
      if (layer && layer.strokes.length) {
        const meta = await sharp(buf).metadata();
        const w = meta.width ?? layer.w, h = meta.height ?? layer.h;
        const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${layer.w} ${layer.h}">${strokesToSvg(layer.strokes)}</svg>`);
        buf = await sharp(buf).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
      }
      const img = await pdfDoc.embedJpg(buf).catch(() => pdfDoc.embedPng(buf));
      const drawH = Math.round(PAGE_W * (img.height / img.width));
      const page = pdfDoc.addPage([PAGE_W, drawH]);
      page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: drawH });
    }
    const bytes = await pdfDoc.save();
    const base = markedPdfFilename({ studentName: account.display_name, paperName: displayPaperName(row.paper_name, account.display_name), dateISO: row.created_at, kind: 'marked' });
    const name = base.replace(/\.pdf$/i, '') + ' (with my notes).pdf';
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
    studentName: account.display_name, paperName: displayPaperName(row.paper_name, account.display_name), dateISO: row.created_at, kind,
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
