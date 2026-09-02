// Queueing a self-study sheet for a marked paper — the ONE guard, shared.
//
// Adrian's 📘 tap (POST /api/admin/sheet-jobs) and the desk's auto-queue
// (SPEC-MARKING-DESK.md: "a sheet job is created the moment marking finishes
// for a tagged run … untagged runs queue the sheet automatically the moment
// they get tagged") must agree on when a sheet may be queued, or the automatic
// path would queue papers the button refuses — and vice versa. The rule lives
// here once: `sheetQueueGuard` is pure and tested; `queueSheetJob` is the I/O
// wrapper both doors call.
//
// The automatic door is STRICTER than the button. Adrian may re-queue a sheet
// for a paper that already has one (a second wave, a re-cut), so the button
// only refuses while a job is in flight. The auto path fires on events that
// repeat — every re-pick of the student in the send row, every re-mark — so it
// also refuses when ANY job already exists for the run (done included) and
// when the run is already released: nothing automatic may queue the same
// sheet twice, or write one for a paper the student already has.

import { getSupabaseAdmin } from './supabase';

export type SheetQueueRun = {
  id: string;
  paper_name: string | null;
  student_id: string | null;
  student_name: string | null;
  released_at?: string | null;
  result_json: unknown;
};

export type SheetQueueJobRow = { id: string; status: string };

export type SheetQueueRefusal = {
  ok: false;
  status: 'not-found' | 'untagged' | 'no-marking' | 'released' | 'duplicate' | 'exists';
  http: 400 | 404 | 409;
  message: string;
  /** The job that already covers this paper (duplicate / exists). */
  jobId?: string;
};

export type SheetQueueOutcome =
  | { ok: true; job: Record<string, unknown> }
  | SheetQueueRefusal
  | { ok: false; status: 'error'; http: 500; message: string };

const IN_FLIGHT = new Set(['queued', 'claimed']);

/**
 * May a sheet be queued for this run? `jobs` is EVERY sheet_jobs row for the
 * run (any status). `auto` = the automatic door (stricter — see above).
 *
 * The messages are the ones /api/admin/sheet-jobs has always answered with;
 * the desk shows them verbatim.
 */
export function sheetQueueGuard(
  run: SheetQueueRun | null | undefined,
  jobs: SheetQueueJobRow[],
  opts: { auto?: boolean } = {},
): { ok: true } | SheetQueueRefusal {
  if (!run) return { ok: false, status: 'not-found', http: 404, message: 'run not found' };
  if (!run.student_id) {
    return { ok: false, status: 'untagged', http: 400, message: 'Tag this paper to a student first — a sheet needs someone to be for.' };
  }
  const results = (run.result_json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results) || !results.length) {
    return { ok: false, status: 'no-marking', http: 400, message: 'That run has no marking to diagnose yet.' };
  }
  const inFlight = (jobs || []).find(j => IN_FLIGHT.has(j.status));
  if (inFlight) {
    return { ok: false, status: 'duplicate', http: 409, message: 'A sheet for this paper is already queued.', jobId: inFlight.id };
  }
  if (opts.auto) {
    if (run.released_at) {
      return { ok: false, status: 'released', http: 409, message: 'already released — the student has this paper; queue a sheet by hand if you still want one' };
    }
    // Done, failed, cancelled: something already happened for this paper.
    // Automatic means "first time only"; a retry is Adrian's tap.
    const any = (jobs || []).find(j => j.status !== 'cancelled') ?? (jobs || [])[0];
    if (any) {
      return { ok: false, status: 'exists', http: 409, message: `a sheet job already exists for this paper (${any.status})`, jobId: any.id };
    }
  }
  return { ok: true };
}

/** The sheet_jobs row to insert — the shape the worker's `next` claim reads. */
export function sheetJobInsert(run: SheetQueueRun, focus: string | null | undefined) {
  return {
    run_id: run.id,
    airtable_student_id: run.student_id as string,
    student_name: run.student_name || '',
    paper_name: run.paper_name || '',
    focus: focus ? String(focus).slice(0, 300) : null,
  };
}

/**
 * Queue a sheet for a run, guard and all. Never throws — the outcome says what
 * happened, with the HTTP status the button route answers.
 */
export async function queueSheetJob(
  runId: string,
  opts: { focus?: string | null; auto?: boolean } = {},
): Promise<SheetQueueOutcome> {
  try {
    const sb = getSupabaseAdmin();
    const { data: run, error: runErr } = await sb.from('paper_marking_runs')
      .select('id, paper_name, student_id, student_name, released_at, result_json')
      .eq('id', runId).maybeSingle<SheetQueueRun>();
    if (runErr) return { ok: false, status: 'error', http: 500, message: runErr.message };

    const { data: jobs, error: jobErr } = await sb.from('sheet_jobs')
      .select('id, status').eq('run_id', runId);
    if (jobErr) return { ok: false, status: 'error', http: 500, message: jobErr.message };

    const gate = sheetQueueGuard(run, (jobs ?? []) as SheetQueueJobRow[], { auto: opts.auto });
    if (!gate.ok) return gate;

    const { data: job, error } = await sb.from('sheet_jobs')
      .insert(sheetJobInsert(run as SheetQueueRun, opts.focus)).select('*').single();
    if (error) return { ok: false, status: 'error', http: 500, message: error.message };
    return { ok: true, job: job as Record<string, unknown> };
  } catch (e) {
    return { ok: false, status: 'error', http: 500, message: (e as Error).message };
  }
}

/**
 * The automatic door, fail-soft: log the outcome and move on. Called from the
 * places a run becomes "marked AND tagged" — never awaited on a response path
 * that could otherwise fail (next/server `after()` at every call site).
 */
export async function autoQueueSheet(runId: string, source: string): Promise<SheetQueueOutcome> {
  const out = await queueSheetJob(runId, { auto: true });
  if (out.ok) console.log(`[sheet-queue] auto-queued sheet for ${runId} (${source})`);
  else if (out.status === 'error') console.warn(`[sheet-queue] auto-queue failed for ${runId} (${source}):`, out.message);
  // Refusals are the normal case on repeat events — quiet.
  return out;
}
