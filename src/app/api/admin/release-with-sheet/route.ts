// /api/admin/release-with-sheet — step 7 of the teaching round, in one tap.
//
//   GET  ?runId=   → { ready, choice, candidates? }   what would happen, without doing it
//   POST { runId, pdfPath? } → { ok, released, assignmentId }
//
// Adrian releases the marked paper and sends the self-study sheet every time, in
// that order, and a paper released without its sheet is the half that teaches
// nothing. It was two screens; this is one call.
//
// The PDF is chosen by lib/release-with-sheet.ts, which prefers the path the
// worker recorded, then a re-export sharing the DOCX's name, then the only PDF in
// the folder — and otherwise ASKS. It does not require Adrian to keep one PDF per
// folder or to name his exports a particular way: the sheet filenames are not
// consistent between runs, and he re-exports by hand after editing, so any rule
// that leans on the name would break the first time Word offered a different one.
//
// GET is deliberately separate: the button can show what it is about to send, and
// the ambiguous case can be resolved before anything is released rather than after.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listFolder, dropboxConfigured } from '@/lib/dropbox';
import { choosePdf, sheetFolder, ambiguityMessage, type SheetFile } from '@/lib/release-with-sheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SheetResult = { docx_path?: string; pdf_path?: string | null };

/** The finished sheet for a run, plus its folder listing. */
async function resolve(runId: string) {
  const sb = getSupabaseAdmin();
  const { data: run } = await sb
    .from('paper_marking_runs')
    .select('id, student_id, student_name, paper_name, released_at, total_awarded, total_max')
    .eq('id', runId).maybeSingle();
  if (!run) return { error: 'run not found', status: 404 as const };
  if (!run.student_id) return { error: 'Tag this paper to a student first.', status: 400 as const };

  const { data: job } = await sb
    .from('sheet_jobs').select('result')
    .eq('run_id', runId).eq('status', 'done')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!job) return { error: 'No finished sheet for this paper yet.', status: 404 as const };

  const result = (job.result || {}) as SheetResult;
  const folderPath = sheetFolder(result.pdf_path, result.docx_path);
  if (!folderPath) return { error: 'The sheet job recorded no file path.', status: 404 as const };

  let files: SheetFile[] = [];
  if (dropboxConfigured()) {
    try {
      const entries = await listFolder(folderPath);
      files = (entries || []).map(e => ({
        path: (e as { path_display?: string; path_lower?: string }).path_display
          || (e as { path_lower?: string }).path_lower || '',
        name: (e as { name?: string }).name || '',
        modified: (e as { server_modified?: string }).server_modified ?? null,
      })).filter(x => x.path && x.name);
    } catch { /* an unreadable folder degrades to the recorded path alone */ }
  }

  return { run, result, folderPath, choice: choosePdf(result.pdf_path, result.docx_path, files) };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  const r = await resolve(runId);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  return NextResponse.json({
    ready: r.choice.kind === 'recorded' || r.choice.kind === 'only',
    kind: r.choice.kind,
    pdfPath: 'path' in r.choice ? r.choice.path : null,
    candidates: r.choice.kind === 'ambiguous' ? r.choice.candidates : [],
    note: ambiguityMessage(r.choice),
    alreadyReleased: !!r.run.released_at,
    studentName: r.run.student_name,
    paperName: r.run.paper_name,
  });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as { runId?: string; pdfPath?: string }));
  const runId = String(body.runId || '');
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  const r = await resolve(runId);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  // An explicit pick from the ambiguous case wins; otherwise it must have resolved
  // on its own. Never fall through to "the first one" — the whole point of the
  // ambiguous state is that guessing sends a student the wrong paper.
  const pdfPath = String(body.pdfPath || '') || ('path' in r.choice ? r.choice.path : '');
  if (!pdfPath) {
    return NextResponse.json({ error: ambiguityMessage(r.choice) || 'No PDF to send.', kind: r.choice.kind,
      candidates: r.choice.kind === 'ambiguous' ? r.choice.candidates : [] }, { status: 409 });
  }
  if (!pdfPath.startsWith(r.folderPath)) {
    // A path from outside the sheet's own folder is not something this button is
    // for, and accepting one would make it a "send any Dropbox file" endpoint.
    return NextResponse.json({ error: 'That PDF is not in the sheet’s folder.' }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const auth = req.headers.get('authorization');
  const cookie = req.headers.get('cookie');
  const fwd: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) fwd.Authorization = auth;
  if (cookie) fwd.cookie = cookie;

  // The SHEET goes first. If the assignment fails, nothing has been released and
  // Adrian can retry the whole thing; releasing first would leave a student with a
  // marked paper and no work, which is the state this button exists to prevent.
  const title = `Practice again — ${r.run.paper_name || 'your marked paper'}`;
  const aRes = await fetch(`${origin}/api/admin/assignments`, {
    method: 'POST', headers: fwd,
    body: JSON.stringify({
      studentId: r.run.student_id, kind: 'worksheet', title,
      pdfSource: `dropbox:${pdfPath}`,
      note: 'From the paper you just got back — the parts worth another go.',
    }),
  });
  const aData = await aRes.json().catch(() => ({}));
  if (!aRes.ok) return NextResponse.json({ error: `Sheet not sent: ${aData.error || aRes.status}` }, { status: 502 });

  let released = !!r.run.released_at;
  if (!released) {
    const rRes = await fetch(`${origin}/api/admin/mark-triage`, {
      method: 'POST', headers: fwd,
      body: JSON.stringify({ action: 'release', runId }),
    });
    const rData = await rRes.json().catch(() => ({}));
    if (!rRes.ok) {
      // The sheet is already with the student; say so plainly rather than
      // implying nothing happened.
      return NextResponse.json({
        error: `Sheet sent, but the paper did NOT release: ${rData.error || rRes.status}. Release it from triage.`,
        assignmentId: aData.assignment?.id ?? null,
      }, { status: 502 });
    }
    released = true;
  }

  return NextResponse.json({
    ok: true, released, pdfPath,
    assignmentId: aData.assignment?.id ?? null,
    alreadyWasReleased: !!r.run.released_at,
  });
}
