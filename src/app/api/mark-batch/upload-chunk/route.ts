import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// Stores each chunk as a temp blob. upload-complete fetches, concatenates, and re-uploads the
// final PDF. This sidesteps the 5MB SDK minimum-part-size vs 4.5MB Vercel body limit conflict.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uploadId = searchParams.get('uploadId');
  const partNumber = parseInt(searchParams.get('partNumber') || '0', 10);

  if (!uploadId || !partNumber) {
    return NextResponse.json({ error: 'uploadId and partNumber required' }, { status: 400 });
  }

  let body: Buffer;
  try {
    body = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Failed to read chunk body' }, { status: 400 });
  }
  if (body.length === 0) return NextResponse.json({ error: 'Empty chunk' }, { status: 400 });

  try {
    const blob = await put(`temp/${uploadId}/part-${partNumber}.bin`, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true, // safe on retry since key is deterministic
    });
    console.log(`[upload-chunk] stored part ${partNumber} (${body.length} bytes): ${blob.url.slice(0, 80)}`);
    return NextResponse.json({ tempUrl: blob.url, partNumber });
  } catch (err) {
    console.error(`[upload-chunk] put failed for part ${partNumber}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
