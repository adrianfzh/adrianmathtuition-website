import { NextRequest, NextResponse } from 'next/server';
import { completeMultipartUpload } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { uploadId: string; key: string; pathname: string; parts: Array<{ etag: string; partNumber: number }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { uploadId, key, pathname, parts } = body;
  if (!uploadId || !key || !pathname || !Array.isArray(parts) || parts.length === 0) {
    return NextResponse.json({ error: 'uploadId, key, pathname, parts required' }, { status: 400 });
  }

  try {
    const result = await completeMultipartUpload(pathname, parts, {
      access: 'private',
      uploadId,
      key,
    });
    return NextResponse.json({ url: result.url });
  } catch (err) {
    console.error('[upload-complete] completeMultipartUpload failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
