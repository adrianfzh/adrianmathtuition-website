// The 🌙 marking queue's live state for /admin/ops — pure, tested.
//
// Adrian, 9 Sep 2026: *"i don't see any papers queued (how do i see them?)"*.
// Two separate faults sat behind that question, and this module fixes both.
//
// **1 · Two signals, one queue.** The bot's picker (`lib/queue-pick.js`) reads
// the `queue_status` COLUMN. The ops board derived its count from
// `result_json.queue.queued_at` instead, filtered to `total_max IS NULL`. Both
// are defensible on their own, and while they agree nobody notices — but on
// 9 Sep three rows carried `queue_status='queued'` long after the papers were
// released or archived, and the board (correctly, by its own filter) showed
// "empty". Nothing in the system rendered that column, so a row could claim to
// be queued forever and no screen would ever say so. `stale` below is exactly
// that disagreement, surfaced instead of hidden.
//
// **2 · A count is not a view.** The old row said "N papers waiting" and
// stopped. You cannot tell WHICH paper is stuck from a number, so `rows` lists
// them — oldest first, the order the picker itself uses.
//
// Nothing here writes. The queue's own truth stays in Supabase; this only reads
// it two ways and reports when the two ways disagree.

/** The columns /admin/ops selects for a queue read. */
export type QueueRunRow = {
  id: string;
  created_at: string;
  paper_name?: string | null;
  student_name?: string | null;
  queue_status?: string | null;
  total_max?: number | null;
  released_at?: string | null;
  archived_at?: string | null;
  claimed_by?: string | null;
  queue_attempts?: number | null;
  queue_failed_reason?: string | null;
  /** `result_json->queue`, the older derived signal. */
  queue?: { queued_at?: string; failed_at?: string } | null;
};

export type QueueEntry = {
  id: string;
  paper: string;
  student: string | null;
  waitingMinutes: number;
  claimedBy: string | null;
  attempts: number;
  failedReason: string | null;
};

export type QueueStaleEntry = {
  id: string;
  paper: string;
  /** Why this row cannot be real work despite saying `queued`. */
  because: 'released' | 'archived' | 'marked';
};

export type MarkingQueueState = {
  /** Papers genuinely waiting — `queue_status='queued'` and not finished. */
  pending: number;
  /** Minutes the oldest has waited, or null when nothing waits. */
  oldestMinutes: number | null;
  /** Those papers, oldest first — the picker's own order. */
  rows: QueueEntry[];
  /**
   * Rows still flagged `queued` whose paper is demonstrably finished. Never
   * work; always a bookkeeping leak worth showing, because nothing else does.
   */
  stale: QueueStaleEntry[];
};

const MINUTE = 60_000;

function name(r: QueueRunRow): string {
  return (r.paper_name || '').trim() || '(unnamed paper)';
}

/** Why a `queued` row is not real work — null when it genuinely still is. */
export function finishedBecause(r: QueueRunRow): QueueStaleEntry['because'] | null {
  if (r.released_at) return 'released';
  if (r.archived_at) return 'archived';
  // A marked paper carries a total; the picker skips it, so a queued flag on
  // one is left-over bookkeeping rather than a paper anybody is waiting for.
  if (r.total_max != null) return 'marked';
  return null;
}

export function markingQueueState(rows: QueueRunRow[], now: number = Date.now()): MarkingQueueState {
  const queued = rows.filter((r) => String(r.queue_status || '') === 'queued');

  const stale: QueueStaleEntry[] = [];
  const live: QueueRunRow[] = [];
  for (const r of queued) {
    const because = finishedBecause(r);
    if (because) stale.push({ id: r.id, paper: name(r), because });
    else live.push(r);
  }

  live.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const entries: QueueEntry[] = live.map((r) => ({
    id: r.id,
    paper: name(r),
    student: (r.student_name || '').trim() || null,
    waitingMinutes: Math.max(0, Math.round((now - new Date(r.created_at).getTime()) / MINUTE)),
    claimedBy: (r.claimed_by || '').trim() || null,
    attempts: Number(r.queue_attempts || 0),
    failedReason: (r.queue_failed_reason || '').trim() || null,
  }));

  return {
    pending: entries.length,
    oldestMinutes: entries.length ? entries[0].waitingMinutes : null,
    rows: entries,
    stale,
  };
}
