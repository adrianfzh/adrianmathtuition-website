import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isOurFileUrl, fetchOurFile } from '@/lib/student-files';
import { dropboxConfigured, uploadFile } from '@/lib/dropbox';

// File ANY of our Blob files into the Dropbox app folder at an explicit path
// (30 Aug 2026). Sibling of mark-paper-dropbox, which owns the marked-paper
// path convention; this one takes the path from the caller, for files whose
// naming isn't a marked paper's — self-study sheets in
// /Self-Study/<Student>/, generated worksheets, and whatever the teaching
// round needs next (SPEC-TEACHING-CYCLE).
//
// Why a route rather than uploading from the Mac directly: the LOCAL
// .env.local Dropbox refresh token predates the `files.content.write` scope
// and 401s with missing_scope — the same trap that bit the Vercel token on
// 2026-08-06 (docs/MARKING.md). The server's token carries the scope, so a
// local session uploads to Blob and calls this. scripts/dropbox-put.mjs does
// exactly that.
//
// Guards, in order of what they prevent:
//   • admin auth — obvious;
//   • isOurFileUrl — without it this is an authenticated open proxy that writes
//     whatever it can fetch into Adrian's Dropbox (same reasoning as the
//     download/send/dropbox routes);
//   • path sanitising — no `..`, no absolute escapes; the path is always
//     relative to the app folder root, which Dropbox scopes for us anyway.
// Default mode is add+autorename so a same-named file is never silently
// replaced; overwrite is opt-in (re-filing an edited sheet over its own copy).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 45 * 1024 * 1024;   // Dropbox simple-upload ceiling is 150MB; ours is smaller by intent

function cleanPath(raw: string): string | null {
  const p = String(raw || '').trim().replace(/\\/g, '/');
  if (!p) return null;
  const withSlash = p.startsWith('/') ? p : `/${p}`;
  if (withSlash.includes('..')) return null;
  // Dropbox rejects these outright; catching them here gives a better error.
  if (/[:?*<>"|]/.test(withSlash.replace(/^\//, ''))) return null;
  if (withSlash.length > 700) return null;
  const name = withSlash.split('/').pop() || '';
  if (!name || name.startsWith('.')) return null;
  return withSlash;
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dropboxConfigured()) return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });

  let body: { url?: string; path?: string; overwrite?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!isOurFileUrl(body.url || '')) return NextResponse.json({ error: 'Bad URL' }, { status: 400 });
  const path = cleanPath(body.path || '');
  if (!path) return NextResponse.json({ error: 'Bad path' }, { status: 400 });

  const res = await fetchOurFile(body.url as string);
  if (!res.ok) return NextResponse.json({ error: `Could not fetch the file (HTTP ${res.status})` }, { status: 502 });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: `File is ${(buf.length / 1024 / 1024).toFixed(1)}MB — over the ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 });

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  try {
    const out = await uploadFile(path, buf, contentType, body.overwrite === true ? 'overwrite' : 'add');
    return NextResponse.json({ ok: true, path: out.path, name: out.name, bytes: buf.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
