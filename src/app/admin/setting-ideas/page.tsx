'use client';

// /admin/setting-ideas — ⚙️ settings students asked the Telegram bot for that do not exist yet
// (5 Nov 2026, Adrian: "but it can suggest to me, and i decide if we add that settings > build
// this (alert me in admin and telegram)"). One card per idea: how many students asked, their own
// words, when, and 👍 Add it / 👎 No — the same two buttons as the Telegram card. 👍 only puts it
// on the to-build list (the "To build" tab); nothing is built or switched on. 👎 stops the bot's
// alerts about it. Data: GET|PATCH /api/admin/setting-ideas. Rules: lib/setting-ideas.ts.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import { countLine, IDEA_STATUS_LABEL, type IdeaRow, type IdeaStatus } from '@/lib/setting-ideas';

const when = (iso: string) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const STATUS_TONE: Record<IdeaStatus, string> = {
  new: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-neutral-200 text-neutral-600',
};

export default function SettingIdeasPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [rows, setRows] = useState<IdeaRow[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<IdeaStatus | 'all'>('new');
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/setting-ideas', { cache: 'no-store' });
    if (r.status === 401) { setAuthed(false); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || `HTTP ${r.status}`); return; }
    setRows(d.ideas); setError('');
  }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function patch(id: number, body: { status?: IdeaStatus; adminNote?: string }) {
    setBusy(id);
    try {
      const r = await fetch('/api/admin/setting-ideas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `HTTP ${r.status}`); return; }
      setRows(d.ideas); setError('');
    } finally { setBusy(null); }
  }

  if (authed === false) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <form className="bg-white rounded-2xl p-6 w-full max-w-xs space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); }}>
          <h1 className="font-semibold">Admin</h1>
          <PasswordInput className="w-full border rounded-lg px-3 py-2" placeholder="Admin password" value={pw} onChange={setPw} autoFocus />
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm font-semibold" disabled={!pw}>Enter</button>
        </form>
      </main>
    );
  }

  const count = (s: IdeaStatus) => rows?.filter((r) => r.status === s).length ?? 0;
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter);
  const TABS: { key: IdeaStatus | 'all'; label: string }[] = [
    { key: 'new', label: `New · ${count('new')}` },
    { key: 'approved', label: `To build · ${count('approved')}` },
    { key: 'declined', label: `No · ${count('declined')}` },
    { key: 'all', label: `All · ${rows?.length ?? 0}` },
  ];

  return (
    <main className="min-h-screen bg-neutral-100 pb-10">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <Link href="/admin" className="text-sm text-neutral-500 shrink-0">‹ Admin</Link>
            <h1 className="text-lg font-bold truncate">⚙️ Setting ideas</h1>
          </div>
          <button onClick={load} className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5" aria-label="Refresh">↻</button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 border ${filter === t.key ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
        <p className="text-sm text-neutral-600">
          Settings students asked the bot for that don&apos;t exist yet. The bot changed nothing.
          <br /><b>👍 Add it</b> puts it on the to-build list. <b>👎 No</b> stops the alerts.
        </p>
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
        {!rows && !error && <p className="text-sm text-neutral-500 text-center py-10">Loading…</p>}
        {rows && shown.length === 0 && <p className="text-sm text-neutral-500 text-center py-10">Nothing here.</p>}
        {shown.map((r) => <Card key={r.id} r={r} busy={busy === r.id} onPatch={(b) => patch(r.id, b)} />)}
      </div>
    </main>
  );
}

function Card({ r, busy, onPatch }: { r: IdeaRow; busy: boolean; onPatch: (b: { status?: IdeaStatus; adminNote?: string }) => void }) {
  const [note, setNote] = useState(r.admin_note ?? '');
  return (
    <article className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold text-[16px] leading-snug min-w-0">&ldquo;{r.name}&rdquo;</h2>
        <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_TONE[r.status]}`}>{IDEA_STATUS_LABEL[r.status]}</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600"><b>{countLine(r)}</b> · first {when(r.first_asked_at)}{r.last_asked_at !== r.first_asked_at ? ` · latest ${when(r.last_asked_at)}` : ''}</p>
      <ul className="mt-2 space-y-1">
        {r.asks.map((a, i) => (
          <li key={i} className="text-sm text-neutral-800">
            <span className="text-neutral-500">{a.who || 'A student'}:</span> &ldquo;{a.words}&rdquo;
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {r.status !== 'approved' && (
          <button disabled={busy} onClick={() => onPatch({ status: 'approved' })}
            className="text-sm font-semibold rounded-lg px-3 py-1.5 bg-emerald-600 text-white disabled:opacity-50">👍 Add it</button>
        )}
        {r.status !== 'declined' && (
          <button disabled={busy} onClick={() => onPatch({ status: 'declined' })}
            className="text-sm font-semibold rounded-lg px-3 py-1.5 border border-neutral-300 text-neutral-700 disabled:opacity-50">👎 No</button>
        )}
        {r.status !== 'new' && (
          <button disabled={busy} onClick={() => onPatch({ status: 'new' })}
            className="text-sm rounded-lg px-3 py-1.5 text-neutral-500 underline disabled:opacity-50">Undo</button>
        )}
      </div>
      {r.decided_at && <p className="mt-1 text-xs text-neutral-400">Decided {when(r.decided_at)}{r.decided_by ? ` in ${r.decided_by === 'telegram' ? 'Telegram' : 'the admin site'}` : ''}</p>}
      <input value={note} onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if ((r.admin_note ?? '') !== note.trim()) onPatch({ adminNote: note }); }}
        placeholder="Your note (only you see it)"
        className="mt-2 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm" />
    </article>
  );
}
