// What the mark-paper history row SAYS about a paper that is not marked yet.
//
// Adrian, 3 Sep 2026, watching three papers: "I thought two started marking, but
// now only one is being marked." Two had finished — the Mac had read every page
// and handed its reads to the server for annotation + PDF — but the row only knew
// "reading" (a heartbeat under ten minutes old) and "queued", so the two furthest
// along fell back to "queued — waiting for your Mac". Heartbeats stop the moment
// the last page is read; the hand-back and assembly take minutes; after ten of
// them the row was lying. This is the row's state machine, pure so it is tested,
// with the timestamps the bot's stats query already exposes.
export type HistoryRunLike = {
  total_max?: number | null;
  queued_at?: string | null;
  queue_failed?: string | null;
  skip_external?: string | boolean | null;
  claim_at?: string | null;         // the Mac worker's last heartbeat (external_claim.at)
  claim_released?: string | null;
  pages_done?: string | number | null;
  pages_total?: string | number | null;
};

export type HistoryStateKey =
  | 'failed' | 'reading' | 'handing_back' | 'quiet' | 'batch' | 'queued' | 'uploaded' | 'server';

export type HistoryState = { key: HistoryStateKey; text: string; progress: { done: number; total: number; pct: number } | null };

/** Same 10-minute lease the queue policy uses (bot lib/queue-pick.js). */
export const CLAIM_LIVE_MS = 10 * 60 * 1000;
/** After this long with no result from a completed read, say the server will re-mark it. */
export const HANDBACK_QUIET_MS = 15 * 60 * 1000;

export function pageProgress(run: HistoryRunLike): { done: number; total: number; pct: number } | null {
  const done = Number(run.pages_done), total = Number(run.pages_total);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
  const clamped = Math.max(0, Math.min(done, total));
  return { done: clamped, total, pct: Math.round((clamped / total) * 100) };
}

function minutesAgo(iso: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
}

/**
 * @param run     a history row (bot stats phase)
 * @param now     the instant to judge liveness against — passed so tests pin it
 * @param canMark the page's own "▶ Mark would start a fresh marking" gate
 */
export function historyState(run: HistoryRunLike, now: number, canMark: unknown = false): HistoryState {
  const progress = pageProgress(run);
  if (run.queue_failed) return { key: 'failed', text: '⚠ queue failed twice', progress };

  const claimed = !!run.claim_at && !run.claim_released && run.total_max == null;
  if (run.queued_at && claimed) {
    const age = now - new Date(run.claim_at as string).getTime();
    const complete = !!progress && progress.done >= progress.total;
    if (complete) {
      const quiet = age >= HANDBACK_QUIET_MS;
      return {
        key: 'handing_back',
        progress,
        text: quiet
          ? `💻 all ${progress!.total} pages read · nothing back from the server for ${minutesAgo(run.claim_at as string, now)} min — it re-marks the paper itself if the hand-back was lost`
          : `💻 all ${progress!.total} pages read · handing back to the server (annotation + PDF) — a few minutes, then Telegram + Dropbox`,
      };
    }
    if (age < CLAIM_LIVE_MS) {
      return {
        key: 'reading',
        progress,
        text: progress
          ? `💻 page ${progress.done} of ${progress.total} · ${progress.pct}%`
          : '💻 your Mac is marking it now — free, ~25 min for a full paper',
      };
    }
    return {
      key: 'quiet',
      progress,
      text: progress
        ? `💻 your Mac went quiet at page ${progress.done} of ${progress.total} (${minutesAgo(run.claim_at as string, now)} min ago) — the server re-marks it via the API about 10 min after the last heartbeat`
        : `💻 your Mac went quiet ${minutesAgo(run.claim_at as string, now)} min ago — the server re-marks it via the API about 10 min after the last heartbeat`,
    };
  }
  if (run.queued_at && !!run.skip_external) {
    return { key: 'batch', progress, text: '☁️ queued for the batch API (~50% price) — 10–60 min, then Telegram + Dropbox' };
  }
  if (run.queued_at && run.total_max == null) {
    return { key: 'queued', progress, text: '🌙 queued — waiting for your Mac (free) while it is awake, else ~50% batch API. 10–60 min, then Telegram + Dropbox' };
  }
  if (canMark) return { key: 'uploaded', progress, text: '⏳ uploaded — not marked yet' };
  return { key: 'server', progress, text: '⏳ still marking on the server — this row updates itself when it lands' };
}
