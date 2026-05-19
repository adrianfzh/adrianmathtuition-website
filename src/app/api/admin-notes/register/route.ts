// POST /api/admin-notes/register
// Called by the browser after a successful direct Blob upload.
// Creates the Airtable PrintNotes record with the blob URL.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

// level in the body is always a specific Airtable value (e.g. 'S3 AM')
const VALID_LEVELS = new Set(['S1','S2','EM','AM','JC']);

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { blobUrl, blobPathname, title, level } = await req.json();

  if (!blobUrl || !title?.trim() || !level || !VALID_LEVELS.has(level)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const record = await airtableRequest('PrintNotes', '', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        Title:          title.trim(),
        Level:          level,
        'PDF URL':      blobUrl,
        'Blob Pathname': blobPathname,
        'Uploaded At':  new Date().toISOString(),
      },
    }),
  });

  return NextResponse.json({ success: true, noteId: record.id });
}
