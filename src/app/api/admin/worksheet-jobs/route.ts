// /api/admin/worksheet-jobs — the Telegram worksheet queue (SPEC-WORKSHEET-MENU.md).
//
//   GET                                 → { jobs } (newest 30)
//   POST { kind, level, topic?, params?, requested_by?, label? } → { job }   queue one
//   POST { action:'next', by }          → { job|null }   worker claims the next job (lease)
//   POST { action:'beat', id, stage? }  → { ok }         heartbeat; 409 {cancelled,stop} if Adrian stopped it
//   POST { action:'done', id, result }  → { ok }         file paths; Telegrams Adrian + sends the files
//   POST { action:'fail', id, error }   → { ok, requeued } back on the queue unless attempts are spent
//   POST { action:'cancel', id }        → { ok }         terminal, never re-picked
//
// Kind 3 (questions only) never comes here — it is instant via /api/bot/worksheet.
// Everything is admin-authed: the bot holds ADMIN_PASSWORD as a Fly secret and
// the worker is a headless Claude session on Adrian's Mac with the same bearer
// (identical posture to sheet-jobs and plan-marking). Claim/lease logic is pure
// in lib/worksheet-jobs.ts.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram, sendTelegramDocument } from '@/lib/telegram';
import { logJobRun } from '@/lib/job-log';
import { downloadFile, getTemporaryLink, listFolder } from '@/lib/dropbox';
import {
  pickNextJob, sanitizeResult, completionMessage, cancelState, jobInsert, MAX_ATTEMPTS,
  type WorksheetJob, type WorksheetResult,
} from '@/lib/worksheet-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB = 'worksheet-worker';

// Where Adrian's own revision sheets live per level (the revision-worksheet skill's
// FOLDER map). Kind 4 extends one of these, so the bot asks which exist.
const REVISION_FOLDER: Record<string, string> = {
  S1: 'S1', S2: 'S2', S3_EM: 'EM', EM: 'EM', S3_AM: 'AM', AM: 'AM', JC: 'JC', JC1: 'JC', JC2: 'JC',
};

