'use client';

// /admin/suggestions — 💡 what students asked for (5 Oct 2026, Adrian: "a suggestion
// button … students can suggest what they need for their exams, if reasonable and
// helpful - i will try to add it"). Every suggestion, new ones first ("Anonymous" when
// the student ticked Stay anonymous — the row holds no identity at all); a status button
// row per card (New · Planned · Done · Not now) and a private note. Students never see
// the status or the note. Data: GET|PATCH /api/admin/suggestions.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import { STATUS_LABEL, SUGGESTION_STATUSES, type SuggestionStatus } from '@/lib/suggestions';
import type { SuggestionRow } from '@/lib/suggestions-store';

const when = (iso: string) => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const STATUS_TONE: Record<SuggestionStatus, string> = {
  new: 'bg-amber-500 text-white border-amber-500',
  planned: 'bg-blue-600 text-white border-blue-600',
  done: 'bg-emerald-600 text-white border-emerald-600',
  no: 'bg-neutral-500 text-white border-neutral-500',
};

type Filter = 'open' | 'all' | SuggestionStatus;

export default function SuggestionsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [rows, setRows] = useState<SuggestionRow[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('open');

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/suggestions', { cache: 'no-store' });
    if (r.status === 401) { setAuthed(false); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || `HTTP ${r.status}`); return; }
    setRows(d.suggestions); setError('');
  }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function patch(id: string, body: { status?: SuggestionStatus; adminNote?: string }) {
    const r = await fetch('/api/admin/suggestions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || `HTTP ${r.status}`); return; }
    setRows((rs) => rs?.map((x) => (x.id === id ? d.suggestion : x)) ?? null);
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

  const counts = Object.fromEntries(SUGGESTION_STATUSES.map((s) => [s, rows?.filter((r) => r.status === s).length ?? 0])) as Record<SuggestionStatus, number>;
  const shown = (rows ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'open' ? r.status === 'new' || r.status === 'planned' : r.status === filter);

  return (
    <main className="min-h-screen bg-neutral-100 pb-10">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <Link href="/admin" className="text-sm text-neutral-500 shrink-0">‹ Admin</Link>
            <h1 className="text-lg font-bold truncate">💡 Suggestions</h1>
          </div>
          <button onClick={load} className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5" aria-label="Refresh">↻</button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-1.5 overflow-x-auto">
          {(['open', 'new', 'planned', 'done', 'no', 'all'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 border ${filter === f ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-300'}`}>
              {f === 'open' ? `Open · ${counts.new + counts.planned}` : f === 'all' ? `All · ${rows?.length ?? 0}` : `${STATUS_LABEL[f]} · ${counts[f]}`}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
        {!rows && !error && <p className="text-sm text-neutral-500 text-center py-10">Loading…</p>}
        {rows && shown.length === 0 && <p className="text-sm text-neutral-500 text-center py-10">Nothing here.</p>}
        {shown.map((r) => <Card key={r.id} r={r} onPatch={(b) => patch(r.id, b)} />)}
      </div>
    </main>
  );
}

function Card({ r, onPatch }: { r: SuggestionRow; onPatch: (b: { status?: SuggestionStatus; adminNote?: string }) => void }) {
  const [note, setNote] = useState(r.admin_note ?? '');
  const studentHref = r.airtable_student_id?.startsWith('rec') ? `/admin/students/${r.airtable_student_id}` : null;
  const who = r.anonymous ? 'Anonymous' : (r.student_name || 'A student');
  return (
    <article className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={`font-semibold min-w-0 truncate${r.anonymous ? ' text-neutral-500 italic' : ''}`}>
          {studentHref ? <Link href={studentHref} className="hover:underline">{who}</Link> : who}
        </span>
        <span className="shrink-0 text-xs text-neutral-400">{when(r.created_at)}</span>
      </div>
      <p className="mt-2 text-[15px] leading-snug whitespace-pre-wrap text-neutral-900">{r.text}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTION_STATUSES.map((s) => (
          <button key={s} onClick={() => r.status !== s && onPatch({ status: s })}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${r.status === s ? STATUS_TONE[s] : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'}`}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if ((r.admin_note ?? '') !== note.trim()) onPatch({ adminNote: note }); }}
        placeholder="Your note (only you see it)"
        className="mt-2 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm" />
    </article>
  );
}
