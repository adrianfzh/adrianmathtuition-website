'use client';
// ⭐ Star a paper (17 Sep 2026) — one tap on the row or the paper page. Posts
// to /api/portal/marking/star and refreshes so the list re-sorts (starred first).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-fetch';

export default function StarPaper({ runId, starred, size = 'sm' }: { runId: string; starred: boolean; size?: 'sm' | 'md' }) {
  const router = useRouter();
  const [on, setOn] = useState(starred);
  const [busy, setBusy] = useState(false);
  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();   // the row around it is a link
    if (busy) return;
    const next = !on;
    setOn(next); setBusy(true);
    try { await portalFetch('/api/portal/marking/star', { json: { runId, on: next }, fallback: 'save the star' }); router.refresh(); }
    catch { setOn(!next); }
    finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? 'Unstar this paper' : 'Star this paper'} title={on ? 'Starred — tap to unstar' : 'Star this paper'}
      className={`shrink-0 leading-none ${size === 'md' ? 'text-xl' : 'text-lg'} ${on ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'} transition-colors`}>
      {on ? '★' : '☆'}
    </button>
  );
}
