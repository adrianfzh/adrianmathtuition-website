'use client';
// The revision step on a phone: Example → Try one → Five on your own → the end.
// One thing on the screen at a time; the answer is typed on the keypad below the
// question (the phone's own keyboard has no ² and hides half the page).
import { useEffect, useMemo, useRef, useState } from 'react';
import { MathMarkdown } from '@/lib/math-markdown';
import {
  answerTex, fiveResult, mark, parseBrackets, questionTex, setFor, working, FIVE, PASS_MARK,
  type ReviseStep, type Slip, type Verdict, type WorkLine,
} from '@/lib/revise-step';

type Phase = 'example' | 'try' | 'five' | 'end';

const INLINE = { p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> };
function Tex({ tex }: { tex: string }) { return <MathMarkdown content={`$${tex}$`} components={INLINE} />; }
function Say({ text }: { text: string }) { return <MathMarkdown content={text} components={INLINE} />; }

function letterOf(question: string): string { return /[a-zA-Z]/.exec(question)?.[0] ?? 'x'; }

function Working({ lines, shown, reasons }: { lines: WorkLine[]; shown: number; reasons: boolean }) {
  return (
    <div className="space-y-2">
      {lines.slice(0, shown).map((l, i) => (
        <div key={i}>
          <div className="text-lg text-slate-900"><Tex tex={l.tex} /></div>
          {reasons && l.why && <div className="text-xs text-slate-400 leading-snug">{l.why}</div>}
        </div>
      ))}
    </div>
  );
}

