'use client';
// "Choose papers" — the student's tick (Adrian, 11 Sep 2026: "build the student
// door with three-paper, 5-day limit"), the app's version of the desk's tick
// bar (/admin/desk, lib/desk-state tickPlan).
//
// The Papers list is a server component and stays one: this wraps it and, in
// tick mode, swaps the cards for a compact list of rows with a checkbox each.
// Everything it decides — which rows grey out and what the bar says — comes
// from lib/student-batch (pure, tested, and the same rules the request route
// enforces), so a tick that the screen allows is never bounced by the server.
import { useState } from 'react';
import Link from 'next/link';
import PaperSubjectPill from '@/components/PaperSubjectPill';
import { pickStates, tickBar, MAX_BATCH_PAPERS, type PickPaper } from '@/lib/student-batch';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)]';

function niceDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default function ChoosePapers({ papers, children }: { papers: PickPaper[]; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [strong, setStrong] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  // Fewer than two papers a student could ever tick together — there is no
  // choosing to do, so the control never appears.
  const open = papers.filter(p => !p.blocked);
  const pairable = open.some(p => open.some(o => o.id !== p.id && o.subject === p.subject));
  if (!pairable) return <>{children}</>;

  const states = pickStates(papers, ticked);
  const picked = ticked.map(id => papers.find(p => p.id === id)).filter((p): p is PickPaper => !!p);
  const bar = tickBar(picked);

  function toggle(p: PickPaper) {
    setErr(null); setStrong(null);
    setTicked(prev => (prev.includes(p.id) ? prev.filter(x => x !== p.id) : prev.length >= MAX_BATCH_PAPERS ? prev : [...prev, p.id]));
  }

  function leave() {
    setOn(false); setTicked([]); setErr(null); setStrong(null);
  }

  async function request() {
    setBusy(true); setErr(null); setStrong(null);
    try {
      const r = await fetch('/api/portal/practice-again/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runIds: ticked }),
      });
      const d = await r.json().catch(() => ({} as { error?: string; ok?: boolean; reason?: string; message?: string }));
      if (!r.ok) { setErr(d.error || 'Could not send the request — try again in a moment.'); return; }
      // "These papers are strong" comes back as an answer, not an error.
      if (d.ok === false && d.reason === 'strong') { setStrong(d.message || null); return; }
      setQueued(true); setTicked([]);
    } catch {
      setErr('Could not send the request — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (queued) {
    return (
      <>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">📘 One Practice Again sheet is being written for your papers</p>
          <p className="text-[12px] text-emerald-800/80 mt-0.5">
            The same gap in two papers becomes one section, so it is shorter than a sheet each. You get a message when it is ready — usually within the day.
          </p>
        </div>
        {children}
      </>
    );
  }

  if (!on) {
    return (
      <>
        <button type="button" onClick={() => setOn(true)}
          className="w-full flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-left hover:bg-emerald-50 transition-colors">
          <span aria-hidden className="text-lg">📘</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-emerald-900">Practice on two or three papers at once</span>
            <span className="block text-[12px] text-emerald-800/80">Choose papers and ask for one Practice Again sheet that covers them all.</span>
          </span>
          <span className="ml-auto shrink-0 text-emerald-800">›</span>
        </button>
        {children}
      </>
    );
  }

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy">Choose papers</p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Two or three papers of the same maths, marked in the last 5 days. One sheet covers all of them.
          </p>
        </div>
        <button type="button" onClick={leave} className="shrink-0 text-xs font-semibold text-navy border border-black/10 rounded-xl px-3 py-1.5">
          Done choosing
        </button>
      </div>

      <ul className="divide-y divide-black/5">
        {papers.map(p => {
          const s = states.get(p.id) ?? { disabled: false, note: null };
          const isOn = ticked.includes(p.id);
          return (
            <li key={p.id}>
              <label className={`flex items-start gap-3 py-2.5 ${s.disabled ? 'opacity-45' : 'cursor-pointer'}`}>
                <input
                  type="checkbox" checked={isOn} disabled={s.disabled} onChange={() => toggle(p)}
                  className="mt-0.5 w-5 h-5 shrink-0 accent-emerald-700"
                  aria-label={`Choose ${p.name}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-navy break-words">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-gray-500">
                    <PaperSubjectPill subject={p.subject} />
                    <span>{niceDate(p.date)}</span>
                    {s.note && <span className="text-gray-400">· {s.note}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-gray-600">{p.max > 0 ? `${p.awarded}/${p.max}` : '—'}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {strong && (
        // Adrian, 11 Sep 2026: "recommend new exam papers instead" — a strong
        // batch has nothing to teach, so the answer is a paper, not a sheet.
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[13px] text-amber-900">{strong}</p>
          <Link href="/app/print" className="inline-block mt-2 text-xs font-semibold bg-amber-800 text-white rounded-xl px-3 py-1.5">
            Print a new paper
          </Link>
        </div>
      )}
      {err && <p className="text-[12px] text-red-700">{err}</p>}

      {ticked.length > 0 && (
        <div className="sticky bottom-20 sm:bottom-3 flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-800 text-white px-3 py-2.5 shadow-[0_8px_24px_-10px_rgba(6,78,59,0.8)]">
          <span className="flex-1 min-w-[180px] text-[12.5px] leading-snug">{bar.line}</span>
          <button type="button" onClick={request} disabled={!bar.canRequest || busy}
            className="shrink-0 text-xs font-semibold bg-white text-emerald-900 rounded-xl px-3 py-1.5 disabled:opacity-50">
            {busy ? 'Sending…' : 'Request'}
          </button>
          <button type="button" onClick={() => setTicked([])} className="shrink-0 text-xs font-semibold border border-white/40 rounded-xl px-3 py-1.5">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
