import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { put } from '@vercel/blob';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// ── Font for cover page SVG ───────────────────────────────────────────────────

const CAVEAT_FONT_PATH = path.join(process.cwd(), 'src/assets/fonts/Caveat.ttf');
let _fontBase64: string | null = null;
function getFontBase64(): string {
  if (_fontBase64 === null) {
    try { _fontBase64 = fs.readFileSync(CAVEAT_FONT_PATH).toString('base64'); }
    catch { _fontBase64 = ''; }
  }
  return _fontBase64;
}

// ── Cover page generator ──────────────────────────────────────────────────────

async function generateCoverPagePng(params: {
  studentName: string;
  createdAt: string;
  studentLevel: string;
  questions: Array<{ label: string; awarded: number; max: number }>;
  totalAwarded: number;
  totalMax: number;
  pageWidth: number;
}): Promise<Buffer | null> {
  let sharpLib: any;
  try { sharpLib = (await import('sharp')).default ?? await import('sharp'); }
  catch { return null; }

  const { studentName, createdAt, studentLevel, questions, totalAwarded, totalMax, pageWidth } = params;

  const W = Math.max(pageWidth, 1240);
  const H = Math.round(W * 1.414); // A4 ratio
  const pad = Math.round(W * 0.1);
  const lineH = Math.round(W * 0.04);
  const titleSize = Math.round(W * 0.055);
  const bodySize = Math.round(W * 0.035);
  const smallSize = Math.round(W * 0.028);
  const midX = W / 2;

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

  const fontBase64 = getFontBase64();
  const fontDef = fontBase64
    ? `<defs><style>@font-face{font-family:'Caveat';src:url('data:font/ttf;base64,${fontBase64}') format('truetype');}</style></defs>`
    : '';

  const hr = (y: number) =>
    `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="#d1d5db" stroke-width="1.5"/>`;

  const qLines = questions.map((q, i) => {
    const y = H * 0.62 + i * lineH * 1.3;
    const pct = q.max > 0 ? Math.round((q.awarded / q.max) * 100) : 0;
    const color = pct === 100 ? '#166534' : pct >= 50 ? '#92400e' : '#991b1b';
    return `<text x="${pad}" y="${y}" font-size="${smallSize}" fill="${color}" font-family="Caveat,sans-serif" font-weight="bold">${q.label}: ${q.awarded}/${q.max}</text>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${fontDef}
    <rect width="${W}" height="${H}" fill="white"/>

    <!-- Header bar -->
    <rect x="0" y="0" width="${W}" height="${Math.round(H * 0.08)}" fill="#1e3a5f"/>
    <text x="${midX}" y="${Math.round(H * 0.055)}" font-size="${Math.round(titleSize * 0.75)}" fill="white" font-family="Caveat,sans-serif" font-weight="bold" text-anchor="middle">AdrianMath Tuition</text>

    <!-- Title -->
    <text x="${midX}" y="${H * 0.18}" font-size="${titleSize}" fill="#111827" font-family="Caveat,sans-serif" font-weight="bold" text-anchor="middle">Marked Homework</text>

    <!-- Student details -->
    <text x="${pad}" y="${H * 0.27}" font-size="${bodySize}" fill="#374151" font-family="Caveat,sans-serif">Student: ${escapeXml(studentName)}</text>
    <text x="${pad}" y="${H * 0.27 + lineH * 1.4}" font-size="${bodySize}" fill="#374151" font-family="Caveat,sans-serif">Date: ${escapeXml(dateStr)}</text>
    <text x="${pad}" y="${H * 0.27 + lineH * 2.8}" font-size="${bodySize}" fill="#374151" font-family="Caveat,sans-serif">Level: ${escapeXml(studentLevel || 'Not specified')}</text>

    ${hr(H * 0.42)}

    <!-- Total score -->
    <text x="${midX}" y="${H * 0.51}" font-size="${Math.round(titleSize * 1.15)}" fill="#1e3a5f" font-family="Caveat,sans-serif" font-weight="bold" text-anchor="middle">Total: ${totalAwarded} / ${totalMax}</text>

    ${hr(H * 0.58)}

    <!-- Per-question breakdown -->
    <text x="${pad}" y="${H * 0.615}" font-size="${smallSize}" fill="#6b7280" font-family="Caveat,sans-serif">Question breakdown:</text>
    ${qLines}

    ${hr(H * 0.87)}

    <!-- Footer -->
    <text x="${midX}" y="${H * 0.92}" font-size="${smallSize}" fill="#9ca3af" font-family="Caveat,sans-serif" text-anchor="middle">Marked by AdrianMath AI · Reviewed by Adrian</text>
  </svg>`;

  try {
    return await sharpLib(Buffer.from(svg))
      .png()
      .toBuffer();
  } catch (err) {
    console.error('[assemble-pdf] cover page render error:', err);
    return null;
  }
}

function escapeXml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  // ── Fetch batch record ────────────────────────────────────────────────────

  const formula = encodeURIComponent(`{Batch ID}="${batchId}"`);
  let batchRecord: any;
  let batchAirtableId: string;
  try {
    const data = await airtableRequestAll('Batches', `?filterByFormula=${formula}&maxRecords=1`);
    if (!data.records?.length) throw new Error('Batch not found');
    batchRecord = data.records[0];
    batchAirtableId = batchRecord.id;
  } catch (err: unknown) {
    return NextResponse.json({ error: `Batch lookup failed: ${err instanceof Error ? err.message : err}` }, { status: 404 });
  }

  const batchFields = batchRecord.fields || {};
  const studentName: string = batchFields['Student Name'] || '';
  const createdAt: string = batchFields['Created At'] || '';

  // Reconstruct student level from Detection JSON if available
  let studentLevel = '';
  let detectionData: any = null;
  try {
    detectionData = JSON.parse(batchFields['Detection JSON'] || '{}');
  } catch { /* ignore */ }

  // ── Fetch linked submissions ──────────────────────────────────────────────

  const subFormula = encodeURIComponent(`FIND("${batchAirtableId}", ARRAYJOIN({Batches}))`);
  let submissions: any[] = [];
  try {
    const subData = await airtableRequestAll('Submissions', `?filterByFormula=${subFormula}`);
    submissions = subData.records || [];
  } catch (err) {
    console.error('[assemble-pdf] submissions fetch failed:', err);
  }

  // Sort submissions by question label for consistent ordering
  submissions.sort((a, b) => {
    const la = a.fields?.['Question Number'] || '';
    const lb = b.fields?.['Question Number'] || '';
    return la.localeCompare(lb, undefined, { numeric: true });
  });

  const questions = submissions.map(s => ({
    label: s.fields?.['Question Number'] || '?',
    awarded: (s.fields?.['Bot Mark Awarded'] as number) || 0,
    max: (s.fields?.['Bot Mark Max'] as number) || 0,
    annotatedSliceUrls: (() => {
      try { return JSON.parse(s.fields?.['Annotated Slice URLs'] || '[]') as string[]; }
      catch { return [] as string[]; }
    })(),
  }));

  const totalAwarded = questions.reduce((sum, q) => sum + q.awarded, 0);
  const totalMax = questions.reduce((sum, q) => sum + q.max, 0);

  // Collect all image URLs in order (cover last so we can prepend)
  const annotatedUrls: string[] = questions.flatMap(q => q.annotatedSliceUrls).filter(Boolean);

  if (annotatedUrls.length === 0) {
    return NextResponse.json({ error: 'No annotated images found for this batch' }, { status: 400 });
  }

  // Determine page width from detection data (for cover page sizing)
  const pageWidth = detectionData?.pages?.[0]?.pageImageWidth || 1240;

  // ── Build PDF ─────────────────────────────────────────────────────────────

  const pdfDoc = await PDFDocument.create();

  // Cover page
  if (includeCoverPage) {
    const coverPng = await generateCoverPagePng({
      studentName, createdAt, studentLevel,
      questions: questions.map(q => ({ label: q.label, awarded: q.awarded, max: q.max })),
      totalAwarded, totalMax, pageWidth,
    });
    if (coverPng) {
      try {
        const coverImg = await pdfDoc.embedPng(coverPng);
        const coverPage = pdfDoc.addPage([coverImg.width, coverImg.height]);
        coverPage.drawImage(coverImg, { x: 0, y: 0, width: coverImg.width, height: coverImg.height });
      } catch (err) {
        console.error('[assemble-pdf] cover embed failed:', err);
      }
    }
  }

  // Annotated question pages
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

  const pdfBytes = await pdfDoc.save();

  // ── Upload to Blob ────────────────────────────────────────────────────────

  const blob = await put(
    `batches/${batchId}/assembled.pdf`,
    Buffer.from(pdfBytes),
    { access: 'public', contentType: 'application/pdf' }
  );

  // ── Update Airtable Batch ─────────────────────────────────────────────────

  try {
    await airtableRequest('Batches', `/${batchAirtableId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          'Final PDF URL': blob.url,
          'Status': 'finalized',
          'Finalized At': new Date().toISOString(),
          'Total Marks Awarded': totalAwarded,
          'Total Marks Max': totalMax,
        },
      }),
    });
  } catch (err) {
    console.error('[assemble-pdf] Airtable update failed:', err);
  }

  return NextResponse.json({
    batchId,
    assembledPdfUrl: blob.url,
    status: 'finalized',
    totalAwarded,
    totalMax,
  });
}
