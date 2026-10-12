'use client';

// /admin/overnight — what the machine did by itself overnight, and what waits for him
// (12 Oct 2026, Adrian: "all autofixes, auto-improvements, auto-whatever reports on the
// admin dashboard" → "build the overnight page").
//
// Top: three tiles, one big number each — Fixed by itself (last night) · Waiting for Ship
// (open proposals) · Needs your look (jobs that failed or went missing + the dashboard's
// own "needs you" counts). Then one card per open proposal with Ship · Change · Drop — the
// same request the Telegram buttons file; the answer still comes in Telegram. Then one line
// per night job, and a week per job folded away. Reads /api/admin/overnight (lib/overnight.ts)
// and the dashboard's /api/admin/glance. Phone first: he reads this on his phone.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import PasswordInput from '@/components/PasswordInput';
import type { Glance, Tile } from '@/lib/glance';
import { needsWords, requestWords, waitingWords, type JobHistory, type NightLine, type OpenProposal, type RequestState } from '@/lib/overnight';

type Data = {
  ledger: { ok: boolean; error?: string };
  open: OpenProposal[];
  requests: Record<string, RequestState>;
  night: { since: string; lines: NightLine[]; fixed: number };
  history: JobHistory[];
  stale: { job: string; name: string; reason: string }[];
  generatedAt: string;
};

/** The dashboard leaves this one out (Adrian, 6 Oct 2026); so does this page. */
const NEEDS_HIDDEN = new Set(['papers-to-check']);

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });
const dayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()}`;
};

export default function OvernightPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [needs, setNeeds] = useState<Tile[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { ensureAdminSession().then(setAuthed); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, g] = await Promise.all([
        fetch('/api/admin/overnight', { cache: 'no-store' }),
        fetch('/api/admin/glance', { cache: 'no-store' }).catch(() => null),
      ]);
      if (r.status === 401) { setAuthed(false); return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setData(d); setErr('');
      if (g && g.ok) {
        const gl = (await g.json()) as Glance;
        setNeeds((gl.sections.find((s) => s.id === 'needs')?.tiles ?? []).filter((t) => !NEEDS_HIDDEN.has(t.id)));
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (authed === false) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <form className="bg-white rounded-2xl border border-neutral-200 p-6 w-full max-w-xs space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await loginAdminSession(pw)) setAuthed(true); else setPwErr('Wrong password'); }}>
          <div className="font-semibold text-neutral-800">🌙 Overnight</div>
          <PasswordInput className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-base" placeholder="Admin password" value={pw} onChange={(v) => { setPw(v); setPwErr(''); }} autoFocus />
          {pwErr && <div className="text-sm text-red-600">{pwErr}</div>}
          <button className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-semibold">Enter</button>
        </form>
      </main>
    );
  }

  // the big number and what it is made of, in words (each part is listed again under "Needs your look")
  const needsW = needsWords(data?.stale.length ?? 0, needs);
  const needsCount = needsW.count;

  return (
    <main className="min-h-screen bg-neutral-100 pb-10">
      <header className="sticky top-0 z-10 bg-white border-b border-neutral-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="text-sm text-neutral-500">← Admin</Link>
          <h1 className="text-lg font-bold text-neutral-900">🌙 Overnight</h1>
          <button onClick={load} disabled={loading} className="ml-auto text-sm border border-neutral-200 rounded-lg px-3 py-1.5 text-neutral-600 disabled:opacity-50" aria-label="Refresh">
            {loading ? '…' : '↻'}
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-5">
        {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">Could not load: {err}</div>}
        {!data && !err && <div className="text-center text-neutral-500 py-16 text-sm">Reading last night…</div>}

        {data && (
          <>
            <section className="grid grid-cols-3 gap-2.5" aria-label="At a glance">
              <BigTile title="Fixed by itself" value={String(data.night.fixed)} sub="last night" colour="#11795e" href="#night" />
              <BigTile title="Waiting for Ship" value={data.ledger.ok ? String(data.open.length) : '?'} sub={data.ledger.ok ? 'proposals' : 'list not read'} colour="#1c64b0" href="#proposals" />
              <BigTile title="Needs your look" value={String(needsCount)} sub={needsW.sub} colour={needsCount ? '#b45309' : '#9ca3af'} href="#needs" />
            </section>

            {/* ── Waiting for Ship ── */}
            <section id="proposals" className="space-y-3 scroll-mt-16">
              <h2 className="text-base font-bold text-neutral-900">Waiting for you to Ship</h2>
              {!data.ledger.ok && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
                  Could not read the list of proposals.<br />
                  <span className="text-amber-700">{data.ledger.error}. They are still in Telegram.</span>
                </div>
              )}
              {data.ledger.ok && data.open.length === 0 && (
                <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-500">Nothing waiting. 🎉</div>
              )}
              {data.open.map((p) => <ProposalCard key={p.slug} p={p} req={data.requests[p.slug]} onDone={load} />)}
            </section>

            {/* ── Needs your look ── */}
            <section id="needs" className="space-y-2 scroll-mt-16">
              <h2 className="text-base font-bold text-neutral-900">Needs your look</h2>
              {needsCount === 0 && <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-500">Nothing. Every job ran.</div>}
              {needsW.parts.length > 1 && <p className="text-sm text-neutral-600">The {needsCount} is: {needsW.parts.join(' · ')}.</p>}
              {data.stale.length > 0 && (
                <ul className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                  {data.stale.map((s) => (
                    <li key={s.job} className="px-4 py-2.5 text-sm">
                      <div className="font-semibold text-neutral-900">⚠️ {s.name}</div>
                      <div className="text-neutral-600 break-words">{s.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
              {needs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {needs.map((t) => {
                    const body = <><b className="text-amber-700">{t.value}</b> {t.label.toLowerCase()}</>;
                    return t.href
                      ? <Link key={t.id} href={t.href} className="bg-white border border-neutral-200 rounded-full px-3 py-1.5 text-sm text-neutral-700">{body}</Link>
                      : <span key={t.id} className="bg-white border border-neutral-200 rounded-full px-3 py-1.5 text-sm text-neutral-700">{body}</span>;
                  })}
                </div>
              )}
            </section>

            {/* ── Last night ── */}
            <section id="night" className="space-y-2 scroll-mt-16">
              <h2 className="text-base font-bold text-neutral-900">What ran last night</h2>
              <p className="text-xs text-neutral-500">Since 6 pm yesterday.</p>
              <ul className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                {data.night.lines.map((l) => <NightRow key={l.job} l={l} />)}
              </ul>
            </section>

            {/* ── The week ── */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-neutral-900">The last 7 days</h2>
              <div className="space-y-2">
                {data.history.map((h) => <HistoryJob key={h.job} h={h} />)}
              </div>
            </section>

            <p className="text-center text-xs text-neutral-400 pt-2">Updated {time(data.generatedAt)}</p>
          </>
        )}
      </div>
    </main>
  );
}

function BigTile({ title, value, sub, colour, href }: { title: string; value: string; sub: string; colour: string; href: string }) {
  return (
    <a href={href} className="block bg-white border border-neutral-200 rounded-2xl px-3 py-3 min-w-0">
      <div className="text-[12px] leading-tight font-semibold text-neutral-600 min-h-[2.1em]">{title}</div>
      <div className="text-[44px] leading-none font-extrabold tabular-nums mt-1.5" style={{ color: colour }}>{value}</div>
      <div className="text-[11.5px] text-neutral-500 mt-1 truncate">{sub}</div>
    </a>
  );
}

function ProposalCard({ p, req, onDone }: { p: OpenProposal; req?: RequestState; onDone: () => void }) {
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

function NightRow({ l }: { l: NightLine }) {
  const dot = l.ok == null ? 'bg-neutral-300' : l.ok ? 'bg-emerald-600' : 'bg-red-500';
  const word = l.ok == null ? 'did not run' : l.ok ? 'ok' : 'failed';
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full flex-none ${dot}`} aria-hidden />
        <span className="text-[14px] font-semibold text-neutral-900 min-w-0">{l.name}</span>
        <span className="ml-auto text-xs text-neutral-500 whitespace-nowrap">{l.at ? `${time(l.at)} · ` : ''}<span className={l.ok === false ? 'text-red-600 font-semibold' : ''}>{word}</span></span>
      </div>
      {l.summary && <div className="mt-1 ml-[18px] text-[13.5px] leading-snug text-neutral-700 break-words">{l.summary}</div>}
    </li>
  );
}

