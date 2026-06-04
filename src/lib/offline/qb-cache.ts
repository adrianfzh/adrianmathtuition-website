// Question-bank offline cache.
//
// On editor open, when offline mode is enabled, we run a delta sync for each level the
// user has opted into. The delta call returns questions whose updated_at > cursor.
// We page through batches until hasMore=false, then store the new cursor.
//
// Scope (topic_scope) can be 'all' (every question for the level) or an explicit
// list of canonical topics. When the user narrows the scope, we drop questions
// outside it from the cache; widening triggers a fresh sync for the added topics
// against `since=null` so the gap is filled.

import {
  getOfflineSettings, setOfflineSettings, DEFAULT_OFFLINE_SETTINGS,
  getQBSync, setQBSync, deleteQBSync,
  putQuestions, deleteQuestions, queryQuestions, countCachedQuestions, clearQuestionCache,
  type CachedQuestion, type QBSyncState, type OfflineSettings,
} from './db';

function getAuth(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)(admin_pw|schedule_pw)=([^;]*)/);
  return m ? decodeURIComponent(m[2]) : '';
}

async function apiFetch(path: string): Promise<Response> {
  return fetch(path, { headers: { Authorization: `Bearer ${getAuth()}` } });
}

export interface SyncProgress {
  level: string;
  fetched: number;
  total?: number;
  done: boolean;
  error?: string;
}

interface BankSyncResponse {
  questions: Array<CachedQuestion>;
  cursor: string;
  hasMore: boolean;
  serverNow: string;
}

// Page size for /api/admin/lessons/bank-sync. Stays under typical Supabase PostgREST
// max-rows cap (default 1000) so the server can return exactly `BATCH_SIZE` rows when
// there are more to come, which is how we detect hasMore = (rows.length === limit).
const BATCH_SIZE = 800;
// Safety cap: refuse to loop forever if the server keeps saying hasMore but we're not
// making progress (e.g. cursor not advancing). 1 million rows is way more than we'll
// ever have, but enough headroom that we never hit it in normal operation.
const MAX_PAGES = 200;

