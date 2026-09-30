'use client';
// /admin/figures-check — ✅ Check fixes (30 Sep 2026). Only the repaired or
// redrawn figures, one card each, three answers: Approve · Not good enough
// (+ why) · Redraw. Adrian: "i only need the fixed diagrams or redrawn diagrams
// in front of me, then i click approve or a comment to say why it is still not
// good enough, or just redraw". Data + writes: /api/admin/figures-bank
// kind=check (lib/figure-check.ts).

import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

type Item = {
  lane: 'solution' | 'question'; path: string; qid: string;
  level: string | null; school: string | null; year: number | null; paper: string | null; qnum: string | null;
  partLabel: string | null; beforeUrl: string; afterUrl: string;
  whatChanged: string | null; holdReason: string | null;
};

const PAGE = 12;

function title(it: Item) {
  const bits = [it.school, it.year, it.paper ? `P${String(it.paper).replace(/^P(aper)?\s*/i, '')}` : null, it.qnum ? `Q${it.qnum}` : null, it.partLabel]
    .filter(Boolean).join(' ');
  return bits || it.qid.slice(0, 8);
}

function Card({ it, onDone }: { it: Item; onDone: () => void }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState('');
  const [showBefore, setShowBefore] = useState(false);

  async function act(action: 'approve' | 'redo' | 'redraw') {
    setBusy(action); setErr('');
    try {
      const r = await fetch('/api/admin/figures-bank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'check', lane: it.lane, path: it.path, questionId: it.qid, action, comment }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error ?? `failed (${r.status})`); setBusy(''); return; }
      onDone();
    } catch (e) { setErr(String(e)); setBusy(''); }
  }

  return (
    <article className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold text-navy">{title(it)}</p>
        <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${it.lane === 'solution' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
          {it.lane === 'solution' ? 'Solution figure' : 'Question figure'}{it.level ? ` · ${it.level}` : ''}
        </span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={it.afterUrl} alt="the fixed figure" className="w-full max-h-[70vh] object-contain rounded-xl border border-gray-100 bg-white" />
      {it.whatChanged && <p className="text-[12px] text-gray-500">{it.whatChanged.replace(/^#B\d+-\d+\s*·?\s*/, '')}</p>}
      {it.holdReason && <p className="text-[12px] text-amber-700">⚠ {it.holdReason}</p>}

      <button type="button" onClick={() => setShowBefore(v => !v)} className="text-[12px] font-semibold text-gray-500 underline underline-offset-2">
        {showBefore ? 'Hide the old one' : 'Show the old one'}
      </button>
      {showBefore && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.beforeUrl} alt="the figure before" className="w-full max-h-[40vh] object-contain rounded-xl border border-gray-100 opacity-80" />
      )}

      {asking ? (
        <div className="space-y-2">
          <textarea autoFocus value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="What is still wrong?" className="w-full rounded-xl border border-gray-200 p-2.5 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={!comment.trim() || !!busy} onClick={() => act('redo')}
              className="flex-1 rounded-xl bg-amber-600 text-white font-semibold py-2.5 disabled:opacity-40">{busy === 'redo' ? 'Sending…' : 'Send back'}</button>
            <button type="button" onClick={() => { setAsking(false); setComment(''); }} className="rounded-xl border border-gray-200 px-4 font-semibold text-gray-600">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" disabled={!!busy} onClick={() => act('approve')}
            className="rounded-xl bg-emerald-600 text-white font-semibold py-2.5 disabled:opacity-40">{busy === 'approve' ? '…' : '✓ Approve'}</button>
          <button type="button" disabled={!!busy} onClick={() => setAsking(true)}
            className="rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-semibold py-2.5 disabled:opacity-40">💬 Not good enough</button>
          <button type="button" disabled={!!busy} onClick={() => act('redraw')}
            className="rounded-xl bg-white text-navy border border-gray-300 font-semibold py-2.5 disabled:opacity-40">{busy === 'redraw' ? '…' : '✏️ Redraw'}</button>
        </div>
      )}
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
    </article>
  );
}

export default function FiguresCheckPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [sentBack, setSentBack] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/admin/figures-bank?kind=check&page=0&pageSize=${PAGE}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `failed (${r.status})`);
      setItems(j.items ?? []); setTotal(j.total ?? 0); setSentBack(j.sentBack ?? 0);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (authed === null) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  if (!authed) return (
    <form className="p-6 max-w-sm mx-auto space-y-3" onSubmit={async e => { e.preventDefault(); setAuthed(await loginAdminSession(pw)); }}>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Admin password" className="w-full rounded-xl border p-2.5" />
      <button className="w-full rounded-xl bg-navy text-white font-semibold py-2.5">Sign in</button>
    </form>
  );

  const left = Math.max(0, total - done.length);
  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <a href="/admin/figures-bank" className="text-sm font-semibold text-navy">← Figures</a>
          {sentBack > 0 && <span className="text-[12px] text-gray-500">{sentBack} sent back, waiting for a redo</span>}
        </div>
        <h1 className="text-xl font-bold text-navy">Check fixed figures</h1>
        <p className="text-sm text-gray-600">{left === 0 && !loading ? 'Nothing to check.' : `${left} to check.`}</p>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {items.map(it => (
          <Card key={`${it.lane}:${it.path}`} it={it} onDone={() => {
            setDone(d => [...d, it.path]);
            setItems(xs => xs.filter(x => x.path !== it.path));
          }} />
        ))}
        {!loading && items.length === 0 && left > 0 && (
          <button type="button" onClick={() => { setDone([]); load(); }} className="w-full rounded-xl bg-navy text-white font-semibold py-3">Next {Math.min(PAGE, left)} ›</button>
        )}
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
      </div>
    </div>
  );
}
