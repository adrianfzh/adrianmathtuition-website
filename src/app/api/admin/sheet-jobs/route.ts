// /api/admin/sheet-jobs — the self-study sheet queue (SPEC-TEACHING-CYCLE).
//
//   GET                          → { jobs } (newest 30)
//   POST { runId, focus? }       → { job }        queue a sheet for that marked paper
//   POST { action:'next', by }   → { job|null }   worker claims the next job (lease)
//   POST { action:'beat', id }   → { ok }         heartbeat while authoring
//   POST { action:'done', id, result } → { ok }   file paths + wave; Telegrams Adrian
//   POST { action:'fail', id, error }  → { ok }   back on the queue unless attempts are spent
//
// Everything is admin-authed: the worker is a headless Claude session on
// Adrian's Mac holding the same admin bearer (identical posture to the
// plan-marking worker). Claim/lease logic is pure in lib/sheet-jobs.ts.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { logJobRun } from '@/lib/job-log';
import { pickNextJob, sanitizeResult, completionMessage, MAX_ATTEMPTS, type SheetJob } from '@/lib/sheet-jobs';

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
  let body: { runId?: string; focus?: string; action?: string; by?: string; id?: string; result?: unknown; error?: string };
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

  if (body.action === 'beat') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await sb.from('sheet_jobs').update({ heartbeat_at: new Date().toISOString() }).eq('id', body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'done') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const result = sanitizeResult(body.result);
    if (!result) return NextResponse.json({ error: 'result.docx_path is required' }, { status: 400 });
    const { data: job, error } = await sb.from('sheet_jobs')
      .update({ status: 'done', result, completed_at: new Date().toISOString(), error: null })
      .eq('id', body.id).select('*').single<SheetJob>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Best-effort: a Telegram hiccup must not undo a finished sheet.
    sendTelegram(completionMessage(job, result)).catch(() => {});
    logJobRun('sheet-worker', true, `${job.student_name || job.airtable_student_id}: sheet filed`).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'fail') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const msg = String(body.error || 'unknown').slice(0, 500);
    const { data: job } = await sb.from('sheet_jobs').select('*').eq('id', body.id).single<SheetJob>();
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
