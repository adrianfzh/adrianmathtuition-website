// Phase G retention policy (PLAN-PORTAL-SOLO §7 Q4, built 2026-08-21): a
// student's practice attempts are kept while they are active and purged after
// RETENTION_MONTHS of inactivity. "Activity" = their latest graded attempt or
// portal login, whichever is newer, so an active student's history is never
// touched. Pure date logic lives here (tested); /api/cron/retention deletes.
export const RETENTION_MONTHS = 12;

/** UTC ISO cutoff: activity strictly older than this is beyond retention. */
export function retentionCutoffIso(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - RETENTION_MONTHS;
  // Clamp the day so month-length differences never roll forward (29 Feb → 28 Feb).
  const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    y, m, Math.min(now.getUTCDate(), daysInTarget),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
  )).toISOString();
}

/** Latest of the given timestamps; null when none are usable. */
export function latestActivityIso(...isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    if (best === null || t > Date.parse(best)) best = iso;
  }
  return best;
}

/**
 * True when the last known activity is beyond the retention window. A student
 * with NO parseable activity at all is treated as expired — rows we cannot
 * date are exactly what a data-minimisation sweep exists to clear.
 */
export function isExpired(lastActivityIso: string | null, cutoffIso: string): boolean {
  if (!lastActivityIso) return true;
  return Date.parse(lastActivityIso) < Date.parse(cutoffIso);
}
