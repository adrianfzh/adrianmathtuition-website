'use client';

// Compact online/offline + sync-status pill for the lesson editor top bar.
// Subscribes to the sync engine and renders one of:
//   - 🟢 Online · all saved
//   - 🟢 Syncing 2 of 3…
//   - 🔴 Offline · 3 pending
//   - ⚠ 2 failed (click to retry)

import { useEffect, useState } from 'react';
import { initSyncEngine, subscribeSync, kickSync, getSyncState, type SyncState } from './sync';

export function SyncStatusPill() {
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    initSyncEngine();
    return subscribeSync(setState);
  }, []);

  const { online, syncing, pendingCount, failedCount } = state;

  let label = '';
  let cls = '';
  let title = '';

  if (failedCount > 0) {
    label = `⚠ ${failedCount} failed`;
    cls = 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30';
    title = state.lastError ?? 'Click to retry';
  } else if (!online) {
    label = pendingCount > 0 ? `🔴 Offline · ${pendingCount} pending` : '🔴 Offline';
    cls = 'bg-rose-500/20 text-rose-200';
    title = pendingCount > 0 ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} will sync when back online` : 'All changes saved locally';
  } else if (syncing) {
    label = pendingCount > 0 ? `🟡 Syncing ${pendingCount}…` : '🟡 Syncing…';
    cls = 'bg-yellow-500/20 text-yellow-100';
    title = 'Syncing changes to server';
  } else if (pendingCount > 0) {
    label = `🟡 ${pendingCount} pending`;
    cls = 'bg-yellow-500/20 text-yellow-100';
    title = 'Click to retry sync';
  } else {
    label = '🟢 Saved';
    cls = 'bg-emerald-500/20 text-emerald-200';
    title = state.lastSyncedAt ? `Last synced ${new Date(state.lastSyncedAt).toLocaleTimeString()}` : 'All changes saved';
  }

  return (
    <button
      onClick={() => { void kickSync(); }}
      title={title}
      className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}
