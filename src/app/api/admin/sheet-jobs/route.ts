// /api/admin/sheet-jobs — the self-study sheet queue (SPEC-TEACHING-CYCLE).
//
//   GET                          → { jobs } (newest 30)
//   GET ?paper=<ilike>&status=done&limit=  → { jobs } filtered; with ?paper= each job also carries
//                                  `diagnosis` (the run's stored sheet diagnosis) — the "reuse
//                                  before you write" lookup (Adrian, 9 Sep 2026): earlier sheets
//                                  on the same paper, section by section, with their gaps
//   POST { runId, focus?, remark? } → { job }   Adrian queues a sheet (compulsory once released); remark:true replaces an existing sheet
//   POST { action:'next', by }   → { job|null }   worker claims the next job (lease)
//   POST { action:'beat', id }   → { ok }         heartbeat while authoring
//   POST { action:'done', id, result } → { ok, diagnosis, rebuilt, rebuild, practiceItems }
//                                  file paths + wave; Telegrams Adrian. An optional
//                                  result.diagnosis (lib/sheet-diagnosis.ts) is
//                                  written onto the run and both marked PDFs are
//                                  rebuilt so the cover follows the sheet. An
//                                  optional result.questions[] (SPEC-PORTAL-V2 §7,
//                                  lib/practice-again.ts) becomes one HELD
//                                  portal_assignments row per practice question —
//                                  released with the paper by Approve & release.
//                                  Idempotent on (job, position); fail-soft.
//   POST { action:'done', id, result:{noSheet:true, reason} } → { ok, noSheet, reason }
//                                  the paper had nothing worth practising. A real
//                                  completion: no files, no diagnosis, no rebuild,
//                                  and a calm Telegram — NOT the ⚠️ failed wording.
//   POST { action:'fail', id, error }  → { ok }   a GENUINE failure — back on the
//                                  queue unless attempts are spent
//   POST { action:'cancel', id } → { ok }         stop it — terminal, never re-picked
//   POST { action:'revise', id|runId, instructions } → { ok, jobId, round } — a filed sheet goes
//                                  back to the worker with Adrian's note (or the bot's, after a
//                                  page re-mark); only what the note names changes (8 Sep 2026)
//
// Everything is admin-authed: the worker is a headless Claude session on
// Adrian's Mac holding the same admin bearer (identical posture to the
// plan-marking worker). Claim/lease logic is pure in lib/sheet-jobs.ts.
import { NextRequest, NextResponse } from 'next/server';
import { plainMath, clip } from '@/lib/remark-diff';
import { computeAutoHold, isGroundedRun } from '@/lib/mark-triage';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the marking topic (6 Sept 2026; falls back to the DM when unbound).
const notify_marking = (text: string) => sendTelegram(text, 'marking');
import { logJobRun } from '@/lib/job-log';
import {
  pickNextJob, sanitizeResult, completionMessage, cancelState, isNoSheet, MAX_ATTEMPTS, type SheetJobResult,
  type SheetJob, type SheetFiledResult,
} from '@/lib/sheet-jobs';
import { sendTelegramDocument } from '@/lib/telegram';
import { downloadFile, getTemporaryLink } from '@/lib/dropbox';
import JSZip from 'jszip';
import Anthropic from '@anthropic-ai/sdk';
import { docxXmlToText, extractExamples, runExampleCheck } from '@/lib/sheet-example-check';
import { autoReleaseGate, holdHours, scheduledLine, heldLine, requestedSentLine, requestedHeldLine, requestedStoppedLine, type GateInput } from '@/lib/sheet-auto-release';
import { normaliseDiagnosis, splitDiagnosisByRun, type Diagnosis } from '@/lib/sheet-diagnosis';
import { rebuildRunPdfs, type RebuildOutcome } from '@/lib/rebuild-run-pdfs';
import { queueSheetJob, requeueSheetAfterRemark, queueSheetBatch, coveredRunIds } from '@/lib/sheet-queue';
import { sanitizeSheetQuestions } from '@/lib/practice-again';
import { createHeldPracticeItems, deleteHeldPracticeItems } from '@/lib/practice-again-store';
import { archiveSheetToStore } from '@/lib/sheet-archive';

