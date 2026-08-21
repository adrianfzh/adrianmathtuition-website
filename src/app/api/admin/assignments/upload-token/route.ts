// GET /api/admin/assignments/upload-token?filename=worksheet.pdf
// Short-lived client token so the Send-work card can PUT a worksheet PDF
// straight to Blob (platform 4.5MB body cap never applies). The URL that comes
// back is what gets stored as portal_assignments.pdf_url.
import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });
  const pathname = `assignments/${crypto.randomUUID()}.pdf`;
  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname,
    allowedContentTypes: ['application/pdf', 'application/octet-stream'],
    maximumSizeInBytes: 50 * 1024 * 1024,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
  return NextResponse.json({ token, pathname });
}
