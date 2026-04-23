import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// No longer calls createMultipartUpload — we use put() per chunk (temp blobs) to avoid the
// 5 MB SDK minimum-part-size constraint vs Vercel's 4.5 MB body limit crossed constraint.
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

  const uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pathname = `uploads/${Date.now()}-${filename}`;
  return NextResponse.json({ uploadId, pathname });
}
