import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

interface AirtableRecord {
  id: string;
  fields: Record<string, string>;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const record: AirtableRecord = await airtableRequest('PrintNotes', `/${id}`);

  return NextResponse.json({
    id: record.id,
    title: record.fields['Title'] ?? '',
    pdfUrl: record.fields['PDF URL'] ?? '',
    uploadedAt: record.fields['Uploaded At'] ?? '',
    level: record.fields['Level'] ?? '',
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { title, blobUrl, blobPathname } = await req.json().catch(() => ({}));

  const fields: Record<string, string> = {};
  if (typeof title === 'string' && title.trim()) fields['Title'] = title.trim();

  // Replace-the-PDF: swap PDF URL + Blob Pathname in place, then clean up the old blob.
  let oldPathname: string | undefined;
  if (blobUrl && blobPathname) {
    try {
      const rec: AirtableRecord = await airtableRequest('PrintNotes', `/${id}`);
      oldPathname = rec.fields['Blob Pathname'];
    } catch { /* best-effort cleanup only */ }
    fields['PDF URL'] = blobUrl;
    fields['Blob Pathname'] = blobPathname;
    fields['Uploaded At'] = new Date().toISOString();
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await airtableRequest('PrintNotes', `/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });

  if (oldPathname && oldPathname !== blobPathname) {
    try { await del(oldPathname); } catch (e) { console.warn('[admin-notes] old blob delete failed:', e); }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Fetch record to get blob pathname
  const record: AirtableRecord = await airtableRequest('PrintNotes', `/${id}`);
  const pathname = record.fields['Blob Pathname'];

  // Delete from Vercel Blob (non-fatal if missing)
  if (pathname) {
    try {
      await del(pathname);
    } catch (e) {
      console.warn('[admin-notes] Blob delete failed:', e);
    }
  }

  // Delete from Airtable
  await airtableRequest('PrintNotes', `/${id}`, { method: 'DELETE' });

  return NextResponse.json({ success: true });
}
