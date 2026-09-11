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

export type DeskLane = 'untagged' | 'awaiting-sheet' | 'ready' | 'auto' | 'released';

// The automatic lane FIRST (Adrian, 9 Sep 2026: "released by the system - not
// looked at yet should be the default tab (first tab)"): since every tagged
// paper releases itself, it is the to-do list; the three work lanes only ever
// hold a paper the automatic door refused, and the desk hides them at zero.
export const DESK_LANES: readonly DeskLane[] = ['auto', 'untagged', 'awaiting-sheet', 'ready', 'released'];
/** Lanes shown only while they hold something. */
export const LANES_HIDDEN_AT_ZERO: readonly DeskLane[] = ['untagged', 'awaiting-sheet', 'ready'];

/** What the tab says. */
export const LANE_LABEL: Record<DeskLane, string> = {
  // "Still to deal with" — Adrian's own words, 10 Sep 2026 ("when a sheet is being
  // revised, perhaps can put it back at still to deal with?"): the to-do tab holds
  // what the system released and he has not looked at, AND any paper whose sheet
  // is being revised, so a glance shows what is going on.
  auto: 'Still to deal with',
  untagged: 'Needs a student',
  // "no sheet yet" since 8 Sep 2026 — a sheet is written only when someone asks
  // (Adrian from this desk, or the student from the app after release).
  'awaiting-sheet': 'Marked, no sheet yet',
  // "In process" — Adrian, 10 Sep 2026: "why 'ready to vet' - some marked copies
  // (those handed up by students themselves) will automatically be released,
  // should be 'In Process' or something". A paper here is marked and its sheet
  // is written; the 12-hour clock sends both by itself unless something holds
  // it, and the reasons sit under the button — the tab need not shout.
  ready: 'In process',
  // "Completed" not "Released" — Adrian, 7 Sep 2026: "completed is easier to understand".
  released: 'Completed',
};

/** The run columns the lane rules read. */
export type DeskRun = {
  paper_name?: string | null;
  student_id?: string | null;
  released_at?: string | null;
  annotated_pdf_url?: string | null;
  checked_at?: string | null;
  result_json?: unknown;
  released_via?: string | null;
};

/** The newest live sheet_jobs row for the run (see latestLiveJob), or none. */
export type DeskSheetJob = {
  status: string;
  /** The worker's heartbeat label — diagnosing · drafting · verifying · rendering · filing. */
  stage?: string | null;
  error?: string | null;
  /** The completion payload as stored — `{ noSheet, reason }` when there was nothing to teach. */
  result?: unknown;
  /** Stamped when the sheet went out to the student (desk tap, the clock, or the student's own request). */
  auto_released_at?: string | null;
} | null | undefined;

/** A `portal_assignments` row filed for this paper's sheet — only the fields the desk reads. */
export type SheetAssignmentLite = {
  kind?: string | null;
  status?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  marked_at?: string | null;
  revoked_at?: string | null;
  required_at?: string | null;
};

/**
 * What happened to the sheet AFTER it was written (10 Sep 2026 — Adrian, on
 * Isabelle's row still reading "sheet ready" hours after the sheet went out: "can
 * the row reflect that information? and … indicate if sheet has been handed up?").
 * `released` — the student has it and has not handed it in; `handed-in` — a
 * hand-in is in (being marked); `marked` — the returned sheet is marked.
 * `required` — Adrian set it (compulsory, the app reminds them).
 */
export type SheetOutcome = { state: 'released' | 'handed-in' | 'marked'; at: string | null; required: boolean } | null;

/**
 * The sheet's outcome from its assignment rows. Pure. The sheet IS the newest
 * live `worksheet` row (a replaced sheet's row is revoked; the old in-app
 * question rows are not the sheet — SPEC-PORTAL-V2 §7); nothing live → null.
 */
export function sheetOutcomeOf(rows: readonly SheetAssignmentLite[] | null | undefined): SheetOutcome {
  const live = (rows ?? []).filter(a => a && a.kind === 'worksheet' && !a.revoked_at && a.status !== 'revoked');
  if (!live.length) return null;
  live.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const a = live[0];
  const required = !!a.required_at;
  if (a.status === 'marked' || a.marked_at) return { state: 'marked', at: a.marked_at ?? null, required };
  if (a.status === 'submitted' || a.submitted_at) return { state: 'handed-in', at: a.submitted_at ?? null, required };
  return { state: 'released', at: a.created_at ?? null, required };
}

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
 * (re-queue by mis-tap, cancel: the paper is still in process).
 */
