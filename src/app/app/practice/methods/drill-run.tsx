'use client';
// One "Which method?" run (SPEC-H2-TOOLS.md): the items arrive in run order with their
// answers, so a tap is marked on the phone at once; the attempt is logged in the
// background. Rules: lib/h2-tools (checkMethodChoice).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MathText, Md } from '../question-view';
import { DEFAULT_METHOD_ASK, checkMethodChoice, runScoreLine, type MethodDrill, type MethodVerdict } from '@/lib/h2-tools';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const LETTERS = ['A', 'B', 'C', 'D'];

export default function DrillRun({ area, label }: { area: string; label: string }) {
  const [items, setItems] = useState<MethodDrill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<MethodVerdict | null>(null);
  const [score, setScore] = useState({ right: 0, done: 0 });

  useEffect(() => {
    fetch(`/api/portal/h2/methods?area=${area}`).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load the drills.');
      setItems(j.items as MethodDrill[]);
    }).catch(e => setError(e instanceof Error ? e.message : 'Could not load the drills.'));
  }, [area]);

  if (error) return <div className={`${CARD} p-4 text-sm text-gray-700`}>{error}</div>;
  if (!items) return <div className="text-sm text-gray-500 p-4">Loading…</div>;

  const header = (
    <div className="flex items-baseline justify-between gap-3 pt-1">
      <div>
        <Link href="/app/practice/methods" className="text-xs text-gray-500">‹ Which method?</Link>
        <h1 className="text-xl font-bold text-navy mt-1">{label}</h1>
      </div>
      {score.done > 0 && <p className="text-xs text-gray-500">{runScoreLine(score.right, score.done)}</p>}
    </div>
  );

  if (i >= items.length) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        {header}
        <div className={`${CARD} p-5 space-y-2`}>
          <p className="text-base font-semibold text-navy">That is all of them.</p>
          <p className="text-sm text-gray-700">{runScoreLine(score.right, score.done)}.</p>
          <p className="text-sm text-gray-600">Next time, the ones you missed come first.</p>
          <button onClick={() => { setI(0); setPicked(null); setVerdict(null); setScore({ right: 0, done: 0 }); }}
            className="mt-2 rounded-xl bg-navy text-white text-sm font-semibold px-4 py-2.5">Go again</button>
        </div>
      </div>
    );
  }

  const d = items[i];
  const pick = (k: number) => {
    if (verdict) return;
    const v = checkMethodChoice(d, k);
    setPicked(k); setVerdict(v);
    setScore(s => ({ right: s.right + (v.correct ? 1 : 0), done: s.done + 1 }));
    void fetch('/api/portal/h2/methods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, choice: k }) }).catch(() => {});
  };
  const next = () => { setI(n => n + 1); setPicked(null); setVerdict(null); window.scrollTo({ top: 0 }); };

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {header}
      <p className="text-xs text-gray-400">{i + 1} of {items.length}</p>
      <div className={`${CARD} p-4 text-[15px] leading-relaxed text-gray-900`}><Md text={d.stem} /></div>
      <p className="text-sm font-semibold text-navy">{d.ask ?? DEFAULT_METHOD_ASK}</p>
      <div className="space-y-2" role="radiogroup" aria-label="Approaches">
        {d.options.map((o, k) => {
          const isAnswer = verdict && k === d.answer;
          const isWrongPick = verdict && k === picked && !verdict.correct;
          const tone = isAnswer ? 'border-emerald-500 bg-emerald-50' : isWrongPick ? 'border-red-400 bg-red-50' : 'border-black/10 bg-white';
          return (
            <button key={k} type="button" role="radio" aria-checked={picked === k} onClick={() => pick(k)} disabled={!!verdict}
              className={`w-full text-left flex items-start gap-3 rounded-2xl border px-4 py-3 transition ${tone} ${verdict ? '' : 'hover:border-navy/40 active:scale-[0.99]'}`}>
              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isAnswer ? 'bg-emerald-600 text-white' : isWrongPick ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{LETTERS[k]}</span>
              <span className="text-sm text-gray-900 pt-1"><MathText text={o} /></span>
            </button>
          );
        })}
      </div>

      {verdict && (
        <div className={`${CARD} p-4 space-y-2`}>
          <p className={`text-base font-bold ${verdict.correct ? 'text-emerald-700' : 'text-red-600'}`}>
            {verdict.correct ? 'Right.' : `Not this one. It is ${LETTERS[verdict.answer]}.`}
          </p>
          <p className="text-sm text-gray-800"><span className="font-semibold">Why: </span><MathText text={verdict.why} /></p>
          {verdict.trapWhy && verdict.trap !== null && (verdict.choseTrap || verdict.correct) && (
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Not {LETTERS[verdict.trap]}: </span><MathText text={verdict.trapWhy} />
            </p>
          )}
          <button onClick={next} className="mt-2 w-full rounded-xl bg-navy text-white text-sm font-semibold px-4 py-3">Next</button>
        </div>
      )}
    </div>
  );
}
