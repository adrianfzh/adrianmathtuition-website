// /api/admin/sheet-jobs — the self-study sheet queue (SPEC-TEACHING-CYCLE).
//
//   GET                          → { jobs } (newest 30)
//   POST { runId, focus? }       → { job }        queue a sheet for that marked paper
//   POST { action:'next', by }   → { job|null }   worker claims the next job (lease)
//   POST { action:'beat', id }   → { ok }         heartbeat while authoring
//   POST { action:'done', id, result } → { ok, diagnosis, rebuilt, rebuild }
//                                  file paths + wave; Telegrams Adrian. An optional
//                                  result.diagnosis (lib/sheet-diagnosis.ts) is
//                                  written onto the run and both marked PDFs are
//                                  rebuilt so the cover follows the sheet.
//   POST { action:'fail', id, error }  → { ok }   back on the queue unless attempts are spent
//   POST { action:'cancel', id } → { ok }         stop it — terminal, never re-picked
//
// Everything is admin-authed: the worker is a headless Claude session on
// Adrian's Mac holding the same admin bearer (identical posture to the
// plan-marking worker). Claim/lease logic is pure in lib/sheet-jobs.ts.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { logJobRun } from '@/lib/job-log';
import { pickNextJob, sanitizeResult, completionMessage, cancelState, MAX_ATTEMPTS, type SheetJob } from '@/lib/sheet-jobs';
import { normaliseDiagnosis, type Diagnosis } from '@/lib/sheet-diagnosis';
import { rebuildRunPdfs, type RebuildOutcome } from '@/lib/rebuild-run-pdfs';
import { queueSheetJob } from '@/lib/sheet-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// `done` waits for both marked PDFs to rebuild (mark-paper-pdf: seconds for the
// images copy, up to ~2 min cold for the full script, run in parallel) so it can
// answer `rebuilt` truthfully. Same ceiling as the PDF route itself.
export const maxDuration = 300;

/**
 * Put the sheet's diagnosis on the run — `result_json.diagnosis`. Read-modify-
 * write of the JSON, the same way `queue` and `practice` are stored on it.
 * Returns false (never throws) when the row could not be updated.
 */
