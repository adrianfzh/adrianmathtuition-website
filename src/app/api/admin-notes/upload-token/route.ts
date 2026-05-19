// GET /api/admin-notes/upload-token?level=s3-am&filename=notes.pdf
// Returns a short-lived client upload token so the browser can PUT directly
// to Vercel Blob — bypasses the Next.js function body size limit entirely.
import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

const VALID_LEVELS = new Set(['S1','S2','EM','AM','JC']);

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level    = searchParams.get('level') ?? '';
  const filename = searchParams.get('filename') ?? 'upload.pdf';

  // level here is the specific Airtable value (e.g. 'S3 AM'), not the merged slug
  if (!VALID_LEVELS.has(level)) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const slug     = level.toLowerCase().replace(/\s+/g, '-');
  const uuid     = crypto.randomUUID();
  const pathname = `notes/${slug}/${uuid}.pdf`;

  const token = await generateClientTokenFromReadWriteToken({
    token:           process.env.BLOB_READ_WRITE_TOKEN!,
    pathname,
    onUploadCompleted: {
      callbackUrl:  '', // we handle Airtable creation client-side after upload
    },
    allowedContentTypes: ['application/pdf', 'application/octet-stream'],
    maximumSizeInBytes:  100 * 1024 * 1024, // 100 MB
    validUntil:          Date.now() + 10 * 60 * 1000, // 10 min
  });

  return NextResponse.json({ token, pathname });
}
