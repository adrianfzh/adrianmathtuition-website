'use client';
// 🧑‍🏫 The student's summary of a shared board — the screen (SPEC-TUTOR-TOOLS §8; Adrian, 6 Nov 2026:
// "i want the summary functionality to be for the student, not for the tutor"). The student makes it;
// the tutor only reads it. One idea per line, the answer bold, nothing about how it was made.
import { useCallback, useEffect, useState } from 'react';
import { MathText, QuestionView, type QPart } from '@/app/app/practice/question-view';
import type { BoardSummary, SummaryPractice } from '@/lib/board-summary';

export default function BoardSummaryView({ role, api, headers, onClose }: {
  role: 'tutor' | 'student'; api: (op: string) => string; headers: Record<string, string>; onClose: () => void;
}) {
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  const [stale, setStale] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'making' | 'none'>('loading');
  const [err, setErr] = useState('');

  const make = useCallback(async () => {
    setState('making'); setErr('');
    try {
      const r = await fetch(api('summary'), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not make your summary just now — try again in a minute.');
      setSummary(j.summary); setStale(false); setState('ready');
    } catch (e) { setErr((e as Error).message); setState(summary ? 'ready' : 'none'); }
  }, [api, headers, summary]);

  useEffect(() => {
    let stop = false;
    void (async () => {
      const r = await fetch(api('summary'), { headers, cache: 'no-store' }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      if (stop) return;
      if (j?.summary) { setSummary(j.summary); setStale(!!j.stale); setState('ready'); }
      else setState('none');
    })();
    return () => { stop = true; };
  }, [api, headers]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Summary" data-summary>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="flex-1 text-lg font-bold">Summary</h2>
        <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm">Close</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl space-y-5">
          {state === 'loading' && <p className="text-slate-500">Opening…</p>}
          {state === 'making' && <p className="text-slate-600">Making your summary from the board — about 20 seconds.</p>}
          {state === 'none' && (role === 'student'
            ? (
              <div className="space-y-3">
                <p className="text-slate-700">A summary of today’s board: what you did, the method, your mistake to watch, and two questions to try.</p>
                <button type="button" onClick={() => void make()} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white">Make my summary</button>
              </div>
            )
            : <p className="text-slate-600">No summary yet. Your student makes it from their board.</p>)}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {state === 'ready' && summary && (
            <>
              {stale && role === 'student' && (
                <button type="button" onClick={() => void make()} className="w-full rounded-xl border border-sky-600 py-2.5 text-sm font-semibold text-sky-800">The board has changed — Update summary</button>
              )}
              {summary.didToday.length > 0 && (
                <section>
                  <h3 className="font-bold">What we did today</h3>
                  <ul className="mt-1 space-y-1">{summary.didToday.map((l, i) => <li key={i}>• <MathText text={l} /></li>)}</ul>
                </section>
              )}
              {summary.method && (
                <section>
                  <h3 className="font-bold">The method: <MathText text={summary.method.title} /></h3>
                  <ol className="mt-1 space-y-1">{summary.method.steps.map((l, i) => <li key={i}><span className="font-semibold">{i + 1}.</span> <MathText text={l} /></li>)}</ol>
                </section>
              )}
              {summary.watchOut && (
                <section className="rounded-xl bg-amber-50 p-3">
                  <h3 className="font-bold text-amber-900">Watch out</h3>
                  <p className="mt-1"><MathText text={summary.watchOut.mistake} /></p>
                  <p className="mt-1"><span className="font-semibold">Fix:</span> <MathText text={summary.watchOut.fix} /></p>
                </section>
              )}
              {summary.practice.length > 0 && (
                <section>
                  <h3 className="font-bold">Try these</h3>
                  <div className="mt-2 space-y-4">{summary.practice.map((q, i) => <Practice key={q.id} q={q} n={i + 1} />)}</div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Practice({ q, n }: { q: SummaryPractice; n: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-xl border p-3" data-practice>
      <p className="mb-1 text-sm font-semibold text-slate-500">Question {n}{q.marks ? ` · ${q.marks} mark${q.marks === 1 ? '' : 's'}` : ''}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {q.figureUrl && <img src={q.figureUrl} alt="" className="mb-2 max-w-full" />}
      <QuestionView q={{ id: q.id, markdown: '', stem: q.stem, parts: q.parts as QPart[], marks: q.marks, figureUrl: q.figureUrl, source: null, hasSolution: false }} />
      {show
        ? <p className="mt-2"><span className="font-bold">Answer:</span> <MathText text={q.answer} /></p>
        : <button type="button" onClick={() => setShow(true)} className="mt-2 rounded-lg border px-3 py-1.5 text-sm">Show answer</button>}
    </div>
  );
}
