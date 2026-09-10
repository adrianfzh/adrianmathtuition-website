// lib/mark-paper-outstanding.ts — which rows of /admin/mark-paper's "Recent
// marked papers" are 🆕 Still to deal with, and which are ✓ Done.
//
// 31 Aug 2026: outstanding = a paper Adrian has not FINISHED WITH — still
// marking, or marked but neither released to the student, nor marked 👁 Seen,
// nor ticked ✓ (checked_at). A released or archived paper is done.
//
// 10 Sep 2026 (Adrian: "can queued practice sheets generation show up in
// 'still to deal with' section? so i don't have to scroll down to see who has a
// practice again sheet being generated → after generation the row can go back
// to its original position. So 'still to deal with' will show all that is
// currently processing — both marking and sheet generation"): a paper whose
// Practice Again sheet is queued, being written, or failed is outstanding too,
// wherever it sits otherwise; the moment the sheet is filed (done), cancelled or
// found unneeded the rule stops matching and the row goes back to Done.
// The desk's first tab follows the same rule (lib/desk-state.ts laneFor).

export type OutstandingRun = {
  released_at?: string | null;
  archived_at?: string | null;
  checked_at?: string | null;
  /** The newest sheet job's status for this run, as the stats feed reports it. */
  sheet_status?: string | null;
  /** The 🌙 queue record — set while a paper (or a RE-MARK of a released paper) is queued or being marked. */
  queued_at?: string | null;
  /** Null while a marking is in progress: enqueue clears it, the marking write fills it. */
  total_max?: number | null;
  queue_failed?: string | null;
};

/**
 * A marking still in motion — queued, on a Mac slot, or being assembled — for a
 * paper with no stored total. A RE-MARK of a released paper looks like this too
 * (enqueue nulls total_max and clears the results), and it belongs on the to-do
 * list while it runs (Adrian, 10 Sep 2026: "so remarks does not show? it should
 * also show"). A queue that failed for good is not in motion.
 */
export function markingInProgress(run: OutstandingRun | null | undefined): boolean {
  return !!run && !!run.queued_at && run.total_max == null && !run.queue_failed;
}

/** A sheet still in motion: queued for the Mac, being written, or failed and waiting on Adrian. */
export function sheetInProgress(run: OutstandingRun | null | undefined): boolean {
  const s = run?.sheet_status;
  return s === 'queued' || s === 'claimed' || s === 'failed';
}

/** 🆕 Still to deal with. */
export function isOutstandingRun(run: OutstandingRun): boolean {
  return (!run.released_at && !run.archived_at && !run.checked_at) || sheetInProgress(run) || markingInProgress(run);
}
