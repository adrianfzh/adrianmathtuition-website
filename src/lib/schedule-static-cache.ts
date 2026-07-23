// In-memory TTL cache for the week-INDEPENDENT Airtable fetches behind
// /api/admin-schedule (Slots, the full Enrollments scan, Topic Timeline).
//
// Why: the Enrollments fetch is unfiltered by design (the Roster tab derives
// any week's historical membership from tenure dates), so it pages through the
// entire enrollment history on EVERY week view and only grows over time. These
// three datasets change rarely, so a short TTL takes them off the hot path —
// week navigation then only pays for the week's Lessons fetch.
//
// Scope & staleness: the cache is per-lambda-instance (module scope), so it
// only helps while the function is warm — which is exactly when Adrian is
// clicking through weeks. Routes that WRITE enrollments call
// invalidateScheduleStatics() so the same warm instance serves fresh data on
// the page's follow-up refetch; a different (cold or sibling) instance never
// had the entry cached, or expires it within TTL_MS. Worst case a roster is
// TTL_MS stale on a sibling instance — acceptable for a single-admin tool.
// Lessons are NEVER cached (they change constantly: reschedules, attendance).

const TTL_MS = 60_000;

type Entry = { at: number; data: unknown };
const store = new Map<string, Entry>();

/** Serve `key` from cache when fresh, else run `fn` and cache its result. */
export async function cachedScheduleStatic<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const data = await fn();
  store.set(key, { at: Date.now(), data });
  return data;
}

/** Drop all cached statics — call after any write to Enrollments or Slots. */
export function invalidateScheduleStatics(): void {
  store.clear();
}
