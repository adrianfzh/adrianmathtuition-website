import { NextRequest, NextResponse } from 'next/server';
import { uploadPart } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uploadId = searchParams.get('uploadId');
  const key = searchParams.get('key');
  const pathname = searchParams.get('pathname');
  const partNumber = parseInt(searchParams.get('partNumber') || '0', 10);

  if (!uploadId || !key || !pathname || !partNumber) {
    return NextResponse.json({ error: 'uploadId, key, pathname, partNumber required' }, { status: 400 });
  }

  let body: Buffer;
  try {
    body = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Failed to read chunk body' }, { status: 400 });
  }
  if (body.length === 0) return NextResponse.json({ error: 'Empty chunk' }, { status: 400 });

  try {
    const part = await uploadPart(pathname, body, {
      access: 'private',
      uploadId,
      key,
      partNumber,
    });
    return NextResponse.json({ etag: part.etag, partNumber: part.partNumber });
  } catch (err) {
    console.error(`[upload-chunk] part ${partNumber} failed:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