async function storeDiagnosis(runId: string, diagnosis: Diagnosis): Promise<boolean> {
  try {
    const sb = getSupabaseAdmin();
    const { data: run } = await sb.from('paper_marking_runs')
      .select('result_json').eq('id', runId).maybeSingle<{ result_json: unknown }>();
    if (!run) return false;
    const rj = (run.result_json && typeof run.result_json === 'object') ? run.result_json as Record<string, unknown> : {};
    const { error } = await sb.from('paper_marking_runs')
      .update({ result_json: { ...rj, diagnosis } }).eq('id', runId);
    if (error) { console.warn('[sheet-jobs] diagnosis not stored', runId, error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[sheet-jobs] diagnosis not stored', runId, (e as Error).message);
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await getSupabaseAdmin()
    .from('sheet_jobs').select('*').order('created_at', { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { runId?: string; focus?: string; action?: string; by?: string; id?: string; result?: unknown; error?: string ; stage?: string};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const sb = getSupabaseAdmin();

  // ── worker: claim the next job ────────────────────────────────────────────
  if (body.action === 'next') {
    const by = String(body.by || 'worker').slice(0, 60);
    const { data: open } = await sb.from('sheet_jobs').select('*').in('status', ['queued', 'claimed']);
    const next = pickNextJob((open ?? []) as SheetJob[]);
    if (!next) return NextResponse.json({ job: null });
    const now = new Date().toISOString();
    // Conditional update on the claim generation we read — two workers racing
    // must not both win (the staging-vs-prod claim race, relearned).
    const { data: claimed, error } = await sb.from('sheet_jobs')
      .update({ status: 'claimed', claimed_by: by, claimed_at: now, heartbeat_at: now, attempts: next.attempts + 1 })
      .eq('id', next.id).eq('status', next.status)
      .select('*').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!claimed) return NextResponse.json({ job: null, note: 'lost the race' });
    return NextResponse.json({ job: claimed });
  }

  // ── Adrian: stop a sheet he didn't mean to start ──────────────────────────
  // A mis-tap on 📘 (it sits next to 🗑 on a phone-sized row) used to need a
  // hand-written DELETE: 'failed' requeues, and nothing else meant "I changed
  // my mind". Terminal, and never re-picked — see cancelState + pickNextJob.
  if (body.action === 'cancel') {
    // Addressed by runId from the paper row (which knows the paper, not the job)
    // or by job id from anywhere holding one. runId picks the OPEN job, so a
    // paper with an old cancelled or done job still cancels the live one.
    let job: SheetJob | null = null;
    if (body.id) {
      ({ data: job } = await sb.from('sheet_jobs').select('*').eq('id', body.id).maybeSingle<SheetJob>());
    } else if (body.runId) {
      ({ data: job } = await sb.from('sheet_jobs').select('*')
        .eq('run_id', body.runId).in('status', ['queued', 'claimed'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle<SheetJob>());
    } else {
      return NextResponse.json({ error: 'id or runId required' }, { status: 400 });
    }
    const state = cancelState(job);
    if (!state.can) return NextResponse.json({ error: state.reason }, { status: 409 });
    // Guarded on the status we read: a worker that claimed it between the read
    // and the write keeps its claim, and Adrian is told to try again rather
    // than being shown a cancel that didn't happen.
    const { data: done, error } = await sb.from('sheet_jobs')
      .update({ status: 'cancelled', claimed_by: null, heartbeat_at: null, completed_at: new Date().toISOString() })
      .eq('id', job!.id).eq('status', job!.status)
      .select('id').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!done) return NextResponse.json({ error: 'that job changed while you tapped — refresh and look again' }, { status: 409 });
    return NextResponse.json({ ok: true, cancelled: true, wasRunning: state.running });
  }

  if (body.action === 'beat') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    // The heartbeat is where a running worker learns it has been cancelled —
    // the same shape as the marking runbook's "claim lost", and the reason
    // cancel can reach a session already writing a sheet.
    const { data: cur } = await sb.from('sheet_jobs').select('status').eq('id', body.id).maybeSingle<{ status: string }>();
    if (cur?.status === 'cancelled') {
      return NextResponse.json({ ok: false, cancelled: true, stop: true, error: 'cancelled — stop now' }, { status: 409 });
    }
    // An optional stage label rides the heartbeat (31 Aug 2026). A sheet takes
    // ~15 minutes across four distinct phases and "claimed" said nothing about
    // which — one diagnosing looked exactly like one about to file. Trimmed and
    // capped here; a worker that sends none behaves exactly as before.
    const stage = typeof body.stage === 'string' && body.stage.trim()
      ? body.stage.trim().slice(0, 40) : undefined;
    await sb.from('sheet_jobs')
      .update({ heartbeat_at: new Date().toISOString(), ...(stage ? { stage } : {}) })
      .eq('id', body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'done') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const result = sanitizeResult(body.result);
    if (!result) return NextResponse.json({ error: 'result.docx_path is required' }, { status: 400 });
    // A cancelled job stays cancelled. The worker may have filed a DOCX before
    // it noticed — that file is left in Dropbox rather than deleted, but the row
    // does not flip to done and Adrian is not Telegrammed about a sheet he
    // stopped. The .neq below is what enforces it: no matching row, no update.
    const { data: job, error } = await sb.from('sheet_jobs')
      .update({ status: 'done', result, completed_at: new Date().toISOString(), error: null })
      .eq('id', body.id).neq('status', 'cancelled').select('*').maybeSingle<SheetJob>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job) return NextResponse.json({ ok: false, cancelled: true, error: 'cancelled — this sheet was stopped' }, { status: 409 });
    // Best-effort: a Telegram hiccup must not undo a finished sheet.
    sendTelegram(completionMessage(job, result)).catch(() => {});
    logJobRun('sheet-worker', true, `${job.student_name || job.airtable_student_id}: sheet filed`).catch(() => {});

    // ── The sheet's diagnosis drives the cover (Adrian, 2 Sep 2026) ────────────
    // The worker read the student's working and ranked what to teach; the marked
    // paper's page 1 used to rank the same losses with a keyword classifier and
    // could disagree with the sheet stapled behind it. Store the diagnosis on the
    // run, then rebuild both PDFs so the cover is drawn after it exists.
    // Every step here is fail-soft: the sheet is already done and Adrian already
    // told — a malformed diagnosis is logged and skipped, a failed rebuild is
    // reported as `rebuilt:false`, and neither can turn this `done` into an error.
    // A released run is never rebuilt (the student has that copy); the diagnosis
    // still lands, so /api/admin/paper-analysis reflects it.
    let diagnosisStored = false;
    let rebuild: RebuildOutcome = { rebuilt: false, skipped: 'no diagnosis in the payload' };
    const rawDiagnosis = (body.result as { diagnosis?: unknown } | null | undefined)?.diagnosis;
    if (rawDiagnosis !== undefined) {
      const diagnosis = normaliseDiagnosis(rawDiagnosis, { sheetJobId: job.id });
      if (!diagnosis) {
        console.warn('[sheet-jobs] diagnosis ignored — malformed', job.id, JSON.stringify(rawDiagnosis).slice(0, 300));
        rebuild = { rebuilt: false, skipped: 'diagnosis malformed — ignored' };
      } else {
        diagnosisStored = await storeDiagnosis(job.run_id, diagnosis);
        if (!diagnosisStored) {
          rebuild = { rebuilt: false, skipped: 'diagnosis not stored' };
        } else {
          // Same-origin call with the caller's own admin credentials (the
          // release-with-sheet pattern); the env bearer only if none were sent.
          const headers: Record<string, string> = {};
          const auth = req.headers.get('authorization');
          const cookie = req.headers.get('cookie');
          if (auth) headers.Authorization = auth;
          else if (process.env.ADMIN_PASSWORD) headers.Authorization = `Bearer ${process.env.ADMIN_PASSWORD}`;
          if (cookie) headers.cookie = cookie;
          rebuild = await rebuildRunPdfs(job.run_id, { origin: req.nextUrl.origin, headers });
          if (!rebuild.rebuilt) console.warn('[sheet-jobs] cover rebuild incomplete', job.run_id, JSON.stringify(rebuild));
        }
      }
    }
    return NextResponse.json({ ok: true, diagnosis: diagnosisStored, rebuilt: rebuild.rebuilt, rebuild });
  }

  if (body.action === 'fail') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const msg = String(body.error || 'unknown').slice(0, 500);
    const { data: job } = await sb.from('sheet_jobs').select('*').eq('id', body.id).single<SheetJob>();
    // A worker reporting failure on a job Adrian cancelled must not put it back
    // on the queue — 'failed' requeues, which is exactly the trap that made a
    // hand-written DELETE the only way to stop one.
    if (job?.status === 'cancelled') return NextResponse.json({ ok: true, cancelled: true, requeued: false });
    const spent = (job?.attempts ?? 0) >= MAX_ATTEMPTS;
    await sb.from('sheet_jobs')
      .update({ status: spent ? 'failed' : 'queued', error: msg, claimed_by: null, claimed_at: null, heartbeat_at: null })
      .eq('id', body.id);
    if (spent && job) {
      sendTelegram(`⚠️ Self-study sheet failed ${MAX_ATTEMPTS}× for <b>${job.student_name || job.airtable_student_id}</b> (${job.paper_name || 'paper'})\n${msg}`).catch(() => {});
    }
    return NextResponse.json({ ok: true, requeued: !spent });
  }

  // ── Adrian: queue a sheet for a marked paper ──────────────────────────────
  // The guard (tagged · marked · nothing in flight) lives in lib/sheet-queue.ts
  // and is shared with the desk's auto-queue, so the two doors can never
  // disagree about which papers may have a sheet.
  const runId = String(body.runId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const out = await queueSheetJob(runId, { focus: body.focus });
  if (!out.ok) return NextResponse.json({ error: out.message }, { status: out.http });
  return NextResponse.json({ job: out.job });
}
