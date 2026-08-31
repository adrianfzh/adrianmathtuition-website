// Cancelling a queued marking — pure decision + the row rewrite it implies.
//
// The marking queue is not a table: it is the `queue` key inside
// `paper_marking_runs.result_json`, written by the bot's enqueue and read by
// every drain it has. All three of them filter on `result_json->queue is not
// null`:
//
//   • the Fly worker's candidate query        (handlers/webchat.js ~2196)
//   • the Mac marker's claim + peek           (~2449)
//   • externalHeartbeat / externalMarkingResult, which BOTH treat a missing
//     `queue` as "claim lost" and refuse to write                (~2532, ~2591)
//
// So removing that one key cancels the paper everywhere at once, including a
// marking already running on the Mac: its next heartbeat is refused and the
// runbook stops, and if it somehow finishes anyway its reads are dropped as
// superseded rather than delivered. That is why this is done from the website
// with a direct Supabase write instead of a new bot phase — deploying the bot
// kills whatever it is marking at the time, which is a strange price to pay for
// a cancel button.
//
// Pure here, orchestrated in /api/admin/papers (PATCH action:'cancel-marking').

export type MarkQueueState = 'queued' | 'running' | 'none' | 'marked';

type QueueBlock = {
  queued_at?: string;
  mark_now?: boolean;
  skip_external?: boolean;
  external_claim?: { by?: string; at?: string; released_at?: string } | null;
} & Record<string, unknown>;

type RunRow = {
  total_max?: number | null;
  result_json?: unknown;
};

/** How long a Mac claim stays "live" without a heartbeat. Mirrors the bot's
 *  EXTERNAL_HANDOVER_MS — past it the claim is stale and the paper is merely
 *  queued again, so cancelling it is not interrupting anyone. */
export const CLAIM_FRESH_MS = 10 * 60 * 1000;

function queueOf(row: RunRow | null | undefined): QueueBlock | null {
  const rj = (row?.result_json ?? null) as { queue?: unknown } | null;
  const q = rj?.queue;
  return q && typeof q === 'object' ? (q as QueueBlock) : null;
}

/** What state this paper's marking is in, from the row alone. */
export function markQueueState(row: RunRow | null | undefined, now = Date.now()): MarkQueueState {
  if (!row) return 'none';
  const rj = (row.result_json ?? null) as { results?: unknown } | null;
  // A marked paper is finished business — there is nothing left to stop, and the
  // score on the row is the proof.
  if (row.total_max != null) return 'marked';
  if (Array.isArray(rj?.results) && rj.results.length) return 'marked';
  const q = queueOf(row);
  if (!q) return 'none';
  const claim = q.external_claim;
  if (claim && claim.at && !claim.released_at) {
    const t = Date.parse(claim.at);
    if (Number.isFinite(t) && now - t < CLAIM_FRESH_MS) return 'running';
  }
  return 'queued';
}

/** Can this be cancelled, and what should Adrian be told if not. */
export function cancelMarkingState(
  row: RunRow | null | undefined,
  now = Date.now(),
): { can: boolean; state: MarkQueueState; running: boolean; reason?: string } {
  const state = markQueueState(row, now);
  if (state === 'marked') return { can: false, state, running: false, reason: 'that paper is already marked' };
  if (state === 'none') return { can: false, state, running: false, reason: 'that paper is not queued for marking' };
  return { can: true, state, running: state === 'running' };
}

/**
 * The result_json to write back: `queue` gone, and a stamp saying what was
 * dropped. The stamp is audit only — nothing reads it — but a paper that was
 * queued for half an hour and then silently wasn't is the kind of thing that
 * costs an evening to reconstruct.
 */
export function stripQueue(resultJson: unknown, at: string): Record<string, unknown> {
  const rj = (resultJson && typeof resultJson === 'object' ? { ...(resultJson as Record<string, unknown>) } : {});
  const q = (rj.queue ?? null) as QueueBlock | null;
  delete rj.queue;
  rj.queue_cancelled = {
    at,
    queued_at: q?.queued_at ?? null,
    was_claimed_by: q?.external_claim?.by ?? null,
    mark_now: !!q?.mark_now,
    skip_external: !!q?.skip_external,
  };
  return rj;
}
