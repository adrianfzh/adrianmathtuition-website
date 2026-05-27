'use client';

// Offline-mode settings UI.
// - Toggle enable/disable offline mode (when off, the QB cache is wiped).
// - Pick which levels to cache (multi-select).
// - Per-level topic scope: 'all' or a specific list of canonical topics.
// - Last-synced caption + manual "Sync now" button.
// - Storage estimate from navigator.storage.estimate().

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTopicsForPaperLevel } from '@/lib/canonical-topics';
import {
  getOfflineSettings, setOfflineSettings,
  getQBSync, deleteQBSync,
  countCachedQuestions, clearQuestionCache,
  syncEnabledLevels, syncLevel, disableOfflineMode, clearLevelQuestions, countLevelQuestions,
  estimateStorageBytes,
  type OfflineSettings, type QBSyncState, type SyncProgress,
} from '@/lib/offline/qb-cache';
import { requestPersistentStorage } from '@/lib/offline/persistStorage';

const LEVELS = ['AM', 'EM', 'JC', 'S1', 'S2'];

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function bytesPretty(b: number | null): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h ago`;
  return `${Math.round(ms / 86_400_000)} d ago`;
}

export default function OfflineSettingsClient() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [syncState, setSyncState] = useState<Record<string, QBSyncState | undefined>>({});
  const [levelCounts, setLevelCounts] = useState<Record<string, number>>({});
  const [cachedCount, setCachedCount] = useState<number>(0);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  // Inline confirmation prompts (replaces unreliable window.confirm).
  const [confirmDisableAll, setConfirmDisableAll] = useState(false);
  const [confirmDisableLevel, setConfirmDisableLevel] = useState<string | null>(null);

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw');
    setAuthed(!!pw);
    // Strong intent signal — user opened the settings page, so ask the browser to
    // promote our storage to persistent (resists eviction under disk pressure).
    void requestPersistentStorage();
  }, []);

  const refresh = useCallback(async () => {
    const s = await getOfflineSettings();
    setSettings(s);
    const states: Record<string, QBSyncState | undefined> = {};
    const counts: Record<string, number> = {};
    for (const lv of s.levels) {
      states[lv] = await getQBSync(lv);
      counts[lv] = await countLevelQuestions(lv);
    }
    setSyncState(states);
    setLevelCounts(counts);
    setCachedCount(await countCachedQuestions());
    setStorageBytes(await estimateStorageBytes());
    try {
      const p = await (navigator.storage?.persisted?.() ?? Promise.resolve(false));
      setPersisted(p);
    } catch { setPersisted(null); }
  }, []);

  useEffect(() => { if (authed) void refresh(); }, [authed, refresh]);

  const save = useCallback(async (next: OfflineSettings) => {
    await setOfflineSettings(next);
    setSettings(next);
  }, []);

  // Master toggle. Enabling is one-click; disabling shows an inline confirm step
  // because it wipes the cache (could be a lot of data).
  const handleToggle = useCallback(async (next: boolean) => {
    if (!settings) return;
    if (!next) {
      // Don't call window.confirm — modern browsers may suppress dialogs from
      // controls that toggle rapidly. Drive a clear inline confirm instead.
      setConfirmDisableAll(true);
      return;
    }
    setConfirmDisableAll(false);
    await save({ ...settings, enabled: true, levels: settings.levels.length === 0 ? ['AM'] : settings.levels });
  }, [settings, save]);

  const confirmDisableNow = useCallback(async () => {
    setConfirmDisableAll(false);
    await disableOfflineMode();
    await refresh();
  }, [refresh]);

  // Per-level toggle. Enabling adds and defaults to "all topics" scope.
  // Disabling wipes that level's cached questions AND its per-level cursor.
  const handleLevelToggle = useCallback(async (level: string) => {
    if (!settings) return;
    const has = settings.levels.includes(level);
    if (has) {
      setConfirmDisableLevel(level);
      return;
    }
    const nextLevels = [...settings.levels, level];
    const nextScope = { ...settings.topic_scope };
    nextScope[level] = nextScope[level] ?? 'all';
    await save({ ...settings, levels: nextLevels, topic_scope: nextScope });
    await refresh();
  }, [settings, save, refresh]);

  const confirmDisableLevelNow = useCallback(async () => {
    if (!settings || !confirmDisableLevel) return;
    const level = confirmDisableLevel;
    setConfirmDisableLevel(null);
    const nextLevels = settings.levels.filter((l) => l !== level);
    const nextScope = { ...settings.topic_scope };
    delete nextScope[level];
    await deleteQBSync(level);
    await clearLevelQuestions(level);
    await save({ ...settings, levels: nextLevels, topic_scope: nextScope });
    await refresh();
  }, [settings, confirmDisableLevel, save, refresh]);

  const handleScopeChange = useCallback(async (level: string, scope: 'all' | string[]) => {
    if (!settings) return;
    await save({ ...settings, topic_scope: { ...settings.topic_scope, [level]: scope } });
  }, [settings, save]);

  const handleSyncAll = useCallback(async () => {
    setSyncing(true); setErrorMsg(null); setProgress(null);
    try {
      await syncEnabledLevels((p) => setProgress(p));
      await refresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const handleSyncLevel = useCallback(async (level: string) => {
    if (!settings) return;
    setSyncing(true); setErrorMsg(null); setProgress(null);
    try {
      const scope = settings.topic_scope[level] ?? 'all';
      const cur = syncState[level];
      await syncLevel(level, scope, cur?.cursor ?? null, (p) => setProgress(p));
      await refresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [settings, syncState, refresh]);

  const [confirmWipe, setConfirmWipe] = useState(false);
  const handleHardReset = useCallback(async () => {
    setConfirmWipe(false);
    await clearQuestionCache();
    if (settings) {
      for (const level of settings.levels) await deleteQBSync(level);
    }
    await refresh();
  }, [settings, refresh]);

  if (authed === null) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!authed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xl font-semibold text-slate-700">Admin login required</p>
        <Link className="text-blue-600 underline text-sm" href="/admin">/admin</Link>
      </main>
    );
  }
  if (!settings) return <div className="p-8 text-slate-500">Loading settings…</div>;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 flex items-center gap-3 text-sm">
        <button
          onClick={() => router.back()}
          title="Back to where you came from"
          className="text-slate-300 hover:text-white text-xs px-2 py-0.5 border border-slate-600 hover:border-slate-400 rounded"
        >← Back</button>
        <Link href="/admin" className="hover:text-emerald-300 font-medium">⚙ Admin</Link>
        <span className="text-slate-400">/</span>
        <Link href="/admin/lessons" className="hover:text-emerald-300">📚 Lessons</Link>
        <span className="text-slate-400">/</span>
        <span className="text-emerald-300 font-medium">Offline mode</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Master toggle */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={settings.enabled && !confirmDisableAll}
                onChange={(e) => handleToggle(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="font-semibold text-slate-800">Enable offline mode</span>
              {settings.enabled && !confirmDisableAll && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">on</span>}
              {!settings.enabled && <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">off</span>}
            </label>
            {settings.enabled && !confirmDisableAll && (
              <button
                onClick={handleSyncAll}
                disabled={syncing || settings.levels.length === 0}
                className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
              >
                {syncing ? 'Syncing…' : '↻ Sync now'}
              </button>
            )}
          </div>
          {confirmDisableAll && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded">
              <p className="text-sm text-rose-900 font-medium mb-1">Disable offline mode?</p>
              <p className="text-xs text-rose-800 mb-3">
                This wipes the cached question bank ({cachedCount.toLocaleString()} question{cachedCount === 1 ? '' : 's'}, {bytesPretty(storageBytes)}) from this device. Your lessons stay intact.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={confirmDisableNow}
                  className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded hover:bg-rose-700"
                >Yes, disable & wipe cache</button>
                <button
                  onClick={() => setConfirmDisableAll(false)}
                  className="px-3 py-1.5 border border-slate-300 text-xs rounded hover:bg-slate-50"
                >Cancel</button>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1.5">
            When on, the question bank for the selected scope is cached on this device.
            Lesson edits work offline regardless and sync automatically when you reconnect.
          </p>
          {progress && (
            <div className="mt-3 text-xs text-slate-600">
              {progress.error
                ? <span className="text-red-600">⚠ {progress.level}: {progress.error}</span>
                : <span>↻ {progress.level}: {progress.fetched} fetched{progress.done ? ' (done)' : '…'}</span>}
            </div>
          )}
          {errorMsg && <p className="text-xs text-red-600 mt-2">{errorMsg}</p>}
        </section>

        {/* Per-level config */}
        {settings.enabled && (
          <section className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Scope</h2>
            <div className="space-y-3">
              {LEVELS.map((level) => {
                const enabled = settings.levels.includes(level);
                const scope = settings.topic_scope[level] ?? 'all';
                const st = syncState[level];
                const isConfirming = confirmDisableLevel === level;
                return (
                  <div key={level} className="border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50">
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={enabled && !isConfirming}
                          onChange={() => handleLevelToggle(level)}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <span className="text-sm font-semibold text-slate-800">{level}</span>
                      </label>
                      {enabled && !isConfirming && (
                        <>
                          <span className="text-[11px] text-slate-500" title={`Cached questions for ${level}`}>
                            {levelCounts[level]?.toLocaleString() ?? '0'} cached
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] text-slate-500" title={st?.last_synced_at ?? ''}>
                            {st ? `synced ${timeAgo(st.last_synced_at)}` : 'never synced'}
                          </span>
                          <button
                            onClick={() => handleSyncLevel(level)}
                            disabled={syncing}
                            className="text-[11px] px-2 py-0.5 border border-slate-300 rounded hover:bg-white disabled:opacity-40"
                          >↻</button>
                        </>
                      )}
                    </div>
                    {isConfirming && (
                      <div className="px-3 py-2 bg-rose-50 border-b border-rose-200">
                        <p className="text-xs text-rose-900 mb-2">Stop caching <span className="font-semibold">{level}</span>? Its cached questions will be removed from this device.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={confirmDisableLevelNow}
                            className="px-2.5 py-1 bg-rose-600 text-white text-[11px] font-semibold rounded hover:bg-rose-700"
                          >Yes, stop caching {level}</button>
                          <button
                            onClick={() => setConfirmDisableLevel(null)}
                            className="px-2.5 py-1 border border-slate-300 text-[11px] rounded hover:bg-slate-50"
                          >Cancel</button>
                        </div>
                      </div>
                    )}
                    {enabled && !isConfirming && (
                      <LevelScopePicker
                        level={level}
                        scope={scope}
                        onChange={(s) => handleScopeChange(level, s)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Storage */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Storage</h2>
          <div className="text-xs text-slate-600 grid grid-cols-2 gap-y-1">
            <span>Cached questions</span>
            <span className="font-mono text-right">{cachedCount.toLocaleString()}</span>
            <span>Browser storage used</span>
            <span className="font-mono text-right">{bytesPretty(storageBytes)}</span>
            <span>Eviction protection</span>
            <span className="text-right">
              {persisted === null
                ? <span className="text-slate-400">—</span>
                : persisted
                  ? <span className="text-emerald-700">🛡 persistent</span>
                  : <span className="text-amber-700" title="Storage is best-effort and could be evicted under disk pressure. Reload the page or click Sync now to retry the persistence request.">⚠ best-effort</span>}
            </span>
          </div>
          {!confirmWipe ? (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setConfirmWipe(true)}
                className="text-[11px] px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
              >Wipe offline data</button>
            </div>
          ) : (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded">
              <p className="text-xs text-rose-900 mb-2">
                Wipe ALL offline data on this device? This clears the QB cache ({cachedCount.toLocaleString()} questions, {bytesPretty(storageBytes)}) and any unsynced changes. Lessons are re-downloaded the next time you open them online.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmWipe(false)}
                  className="px-2.5 py-1 border border-slate-300 text-[11px] rounded hover:bg-slate-50"
                >Cancel</button>
                <button
                  onClick={handleHardReset}
                  className="px-2.5 py-1 bg-rose-600 text-white text-[11px] font-semibold rounded hover:bg-rose-700"
                >Yes, wipe everything</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ── Per-level topic scope picker ────────────────────────────────────────────

function LevelScopePicker({
  level,
  scope,
  onChange,
}: {
  level: string;
  scope: 'all' | string[];
  onChange: (next: 'all' | string[]) => void;
}) {
  const cats = useMemo(() => getTopicsForPaperLevel(level), [level]);
  const allTopics = useMemo(() => cats.flatMap((c) => c.topics), [cats]);
  const isAll = scope === 'all';
  const selected = useMemo(() => new Set(Array.isArray(scope) ? scope : allTopics), [scope, allTopics]);

  function toggleTopic(t: string) {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t); else next.add(t);
    if (next.size === allTopics.length) onChange('all');
    else onChange(Array.from(next));
  }

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Mode switch: cache every topic for this level, or hand-pick a subset. */}
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => onChange('all')}
          className={`px-2 py-0.5 rounded ${isAll ? 'bg-emerald-100 text-emerald-800 font-medium' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >All topics</button>
        <button
          // First click into custom mode pre-selects all topics so the picker is in a
          // "deselect what you don't want" state rather than "nothing chosen yet."
          onClick={() => onChange(isAll ? allTopics.slice() : (scope as string[]))}
          className={`px-2 py-0.5 rounded ${!isAll ? 'bg-blue-100 text-blue-800 font-medium' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >Pick topics</button>
        <span className="text-[11px] text-slate-400 ml-auto">
          {isAll ? `all ${allTopics.length}` : `${(scope as string[]).length} of ${allTopics.length}`}
        </span>
      </div>
      {!isAll && (
        <>
          <div className="flex items-center gap-3 text-[11px]">
            <button
              onClick={() => onChange(allTopics.slice())}
              className="text-blue-600 hover:underline"
            >Select all</button>
            <button
              onClick={() => onChange([])}
              className="text-slate-500 hover:underline"
            >Clear</button>
            <span className="text-slate-400 ml-auto">Click pills to toggle individual topics</span>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {cats.map((cat) => (
              <div key={cat.label}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">{cat.label}</div>
                <div className="flex flex-wrap gap-1">
                  {cat.topics.map((t) => {
                    const on = selected.has(t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTopic(t)}
                        className={`text-[11px] px-1.5 py-0.5 rounded border ${on ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                      >{t}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
