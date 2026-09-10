'use client';
// "Ask for the next wave" (11 Sep 2026). Adrian's one-wave rule holds a sheet
// to six teach sections at most and SHELVES the rest with evidence
// (scripts/sheet-worker/WORKER_PROMPT.md); until now the shelf was visible only
// on his Telegram. When a finished sheet kept gaps back, this says so on the
// sheet's own card and lets the student ask for them — one more sheet, the same
// papers, teaching exactly what was shelved.
//
// The server reads `shelved` off the finished job itself, so this posts only
// which papers it is continuing.
import { useState } from 'react';

export default function NextWave({ runIds, count }: { runIds: string[]; count: number }) {
  const [state, setState] = useState<'offer' | 'queued'>('offer');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/portal/practice-again/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runIds, wave: 2 }),
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
      <p className="basis-full text-[12px] text-emerald-800/80">
        📘 Your next sheet is being written — it teaches what this one kept back. You’ll get a message when it’s ready.
      </p>
    );
  }
  return (
    <div className="basis-full flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-emerald-200 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-emerald-900">
          {count} more gap{count === 1 ? ' was' : 's were'} kept for your next sheet
        </p>
        <p className="text-[11.5px] text-emerald-800/70">One sheet teaches a few things well. Ask when you are through this one.</p>
        {err && <p className="text-[11.5px] text-red-700 mt-1">{err}</p>}
      </div>
      <button type="button" onClick={ask} disabled={busy}
        className="shrink-0 text-xs font-semibold text-emerald-900 border border-emerald-700/30 rounded-xl px-3 py-1.5 bg-emerald-50 disabled:opacity-60">
        {busy ? 'Sending…' : 'Ask for the next wave'}
      </button>
    </div>
  );
}
