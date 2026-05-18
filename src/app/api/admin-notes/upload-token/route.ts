// GET /api/admin-notes/upload-token?level=s3-am&filename=notes.pdf
// Returns a short-lived client upload token so the browser can PUT directly
// to Vercel Blob — bypasses the Next.js function body size limit entirely.
import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

const SLUG_TO_LABEL: Record<string, string> = {
  's1': 'S1', 's2': 'S2',
  's3-em': 'S3 EM', 's3-am': 'S3 AM',
  's4-em': 'S4 EM', 's4-am': 'S4 AM',
  'jc1': 'JC1', 'jc2': 'JC2',
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level    = searchParams.get('level') ?? '';
  const filename = searchParams.get('filename') ?? 'upload.pdf';

  if (!SLUG_TO_LABEL[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const uuid     = crypto.randomUUID();
  const pathname = `notes/${level}/${uuid}.pdf`;

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
