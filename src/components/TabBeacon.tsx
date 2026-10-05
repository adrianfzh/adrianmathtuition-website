'use client';

// Which app tabs students open (6 Oct 2026). Mounted ONCE in the app shell
// (src/app/app/layout.tsx), only for a real student — never on Adrian's admin
// cookie, never for the demo student (the route skips both again). On each
// route change under /app it names the tab (lib/portal-tabs.ts tabForPath, a
// fixed short name, never the URL) and posts {kind:'tab:view', detail} to
// /api/portal/event — at most once per tab per device per 30 minutes
// (localStorage; storage that throws simply sends). Renders nothing; a failure
// is swallowed, the page never notices.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { TAB_VIEW_KIND, shouldSendTabView, tabForPath } from '@/lib/portal-tabs';

const KEY = 'portal_tab_view:';

export default function TabBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const tab = tabForPath(pathname);
    if (!tab) return;
    const now = Date.now();
    let last: number | null = null;
    try { const v = window.localStorage.getItem(KEY + tab); last = v ? Number(v) : null; } catch { /* no storage → send */ }
    if (!shouldSendTabView(last, now)) return;
    try { window.localStorage.setItem(KEY + tab, String(now)); } catch { /* ignore */ }
    try {
      fetch('/api/portal/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: TAB_VIEW_KIND, detail: tab }),
        keepalive: true,
      }).catch(() => { /* fire-and-forget */ });
    } catch { /* fire-and-forget */ }
  }, [pathname]);
  return null;
}
