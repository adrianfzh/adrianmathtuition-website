'use client';
// The student's door to a Practice Again sheet (8 Sep 2026): one button on
// their marked paper, then a line that says where the sheet is. The server
// page works out the starting state from the paper's sheet jobs; a request
// posts to /api/portal/practice-again/request and moves it to "queued".
import { useState } from 'react';

export type PracticeAgainState =
  | 'none'      // no sheet, nothing in flight — offer the button
  | 'queued'    // being written on the Mac
  | 'checking'  // written, not yet with the student (held for Adrian, or on his clock)
  | 'nothing';  // the worker found nothing worth practising

const CARD = 'rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4';

export default function PracticeAgainRequest({ runId, state: initial }: { runId: string; state: PracticeAgainState }) {
  const [state, setState] = useState<PracticeAgainState>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function request() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/portal/practice-again/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId }),
      });
      const d = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) { setErr(d.error || 'Could not send the request — try again in a moment.'); return; }
      setState('queued');
    } catch {
      setErr('Could not send the request — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'queued') {
    return (
      <section id="practice-again" className={CARD}>
        <p className="text-sm font-semibold text-emerald-900">📘 Practice Again is being written for this paper</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">A sheet with worked examples and practice on what went wrong here. You’ll get a message when it’s ready — usually within the day.</p>
      </section>
    );
  }
  if (state === 'checking') {
    return (
      <section id="practice-again" className={CARD}>
        <p className="text-sm font-semibold text-emerald-900">📘 Your Practice Again sheet is written</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">Adrian is checking it before it comes to you. You’ll get a message when it does.</p>
      </section>
    );
  }
  if (state === 'nothing') {
    return (
      <section id="practice-again" className={CARD}>
        <p className="text-sm font-semibold text-emerald-900">📘 Nothing here needs another go</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">The marks you lost on this paper don’t point at a gap worth a practice sheet. Well done.</p>
      </section>
    );
  }
  return (
    <section id="practice-again" className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-900">📘 Want practice on what went wrong here?</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">Ask for a Practice Again sheet — worked examples plus practice, from this paper. You get a message when it’s ready.</p>
        {err && <p className="text-[12px] text-red-700 mt-1">{err}</p>}
      </div>
      <button type="button" onClick={request} disabled={busy}
        className="shrink-0 text-xs font-semibold bg-emerald-700 text-white rounded-xl px-3 py-2 disabled:opacity-60">
        {busy ? 'Sending…' : 'Request Practice Again'}
      </button>
    </section>
  );
}
