'use client';
// 🔗 "Belongs to a paper" (18 Sep 2026, Adrian: "idea is to let students see
// their work organized too"): a Practice Again sheet that arrived with no link
// — a photo handed in through the general door, or a Telegram hand-in — is
// tied to its paper by Adrian in one tap. POST /api/admin/papers {runId,
// belongsTo} writes the same kind of link the automatic sheets carry, so every
// screen (his tab, the student's Papers page, the directory) groups it the
// same way. `belongsTo: null` undoes it. Nothing else changes.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BelongsTo({ runId, options, linked = false }: { runId: string; options: { id: string; name: string }[]; linked?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function post(belongsTo: string | null) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/admin/papers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, belongsTo }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not save.'); return; }
      setOpen(false); router.refresh();
    } catch { setErr('Network error.'); }
    finally { setBusy(false); }
  }
  if (linked) {
    return <button type="button" disabled={busy} onClick={e => { e.preventDefault(); if (window.confirm('Unlink this sheet from its paper? It goes back to being its own card.')) post(null); }} className="text-gray-400 underline disabled:opacity-50">unlink</button>;
  }
  if (!options.length) return null;
  if (!open) return <button type="button" onClick={e => { e.preventDefault(); setOpen(true); }} className="text-sky-700 underline" title="File this sheet under the paper it practises">belongs to a paper ▾</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <select value={pick} onChange={e => setPick(e.target.value)} aria-label="Which paper" className="text-[12px] border border-navy/20 rounded-lg px-2 py-1 bg-white max-w-[260px]">
        <option value="">Which paper?</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button type="button" disabled={busy || !pick} onClick={() => post(pick)} className="text-[11.5px] font-bold bg-navy text-white rounded-lg px-2 py-1 disabled:opacity-50">{busy ? '…' : 'Link'}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-[11.5px] text-gray-500">Cancel</button>
      {err && <span className="text-[11px] text-rose-700">{err}</span>}
    </span>
  );
}
