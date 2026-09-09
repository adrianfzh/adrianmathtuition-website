// The auto-release sweep — try again until it succeeds (9 Sep 2026).
//
// Sophie's 1 Sep hand-in passed every rule and sat unreleased for a day: the
// bot's release call failed for a reason nobody recorded and nothing tried
// again. Now the bot stamps every outcome on the run
// (`result_json.auto_release`, lib/auto-release-outcome.js in the bot) and
// retries twice itself; this sweep (/api/cron/auto-release-sweep, every 10 min)
// picks up what is still unreleased for an OPERATIONAL reason and calls the
// same release door, until it succeeds. A rule refusal (paused, not a hand-in,
// nothing marked) and a hold (margin ticks) are the desk's and are never
// retried here. Pure pieces, tested.

export type SweepRow = {
  id: string;
  created_at: string;
  released_at: string | null;
  annotated_pdf_url: string | null;
  queue_status?: string | null;
  result_json: unknown;
};

export const SWEEP_WINDOW_DAYS = 7;
/** A run with no stamp at all is only retried once it is clearly not mid-delivery. */
export const UNSTAMPED_MIN_AGE_MIN = 30;
/** A failed stamp is retried after this long, so the sweep and the bot's own retries never overlap. */
export const FAILED_MIN_AGE_MIN = 5;

type Rj = {
  portal_submission?: unknown;
  telegram_handin?: unknown;
  results?: unknown;
  auto_release?: { outcome?: string; at?: string } | null;
};

function rjOf(row: SweepRow): Rj {
  return (row.result_json && typeof row.result_json === 'object') ? row.result_json as Rj : {};
}

export function isStudentHandin(row: SweepRow): boolean {
  const rj = rjOf(row);
  return rj.portal_submission === true || !!(rj.telegram_handin && typeof rj.telegram_handin === 'object');
}

/** Why a row is (or is not) a sweep candidate — one reason, for the log. */
export function sweepVerdict(row: SweepRow, now: Date): { retry: boolean; why: string } {
  const rj = rjOf(row);
  if (row.released_at) return { retry: false, why: 'released' };
  if (!isStudentHandin(row)) return { retry: false, why: 'not a student hand-in' };
  if (!Array.isArray(rj.results) || rj.results.length === 0) return { retry: false, why: 'not marked yet' };
  if (!row.annotated_pdf_url) return { retry: false, why: 'no marked PDF yet' };
  if (row.queue_status === 'queued' || row.queue_status === 'claimed') return { retry: false, why: 'still in the queue' };
  const ageMin = (now.getTime() - Date.parse(row.created_at)) / 60_000;
  if (!Number.isFinite(ageMin) || ageMin > SWEEP_WINDOW_DAYS * 24 * 60) return { retry: false, why: 'outside the window' };
  const ar = rj.auto_release;
  if (!ar || !ar.outcome) {
    return ageMin >= UNSTAMPED_MIN_AGE_MIN
      ? { retry: true, why: 'marked, never auto-released' }
      : { retry: false, why: 'too fresh to tell' };
  }
  if (ar.outcome === 'failed') {
    const sinceMin = ar.at ? (now.getTime() - Date.parse(ar.at)) / 60_000 : Infinity;
    return sinceMin >= FAILED_MIN_AGE_MIN
      ? { retry: true, why: 'last auto-release failed' }
      : { retry: false, why: 'the bot is still retrying' };
  }
  if (ar.outcome === 'released') return { retry: false, why: 'stamped released' };
  return { retry: false, why: `${ar.outcome} — the desk's call` };
}

export function sweepCandidates(rows: SweepRow[], now: Date): SweepRow[] {
  return (rows || []).filter(r => sweepVerdict(r, now).retry);
}