function HistoryJob({ h }: { h: JobHistory }) {
  const ran = h.days.filter((d) => d.runs > 0).length;
  const failed = h.days.reduce((n, d) => n + d.failed, 0);
  const fixed = h.days.reduce((n, d) => n + d.fixed, 0);
  return (
    <details className="bg-white border border-neutral-200 rounded-xl">
      <summary className="px-4 py-3 cursor-pointer flex items-center gap-2 text-[14px]">
        <span className="font-semibold text-neutral-900 min-w-0">{h.name}</span>
        <span className="ml-auto flex items-center gap-[3px]" aria-label={`ran on ${ran} of ${h.days.length} days`}>
          {[...h.days].reverse().map((d) => (
            <i key={d.date} className={`inline-block w-2.5 h-2.5 rounded-sm ${d.runs === 0 ? 'bg-neutral-200' : d.failed ? 'bg-red-500' : 'bg-emerald-600'}`} title={dayLabel(d.date)} />
          ))}
        </span>
      </summary>
      <div className="px-4 pb-3 text-xs text-neutral-500">
        Ran on {ran} of {h.days.length} days{fixed ? ` · fixed ${fixed}` : ''}{failed ? ` · ${failed} failed` : ''}
      </div>
      <ul className="border-t border-neutral-100 divide-y divide-neutral-100">
        {h.days.map((d) => (
          <li key={d.date} className="px-4 py-2 text-[13px]">
            <div className="flex gap-2">
              <span className="w-12 flex-none font-semibold text-neutral-700">{dayLabel(d.date)}</span>
              <span className={`min-w-0 break-words ${d.runs === 0 ? 'text-neutral-400' : d.failed ? 'text-red-700' : 'text-neutral-600'}`}>
                {d.runs === 0 ? 'Did not run.' : d.summary || (d.failed ? 'Failed.' : 'Ran.')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
