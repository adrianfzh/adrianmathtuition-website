// /api/admin/sheet-jobs — the self-study sheet queue (SPEC-TEACHING-CYCLE).
//
//   GET                          → { jobs } (newest 30)
//   POST { runId, focus? }       → { job }        queue a sheet for that marked paper
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
//
// Everything is admin-authed: the worker is a headless Claude session on
// Adrian's Mac holding the same admin bearer (identical posture to the
// plan-marking worker). Claim/lease logic is pure in lib/sheet-jobs.ts.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the marking topic (6 Sept 2026; falls back to the DM when unbound).
const notify_marking = (text: string) => sendTelegram(text, 'marking');
import { logJobRun } from '@/lib/job-log';
import {
  pickNextJob, sanitizeResult, completionMessage, cancelState, isNoSheet, MAX_ATTEMPTS,
  type SheetJob, type SheetFiledResult,
} from '@/lib/sheet-jobs';
import { sendTelegramDocument } from '@/lib/telegram';
import { downloadFile, getTemporaryLink } from '@/lib/dropbox';
import JSZip from 'jszip';
import Anthropic from '@anthropic-ai/sdk';
import { docxXmlToText, extractExamples, runExampleCheck } from '@/lib/sheet-example-check';
import { autoReleaseGate, holdHours, scheduledLine } from '@/lib/sheet-auto-release';
import { normaliseDiagnosis, type Diagnosis } from '@/lib/sheet-diagnosis';
import { rebuildRunPdfs, type RebuildOutcome } from '@/lib/rebuild-run-pdfs';
import { queueSheetJob } from '@/lib/sheet-queue';
import { sanitizeSheetQuestions } from '@/lib/practice-again';
import { createHeldPracticeItems, deleteHeldPracticeItems } from '@/lib/practice-again-store';

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
      notify_marking(completionMessage(job, result)).catch(() => {});
      logJobRun('sheet-worker', true, `${job.student_name || job.airtable_student_id}: no sheet needed`).catch(() => {});
      return NextResponse.json({ ok: true, noSheet: true, reason: result.reason, diagnosis: false, rebuilt: false });
    }
    // ── Practice Again hands back its questions (SPEC-PORTAL-V2 §7) ───────────
    // One HELD portal_assignments row per practice question — a bank row when
    // the worker named one that exists, a `generated` row (text + answer on the
    // assignment) when it wrote the question itself. Invisible to the student
    // until Adrian's Approve & release flips them with the paper and the sheet.
    // Idempotent on (sheet_job_id, position); a bad questions[] never fails the
    // job — it is counted and reported, and the sheet is already filed.
    const held = await createHeldPracticeItems(sb, job, rawQuestions);
    if (held.error) console.warn('[sheet-jobs] practice items degraded', job.id, held.error);
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
    if (process.env.MARKING_EXAMPLE_CHECK !== '0' && result.docx_path && process.env.ANTHROPIC_API_KEY) {
      try {
        const buf = await downloadFile(result.docx_path);
        const zip = await JSZip.loadAsync(buf);
        const xml = await zip.file('word/document.xml')?.async('string');
        const examples = extractExamples(docxXmlToText(xml || ''));
        const model = process.env.MARKING_EXAMPLE_CHECK_MODEL || 'claude-sonnet-5';
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const check = await runExampleCheck(examples, async (prompt) => {
          const msg = await anthropic.messages.create({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] });
          return msg.content.map(c => (c.type === 'text' ? c.text : '')).join('');
        }, model);
        const nDis = check.disagreements.length;
        const who = job.student_name || job.airtable_student_id;
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
          // The sheet passed its gates: schedule paper + sheet to go out after the
          // hold window. Telegram says when and where to hold; the desk shows the
          // countdown and a Hold button; /api/cron/sheet-auto-release does the
          // release. SHEET_AUTO_RELEASE_HOURS=0 turns the automation off.
          const hours = holdHours();
          const { data: runRow } = await sb.from('paper_marking_runs').select('released_at, result_json->paper_match->>source').eq('id', job.run_id).maybeSingle();
          const groundedSrc = (runRow as { source?: string | null } | null)?.source ?? null;
          const gate = autoReleaseGate({
            noSheet: false, verified: result.verified, wave: result.wave, exampleCheck: check,
            grounded: groundedSrc == null ? null : groundedSrc !== 'none',
          });
          if (hours > 0 && gate.ok) {
            const at = new Date(Date.now() + hours * 3600_000).toISOString();
            await sb.from('sheet_jobs').update({ auto_release_at: at, held_at: null, stage: `auto-release at ${at}` }).eq('id', job.id);
            const deskUrl = `https://www.adrianmathtuition.com/admin/desk?run=${job.run_id}`;
            notify_marking(scheduledLine(at, deskUrl)).catch(() => {});
          } else if (hours > 0) {
            notify_marking(`🖐 ${who} — the sheet waits for you on the desk (not auto-released): ${gate.reasons.join('; ')}.`).catch(() => {});
          }
        }
        console.log(`[sheet-jobs] example check ${job.id}: ${check.checked} checked, ${check.disagreements.length} disagreement(s)${check.skipped ? ` (${check.skipped})` : ''}`);
      } catch (e) {
        console.warn('[sheet-jobs] example check skipped:', job.id, (e as Error).message);
      }
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
    return NextResponse.json({
      ok: true, diagnosis: diagnosisStored, rebuilt: rebuild.rebuilt, rebuild,
      practiceItems: { created: held.created, already: held.already, bank: held.bank, generated: held.generated, skipped: held.skipped, ...(held.error ? { error: held.error } : {}) },
    });
  }

  // ── Adrian: hold / resume an auto-release (6 Sep 2026) ────────────────────
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
  const runId = String(body.runId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const out = await queueSheetJob(runId, { focus: body.focus });
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
      await sendTelegramDocument({ url: await getTemporaryLink(result.pdf_path) }, `📘 ${who} — the sheet, PDF${tag}`);
    } catch (e) { console.warn('[sheet-jobs] pdf to telegram failed:', (e as Error).message); }
  }
  try {
    const bytes = await downloadFile(result.docx_path);
    const filename = `${who} - ${result.docx_path.split('/').pop() || 'sheet.docx'}`;
    await sendTelegramDocument(
      { bytes, filename, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      `📝 ${who} — the editable DOCX${tag}`,
    );
  } catch (e) { console.warn('[sheet-jobs] docx to telegram failed:', (e as Error).message); }
}
