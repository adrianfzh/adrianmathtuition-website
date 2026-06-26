'use client';

// Tiny indicator that sits next to SyncStatusPill. Hidden unless offline mode is
// enabled AND at least one cached level hasn't been synced in N days.
//
// Click → triggers `syncEnabledLevels()` and refreshes its own state.
// Auto-refreshes when the sync engine reports a successful drain, so the
// indicator disappears the moment a fresh sync lands.

import { useCallback, useEffect, useState } from 'react';
import {
  getOfflineSettings, getQBSync, syncEnabledLevels,
  type QBSyncState,
} from './qb-cache';
import { subscribeSync } from './sync';

const STALE_AFTER_DAYS = 7;
const STALE_AFTER_MS = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

interface StaleInfo {
  level: string;
  daysOld: number;
}

export function BankStalePill() {
  const [stale, setStale] = useState<StaleInfo | null>(null);
  const [syncing, setSyncing] = useState(false);

  const recompute = useCallback(async () => {
    try {
      const settings = await getOfflineSettings();
      if (!settings.enabled || settings.levels.length === 0) { setStale(null); return; }
      let oldest: StaleInfo | null = null;
      for (const level of settings.levels) {
        const st: QBSyncState | undefined = await getQBSync(level);
        if (!st?.last_synced_at) continue;
        const age = Date.now() - new Date(st.last_synced_at).getTime();
        if (age < STALE_AFTER_MS) continue;
        const days = Math.floor(age / (24 * 60 * 60 * 1000));
        if (!oldest || days > oldest.daysOld) oldest = { level, daysOld: days };
      }
      setStale(oldest);
    } catch { /* ignore — UI fallback to no pill */ }
  }, []);

  useEffect(() => { void recompute(); }, [recompute]);

  // Re-check whenever the lesson sync engine finishes a drain (lastSyncedAt changes).
  useEffect(() => {
    let lastSeen: string | null = null;
    return subscribeSync((s) => {
      if (s.lastSyncedAt && s.lastSyncedAt !== lastSeen) {
        lastSeen = s.lastSyncedAt;
        void recompute();
      }
    });
  }, [recompute]);

  // Recheck on visibility change so opening the tab after a few days shows the warning.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const h = () => { if (document.visibilityState === 'visible') void recompute(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [recompute]);

  const handleClick = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncEnabledLevels();
      await recompute();
    } finally { setSyncing(false); }
  }, [syncing, recompute]);

  if (!stale) return null;

  const label = syncing
    ? '↻ Syncing bank…'
    : `⌛ Bank ${stale.daysOld}d old`;
  const title = syncing
    ? 'Refreshing the cached question bank from server…'
    : `The cached question bank for ${stale.level} hasn't been refreshed in ${stale.daysOld} days. Click to sync now.`;

  return (
    <button
      onClick={handleClick}
      title={title}
      disabled={syncing}
      className="text-xs px-2.5 py-1 rounded font-medium bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
