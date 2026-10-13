'use client';
// One editing passage, ONE LINE AT A TIME (Adrian, 8 Oct 2026: "why not one line at a time when
// asking?" — the answer boxes used to sit in a card far below the passage). The whole passage
// stays on screen; the line being asked is highlighted and its answer box sits INSIDE the
// highlight, right under the line: type the right word or tap ✓, Submit (or Enter) → right or
// wrong with the right word at once → Next line (Enter again). Lines already answered show their
// result in place. After line 10 the passage is handed in (the attempt is stored) and the score shows.
//
// Circle, then correct (13 Oct 2026, Adrian: "you have to fill in the correct word instead of
// identifying it then correcting it?"): as in the exam, the student taps the wrong word in the
// line (it is circled), then types the correction. Right only when both are right
// (lib/english-practice checkEditing). Tapping a word keeps the keyboard up (pointerdown is
// held), so the box under the line does not jump.
//
// Why the box is in the passage and not in a bar fixed to the foot of the screen: a fixed bar was
// tried first and, on an iPhone, opening the keyboard slid the first lines off the top of the
// screen where they could not be scrolled back (seen on the simulator, 8 Oct 2026). With the box
// under its line the phone itself keeps the two together above the keyboard.
// POST /api/portal/english/practice — { editing, line, answer } per line, { editing, answers } at the end.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { lineWords, type EditingAnswer, type EditingResult } from '@/lib/english-practice';
import { GRAMMAR, isEditKind } from '@/lib/english-grammar';
import type { EditKind } from '@/lib/english-own';
import { verdict } from './editing-verdict';
import GrammarSheet from './grammar-sheet';

