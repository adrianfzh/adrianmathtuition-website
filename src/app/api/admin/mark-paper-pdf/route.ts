import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { renderMarkingPNG, type MarkingOutput } from '@/lib/render-marking';
import { orderMarkedPages } from '@/lib/marked-pdf-order';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type ResultIn = { question_number: string; marking_output: MarkingOutput | null; photo_index?: number | null };

// Height of the header strip added above the FIRST page to carry the paper total.
// The total lives on the first marked page, not on a cover sheet of its own (Adrian,
// Jul 2026: "don't have to put the first page") — a marked script starts with the work.
const stripHeight = (imgWidth: number) => Math.max(52, Math.round(imgWidth * 0.062));

// Paper total, drawn into that strip. It sits on the LEFT and is labelled, because the
// annotated photo already carries a hand-circled PAGE total in its top-right corner and
// two unlabelled red scores stacked in one corner read as a contradiction.
async function drawPaperTotal(
  pdfDoc: PDFDocument,
  page: PDFPage,
  p: { width: number; imgHeight: number; studentName: string; studentLevel: string; totalAwarded: number; totalMax: number },
): Promise<void> {
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const strip = stripHeight(p.width);
  const red = rgb(0.816, 0.204, 0.173);
  const pad = Math.round(strip * 0.3);
  const yMid = p.imgHeight + strip / 2;

  // The image is drawn at y=0, so the strip is bare page above it — paint it white so a
  // JPEG's edge tint doesn't bleed into the label.
  page.drawRectangle({ x: 0, y: p.imgHeight, width: p.width, height: strip, color: rgb(1, 1, 1) });

  const label = 'PAPER TOTAL';
  const score = `${p.totalAwarded} / ${p.totalMax}`;
  const labelSize = Math.round(strip * 0.24), scoreSize = Math.round(strip * 0.46);
  const boxW = pad * 2 + Math.max(bold.widthOfTextAtSize(score, scoreSize), reg.widthOfTextAtSize(label, labelSize));
  const boxH = strip * 0.82;
  page.drawRectangle({
    x: pad, y: yMid - boxH / 2, width: boxW, height: boxH,
    borderColor: red, borderWidth: Math.max(1.5, strip * 0.028),
  });
  page.drawText(label, { x: pad * 2, y: yMid + boxH * 0.08, font: reg, size: labelSize, color: red });
  page.drawText(score, { x: pad * 2, y: yMid - boxH * 0.42, font: bold, size: scoreSize, color: red });

  const who = [p.studentName, p.studentLevel].filter(Boolean).join('  ·  ');
  const dateStr = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });
  const meta = [who, dateStr, 'AdrianMath'].filter(Boolean).join('   ·   ');
  const metaSize = Math.round(strip * 0.22);
  page.drawText(meta, {
    x: p.width - pad - reg.widthOfTextAtSize(meta, metaSize), y: yMid - metaSize * 0.35,
    font: reg, size: metaSize, color: rgb(0.42, 0.447, 0.502),
  });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { results?: ResultIn[]; annotated_photos?: { photo_index: number; url: string }[]; totals?: { awarded: number; max: number }; student?: { name?: string; level?: string }; multi?: boolean; mode?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const mode = body.mode === 'photos' ? 'photos' : 'full';   // 'photos' = annotated originals only (no typeset)
  const results = (body.results || []).filter(r => r.marking_output && Array.isArray(r.marking_output.lines));

  const student = { name: body.student?.name || '', level: body.student?.level || '' };
  const ts = new Date().toISOString();

  // Render each question to a typeset PNG (skipped in photos-only mode).
  const pngs: { label: string; buf: Buffer; awarded: number; max: number; photo_index?: number | null }[] = [];
  if (mode !== 'photos') for (const r of results) {
    const mo = r.marking_output!;
    try {
      const buf = await renderMarkingPNG({ marking: mo, student, timestamp: ts });
      pngs.push({ label: String(r.question_number), buf, awarded: mo.marks?.awarded ?? 0, max: mo.marks?.max ?? 0, photo_index: r.photo_index });
    } catch (e) {
      console.error('[mark-paper-pdf] render failed for', r.question_number, (e as Error).message);
    }
  }
  // Fetch the annotated ORIGINAL photos (PNGs from Blob) — these go in the PDF first.
  const annotated: { photo_index: number; buf: Buffer }[] = [];
  for (const ap of (body.annotated_photos || [])) {
    try {
      const r = await fetch(ap.url);
      if (r.ok) annotated.push({ photo_index: ap.photo_index, buf: Buffer.from(await r.arrayBuffer()) });
    } catch (e) { console.error('[mark-paper-pdf] fetch annotated failed', (e as Error).message); }
  }
  annotated.sort((a, b) => a.photo_index - b.photo_index);

  if (!pngs.length && !annotated.length) return NextResponse.json({ error: 'Nothing to render' }, { status: 500 });

  const id = ts.replace(/[:.]/g, '-');
  const single = !body.multi && pngs.length === 1 && annotated.length === 0;

  if (single) {
    const blob = await put(`mark-paper/${id}.png`, pngs[0].buf, { access: 'public', contentType: 'image/png', allowOverwrite: true });
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
  let totalDrawn = false;
  for (const pg of pages) {
    try {
      const buf = pg.item.buf;
      // Annotated photos come off Blob as JPEG; typeset sheets are always PNG.
      const img = pg.kind === 'photo'
        ? await pdfDoc.embedJpg(buf).catch(() => pdfDoc.embedPng(buf))
        : await pdfDoc.embedPng(buf);
      // First page only: grow the sheet by a header strip and stamp the paper total there.
      const strip = totalDrawn ? 0 : stripHeight(img.width);
      const page = pdfDoc.addPage([img.width, img.height + strip]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      if (!totalDrawn) {
        totalDrawn = true;   // set first: a failed stamp must not push the strip onto page 2
        await drawPaperTotal(pdfDoc, page, {
          width: img.width, imgHeight: img.height,
          studentName: student.name, studentLevel: student.level, totalAwarded, totalMax,
        });
      }
    } catch (e) { console.error('[mark-paper-pdf] embed failed', pg.kind, (e as Error).message); }
  }
  const pdfBytes = await pdfDoc.save();
  const blob = await put(`mark-paper/${id}.pdf`, Buffer.from(pdfBytes), { access: 'public', contentType: 'application/pdf', allowOverwrite: true });
  return NextResponse.json({ url: blob.url, kind: 'pdf', totalAwarded, totalMax });
}
