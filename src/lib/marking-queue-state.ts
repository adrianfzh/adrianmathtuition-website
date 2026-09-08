// The 🌙 marking queue's live state for /admin/ops — pure, tested.
//
// Adrian, 9 Sep 2026: *"i don't see any papers queued (how do i see them?)"*.
//
// **The signal.** A paper in flight carries `result_json.queue.queued_at` with no
// `failed_at`, and no total yet (`total_max IS NULL`). Completion is
// `external_claim.delivered_at` plus the total. That is what the board has always
// read and it is correct.
//
// A first version of this module replaced it with the `queue_status` COLUMN,
// because three rows carried `queue_status='queued'` while the board said empty.
// That was backwards: the normal queue path never sets that column — those three
// were leftovers — so reading it alone would have shown "empty" while papers were
// actively being marked. Both signals are kept here, each for the job it is
// actually good at:
//
//   - `result_json.queue` → what is genuinely in flight (pending, rows)
//   - `queue_status='queued'` on a finished paper → a bookkeeping leak (stale)
//
// **A count is not a view.** "N papers waiting" cannot tell you WHICH paper is
// stuck, so `rows` lists them oldest first — the picker's own order — carrying the
// claim, so a wedged slot is legible.
//
// **Who marked it.** `external_claim.by` is `mac-plan-<hostname>-<pid>`; `machine`
// below is that hostname. It identifies the Mac, NOT the Claude account — the
// worker does not record one. See docs/OPS.md § plan-marking attribution.
//
// Nothing here writes.

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
  /** `result_json->queue` — the live signal. */
  queue?: {
    queued_at?: string;
    failed_at?: string;
    attempts?: number;
    external_claim?: { at?: string; by?: string; since?: string; delivered_at?: string; attempts?: number } | null;
  } | null;
};

export type QueueEntry = {
  id: string;
  paper: string;
  student: string | null;
  waitingMinutes: number;
  /** The Mac that claimed it, from `mac-plan-<hostname>-<pid>`. Null = unclaimed. */
  machine: string | null;
  /** Minutes since the claim was taken, or null when unclaimed. */
  claimedMinutes: number | null;
  attempts: number;
};

export type QueueStaleEntry = {
  id: string;
  paper: string;
  because: 'released' | 'archived' | 'marked';
};

export type MarkingQueueState = {
  pending: number;
  oldestMinutes: number | null;
  rows: QueueEntry[];
  stale: QueueStaleEntry[];
};

const MINUTE = 60_000;

function name(r: QueueRunRow): string {
  return (r.paper_name || '').trim() || '(unnamed paper)';
}

/** `mac-plan-Adrians-MacBook-Pro-89778` → `Adrians-MacBook-Pro`. */
export function claimMachine(by: string | null | undefined): string | null {
  const s = String(by || '').trim();
  if (!s) return null;
  const m = /^mac-plan-(.+?)-\d+$/.exec(s);
  if (m) return m[1];
  return s.replace(/^mac-plan-/, '') || null;
}

/** In flight: queued, not failed, and no total yet. */
export function isInFlight(r: QueueRunRow): boolean {
  const q = r.queue;
  return !!(q && q.queued_at && !q.failed_at) && r.total_max == null;
}

/** Why a `queue_status='queued'` row is not real work — null when it still is. */
export function finishedBecause(r: QueueRunRow): QueueStaleEntry['because'] | null {
  if (r.released_at) return 'released';
  if (r.archived_at) return 'archived';
  if (r.total_max != null) return 'marked';
  return null;
}

function minsSince(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / MINUTE));
}

export function markingQueueState(rows: QueueRunRow[], now: number = Date.now()): MarkingQueueState {
  const live = rows.filter(isInFlight);
  live.sort((a, b) => new Date(a.queue!.queued_at!).getTime() - new Date(b.queue!.queued_at!).getTime());

  const entries: QueueEntry[] = live.map((r) => {
    const q = r.queue!;
    const claim = q.external_claim || null;
    return {
      id: r.id,
      paper: name(r),
      student: (r.student_name || '').trim() || null,
      waitingMinutes: minsSince(q.queued_at, now) ?? 0,
      machine: claimMachine(claim?.by),
      claimedMinutes: minsSince(claim?.since || claim?.at, now),
      attempts: Number(claim?.attempts ?? q.attempts ?? 0),
    };
  });

  // The stale lane reads the OTHER signal, and only ever reports leftovers.
  const stale: QueueStaleEntry[] = [];
  for (const r of rows) {
    if (String(r.queue_status || '') !== 'queued') continue;
    const because = finishedBecause(r);
    if (because) stale.push({ id: r.id, paper: name(r), because });
  }

  return {
    pending: entries.length,
    oldestMinutes: entries.length ? entries[0].waitingMinutes : null,
    rows: entries,
    stale,
  };
}
