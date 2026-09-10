// Queueing a Practice Again sheet — the ONE guard behind every door.
//
// Since 8 Sep 2026 (Adrian: "allow them to request for Practice Again
// worksheets, so only generate when they request … optionally, i can generate
// for them by clicking on desk") a sheet is written only when SOMEONE ASKS:
//
//   • the STUDENT, from the marked paper in the app (`requestedBy: 'student'`)
//     — allowed once the paper is released, and only while no sheet exists;
//   • ADRIAN, from the desk (`requestedBy: 'adrian'`) — any tagged marked paper,
//     any number of times (a new sheet replaces the old one's held items).
//
// A finished marking no longer queues a sheet by itself. The only automatic
// path left is `requeueSheetAfterRemark`: a paper marked AGAIN that already
// had a sheet gets a fresh one on the same terms (same requester) — a sheet
// built on marking that no longer stands is worse than none.
import { isPracticeAgainHandin } from './desk-state';
import { getSupabaseAdmin } from './supabase';
import { deleteHeldPracticeItems } from './practice-again-store';

export type SheetRequestedBy = 'student' | 'adrian';

export type SheetQueueRun = {
  id: string;
  paper_name: string | null;
  student_id: string | null;
  student_name: string | null;
  released_at?: string | null;
  result_json: unknown;
  /** The marking lane — 'math' | 'physics' | 'chemistry' | 'biology'. Absent/null reads as math. */
  subject?: string | null;
};

export type SheetQueueJobRow = { id: string; status: string; requested_by?: string | null; created_at?: string | null };

/** A run as the batch guard sees it — the single-run fields plus when it was marked and which maths it is. */
export type SheetBatchRun = SheetQueueRun & { created_at?: string | null; paper_subject?: string | null };

export type SheetBatchRefusal = {
  ok: false;
  status: SheetQueueRefusal['status'] | 'too-few' | 'mixed-students' | 'mixed-subjects';
  http: 400 | 404 | 409;
  message: string;
  runId?: string;
};

export type SheetQueueRefusal = {
  ok: false;
  status: 'not-found' | 'untagged' | 'no-marking' | 'not-released' | 'duplicate' | 'exists' | 'practice-again' | 'science';
  http: 400 | 404 | 409;
  message: string;
  jobId?: string;
};

export type SheetQueueOutcome = SheetQueueRefusal | { ok: true; job: Record<string, unknown>; cancelled: number };

const IN_FLIGHT = new Set(['queued', 'claimed']);

/**
 * May a sheet be queued for this run? Pure — the same answer for both doors,
 * plus the student door's two extra rules (the paper must be out; a sheet that
 * already exists is not written twice — Adrian re-queues, students don't).
 */
export function sheetQueueGuard(
  run: SheetQueueRun | null | undefined,
  jobs: SheetQueueJobRow[],
  opts: { requestedBy?: SheetRequestedBy; wave?: number } = {},
): SheetQueueRefusal | { ok: true } {
  if (!run) return { ok: false, status: 'not-found', http: 404, message: 'run not found' };
  if (!run.student_id) return { ok: false, status: 'untagged', http: 400, message: 'Tag this paper to a student first — a sheet needs someone to be for.' };
  if (!run.result_json) return { ok: false, status: 'no-marking', http: 400, message: 'That run has no marking to diagnose yet.' };
  // No Practice Again for science (Adrian, 10 Sep 2026: "no practice again for
  // science") — the sheet worker writes from the MATHS bank in Adrian's maths
  // house style; a physics paper would get a maths sheet. Refused from both
  // doors, so neither the desk's 📘 Queue nor the student's Request button can
  // start one.
  if (run.subject && run.subject !== 'math') return { ok: false, status: 'science', http: 400, message: 'Practice Again is for maths papers — there is no sheet for a science paper.' };
  // A returned Practice Again sheet never gets a sheet of its own (Adrian,
  // 9 Sep 2026: "there should be no trigger to generate new sheets for
  // practice again sheets") — not from the desk, not from the student, not
  // from a re-mark.
  if (isPracticeAgainHandin(run)) return { ok: false, status: 'practice-again', http: 409, message: 'This is a returned Practice Again sheet — it gets no sheet of its own.' };
  const inFlight = jobs.find(j => IN_FLIGHT.has(j.status));
  if (inFlight) return { ok: false, status: 'duplicate', http: 409, message: 'A sheet for this paper is already queued.', jobId: inFlight.id };
  if (opts.requestedBy === 'student') {
    if (!run.released_at) return { ok: false, status: 'not-released', http: 409, message: 'This paper is not out yet — ask for the sheet once it is.' };
    // Wave two (11 Sep 2026) is the ONE case where a student may ask again for
    // a paper that already has a sheet: the first sheet shelved gaps and they
    // asked for the rest of them. It bypasses this refusal and nothing else —
    // a job still in flight above still stops it, so the two sheets are written
    // one after the other, never at once.
    const done = Number(opts.wave || 1) < 2 && jobs.find(j => j.status === 'done');
    if (done) return { ok: false, status: 'exists', http: 409, message: 'A Practice Again sheet for this paper already exists.', jobId: done.id };
  }
  return { ok: true };
}

