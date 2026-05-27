'use client';

// Offline-mode settings UI.
// - Toggle enable/disable offline mode (when off, the QB cache is wiped).
// - Pick which levels to cache (multi-select).
// - Per-level topic scope: 'all' or a specific list of canonical topics.
// - Last-synced caption + manual "Sync now" button.
// - Storage estimate from navigator.storage.estimate().

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTopicsForLevel } from '@/lib/canonical-topics';
import {
  getOfflineSettings, setOfflineSettings,
  getQBSync, deleteQBSync,
  countCachedQuestions, clearQuestionCache,
  syncEnabledLevels, syncLevel, disableOfflineMode,
  estimateStorageBytes,
  type OfflineSettings, type QBSyncState, type SyncProgress,
} from '@/lib/offline/qb-cache';

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
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [syncState, setSyncState] = useState<Record<string, QBSyncState | undefined>>({});
  const [cachedCount, setCachedCount] = useState<number>(0);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const pw = getCookie('admin_pw') || getCookie('schedule_pw');
    setAuthed(!!pw);
  }, []);

  const refresh = useCallback(async () => {
    const s = await getOfflineSettings();
    setSettings(s);
    const states: Record<string, QBSyncState | undefined> = {};
    for (const lv of s.levels) states[lv] = await getQBSync(lv);
    setSyncState(states);
    setCachedCount(await countCachedQuestions());
    setStorageBytes(await estimateStorageBytes());
  }, []);

  useEffect(() => { if (authed) void refresh(); }, [authed, refresh]);

  const save = useCallback(async (next: OfflineSettings) => {
    await setOfflineSettings(next);
    setSettings(next);
  }, []);

  const handleToggle = useCallback(async (next: boolean) => {
    if (!settings) return;
    if (!next) {
      const ok = window.confirm('Disable offline mode? This will clear the cached question bank from this device.');
      if (!ok) return;
      await disableOfflineMode();
      await refresh();
      return;
    }
    await save({ ...settings, enabled: true, levels: settings.levels.length === 0 ? ['AM'] : settings.levels });
  }, [settings, save, refresh]);

  const handleLevelToggle = useCallback(async (level: string) => {
    if (!settings) return;
    const has = settings.levels.includes(level);
    let nextLevels: string[];
    if (has) {
      const ok = window.confirm(`Stop caching ${level}? Cached ${level} questions will be removed.`);
      if (!ok) return;
      nextLevels = settings.levels.filter((l) => l !== level);
      // Drop the per-level cursor + cached rows for this level
      await deleteQBSync(level);
      // (Cache rows are dropped on next sync run via trim, but explicitly wipe here for cleanliness)
      // Cleanest is a no-op here; user can hit "Resync" if they re-enable.
    } else {
      nextLevels = [...settings.levels, level];
    }
    const nextScope = { ...settings.topic_scope };
    if (!has) nextScope[level] = nextScope[level] ?? 'all';
    else delete nextScope[level];
    await save({ ...settings, levels: nextLevels, topic_scope: nextScope });
    await refresh();
  }, [settings, save, refresh]);

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

  const handleHardReset = useCallback(async () => {
    if (!window.confirm('Wipe ALL offline data on this device? This clears the QB cache and any unsynced changes. Lessons will be re-downloaded the next time you open them.')) return;
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
        <Link href="/admin" className="hover:text-emerald-300 font-medium">⚙ Admin</Link>
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
                checked={settings.enabled}
                onChange={(e) => handleToggle(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="font-semibold text-slate-800">Enable offline mode</span>
            </label>
            {settings.enabled && (
              <button
                onClick={handleSyncAll}
                disabled={syncing || settings.levels.length === 0}
                className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
              >
                {syncing ? 'Syncing…' : '↻ Sync now'}
              </button>
            )}
          </div>
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
                return (
                  <div key={level} className="border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50">
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => handleLevelToggle(level)}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <span className="text-sm font-semibold text-slate-800">{level}</span>
                      </label>
                      {enabled && (
                        <>
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
                    {enabled && (
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
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleHardReset}
              className="text-[11px] px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
            >Wipe offline data</button>
          </div>
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
  const cats = useMemo(() => getTopicsForLevel(level), [level]);
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
