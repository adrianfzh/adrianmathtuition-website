// POST /api/admin-notes/register
// Called by the browser after a successful direct Blob upload.
// Creates the Airtable PrintNotes record with the blob URL.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2',
  's3-em': 'S3 EM', 's3-am': 'S3 AM',
  's4-em': 'S4 EM', 's4-am': 'S4 AM',
  'jc1': 'JC1', 'jc2': 'JC2',
};

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { blobUrl, blobPathname, title, level } = await req.json();

  if (!blobUrl || !title?.trim() || !level || !SLUG_TO_LABEL[level]) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const record = await airtableRequest('PrintNotes', '', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        Title:          title.trim(),
        Level:          SLUG_TO_LABEL[level],
        'PDF URL':      blobUrl,
        'Blob Pathname': blobPathname,
        'Uploaded At':  new Date().toISOString(),
      },
    }),
  });

  return NextResponse.json({ success: true, noteId: record.id });
}