/** A worker's 'fail' whose reason is really 'no gap to teach' — treated as a noSheet completion. */
const NO_SHEET_RE = /nothing to teach|no sheet needed|no real gap|no action needed|nothing to practise|nothing to practice/i;

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
async function storeDiagnosis(runId: string, diagnosis: Diagnosis, known?: unknown): Promise<boolean> {
  try {
    const sb = getSupabaseAdmin();
    // `known` = the run's result_json the caller already fetched (the focus gate
    // reads it first); otherwise read it here.
    const run = known !== undefined ? { result_json: known }
      : (await sb.from('paper_marking_runs').select('result_json').eq('id', runId).maybeSingle<{ result_json: unknown }>()).data;
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

/**
 * A sheet the student asked for goes out through the desk's own release call
 * (/api/admin/release-with-sheet) the moment it clears the gate — same PDF
 * choice, same assignment row, same stamps as Approve & release, so the two
 * doors can never hand a student a different thing. Same-origin, with the
 * caller's auth forwarded (the worker's bearer, or Adrian's cookie).
 */
async function deliverRequestedSheet(req: NextRequest, runId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = req.headers.get('authorization');
  const cookie = req.headers.get('cookie');
  if (auth) headers.Authorization = auth;
  else if (process.env.ADMIN_PASSWORD) headers.Authorization = `Bearer ${process.env.ADMIN_PASSWORD}`;
  if (cookie) headers.cookie = cookie;
  try {
    const r = await fetch(`${process.env.WEBSITE_URL || 'https://www.adrianmathtuition.com'}/api/admin/release-with-sheet`, {
      method: 'POST', headers, body: JSON.stringify({ runId }), signal: AbortSignal.timeout(120_000),
    });
    const d = await r.json().catch(() => ({} as { error?: string }));
    if (!r.ok) return { ok: false, error: String(d.error || `HTTP ${r.status}`) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const paper = (sp.get('paper') || '').trim().slice(0, 120);
  const status = (sp.get('status') || '').trim().slice(0, 20);
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 30));
  const sb = getSupabaseAdmin();
  let q = sb.from('sheet_jobs').select('*').order('created_at', { ascending: false }).limit(limit);
  // PostgREST's ilike pattern: escape the wildcards a paper name could carry, then wrap.
  if (paper) q = q.ilike('paper_name', `%${paper.replace(/[%_\\]/g, m => `\\${m}`)}%`);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let jobs = (data ?? []) as Array<Record<string, unknown> & { run_id?: string | null }>;
  // The sheet's diagnosis lives on the RUN (storeDiagnosis → result_json.diagnosis),
  // not on the job — attach it so a reuse lookup sees title / questions / gap per section.
  if (paper && jobs.length) {
    const runIds = Array.from(new Set(jobs.map(j => j.run_id).filter((x): x is string => !!x)));
    const { data: runs } = await sb.from('paper_marking_runs').select('id, result_json').in('id', runIds);
    const byRun = new Map<string, unknown>();
    for (const r of (runs ?? []) as Array<{ id: string; result_json: { diagnosis?: unknown } | null }>) {
      byRun.set(r.id, r.result_json?.diagnosis ?? null);
    }
    jobs = jobs.map(j => ({ ...j, diagnosis: j.run_id ? byRun.get(j.run_id) ?? null : null }));
  }
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { runId?: string; runIds?: unknown; focus?: string; remark?: boolean; action?: string; by?: string; id?: string; result?: unknown; error?: string ; stage?: string; instructions?: string; pdfPath?: string; source?: string };
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
  // Copy a finished job's sheet into the run's store on demand — the backfill
  // for sheets filed before 7 Sep 2026 (they were only archived at release).
  if (body.action === 'archive-sheet') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: job, error } = await sb.from('sheet_jobs').select('id, run_id, status, result').eq('id', body.id).maybeSingle<SheetJob>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 });
    const r = (job.result || null) as SheetFiledResult | null;
    if (!r || isNoSheet(r)) return NextResponse.json({ error: 'this job has no sheet to archive' }, { status: 409 });
    const out = await archiveSheetToStore(job.run_id, { pdfPath: r.pdf_path, docxPath: r.docx_path }, 'done');
    return out.ok
      ? NextResponse.json({ ok: true, runId: job.run_id, archive: out.archive })
      : NextResponse.json({ error: out.error }, { status: 502 });
  }
  // ✏️ REVISE (8 Sep 2026 — Adrian: "changes to be made just to a certain
  // section, a certain example, a certain phrasing… can this be done?"). The
  // same revision round the example check uses, driven by a person's words: the
  // finished sheet goes back to the worker with `result.revise.instructions`,
  // and the worker changes only what the note names, re-verifies, and re-files
  // a new version. Addressed by job id (the desk) or by runId (the bot after a
  // page re-mark — it picks the paper's latest filed sheet). Held practice items
  // from the old filing are dropped; the re-file writes fresh ones.
  if (body.action === 'revise') {
    const instructions = String(body.instructions || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!instructions) return NextResponse.json({ error: 'say what to change' }, { status: 400 });
    let job: SheetJob | null = null;
    if (body.id) {
      ({ data: job } = await sb.from('sheet_jobs').select('*').eq('id', body.id).maybeSingle<SheetJob>());
    } else if (body.runId) {
      ({ data: job } = await sb.from('sheet_jobs').select('*')
        .eq('run_id', body.runId).eq('status', 'done')
        .order('created_at', { ascending: false }).limit(1).maybeSingle<SheetJob>());
    } else {
      return NextResponse.json({ error: 'id or runId required' }, { status: 400 });
    }
    if (!job) return NextResponse.json({ error: 'no filed sheet to revise' }, { status: 404 });
    if (job.status !== 'done') return NextResponse.json({ error: `that sheet is ${job.status} — revise it once it is filed` }, { status: 409 });
    const stored = (job.result || {}) as SheetFiledResult & { revise?: { round?: number } };
    if (isNoSheet(stored) || !stored.docx_path) return NextResponse.json({ error: 'this job has no sheet to revise' }, { status: 409 });
    const round = Number(stored.revise?.round || 0) + 1;
    const source = body.source === 'page-remark' ? 'page-remark' : 'adrian';
    const { data: done, error } = await sb.from('sheet_jobs').update({
      status: 'queued', claimed_by: null, claimed_at: null, heartbeat_at: null, attempts: 0, completed_at: null,
      auto_release_at: null, auto_released_at: null,
      stage: `revise ${round} (${source === 'adrian' ? 'Adrian' : 'page re-mark'}): ${instructions.slice(0, 60)}${instructions.length > 60 ? '…' : ''}`,
      result: { ...stored, revise: { round, instructions, source, requested_at: new Date().toISOString(), examples: [] } },
    }).eq('id', job.id).eq('status', 'done').select('id').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!done) return NextResponse.json({ error: 'that job changed while you typed — refresh and look again' }, { status: 409 });
    const held = await deleteHeldPracticeItems(sb, job.id);
    // Telegram gets plain maths and a whole sentence (Adrian, 8 Sep 2026: "telegram
    // message sent cut halfway" — 200 characters of raw LaTeX).
    notify_marking(`✏️ ${job.student_name || job.airtable_student_id} — sheet sent back to the worker for a revision (${source === 'adrian' ? 'your note' : 'after a page re-mark'}):\n${clip(plainMath(instructions), 600)}`).catch(() => {});
    return NextResponse.json({ ok: true, jobId: job.id, round, heldItemsDeleted: held.deleted });
  }

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
    // A stopped sheet leaves no held Practice Again rows behind (SPEC-PORTAL-V2
    // §7). Only HELD rows go — a released item is the student's. Fail-soft.
    const held = await deleteHeldPracticeItems(sb, job!.id);
    return NextResponse.json({ ok: true, cancelled: true, wasRunning: state.running, heldItemsDeleted: held.deleted });
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
    if (!result) {
      return NextResponse.json({ error: 'result.docx_path is required — or result.noSheet with a reason' }, { status: 400 });
    }
    // ── "Nothing to teach" is a COMPLETION (Adrian, 3 Sep 2026) ───────────────
    // 89/90 with one misread, 87/90 with three careless slips: the worker was
    // right that neither paper earns practice, but `fail` was the only way to
    // close the job, so it requeued twice and alarmed on the third. A noSheet
    // done needs no files, no diagnosis and no PDF rebuild — there is no sheet
    // for the cover to follow — and its Telegram is calm.
    const noSheet = isNoSheet(result);
    // 🔁 The hand-back (SPEC-PORTAL-V2 §7): the practice questions on the sheet,
    // one per entry in sheet order. The CLEANED list is stored on the row beside
    // the file paths so the items can be rebuilt from the job if they ever need
    // to be; the rows themselves are created below, after the job is done.
    const rawQuestions = (body.result as { questions?: unknown } | null | undefined)?.questions;
    const handback = noSheet ? { questions: [], skipped: 0 } : sanitizeSheetQuestions(rawQuestions);
    const stored = handback.questions.length ? { ...result, questions: handback.questions } : result;
    // A cancelled job stays cancelled. The worker may have filed a DOCX before
    // it noticed — that file is left in Dropbox rather than deleted, but the row
    // does not flip to done and Adrian is not Telegrammed about a sheet he
    // stopped. The .neq below is what enforces it: no matching row, no update.
    const { data: job, error } = await sb.from('sheet_jobs')
      .update({
        status: 'done', result: stored, completed_at: new Date().toISOString(), error: null,
        ...(noSheet ? { stage: 'no sheet needed' } : {}),
      })
      .eq('id', body.id).neq('status', 'cancelled').select('*').maybeSingle<SheetJob>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job) return NextResponse.json({ ok: false, cancelled: true, error: 'cancelled — this sheet was stopped' }, { status: 409 });
    // Best-effort: a Telegram hiccup must not undo a finished sheet.
    if (noSheet) {
      // The student asked for this one (8 Sep 2026): the app tells them there
      // was nothing worth another go; Adrian hears it too, once.
      if (job.requested_by === 'student') {
        notify_marking(`📘 <b>${job.student_name || job.airtable_student_id}</b>${job.paper_name ? ` — ${job.paper_name}` : ''}: asked for Practice Again from the app — the worker found nothing worth practising, so no sheet goes out and the app says so.`).catch(() => {});
      }
      notify_marking(completionMessage(job, result)).catch(() => {});
      logJobRun('sheet-worker', true, `${job.student_name || job.airtable_student_id}: no sheet needed`).catch(() => {});
      return NextResponse.json({ ok: true, noSheet: true, reason: result.reason, diagnosis: false, rebuilt: false });
    }
    // ── Practice Again hands back its questions (SPEC-PORTAL-V2 §7) ───────────
    // OFF since 8 Sep 2026 (`PRACTICE_AGAIN_HANDS_BACK_QUESTIONS`, Adrian:
    // "should just be the pdf sheet") — the store writes nothing and reports
    // nothing while the flag is off; the block below is what it does when on.
    // One HELD portal_assignments row per practice question — a bank row when
    // the worker named one that exists, a `generated` row (text + answer on the
    // assignment) when it wrote the question itself. Invisible to the student
    // until Adrian's Approve & release flips them with the paper and the sheet.
    // Idempotent on (sheet_job_id, position); a bad questions[] never fails the
    // job — it is counted and reported, and the sheet is already filed.
    const held = await createHeldPracticeItems(sb, job, rawQuestions);
    if (held.error) console.warn('[sheet-jobs] practice items degraded', job.id, held.error);
    // ── The sheet goes into the private store NOW, not only at release (7 Sep
    // 2026): the bot attaches `practice_again_archive.pdf_url` as the question
    // paper when the student hands the sheet back, so the marker reads the
    // sheet's own questions instead of "marking from the working alone".
    // Fail-soft: Dropbox or storage trouble is logged; the sheet is already filed.
    // A batch sheet (10 Sep 2026) is archived onto EVERY paper it covers, so a
    // Telegram hand-in of it is read against the sheet whichever paper the bot
    // picks as the source.
    for (const rid of coveredRunIds(job)) {
      const archived = await archiveSheetToStore(rid, { pdfPath: result.pdf_path, docxPath: result.docx_path }, 'done');
      if (!archived.ok) console.warn('[sheet-jobs] sheet archive skipped', job.id, rid, archived.error);
    }
    notify_marking(completionMessage(job, result, { heldItemsLine: held.line }))
      .then(() => sendSheetFiles(job, result))
      .catch(() => {});
    logJobRun('sheet-worker', true, `${job.student_name || job.airtable_student_id}: sheet filed${held.created || held.already ? ` · ${held.created + held.already} practice items held` : ''}`).catch(() => {});

    // ── The worked examples are re-derived by a second reader (6 Sep 2026) ────
    // Practice answers were sympy-verified by the worker; the EXAMPLES — the
    // teaching, in Adrian's voice — were not checked by anyone. A second model
    // solves each example from its question alone and compares. A different
    // final answer or a wrong line HOLDS the sheet on the desk (stage says so,
    // Telegram says which example) instead of letting it release. Fail-open:
    // a download or model hiccup records `skipped` and changes nothing.
    // MARKING_EXAMPLE_CHECK=0 turns it off.
    //
    // ── After the gates: Adrian's clock, or the student's door (8 Sep 2026) ──
    // A sheet Adrian queued from the desk keeps the 12-hour release-by-silence
    // clock — it is compulsory once it goes out, so he gets a look first. A
    // sheet the STUDENT asked for from the app goes out the moment it clears
    // the SAME gate: they are waiting for it and the paper is already theirs.
    // A gate failure holds it on the desk either way; the line says who asked.
    const who = job.student_name || job.airtable_student_id;
    const deskUrl = `https://www.adrianmathtuition.com/admin/desk?run=${job.run_id}`;
    const studentAsked = job.requested_by === 'student';
    const settle = async (check: GateInput['exampleCheck']) => {
      const hours = holdHours();
      const { data: runRow } = await sb.from('paper_marking_runs').select('released_at, result_json').eq('id', job.run_id).maybeSingle();
      const runJson = (runRow as { result_json?: unknown } | null)?.result_json ?? null;
      // "Grounded" is the SAME test the marking's own auto-release uses
      // (isGroundedRun): a trusted paper match OR an attached/bank/stored/mock
      // grounding. Reading paper_match.source alone held Isabelle's sheet on
      // 9 Sep 2026 — her 8 pages were working only, so the fingerprint rung
      // said 'none', while the library had attached the real GCE 2024 AM P1
      // and the marker read every question from it (grounding.source
      // 'attached'). A run from before either stamp existed is unknown (null),
      // which the gate lets through.
      const stamped = !!((runJson as { paper_match?: unknown; grounding?: unknown } | null)?.paper_match
        || (runJson as { paper_match?: unknown; grounding?: unknown } | null)?.grounding);
      const gate = autoReleaseGate({
        noSheet: false, verified: result.verified, wave: result.wave, exampleCheck: check,
        grounded: stamped ? isGroundedRun(runJson) : null,
        paperHold: computeAutoHold(runJson).reasons,
      });
      // The desk shows this beside the (missing) timer, so "I don't see the
      // timer" (Adrian, 8 Sep 2026) has an answer on the page itself.
      await sb.from('sheet_jobs').update({ result: { ...stored, example_check: check, auto_release_gate: { ok: gate.ok, hours, reasons: gate.reasons } } }).eq('id', job.id);
      if (studentAsked) {
        if (!gate.ok) {
          await sb.from('sheet_jobs').update({ stage: `held — ${gate.reasons[0]}` }).eq('id', job.id);
          notify_marking(requestedHeldLine(who, job.paper_name, gate.reasons, deskUrl)).catch(() => {});
          return;
        }
        const sent = await deliverRequestedSheet(req, job.run_id);
        if (sent.ok) {
          await sb.from('sheet_jobs').update({ auto_released_at: new Date().toISOString(), stage: 'sent — the student asked for it' }).eq('id', job.id);
          notify_marking(requestedSentLine(who, job.paper_name, gate.watch)).catch(() => {});
        } else {
          await sb.from('sheet_jobs').update({ stage: `send stopped — ${sent.error.slice(0, 120)}` }).eq('id', job.id);
          notify_marking(requestedStoppedLine(who, job.paper_name, sent.error, deskUrl)).catch(() => {});
        }
        return;
      }
      if (hours > 0 && gate.ok) {
        const at = new Date(Date.now() + hours * 3600_000).toISOString();
        await sb.from('sheet_jobs').update({ auto_release_at: at, held_at: null, stage: `auto-release at ${at}` }).eq('id', job.id);
        notify_marking(scheduledLine(at, deskUrl, who, job.paper_name, gate.watch)).catch(() => {});
      } else if (hours > 0) {
        notify_marking(heldLine(who, job.paper_name, gate.reasons, deskUrl)).catch(() => {});
      }
    };
    if (process.env.MARKING_EXAMPLE_CHECK !== '0' && result.docx_path && process.env.ANTHROPIC_API_KEY) {
      try {
        const buf = await downloadFile(result.docx_path);
        const zip = await JSZip.loadAsync(buf);
        const xml = await zip.file('word/document.xml')?.async('string');
        const examples = extractExamples(docxXmlToText(xml || ''));
        const model = process.env.MARKING_EXAMPLE_CHECK_MODEL || 'claude-sonnet-5';
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const check = await runExampleCheck(examples, async (prompt) => {
          // 12k: five examples solved from scratch ran past 4k and the JSON never
          // came, which the check recorded as zero examples (7 Sep 2026).
          const msg = await anthropic.messages.create({ model, max_tokens: 12000, messages: [{ role: 'user', content: prompt }] });
          return msg.content.map(c => (c.type === 'text' ? c.text : '')).join('');
        }, model);
        const nDis = check.disagreements.length;
        const lines = check.disagreements.map(d => `Example ${d.example}: ${d.issue || 'final answer differs'}`).join('\n');
        // ROUNDS, NOT A HOLD (Adrian, 6 Sep 2026: "why not just rewrite the solution
        // and check again until it passes, or choose another example"): a
        // disagreement sends the job BACK to the worker as a revision round —
        // rewrite or replace only the named examples, keep the rest, re-file, and
        // this check runs again on the new file. Two rounds; a sheet that still
        // disagrees after that is held for Adrian. `attempts` resets on a revision
        // so the crash cap keeps counting crashes, not rounds.
        const prevRound = Number((stored as { revise?: { round?: number } }).revise?.round || 0);
        const MAX_REVISIONS = 2;
        if (nDis > 0 && prevRound < MAX_REVISIONS) {
          const round = prevRound + 1;
          await sb.from('sheet_jobs').update({
            status: 'queued', claimed_by: null, claimed_at: null, heartbeat_at: null, attempts: 0, completed_at: null,
            stage: `revise ${round}/${MAX_REVISIONS} — example check: ${nDis} disagreement${nDis === 1 ? '' : 's'}`,
            result: { ...stored, example_check: check, revise: { round, examples: check.disagreements.map(d => ({ example: d.example, issue: d.issue })) } },
          }).eq('id', job.id);
          notify_marking(`🔁 ${who} — sheet sent back to the worker (round ${round}/${MAX_REVISIONS}): a second reader disagrees with ${nDis} worked example${nDis === 1 ? '' : 's'}.\n${lines}`).catch(() => {});
          console.log(`[sheet-jobs] example check ${job.id}: ${nDis} disagreement(s) → revision round ${round}`);
          return NextResponse.json({ ok: true, revise: { round, examples: check.disagreements }, diagnosis: false, rebuilt: false });
        }
        const held = nDis > 0;
        await sb.from('sheet_jobs').update({
          result: { ...stored, example_check: check },
          ...(held ? { stage: `held — example check: ${nDis} disagreement${nDis === 1 ? '' : 's'} after ${MAX_REVISIONS} rewrites` } : {}),
        }).eq('id', job.id);
        if (held) {
          notify_marking(`⚠️ ${who} — the sheet is HELD: after ${MAX_REVISIONS} rewrites a second reader still disagrees with ${nDis} worked example${nDis === 1 ? '' : 's'}.\n${lines}\nFix on the desk before release.`).catch(() => {});
        } else {
          // ── Release by silence (Adrian, 6 Sep 2026: "12 hours") ──────────────
          // The sheet passed its gates: Adrian's sheets are scheduled to go out
          // after the hold window (Telegram says when, the desk shows the
          // countdown and a Hold button, /api/cron/sheet-auto-release does the
          // release; SHEET_AUTO_RELEASE_HOURS=0 turns that off); a student's
          // sheet goes out now. Both in `settle` above.
          await settle(check);
        }
        console.log(`[sheet-jobs] example check ${job.id}: ${check.checked} checked, ${check.disagreements.length} disagreement(s)${check.skipped ? ` (${check.skipped})` : ''}`);
      } catch (e) {
        console.warn('[sheet-jobs] example check skipped:', job.id, (e as Error).message);
        // The check is fail-open, and a student is waiting: settle through the
        // gate with the check recorded as not run (the gate holds on that, so
        // Adrian hears why rather than the student hearing nothing).
        if (studentAsked) await settle({ checked: 0, disagreements: [], skipped: `example check did not run: ${(e as Error).message.slice(0, 80)}` }).catch(err => console.warn('[sheet-jobs] settle failed:', job.id, (err as Error).message));
      }
    } else if (studentAsked) {
      // No second reader configured: the gate says so and holds it for Adrian.
      await settle(null).catch(err => console.warn('[sheet-jobs] settle failed:', job.id, (err as Error).message));
    }

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
      // The marker's part-level kinds gate what the cover leads with (Adrian,
      // 10 Sep 2026, Isabelle's AM 2024 P1: the sheet opened on a stationary-
      // point method she already had — the marks went to a V copied wrongly).
      // applyPracticeFocus reads them off the run, so fetch it once here and
      // hand the same blob to the store.
      const { data: runRow } = await sb.from('paper_marking_runs')
        .select('result_json').eq('id', job.run_id).maybeSingle<{ result_json: unknown }>();
      // A batch sheet (10 Sep 2026): each covered paper's cover reads only the
      // skills that name it (`runs` on the entry); the primary keeps everything
      // unnamed. A single-paper sheet reads exactly as before.
      const covered = coveredRunIds(job);
      const whole = covered.length > 1 ? normaliseDiagnosis(rawDiagnosis, { sheetJobId: job.id }) : null;
      const perRun = whole ? splitDiagnosisByRun(whole.skills, covered) : null;
      const diagnosis = perRun
        ? ((perRun.get(job.run_id) ?? []).length ? normaliseDiagnosis(perRun.get(job.run_id), { sheetJobId: job.id, resultJson: runRow?.result_json }) : null)
        : normaliseDiagnosis(rawDiagnosis, { sheetJobId: job.id, resultJson: runRow?.result_json });
      if (perRun) {
        for (const rid of covered.slice(1)) {
          const skills = perRun.get(rid) ?? [];
          if (!skills.length) continue;
          const { data: other } = await sb.from('paper_marking_runs').select('result_json').eq('id', rid).maybeSingle<{ result_json: unknown }>();
          const d = normaliseDiagnosis(skills, { sheetJobId: job.id, resultJson: other?.result_json });
          if (d) await storeDiagnosis(rid, d, other?.result_json);
        }
      }
      if (!diagnosis) {
        console.warn('[sheet-jobs] diagnosis ignored — malformed', job.id, JSON.stringify(rawDiagnosis).slice(0, 300));
        rebuild = { rebuilt: false, skipped: 'diagnosis malformed — ignored' };
      } else {
        diagnosisStored = await storeDiagnosis(job.run_id, diagnosis, runRow?.result_json);
        // A ① section the gate demoted: the sheet still teaches it, the cover
        // does not lead with it — tell Adrian, so he can ✏️ Revise if he agrees.
        const demoted = diagnosis.skills.filter(s => s.slipOnly);
        if (demoted.length) {
          const what = demoted.map(s => `${s.title}${s.questions.length ? ` (${s.questions.join(', ')})` : ''}`).join('; ');
          notify_marking(`⚠️ ${who} — the sheet teaches a slip: ${what}. The marker's kinds say the method was right there (arithmetic / copied wrongly / sign / rounding), so the cover leads with the next skill. The sheet still has the section — ✏️ Revise it if you agree.`).catch(() => {});
        }
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
    return NextResponse.json({
      ok: true, diagnosis: diagnosisStored, rebuilt: rebuild.rebuilt, rebuild,
      practiceItems: { created: held.created, already: held.already, bank: held.bank, generated: held.generated, skipped: held.skipped, ...(held.error ? { error: held.error } : {}) },
    });
  }

  // ── Adrian: hold / resume an auto-release (6 Sep 2026) ────────────────────
  // 📘 SEND NOW (Adrian, 9 Sep 2026 — eleven written sheets sat unsent because
  // the desk had no button for a sheet whose paper had already gone out; the
  // clock's cron was the only sender). The same call the clock makes, from a
  // tap: release-with-sheet attaches the sheet to the released paper (From
  // Adrian row + the student's Telegram) without releasing the paper again.
  if (body.action === 'send') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: j } = await sb.from('sheet_jobs').select('id, status, run_id, result, auto_released_at').eq('id', body.id).maybeSingle<SheetJob>();
    if (!j) return NextResponse.json({ error: 'no such sheet job' }, { status: 404 });
    if (j.status !== 'done') return NextResponse.json({ error: `that sheet is ${j.status} — send it once it is filed` }, { status: 409 });
    if (isNoSheet(j.result as SheetJobResult)) return NextResponse.json({ error: 'this job has no sheet to send' }, { status: 409 });
    const fwd: Record<string, string> = { 'Content-Type': 'application/json' };
    const auth = req.headers.get('authorization'); const cookie = req.headers.get('cookie');
    if (auth) fwd.Authorization = auth; if (cookie) fwd.cookie = cookie;
    const r = await fetch(`${req.nextUrl.origin}/api/admin/release-with-sheet`, { method: 'POST', headers: fwd, body: JSON.stringify({ runId: j.run_id, pdfPath: body.pdfPath || undefined }) });
    const d = await r.json().catch(() => ({} as { error?: string; assignmentId?: string | null; candidates?: unknown }));
    if (!r.ok) return NextResponse.json({ error: d.error || `HTTP ${r.status}`, candidates: d.candidates }, { status: r.status });
    await sb.from('sheet_jobs').update({ auto_released_at: new Date().toISOString(), held_at: null, auto_release_at: null, stage: 'sent from the desk' }).eq('id', j.id);
    return NextResponse.json({ ok: true, sent: true, assignmentId: d.assignmentId ?? null });
  }

  if (body.action === 'hold' || body.action === 'unhold') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: j } = await sb.from('sheet_jobs').select('id, status, run_id, auto_release_at, held_at').eq('id', body.id).maybeSingle();
    if (!j) return NextResponse.json({ error: 'no such sheet job' }, { status: 404 });
    if (body.action === 'hold') {
      await sb.from('sheet_jobs').update({ held_at: new Date().toISOString(), auto_release_at: null, stage: 'held by Adrian — release from the desk' }).eq('id', body.id);
      return NextResponse.json({ ok: true, held: true });
    }
    const at = new Date(Date.now() + holdHours() * 3600_000).toISOString();
    await sb.from('sheet_jobs').update({ held_at: null, auto_release_at: at, stage: `auto-release at ${at}` }).eq('id', body.id);
    return NextResponse.json({ ok: true, held: false, autoReleaseAt: at });
  }

  if (body.action === 'fail') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const msg = String(body.error || 'unknown').slice(0, 500);
    const { data: job } = await sb.from('sheet_jobs').select('*').eq('id', body.id).single<SheetJob>();
    // A worker reporting failure on a job Adrian cancelled must not put it back
    // on the queue — 'failed' requeues, which is exactly the trap that made a
    // hand-written DELETE the only way to stop one.
    if (job?.status === 'cancelled') return NextResponse.json({ ok: true, cancelled: true, requeued: false });
    // "Nothing to teach" reported as a FAILURE is still a completion (Adrian,
    // 5 Sep 2026: "if there is nothing to teach, don't create the sheet — just
    // give a note"). The worker prompt says so, but a Mac running a stale copy
    // of it alarmed "failed 3×" for Kassandra's 87/90 this morning. Whatever the
    // worker called it, a no-gap verdict closes the job calmly, first time.
    if (job && NO_SHEET_RE.test(msg)) {
      const result = { noSheet: true as const, reason: msg.slice(0, 300) };
      await sb.from('sheet_jobs')
        .update({ status: 'done', result, stage: 'no sheet needed', completed_at: new Date().toISOString(), error: null, claimed_by: null, claimed_at: null, heartbeat_at: null })
        .eq('id', body.id);
      notify_marking(completionMessage(job, result)).catch(() => {});
      logJobRun('sheet-worker', true, `${job.student_name || job.airtable_student_id}: no sheet needed`).catch(() => {});
      return NextResponse.json({ ok: true, noSheet: true, reason: result.reason, requeued: false });
    }
    const spent = (job?.attempts ?? 0) >= MAX_ATTEMPTS;
    await sb.from('sheet_jobs')
      .update({ status: spent ? 'failed' : 'queued', error: msg, claimed_by: null, claimed_at: null, heartbeat_at: null })
      .eq('id', body.id);
    if (spent && job) {
      notify_marking(`⚠️ Self-study sheet failed ${MAX_ATTEMPTS}× for <b>${job.student_name || job.airtable_student_id}</b> (${job.paper_name || 'paper'})\n${msg}`).catch(() => {});
    }
    return NextResponse.json({ ok: true, requeued: !spent });
  }

  // ── Adrian: queue a sheet for a marked paper ──────────────────────────────
  // The guard (tagged · marked · nothing in flight) lives in lib/sheet-queue.ts
  // and is shared with the desk's auto-queue, so the two doors can never
  // disagree about which papers may have a sheet.
  // ── Adrian: ONE sheet for several ticked papers (10 Sep 2026) ────────────
  // The desk's tick: `runIds` → one batch job (lib/sheet-queue queueSheetBatch —
  // one student, one subject, ≥ 2 papers; in-flight singles are superseded).
  if (Array.isArray(body.runIds)) {
    const ids = (body.runIds as unknown[]).map(x => String(x ?? '').trim()).filter(x => /^[0-9a-f-]{36}$/i.test(x));
    if (ids.length < 2) return NextResponse.json({ error: 'Tick at least two papers for one sheet.' }, { status: 400 });
    const out = await queueSheetBatch(ids, { focus: body.focus, requestedBy: 'adrian' });
    if (!out.ok) return NextResponse.json({ error: out.message, runId: out.runId ?? null }, { status: out.http });
    return NextResponse.json({ job: out.job, cancelled: out.cancelled, runIds: out.runIds });
  }

  const runId = String(body.runId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  // `remark: true` (the bot after marking a paper again) REPLACES a sheet that
  // already existed, on the same terms it was first asked for, and queues
  // nothing for a paper that never had one (8 Sep 2026 — a sheet is written
  // only when someone asks). Any new job clears the old sheet's held practice
  // items either way (lib/sheet-queue).
  if (body.remark === true) {
    const out = await requeueSheetAfterRemark(runId, 'sheet-jobs:remark');
    if (!out.ok) {
      if (out.status === 'no-sheet') return NextResponse.json({ ok: true, job: null, note: 'no sheet existed for this paper — none queued' });
      return NextResponse.json({ error: out.message }, { status: out.http });
    }
    return NextResponse.json({ job: out.job, cancelled: out.cancelled });
  }
  // Adrian's door: a sheet he queues and releases is COMPULSORY for the
  // student — the app reminds them until it is handed in.
  const out = await queueSheetJob(runId, { focus: body.focus, requestedBy: 'adrian' });
  if (!out.ok) return NextResponse.json({ error: out.message }, { status: out.http });
  return NextResponse.json({ job: out.job });
}

