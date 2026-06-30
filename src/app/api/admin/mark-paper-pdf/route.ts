import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderMarkingPNG, type MarkingOutput } from '@/lib/render-marking';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

type ResultIn = { question_number: string; marking_output: MarkingOutput | null };

// Compact cover page (pdf-lib built-in fonts only — no Sharp/system fonts).
async function addCoverPage(
  pdfDoc: PDFDocument,
  p: { studentName: string; studentLevel: string; questions: Array<{ label: string; awarded: number; max: number }>; totalAwarded: number; totalMax: number },
): Promise<void> {
  const W = 595, H = 842, PAD = 60;
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.insertPage(0, [W, H]);
  const y = (t: number) => H - t;
  const navy = rgb(0x1e / 255, 0x3a / 255, 0x5f / 255);

  page.drawRectangle({ x: 0, y: y(64), width: W, height: 64, color: navy });
  const head = 'AdrianMath Tuition';
  page.drawText(head, { x: (W - bold.widthOfTextAtSize(head, 22)) / 2, y: y(44), font: bold, size: 22, color: rgb(1, 1, 1) });

  const title = 'Marked Paper';
  page.drawText(title, { x: (W - bold.widthOfTextAtSize(title, 30)) / 2, y: y(136), font: bold, size: 30, color: rgb(0.067, 0.094, 0.153) });

  const body = rgb(0.216, 0.255, 0.318);
  const dateStr = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });
  page.drawText(`Student: ${p.studentName || '—'}`, { x: PAD, y: y(200), font: reg, size: 13, color: body });
  page.drawText(`Date: ${dateStr}`, { x: PAD, y: y(220), font: reg, size: 13, color: body });
  page.drawText(`Level: ${p.studentLevel || '—'}`, { x: PAD, y: y(240), font: reg, size: 13, color: body });

  const hr = rgb(0.82, 0.835, 0.855);
  page.drawLine({ start: { x: PAD, y: y(270) }, end: { x: W - PAD, y: y(270) }, thickness: 1, color: hr });

  const score = `Total: ${p.totalAwarded} / ${p.totalMax}`;
  page.drawText(score, { x: (W - bold.widthOfTextAtSize(score, 38)) / 2, y: y(350), font: bold, size: 38, color: navy });
  page.drawLine({ start: { x: PAD, y: y(390) }, end: { x: W - PAD, y: y(390) }, thickness: 1, color: hr });

  page.drawText('Question breakdown:', { x: PAD, y: y(412), font: reg, size: 11, color: rgb(0.42, 0.447, 0.502) });
  const cols = p.questions.length > 7 ? 2 : 1;
  const halfN = Math.ceil(p.questions.length / cols);
  const lineH = Math.min(22, (680 - 428) / Math.max(halfN, 1));
  const colW = (W - 2 * PAD) / cols;
  p.questions.forEach((q, i) => {
    const col = Math.floor(i / halfN), row = i % halfN;
    const pct = q.max > 0 ? (q.awarded / q.max) * 100 : 0;
    const color = pct === 100 ? rgb(0.086, 0.396, 0.204) : pct >= 50 ? rgb(0.572, 0.251, 0.055) : rgb(0.6, 0.106, 0.106);
    page.drawText(`Q${q.label}: ${q.awarded}/${q.max}`, { x: PAD + col * colW, y: y(428 + (row + 1) * lineH), font: bold, size: 11, color });
  });

  page.drawLine({ start: { x: PAD, y: y(690) }, end: { x: W - PAD, y: y(690) }, thickness: 1, color: hr });
  const foot = 'Marked by AdrianMath AI  ·  Reviewed by Adrian';
  page.drawText(foot, { x: (W - reg.widthOfTextAtSize(foot, 10)) / 2, y: y(712), font: reg, size: 10, color: rgb(0.612, 0.639, 0.686) });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { results?: ResultIn[]; annotated_photos?: { photo_index: number; url: string }[]; student?: { name?: string; level?: string }; multi?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const results = (body.results || []).filter(r => r.marking_output && Array.isArray(r.marking_output.lines));
  if (!results.length) return NextResponse.json({ error: 'No marking output to render' }, { status: 400 });

  const student = { name: body.student?.name || '', level: body.student?.level || '' };
  const ts = new Date().toISOString();

  // Render each question to a typeset PNG (sequential — shared Puppeteer browser).
  const pngs: { label: string; buf: Buffer; awarded: number; max: number }[] = [];
  for (const r of results) {
    const mo = r.marking_output!;
    try {
      const buf = await renderMarkingPNG({ marking: mo, student, timestamp: ts });
      pngs.push({ label: String(r.question_number), buf, awarded: mo.marks?.awarded ?? 0, max: mo.marks?.max ?? 0 });
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

  // Assemble a PDF: annotated original photos first, then typeset sheets (question order), + cover.
  pngs.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const pdfDoc = await PDFDocument.create();
  for (const a of annotated) {
    try {
      let img;
      try { img = await pdfDoc.embedJpg(a.buf); } catch { img = await pdfDoc.embedPng(a.buf); }
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } catch (e) { console.error('[mark-paper-pdf] embed annotated failed', (e as Error).message); }
  }
  for (const p of pngs) {
    const img = await pdfDoc.embedPng(p.buf);
    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const totalAwarded = pngs.reduce((s, p) => s + p.awarded, 0);
  const totalMax = pngs.reduce((s, p) => s + p.max, 0);
  try {
    await addCoverPage(pdfDoc, { studentName: student.name, studentLevel: student.level, questions: pngs.map(p => ({ label: p.label, awarded: p.awarded, max: p.max })), totalAwarded, totalMax });
  } catch (e) {
    console.error('[mark-paper-pdf] cover page failed:', (e as Error).message);
  }
  const pdfBytes = await pdfDoc.save();
  const blob = await put(`mark-paper/${id}.pdf`, Buffer.from(pdfBytes), { access: 'public', contentType: 'application/pdf', allowOverwrite: true });
  return NextResponse.json({ url: blob.url, kind: 'pdf', totalAwarded, totalMax });
}
