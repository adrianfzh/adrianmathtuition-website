'use client';

// Top-bar indicator + shortcut to /admin/offline.
// Three visual states:
//   - Offline mode OFF        → ⚙ Offline · off   (slate, muted)
//   - ON, network online      → ⚙ Offline · on    (emerald dot)
//   - ON, currently offline   → 📦 Offline mode   (amber, "you're working from cache")
//
// Auto-refreshes when the user returns from the settings page via visibilitychange.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getOfflineSettings } from './qb-cache';

export function OfflineModePill() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const refresh = useCallback(async () => {
    try {
      const s = await getOfflineSettings();
      setEnabled(s.enabled && s.levels.length > 0);
    } catch { setEnabled(false); }
  }, []);

  // Read offline settings on mount; setState is intentional (loading external state).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const h = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  let label: React.ReactNode;
  let cls: string;
  let title: string;

  if (enabled === null) {
    label = '⚙ Offline';
    cls = 'bg-slate-700/40 hover:bg-slate-600/60 text-slate-300';
    title = 'Offline mode settings';
  } else if (!enabled) {
    label = (
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" aria-hidden />
        <span>Offline: off</span>
      </span>
    );
    cls = 'bg-slate-700/40 hover:bg-slate-600/60 text-slate-300';
    title = 'Offline mode is off. Click to enable and pick what to cache.';
  } else if (!online) {
    label = (
      <span className="flex items-center gap-1">
        <span>📦</span>
        <span>Offline · cache</span>
      </span>
    );
    cls = 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-100';
    title = 'You are offline and reading from the cached question bank.';
  } else {
    label = (
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />
        <span>Offline: on</span>
      </span>
    );
    cls = 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100';
    title = 'Offline mode is enabled. The question bank is cached on this device.';
  }

  return (
    <Link
      href="/admin/offline"
      title={title}
      className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${cls}`}
    >
      {label}
    </Link>
  );
}
