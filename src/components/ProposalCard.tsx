'use client';

// One proposal waiting for his Ship, with ✅ Ship · ✏️ Change · 🗑 Drop. Shown on the /admin
// dashboard itself (23 Oct 2026, Adrian: "just put it on the page itself, so i will see
// immediately and act on it") and on /admin/overnight. Files the same request the Telegram
// buttons file (POST /api/admin/overnight); the answer still comes in Telegram.

import { useState } from 'react';
import { requestWords, waitingWords, type OpenProposal, type RequestState } from '@/lib/overnight';

export default function ProposalCard({ p, req, onDone }: { p: OpenProposal; req?: RequestState; onDone: () => void }) {
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const inFlight = req && (req.status === 'pending' || req.status === 'running');

  async function send(action: 'ship' | 'change' | 'drop') {
    const ask = action === 'ship' ? `Ship "${p.title}"?\n\nThis makes the change live.`
      : action === 'drop' ? `Drop "${p.title}"?\n\nThe change is thrown away.`
      : `Send this change for "${p.title}"?\n\n${note.trim()}`;
    if (!window.confirm(ask)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/overnight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: p.slug, action, note: action === 'change' ? note : undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setMsg({ text: d.duplicate ? d.message : 'Sent. The answer comes in Telegram.' });
      setChanging(false); setNote('');
      onDone();
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }); }
    finally { setBusy(false); }
  }

  return (
    <article className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-3">
      <div>
        <h3 className="text-[16px] font-bold text-neutral-900 leading-snug">{p.title}</h3>
        <div className="text-xs text-neutral-500 mt-0.5">
          {p.approved ? 'you said yes — only your Ship is left' : waitingWords(p.days)}{p.repo === 'website' ? ' · the website' : ''}
        </div>
      </div>

      {p.problem ? (
        <div className="space-y-2 text-[14px] leading-relaxed text-neutral-800">
          <Part label="Problem" text={p.problem} />
          {p.solution && <Part label="Solution" text={p.solution} />}
          {p.fix && <Part label="Fix" text={p.fix} />}
        </div>
      ) : (
        <p className="text-[14px] leading-relaxed text-neutral-800">{p.text ? cap(p.text) : 'No plain line written yet.'}</p>
      )}

      {req && <div className={`text-sm rounded-lg px-3 py-2 ${req.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-neutral-50 text-neutral-700'}`}>{requestWords(req)}</div>}

      {!inFlight && !changing && (
        <div className="grid grid-cols-3 gap-2">
          <button disabled={busy} onClick={() => send('ship')} className="rounded-xl bg-emerald-700 text-white py-2.5 text-sm font-semibold disabled:opacity-50">✅ Ship</button>
          <button disabled={busy} onClick={() => setChanging(true)} className="rounded-xl border border-neutral-300 text-neutral-800 py-2.5 text-sm font-semibold disabled:opacity-50">✏️ Change</button>
          <button disabled={busy} onClick={() => send('drop')} className="rounded-xl border border-neutral-300 text-neutral-600 py-2.5 text-sm font-semibold disabled:opacity-50">🗑 Drop</button>
        </div>
      )}
      {changing && (
        <div className="space-y-2">
          <label className="block text-sm text-neutral-700" htmlFor={`note-${p.slug}`}>What should change? One or two sentences.</label>
          <textarea id={`note-${p.slug}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-base" placeholder="e.g. say it in fewer words" />
          <div className="flex gap-2">
            <button disabled={busy || !note.trim()} onClick={() => send('change')} className="flex-1 rounded-xl bg-neutral-900 text-white py-2.5 text-sm font-semibold disabled:opacity-40">Send change</button>
            <button disabled={busy} onClick={() => { setChanging(false); setNote(''); }} className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600">Cancel</button>
          </div>
        </div>
      )}
      {msg && <div className={`text-sm ${msg.bad ? 'text-red-700' : 'text-emerald-800'}`}>{msg.text}</div>}
    </article>
  );
}

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function Part({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="break-words">{cap(text)}</div>
    </div>
  );
}