export function latestLiveJob<T extends { status: string; created_at: string }>(jobs: T[]): T | null {
  const live = (jobs || []).filter(j => j && j.status !== 'cancelled');
  if (!live.length) return null;
  live.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return live[0];
}

/** Which lane a run sits in. Released outranks everything; untagged next; then the sheet decides. */
/** How long an auto-released paper waits in its own lane for a look (Adrian, 8 Sep 2026: "if i didn't do anything, the papers will just stack up.. not good"). After this it files itself under Completed; the Monday report still counts it. */
export const AUTO_LANE_DAYS = 7;
function olderThan(iso: string, days: number, now: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t > days * 86400_000;
}

/**
 * A returned Practice Again sheet, marked as a paper (Adrian, 9 Sep 2026:
 * "for practice again sheets -> should distinguish them from papers - so i can
 * tell immediately"). The bot stamps `source.paper_kind` when it attaches the
 * sheet; the name is the fallback for a run whose attachment was cleared by a
 * re-mark and not yet re-attached.
 */
export function isPracticeAgainHandin(run: DeskRun | null | undefined): boolean {
  if (!run) return false;
  const rj = run.result_json as { source?: { paper_kind?: unknown } } | null;
  if (rj && typeof rj === 'object' && rj.source && rj.source.paper_kind === 'practice-again') return true;
  return /^\s*practice again\b/i.test(String(run.paper_name || ''));
}

/**
 * Who handed the paper in (Adrian, 9 Sep 2026: "can it show if the pdf is
 * submitted by the student or by me?"). Reads the stamps each door already
 * leaves on result_json: /app/submit → `portal_submission`, the bot's /handin
 * → `telegram_handin`, the ScanSnap watcher → `scan`; anything else came in
 * through Adrian's own mark-paper page.
 */
export type HandinOrigin = 'app' | 'telegram' | 'scan' | 'adrian';
export function handinOriginOf(run: DeskRun | null | undefined): HandinOrigin {
  const rj = run?.result_json as { portal_submission?: unknown; telegram_handin?: unknown; scan?: unknown } | null | undefined;
  if (!rj || typeof rj !== 'object') return 'adrian';
  if (rj.portal_submission === true) return 'app';
  if (rj.telegram_handin && typeof rj.telegram_handin === 'object') return 'telegram';
  if (rj.scan && typeof rj.scan === 'object') return 'scan';
  return 'adrian';
}
export const HANDIN_ORIGIN_LABEL: Record<HandinOrigin, string> = {
  app: '📱 student · app',
  telegram: '💬 student · Telegram',
  scan: '📠 you · scanner',
  adrian: '🖥 you · uploaded',
};

/**
 * released_via in Adrian's words (9 Sep 2026: "auto:none — can this be more
 * descriptive? it is very cryptic"). The stored value stays as it is — the
 * report, the lanes and the bot key on it — only the desk's chip reads it out.
 */
export function releasedViaLabel(via: string | null | undefined): string {
  const v = String(via || '').trim();
  if (!v) return '';
  const auto = v.startsWith('auto:');
  const who = auto ? 'by the system' : 'by you';
  const how = auto ? v.slice(5) : v;
  const told = how === 'telegram' ? 'Telegram sent'
    : how === 'portal' ? 'told on Telegram, copy in the app'
    : how === 'none' ? 'not told — no Telegram linked'
    : how;
  return `${who} · ${told}`;
}

/**
 * A paper that is BEING MARKED (10 Sep 2026, Adrian: "would like marking practice
 * again to appear on still to deal with as well"): the to-do tab shows every
 * paper in motion, not only sheets. Read off `result_json.queue` — the 🌙 queue
 * record every queued paper carries until its marking is stored:
 *   reading    — a Mac slot holds the claim and is reading pages (progress N/M)
 *   assembling — the pages are read (the Mac handed back, or the Fly worker took
 *                the paper) and the bot is assembling the marking
 *   stuck      — the last attempt failed and the queue will retry (the error shows)
 *   queued     — waiting for a slot
 * Null for a run that is marked, or that was never queued. Pure.
 */
