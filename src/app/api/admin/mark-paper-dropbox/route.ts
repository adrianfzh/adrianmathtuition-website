import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isOurFileUrl, fetchOurFile } from '@/lib/student-files';
import { dropboxConfigured, uploadFile } from '@/lib/dropbox';
import { markedAiPath, paperFolder, RETURNED_NAME, type PaperRun } from '@/lib/paper-folder';
import { getSupabaseAdmin } from '@/lib/supabase';

// File a marked PDF into Dropbox (6 Aug 2026). Adrian's ask: after a queued paper
// finishes, he wants the images PDF already sitting in a folder on the iPad — the
// Files app, not a browser download from a page he has to open first. The bot's
// queue worker calls this the moment the PDF is built; the site's 📁 button calls
// the same route for papers marked interactively.
//
// ONE FOLDER PER STUDENT PER PAPER (2 Sep 2026, lib/paper-folder.ts): the copy
// lands at /Students/<Student>/<YYYY-MM-DD> <paper>/Marked (AI).pdf, derived from
// the RUN ROW (student, paper name, created_at in SGT) — never from the caller's
// `name`, so the bot, the auto-save and the 📁 button cannot disagree about where
// a paper lives. The self-study sheet is filed into the same folder by the sheet
// worker, and Adrian saves his amended copy beside it as "Marked (Adrian).pdf".
// Dropbox creates missing parents on upload — no mkdir.
//
// Every save is mode:'overwrite' at that fixed path: a ⚡ rebuild, a rename, a
// 🔁 re-mark REPLACES the AI copy instead of minting "Marked (AI) (1).pdf". That
// is safe because the file it replaces is always the machine's copy — Adrian's
// own pen lives in a different file. Same-name same-day papers were the reason
// the old flat layout needed add+autorename; per-run folders make that moot
// only when the runs are tagged to different students, so a genuinely
// duplicated (student, paper, day) shares one folder by design — the second
// marking supersedes the first, which is what Adrian expects of a re-mark.
//
// Manual taps still confirm before replacing (20 Aug 2026): when the run has
// been filed before (`dropbox_path` recorded) and the body lacks
// `confirmOverwrite`, the route answers 409 {needsConfirm, existing} and the page
// asks. Automatic refiles (autoFileToDropbox, the bot worker) pass it up front.
// A save without a runId (or with an unknown one) files under
// /Students/_Untagged/<today> <name>/ from the caller's `name` — the legacy
// behaviour's only survivor. `/Marked Papers/` is the pre-2 Sep layout; runs
// filed there keep their old `dropbox_path` until they are saved again.
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
  if (!isOurFileUrl(url)) return NextResponse.json({ error: 'Bad URL' }, { status: 400 });

  // 5 Sep 2026 — student files no longer go to the personal Dropbox (they live in
  // the private student-files bucket; see lib/student-files.ts). The bot and the
  // mark-paper page still call this after every marking; answer calmly so neither
  // reports an error, and keep the old behaviour one env flag away.
  // 6 Sep 2026 — Adrian chose the Dropbox TRAY: he vets in Notability from the
  // Files app, so the marked copy is filed again (one folder per paper, four
  // fixed names), and /api/cron/dropbox-tray deletes the folder one month after
  // release. The private store stays the source. STUDENT_FILES_TO_DROPBOX=0
  // returns to the 5 Sep behaviour (private store only).
  if (process.env.STUDENT_FILES_TO_DROPBOX === '0') {
    return NextResponse.json({
      ok: false, skipped: true,
      error: 'Marked PDFs stay in the private store now (not filed to Dropbox) — open them from the desk or /admin/papers.',
    });
  }

  const runId = typeof body.runId === 'string' && /^[0-9a-f-]{36}$/i.test(body.runId) ? body.runId : null;
  let run: PaperRun | null = null;
  let recordedPath: string | null = null;
  let returnedInto: PaperRun | null = null;
  if (runId) {
    const { data } = await getSupabaseAdmin()
      .from('paper_marking_runs')
      .select('student_id, student_name, paper_name, created_at, dropbox_path, assignment_id:result_json->>assignment_id')
      .eq('id', runId).maybeSingle();
    if (data) {
      run = data;
      recordedPath = (data.dropbox_path as string | null) || null;
      // A RETURNED Practice Again (a hand-in answering a sheet assignment) files
      // under the PAPER the sheet came from, as "4 Practice Again — returned.pdf",
      // never in a folder of its own (Adrian, 6 Sep 2026).
      const assignmentId = (data as { assignment_id?: string | null }).assignment_id;
      if (assignmentId) {
        const { data: a } = await getSupabaseAdmin().from('portal_assignments').select('source_run_id').eq('id', assignmentId).maybeSingle();
        const parentId = (a as { source_run_id?: string | null } | null)?.source_run_id;
        if (parentId) {
          const { data: parent } = await getSupabaseAdmin().from('paper_marking_runs')
            .select('student_id, student_name, paper_name, created_at').eq('id', parentId).maybeSingle();
          if (parent) returnedInto = parent as PaperRun;
        }
      }
    }
  }
  if (recordedPath && !body.confirmOverwrite) {
    // Replacing an existing file needs the caller's say-so: manual 📁 taps ask
    // Adrian first (409 → confirm dialog → retry with confirmOverwrite), while
    // automatic refiles pass confirmOverwrite up front.
    return NextResponse.json(
      { needsConfirm: true, existing: recordedPath.split('/').pop() || 'saved earlier' },
      { status: 409 },
    );
  }

  const target: PaperRun = returnedInto ?? run ?? { student_id: null, student_name: null, paper_name: body.name, created_at: Date.now() };
  const folder = paperFolder(target);
  const path = returnedInto ? `${folder}/${RETURNED_NAME}` : markedAiPath(target);

  try {
    const r = await fetchOurFile(url, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    // /files/upload is the single-shot endpoint — 150MB ceiling, far above any
    // marked paper (a 10-page images PDF is ~5MB).
    if (buf.length > 140 * 1024 * 1024) return NextResponse.json({ error: 'too large for a single upload' }, { status: 413 });
    const saved = await uploadFile(path, buf, 'application/pdf', 'overwrite');
    if (runId && run) {
      // Remember where it landed so the library / 📂 links and the next save agree.
      // Never fails the save.
      try { await getSupabaseAdmin().from('paper_marking_runs').update({ dropbox_path: saved.path }).eq('id', runId); }
      catch (e) { console.warn('[mark-paper-dropbox] path remember failed', (e as Error).message); }
    }
    const display = (saved.display || path).replace(/^\//, '');
    return NextResponse.json({
      ok: true, path: saved.path, name: saved.name, folder, display,
      replaced: !!recordedPath,
    });
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
