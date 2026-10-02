// ➕ Adding forgotten pages to a hand-in still waiting to be marked — the pure half.
//
// Adrian, 29 Sep 2026: "if students submit their paper for marking in the app,
// what happens if they forgot to submit a page? can they submit the missing
// pages?" → "the '+ Add pages' is good > but also inform the student you can add
// pages while paper is still in the queue". The bot owns the real decision (bot
// lib/add-pages.js, which also counts page reads a Mac slot may have saved); this
// mirror only decides whether to SHOW the button, so it may be a little generous —
// a paper that turns out to be started is refused politely by the bot.
import { isOurBlobUrl } from './blob-url';
import { keyFromUrl } from './student-files-url';

export const ADD_PAGES_MAX = 30;

export interface AddableRow {
  total_max?: number | null;
  released_at?: string | null;
  queue_status?: string | null;
  lease_until?: string | null;
  result_json?: Record<string, unknown> | null;
}

/** Show "➕ Add pages" on this paper? True while nobody has started marking it. */
export function canAddPages(row: AddableRow, now: number = Date.now()): boolean {
  if (!row || row.total_max != null || row.released_at) return false;
  const rj = (row.result_json || {}) as Record<string, any>;
  if (Array.isArray(rj.results) && rj.results.length) return false;
  const photos = Array.isArray(rj.source?.photos) ? rj.source.photos.length : 0;
  if (!photos || photos >= ADD_PAGES_MAX) return false;
  const q = rj.queue;
  if (!q) return !!rj.queued_for;               // science waiting list: not started
  if (row.queue_status === 'done' || row.queue_status === 'failed') return false;
  if (row.queue_status === 'claimed' && row.lease_until && Date.parse(row.lease_until) > now) return false;
  if (q.claimed_at || q.shards || q.handed_back_at) return false;
  if (q.external_claim && !q.external_claim.released_at) return false;
  return true;
}

/** Pages may be added this many days after a paper comes back (bot lib/add-pages ADD_AFTER_DAYS). */
export const ADD_AFTER_DAYS = 14;

export interface MarkedRow extends AddableRow {
  superseded_by?: string | null;
}

/**
 * ➕ After marking (phase 3): show "Add missing pages" on a RELEASED paper — within
 * 14 days, not re-marked since, not already being updated, and not a paper whose
 * photos were split when marked. The bot decides again when the pages arrive.
 */
export function canAddPagesAfterMarking(row: MarkedRow, now: number = Date.now()): boolean {
  if (!row || row.total_max == null || !row.released_at || row.superseded_by) return false;
  const rj = (row.result_json || {}) as Record<string, any>;
  // A marked run keeps its old queue record (queue_status 'done'); only a live one is busy.
  if (rj.queue && (row.queue_status === 'queued' || row.queue_status === 'claimed')) return false;
  const rel = Date.parse(row.released_at);
  if (Number.isFinite(rel) && now - rel > ADD_AFTER_DAYS * 86_400_000) return false;
  const photos = Array.isArray(rj.source?.photos) ? rj.source.photos.length : 0;
  const drawn = Array.isArray(rj.annotated_photos) ? rj.annotated_photos.length : photos;
  return photos > 0 && photos < ADD_PAGES_MAX && drawn === photos;
}

/** A released paper whose added pages are being marked right now (the flag stays on the record once done). */
export function pagesBeingAdded(resultJson: unknown, queueStatus: string | null | undefined): boolean {
  if (queueStatus !== 'queued' && queueStatus !== 'claimed') return false;
  const q = (resultJson as { queue?: { pages_added?: unknown } } | null)?.queue;
  return !!(q && Number(q.pages_added) > 0);
}

/**
 * Is this upload URL the student's own hand-in file? The submit-token route pins
 * every key under handins/<identity>/ (private store) or, for legacy Blob,
 * /mark-paper/portal/<identity>/ — the prefix IS the ownership proof.
 */
export function ownsHandinUrl(u: string, studentId: string): boolean {
  const key = keyFromUrl(u);
  if (key) return key.startsWith(`handins/${studentId}/`);
  if (isOurBlobUrl(u)) {
    try { return decodeURIComponent(new URL(u).pathname).startsWith(`/mark-paper/portal/${studentId}/`); } catch { return false; }
  }
  return false;
}

/** The student-facing line under a waiting paper. */
export const ADD_PAGES_HINT = 'Forgot a page? You can add pages until marking starts.';