export type MarkingProgress = {
  state: 'queued' | 'reading' | 'assembling' | 'stuck';
  label: string;
  done: number | null;
  total: number | null;
  attempts: number;
  queuedAt: string | null;
};
export function markingProgressOf(run: { result_json?: unknown; num_photos?: number | null } | null | undefined): MarkingProgress | null {
  const rj = run?.result_json as Record<string, unknown> | null | undefined;
  if (!rj || typeof rj !== 'object') return null;
  if (Array.isArray(rj.results) && rj.results.length) return null;
  const q = rj.queue as Record<string, unknown> | null | undefined;
  if (!q || typeof q !== 'object') return null;
  const attempts = Number(q.attempts) || 0;
  const queuedAt = typeof q.queued_at === 'string' ? q.queued_at : null;
  const claim = q.external_claim as Record<string, unknown> | null | undefined;
  const prog = claim && typeof claim === 'object' ? (claim.progress as Record<string, unknown> | null | undefined) : null;
  const done = prog && Number.isFinite(Number(prog.done)) ? Number(prog.done) : null;
  const total = prog && Number.isFinite(Number(prog.total)) ? Number(prog.total) : (Number.isFinite(Number(run?.num_photos)) ? Number(run?.num_photos) : null);
  const pages = done != null && total != null ? ` · page ${done}/${total}` : '';
  const err = typeof q.last_error === 'string' ? q.last_error.trim() : '';
  // Handed back (10 Sep 2026, bot lib/handback.js): every page saved, the
  // claim released with `handed_back_at`, the bot assembles it on its next tick.
  if (claim && typeof claim === 'object' && claim.handed_back_at) {
    return { state: 'assembling', label: `💻 handed back${done != null && total != null ? ` (${done}/${total} pages)` : ''} · the bot assembles it next`, done, total, attempts, queuedAt };
  }
  if (claim && typeof claim === 'object' && !claim.released_at) {
    return { state: 'reading', label: `💻 a Mac slot is reading it${pages}`, done, total, attempts, queuedAt };
  }
  if (q.claimed_by) {
    return { state: 'assembling', label: `🌙 the bot is marking it${done != null && total != null && done > 0 ? ` from the Mac's ${done}/${total} page reads` : ''}`, done, total, attempts, queuedAt };
  }
  if (claim && typeof claim === 'object' && claim.released_at && done != null && done > 0) {
    return { state: 'assembling', label: `💻 read ${done}/${total ?? '?'} on the Mac · waiting for the bot to assemble it`, done, total, attempts, queuedAt };
  }
  if (err && attempts > 0) {
    return { state: 'stuck', label: `⚠ attempt ${attempts} failed — ${err.length > 90 ? `${err.slice(0, 89)}…` : err} · the queue retries`, done, total, attempts, queuedAt };
  }
  return { state: 'queued', label: `⏳ queued for marking${attempts > 0 ? ` · attempt ${attempts + 1} next` : ''}`, done, total, attempts, queuedAt };
}

export function laneFor(run: DeskRun, latestSheetJob: DeskSheetJob, now: number = Date.now(), opts: { quiet?: boolean } = {}): DeskLane {
  // ✏️ A released paper whose sheet is being revised comes back to the to-do tab
  // (Adrian, 10 Sep 2026: "put it back at still to deal with … then put the paper
  // back into its order once the revise sheet is done") — and, from later that
  // day, so does one whose sheet is being WRITTEN or has failed (Adrian: "so I
  // don't have to scroll down to see who has a practice again sheet being
  // generated → after generation the row can go back to its original position").
  // Once the sheet is filed the rules below place the paper exactly as before.
  if (run.released_at && (revisingOf(latestSheetJob) || sheetInProgressOf(latestSheetJob))) return 'auto';
  // A returned Practice Again sheet with nothing flagged clears itself
  // (Adrian, 9 Sep 2026: "if sheet is already handed up and marked, should
  // just clear automatically, unless something important is flagged"). The
  // caller decides `quiet` from the flags; the rule here is only the lane.
  if (run.released_at && opts.quiet) return 'released';
  // 🤖 Released by the system (8 Sep 2026): a hand-in that cleared the accuracy
  // gates and went out without Adrian. It stays in its own lane until he has
  // looked at it (checked_at) — his checkpoint moved after release, not away.
  if (run.released_at && String(run.released_via || '').startsWith('auto:') && !run.checked_at && !olderThan(run.released_at, AUTO_LANE_DAYS, now)) return 'auto';
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

/**
 * A sheet that went back to the worker for a revision and is not filed again yet
 * (sheet-jobs {action:'revise'} stamps `result.revise` and re-queues the row; the
 * stamp outlives the revision, so only a queued, running or failed job counts).
 */
export type Revising = { state: 'queued' | 'running' | 'failed'; round: number };
export function revisingOf(job: DeskSheetJob): Revising | null {
  if (!job) return null;
  const rv = (job.result as { revise?: { round?: unknown } } | null | undefined)?.revise;
  if (!rv || typeof rv !== 'object') return null;
  const round = Math.max(1, Number(rv.round) || 1);
  if (job.status === 'queued') return { state: 'queued', round };
  if (job.status === 'claimed') return { state: 'running', round };
  if (job.status === 'failed') return { state: 'failed', round };
  return null;
}

/**
 * A sheet still in motion — queued for the Mac, being written, or failed and
 * waiting on Adrian (10 Sep 2026, Adrian: "can queued practice sheets generation
 * show up in 'still to deal with' … so it will show all that is currently
 * processing — both marking and sheet generation"). A finished or cancelled job
 * is not; nor is a job that concluded "nothing to teach". Pure.
 */
export function sheetInProgressOf(job: DeskSheetJob): boolean {
  if (!job) return false;
  return job.status === 'queued' || job.status === 'claimed' || job.status === 'failed';
}

/** The chip beside a paper whose sheet is being revised. */
export function revisingLabel(r: Revising): string {
  if (r.state === 'failed') return `✏️ revision ${r.round} failed`;
  return `✏️ sheet being revised (round ${r.round})${r.state === 'queued' ? ' · waiting for the Mac' : ''}`;
}

/**
 * The row's sheet column, as a phrase. A finished sheet reads what happened to
 * it next — released · handed in · marked — when its assignment rows say so
 * (`outcome`), or "sheet sent" when only the job's own release stamp does;
 * "sheet ready" is a sheet that has not gone out yet.
 */
export function sheetStageLabel(job: DeskSheetJob, outcome?: SheetOutcome): string {
  if (!job) return 'no sheet yet';
  const rv = revisingOf(job);
  switch (job.status) {
    case 'queued': return rv ? `revision ${rv.round} queued` : 'queued';
    case 'claimed': return `${(job.stage || 'drafting').trim()}…`;
    case 'done': {
      const { noSheet, reason } = noSheetOf(job);
      if (noSheet) return `no sheet needed — ${shortReason(reason)}`;
      if (outcome) {
        const tail = outcome.required ? ' · compulsory' : '';
        if (outcome.state === 'marked') return `sheet handed in · marked${tail}`;
        if (outcome.state === 'handed-in') return `sheet handed in · being marked${tail}`;
        return `sheet released · not handed in yet${tail}`;
      }
      return job.auto_released_at ? 'sheet sent' : 'sheet ready';
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
        : 'a mark was overridden after the PDF was drawn, so it prints the old total — save "2 Marked by Adrian.pdf" into the folder, or Rebuild PDFs',
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

/** The tab to open first: In process when there is anything in it, else the waiting lane. */
export function defaultLane(counts: Partial<Record<DeskLane, number>>): DeskLane {
  // A paper the automatic door refused is the rarer, more urgent case: an
  // untagged paper reaches nobody, and a marked-but-unreleased one is waiting
  // on Adrian. Otherwise the automatic lane (9 Sep 2026).
  if ((counts.untagged ?? 0) > 0) return 'untagged';
  if ((counts.ready ?? 0) > 0) return 'ready';
  if ((counts['awaiting-sheet'] ?? 0) > 0) return 'awaiting-sheet';
  return 'auto';
}

/**
 * The order rows appear in a lane (Adrian, 7 Sep 2026: "the earliest submission
 * or the things to do should appear at the top of the list"): work lanes run
 * OLDEST first, so the paper that has waited longest is the first thing seen;
 * Released is a history and stays newest first. Ties keep their given order.
 */
export function orderLane<T extends { createdAt: string; releasedAt?: string | null; revising?: Revising | null; marking?: MarkingProgress | null }>(rows: T[], lane: DeskLane): T[] {
  // A paper whose sheet is being revised sits at the TOP of its lane while the
  // revision runs (Adrian, 10 Sep 2026: "so i have an idea of what's going on at
  // a glance") and drops back into date order the moment the sheet is filed.
  // Every lane orders by the date and time the paper was MARKED (Adrian,
  // 9 Sep 2026: "we should order by the date and time the paper was marked").
  // Work lanes and the automatic lane run oldest first — the paper that has
  // waited longest is the first thing seen; Completed is a history, newest first.
  const dir = lane === 'released' ? -1 : 1;
  return rows
    // A paper being marked pins above everything (10 Sep 2026) — it is what is
    // going on right now; a revision next; then date order.
    .map((r, i) => ({ r, i, t: Date.parse(r.createdAt) || 0, pin: r.marking ? 0 : r.revising ? 1 : 2 }))
    .sort((a, b) => a.pin - b.pin || (a.t - b.t) * dir || a.i - b.i)
    .map(x => x.r);
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

// ── The desk tick: one sheet per student PER MATHS (11 Sep 2026) ─────────────
// Adrian ticked Isabelle's three AM and two EM papers and asked: "if i ticked
// pdfs that includes both em and am, does it produce two separate worksheets
// now?" — so the ticks are grouped by maths and each group becomes its own
// sheet. Later the same day, on Joey's lone A Math paper with no tick box and
// other students' rows: "shouldn't i be able to select multiple pdfs and the
// system will be able to tell if 2 separate sheets are required? … and there
// are other people that i can select too". So: ANY marked, tagged paper can be
// ticked, whoever it belongs to; the plan groups by student and then by maths;
// a group of two or more is one merged sheet, a group of one is that paper's
// own single sheet. One student, one maths per sheet still holds — it is the
// grouping, not a refusal. Pure; the page renders the plan and posts one job
// per group.

export type TickRow = { id: string; studentId: string | null; studentName: string | null; paperSubject: string | null };
export type TickGroup = { studentId: string; student: string; subject: string; runIds: string[] };
export type TickPlan =
  | { kind: 'none' }
  /** one job per group: `runIds` (merged) when two or more, `runId` (single) when one */
  | { kind: 'ok'; groups: TickGroup[] };

export function tickPlan(rows: readonly TickRow[]): TickPlan {
  if (!rows.length) return { kind: 'none' };
  const groups = new Map<string, TickGroup>();
  for (const r of rows) {
    const studentId = r.studentId ?? '';
    const subject = r.paperSubject || 'maths';
    const k = `${studentId}|${subject}`;
    const g = groups.get(k) ?? { studentId, student: r.studentName ?? 'this student', subject, runIds: [] };
    g.runIds.push(r.id);
    groups.set(k, g);
  }
  return { kind: 'ok', groups: [...groups.values()] };
}

/** The bar's one line for a plan: "📘 2 Practice Again sheets — Joey: E Math (3 papers merged), A Math (1 paper, its own sheet)". Pure. */
export function tickPlanLine(plan: TickPlan): string {
  if (plan.kind === 'none') return '';
  const byStudent = new Map<string, TickGroup[]>();
  for (const g of plan.groups) byStudent.set(g.student, [...(byStudent.get(g.student) ?? []), g]);
  const part = (g: TickGroup) => `${g.subject} (${g.runIds.length === 1 ? '1 paper, its own sheet' : `${g.runIds.length} papers merged`})`;
  const who = [...byStudent.entries()].map(([student, gs]) => `${student}: ${gs.map(part).join(', ')}`).join(' · ');
  const n = plan.groups.length;
  return `📘 ${n === 1 ? 'One Practice Again sheet' : `${n} Practice Again sheets`} — ${who}`;
}

/**
 * The desk's student filter (Adrian, 11 Sep 2026: "can i filter by student?").
 * Case-insensitive; every word typed must start some word of the name, so
 * "isa" and "toh si" both find Isabelle Toh Si Xian and "isabelle w" finds
 * Eva Isabelle Wong but not Isabelle Toh. An empty filter matches everything;
 * a row with no name matches nothing once a filter is typed.
 */
export function matchesStudent(name: string | null | undefined, filter: string | null | undefined): boolean {
  const words = String(filter ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const parts = String(name ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  return words.every(w => parts.some(p => p.startsWith(w)));
}
