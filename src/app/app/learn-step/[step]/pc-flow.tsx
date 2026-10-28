'use client';
// A P&C LEARN step on a phone (SPEC-SELF-LEARNING.md §4c): Example → Try one → Five on
// your own → the end, as the Sec 2 steps (learn-flow.tsx). The answer is a number typed
// on a digit keypad and marked at once; a wrong number shows "where did I count wrong"
// (lib/pc-wrong): the two arrangements counted as two that are one, or the one missed.
import { useEffect, useMemo, useState } from 'react';
import { MathMarkdown } from '@/lib/math-markdown';
import { markPc, pcFiveResult, PC_FIVE, PC_PASS, type PcVerdict } from '@/lib/pc-learn';
import type { PcQuestionData, PcStepData } from './pc-load';

type Phase = 'example' | 'try' | 'five' | 'end';
type Marked = PcVerdict & { kind: 'correct' | 'wrong' };

const INLINE = { p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> };
function Tex({ tex }: { tex: string }) { return <MathMarkdown content={`$${tex}$`} components={INLINE} />; }
function Say({ text }: { text: string }) { return <MathMarkdown content={text} components={INLINE} />; }

/** His positions picture: a line per position, ↑ under it, the number of ways under that. */
function Boxes({ boxes }: { boxes: { label: string; ways: number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-3 justify-center my-2">
      {boxes.map((b, i) => (
        <div key={i} className="flex flex-col items-center min-w-[3.25rem]">
          <div className="text-[11px] text-slate-500 leading-tight text-center h-7 flex items-end">{b.label}</div>
          <div className="w-12 border-b-2 border-slate-700 mt-0.5" />
          <div className="text-slate-700 leading-none mt-0.5">↑</div>
          <div className="text-sm text-slate-900 font-semibold">{b.ways}</div>
          <div className="text-[11px] text-slate-500 -mt-0.5">{b.ways === 1 ? 'way' : 'ways'}</div>
        </div>
      ))}
    </div>
  );
}

function Picture({ d }: { d: PcQuestionData }) {
  if (d.worked.boxes) return <Boxes boxes={d.worked.boxes} />;
  if (d.picture) return <img src={d.picture} alt="The counting picture" className="max-w-full h-auto max-h-64 mx-auto my-1" />;
  return null;
}
const hasPicture = (d: PcQuestionData) => !!(d.worked.boxes || d.picture);

/** The working built up a tap at a time: the picture first, then one line a tap. */
function Working({ d, taps, reasons }: { d: PcQuestionData; taps: number; reasons: boolean }) {
  const pic = hasPicture(d);
  const lines = d.worked.lines.slice(0, Math.max(0, taps - (pic ? 1 : 0)));
  return (
    <div className="space-y-2.5 mt-2">
      {pic && taps >= 1 && <Picture d={d} />}
      {lines.map((l, i) => (
        <div key={i}>
          <div className={`${l.tex.length > 40 ? 'text-[15px]' : 'text-lg'} text-slate-900 overflow-x-auto whitespace-nowrap`}><Tex tex={l.tex} /></div>
          {reasons && l.why && <div className="text-xs text-slate-500 leading-snug">← <Say text={l.why} /></div>}
        </div>
      ))}
    </div>
  );
}
const tapsOf = (d: PcQuestionData) => (hasPicture(d) ? 1 : 0) + d.worked.lines.length;

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const KEY = 'h-12 rounded-xl border text-lg active:scale-95 transition-transform bg-white border-slate-200 text-slate-800';
  return (
    <div className="grid grid-cols-3 gap-1.5 select-none">
      {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(k => (
        <button key={k} type="button" className={KEY} onClick={() => onKey(k)} aria-label={k}>{k}</button>
      ))}
      <button type="button" className={`${KEY} col-span-2`} onClick={() => onKey('0')} aria-label="0">0</button>
      <button type="button" className={`${KEY} bg-slate-50 border-slate-300 text-navy font-semibold`} onClick={() => onKey('⌫')} aria-label="Delete">⌫</button>
    </div>
  );
}