/** Sync one level. Returns number of rows ingested + the new cursor. */
export async function syncLevel(
  level: string,
  topics: 'all' | string[],
  since: string | null,
  onProgress?: (p: SyncProgress) => void,
): Promise<{ fetched: number; cursor: string }> {
  const startedAt = new Date().toISOString();
  let cursor = since ?? '';
  let totalFetched = 0;
  let hasMore = true;
  let pages = 0;

  while (hasMore) {
    pages += 1;
    if (pages > MAX_PAGES) {
      throw new Error(`bank-sync ${level}: exceeded ${MAX_PAGES} pages without finishing — cursor may not be advancing`);
    }
    const params = new URLSearchParams({ level, limit: String(BATCH_SIZE) });
    if (Array.isArray(topics) && topics.length > 0) params.set('topics', topics.join(','));
    if (cursor) params.set('since', cursor);

    const res = await apiFetch(`/api/admin/lessons/bank-sync?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      onProgress?.({ level, fetched: totalFetched, done: true, error: `${res.status} ${text}` });
      throw new Error(`bank-sync ${level}: ${res.status} ${text}`);
    }
    const json = (await res.json()) as BankSyncResponse;

    const active = json.questions.filter((q) => !q.deleted_at);
    const tombstones = json.questions.filter((q) => q.deleted_at).map((q) => q.id);
    if (active.length > 0) await putQuestions(active);
    if (tombstones.length > 0) await deleteQuestions(tombstones);

    totalFetched += json.questions.length;
    // Guard against a cursor that doesn't advance (would loop forever otherwise).
    if (json.cursor === cursor && json.hasMore) {
      throw new Error(`bank-sync ${level}: cursor stuck at ${cursor}`);
    }
    cursor = json.cursor;
    hasMore = json.hasMore;
    onProgress?.({ level, fetched: totalFetched, done: !hasMore });
  }

  const newState: QBSyncState = {
    cursor: cursor || startedAt,
    last_synced_at: new Date().toISOString(),
    topic_scope: topics,
  };
  await setQBSync(level, newState);
  return { fetched: totalFetched, cursor: newState.cursor as string };
}

/**
 * Sync every enabled level using its configured topic scope.
 * Triggered by the editor on load and by the "Sync now" button.
 *
 * Scope-change handling:
 *  - Narrowed (topics removed): drop out-of-scope rows from the cache.
 *  - Widened to 'all' from a list: fetch the *complement* (all topics minus what we had)
 *    from `since=null` to fill the historical gap, then run normal delta over the cursor.
 *  - Widened by adding specific topics: fetch the added topics with `since=null`, then
 *    run normal delta for the full new scope over the cursor. This avoids re-downloading
 *    everything in the (potentially large) original scope.
 *  - Unchanged: just run delta over the cursor.
 */
export async function syncEnabledLevels(onProgress?: (p: SyncProgress) => void): Promise<void> {
  const settings = await getOfflineSettings();
  if (!settings.enabled) return;
  for (const level of settings.levels) {
    const scope = settings.topic_scope[level] ?? 'all';
    const existing = await getQBSync(level);

    // Narrowed: drop out-of-scope cached rows.
    if (existing && Array.isArray(existing.topic_scope) && Array.isArray(scope)) {
      const before = new Set(existing.topic_scope);
      const removed = [...before].filter((t) => !new Set(scope).has(t));
      if (removed.length > 0) await trimLevelToScope(level, scope);
    }

    try {
      const widenedTopics = computeWidenedTopics(existing?.topic_scope, scope);
      // Fill historical gap for any topics newly included in the scope.
      if (widenedTopics !== null && widenedTopics.length > 0) {
        await syncLevel(level, widenedTopics, null, onProgress);
      } else if (widenedTopics === 'all') {
        // Scope expanded to 'all' from a previous explicit list: pull everything since the
        // beginning. We can still re-use the existing cursor for the delta pass after.
        await syncLevel(level, 'all', null, onProgress);
      }
      // Forward delta: catches new and edited questions across the current scope since
      // the last sync (no-op on first run because cursor is null at that point).
      await syncLevel(level, scope, existing?.cursor ?? null, onProgress);
    } catch (e) {
      onProgress?.({ level, fetched: 0, done: true, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

/**
 * Compare new scope vs prior scope and return the "newly-included" topics:
 *  - null       → no widening (or first sync); nothing extra to fetch
 *  - 'all'      → scope went from explicit list to 'all'; resync all topics from scratch
 *  - string[]   → these specific topics were added to the scope; fetch them from scratch
 */
function computeWidenedTopics(
  prior: QBSyncState['topic_scope'] | undefined,
  next: 'all' | string[],
): null | 'all' | string[] {
  if (!prior) return null; // first sync — delta over null cursor handles everything
  if (next === 'all') return prior === 'all' ? null : 'all';
  if (prior === 'all') return null; // narrowing — trimLevelToScope handles it
  const before = new Set(prior);
  const added = next.filter((t) => !before.has(t));
  return added.length > 0 ? added : null;
}

/** Remove cached rows that don't match the level's current topic scope. */
async function trimLevelToScope(level: string, scope: string[]): Promise<void> {
  const inScope = await queryQuestions(level, scope);
  const inScopeIds = new Set(inScope.map((q) => q.id));
  // Get everything for this level and drop anything not in scope
  const all = await queryQuestions(level, []);
  const toDrop = all.filter((q) => !inScopeIds.has(q.id)).map((q) => q.id);
  if (toDrop.length > 0) await deleteQuestions(toDrop);
}

/** Remove every cached question for a given level. Used when a level is deselected. */
export async function clearLevelQuestions(level: string): Promise<number> {
  const all = await queryQuestions(level, []);
  const ids = all.map((q) => q.id);
  if (ids.length > 0) await deleteQuestions(ids);
  return ids.length;
}

/** How many questions are cached for this level right now. */
export async function countLevelQuestions(level: string): Promise<number> {
  const all = await queryQuestions(level, []);
  return all.length;
}

/**
 * Query the local cache for questions matching a lesson's topics + level.
 * Optional filters mirror what the bank panel supports today.
 */
export interface CacheQueryOpts {
  level: string;
  topics: string[];
  search?: string;
  hasImage?: 'true' | 'false' | 'any';
  difficulties?: string[];
  exam?: string; // Promo | MY | Prelim | '' (JC only; requires exam_type in cache)
  limit?: number;
}

const JC_FAMILY = ['JC', 'JC1', 'JC2'];

export async function queryLocalBank(opts: CacheQueryOpts): Promise<CachedQuestion[]> {
  // A JC lesson matches the whole JC1/JC2 family in the cache too.
  const levels = JC_FAMILY.includes(opts.level) ? JC_FAMILY : [opts.level];
  const lists = await Promise.all(levels.map((lv) => queryQuestions(lv, opts.topics)));
  const seen = new Set<string>();
  const rows = lists.flat().filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const search = opts.search?.trim().toLowerCase() ?? '';
  const diffs = new Set(opts.difficulties ?? []);
  const filtered = rows.filter((r) => {
    if (opts.hasImage === 'true' && !r.has_image) return false;
    if (opts.hasImage === 'false' && r.has_image) return false;
    if (diffs.size > 0 && (!r.difficulty || !diffs.has(r.difficulty))) return false;
    if (opts.exam && r.exam_type !== opts.exam) return false;
    if (search) {
      const hay = `${r.question_text ?? ''} ${r.school ?? ''} ${r.source_file ?? ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  // Stable sort: school, year DESC, paper, question_number
  filtered.sort((a, b) => {
    if (a.school !== b.school) return a.school.localeCompare(b.school);
    if (a.year !== b.year) return b.year - a.year;
    if (a.paper !== b.paper) return a.paper.localeCompare(b.paper);
    return a.question_number.localeCompare(b.question_number, undefined, { numeric: true });
  });
  return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}

// ── Settings helpers (re-exported for UI convenience) ───────────────────────

export {
  getOfflineSettings, setOfflineSettings, DEFAULT_OFFLINE_SETTINGS,
  getQBSync, deleteQBSync, countCachedQuestions, clearQuestionCache,
  type OfflineSettings, type CachedQuestion, type QBSyncState,
};

/** Disable offline mode and wipe the QB cache. */
export async function disableOfflineMode(): Promise<void> {
  const s = await getOfflineSettings();
  // Forget all per-level sync state, then clear the cache itself
  for (const level of s.levels) await deleteQBSync(level);
  await clearQuestionCache();
  await setOfflineSettings({ ...DEFAULT_OFFLINE_SETTINGS });
}

/** Best-effort browser storage estimate (rough — IndexedDB-wide, not per-store). */
export async function estimateStorageBytes(): Promise<number | null> {
  if (typeof navigator === 'undefined' || !('storage' in navigator) || !navigator.storage.estimate) {
    return null;
  }
  const est = await navigator.storage.estimate();
  return est.usage ?? null;
}
