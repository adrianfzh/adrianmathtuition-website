import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isOurBlobUrl } from '@/lib/blob-url';
import { dropboxConfigured, uploadFile } from '@/lib/dropbox';
import { dropboxPaperPath } from '@/lib/dropbox-paper-path';
import { getSupabaseAdmin } from '@/lib/supabase';

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
//
// ONE Dropbox file per run (19 Aug 2026): when the caller sends a runId, the exact
// path the first save landed on is remembered on the run (dropbox_path — Dropbox may
// have autorenamed, so the path we ASKED for proves nothing), and every later save
// for that run OVERWRITES that same file. That is what makes 📁 after ✏️ Annotate
// mean "replace the copy in the folder with my checked one" instead of piling up
// "name (1).pdf" next to it — and why same-name papers on the same day stay safe:
// they are different runs, so each keeps its own remembered path.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dropboxConfigured()) return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });

  let body: { url?: string; name?: string; folder?: string; runId?: string; confirmOverwrite?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const url = body.url || '';
  // Same guard as the download/send routes: an unchecked URL here would make an
  // authenticated open proxy that writes whatever it fetches into Adrian's Dropbox.
  if (!isOurBlobUrl(url)) return NextResponse.json({ error: 'Bad URL' }, { status: 400 });

  const runId = typeof body.runId === 'string' && /^[0-9a-f-]{36}$/i.test(body.runId) ? body.runId : null;
  let path = dropboxPaperPath(body.name, body.folder, Date.now());
  let mode: 'add' | 'overwrite' = 'add';
  if (runId) {
    const { data } = await getSupabaseAdmin()
      .from('paper_marking_runs').select('dropbox_path').eq('id', runId).maybeSingle();
    if (data?.dropbox_path) {
      // Replacing an existing file needs the caller's say-so: manual 📁 taps ask
      // Adrian first (409 → confirm dialog → retry with confirmOverwrite), while
      // automatic refiles pass confirmOverwrite up front — an accidental tap must
      // never silently replace a hand-annotated copy (Adrian, 20 Aug 2026).
      if (!body.confirmOverwrite) {
        return NextResponse.json(
          { needsConfirm: true, existing: data.dropbox_path.split('/').pop() || 'saved earlier' },
          { status: 409 },
        );
      }
      path = data.dropbox_path; mode = 'overwrite';
    }
  }

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    // /files/upload is the single-shot endpoint — 150MB ceiling, far above any
    // marked paper (a 10-page images PDF is ~5MB).
    if (buf.length > 140 * 1024 * 1024) return NextResponse.json({ error: 'too large for a single upload' }, { status: 413 });
    const saved = await uploadFile(path, buf, 'application/pdf', mode);
    if (runId) {
      // Remember where it ACTUALLY landed (autorename may have shifted it) so the
      // next save for this run replaces this file. Never fails the save.
      try { await getSupabaseAdmin().from('paper_marking_runs').update({ dropbox_path: saved.path }).eq('id', runId); }
      catch (e) { console.warn('[mark-paper-dropbox] path remember failed', (e as Error).message); }
    }
    return NextResponse.json({ ok: true, path: saved.path, name: saved.name, replaced: mode === 'overwrite' });
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
