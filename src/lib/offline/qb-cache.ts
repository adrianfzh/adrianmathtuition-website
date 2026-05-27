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

  while (hasMore) {
    const params = new URLSearchParams({ level, limit: '2000' });
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
 */
export async function syncEnabledLevels(onProgress?: (p: SyncProgress) => void): Promise<void> {
  const settings = await getOfflineSettings();
  if (!settings.enabled) return;
  for (const level of settings.levels) {
    const scope = settings.topic_scope[level] ?? 'all';
    const existing = await getQBSync(level);
    // If the scope has narrowed since last sync, the cache will contain out-of-scope rows.
    // Trim them before pulling new data so a single delta call is enough.
    if (existing && Array.isArray(existing.topic_scope) && Array.isArray(scope)) {
      const before = new Set(existing.topic_scope);
      const after = new Set(scope);
      const removed = [...before].filter((t) => !after.has(t));
      if (removed.length > 0) await trimLevelToScope(level, scope);
    }
    // If the scope has widened, we need to refetch the newly-included topics from scratch
    // — the simplest correct thing is to reset the cursor and resync.
    const scopeWidened =
      existing && Array.isArray(scope) && Array.isArray(existing.topic_scope)
        ? scope.some((t) => !existing.topic_scope.includes(t))
        : (existing && scope === 'all' && existing.topic_scope !== 'all');
    const since = scopeWidened ? null : existing?.cursor ?? null;
    try {
      await syncLevel(level, scope, since, onProgress);
    } catch (e) {
      onProgress?.({ level, fetched: 0, done: true, error: e instanceof Error ? e.message : String(e) });
    }
  }
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
  limit?: number;
}

export async function queryLocalBank(opts: CacheQueryOpts): Promise<CachedQuestion[]> {
  const rows = await queryQuestions(opts.level, opts.topics);
  const search = opts.search?.trim().toLowerCase() ?? '';
  const diffs = new Set(opts.difficulties ?? []);
  const filtered = rows.filter((r) => {
    if (opts.hasImage === 'true' && !r.has_image) return false;
    if (opts.hasImage === 'false' && r.has_image) return false;
    if (diffs.size > 0 && (!r.difficulty || !diffs.has(r.difficulty))) return false;
    if (search && !(r.question_text ?? '').toLowerCase().includes(search)) return false;
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
