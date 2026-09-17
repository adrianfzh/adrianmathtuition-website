'use client';
// 🗂 Archive / restore a paper (17 Sep 2026) — a small text link. Posts to
// /api/portal/marking/archive; the list re-sorts on refresh.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

export default function ArchivePaper({ runId, archived, className = '' }: { runId: string; archived: boolean; className?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(archived);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    const next = !on;
    setBusy(true); setErr(null);
    try { await portalFetch('/api/portal/marking/archive', { json: { runId, on: next }, fallback: next ? 'archive the paper' : 'restore the paper' }); setOn(next); router.refresh(); }
    catch (e2) { setErr(portalMessage(e2)); }
    finally { setBusy(false); }
  }
  return (
    <span className={className}>
      <button type="button" onClick={toggle} disabled={busy} className="text-[12px] font-semibold text-gray-400 hover:text-navy underline underline-offset-2 disabled:opacity-50">
        {on ? '↩ Put back in my list' : '🗂 Archive'}
      </button>
      {err && <span className="ml-2 text-[12px] text-rose-700">{err}</span>}
    </span>
  );
}
