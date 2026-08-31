// /api/admin/sheet-jobs — the self-study sheet queue (SPEC-TEACHING-CYCLE).
//
//   GET                          → { jobs } (newest 30)
//   POST { runId, focus? }       → { job }        queue a sheet for that marked paper
//   POST { action:'next', by }   → { job|null }   worker claims the next job (lease)
//   POST { action:'beat', id }   → { ok }         heartbeat while authoring
//   POST { action:'done', id, result } → { ok }   file paths + wave; Telegrams Adrian
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ ok: true });
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
  const runId = String(body.runId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const { data: run } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_id, student_name, result_json')
    .eq('id', runId).maybeSingle<{ id: string; paper_name: string | null; student_id: string | null; student_name: string | null; result_json: unknown }>();
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  if (!run.student_id) {
    return NextResponse.json({ error: 'Tag this paper to a student first — a sheet needs someone to be for.' }, { status: 400 });
  }
  const results = (run.result_json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results) || !results.length) {
    return NextResponse.json({ error: 'That run has no marking to diagnose yet.' }, { status: 400 });
  }

  // Don't queue the same paper twice while one is still in flight.
  const { data: dupes } = await sb.from('sheet_jobs')
    .select('id, status').eq('run_id', runId).in('status', ['queued', 'claimed']);
  if (dupes?.length) return NextResponse.json({ error: 'A sheet for this paper is already queued.' }, { status: 409 });

  const { data: job, error } = await sb.from('sheet_jobs').insert({
    run_id: runId,
    airtable_student_id: run.student_id,
    student_name: run.student_name || '',
    paper_name: run.paper_name || '',
    focus: body.focus ? String(body.focus).slice(0, 300) : null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job });
}
