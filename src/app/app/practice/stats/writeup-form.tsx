'use client';
// One statistics write-up (SPEC-H2-TOOLS.md): type → Check → each point ✓/✗ with
// "The scheme says" / "You wrote" → the model answer. POST /api/portal/h2/stats.
import { useState } from 'react';
import Link from 'next/link';
import { MathText, Md } from '../question-view';
import type { ElementResult } from '@/lib/h2-tools';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

type Result = { results: ElementResult[]; line: string; modelAnswer: string; capped: boolean };

export default function WriteupForm({ item, nextHref }: { item: { id: string; context: string; task: string; points: string[]; kindLabel: string }; nextHref: string | null }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  const check = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/h2/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, answer }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not check it. Try again.');
      setRes(j as Result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check it. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/practice/stats" className="text-xs text-gray-500">‹ Statistics write-ups</Link>
        <h1 className="text-xl font-bold text-navy mt-1">{item.kindLabel}</h1>
      </div>
      <div className={`${CARD} p-4 space-y-3 text-[15px] leading-relaxed text-gray-900`}>
        <Md text={item.context} />
        <p className="font-semibold text-navy"><MathText text={item.task} /></p>
        <p className="text-xs text-gray-500">The scheme looks for {item.points.length} points.</p>
      </div>

      <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={5} maxLength={1200} disabled={busy}
        placeholder="Type your answer as you would write it in the exam."
        className="w-full rounded-2xl border border-black/10 bg-white p-3 text-[15px] text-gray-900 focus:outline-none focus:border-navy/50" />
      <p className="text-xs text-gray-400 -mt-2">You can type mu for μ and != for ≠.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={check} disabled={busy || answer.trim().length < 3}
        className="w-full rounded-xl bg-navy text-white text-sm font-semibold px-4 py-3 disabled:opacity-50">
        {busy ? 'Checking…' : res ? 'Check again' : 'Check my answer'}
      </button>

      {res && (
        <>
          <section className="space-y-2">
            <p className={`text-base font-bold ${res.results.every(r => r.ok) ? 'text-emerald-700' : 'text-navy'}`}>{res.line}</p>
            {res.results.map(r => (
              <div key={r.id} className={`${CARD} p-3 space-y-1.5`}>
                <p className="text-sm font-semibold text-gray-900">
                  <span aria-hidden className={`mr-2 ${r.ok ? 'text-emerald-600' : 'text-red-500'}`}>{r.ok ? '✓' : '✗'}</span>{r.label}
                </p>
                {!r.ok && (
                  <>
                    <p className="text-sm text-gray-800"><span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mr-1.5">The scheme says</span><MathText text={r.scheme} /></p>
                    <p className="text-sm text-gray-600"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1.5">You wrote</span>{r.yours ?? 'Nothing on this yet.'}</p>
                  </>
                )}
              </div>
            ))}
          </section>
          <section className={`${CARD} p-4 space-y-2`}>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Model answer</p>
            <div className="text-[15px] leading-relaxed text-gray-900 space-y-1">
              {res.modelAnswer.split('\n').filter(Boolean).map((l, k) => <div key={k}><MathText text={l} /></div>)}
            </div>
          </section>
          {nextHref && <Link href={nextHref} className="block text-center w-full rounded-xl border border-navy text-navy text-sm font-semibold px-4 py-3">Next question</Link>}
        </>
      )}
    </div>
  );
}
