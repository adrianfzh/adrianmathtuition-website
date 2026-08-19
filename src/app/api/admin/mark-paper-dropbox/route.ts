import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isOurBlobUrl } from '@/lib/blob-url';
import { dropboxConfigured, uploadFile } from '@/lib/dropbox';
import { dropboxPaperPath } from '@/lib/dropbox-paper-path';

// File a marked PDF into Dropbox (6 Aug 2026). Adrian's ask: after a queued paper
// finishes, he wants the images PDF already sitting in a folder on the iPad — the
// Files app, not a browser download from a page he has to open first. The bot's
// queue worker calls this the moment the PDF is built; the site's 📁 button calls
// the same route for papers marked interactively.
//
// Landing spot + filename: lib/dropbox-paper-path.ts (shared with the auto-save so
// both compute the same path). Dropbox creates missing parents on upload — no mkdir.
//
// Uploads stay mode:add + autorename, and NOTHING here dedupes by path: Adrian really
// does mark three papers under one name on one day (12 Aug 2026), so "already a file
// with this name" is not the same question as "already filed this paper". The page
// answers the real question, keyed on the run — see autoFileToDropbox.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dropboxConfigured()) return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });

  let body: { url?: string; name?: string; folder?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const url = body.url || '';
  // Same guard as the download/send routes: an unchecked URL here would make an
  // authenticated open proxy that writes whatever it fetches into Adrian's Dropbox.
  if (!isOurBlobUrl(url)) return NextResponse.json({ error: 'Bad URL' }, { status: 400 });

  const path = dropboxPaperPath(body.name, body.folder, Date.now());

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    // /files/upload is the single-shot endpoint — 150MB ceiling, far above any
    // marked paper (a 10-page images PDF is ~5MB).
    if (buf.length > 140 * 1024 * 1024) return NextResponse.json({ error: 'too large for a single upload' }, { status: 413 });
    const saved = await uploadFile(path, buf, 'application/pdf');
    return NextResponse.json({ ok: true, path: saved.path, name: saved.name });
  } catch (e) {
    const msg = (e as Error).message || 'upload failed';
    console.error('[mark-paper-dropbox]', msg);
    // missing_scope is the one failure Adrian can actually fix, so name it.
    const scope = /missing_scope|files\.content\.write/.test(msg);
    return NextResponse.json({
      error: scope ? 'Dropbox app is missing the files.content.write scope — re-authorise it.' : msg,
    }, { status: 502 });
  }
}
