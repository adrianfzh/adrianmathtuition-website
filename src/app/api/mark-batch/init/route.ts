import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import {
  pdfToPageImages,
  imageFileToPageImage,
  processPages,
} from '@/lib/batch-marking';
// Explicit imports so Next.js file-tracing bundles these into the serverless function.
// pdfjs-dist dynamically requires @napi-rs/canvas at runtime; without this hint the
// bundler omits it and the function fails on Vercel with "Cannot find module".
import '@napi-rs/canvas';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('pdfjs-dist/legacy/build/pdf.mjs');

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

function generateBatchId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `batch_${ts}_${rand}`;
}

// ── GET — student list for dropdown ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const data = await airtableRequestAll(
      'Students',
      `?fields[]=Student+Name&sort[0][field]=Student+Name&sort[0][direction]=asc`
    );
    const students = data.records.map((r: any) => ({
      id: r.id,
      name: (r.fields['Student Name'] as string) || '',
    }));
    return NextResponse.json({ students });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST — process batch ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const studentName = (formData.get('studentName') as string | null)?.trim();
  if (!studentName) {
    return NextResponse.json({ error: 'studentName is required' }, { status: 400 });
  }

  const studentId = (formData.get('studentId') as string | null) || null;
  const singleFile = formData.get('file') as File | null;
  const imageFiles = formData.getAll('images[]') as File[];

  if (!singleFile && imageFiles.length === 0) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  // ── Build page image list ──────────────────────────────────────────────────

  let pageImages;

  if (singleFile) {
    if (singleFile.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 400 });
    }
    const buffer = Buffer.from(await singleFile.arrayBuffer());

    if (singleFile.type === 'application/pdf') {
      pageImages = await pdfToPageImages(buffer);
    } else if (ALLOWED_IMAGE_TYPES.includes(singleFile.type)) {
      pageImages = [await imageFileToPageImage(buffer, 0)];
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${singleFile.type}. Use PDF, PNG, JPEG, or WebP.` },
        { status: 400 }
      );
    }
  } else {
    // Multiple images — validate all first
    let totalSize = 0;
    for (const f of imageFiles) {
      if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${f.type}. Use PNG, JPEG, or WebP.` },
          { status: 400 }
        );
      }
      totalSize += f.size;
    }
    if (totalSize > MAX_BYTES) {
      return NextResponse.json({ error: 'Total upload size exceeds 50 MB limit' }, { status: 400 });
    }
    pageImages = await Promise.all(
      imageFiles.map(async (f, i) => {
        const buf = Buffer.from(await f.arrayBuffer());
        return imageFileToPageImage(buf, i);
      })
    );
  }

  if (pageImages.length === 0) {
    return NextResponse.json({ error: 'No pages found in upload' }, { status: 400 });
  }

  // ── Process: parallel uploads + sequential detection ─────────────────────

  const batchId = generateBatchId();
  let processResult;
  try {
    processResult = await processPages(pageImages, batchId);
  } catch (err: any) {
    console.error('[mark-batch/init] processPages error:', err);
    return NextResponse.json(
      { error: `Processing failed: ${err.message}` },
      { status: 500 }
    );
  }

  const { pages: processedPages, questionGroups } = processResult;
  const totalRegions = processedPages.reduce((sum, p) => sum + p.questions.length, 0);
  const totalQuestions = questionGroups.length;

  const responsePayload = {
    batchId,
    studentName,
    studentId,
    pages: processedPages.map((p) => ({
      pageIndex: p.pageIndex,
      pageImageUrl: p.url,
      pageImageWidth: p.width,
      pageImageHeight: p.height,
      questions: p.questions,
    })),
    summary: {
      totalPages: processedPages.length,
      totalQuestions,
      totalRegions,
      questionGroups,
    },
  };

  // ── Write to Airtable Batches table (non-fatal) ──────────────────────────

  try {
    const batchRecord: Record<string, unknown> = {
      'Batch ID': batchId,
      'Student Name': studentName,
      'Total Pages': processedPages.length,
      'Total Questions': totalQuestions,
      'Status': 'detected',
      'Page Image URLs': processedPages.map((p) => p.url).join('\n'),
      'Detection JSON': JSON.stringify(responsePayload),
      'Created At': new Date().toISOString(),
    };
    if (studentId) {
      batchRecord['Student'] = [{ id: studentId }];
    }
    await airtableRequest('Batches', '', {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: batchRecord }] }),
    });
  } catch (err) {
    console.error('[mark-batch/init] Airtable write failed (non-fatal):', err);
  }

  return NextResponse.json(responsePayload);
}
