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
};

export type SheetQueueJobRow = { id: string; status: string; requested_by?: string | null; created_at?: string | null };

export type SheetQueueRefusal = {
  ok: false;
  status: 'not-found' | 'untagged' | 'no-marking' | 'not-released' | 'duplicate' | 'exists' | 'practice-again';
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
  opts: { requestedBy?: SheetRequestedBy } = {},
): SheetQueueRefusal | { ok: true } {
  if (!run) return { ok: false, status: 'not-found', http: 404, message: 'run not found' };
  if (!run.student_id) return { ok: false, status: 'untagged', http: 400, message: 'Tag this paper to a student first — a sheet needs someone to be for.' };
  if (!run.result_json) return { ok: false, status: 'no-marking', http: 400, message: 'That run has no marking to diagnose yet.' };
  // A returned Practice Again sheet never gets a sheet of its own (Adrian,
  // 9 Sep 2026: "there should be no trigger to generate new sheets for
  // practice again sheets") — not from the desk, not from the student, not
  // from a re-mark.
  if (isPracticeAgainHandin(run)) return { ok: false, status: 'practice-again', http: 409, message: 'This is a returned Practice Again sheet — it gets no sheet of its own.' };
  const inFlight = jobs.find(j => IN_FLIGHT.has(j.status));
  if (inFlight) return { ok: false, status: 'duplicate', http: 409, message: 'A sheet for this paper is already queued.', jobId: inFlight.id };
  if (opts.requestedBy === 'student') {
    if (!run.released_at) return { ok: false, status: 'not-released', http: 409, message: 'This paper is not out yet — ask for the sheet once it is.' };
    const done = jobs.find(j => j.status === 'done');
    if (done) return { ok: false, status: 'exists', http: 409, message: 'A Practice Again sheet for this paper already exists.', jobId: done.id };
  }
  return { ok: true };
}

/** The row a new sheet job is born with. */
export function sheetJobInsert(run: SheetQueueRun, focus?: unknown, requestedBy: SheetRequestedBy = 'adrian') {
  return {
    run_id: run.id,
    airtable_student_id: run.student_id,
    student_name: run.student_name || '',
    paper_name: run.paper_name || '',
    focus: focus ? String(focus).slice(0, 300) : null,
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
  opts: { focus?: unknown; remark?: boolean; requestedBy?: SheetRequestedBy } = {},
): Promise<SheetQueueOutcome> {
  const sb = getSupabaseAdmin();
  const requestedBy: SheetRequestedBy = opts.requestedBy === 'student' ? 'student' : 'adrian';
  const { data: run } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_id, student_name, released_at, result_json')
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

  const guard = sheetQueueGuard(run, jobs, { requestedBy });
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