// ── Batches — ONE sheet for several papers of one subject (10 Sep 2026) ──────
// Adrian, on Isabelle's five finished-but-unsent sheets: "instead of releasing
// all 5 sheets … have just one practice again worksheet … the same mistakes or
// the same topics may appear across all 5 worksheets, so can batch and combine
// into one — more efficient and can save students' time. but still must be
// effective and target the required gaps." For now the only door is the desk:
// he ticks the papers, one job is queued for all of them. The job keeps a
// PRIMARY run (`run_id` = the newest paper, so every one-to-one reader keeps
// working) and carries the full list in `run_ids`.

/**
 * May ONE sheet be written for these runs? Pure. At least two distinct papers,
 * one student, one subject (A Math papers with A Math papers — a mixed sheet
 * would muddle the app's per-subject view and the marker's subject brain), each
 * passing the single-run guard. A job already in flight on one of them is NOT a
 * refusal: the batch supersedes it (queueSheetBatch cancels it), the way a
 * second single sheet replaces the first. The primary is the newest paper.
 */
export function sheetBatchGuard(
  runs: (SheetBatchRun | null | undefined)[],
  opts: { requestedBy?: SheetRequestedBy } = {},
): SheetBatchRefusal | { ok: true; primary: SheetBatchRun; runs: SheetBatchRun[] } {
  const live = runs.filter((r): r is SheetBatchRun => !!r && !!r.id);
  if (live.length < runs.length) return { ok: false, status: 'not-found', http: 404, message: 'One of those papers was not found.' };
  const distinct = Array.from(new Map(live.map(r => [r.id, r])).values());
  if (distinct.length < 2) return { ok: false, status: 'too-few', http: 400, message: 'Tick at least two papers for one sheet — a single paper gets its own.' };
  for (const r of distinct) {
    const g = sheetQueueGuard(r, [], opts);
    if (!g.ok) return { ...g, runId: r.id };
  }
  if (new Set(distinct.map(r => r.student_id)).size > 1) {
    return { ok: false, status: 'mixed-students', http: 400, message: 'One sheet is for one student — the ticked papers belong to different students.' };
  }
  if (new Set(distinct.map(r => String(r.paper_subject ?? '').trim().toLowerCase())).size > 1) {
    return { ok: false, status: 'mixed-subjects', http: 400, message: 'One sheet is for one subject — tick A Math papers or E Math papers, not both.' };
  }
  const sorted = [...distinct].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  return { ok: true, primary: sorted[0], runs: sorted };
}

/** "3 papers: isabelle TYS AM 2025 P1 · isabelle TYS AM 2025 P2 · …" — the job's paper_name for a batch. Pure. */
export function batchPaperName(runs: Pick<SheetQueueRun, 'paper_name'>[]): string {
  const names = runs.map(r => String(r.paper_name || 'untitled').trim());
  return `${runs.length} papers: ${names.join(' · ')}`.slice(0, 300);
}

