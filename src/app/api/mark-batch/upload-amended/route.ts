import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_BYTES = 50 * 1024 * 1024;

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 }); }

  const batchId = (formData.get('batchId') as string | null)?.trim();
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 400 });
  }

  // ── Upload to Blob ────────────────────────────────────────────────────────

  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await put(
    `batches/${batchId}/amended.pdf`,
    buffer,
    { access: 'public', contentType: 'application/pdf' }
  );

  // ── Update Airtable Batch ─────────────────────────────────────────────────

  try {
    const formula = encodeURIComponent(`{Batch ID}="${batchId}"`);
    const data = await airtableRequestAll('Batches', `?filterByFormula=${formula}&maxRecords=1`);
    if (data.records?.length) {
      const recordId = data.records[0].id;
      await airtableRequest('Batches', `/${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            'Final PDF URL': blob.url,
            'Amended At': new Date().toISOString(),
          },
        }),
      });
    }
  } catch (err) {
    console.error('[upload-amended] Airtable update failed:', err);
  }

  return NextResponse.json({ amendedPdfUrl: blob.url });
}
