// GET /api/admin/mark-paper-annotated-token?runId=<uuid>&filename=x.pdf
// Short-lived client token so the browser PUTs Adrian's hand-annotated PDF (the
// Notability round trip) straight to Vercel Blob — a Notability export of a 10-page
// paper runs 5–20MB, past the Next.js function body cap, so it must not transit the
// server. After the upload the page links it to the run via phase 'link-pdf' /
// kind 'annotated' (bot store, annotated_pdf_url).
import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runId = req.nextUrl.searchParams.get('runId') || '';
  // paper_marking_runs ids are uuids; the pathname embeds it so the file is traceable
  // back to its run even if the DB link write fails.
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'bad runId' }, { status: 400 });

  const pathname = `mark-paper/annotated-final/${runId}-${crypto.randomUUID()}.pdf`;
  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    pathname,
    onUploadCompleted: { callbackUrl: '' },   // the page links the run itself after upload
    allowedContentTypes: ['application/pdf', 'application/octet-stream'],
    maximumSizeInBytes: 100 * 1024 * 1024,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
  return NextResponse.json({ token, pathname });
}
