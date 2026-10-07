'use client';
// 🔎 "Is this the <paper>?" — one line on a paper that was marked from the working
// alone because we could not tell which paper it is (7 Oct 2026, lib/paper-unsure).
// Yes → the paper is marked again against the real one; No → the line goes away. The
// other way out is to hand it in again with the question pages.
import { useState } from 'react';

export default function PaperUnsure({ runId, label, submitHref }: { runId: string; label: string; submitHref: string }) {
  const [state, setState] = useState<'ask' | 'busy' | 'remarking' | 'gone'>('ask');
  const [err, setErr] = useState<string | null>(null);

  async function answer(yes: boolean) {
    setState('busy'); setErr(null);
    try {
      const r = await fetch('/api/portal/marking/confirm-paper', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, yes }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; remarking?: boolean };
      if (!r.ok || d.error) throw new Error(d.error || 'Something went wrong — try again.');
      setState(d.remarking ? 'remarking' : 'gone');
    } catch (e) {
      setErr((e as Error).message);
      setState('ask');
    }
  }

  if (state === 'gone') return null;
  if (state === 'remarking') {
    return (
      <p className="text-xs text-teal-900 bg-teal-50 border border-teal-200 rounded-2xl px-3 py-2">
        <span className="font-semibold">Marking it again against the real paper.</span> It updates here when it&apos;s done — usually within the hour.
      </p>
    );
  }
  const busy = state === 'busy';
  return (
    <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 space-y-2">
      <p>
        <span className="font-semibold">We marked this from your working alone.</span>{' '}
        We couldn&apos;t tell which paper it is, so the marks for each question are our best estimate.
      </p>
      <p className="font-semibold">Is this the {label}?</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => answer(true)}
          className="rounded-full bg-navy px-3 py-1.5 font-semibold text-white disabled:opacity-50">
          {busy ? 'One moment…' : 'Yes — mark it again'}
        </button>
        <button type="button" disabled={busy} onClick={() => answer(false)}
          className="rounded-full border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 disabled:opacity-50">
          No
        </button>
        <a href={submitHref} className="font-semibold underline underline-offset-2">Hand it in again with the question paper</a>
      </div>
      {err && <p className="text-red-700">{err}</p>}
    </div>
  );
}
