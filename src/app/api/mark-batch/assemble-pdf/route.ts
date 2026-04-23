import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { getSupabase } from '@/lib/supabase';
import { put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// ── Cover page — drawn with PDF-lib built-in fonts (no Sharp, no system fonts needed) ──

async function addCoverPage(
  pdfDoc: PDFDocument,
  params: {
    studentName: string;
    createdAt: string;
    studentLevel: string;
    questions: Array<{ label: string; awarded: number; max: number }>;
    totalAwarded: number;
    totalMax: number;
  }
): Promise<void> {
  const { studentName, createdAt, studentLevel, questions, totalAwarded, totalMax } = params;

  // A4 in PDF points (72 pt/inch × 8.27 × 11.69 in)
  const W = 595;
  const H = 842;
  const PAD = 60;

  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Insert cover as first page
  const page = pdfDoc.insertPage(0, [W, H]);

  // PDF-lib y=0 is bottom; helper converts "y from top"
  const y = (fromTop: number) => H - fromTop;

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Header bar ───────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: y(64), width: W, height: 64, color: rgb(0x1e / 255, 0x3a / 255, 0x5f / 255) });
  const headerText = 'AdrianMath Tuition';
  const headerSize = 22;
  const headerW = fontBold.widthOfTextAtSize(headerText, headerSize);
  page.drawText(headerText, { x: (W - headerW) / 2, y: y(44), font: fontBold, size: headerSize, color: rgb(1, 1, 1) });

  // ── Title ────────────────────────────────────────────────────────────────
  const titleText = 'Marked Homework';
  const titleSize = 30;
  const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, { x: (W - titleW) / 2, y: y(136), font: fontBold, size: titleSize, color: rgb(0.067, 0.094, 0.153) });

  // ── Student details ──────────────────────────────────────────────────────
  const bodySize = 13;
  const bodyColor = rgb(0.216, 0.255, 0.318);
  page.drawText(`Student: ${studentName || '—'}`, { x: PAD, y: y(200), font: fontReg, size: bodySize, color: bodyColor });
  page.drawText(`Date: ${dateStr}`, { x: PAD, y: y(220), font: fontReg, size: bodySize, color: bodyColor });
  page.drawText(`Level: ${studentLevel || 'Not specified'}`, { x: PAD, y: y(240), font: fontReg, size: bodySize, color: bodyColor });

  // ── HR 1 ─────────────────────────────────────────────────────────────────
  const hrColor = rgb(0.82, 0.835, 0.855);
  page.drawLine({ start: { x: PAD, y: y(270) }, end: { x: W - PAD, y: y(270) }, thickness: 1, color: hrColor });

  // ── Total score ──────────────────────────────────────────────────────────
  const scoreText = `Total: ${totalAwarded} / ${totalMax}`;
  const scoreSize = 38;
  const scoreW = fontBold.widthOfTextAtSize(scoreText, scoreSize);
  page.drawText(scoreText, { x: (W - scoreW) / 2, y: y(350), font: fontBold, size: scoreSize, color: rgb(0x1e / 255, 0x3a / 255, 0x5f / 255) });

  // ── HR 2 ─────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: PAD, y: y(390) }, end: { x: W - PAD, y: y(390) }, thickness: 1, color: hrColor });

  // ── Question breakdown ───────────────────────────────────────────────────
  const smallSize = 11;
  page.drawText('Question breakdown:', { x: PAD, y: y(412), font: fontReg, size: smallSize, color: rgb(0.42, 0.447, 0.502) });

  const useColumns = questions.length > 7;
  const colCount = useColumns ? 2 : 1;
  const halfN = Math.ceil(questions.length / colCount);
  const breakdownTop = 428;
  const breakdownBottom = 680;
  const availH = breakdownBottom - breakdownTop;
  const dynLineH = Math.min(22, availH / Math.max(halfN, 1));
  const colW = (W - 2 * PAD) / colCount;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const col = Math.floor(i / halfN);
    const row = i % halfN;
    const x = PAD + col * colW;
    const yPos = y(breakdownTop + (row + 1) * dynLineH);
    const pct = q.max > 0 ? Math.round((q.awarded / q.max) * 100) : 0;
    const color = pct === 100 ? rgb(0.086, 0.396, 0.204)
      : pct >= 50 ? rgb(0.572, 0.251, 0.055)
      : rgb(0.6, 0.106, 0.106);
    page.drawText(`${q.label}: ${q.awarded}/${q.max}`, { x, y: yPos, font: fontBold, size: smallSize, color });
  }

  // ── HR 3 ─────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: PAD, y: y(690) }, end: { x: W - PAD, y: y(690) }, thickness: 1, color: hrColor });

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerText = 'Marked by AdrianMath AI  ·  Reviewed by Adrian';
  const footerSize = 10;
  const footerW = fontReg.widthOfTextAtSize(footerText, footerSize);
  page.drawText(footerText, { x: (W - footerW) / 2, y: y(730), font: fontReg, size: footerSize, color: rgb(0.612, 0.639, 0.686) });
}