/** Adrian's existing sheets for a level whose file name carries the topic's words. */
async function existingSheets(level: string, topic: string): Promise<string[]> {
  const folder = REVISION_FOLDER[level.toUpperCase()];
  if (!folder) return [];
  const words = topic.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !/^(and|the|of|with)$/.test(w));
  if (!words.length) return [];
  const entries = await listFolder(`/Revision/${folder}`).catch(() => []);
  return entries
    .map(e => e.name)
    .filter(n => /\.docx$/i.test(n) && !/^~\$/.test(n))
    .filter(n => { const l = n.toLowerCase(); return words.every(w => l.includes(w)); })
    .sort()
    .slice(0, 12);
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // ?sheets=1&level=AM&topic=Circles → the sheets kind 4 could extend
  const sp = req.nextUrl.searchParams;
  if (sp.get('sheets')) {
    const level = String(sp.get('level') || '').trim();
    const topic = String(sp.get('topic') || '').trim();
    if (!level || !topic) return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
    return NextResponse.json({ sheets: await existingSheets(level, topic) });
  }
  const { data, error } = await getSupabaseAdmin()
    .from('worksheet_jobs').select('*').order('created_at', { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const sb = getSupabaseAdmin();
  const id = typeof body.id === 'string' ? body.id : '';

  // ── worker: claim the next job ────────────────────────────────────────────
  if (body.action === 'next') {
    const by = String(body.by || 'worker').slice(0, 60);
    const { data: open } = await sb.from('worksheet_jobs').select('*').in('status', ['queued', 'claimed']);
    const next = pickNextJob((open ?? []) as WorksheetJob[]);
    if (!next) return NextResponse.json({ job: null });
    const now = new Date().toISOString();
    // Conditional on the status we read — two workers racing must not both win.
    const { data: claimed, error } = await sb.from('worksheet_jobs')
      .update({ status: 'claimed', claimed_by: by, claimed_at: now, heartbeat_at: now, attempts: next.attempts + 1 })
      .eq('id', next.id).eq('status', next.status)
      .select('*').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!claimed) return NextResponse.json({ job: null, note: 'lost the race' });
    return NextResponse.json({ job: claimed });
  }

  if (body.action === 'cancel') {
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: job } = await sb.from('worksheet_jobs').select('*').eq('id', id).maybeSingle<WorksheetJob>();
    const state = cancelState(job);
    if (!state.can) return NextResponse.json({ error: state.reason }, { status: 409 });
    const { data: done, error } = await sb.from('worksheet_jobs')
      .update({ status: 'cancelled', claimed_by: null, heartbeat_at: null, completed_at: new Date().toISOString() })
      .eq('id', job!.id).eq('status', job!.status)
      .select('id').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!done) return NextResponse.json({ error: 'that job changed while you tapped — look again' }, { status: 409 });
    return NextResponse.json({ ok: true, cancelled: true, wasRunning: state.running });
  }

  if (body.action === 'beat') {
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    // The heartbeat is where a running worker learns it has been cancelled.
    const { data: cur } = await sb.from('worksheet_jobs').select('status').eq('id', id).maybeSingle<{ status: string }>();
    if (cur?.status === 'cancelled') {
      return NextResponse.json({ ok: false, cancelled: true, stop: true, error: 'cancelled — stop now' }, { status: 409 });
    }
    const stage = typeof body.stage === 'string' && body.stage.trim() ? body.stage.trim().slice(0, 40) : undefined;
    await sb.from('worksheet_jobs')
      .update({ heartbeat_at: new Date().toISOString(), ...(stage ? { stage } : {}) })
      .eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'done') {
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const result = sanitizeResult(body.result);
    if (!result) return NextResponse.json({ error: 'result.docx_path is required' }, { status: 400 });
    // A cancelled job stays cancelled: the .neq means no row matches, no update,
    // and Adrian is not Telegrammed about a sheet he stopped.
    const { data: job, error } = await sb.from('worksheet_jobs')
      .update({ status: 'done', result, completed_at: new Date().toISOString(), error: null, stage: 'done' })
      .eq('id', id).neq('status', 'cancelled').select('*').maybeSingle<WorksheetJob>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job) return NextResponse.json({ ok: false, cancelled: true, error: 'cancelled — this job was stopped' }, { status: 409 });
    // Best-effort: a Telegram hiccup must not undo a finished sheet.
    sendTelegram(completionMessage(job, result))
      .then(() => sendFiles(job, result))
      .catch(() => {});
    logJobRun(JOB, true, `${job.label}: filed`, { job_id: job.id, kind: job.kind }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'fail') {
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const msg = String(body.error || 'unknown').slice(0, 500);
    const { data: job } = await sb.from('worksheet_jobs').select('*').eq('id', id).maybeSingle<WorksheetJob>();
    if (job?.status === 'cancelled') return NextResponse.json({ ok: true, cancelled: true, requeued: false });
    const spent = (job?.attempts ?? 0) >= MAX_ATTEMPTS;
    await sb.from('worksheet_jobs')
      .update({ status: spent ? 'failed' : 'queued', error: msg, claimed_by: null, claimed_at: null, heartbeat_at: null })
      .eq('id', id);
    if (spent && job) {
      sendTelegram(`⚠️ Worksheet failed ${MAX_ATTEMPTS}× — <b>${job.label}</b>\n${msg}`).catch(() => {});
      logJobRun(JOB, false, `${job.label}: ${msg}`, { job_id: job.id, kind: job.kind }).catch(() => {});
    }
    return NextResponse.json({ ok: true, requeued: !spent });
  }

  // ── Adrian (via the bot): queue one ───────────────────────────────────────
  const ins = jobInsert(body);
  if (!ins.ok) return NextResponse.json({ error: ins.error }, { status: 400 });
  const { data: job, error } = await sb.from('worksheet_jobs').insert(ins.row).select('*').single<WorksheetJob>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job });
}

/**
 * The files behind the message. PDF by Dropbox temporary link (Telegram fetches
 * PDFs itself); DOCX as bytes (URL sends only work for PDF/ZIP). Both best-effort.
 */
async function sendFiles(job: WorksheetJob, result: WorksheetResult): Promise<void> {
  if (result.pdf_path) {
    try {
      await sendTelegramDocument({ url: await getTemporaryLink(result.pdf_path) }, `🛠 ${job.label} — PDF`);
    } catch (e) { console.warn('[worksheet-jobs] pdf to telegram failed:', (e as Error).message); }
  }
  try {
    const bytes = await downloadFile(result.docx_path);
    const name = result.docx_path.split('/').pop() || 'worksheet.docx';
    await sendTelegramDocument(
      { bytes, filename: name, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      `🛠 ${job.label} — DOCX (edit this one)`,
    );
  } catch (e) { console.warn('[worksheet-jobs] docx to telegram failed:', (e as Error).message); }
}