/**
 * The sheet itself, behind its Telegram message (Adrian, 3 Sep 2026: "can i have
 * the link on telegram to see the learning sheet too?"). The PDF goes by URL —
 * Telegram fetches a Dropbox temporary link itself for PDFs; the DOCX is uploaded
 * as bytes (URL sends only work for PDF/ZIP). Both best-effort: the sheet is
 * already filed and the message already sent, so a Dropbox or Telegram hiccup
 * is logged and nothing else changes.
 */
async function sendSheetFiles(job: Pick<SheetJob, 'student_name' | 'paper_name'>, result: SheetFiledResult | null): Promise<void> {
  if (!result) return;
  const who = job.student_name || 'A student';
  const tag = job.paper_name ? ` (${job.paper_name})` : '';
  if (result.pdf_path) {
    try {
      await sendTelegramDocument({ url: await getTemporaryLink(result.pdf_path) }, `📘 ${who} — the sheet, PDF${tag}`, 'marking');
    } catch (e) { console.warn('[sheet-jobs] pdf to telegram failed:', (e as Error).message); }
  }
  try {
    const bytes = await downloadFile(result.docx_path);
    const filename = `${who} - ${result.docx_path.split('/').pop() || 'sheet.docx'}`;
    await sendTelegramDocument(
      { bytes, filename, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      `📝 ${who} — the editable DOCX${tag}`,
      'marking',
    );
  } catch (e) { console.warn('[sheet-jobs] docx to telegram failed:', (e as Error).message); }
}
