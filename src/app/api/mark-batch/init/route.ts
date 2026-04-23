import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { airtableRequestAll } from '@/lib/airtable';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_BYTES = 50 * 1024 * 1024;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const students = data.records.map((r: any) => ({
      id: r.id,
      name: (r.fields['Student Name'] as string) || '',
    }));
    return NextResponse.json({ students });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST — enqueue batch (slim: insert Supabase + fire Fly) ──────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') || '';
  let studentName: string | null = null;
  let studentId: string | null = null;
  let pdfBlobUrl: string | null = null;
  let pdfBlobIsPrivate = false;
  let imageUrls: string[] | null = null;

  if (contentType.includes('application/json')) {
    // ── Blob URL path (large PDFs uploaded client-side as private blobs) ─────
    let body: { pdfBlobUrl?: string; studentName?: string; studentId?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    studentName = body.studentName?.trim() || null;
    studentId = body.studentId || null;
    if (!studentName) return NextResponse.json({ error: 'studentName is required' }, { status: 400 });
    if (!body.pdfBlobUrl) return NextResponse.json({ error: 'pdfBlobUrl is required' }, { status: 400 });
    pdfBlobUrl = body.pdfBlobUrl;
    pdfBlobIsPrivate = false; // public store — Fly fetches directly, no Bearer auth needed.
    console.log(`[init] public PDF blob received, queuing for Fly: ${pdfBlobUrl.slice(0, 80)}…`);

    const batchId = generateBatchId();
    return enqueueBatch({ batchId, studentName, studentId, pdfBlobUrl, pdfBlobIsPrivate, imageUrls: null });
  } else {
    // ── Multipart path (images or small PDFs) ────────────────────────────────
    let formData: FormData;
    try { formData = await req.formData(); } catch {
      return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
    }

    studentName = (formData.get('studentName') as string | null)?.trim() || null;
    if (!studentName) return NextResponse.json({ error: 'studentName is required' }, { status: 400 });
    studentId = (formData.get('studentId') as string | null) || null;

    const singleFile = formData.get('file') as File | null;
    const imageFiles = formData.getAll('images[]') as File[];

    if (!singleFile && imageFiles.length === 0) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const batchIdForUpload = generateBatchId();

    if (singleFile) {
      if (singleFile.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 400 });
      const buffer = Buffer.from(await singleFile.arrayBuffer());

      if (singleFile.type === 'application/pdf') {
        // Server-side put() with access:'public' works on private stores — no signing needed
        const blob = await put(`batches/${batchIdForUpload}/source.pdf`, buffer, { access: 'public', contentType: 'application/pdf' });
        pdfBlobUrl = blob.url;
      } else if (ALLOWED_IMAGE_TYPES.includes(singleFile.type)) {
        const blob = await put(`batches/${batchIdForUpload}/source-0.png`, buffer, { access: 'public', contentType: singleFile.type });
        imageUrls = [blob.url];
      } else {
        return NextResponse.json({ error: `Unsupported file type: ${singleFile.type}` }, { status: 400 });
      }
    } else {
      let totalSize = 0;
      for (const f of imageFiles) {
        if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
          return NextResponse.json({ error: `Unsupported file type: ${f.type}` }, { status: 400 });
        }
        totalSize += f.size;
      }
      if (totalSize > MAX_BYTES) return NextResponse.json({ error: 'Total upload size exceeds 50 MB limit' }, { status: 400 });

      imageUrls = await Promise.all(
        imageFiles.map(async (f, i) => {
          const buf = Buffer.from(await f.arrayBuffer());
          const blob = await put(`batches/${batchIdForUpload}/source-${i}.${f.type.split('/')[1]}`, buf, { access: 'public', contentType: f.type });
          return blob.url;
        })
      );
    }

    return enqueueBatch({ batchId: batchIdForUpload, studentName, studentId, pdfBlobUrl, pdfBlobIsPrivate: false, imageUrls });
  }
}

// ── Shared enqueue logic ──────────────────────────────────────────────────────

async function enqueueBatch({
  batchId, studentName, studentId, pdfBlobUrl, pdfBlobIsPrivate, imageUrls,
}: {
  batchId: string;
  studentName: string;
  studentId: string | null;
  pdfBlobUrl: string | null;
  pdfBlobIsPrivate: boolean;
  imageUrls: string[] | null;
}): Promise<NextResponse> {
  // Insert into Supabase with status='queued'
  const supabase = getSupabase();
  const { error: sbErr } = await supabase.from('marking_batches').insert({
    id: batchId,
    student_name: studentName,
    student_id: studentId || null,
    status: 'queued',
    pdf_blob_url: pdfBlobUrl || null,
    created_at: new Date().toISOString(),
  });
  if (sbErr) {
    console.error('[init] Supabase insert failed:', sbErr);
    return NextResponse.json({ error: 'Failed to create batch record' }, { status: 500 });
  }

  // Fire Fly worker (await 202 to confirm accepted; processing is async on Fly side)
  const flyUrl = process.env.FLY_WORKER_URL || 'https://adrianmath-telegram-math-bot.fly.dev';
  const flySecret = process.env.FLY_WORKER_SECRET || '';
  let flyRes: Response;
  try {
    flyRes = await fetch(`${flyUrl}/internal/process-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': flySecret },
      body: JSON.stringify({ batchId, studentName, studentId, pdfBlobUrl, pdfBlobIsPrivate, imageUrls }),
    });
  } catch (err) {
    console.error('[init] Failed to reach Fly worker:', err);
    await supabase.from('marking_batches').update({ status: 'failed', error_message: 'Fly worker unreachable' }).eq('id', batchId);
    return NextResponse.json({ error: 'Processing worker unavailable' }, { status: 503 });
  }

  if (!flyRes.ok) {
    const errText = await flyRes.text().catch(() => '');
    console.error(`[init] Fly worker rejected: ${flyRes.status} ${errText}`);
    await supabase.from('marking_batches').update({ status: 'failed', error_message: `Worker error: ${flyRes.status}` }).eq('id', batchId);
    return NextResponse.json({ error: 'Processing worker rejected the request' }, { status: 502 });
  }

  return NextResponse.json({ batchId });
}
