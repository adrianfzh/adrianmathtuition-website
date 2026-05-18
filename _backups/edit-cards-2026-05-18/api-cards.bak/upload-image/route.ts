import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

// POST /api/admin/cards/upload-image
// Uploads a base64-encoded image to Vercel Blob and returns the public URL.
// The URL can then be embedded in card content as <img src="url" /> or ![](url).
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { imageData, imageMediaType } = await req.json();

  if (!imageData || typeof imageData !== 'string') {
    return NextResponse.json({ error: 'imageData required' }, { status: 400 });
  }

  const ext = (imageMediaType ?? 'image/jpeg').split('/')[1] ?? 'jpg';
  const filename = `card-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(imageData, 'base64');

  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: imageMediaType ?? 'image/jpeg',
  });

  return NextResponse.json({ url: blob.url });
}
