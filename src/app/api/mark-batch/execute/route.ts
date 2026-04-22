import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { put } from '@vercel/blob';
import {
  buildMarkingPrompt,
  callSonnetMarking,
  callGeminiBboxAnnotations,
  createAnnotatedImage,
  MarkingOutput,
} from '@/lib/marking-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// ── Image helpers ─────────────────────────────────────────────────────────────

async function cropRegion(
  buffer: Buffer,
  pixels: { x1: number; y1: number; x2: number; y2: number },
  pageWidth: number,
  pageHeight: number
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const sharpLib = (await import('sharp')).default;
  const x = Math.max(0, pixels.x1);
  const y = Math.max(0, pixels.y1);
  const w = Math.max(1, Math.min(pageWidth - x, pixels.x2 - pixels.x1));
  const h = Math.max(1, Math.min(pageHeight - y, pixels.y2 - pixels.y1));
  const cropped = await sharpLib(buffer)
    .extract({ left: x, top: y, width: w, height: h })
    .toBuffer();
  return { buffer: cropped, width: w, height: h };
}

async function verticalConcat(
  slices: Array<{ buffer: Buffer; width: number; height: number }>
): Promise<{ buffer: Buffer; width: number; height: number }> {
  if (slices.length === 1) return slices[0];
  const sharpLib = (await import('sharp')).default;
  const maxWidth = Math.max(...slices.map(s => s.width));
  const totalHeight = slices.reduce((sum, s) => sum + s.height, 0);

  const composites: Array<{ input: Buffer; top: number; left: number }> = [];
  let currentY = 0;
  for (const slice of slices) {
    composites.push({ input: slice.buffer, top: currentY, left: 0 });
    currentY += slice.height;
  }

  const combined = await sharpLib({
    create: { width: maxWidth, height: totalHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return { buffer: combined, width: maxWidth, height: totalHeight };
}

// ── Fetch page buffer from Blob URL ───────────────────────────────────────────

async function fetchPageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch page image: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Airtable helpers ──────────────────────────────────────────────────────────

async function fetchBatchRecord(batchId: string): Promise<{ recordId: string; fields: Record<string, unknown> }> {
  const formula = encodeURIComponent(`{Batch ID}="${batchId}"`);
  const data = await airtableRequestAll('Batches', `?filterByFormula=${formula}&maxRecords=1`);
  if (!data.records || data.records.length === 0) {
    throw new Error(`Batch not found: ${batchId}`);
  }
  return { recordId: data.records[0].id, fields: data.records[0].fields };
}

// ── POST — execute marking for a batch ───────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { batchId: string; studentLevel: 'JC' | 'SECONDARY' | 'unknown' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { batchId, studentLevel = 'unknown' } = body;
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  // ── Fetch batch record from Airtable ─────────────────────────────────────

  let batchRecordId: string;
  let detectionData: {
    pages: Array<{
      pageIndex: number;
      pageImageUrl: string;
      pageImageWidth: number;
      pageImageHeight: number;
      questions: Array<{
        questionLabel: string;
        questionRegionPixels: { x1: number; y1: number; x2: number; y2: number };
        isContinuation: boolean;
      }>;
    }>;
    summary: {
      questionGroups: Array<{ questionLabel: string; pages: number[] }>;
    };
    studentName: string;
    studentId: string | null;
  };

  try {
    const { recordId, fields } = await fetchBatchRecord(batchId);
    batchRecordId = recordId;
    const detectionJson = fields['Detection JSON'] as string;
    if (!detectionJson) throw new Error('No Detection JSON in batch record');
    detectionData = JSON.parse(detectionJson);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Batch lookup failed: ${msg}` }, { status: 404 });
  }

  // ── Fetch unique page image buffers from Blob ─────────────────────────────

  const pageMap = new Map<number, { buffer: Buffer; width: number; height: number; url: string }>();
  const uniquePageIndices = [...new Set(
    detectionData.summary.questionGroups.flatMap(g => g.pages)
  )];

  await Promise.all(uniquePageIndices.map(async (pageIdx) => {
    const page = detectionData.pages.find(p => p.pageIndex === pageIdx);
    if (!page) return;
    try {
      const buf = await fetchPageBuffer(page.pageImageUrl);
      pageMap.set(pageIdx, { buffer: buf, width: page.pageImageWidth, height: page.pageImageHeight, url: page.pageImageUrl });
    } catch (err) {
      console.error(`[execute] Failed to fetch page ${pageIdx}:`, err);
    }
  }));

  // ── Process each question group (with concurrency limit) ──────────────────

  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(3);

  interface QuestionResult {
    questionLabel: string;
    pageIndices: number[];
    annotatedSliceUrl: string | null;
    marks: { awarded: number; max: number; marginNote: string };
    summary: { title: string; bodyMarkdown: string };
    markingJson: MarkingOutput | null;
    submissionId: string | null;
    error?: string;
  }

  const systemPrompt = buildMarkingPrompt(null, detectionData.studentName || null, studentLevel);

  const questionResults = await Promise.all(
    detectionData.summary.questionGroups.map(group =>
      limit(async (): Promise<QuestionResult> => {
        const result: QuestionResult = {
          questionLabel: group.questionLabel,
          pageIndices: group.pages,
          annotatedSliceUrl: null,
          marks: { awarded: 0, max: 0, marginNote: '' },
          summary: { title: '', bodyMarkdown: '' },
          markingJson: null,
          submissionId: null,
        };

        try {
          // ── Crop slices for each page this question appears on ──────────
          const slices: Array<{ buffer: Buffer; width: number; height: number }> = [];
          for (const pageIdx of group.pages) {
            const pageData = pageMap.get(pageIdx);
            if (!pageData) continue;
            const pageDef = detectionData.pages.find(p => p.pageIndex === pageIdx);
            if (!pageDef) continue;
            const question = pageDef.questions.find(q => q.questionLabel === group.questionLabel);
            if (!question) continue;
            const slice = await cropRegion(
              pageData.buffer,
              question.questionRegionPixels,
              pageData.width,
              pageData.height
            );
            slices.push(slice);
          }

          if (slices.length === 0) {
            result.error = 'No slices found for question';
            return result;
          }

          // ── Vertically concat if multi-page ──────────────────────────
          const combined = await verticalConcat(slices);
          const base64 = combined.buffer.toString('base64');
          const mediaType = 'image/png';

          // ── Claude marking ────────────────────────────────────────────
          console.time(`sonnet-mark-${group.questionLabel}`);
          let markingJson: MarkingOutput;
          try {
            markingJson = await callSonnetMarking(base64, mediaType, systemPrompt);
          } finally {
            console.timeEnd(`sonnet-mark-${group.questionLabel}`);
          }
          result.markingJson = markingJson;
          result.marks = {
            awarded: markingJson.marks?.awarded ?? 0,
            max: markingJson.marks?.max ?? 0,
            marginNote: markingJson.marks?.margin_note ?? '',
          };
          result.summary = {
            title: markingJson.summary?.title ?? '',
            bodyMarkdown: markingJson.summary?.body_markdown ?? '',
          };

          // ── Gemini annotation placement ───────────────────────────────
          let annotatedBuffer: Buffer | null = null;
          try {
            console.time(`gemini-annotate-${group.questionLabel}`);
            const annotations = await callGeminiBboxAnnotations(
              base64, mediaType, markingJson, combined.width, combined.height
            );
            console.timeEnd(`gemini-annotate-${group.questionLabel}`);
            annotatedBuffer = await createAnnotatedImage(base64, mediaType, annotations);
          } catch (annotErr) {
            console.warn(`[execute] Annotation failed for ${group.questionLabel}:`, annotErr);
            // Fall back to unannotated slice
            annotatedBuffer = combined.buffer;
          }

          // ── Upload annotated image to Blob ────────────────────────────
          if (annotatedBuffer) {
            const safeLabel = group.questionLabel.replace(/[^a-zA-Z0-9-]/g, '_');
            const ext = annotatedBuffer === combined.buffer ? 'png' : 'jpg';
            const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
            const blob = await put(
              `batches/${batchId}/annotated-${safeLabel}.${ext}`,
              annotatedBuffer,
              { access: 'public', contentType }
            );
            result.annotatedSliceUrl = blob.url;
          }

          // ── Create Airtable Submission record (non-fatal) ─────────────
          try {
            const submissionFields: Record<string, unknown> = {
              'Batches': [batchRecordId],  // linked record: array of string IDs
              'Question Number': group.questionLabel,
              'Page Indices': JSON.stringify(group.pages),
              'Annotated Slice URLs': JSON.stringify(
                result.annotatedSliceUrl ? [result.annotatedSliceUrl] : []
              ),
              'Source': 'batch_web',
              'Bot Marking JSON': result.markingJson ? JSON.stringify(result.markingJson) : undefined,
              'Bot Mark Awarded': result.marks.awarded || undefined,
              'Bot Mark Max': result.marks.max || undefined,
              'Bot Feedback': result.summary.bodyMarkdown || undefined,
            };
            // Remove undefined values (Airtable rejects explicit undefineds)
            for (const k of Object.keys(submissionFields)) {
              if (submissionFields[k] === undefined) delete submissionFields[k];
            }
            const submissionRes = await airtableRequest('Submissions', '', {
              method: 'POST',
              body: JSON.stringify({ records: [{ fields: submissionFields }] }),
            });
            result.submissionId = submissionRes?.records?.[0]?.id ?? null;
          } catch (airtableErr) {
            console.error(`[execute] Airtable Submission write failed for ${group.questionLabel}:`, airtableErr);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[execute] Failed to mark ${group.questionLabel}:`, err);
          result.error = msg;
        }

        return result;
      })
    )
  );

  // ── Update Batch status to 'marked' (non-fatal) ───────────────────────────

  try {
    await airtableRequest('Batches', `/${batchRecordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Status: 'marked' } }),
    });
  } catch (err) {
    console.error('[execute] Batch status update failed:', err);
  }

  // ── Response ──────────────────────────────────────────────────────────────

  return NextResponse.json({
    batchId,
    studentName: detectionData.studentName,
    results: questionResults.map(r => ({
      questionLabel: r.questionLabel,
      pageIndices: r.pageIndices,
      annotatedSliceUrl: r.annotatedSliceUrl,
      marks: r.marks,
      summary: r.summary,
      submissionId: r.submissionId,
      error: r.error,
    })),
  });
}