const PRIMARY = 'w-full rounded-2xl bg-navy text-[hsl(45,100%,96%)] font-semibold py-3 active:scale-[0.99] transition-transform disabled:opacity-40';
const QUIET = 'w-full rounded-2xl border border-slate-300 text-navy font-semibold py-3 bg-white active:scale-[0.99] transition-transform disabled:opacity-40';
const group = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default function PcFlow({ data }: { data: PcStepData }) {
  const { step } = data;
  const [phase, setPhase] = useState<Phase>('example');
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(0);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Marked | null>(null);
  const [checking, setChecking] = useState(false);
  const [helped, setHelped] = useState(0);
  const [n, setN] = useState(0);
  const [results, setResults] = useState<Marked[]>([]);

  const set = data.sets[attempt % data.sets.length];
  const d: PcQuestionData = phase === 'example' ? data.example : phase === 'try' ? data.tryOne : set[Math.min(n, PC_FIVE - 1)];
  const result = useMemo(() => pcFiveResult(results), [results]);
  const stuckSteps = data.hints.length + tapsOf(d);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [phase, n]);

  const reset = () => { setTyped(''); setNote(null); setVerdict(null); setShown(0); setHelped(0); setChecking(false); };
  const go = (p: Phase) => { reset(); setPhase(p); };

  const check = () => {
    if (!typed.trim() || verdict || checking) return;
    setChecking(true);
    // The counting behind "where did I count wrong" can take a moment: let the button show first.
    setTimeout(() => {
      const v = markPc(d.q, d.worked.answer, typed, data.watchOut ?? undefined);
      setChecking(false);
      if (v.kind === 'unreadable') { setNote(v.say); return; }
      setVerdict(v);
      if (phase === 'five') setResults(r => [...r, v]);
    }, 20);
  };
  const nextInFive = () => { if (n + 1 >= PC_FIVE) go('end'); else { reset(); setN(n + 1); } };
  const again = () => { setAttempt(a => a + 1); setN(0); setResults([]); go('example'); };
  const part = phase === 'example' ? 1 : phase === 'try' ? 2 : 3;

  return (
    <div className="max-w-md mx-auto space-y-4 pb-24 sm:pb-6">
      <header className="pt-1">
        <div className="text-xs text-slate-500">Learn · P&amp;C · step {step.index} of {step.of}{phase !== 'end' && <> · part {part} of 3</>}</div>
        <h1 className="text-2xl font-bold text-navy tracking-tight"><Say text={step.title} /></h1>
      </header>

      {phase === 'example' && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700 space-y-1">
            <div><Say text={step.idea[0]} /></div>
            <div><Say text={step.idea[1]} /></div>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Example</div>
            <div className="text-base text-slate-900 leading-relaxed"><Say text={d.q.prompt} /></div>
            <Working d={d} taps={shown} reasons />
            {shown >= tapsOf(d) && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-lg"><b>Answer:</b> {group(String(d.worked.answer))} ways</div>
            )}
          </div>
          {shown < tapsOf(d)
            ? <button type="button" className={PRIMARY} onClick={() => setShown(shown + 1)}>{shown === 0 ? 'Start' : 'Next step'}</button>
            : <button type="button" className={PRIMARY} onClick={() => go(attempt === 0 ? 'try' : 'five')}>{attempt === 0 ? 'Now try one' : 'Try a new five'}</button>}
        </section>
      )}

      {(phase === 'try' || phase === 'five') && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-xs font-semibold text-slate-500">{phase === 'try' ? 'Try one' : `Question ${n + 1} of ${PC_FIVE}`}</div>
              {phase === 'five' && (
                <div className="flex gap-1" aria-label={`${results.filter(r => r.kind === 'correct').length} right so far`}>
                  {Array.from({ length: PC_FIVE }, (_, i) => (
                    <span key={i} className={`h-2 w-5 rounded-full ${i >= results.length ? 'bg-slate-200' : results[i].kind === 'wrong' ? 'bg-rose-400' : 'bg-emerald-500'}`} />
                  ))}
                </div>
              )}
            </div>
            <div className="text-base text-slate-900 leading-relaxed"><Say text={d.q.prompt} /></div>
            {phase === 'try' && helped > 0 && !verdict && (
              <div className="mt-3 space-y-1.5">
                {data.hints.slice(0, helped).map((h, i) => (
                  <div key={i} className="text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5"><Say text={h} /></div>
                ))}
                {helped > data.hints.length && <Working d={d} taps={helped - data.hints.length} reasons />}
              </div>
            )}
          </div>

          {!verdict && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500">Work it on paper. Then type the number of ways.</div>
              <input
                value={typed}
                onChange={e => { setTyped(e.target.value); setNote(null); }}
                onKeyDown={e => { if (e.key === 'Enter') check(); }}
                inputMode="none" autoComplete="off" spellCheck={false}
                aria-label="Your answer" placeholder="Number of ways"
                className="w-full rounded-xl border-2 border-slate-300 focus:border-navy outline-none px-3 py-2.5 text-lg bg-white"
              />
              {note && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{note}</div>}
              <Keypad onKey={k => { setNote(null); setTyped(t => (k === '⌫' ? t.slice(0, -1) : t + k)); }} />
              <div className="flex gap-2 pt-1">
                {phase === 'try' && (
                  <button type="button" className={QUIET} disabled={helped >= stuckSteps} onClick={() => setHelped(helped + 1)}>Stuck? Next step</button>
                )}
                <button type="button" className={PRIMARY} disabled={!typed.trim() || checking} onClick={check}>{checking ? 'Checking…' : 'Check'}</button>
              </div>
            </div>
          )}

          {verdict?.kind === 'correct' && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="font-semibold text-emerald-800">✓ Correct</div>
              <div className="text-lg text-slate-900 mt-1">{group(String(d.worked.answer))} ways</div>
              {phase === 'try' && helped > 0 && <div className="text-xs text-slate-500 mt-1">You used {helped} step{helped === 1 ? '' : 's'}. The next five are on your own.</div>}
            </div>
          )}

          {verdict?.kind === 'wrong' && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 space-y-3">
              <div>
                <div className="font-semibold text-rose-800">✗ Not yet</div>
                <div className="space-y-1.5 mt-1">
                  {verdict.help.map((h, i) => (
                    <div key={i} className={`text-sm ${i === 0 ? 'text-slate-800' : 'text-slate-900 font-medium bg-white/70 rounded-lg px-2 py-1'}`}><Say text={h} /></div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-rose-100 px-3 py-3">
                <Working d={d} taps={tapsOf(d)} reasons={false} />
                <div className="mt-2 pt-2 border-t border-slate-100"><b>Answer:</b> {group(String(d.worked.answer))} ways</div>
              </div>
            </div>
          )}

          {verdict && phase === 'try' && (
            verdict.kind === 'correct'
              ? <button type="button" className={PRIMARY} onClick={() => go('five')}>Five on your own</button>
              : <div className="flex gap-2">
                  <button type="button" className={QUIET} onClick={() => go('example')}>See the example again</button>
                  <button type="button" className={PRIMARY} onClick={() => go('five')}>Five on your own</button>
                </div>
          )}
          {verdict && phase === 'five' && (
            <button type="button" className={PRIMARY} onClick={nextInFive}>{n + 1 >= PC_FIVE ? 'Finish' : 'Next question'}</button>
          )}
        </section>
      )}

      {phase === 'end' && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
            <div className="text-lg font-bold text-navy">{result.passed ? '✓ Step done' : 'Not there yet'}</div>
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">On your own</div>
              <div className="text-2xl font-bold text-slate-900">{result.right} of {PC_FIVE}</div>
            </div>
            {result.watch && (
              <div className="mt-3">
                <div className="text-sm font-semibold text-slate-800">One thing to watch</div>
                <div className="text-sm text-slate-700 mt-0.5"><Say text={result.watch} /></div>
              </div>
            )}
            {!result.passed && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-700">
                <div>{PC_PASS} of {PC_FIVE} finishes this step.</div>
                <div>Look at the example once more, then try a new five.</div>
              </div>
            )}
            {result.passed && step.next && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-sm font-semibold text-slate-800">Next</div>
                <div className="text-sm text-slate-600"><Say text={step.next} /></div>
              </div>
            )}
          </div>
          {result.passed
            ? (step.nextSlug
                ? <a href={`/app/learn-step/${step.nextSlug}`} className={`${PRIMARY} block text-center`}>Next step</a>
                : <a href="/app" className={`${PRIMARY} block text-center`}>Done</a>)
            : <button type="button" className={PRIMARY} onClick={again}>See the example again</button>}
        </section>
      )}
    </div>
  );
}
