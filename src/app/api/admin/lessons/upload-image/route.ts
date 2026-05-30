// POST /api/admin/lessons/upload-image
// Accepts a base64 PNG data URL (e.g. a Desmos graph screenshot) and stores it in Vercel Blob,
// returning a public URL to embed in a card via <img>.
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { dataUrl?: string } | null;
  const dataUrl = body?.dataUrl;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'dataUrl (image) required' }, { status: 400 });
  }
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, comma); // e.g. "image/png;base64"
  const contentType = meta.split(';')[0] || 'image/png';
  const ext = contentType.split('/')[1] || 'png';
  const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  if (buffer.length > 8 * 1024 * 1024) return NextResponse.json({ error: 'image too large' }, { status: 413 });
  try {
    const blob = await put(`lesson-graphs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, buffer, {
      access: 'public',
      contentType,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 500 });
  }
}
