// The mark-paper history list: paging + refresh arithmetic, kept pure so the
// "loaded rows vanish" bug of 10 Sep 2026 has a regression test.
//
// The list is PAGED (25 rows, "Load 25 more") but it is also REFRESHED every
// 15 s while a row is in flight (a paper being marked, a sheet being written).
// A refresh used to ask the bot for page one and REPLACE the list with it, so
// the rows "Load 25 more" had just added were on screen for a few seconds and
// then gone (Adrian, 10 Sep 2026). A refresh must re-fetch the window that is
// already on screen and merge, never truncate.

export const RUNS_PAGE = 25;
/** The bot's getMarkingStats clamps `limit` at 100. */
export const RUNS_REFRESH_MAX = 100;

/** Page size for a refresh (offset 0): everything already loaded, at least a page, at most the bot's cap. */
export function refreshLimit(loaded: number): number {
  return Math.min(RUNS_REFRESH_MAX, Math.max(RUNS_PAGE, Math.floor(loaded) || 0));
}

/**
 * Merge a fetched page into the list already on screen.
 * - offset 0 is a refresh: the fresh rows lead (they are the newest N, in the
 *   server's order) and any previously loaded row NOT in the fresh set is kept
 *   after them — older than the refreshed window, so the newest-first order holds.
 *   Those tail rows are stale until the next full load, which beats vanishing.
 * - offset > 0 is "Load more": append, skipping ids already present (a run that
 *   landed between two loads shifts the offset by one and would otherwise repeat).
 */
export function mergeRunsPage<T extends { id: string }>(prev: T[], fresh: T[], offset: number): T[] {
  if (offset > 0) {
    const seen = new Set(prev.map((r) => r.id));
    return [...prev, ...fresh.filter((r) => !seen.has(r.id))];
  }
  const seen = new Set(fresh.map((r) => r.id));
  return [...fresh, ...prev.filter((r) => !seen.has(r.id))];
}

/**
 * Papers in motion (queued or being marked, any date) ahead of the dated list,
 * without duplicating a row the dated window already shows (10 Sep 2026: a
 * re-mark keeps its paper's created_at, so Joey's 9 Sep paper was three pages
 * down while it was being re-marked and "Still to deal with" never showed it).
 */
export function withInMotion<T extends { id: string }>(recent: T[], inMotion: T[]): T[] {
  const seen = new Set(recent.map((r) => r.id));
  return [...inMotion.filter((r) => !seen.has(r.id)), ...recent];
}

/** The shape of a sheet_jobs row the "in motion" merge needs. */
export interface SheetJobLite {
  run_id: string;
  run_ids?: string[] | null;
  status: string;
  created_at: string;
}

/** A failed sheet stays "in motion" (waiting on Adrian) for this long. */
export const FAILED_SHEET_DAYS = 7;

/**
 * Papers whose Practice Again sheet is in flight but which are NOT on screen —
 * the "still to deal with" group must carry them wherever their marking date
 * sits (Adrian, 11 Sep 2026: Chloe's 9 Sep paper had its sheet being written
 * and the list, 25 rows deep and all newer, showed nothing). The bot's own
 * `inMotion` covers MARKING in flight only; sheet_jobs lives on the website's
 * side, so this is where the sheet half is added. Pure; tested.
 */
export function sheetInMotionIds(jobs: readonly SheetJobLite[], loadedIds: Iterable<string>, nowISO: string): string[] {
  const loaded = new Set(loadedIds);
  const cutoff = new Date(new Date(nowISO).getTime() - FAILED_SHEET_DAYS * 86400_000).toISOString();
  const out: string[] = [];
  for (const j of jobs) {
    const live = j.status === 'queued' || j.status === 'claimed' || (j.status === 'failed' && j.created_at >= cutoff);
    if (!live) continue;
    for (const id of [j.run_id, ...(Array.isArray(j.run_ids) ? j.run_ids : [])]) {
      if (id && !loaded.has(id) && !out.includes(id)) out.push(id);
    }
  }
  return out;
}
