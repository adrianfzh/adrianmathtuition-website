'use client';
// ✓ Looked at, on Adrian's Papers tab (18 Sep 2026 — "which ones are the ones i
// haven't looked at? i can't tell"). The same stamp as the desk's ✓ Looked at
// (paper_marking_runs.checked_at via /api/admin/papers {runId, checked}); the
// desk's Completed lane and this tab read one field. Undo clears it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LookedAt({ runId, needsLook, checkedAt }: { runId: string; needsLook: boolean; checkedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function set(checked: boolean) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/admin/papers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, checked }) });
      if (!r.ok) { setErr('Could not save.'); return; }
      router.refresh();
    } catch { setErr('Network error.'); }
    finally { setBusy(false); }
  }
  if (needsLook) {
    return <span className="inline-flex items-center gap-1.5"><button type="button" disabled={busy} onClick={e => { e.preventDefault(); set(true); }} className="font-bold text-amber-800 underline disabled:opacity-50">✓ Looked at</button>{err && <span className="text-rose-700">{err}</span>}</span>;
  }
  if (checkedAt) {
    const day = new Date(checkedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
    return <span className="inline-flex items-center gap-1.5 text-gray-400">looked at {day} · <button type="button" disabled={busy} onClick={e => { e.preventDefault(); set(false); }} className="underline disabled:opacity-50">undo</button>{err && <span className="text-rose-700">{err}</span>}</span>;
  }
  return null;
}
