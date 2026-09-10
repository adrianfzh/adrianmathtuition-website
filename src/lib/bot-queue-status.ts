// ─── The bot's queue-quiet facts, formatted for /admin/ops ──────────────────
//
// Adrian, 11 Sep 2026, after a marker-machine meltdown: "Nobody could see that
// state tonight." The bot's marking queue has a batch-API lane he switches off
// by hand some nights (Fly secret `MARK_QUEUE_BATCH`) — when it's off, every
// hand-back is drawn on the marker machine instead. The bot's public
// `GET /queue-quiet` (no auth) carries `batch_lane: 'on' | 'off'` (added by the
// orchestrator alongside this build — code against the field name, treat it as
// unknown until it's actually there) and `marker_reachable`.
//
// Pure formatting only: the ops route (`/api/admin/ops`) does the fetch
// (fail-soft, 3s timeout) and hands the raw JSON body's two fields here.

export type BatchLaneNote = { text: string; tone: 'amber' | 'grey' };

/**
 * What the board shows for the batch lane. `'off'` is the thing Adrian asked
 * to see — amber, since every hand-back is landing on the marker machine.
 * `'on'` is a quiet grey confirmation. Anything else (the field not shipped
 * yet, a typo, a future third state) shows NOTHING — a guessed-at banner is
 * worse than silence when the bot hasn't actually said what it means. Pure.
 */
export function batchLaneNote(batchLane: unknown): BatchLaneNote | null {
  if (batchLane === 'off') return { text: 'Batch lane: off — every hand-back is drawn on the marker', tone: 'amber' };
  if (batchLane === 'on') return { text: 'Batch lane: on', tone: 'grey' };
  return null;
}

/**
 * `marker_reachable:false` → a red note. Missing, `true`, or any non-boolean
 * value says nothing — this is a "something is actively wrong" flag, not a
 * status line, so it only ever speaks up on a confirmed `false`. Pure.
 */
export function markerUnreachableNote(markerReachable: unknown): string | null {
  return markerReachable === false ? 'Marker process unreachable' : null;
}
