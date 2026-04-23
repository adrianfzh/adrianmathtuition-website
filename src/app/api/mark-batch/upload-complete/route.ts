import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { pathname: string; parts: Array<{ tempUrl: string; partNumber: number }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { pathname, parts } = body;
  if (!pathname || !Array.isArray(parts) || parts.length === 0) {
    return NextResponse.json({ error: 'pathname and parts required' }, { status: 400 });
  }

  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  // Fetch all temp chunk blobs in parallel (private store — requires Bearer auth)
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || '';
  let buffers: Buffer[];
  try {
    buffers = await Promise.all(
      sorted.map(async ({ tempUrl, partNumber }) => {
        const r = await fetch(tempUrl, {
          headers: { Authorization: `Bearer ${blobToken}` },
        });
        if (!r.ok) throw new Error(`Failed to fetch chunk ${partNumber}: ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      })
    );
  } catch (err) {
    console.error('[upload-complete] chunk fetch failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  const fullBuffer = Buffer.concat(buffers);
  console.log(`[upload-complete] assembled ${sorted.length} chunks → ${fullBuffer.length} bytes`);

  // Upload final PDF blob
  let finalUrl: string;
  try {
    const blob = await put(pathname, fullBuffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/pdf',
    });
    finalUrl = blob.url;
  } catch (err) {
    console.error('[upload-complete] final put failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // Clean up temp chunks (non-fatal)
  del(sorted.map(p => p.tempUrl)).catch(err =>
    console.error('[upload-complete] temp blob cleanup failed (non-fatal):', err)
  );

  return NextResponse.json({ url: finalUrl });
}