const CARD = 'bg-white rounded-3xl border border-black/5 shadow-sm';
const API = '/api/portal/english/practice';
type Phase = 'ask' | 'shown' | 'done';
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function EditingForm({ itemId, text, rows, lines, nextHref, levelName, progress }: {
  itemId: string; text: string; rows: { label: string | null; text: string }[] | null; lines: { label: string; where: string }[]; nextHref: string | null;
  levelName?: string; progress?: string;
}) {
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [value, setValue] = useState('');
  const [answers, setAnswers] = useState<Record<string, EditingAnswer>>({});
  const [circled, setCircled] = useState<number | null>(null);
  const [results, setResults] = useState<Record<string, EditingResult>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learn, setLearn] = useState<EditKind | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const line = lines[at];
  const body = rows ?? text.split('\n').map(t => ({ label: null as string | null, text: t }));
  const shown = line ? results[line.label] : undefined;
  const right = Object.values(results).filter(r => r.ok).length;
  const last = at === lines.length - 1;

  // keep the line being asked clear of the top bar and the bottom menu (its scroll margins say how far)
  useEffect(() => {
    if (phase === 'done' || !line) return;
    document.getElementById(`edit-line-${line.label}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [at, phase, line]);

  const submit = async (v: string, tick = false) => {
    const word = v.trim();
    if (!line || busy) return;
    const rowText = body.find(r => r.label === line.label)?.text ?? '';
    const circledWord = circled != null ? lineWords(rowText)[circled]?.word ?? null : null;
    if (!tick && !circledWord) { setError('Tap the wrong word in the line first.'); return; }
    if (!tick && !word) { setError('Type the correct word.'); input.current?.focus(); return; }
    const answer: EditingAnswer = tick ? '✓' : { circled: circledWord, word };
    setBusy(true); setError(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editing: itemId, line: line.label, answer }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.result) throw new Error(j.error || 'Could not check it. Try again.');
      setAnswers(a => ({ ...a, [line.label]: answer }));
      setResults(x => ({ ...x, [line.label]: j.result as EditingResult }));
      setValue(tick ? '✓' : word); if (tick) setCircled(null); setPhase('shown');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check it. Try again.'); }
    finally { setBusy(false); }
  };

  const next = async () => {
    if (busy) return;
    if (!last) {
      // drawn at once, so the new line's box can take the keyboard inside this same tap
      flushSync(() => { setAt(at + 1); setValue(''); setCircled(null); setError(null); setPhase('ask'); });
      input.current?.focus({ preventScroll: false });
      return;
    }
    // the last line: hand the whole passage in, so the attempt is stored as before
    setBusy(true);
    try { await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editing: itemId, answers }) }); } catch { /* the lines are already marked on the page */ }
    setBusy(false); setPhase('done');
    setTimeout(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  // "Learn this" under a line that has a mistake and was not got right (13 Oct 2026: the crash course)
  const Pill = ({ r }: { r: EditingResult }) => (!r.ok && isEditKind(r.kind) ? (
    <button type="button" onPointerDown={e => e.preventDefault()} onClick={() => setLearn(r.kind as EditKind)}
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 text-[12px] font-semibold">
      <span aria-hidden>💡</span> Learn this: {GRAMMAR[r.kind as EditKind].name} · 1 min ›
    </button>
  ) : null);

  return (
    <div className="space-y-4 pb-28 sm:pb-6">
      {learn && <GrammarSheet kind={learn} notSet={itemId} onClose={() => setLearn(null)} />}
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
          {phase !== 'done' && <> In the line in the box, tap the wrong word, then type the correct word. Tap ✓ if the line has no mistake.</>}
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
                    {now ? (
                      <p className="text-[15px] leading-[2.1] text-gray-900 font-medium">
                        {lineWords(r.text).map((w, k) => {
                          const mine = circled === k;
                          const real = phase === 'shown' && !!shown?.wrongWord && same(w.word, shown.wrongWord);
                          const ring = real ? 'ring-2 ring-emerald-600 bg-emerald-50' : mine ? (phase === 'shown' ? 'ring-2 ring-red-500 bg-red-50' : 'ring-2 ring-red-500 bg-white') : '';
                          return (
                            <span key={k}>
                              {w.before}
                              <button type="button" disabled={phase !== 'ask' || busy} aria-pressed={mine}
                                onPointerDown={e => e.preventDefault()}
                                onClick={() => { setCircled(mine ? null : k); setError(null); }}
                                className={`rounded-full px-0.5 -mx-0.5 ${ring} ${phase === 'ask' && !mine ? 'active:bg-violet-200' : ''}`}>{w.word}</button>
                              {w.after}{' '}
                            </span>
                          );
                        })}
                      </p>
                    ) : <p className="text-[15px] leading-relaxed text-gray-900">{r.text}</p>}
                    {res && !now && (() => { const v = verdict(res); return (
                      <p className="text-[13px] leading-snug">
                        <span className={`font-semibold ${res.ok ? 'text-emerald-700' : 'text-red-600'}`}>{v.head}</span>
                        {v.fix && <><span className="text-gray-500"> · </span><b className="text-emerald-700">{v.fix}</b></>}
                        {!res.ok && isEditKind(res.kind) && <><br /><Pill r={res} /></>}
                      </p>
                    ); })()}
                  </div>
                </div>

                {now && (
                  <div className="mt-2 space-y-1.5">
                    {phase === 'shown' && shown && (
                      <div aria-live="polite" className="px-0.5">
                        <p className={`text-[15px] font-bold ${shown.ok ? 'text-emerald-700' : 'text-red-600'}`}>{verdict(shown).head}</p>
                        {verdict(shown).fix && <p className="text-[15px] font-bold text-emerald-700">{verdict(shown).fix}</p>}
                        {!shown.ok && shown.note && <p className="text-[13px] leading-snug text-gray-700">{shown.note}</p>}
                        <Pill r={shown} />
                      </div>
                    )}
                    <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); if (phase === 'ask') void submit(value); else void next(); }}>
                      <input ref={input} value={value} onChange={e => { if (phase === 'ask') setValue(e.target.value); }} aria-label={`Line ${line.label}`}
                        placeholder={phase === 'ask' && circled == null ? 'Tap the wrong word' : 'Correct word'} maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint={phase === 'ask' ? 'send' : 'next'}
                        className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-[16px] text-gray-900 focus:outline-none focus:border-violet-600 ${phase === 'shown' && shown ? (shown.ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50') : 'border-violet-300 bg-white'}`} />
                      {phase === 'ask' ? (
                        <>
                          <button type="button" onPointerDown={e => e.preventDefault()} onClick={() => void submit('✓', true)} disabled={busy} aria-label="No mistake in this line"
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
