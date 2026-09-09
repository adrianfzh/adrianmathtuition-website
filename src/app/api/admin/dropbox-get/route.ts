import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { dropboxConfigured, downloadFile, getMetadata } from '@/lib/dropbox';

// Read ONE file out of the Dropbox app folder by explicit path (9 Sep 2026) —
// the read-side twin of dropbox-put, for the sheet worker's "reuse before you
// write" step (self-study-sheet SKILL.md): an earlier Practice Again sheet on
// the same paper, as Adrian last left it in Word.
//
//   GET ?path=/Students/<Student>/<date> <paper>/3 Practice Again.docx          → the bytes
//   GET ?path=…&meta=1                                                           → { name, path, size, client_modified, server_modified, rev }
//
// Why a route rather than reading from the Mac directly: the LOCAL .env.local
// Dropbox token is the old narrow one (see dropbox-put); the server's token is
// the one that works, and a worker on any Mac then needs only the admin bearer.
// client_modified is what says whether Adrian edited the file after the worker
// filed it — Word stamps it on save.
//
// Guards: admin auth; the same path sanitising as dropbox-put (no `..`, no
// absolute escapes — every path is relative to the app folder root, which
// Dropbox scopes for us anyway); 45MB ceiling like the put side.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 45 * 1024 * 1024;

function cleanPath(raw: string): string | null {
  const p = String(raw || '').trim().replace(/\\/g, '/');
  if (!p) return null;
  const withSlash = p.startsWith('/') ? p : `/${p}`;
  if (withSlash.includes('..')) return null;
  if (/[:?*<>"|]/.test(withSlash.replace(/^\//, ''))) return null;
  if (withSlash.length > 700) return null;
  const name = withSlash.split('/').pop() || '';
  if (!name || name.startsWith('.')) return null;
  return withSlash;
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dropboxConfigured()) return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });
  const path = cleanPath(req.nextUrl.searchParams.get('path') || '');
  if (!path) return NextResponse.json({ error: 'Bad path' }, { status: 400 });
  const metaOnly = req.nextUrl.searchParams.get('meta') === '1';

  try {
    const meta = await getMetadata(path);
    if (metaOnly) return NextResponse.json({ ok: true, ...meta });
    if (meta.size > MAX_BYTES) return NextResponse.json({ error: `File is ${(meta.size / 1024 / 1024).toFixed(1)}MB — over the ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 });
    const buf = await downloadFile(path);
    const ext = (meta.name.split('.').pop() || '').toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
        'X-Client-Modified': meta.client_modified,
        'X-Server-Modified': meta.server_modified,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = (e as Error).message || 'Dropbox error';
    return NextResponse.json({ error: msg }, { status: /not_found/.test(msg) ? 404 : 502 });
  }
}
