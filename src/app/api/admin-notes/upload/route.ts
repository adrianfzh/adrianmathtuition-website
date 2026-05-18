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
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!level || !SLUG_TO_LABEL[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const levelLabel = SLUG_TO_LABEL[level];
  const uuid = crypto.randomUUID();

  // Upload to Vercel Blob
  const blob = await put(`notes/${level}/${uuid}.pdf`, file, {
    access: 'public',
    contentType: 'application/pdf',
  });

  // Create Airtable record in PrintNotes table
  const record = await airtableRequest('PrintNotes', '', {
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

  return NextResponse.json({
    success: true,
    noteId: record.id,
    url: blob.url,
  });
}
