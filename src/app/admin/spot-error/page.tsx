'use client';

// /admin/spot-error — 🔍 Spot-the-error cards waiting for Adrian (SPEC-SPOT-ERROR.md).
// Each card was RE-WRITTEN from a real mistake on a marked paper (new numbers,
// new setting, same mistake) or hand-made from a real-world slip. Nothing here
// reaches a student until he presses Approve. Each card is drawn with the same
// component a student would use, opened fully so every line can be read.

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import SpotErrorCard from '@/components/SpotErrorCard';
import { ERROR_KIND_LABEL, isErrorKind } from '@/lib/error-kinds';
import type { AutopsyPayload } from '@/lib/learn-types';
import type { SpotRow } from '@/app/api/admin/spot-error/route';

const TABS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
] as const;

const LEVEL: Record<string, string> = { S1: 'Sec 1', S2: 'Sec 2', EM: 'E Math', AM: 'A Math', JC: 'H2 Math' };

export default function SpotErrorReview() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pending');
  const [rows, setRows] = useState<SpotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/spot-error?status=${tab}`);
      if (r.ok) setRows((await r.json()).rows ?? []);
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { ensureAdminSession().then(ok => { if (ok) setAuthed(true); }); }, []);
  useEffect(() => { if (authed) void load(); }, [authed, load]);

  async function act(id: string, action: 'approve' | 'reject' | 'pending') {
    setBusy(id);
    try {
      const r = await fetch('/api/admin/spot-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
      if (r.ok) setRows(prev => prev.filter(x => x.id !== id));
      else alert((await r.json().catch(() => ({}))).error ?? 'Could not save');
    } finally { setBusy(null); }
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-100">
        <form className="bg-white rounded-xl shadow p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <div className="font-semibold text-neutral-800">🔍 Spot the error</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password"
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm">Enter</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <a href="/admin" className="text-neutral-400 hover:text-neutral-600 text-sm">← Hub</a>
          <h1 className="text-lg font-semibold text-neutral-800">🔍 Spot the error</h1>
          <button onClick={() => void load()} className="ml-auto text-sm text-neutral-500 hover:text-neutral-800" disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
        </header>
        <p className="text-sm text-neutral-600 px-1">
          Each card was re-written from a real mistake on a marked paper — new numbers, new setting, the same mistake —
          or made from a slip in a real video. No student sees one until you press <b>Approve</b>.
        </p>
        <div className="flex gap-2 px-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm rounded-full px-3 py-1 border ${tab === t.key ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {!loading && rows.length === 0 && <p className="text-sm text-neutral-500 px-1">Nothing here.</p>}
        {rows.map(r => {
          const p = r.payload as unknown as AutopsyPayload & { source?: string; error_kind?: string };
          const kind = isErrorKind(p.error_kind) ? ERROR_KIND_LABEL[p.error_kind] : p.error_kind;
          return (
            <section key={r.id} className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-neutral-100 text-neutral-700 px-2 py-0.5">{LEVEL[r.subject] ?? r.subject} · {r.topic}</span>
                <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5">{p.source === 'real-world' ? '🌍 Real world' : '📝 From a marked paper'}</span>
                {kind && <span className="rounded-full bg-rose-50 text-rose-700 px-2 py-0.5">{kind}</span>}
              </div>
              <h2 className="font-semibold text-neutral-800">{r.title}</h2>
              <SpotErrorCard payload={p} revealed />
              <div className="flex gap-2 pt-1">
                {r.status !== 'approved' && (
                  <button disabled={busy === r.id} onClick={() => void act(r.id, 'approve')}
                    className="text-sm font-semibold bg-emerald-600 text-white rounded-lg px-3.5 py-1.5 disabled:opacity-50">✓ Approve</button>
                )}
                {r.status !== 'rejected' && (
                  <button disabled={busy === r.id} onClick={() => void act(r.id, 'reject')}
                    className="text-sm font-semibold bg-white border border-neutral-300 text-neutral-700 rounded-lg px-3.5 py-1.5 disabled:opacity-50">✗ Reject</button>
                )}
                {r.status !== 'pending' && (
                  <button disabled={busy === r.id} onClick={() => void act(r.id, 'pending')}
                    className="text-sm text-neutral-500 rounded-lg px-2 py-1.5 disabled:opacity-50">Back to waiting</button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
