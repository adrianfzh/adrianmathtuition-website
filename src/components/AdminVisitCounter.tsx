'use client';

// Counts which admin pages get opened (6 Oct 2026, Adrian: "learn from my taps"). The
// dashboard's tools row reads the tally and shows the most opened pages. Since 8 Oct 2026
// the tally is shared (/api/admin/dash-taps) so every device shows the same row; the
// browser's copy only lets the row draw at once.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { TAPS_KEY, bumpTap, parseTaps, toolForPath } from '@/lib/admin-tools';

export function countAdminOpen(href: string) {
  try { localStorage.setItem(TAPS_KEY, JSON.stringify(bumpTap(parseTaps(localStorage.getItem(TAPS_KEY)), href))); } catch { /* nothing learnt */ }
  // …and in the shared tally, so the phone and the computer learn the same row (8 Oct 2026).
  try { void fetch('/api/admin/dash-taps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ href }), keepalive: true }).catch(() => {}); } catch { /* offline: this device still counted it */ }
}

export default function AdminVisitCounter() {
  const pathname = usePathname();
  useEffect(() => {
    const tool = pathname ? toolForPath(pathname) : null;
    if (tool) countAdminOpen(tool);
  }, [pathname]);
  return null;
}
