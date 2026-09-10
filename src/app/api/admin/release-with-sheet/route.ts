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
//
// ONE PAPER IN THIS QUEUE HAS NO SHEET ON PURPOSE (3 Sep 2026). When the newest
// done job carries `{noSheet:true, reason}` — the worker read the paper and there
// was nothing worth practising — there is no PDF to choose and no assignment to
// write: the marked paper is released on its own and the response says why
// (`kind:'no-sheet'`), rather than 404-ing "No PDF in the sheet's folder yet".
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listFolder, dropboxConfigured, downloadFile } from '@/lib/dropbox';
import { putStudentFile, runKey } from '@/lib/student-files';
import { displayPaperName } from '@/lib/paper-display-name';
import { choosePdf, sheetFolder, ambiguityMessage, noSheetNote, earlierSheetsToWithdraw, type SheetFile } from '@/lib/release-with-sheet';
import { readNoSheet } from '@/lib/sheet-jobs';
import { attachAmendedFromDropbox } from '@/lib/attach-amended';
import { releaseHeldPracticeItems } from '@/lib/practice-again-store';
import { coveredRunIds } from '@/lib/sheet-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SheetResult = { docx_path?: string; pdf_path?: string | null };

/** The finished sheet for a run, plus its folder listing. */
async function resolve(runId: string) {
  const sb = getSupabaseAdmin();
  const { data: run } = await sb
    .from('paper_marking_runs')
    .select('id, student_id, student_name, paper_name, paper_subject, released_at, total_awarded, total_max')
    .eq('id', runId).maybeSingle();
  if (!run) return { error: 'run not found', status: 404 as const };
  if (!run.student_id) return { error: 'Tag this paper to a student first.', status: 400 as const };

  const { data: job } = await sb
    .from('sheet_jobs').select('result, requested_by, run_id, run_ids')
    .eq('run_id', runId).eq('status', 'done')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!job) return { error: 'No finished sheet for this paper yet.', status: 404 as const };

  // The worker's honest "nothing here is worth practising" (3 Sep 2026) is a
  // finished job with no files. There is no PDF to choose and no assignment to
  // write — the marked paper is released on its own, deliberately, instead of
  // this answering 404 "No PDF in the sheet's folder yet".
  // Who asked for this sheet decides what it is to the student (8 Sep 2026):
  // one Adrian queued and released is COMPULSORY (required_at, reminders);
  // one the student asked for from the app is theirs to do — no nag.
  const requestedBy = (job as { requested_by?: string | null }).requested_by === 'student' ? 'student' as const : 'adrian' as const;
  // A batch sheet (10 Sep 2026) covers several papers: the row it makes and the
  // archive it leaves go to every one of them.
  const covered = coveredRunIds({ run_id: runId, run_ids: (job as { run_ids?: string[] | null }).run_ids ?? null });
  const noSheet = readNoSheet(job.result);
  if (noSheet.noSheet) return { run, noSheet: true as const, reason: noSheet.reason, requestedBy, covered };

  const result = (job.result || {}) as SheetResult;
  const folderPath = sheetFolder(result.pdf_path, result.docx_path);
  if (!folderPath) return { error: 'The sheet job recorded no file path.', status: 404 as const };

  let files: SheetFile[] = [];
  if (dropboxConfigured()) {
    try {
      const entries = await listFolder(folderPath);
      // lib/dropbox's listFolder returns ITS OWN shape — { tag, name, path,
      // modified, size } with `path` = Dropbox's path_lower — not the raw API
      // entry. The first version of this read `path_display` / `path_lower` /
      // `server_modified` off it, every entry mapped to an empty path, the
      // filter dropped them all, and the button answered "No PDF in the
      // sheet's folder yet" for every sheet ever filed (found 2 Sep 2026 while
      // re-filing the sheets into per-paper folders). path_lower is lowercase,
      // which is fine: choosePdf compares case-insensitively.
      files = (entries || []).map(e => ({
        path: e.path || '',
        name: e.name || '',
        modified: e.modified ?? null,
      })).filter(x => x.path && x.name);
    } catch { /* an unreadable folder degrades to the recorded path alone */ }
  }

  // `noSheet` is the discriminant the two callers branch on.
  return { run, noSheet: false as const, result, folderPath, choice: choosePdf(result.pdf_path, result.docx_path, files), requestedBy, covered };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  const r = await resolve(runId);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

  if (r.noSheet) {
    return NextResponse.json({
      ready: true, kind: 'no-sheet', noSheet: true, reason: r.reason,
      pdfPath: null, candidates: [], note: noSheetNote(r.reason),
      alreadyReleased: !!r.run.released_at,
      studentName: r.run.student_name, paperName: r.run.paper_name,
    });
  }

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

  const origin = req.nextUrl.origin;
  const auth = req.headers.get('authorization');
  const cookie = req.headers.get('cookie');
  const fwd: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) fwd.Authorization = auth;
  if (cookie) fwd.cookie = cookie;

  // 📂 Adrian's amended copy first (2 Sep 2026): "Marked (Adrian)*.pdf" in the
  // same folder as the sheet, attached if newer than what the run carries — so
  // the marked paper that goes out with the sheet is the one he wrote on. The
  // release action repeats the check (idempotent); doing it here too means a
  // Dropbox problem is visible in this response, before anything is sent.
  async function attachMyCopy(alreadyReleased: boolean) {
    if (alreadyReleased) return null;
    const out = await attachAmendedFromDropbox(runId);
    if (out.status === 'error') console.warn('[release-with-sheet] amended-copy check failed:', out.message);
    return out.status === 'attached' || out.status === 'unchanged'
      ? { status: out.status, name: out.name, note: out.status === 'unchanged' ? out.reason : undefined }
      : out.status === 'error' ? { status: 'error', note: out.message } : { status: out.status };
  }

  /** The release itself — mark-triage owns it, and its own gates still apply. */
  async function releasePaper() {
    const res = await fetch(`${origin}/api/admin/mark-triage`, {
      method: 'POST', headers: fwd, body: JSON.stringify({ action: 'release', runId }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  // ── nothing to teach: the paper goes on its own ───────────────────────────
  // A `done` job carrying `{noSheet:true, reason}` is finished, not failed —
  // there is no sheet to look for and no assignment to write. Every other gate
  // (untagged, pending reviews, pdf_stale) is untouched: they live in
  // mark-triage's release action and in attachMyCopy, both still called here.
  if (r.noSheet) {
    const alreadyReleased = !!r.run.released_at;
    const amended = await attachMyCopy(alreadyReleased);
    if (!alreadyReleased) {
      const rel = await releasePaper();
      if (!rel.ok) {
        return NextResponse.json({
          error: `The paper did NOT release: ${rel.data.error || rel.status}. Release it from the desk.`,
          noSheet: true, reason: r.reason,
        }, { status: 502 });
      }
    }
    return NextResponse.json({
      ok: true, released: true, noSheet: true, reason: r.reason, note: noSheetNote(r.reason),
      pdfPath: null, assignmentId: null, alreadyWasReleased: alreadyReleased, amended,
    });
  }

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

  const amended = await attachMyCopy(!!r.run.released_at);

  // The SHEET goes first. If the assignment fails, nothing has been released and
  // Adrian can retry the whole thing; releasing first would leave a student with a
  // marked paper and no work, which is the state this button exists to prevent.
  // The paper's name the way the student knows it ("A Math · GCE 2021 · Paper 1"),
  // not the internal one ("wanqing am tys 2021 p1") — same rule as the Papers list.
  const batch = r.covered.length > 1;
  const subjectWord = String((r.run as { paper_subject?: string | null }).paper_subject || '').trim();
  const title = batch
    ? `Practice Again — your ${r.covered.length}${subjectWord ? ` ${subjectWord}` : ''} papers`
    : `Practice Again — ${r.run.paper_name ? displayPaperName(r.run.paper_name, r.run.student_name) : 'your marked paper'}`;
  const aRes = await fetch(`${origin}/api/admin/assignments`, {
    method: 'POST', headers: fwd,
    body: JSON.stringify({
      studentId: r.run.student_id, kind: 'worksheet', title,
      pdfSource: `dropbox:${pdfPath}`,
      note: r.requestedBy === 'student'
        ? 'From the paper you just got back — the parts worth another go.'
        : 'Adrian asked you to do this one — work through the examples, then hand the practice in.',
      // Compulsory when Adrian set it (lib/assignments withRequired → required_at;
      // /api/cron/practice-again-reminders nags until it is handed in). A sheet
      // the student asked for carries no stamp.
      required: r.requestedBy !== 'student',
      // Filed as the paper's own Practice Again sheet (7 Sep 2026): the Papers
      // list's card and the Practice tab's "Practice Again" group both look for
      // source 'practice-again' + the source run — without them the sheet sat
      // under "From Adrian" and the paper showed no sheet at all.
      source: 'practice-again', sourceRunId: runId,
      // A batch sheet names every paper it covers (10 Sep 2026).
      ...(batch ? { sourceRunIds: r.covered } : {}),
    }),
  });
  const aData = await aRes.json().catch(() => ({}));
  if (!aRes.ok) return NextResponse.json({ error: `Sheet not sent: ${aData.error || aRes.status}` }, { status: 502 });

  // ── The new sheet replaces the earlier one (9 Sep 2026) ───────────────────
  // Earlier Practice Again rows for this paper that the student has not handed
  // in are withdrawn (status 'revoked' hides them from the app and the
  // reminders); a submitted or marked sheet keeps its row. Fail-soft: a miss
  // here leaves two cards, never an unsent sheet.
  let withdrawn = 0;
  try {
    const newId = String(aData.assignment?.id ?? '');
    const supa0 = getSupabaseAdmin();
    const { data: earlier } = await supa0.from('portal_assignments').select('id, status')
      .eq('airtable_student_id', r.run.student_id).eq('source', 'practice-again').eq('kind', 'worksheet')
      // Earlier single-paper sheets for ANY covered paper are superseded by a batch (10 Sep 2026).
      .or(`source_run_id.in.(${r.covered.join(',')}),source_run_ids.ov.{${r.covered.join(',')}}`);
    const ids = earlierSheetsToWithdraw((earlier ?? []) as { id: string; status: string }[], newId);
    if (ids.length) {
      const { error: wErr } = await supa0.from('portal_assignments')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() }).in('id', ids);
      if (wErr) console.warn('[release-with-sheet] earlier sheets not withdrawn:', wErr.message);
      else withdrawn = ids.length;
    }
  } catch (e) { console.warn('[release-with-sheet] earlier-sheet withdrawal skipped:', (e as Error).message); }

  // ── Archive the sheet into the private store (6 Sep 2026) ────────────────
  // The Dropbox folder is a one-month tray (/api/cron/dropbox-tray deletes it):
  // the PDF that went out and the DOCX Adrian edited are copied into the run's
  // own store first, so nothing of the sheet lives only in Dropbox. Fail-soft.
  try {
    const files = await listFolder(r.folderPath);
    const docx = files.filter(f => f.tag === 'file' && /\.docx$/i.test(f.name) && !/worker original/i.test(f.name))
      .sort((a, b) => String(b.modified || '').localeCompare(String(a.modified || '')))[0];
    const archive: Record<string, string> = { at: new Date().toISOString() };
    const pdfBuf = await downloadFile(pdfPath);
    archive.pdf_url = (await putStudentFile({ key: runKey(runId, 'practice-again.pdf'), body: pdfBuf, contentType: 'application/pdf' })).url;
    if (docx) {
      const docxBuf = await downloadFile(docx.path);
      archive.docx_url = (await putStudentFile({ key: runKey(runId, 'practice-again.docx'), body: docxBuf, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).url;
    }
    const supa = getSupabaseAdmin();
    for (const rid of r.covered) {
      const { data: row } = await supa.from('paper_marking_runs').select('result_json').eq('id', rid).maybeSingle();
      const rj = (row?.result_json && typeof row.result_json === 'object') ? row.result_json as Record<string, unknown> : {};
      await supa.from('paper_marking_runs').update({ result_json: { ...rj, practice_again_archive: archive } }).eq('id', rid);
    }
  } catch (e) { console.warn('[release-with-sheet] sheet archive skipped:', (e as Error).message); }

  let released = !!r.run.released_at;
  if (!released) {
    const rel = await releasePaper();
    if (!rel.ok) {
      // The sheet is already with the student; say so plainly rather than
      // implying nothing happened.
      return NextResponse.json({
        error: `Sheet sent, but the paper did NOT release: ${rel.data.error || rel.status}. Release it from triage.`,
        assignmentId: aData.assignment?.id ?? null,
      }, { status: 502 });
    }
    released = true;
  }

  // 🔁 Practice Again items (SPEC-PORTAL-V2 §7 — OFF since 8 Sep 2026, sheet
  // only: `PRACTICE_AGAIN_HANDS_BACK_QUESTIONS`; the store returns 0). mark-triage's release flips
  // them itself, but when the paper was ALREADY released (Adrian released by
  // hand before the sheet finished) that call never happens — so the flip is
  // repeated here, idempotently, and this button is the one that lets them out.
  const heldItems = await releaseHeldPracticeItems(getSupabaseAdmin(), runId);

  return NextResponse.json({
    ok: true, released, pdfPath,
    assignmentId: aData.assignment?.id ?? null,
    practiceItems: heldItems.released,
    alreadyWasReleased: !!r.run.released_at,
    withdrawn,
    amended,
    required: r.requestedBy !== 'student',
    requestedBy: r.requestedBy,
    covered: r.covered,
  });
}
