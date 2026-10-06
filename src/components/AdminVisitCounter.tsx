'use client';

// Counts which admin pages get opened, on this device (6 Oct 2026, Adrian: "learn from
// my taps"). The dashboard's tools row reads the tally and shows the most opened pages.
// Nothing leaves the browser; a blocked or private store simply means nothing is learnt.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { TAPS_KEY, bumpTap, parseTaps, toolForPath } from '@/lib/admin-tools';

export function countAdminOpen(href: string) {
  try { localStorage.setItem(TAPS_KEY, JSON.stringify(bumpTap(parseTaps(localStorage.getItem(TAPS_KEY)), href))); } catch { /* nothing learnt */ }
}

export default function AdminVisitCounter() {
  const pathname = usePathname();
  useEffect(() => {
    const tool = pathname ? toolForPath(pathname) : null;
    if (tool) countAdminOpen(tool);
  }, [pathname]);
  return null;
}
