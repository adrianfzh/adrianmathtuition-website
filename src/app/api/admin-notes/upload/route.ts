import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1',
  's2': 'S2',
  's3-em': 'S3 EM',
  's3-am': 'S3 AM',
  's4-em': 'S4 EM',
  's4-am': 'S4 AM',
  'jc1': 'JC1',
  'jc2': 'JC2',
};

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string | null)?.trim();
  const level = formData.get('level') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  // Accept pdf by MIME type OR by filename extension (some browsers/OS send blank type)
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return NextResponse.json({ error: `File must be a PDF (got type: "${file.type || 'unknown'}")` }, { status: 400 });
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB — max 50 MB)` }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!level || !SLUG_TO_LABEL[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const levelLabel = SLUG_TO_LABEL[level];
  const uuid = crypto.randomUUID();

  let blob: Awaited<ReturnType<typeof put>>;
  try {
    blob = await put(`notes/${level}/${uuid}.pdf`, file, {
      access: 'public',
      contentType: 'application/pdf',
    });
  } catch (err: any) {
    console.error('[admin-notes/upload] Blob error:', err);
    return NextResponse.json({ error: `Blob upload failed: ${err.message ?? err}` }, { status: 500 });
  }

  let record: any;
  try {
    record = await airtableRequest('PrintNotes', '', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: title,
          Level: levelLabel,
          'PDF URL': blob.url,
          'Blob Pathname': blob.pathname,
          'Uploaded At': new Date().toISOString(),
        },
      }),
    });
  } catch (err: any) {
    console.error('[admin-notes/upload] Airtable error:', err);
    return NextResponse.json({ error: `Airtable error: ${err.message ?? err}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    noteId: record.id,
    url: blob.url,
  });
}
