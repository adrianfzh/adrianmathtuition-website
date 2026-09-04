// POST /api/admin/mark-paper-annotate-pdf — the ✏️ Annotate overlay's Done step.
//
// The client has already flattened every INKED page to a JPEG and PUT it to Blob via
// the client-token flow (un-inked pages keep their original Blob URL — byte-identical,
// no second JPEG generation). This route stitches those pages, in photo_index order,
// into one PDF laid out EXACTLY like the 🖼 images PDF it replaces (shared layout in
// lib/marked-pdf-layout.ts, paper-total strip on page 1), uploads it, and best-effort
// links it to the run as the annotated copy (kind 'annotated' — the same single slot
// the Notability upload path writes; last write wins, both are "Adrian's reviewed
// copy"). Returns { url, linked } — when linked is false the page retries the link
// through the normal proxy, exactly as uploadAnnotated does.

import { NextRequest, NextResponse } from 'next/server';
import { putStudentFile, fetchOurFile, isOurFileUrl, runKey } from '@/lib/student-files';
import { PDFDocument } from 'pdf-lib';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { PAGE_W, drawPaperTotal, stripHeight, shouldStampPaperTotal } from '@/lib/marked-pdf-layout';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type PageIn = { photo_index: number; url: string };
type Body = {
  runId?: string;
  pages?: PageIn[];
  totals?: { awarded: number; max: number; counted_max?: number; max_source?: string } | null;
  student?: { name?: string; level?: string };
};

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const runId = body.runId || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'bad runId' }, { status: 400 });

  const pages = (body.pages || []).slice().sort((a, b) => a.photo_index - b.photo_index);
  if (!pages.length) return NextResponse.json({ error: 'no pages' }, { status: 400 });
  for (const p of pages) {
    if (!isOurFileUrl(p.url)) return NextResponse.json({ error: 'page url is not our file store' }, { status: 400 });
  }

  // Fetch pages in order. Any single failure aborts — a hand-annotated document with
  // a silently missing page is worse than an error Adrian can retry.
  const bufs: Buffer[] = [];
  for (const p of pages) {
    const r = await fetchOurFile(p.url);
    if (!r.ok) return NextResponse.json({ error: `page ${p.photo_index + 1} fetch failed (${r.status})` }, { status: 502 });
    bufs.push(Buffer.from(await r.arrayBuffer()));
  }

  const totalAwarded = body.totals?.awarded ?? 0;
  const totalMax = body.totals?.max ?? 0;
  const student = { name: body.student?.name || '', level: body.student?.level || '' };

  const pdfDoc = await PDFDocument.create();
  // Same practice-vs-exam gate as the 🖼/📄 builds — see shouldStampPaperTotal.
  let totalDrawn = !shouldStampPaperTotal(body.totals?.max_source);
  for (const buf of bufs) {
    // Flattened pages are JPEG; pass-through originals off Blob are usually JPEG but
    // may be PNG — same fallback the images-PDF build uses.
    const img = await pdfDoc.embedJpg(buf).catch(() => pdfDoc.embedPng(buf));
    const drawH = Math.round(PAGE_W * (img.height / img.width));
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
  }

  const pdfBytes = await pdfDoc.save();
  const blob = await putStudentFile({
    key: runKey(runId, `annotated-${crypto.randomUUID()}.pdf`),
    body: Buffer.from(pdfBytes), contentType: 'application/pdf',
  });

  // Best-effort server-side link to the run (same phase the client proxy uses). The
  // client falls back to linking through /api/admin/mark-paper when linked=false, so
  // a missing bot env here degrades gracefully instead of orphaning the PDF.
  let linked = false;
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (botBase && botSecret) {
    try {
      const r = await fetch(`${botBase}/api/mark-paper`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'link-pdf', id: runId, url: blob.url, kind: 'annotated' }),
      });
      linked = r.ok;
    } catch { /* linked stays false; client retries via proxy */ }
  }

  return NextResponse.json({ url: blob.url, linked });
}
