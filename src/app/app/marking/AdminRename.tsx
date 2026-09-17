'use client';
// ✏️ Adrian renames a paper from his Papers tab (17 Sep 2026): edits
// paper_marking_runs.paper_name — HIS name for the paper (files, Dropbox, the
// desk); the student's own label, if they set one, stays theirs. Posts to
// /api/admin/papers {runId, name} with the admin cookie.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminRename({ runId, name }: { runId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === name) { setEditing(false); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/admin/papers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, name: next }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not rename.'); return; }
      setEditing(false); router.refresh();
    } catch { setErr('Network error.'); }
    finally { setBusy(false); }
  }
  if (!editing) {
    return <button type="button" onClick={e => { e.preventDefault(); setDraft(name); setEditing(true); }} className="text-sky-700 underline" title="Rename this paper (your name for it — files, Dropbox, the desk)">typed as “{name}” ✏️</button>;
  }
  return (
    <form onSubmit={save} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5">
      <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={120} autoFocus aria-label="Paper name" className="text-[12px] border border-navy/20 rounded-lg px-2 py-1 bg-white min-w-[220px]" />
      <button type="submit" disabled={busy} className="text-[11.5px] font-bold bg-navy text-white rounded-lg px-2 py-1 disabled:opacity-50">{busy ? '…' : 'Save'}</button>
      <button type="button" onClick={() => setEditing(false)} className="text-[11.5px] text-gray-500">Cancel</button>
      {err && <span className="text-[11px] text-rose-700">{err}</span>}
    </form>
  );
}
