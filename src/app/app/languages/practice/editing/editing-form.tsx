'use client';
// One editing passage, ONE LINE AT A TIME (Adrian, 8 Oct 2026: "why not one line at a time when
// asking?" — the answer boxes used to sit in a card far below the passage). The whole passage
// stays on screen; the line being asked is highlighted and its answer box sits INSIDE the
// highlight, right under the line: type the right word or tap ✓, Submit (or Enter) → right or
// wrong with the right word at once → Next line (Enter again). Lines already answered show their
// result in place. After line 10 the passage is handed in (the attempt is stored) and the score shows.
//
// Why the box is in the passage and not in a bar fixed to the foot of the screen: a fixed bar was
// tried first and, on an iPhone, opening the keyboard slid the first lines off the top of the
// screen where they could not be scrolled back (seen on the simulator, 8 Oct 2026). With the box
// under its line the phone itself keeps the two together above the keyboard.
// POST /api/portal/english/practice — { editing, line, answer } per line, { editing, answers } at the end.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import type { EditingResult } from '@/lib/english-practice';

const CARD = 'bg-white rounded-3xl border border-black/5 shadow-sm';
const API = '/api/portal/english/practice';
type Phase = 'ask' | 'shown' | 'done';

export default function EditingForm({ itemId, text, rows, lines, nextHref, levelName, progress }: {
  itemId: string; text: string; rows: { label: string | null; text: string }[] | null; lines: { label: string; where: string }[]; nextHref: string | null;
  levelName?: string; progress?: string;
}) {
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [value, setValue] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, EditingResult>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const line = lines[at];
  const shown = line ? results[line.label] : undefined;
  const right = Object.values(results).filter(r => r.ok).length;
  const last = at === lines.length - 1;

  // keep the line being asked clear of the top bar and the bottom menu (its scroll margins say how far)
  useEffect(() => {
    if (phase === 'done' || !line) return;
    document.getElementById(`edit-line-${line.label}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [at, phase, line]);

  const submit = async (v: string) => {
    const answer = v.trim();
    if (!line || !answer || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editing: itemId, line: line.label, answer }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.result) throw new Error(j.error || 'Could not check it. Try again.');
      setAnswers(a => ({ ...a, [line.label]: answer }));
      setResults(x => ({ ...x, [line.label]: j.result as EditingResult }));
      setValue(answer); setPhase('shown');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check it. Try again.'); }
    finally { setBusy(false); }
  };

  const next = async () => {
    if (busy) return;
    if (!last) {
      // drawn at once, so the new line's box can take the keyboard inside this same tap
      flushSync(() => { setAt(at + 1); setValue(''); setPhase('ask'); });
      input.current?.focus({ preventScroll: false });
      return;
    }
    // the last line: hand the whole passage in, so the attempt is stored as before
    setBusy(true);
    try { await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editing: itemId, answers }) }); } catch { /* the lines are already marked on the page */ }
    setBusy(false); setPhase('done');
    setTimeout(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const body = rows ?? text.split('\n').map(t => ({ label: null as string | null, text: t }));
  return (
    <div className="space-y-4 pb-28 sm:pb-6">
      <div className="pt-1 scroll-mt-24" ref={top}>
        <Link href="/app/languages/practice?t=editing" className="text-xs text-gray-500">‹ Editing</Link>
        <h1 className="text-xl font-bold text-navy mt-1">Editing</h1>
        {levelName && <p className="text-[12px] text-gray-500">{levelName}{progress ? ` · passage ${progress}` : ''}</p>}
      </div>

      {phase === 'done' && (
        <div className={`${CARD} p-4 space-y-3`}>
          <p className={`text-[20px] font-bold ${right === lines.length ? 'text-emerald-700' : 'text-navy'}`}>{right} of {lines.length} lines right</p>
          {nextHref
            ? <a href={nextHref} className="block text-center w-full rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 py-3">Next passage</a>
            : <Link href="/app/languages/practice?t=editing" className="block text-center w-full rounded-xl border border-violet-600 text-violet-700 text-sm font-semibold px-4 py-3">Back to Editing</Link>}
        </div>
      )}

      <div className={`${CARD} px-2.5 py-3`}>
        <p className="text-[13px] leading-snug text-gray-500 mb-2 px-1.5">
          The first and last lines are correct. Eight of the numbered lines have one wrong word each. Two have none.
          {phase !== 'done' && <> For the line in the box, type the correct word, or tap ✓ if it has no error.</>}
        </p>
        <div className="space-y-0.5">
          {body.map((r, i) => {
            const res = r.label ? results[r.label] : undefined;
            const now = phase !== 'done' && !!r.label && r.label === line?.label;
            return (
              <div key={i} id={r.label ? `edit-line-${r.label}` : undefined}
                className={`rounded-xl px-1.5 py-1 scroll-mt-24 scroll-mb-28 ${now ? 'bg-violet-100 ring-2 ring-violet-500 my-1.5 py-2' : ''}`}>
                <div className="flex gap-2">
                  <span aria-hidden className={`shrink-0 w-5 pt-[3px] text-right text-[12px] font-bold ${r.label ? (now ? 'text-violet-800' : 'text-violet-600') : 'text-transparent'}`}>{r.label ?? '·'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] leading-relaxed text-gray-900 ${now ? 'font-medium' : ''}`}>{r.text}</p>
                    {res && !now && (res.ok
                      ? <p className="text-[13px] font-semibold text-emerald-700 leading-snug">✓ {res.yours}</p>
                      : <p className="text-[13px] leading-snug"><span className="font-semibold text-red-600">✗ {res.yours}</span><span className="text-gray-500"> → </span><b className="text-emerald-700">{res.correct}</b></p>)}
                  </div>
                </div>

                {now && (
                  <div className="mt-2 space-y-1.5">
                    {phase === 'shown' && shown && (
                      <div aria-live="polite" className="px-0.5">
                        <p className={`text-[15px] font-bold ${shown.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                          {shown.ok ? '✓ Right' : <>✗ Answer: <span className="text-emerald-700">{shown.correct}</span></>}
                        </p>
                        {!shown.ok && shown.note && <p className="text-[13px] leading-snug text-gray-700">{shown.note}</p>}
                      </div>
                    )}
                    <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); if (phase === 'ask') void submit(value); else void next(); }}>
                      <input ref={input} value={value} onChange={e => { if (phase === 'ask') setValue(e.target.value); }} aria-label={`Line ${line.label}`}
                        placeholder={`Line ${line.label}: the correct word`} maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint={phase === 'ask' ? 'send' : 'next'}
                        className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-[16px] text-gray-900 focus:outline-none focus:border-violet-600 ${phase === 'shown' && shown ? (shown.ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50') : 'border-violet-300 bg-white'}`} />
                      {phase === 'ask' ? (
                        <>
                          <button type="button" onClick={() => void submit('✓')} disabled={busy} aria-label="No error in this line"
                            className="shrink-0 w-11 h-11 rounded-xl border border-violet-300 bg-white text-violet-700 text-[18px] font-bold disabled:opacity-50">✓</button>
                          <button type="submit" disabled={busy || !value.trim()} className="shrink-0 rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-3.5 h-11 disabled:opacity-50">{busy ? '…' : 'Submit'}</button>
                        </>
                      ) : (
                        <button type="submit" disabled={busy} className="shrink-0 rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-3.5 h-11 disabled:opacity-50">{busy ? '…' : last ? 'See my score' : 'Next line'}</button>
                      )}
                    </form>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {phase === 'done' && nextHref && <a href={nextHref} className="block text-center w-full rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 py-3">Next passage</a>}
    </div>
  );
}
