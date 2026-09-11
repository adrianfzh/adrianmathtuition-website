// lib/remark-internal.ts — a re-mark the student never saw the first marking of
// (11 Sep 2026).
//
// Adrian, on Gavin Woon's "em practice set 3 p1" — marked at 00:49, auto-released
// at 01:20 with `released_via 'auto:none'` (no app account, no Telegram, so no
// copy went anywhere), then re-marked from the desk: "can you remove the purple
// remarked — because it will be the first time gavin sees this, remark is just
// internal".
//
// The bot decides it (bot `lib/remark-visibility.js`: received = the earlier
// marking was released AND either a copy went out by a route that is not 'none',
// or the app logged a marking view/open after that release) and stamps
// `result_json.remark_internal` on the run when the answer is no. This is the
// website's half: the student-facing surfaces — the "Where your marks went"
// cover and the re-issue line that tells them their copy changed — read the flag
// and treat the marking as the paper's first. Adrian's own desk still shows the
// diff; the re-mark is internal, not invisible.
//
// A flag, rather than stripping `previous_results` off the row, because those
// same keys feed three INTERNAL readers — the desk's "what the re-mark changed"
// panel, the Practice Again sheet's revise instructions, and the Telegram line
// to Adrian naming the parts that moved. Dropping them would cost him all three
// to hide one badge.

/** Does this run's `result_json` say the student never received the marking this one replaces? */
export function isRemarkInternal(resultJson: unknown): boolean {
  if (!resultJson || typeof resultJson !== 'object') return false;
  return (resultJson as { remark_internal?: unknown }).remark_internal === true;
}

/** What the cover needs to badge a re-mark: which pages (1-based), when, how many parts moved. */
export type RemarkedCover = { pages: number[] | null; at: string | null; changed: number | null };

/**
 * The cover's `remarked` input, or null when the cover must read as a first
 * marking — no `previous_results` on the run, or the student never received
 * the marking those results are. `changedCount` is a thunk so the diff is only
 * walked when the badge is actually going to be drawn.
 */
export function remarkedCoverInput(resultJson: unknown, changedCount: () => number | null): RemarkedCover | null {
  if (!resultJson || typeof resultJson !== 'object') return null;
  if (isRemarkInternal(resultJson)) return null;
  const rj = resultJson as { previous_results?: unknown; previous_marked_at?: unknown; queue?: { remark_pages?: unknown } | null };
  if (!Array.isArray(rj.previous_results) || !rj.previous_results.length) return null;
  return {
    pages: Array.isArray(rj.queue?.remark_pages)
      ? (rj.queue!.remark_pages as unknown[]).map(n => Number(n) + 1).filter(n => Number.isFinite(n) && n > 0)
      : null,
    at: typeof rj.previous_marked_at === 'string' ? rj.previous_marked_at : null,
    changed: changedCount(),
  };
}