function Keypad({ letter, onKey }: { letter: string; onKey: (k: string) => void }) {
  const rows = [
    ['7', '8', '9', letter, '⌫'],
    ['4', '5', '6', '²', '('],
    ['1', '2', '3', '+', ')'],
    ['0', '−'],
  ];
  return (
    <div className="space-y-1.5 select-none">
      {rows.map((row, r) => (
        <div key={r} className="grid grid-cols-5 gap-1.5">
          {row.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => onKey(k)}
              aria-label={k === '⌫' ? 'Delete' : k === '²' ? 'squared' : k}
              className={`h-11 rounded-xl border text-lg active:scale-95 transition-transform ${
                /[0-9]/.test(k) ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-50 border-slate-300 text-navy font-semibold'
              } ${k === '0' ? 'col-span-3' : ''} ${k === '−' ? 'col-span-2' : ''}`}
            >
              {k === letter ? <i>{k}</i> : k === '²' ? <span>▫<sup>2</sup></span> : k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function AnswerBox({
  question, value, onChange, onCheck, note,
}: {
  question: string; value: string; onChange: (v: string) => void; onCheck: () => void; note: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const key = (k: string) => {
    if (k === '⌫') onChange(value.slice(0, -1));
    else onChange(value + (k === '+' || k === '−' ? ` ${k} ` : k));
  };
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">Work it on paper. Then type your answer.</div>
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onCheck(); }}
        inputMode="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Your answer"
        placeholder="Your answer"
        className="w-full rounded-xl border-2 border-slate-300 focus:border-navy outline-none px-3 py-2.5 text-lg font-serif bg-white"
      />
      {note && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"><Say text={note} /></div>}
      <Keypad letter={letterOf(question)} onKey={key} />
    </div>
  );
}

const PRIMARY = 'w-full rounded-2xl bg-navy text-[hsl(45,100%,96%)] font-semibold py-3 active:scale-[0.99] transition-transform disabled:opacity-40';
const QUIET = 'w-full rounded-2xl border border-slate-300 text-navy font-semibold py-3 bg-white active:scale-[0.99] transition-transform disabled:opacity-40';

export default function ReviseFlow({ step }: { step: ReviseStep }) {
  const [phase, setPhase] = useState<Phase>('example');
  const [attempt, setAttempt] = useState(0); // which five (0-based)
  const [shown, setShown] = useState(1); // lines of working on screen
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [helped, setHelped] = useState(0);
  const [n, setN] = useState(0); // question within the five
  const [slips, setSlips] = useState<(Slip | null)[]>([]);
  const started = useRef(Date.now());
  const [minutes, setMinutes] = useState(0);

  const set = useMemo(() => setFor(step, attempt), [step, attempt]);
  const question = phase === 'example' ? step.example : phase === 'try' ? step.tryOne : set[Math.min(n, FIVE - 1)];
  const br = useMemo(() => parseBrackets(question)!, [question]);
  const lines = useMemo(() => working(br), [br]);
  const result = useMemo(() => fiveResult(slips), [slips]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [phase, n]);

  const reset = () => { setTyped(''); setNote(null); setVerdict(null); setShown(1); setHelped(0); };
  const go = (p: Phase) => { reset(); setPhase(p); };

  const check = () => {
    if (!typed.trim() || verdict) return;
    const v = mark(question, typed);
    if (v.kind === 'unreadable' || v.kind === 'unfinished') { setNote(v.say); return; }
    setNote(null);
    setVerdict(v);
    if (phase === 'five') setSlips(s => [...s, v.kind === 'wrong' ? v.slip : null]);
  };

  const nextInFive = () => {
    if (n + 1 >= FIVE) {
      setMinutes(Math.max(1, Math.round((Date.now() - started.current) / 60000)));
      go('end');
    } else { reset(); setN(n + 1); }
  };

  const again = () => { setAttempt(a => a + 1); setN(0); setSlips([]); go('example'); };

  const stepNo = phase === 'example' ? 1 : phase === 'try' ? 2 : 3;

  return (
    <div className="max-w-md mx-auto space-y-4 pb-24 sm:pb-6">
      <header className="pt-1">
        <div className="text-xs text-slate-500">Step {step.index} of {step.of}{phase !== 'end' && <> · part {stepNo} of 3</>}</div>
        <h1 className="text-2xl font-bold text-navy tracking-tight">{step.title}</h1>
      </header>

      {phase === 'example' && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700 space-y-1">
            <div>{step.idea[0]}</div>
            <div>{step.idea[1]}</div>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Example</div>
            <Working lines={lines} shown={shown} reasons />
            {shown >= lines.length && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-lg"><b>Answer:</b> <Tex tex={answerTex(br)} /></div>
            )}
          </div>
          {shown < lines.length
            ? <button type="button" className={PRIMARY} onClick={() => setShown(shown + 1)}>Next line</button>
            : <button type="button" className={PRIMARY} onClick={() => go(attempt === 0 ? 'try' : 'five')}>{attempt === 0 ? 'Now try one' : 'Try a new five'}</button>}
        </section>
      )}

      {(phase === 'try' || phase === 'five') && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-xs font-semibold text-slate-500">{phase === 'try' ? 'Try one' : `Question ${n + 1} of ${FIVE}`}</div>
              {phase === 'five' && (
                <div className="flex gap-1" aria-label={`${slips.filter(s => !s).length} right so far`}>
                  {Array.from({ length: FIVE }, (_, i) => (
                    <span key={i} className={`h-2 w-5 rounded-full ${i >= slips.length ? 'bg-slate-200' : slips[i] ? 'bg-rose-400' : 'bg-emerald-500'}`} />
                  ))}
                </div>
              )}
            </div>
            <div className="text-sm text-slate-600">Expand and simplify</div>
            <div className="text-xl text-slate-900 mt-1"><Tex tex={questionTex(br)} /></div>

            {phase === 'try' && helped > 0 && !verdict && (
              <div className="mt-3 pt-3 border-t border-slate-100"><Working lines={lines} shown={helped + 1} reasons /></div>
            )}
          </div>

          {!verdict && (
            <>
              <AnswerBox question={question} value={typed} onChange={v => { setTyped(v); setNote(null); }} onCheck={check} note={note} />
              <div className="flex gap-2">
                {phase === 'try' && (
                  <button type="button" className={QUIET} disabled={helped + 1 >= lines.length} onClick={() => setHelped(helped + 1)}>
                    Stuck? Next step
                  </button>
                )}
                <button type="button" className={PRIMARY} disabled={!typed.trim()} onClick={check}>Check</button>
              </div>
            </>
          )}

          {verdict?.kind === 'correct' && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="font-semibold text-emerald-800">✓ Correct</div>
              <div className="text-lg text-slate-900 mt-1"><Tex tex={answerTex(br)} /></div>
              {phase === 'try' && helped > 0 && <div className="text-xs text-slate-500 mt-1">You used {helped} step{helped === 1 ? '' : 's'}. The next five are on your own.</div>}
            </div>
          )}

          {verdict?.kind === 'wrong' && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 space-y-3">
              <div>
                <div className="font-semibold text-rose-800">✗ Not yet</div>
                <div className="text-sm text-slate-800 mt-1"><Say text={verdict.slip.say} /></div>
              </div>
              <div className="bg-white rounded-xl border border-rose-100 px-3 py-3">
                <Working lines={lines} shown={lines.length} reasons={false} />
                <div className="mt-2 pt-2 border-t border-slate-100"><b>Answer:</b> <Tex tex={answerTex(br)} /></div>
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
            <button type="button" className={PRIMARY} onClick={nextInFive}>{n + 1 >= FIVE ? 'Finish' : 'Next question'}</button>
          )}
        </section>
      )}

      {phase === 'end' && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4">
            <div className="text-lg font-bold text-navy">{result.passed ? '✓ Step done' : 'Not there yet'}</div>
            <div className="text-xs text-slate-500">{minutes} minute{minutes === 1 ? '' : 's'}</div>
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">On your own</div>
              <div className="text-2xl font-bold text-slate-900">{result.right} of {FIVE}</div>
            </div>
            {result.watch && (
              <div className="mt-3">
                <div className="text-sm font-semibold text-slate-800">One thing to watch</div>
                <div className="text-sm text-slate-700 mt-0.5"><Say text={result.watch.say} /></div>
              </div>
            )}
            {result.passed ? (
              step.next && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="text-sm font-semibold text-slate-800">Next</div>
                  <div className="text-sm text-slate-600">{step.next}</div>
                </div>
              )
            ) : (
              <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-700">
                <div>{PASS_MARK} of {FIVE} finishes this step.</div>
                <div>Look at the example once more, then try a new five.</div>
              </div>
            )}
          </div>
          {result.passed
            ? <a href="/app" className={`${PRIMARY} block text-center`}>Done</a>
            : <button type="button" className={PRIMARY} onClick={again}>See the example again</button>}
        </section>
      )}
    </div>
  );
}
