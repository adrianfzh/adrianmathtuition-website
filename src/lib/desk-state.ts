// The marking desk's state machine — /admin/desk (SPEC-MARKING-DESK.md).
//
// Adrian, 2 Sep 2026: "now i have 3 places to look at for marking — mark paper,
// triage, and papers, it's complicated and not user friendly." The desk is one
// queue of papers moving through four lanes and one detail view where he vets
// the script and the sheet side by side and presses Approve & release.
//
// Every lane is DERIVED, never stored: a run's lane is a function of columns it
// already has (student_id, released_at) and the newest live sheet_jobs row. So
// there is nothing to migrate, nothing to backfill, and nothing that can drift
// from what triage / the papers library already show.
//
// Pure (no I/O) and unit-tested — the two routes only orchestrate. "Approve is
// allowed" reasons are computed here too, so the button and the release route
// can never disagree about why a paper is held.

import { amendedCopyIsNewer, isAlreadyAttached, pickAmendedCopy, type FolderEntry } from './paper-folder';
import { readNoSheet } from './sheet-jobs';

export type DeskLane = 'untagged' | 'awaiting-sheet' | 'ready' | 'released';

export const DESK_LANES: readonly DeskLane[] = ['untagged', 'awaiting-sheet', 'ready', 'released'];

/** What the tab says. */
export const LANE_LABEL: Record<DeskLane, string> = {
  untagged: 'Needs a student',
  'awaiting-sheet': 'Marked, sheet on the way',
  ready: 'Ready to vet',
  released: 'Released',
};

/** The run columns the lane rules read. */
export type DeskRun = {
  student_id?: string | null;
  released_at?: string | null;
  annotated_pdf_url?: string | null;
  checked_at?: string | null;
  result_json?: unknown;
};

/** The newest live sheet_jobs row for the run (see latestLiveJob), or none. */
export type DeskSheetJob = {
  status: string;
  /** The worker's heartbeat label — diagnosing · drafting · verifying · rendering · filing. */
  stage?: string | null;
  error?: string | null;
  /** The completion payload as stored — `{ noSheet, reason }` when there was nothing to teach. */
  result?: unknown;
} | null | undefined;

/** Adrian's own "Marked (Adrian).pdf" in the paper's Dropbox folder, vs what the run carries. */
export type AmendedStatus =
  /** No such file in the folder. */
  | 'none'
  /** One exists, and it is already the attached copy — or older than what is attached. */
  | 'found'
  /** One exists and would replace the attached copy on release (or nothing is attached). */
  | 'newer-than-attached'
  /** Dropbox could not be read — decide nothing from this. */
  | 'unknown';

export type AmendedCopy = {
  status: AmendedStatus;
  name?: string;
  path?: string;
  modified?: string | null;
};

/**
 * The newest sheet job that still MEANS something. A cancelled job is "I changed
 * my mind" — it never happened, so it must not hide the finished sheet behind it
 * (re-queue by mis-tap, cancel: the paper is still ready to vet).
 */
export function latestLiveJob<T extends { status: string; created_at: string }>(jobs: T[]): T | null {
  const live = (jobs || []).filter(j => j && j.status !== 'cancelled');
  if (!live.length) return null;
  live.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return live[0];
}

/** Which lane a run sits in. Released outranks everything; untagged next; then the sheet decides. */
export function laneFor(run: DeskRun, latestSheetJob: DeskSheetJob): DeskLane {
  if (run.released_at) return 'released';
  if (!run.student_id) return 'untagged';
  if (latestSheetJob && latestSheetJob.status === 'done') return 'ready';
  return 'awaiting-sheet';
}

/**
 * A FINISHED job whose answer was "there is nothing here worth practising"
 * (sheet_jobs.result.noSheet — see lib/sheet-jobs.ts). Only a `done` job counts:
 * a queued or claimed row has not concluded anything yet.
 */
export function noSheetOf(job: DeskSheetJob): { noSheet: boolean; reason: string } {
  if (!job || job.status !== 'done') return { noSheet: false, reason: '' };
  return readNoSheet(job.result);
}

/** The reason, short enough to sit in a queue row. */
function shortReason(reason: string, max = 64): string {
  const r = reason.trim();
  return r.length > max ? `${r.slice(0, max - 1).trimEnd()}…` : r;
}

/** The row's sheet column, as a phrase. */
export function sheetStageLabel(job: DeskSheetJob): string {
  if (!job) return 'no sheet yet';
  switch (job.status) {
    case 'queued': return 'queued';
    case 'claimed': return `${(job.stage || 'drafting').trim()}…`;
    case 'done': {
      const { noSheet, reason } = noSheetOf(job);
      return noSheet ? `no sheet needed — ${shortReason(reason)}` : 'sheet ready';
    }
    case 'failed': return `failed: ${(job.error || 'unknown').trim()}`;
    case 'cancelled': return 'cancelled';
    default: return job.status;
  }
}