/** Every run a job covers — the primary first, then the rest of the batch (a single-paper job → just its run). Pure. */
export function coveredRunIds(job: { run_id: string; run_ids?: string[] | null }): string[] {
  const out: string[] = [];
  for (const id of [job.run_id, ...(Array.isArray(job.run_ids) ? job.run_ids : [])]) {
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The row a batch sheet job is born with: the primary's identity, every run in `run_ids`. */
export function sheetBatchInsert(primary: SheetBatchRun, runs: SheetBatchRun[], focus?: unknown, requestedBy: SheetRequestedBy = 'adrian') {
  return {
    ...sheetJobInsert(primary, focus, requestedBy),
    paper_name: batchPaperName(runs),
    run_ids: runs.map(r => r.id),
  };
}

/** A wave-two focus is never longer than this — the column is text, but a job row is read by eye too. */
const FOCUS_JSON_MAX = 2000;

/**
 * What a wave-two job carries in `focus` — Adrian's own instruction slot, which
 * the worker honours over its own judgement (scripts/sheet-worker/WORKER_PROMPT.md
 * §1e: "a job with `focus.wave === 2` teaches EXACTLY `focus.shelved`, nothing
 * else"). JSON, so those two field reads hold literally, with the instruction
 * spelled out inside it because a person reads this column too. Pure.
 *
 * Long shelves lose their tail rather than the string being cut — a truncated
 * JSON blob would parse as nothing at all.
 */
export function waveTwoFocus(shelved: readonly string[], wave = 2): string {
  const gaps = shelved.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 20);
  const build = (list: string[]) => JSON.stringify({
    wave,
    instruction: `The student asked for the next wave. Teach EXACTLY the gaps the last sheet shelved, nothing else; reuse its title block and file it in the same folder name with " (wave ${wave})".`,
    shelved: list,
  });
  let out = build(gaps);
  while (out.length > FOCUS_JSON_MAX && gaps.length) { gaps.pop(); out = build(gaps); }
  return out;
}

/**
 * `sheet_jobs.focus` is TEXT — the instruction the worker honours over its own
 * judgement. A caller may hand in the sentence itself, or the wave-two shape
 * `{ wave, shelved }` (the student's "ask for the next wave", 11 Sep 2026),
 * which is rendered into that sentence here rather than stored as
 * "[object Object]". Pure.
 */
export function focusText(focus: unknown): string | null {
  if (!focus) return null;
  if (typeof focus === 'string') return focus.trim().slice(0, 300) || null;
  if (typeof focus === 'object') {
    const f = focus as { wave?: unknown; shelved?: unknown };
    if (Number(f.wave) >= 2) return waveTwoFocus(Array.isArray(f.shelved) ? f.shelved.map(String) : [], Number(f.wave));
  }
  return String(focus).slice(0, 300);
}

/** The row a new sheet job is born with. */
export function sheetJobInsert(run: SheetQueueRun, focus?: unknown, requestedBy: SheetRequestedBy = 'adrian') {
  return {
    run_id: run.id,
    airtable_student_id: run.student_id,
    student_name: run.student_name || '',
    paper_name: run.paper_name || '',
    focus: focusText(focus),
    requested_by: requestedBy,
  };
}

/**
 * What a NEW sheet job does to the old ones: a re-mark cancels anything still
 * in flight (the marking it was reading is gone); every earlier job's held
 * practice items are dropped either way, so the student never gets two sheets'
 * worth of items from one paper.
 */
export function supersededByNewSheet(jobs: SheetQueueJobRow[], opts: { remark?: boolean } = {}): { cancel: string[]; clearHeld: string[] } {
  const inFlight = jobs.filter(j => IN_FLIGHT.has(j.status)).map(j => j.id);
  return { cancel: opts.remark ? inFlight : [], clearHeld: jobs.map(j => j.id) };
}

/**
 * Who a replacement sheet is for, after a re-mark: the newest job that was not
 * cancelled decides. Null when the paper never had a sheet — then a re-mark
 * queues nothing (nobody asked).
 */
export function remarkRequester(jobs: SheetQueueJobRow[]): SheetRequestedBy | null {
  const live = jobs.filter(j => j.status !== 'cancelled');
  if (live.length === 0) return null;
  const newest = [...live].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
  return newest.requested_by === 'student' ? 'student' : 'adrian';
}

/**
 * Queue a sheet for a run. Reads the run + its jobs, applies the guard, and
 * inserts. `remark: true` (a paper marked again) first cancels any job still
 * in flight so a sheet is never written from marking that no longer stands.
 */
export async function queueSheetJob(
  runId: string,
  opts: { focus?: unknown; remark?: boolean; requestedBy?: SheetRequestedBy; wave?: number } = {},
): Promise<SheetQueueOutcome> {
  const sb = getSupabaseAdmin();
  const requestedBy: SheetRequestedBy = opts.requestedBy === 'student' ? 'student' : 'adrian';
  const { data: run } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_id, student_name, released_at, result_json, subject')
    .eq('id', runId).maybeSingle<SheetQueueRun>();
  const { data: jobRows } = await sb.from('sheet_jobs')
    .select('id, status, requested_by, created_at').eq('run_id', runId);
  let jobs: SheetQueueJobRow[] = (jobRows ?? []) as SheetQueueJobRow[];

  const plan = supersededByNewSheet(jobs, { remark: opts.remark });
  if (plan.cancel.length) {
    await sb.from('sheet_jobs').update({
      status: 'cancelled', claimed_by: null, heartbeat_at: null,
      completed_at: new Date().toISOString(), error: 'superseded by a re-mark',
    }).in('id', plan.cancel);
    jobs = jobs.map(j => (plan.cancel.includes(j.id) ? { ...j, status: 'cancelled' } : j));
  }

  const guard = sheetQueueGuard(run, jobs, { requestedBy, wave: opts.wave });
  if (!guard.ok) return guard;

  const { data: job, error } = await sb.from('sheet_jobs')
    .insert(sheetJobInsert(run as SheetQueueRun, opts.focus, requestedBy)).select('*').single();
  if (error || !job) {
    return { ok: false, status: 'no-marking', http: 400, message: error?.message || 'could not queue the sheet' };
  }
  for (const id of plan.clearHeld) {
    await deleteHeldPracticeItems(sb, id).catch(() => ({ deleted: 0 }));
  }
  return { ok: true, job: job as Record<string, unknown>, cancelled: plan.cancel.length };
}

/**
 * Queue ONE sheet for several papers (the desk's tick, 10 Sep 2026). Reads the
 * runs, applies sheetBatchGuard, cancels every job still in flight on any of
 * them (a batch supersedes the singles), drops their held practice items, and
 * inserts one job with the newest paper as its primary.
 */
export async function queueSheetBatch(
  runIds: string[],
  opts: { focus?: unknown; requestedBy?: SheetRequestedBy } = {},
): Promise<SheetBatchRefusal | { ok: true; job: Record<string, unknown>; cancelled: number; runIds: string[] }> {
  const sb = getSupabaseAdmin();
  const requestedBy: SheetRequestedBy = opts.requestedBy === 'student' ? 'student' : 'adrian';
  const ids = Array.from(new Set(runIds.filter(Boolean)));
  const { data: rows } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_id, student_name, released_at, result_json, created_at, paper_subject, subject')
    .in('id', ids);
  const byId = new Map(((rows ?? []) as SheetBatchRun[]).map(r => [r.id, r]));
  const guard = sheetBatchGuard(ids.map(id => byId.get(id) ?? null), { requestedBy });
  if (!guard.ok) return guard;
  const covered = guard.runs.map(r => r.id);
  const { data: jobRows } = await sb.from('sheet_jobs')
    .select('id, status, run_id, run_ids').or(`run_id.in.(${covered.join(',')}),run_ids.ov.{${covered.join(',')}}`);
  const old = (jobRows ?? []) as { id: string; status: string }[];
  const inFlight = old.filter(j => IN_FLIGHT.has(j.status)).map(j => j.id);
  if (inFlight.length) {
    await sb.from('sheet_jobs').update({
      status: 'cancelled', claimed_by: null, heartbeat_at: null,
      completed_at: new Date().toISOString(), error: 'superseded by a batch sheet',
    }).in('id', inFlight);
  }
  const { data: job, error } = await sb.from('sheet_jobs')
    .insert(sheetBatchInsert(guard.primary, guard.runs, opts.focus, requestedBy)).select('*').single();
  if (error || !job) return { ok: false, status: 'no-marking', http: 400, message: error?.message || 'could not queue the batch sheet' };
  for (const j of old) await deleteHeldPracticeItems(sb, j.id).catch(() => ({ deleted: 0 }));
  return { ok: true, job: job as Record<string, unknown>, cancelled: inFlight.length, runIds: covered };
}

/**
 * A paper marked again: replace its sheet IF it had one — same requester, so a
 * student-requested sheet is sent again on build and Adrian's goes back to the
 * desk. A paper nobody asked a sheet for stays that way. Never throws.
 */
export async function requeueSheetAfterRemark(runId: string, source: string): Promise<SheetQueueOutcome | { ok: false; status: 'no-sheet' }> {
  try {
    const sb = getSupabaseAdmin();
    const { data: jobRows } = await sb.from('sheet_jobs')
      .select('id, status, requested_by, created_at').eq('run_id', runId);
    const requestedBy = remarkRequester((jobRows ?? []) as SheetQueueJobRow[]);
    if (!requestedBy) return { ok: false, status: 'no-sheet' };
    const out = await queueSheetJob(runId, { remark: true, requestedBy });
    if (out.ok) console.log(`[sheet-queue] ${source}: re-queued ${(out.job as { id?: string }).id} for run ${runId} (${requestedBy}, cancelled ${out.cancelled})`);
    else console.log(`[sheet-queue] ${source}: not re-queued for run ${runId} — ${out.status}: ${out.message}`);
    return out;
  } catch (e) {
    console.warn(`[sheet-queue] ${source}: re-queue failed for run ${runId}:`, (e as Error).message);
    return { ok: false, status: 'no-sheet' };
  }
}
