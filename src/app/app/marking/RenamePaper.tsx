'use client';
// ✏️ Rename a paper — the student's own name for it (17 Sep 2026). The title
// carries a small "rename" link; tapping it opens an inline input. Save posts
// to /api/portal/marking/label; "Use the original name" clears the label.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import { MAX_LABEL_LENGTH } from '@/lib/paper-label';

export default function RenamePaper({ runId, name, defaultName }: { runId: string; name: string; defaultName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [shown, setShown] = useState(name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(label: string | null) {
    setBusy(true); setErr(null);
    try {
      const d = await portalFetch<{ ok: boolean; name?: string }>('/api/portal/marking/label', { json: { runId, label }, fallback: 'save the name' });
      const next = d.name || defaultName;
      setShown(next); setDraft(next); setEditing(false);
      router.refresh();   // the Papers list reads the same column
    } catch (e) { setErr(portalMessage(e)); }
    finally { setBusy(false); }
  }

  if (!editing) {
    return (
      <h1 className="font-bold text-navy text-lg leading-snug break-words">
        {shown}{' '}
        <button type="button" onClick={() => { setDraft(shown); setEditing(true); }} aria-label="Rename this paper"
          className="align-middle text-[12px] font-semibold text-gray-400 hover:text-navy underline underline-offset-2">✏️ rename</button>
      </h1>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); save(draft); }} className="space-y-1.5" data-rename>
      <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={MAX_LABEL_LENGTH} autoFocus aria-label="Paper name"
        className="w-full text-base font-bold text-navy border border-navy/20 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-navy/20 bg-white" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !draft.trim()} className="text-xs font-semibold bg-navy text-white rounded-xl px-3 py-1.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setErr(null); }} className="text-xs font-semibold text-gray-600 border border-black/10 rounded-xl px-3 py-1.5">Cancel</button>
        {shown !== defaultName && (
          <button type="button" disabled={busy} onClick={() => save(null)} className="text-xs text-gray-500 underline underline-offset-2">Use the original name</button>
        )}
      </div>
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
    </form>
  );
}