/** result_json.pdf_stale — a mark was overridden after the PDF was drawn. */
export function pdfStaleOf(run: Pick<DeskRun, 'result_json'>): boolean {
  const rj = run.result_json;
  return !!(rj && typeof rj === 'object' && (rj as { pdf_stale?: unknown }).pdf_stale);
}

/** Does the folder's amended copy make a stale PDF safe to release? Only a NEWER copy does. */
function amendedResolvesStale(amended: AmendedStatus): boolean {
  return amended === 'newer-than-attached';
}

/**
 * Why "Release without sheet" is disabled — the gates the mark-triage `release`
 * action enforces, phrased for the button. Empty = the paper itself can go.
 */
export function releaseBlockers(run: DeskRun, pending: number, amended: AmendedStatus): string[] {
  const out: string[] = [];
  if (run.released_at) return ['already released'];
  if (!run.student_id) out.push('tag the paper to a student first');
  if (pending > 0) {
    out.push(`${pending} question${pending === 1 ? '' : 's'} still need${pending === 1 ? 's' : ''} review — Agree or Override each one`);
  }
  if (pdfStaleOf(run) && !amendedResolvesStale(amended)) {
    out.push(
      amended === 'unknown'
        ? 'a mark was overridden after the PDF was drawn, and Dropbox could not be checked for your amended copy — try again, or Rebuild PDFs'
        : 'a mark was overridden after the PDF was drawn, so it prints the old total — save "Marked (Adrian).pdf" into the folder, or Rebuild PDFs',
    );
  }
  return out;
}

/**
 * Why "Approve & release" is disabled: everything releaseBlockers says, plus the
 * sheet must be finished — the whole point of the desk is that marks and the
 * practice that goes with them reach the student together.
 *
 * A `done` job whose answer was "nothing to teach" (`result.noSheet`) is
 * FINISHED, so it blocks nothing: the paper goes out on its own, and the button
 * says so. Pinned in the tests — a future edit that starts demanding files here
 * would put those papers back in the trap `noSheet` exists to end.
 */
export function approveBlockers(run: DeskRun, sheetJob: DeskSheetJob, pending: number, amended: AmendedStatus): string[] {
  const out = releaseBlockers(run, pending, amended);
  if (run.released_at) return out;
  if (!sheetJob) out.push('no self-study sheet yet — queue one');
  else if (sheetJob.status === 'queued') out.push('the self-study sheet is still queued');
  else if (sheetJob.status === 'claimed') out.push(`the self-study sheet is being written (${(sheetJob.stage || 'drafting').trim()})`);
  else if (sheetJob.status === 'failed') out.push('the self-study sheet failed — retry it');
  else if (sheetJob.status !== 'done') out.push(`the self-study sheet is ${sheetJob.status} — queue a new one`);
  return out;
}

/** The ⚠ flags a queue row carries. */
export function deskFlags(run: DeskRun, sheetJob: DeskSheetJob, amended: AmendedStatus | null | undefined): string[] {
  const out: string[] = [];
  if (pdfStaleOf(run)) out.push('PDF shows the old total');
  if (sheetJob?.status === 'failed') out.push('sheet failed');
  if (amended === 'newer-than-attached' && run.annotated_pdf_url) out.push('your copy in Dropbox is newer than the attached one');
  return out;
}

/** The tab to open first: Ready to vet when there is anything in it, else the waiting lane. */
export function defaultLane(counts: Partial<Record<DeskLane, number>>): DeskLane {
  return (counts.ready ?? 0) > 0 ? 'ready' : 'awaiting-sheet';
}

/**
 * Classify the folder's "Marked (Adrian)*.pdf" against the run. Reuses the
 * paper-folder rules the release path attaches with, so the desk's "My copy"
 * line predicts exactly what Approve & release will do.
 */
export function amendedStatusFor(
  run: { annotated_pdf_url?: string | null; checked_at?: string | null; result_json?: unknown },
  entries: FolderEntry[] | null | undefined,
): AmendedCopy {
  if (!entries) return { status: 'unknown' };
  const cand = pickAmendedCopy(entries);
  if (!cand) return { status: 'none' };
  const base = { name: cand.name, path: cand.path, modified: cand.modified ?? null };
  if (isAlreadyAttached(run, cand)) return { status: 'found', ...base };
  return { status: amendedCopyIsNewer(run, cand) ? 'newer-than-attached' : 'found', ...base };
}