// ── POST — assemble PDF ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { batchId: string; includeCoverPage: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { batchId, includeCoverPage = true } = body;
  if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

  // ── Fetch batch metadata (Supabase primary, Airtable fallback) ────────────

  let studentName = '';
  let createdAt = '';
  let studentLevel = '';
  let batchAirtableId = '';

  // Supabase — always try first (authoritative)
  try {
    const supabase = getSupabase();
    const { data: sbRow } = await supabase
      .from('marking_batches')
      .select('student_name, created_at, detection_json')
      .eq('id', batchId)
      .single();
    if (sbRow) {
      studentName = sbRow.student_name || '';
      createdAt = sbRow.created_at || '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      studentLevel = (sbRow.detection_json as any)?.studentLevel || '';
    }
  } catch (err) {
    console.warn('[assemble-pdf] Supabase metadata fetch failed:', err);
  }

  // Airtable — try for the record ID (needed for PATCH later); non-fatal if absent
  try {
    const formula = encodeURIComponent(`{Batch ID}="${batchId}"`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (await import('@/lib/airtable')).airtableRequestAll('Batches', `?filterByFormula=${formula}&maxRecords=1`) as any;
    if (data.records?.[0]) {
      const rec = data.records[0];
      batchAirtableId = rec.id;
      const f = rec.fields || {};
      if (!studentName) studentName = f['Student Name'] || '';
      if (!createdAt) createdAt = f['Created At'] || '';
    }
  } catch (err) {
    console.warn('[assemble-pdf] Airtable batch lookup failed (non-fatal):', err);
  }

  // ── Fetch linked submissions from Airtable ────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let submissions: any[] = [];
  if (batchAirtableId) {
    const subFormula = encodeURIComponent(`FIND("${batchAirtableId}", ARRAYJOIN({Batches}))`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subData = await (await import('@/lib/airtable')).airtableRequestAll('Submissions', `?filterByFormula=${subFormula}`) as any;
      submissions = subData.records || [];
    } catch (err) {
      console.error('[assemble-pdf] submissions fetch failed:', err);
    }
  }

  // Sort submissions by question label for consistent ordering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submissions.sort((a: any, b: any) => {
    const la = a.fields?.['Question Number'] || '';
    const lb = b.fields?.['Question Number'] || '';
    return la.localeCompare(lb, undefined, { numeric: true });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let questions = submissions.map((s: any) => ({
    label: s.fields?.['Question Number'] || '?',
    awarded: (s.fields?.['Bot Mark Awarded'] as number) || 0,
    max: (s.fields?.['Bot Mark Max'] as number) || 0,
    annotatedSliceUrls: (() => {
      try { return JSON.parse(s.fields?.['Annotated Slice URLs'] || '[]') as string[]; }
      catch { return [] as string[]; }
    })(),
  }));

  let totalAwarded = questions.reduce((sum, q) => sum + q.awarded, 0);
  let totalMax = questions.reduce((sum, q) => sum + q.max, 0);
  let annotatedUrls: string[] = questions.flatMap(q => q.annotatedSliceUrls).filter(Boolean);

  // ── Supabase fallback — when Airtable submissions are absent ─────────────

  if (annotatedUrls.length === 0) {
    try {
      const supabase = getSupabase();
      const { data: sbRow } = await supabase
        .from('marking_batches')
        .select('marking_json')
        .eq('id', batchId)
        .single();

      const mj = sbRow?.marking_json as {
        results?: Array<{
          questionLabel: string;
          annotatedSliceUrl: string | null;
          marks: { awarded: number; max: number };
        }>;
      } | null;

      if (mj?.results?.length) {
        questions = mj.results.map(r => ({
          label: r.questionLabel,
          awarded: r.marks?.awarded ?? 0,
          max: r.marks?.max ?? 0,
          annotatedSliceUrls: r.annotatedSliceUrl ? [r.annotatedSliceUrl] : [],
        }));
        totalAwarded = questions.reduce((sum, q) => sum + q.awarded, 0);
        totalMax = questions.reduce((sum, q) => sum + q.max, 0);
        annotatedUrls = questions.flatMap(q => q.annotatedSliceUrls).filter(Boolean);
        console.log(`[assemble-pdf] Supabase fallback: ${questions.length} questions, ${annotatedUrls.length} images`);
      }
    } catch (err) {
      console.error('[assemble-pdf] Supabase fallback failed:', err);
    }
  }

  if (annotatedUrls.length === 0) {
    return NextResponse.json({ error: 'No annotated images found for this batch' }, { status: 400 });
  }

  // ── Build PDF ─────────────────────────────────────────────────────────────

  const pdfDoc = await PDFDocument.create();

  // Annotated question pages first (cover page is prepended via insertPage(0))
  for (const imgUrl of annotatedUrls) {
    try {
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) { console.warn(`[assemble-pdf] failed to fetch ${imgUrl}`); continue; }
      const imgBytes = await imgRes.arrayBuffer();
      const imgBuf = Buffer.from(imgBytes);

      // Detect format by magic bytes
      const isJpeg = imgBuf[0] === 0xff && imgBuf[1] === 0xd8;
      const img = isJpeg
        ? await pdfDoc.embedJpg(imgBytes)
        : await pdfDoc.embedPng(imgBytes);

      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } catch (err) {
      console.error(`[assemble-pdf] failed to embed ${imgUrl}:`, err);
    }
  }

  if (pdfDoc.getPageCount() === 0) {
    return NextResponse.json({ error: 'PDF has no pages — all images failed to embed' }, { status: 500 });
  }

  // Cover page — inserted at index 0 using PDF-lib native drawing (no Sharp/SVG/fonts needed)
  if (includeCoverPage) {
    try {
      await addCoverPage(pdfDoc, {
        studentName, createdAt, studentLevel,
        questions: questions.map(q => ({ label: q.label, awarded: q.awarded, max: q.max })),
        totalAwarded, totalMax,
      });
    } catch (err) {
      console.error('[assemble-pdf] cover page failed:', err);
      // Non-fatal — PDF still valid without cover
    }
  }

  const pdfBytes = await pdfDoc.save();

  // ── Upload to Blob ────────────────────────────────────────────────────────

  const blob = await put(
    `batches/${batchId}/assembled.pdf`,
    Buffer.from(pdfBytes),
    { access: 'public', contentType: 'application/pdf', allowOverwrite: true }
  );

  const finalizedAt = new Date().toISOString();

  // ── Update Supabase (authoritative state) ────────────────────────────────

  try {
    const supabase = getSupabase();
    await supabase.from('marking_batches').update({
      status: 'finalized',
      final_pdf_url: blob.url,
      finished_at: finalizedAt,
    }).eq('id', batchId);
  } catch (err) {
    console.error('[assemble-pdf] Supabase update failed:', err);
  }

  // ── Update Airtable Batch (non-fatal mirror) ─────────────────────────────

  if (batchAirtableId) {
    try {
      await airtableRequest('Batches', `/${batchAirtableId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            'Final PDF URL': blob.url,
            'Status': 'finalized',
            'Finalized At': finalizedAt,
            'Total Marks Awarded': totalAwarded,
            'Total Marks Max': totalMax,
          },
        }),
      });
    } catch (err) {
      console.error('[assemble-pdf] Airtable update failed:', err);
    }
  }

  return NextResponse.json({
    batchId,
    assembledPdfUrl: blob.url,
    status: 'finalized',
    totalAwarded,
    totalMax,
  });
}
