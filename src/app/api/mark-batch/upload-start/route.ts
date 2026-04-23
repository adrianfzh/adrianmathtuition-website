import { NextRequest, NextResponse } from 'next/server';
import { createMultipartUpload } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let filename: string;
  try {
    const body = await req.json();
    filename = (body.filename as string)?.trim() || '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

  const pathname = `uploads/${Date.now()}-${filename}`;
  try {
    const { key, uploadId } = await createMultipartUpload(pathname, {
      access: 'private',
      contentType: 'application/pdf',
    });
    return NextResponse.json({ uploadId, key, pathname });
  } catch (err) {
    console.error('[upload-start] createMultipartUpload failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
