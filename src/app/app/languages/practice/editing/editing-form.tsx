'use client';
// One editing passage, ONE LINE AT A TIME (Adrian, 8 Oct 2026: "why not one line at a time when
// asking?" — the answer boxes used to sit in a card far below the passage). The whole passage
// stays on screen, the line being asked is highlighted, and the question sits in a bar fixed just
// above the menu (or the keyboard): type the right word or tap ✓, Submit (or Enter) → right or
// wrong with the right word at once → Next line. Lines already answered show their result in
// place. After line 10 the passage is handed in (the attempt is stored) and the score shows.
// POST /api/portal/english/practice — { editing, line, answer } per line, { editing, answers } at the end.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const [bottom, setBottom] = useState(0);        // where the bar sits: above the menu, or above the keyboard
  const input = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const line = lines[at];
  const shown = line ? results[line.label] : undefined;
  const right = Object.values(results).filter(r => r.ok).length;
  const last = at === lines.length - 1;

  // The bar rides above the keyboard when it is open (a fixed bar would hide behind it on an
  // iPhone), else above the bottom menu.
  const place = useCallback(() => {
    const vv = window.visualViewport;
    const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    const menu = document.querySelector<HTMLElement>('nav.fixed.bottom-0');
    // (a fixed element has no offsetParent, so ask its style whether it is shown — it is hidden from tablet width up)
    const menuH = menu && getComputedStyle(menu).display !== 'none' ? menu.offsetHeight : 0;
    setBottom(keyboard > 80 ? keyboard : menuH);
  }, []);
  useEffect(() => {
    place();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', place); vv?.addEventListener('scroll', place); window.addEventListener('resize', place);
    return () => { vv?.removeEventListener('resize', place); vv?.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  }, [place]);

  // Keep the line being asked in the part of the screen that can be seen: below the top bar,
  // above the answer bar (and the keyboard under it).
  useLayoutEffect(() => {
    if (phase === 'done' || !line) return;
    const row = document.getElementById(`edit-line-${line.label}`);
    if (!row) return;
    const seenTop = (window.visualViewport?.offsetTop ?? 0) + 70;
    // the bar is fixed `bottom` px above the foot of the page's own viewport, so its top edge is here:
    const seenBottom = window.innerHeight - bottom - (bar.current?.offsetHeight ?? 150) - 12;
    const r = row.getBoundingClientRect();
    if (r.top >= seenTop && r.bottom <= seenBottom) return;
    window.scrollBy({ top: (r.top + r.bottom) / 2 - (seenTop + seenBottom) / 2, behavior: 'smooth' });
  }, [at, phase, bottom, line]);

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
    if (!last) { setAt(at + 1); setValue(''); setPhase('ask'); input.current?.focus(); return; }
    // the last line: hand the whole passage in, so the attempt is stored as before
    setBusy(true);
    try { await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editing: itemId, answers }) }); } catch { /* the lines are already marked on the page */ }
    setBusy(false); setPhase('done'); input.current?.blur();
    setTimeout(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const body = rows ?? text.split('\n').map(t => ({ label: null as string | null, text: t }));
  return (
    <div className="space-y-4" style={{ paddingBottom: phase === 'done' ? 96 : 230 }}>
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
        <p className="text-[13px] leading-snug text-gray-500 mb-2 px-1.5">The first and last lines are correct. Eight of the numbered lines have one wrong word each. Two have none.</p>
        <div className="space-y-0.5">
          {body.map((r, i) => {
            const res = r.label ? results[r.label] : undefined;
            const now = phase !== 'done' && !!r.label && r.label === line?.label;
            return (
              <div key={i} id={r.label ? `edit-line-${r.label}` : undefined}
                className={`flex gap-2 rounded-xl px-1.5 py-1 ${now ? 'bg-violet-100 ring-2 ring-violet-500' : ''}`}>
                <span aria-hidden className={`shrink-0 w-5 pt-[3px] text-right text-[12px] font-bold ${r.label ? (now ? 'text-violet-800' : 'text-violet-600') : 'text-transparent'}`}>{r.label ?? '·'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] leading-relaxed ${now ? 'text-gray-900 font-medium' : 'text-gray-900'}`}>{r.text}</p>
                  {res && (res.ok
                    ? <p className="text-[13px] font-semibold text-emerald-700 leading-snug">✓ {res.yours}</p>
                    : <p className="text-[13px] leading-snug"><span className="font-semibold text-red-600">✗ {res.yours}</span><span className="text-gray-500"> → </span><b className="text-emerald-700">{res.correct}</b></p>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {phase === 'done' && nextHref && <a href={nextHref} className="block text-center w-full rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 py-3">Next passage</a>}

      {phase !== 'done' && line && (
        <div ref={bar} style={{ bottom }} className="fixed left-0 right-0 z-30 bg-white border-t border-black/10 shadow-[0_-6px_16px_-6px_rgba(15,23,42,0.18)] px-3 pt-2.5 pb-3">
          <div className="max-w-xl mx-auto space-y-2">
            <p className="text-[13px] leading-snug text-gray-700">
              <b className="text-violet-800">Line {line.label} of {lines.length}</b>
              {phase === 'ask' ? ' — type the correct word, or tap ✓ if the line has no error' : ''}
            </p>
            {phase === 'shown' && shown && (
              <div aria-live="polite">
                <p className={`text-[15px] font-bold ${shown.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                  {shown.ok ? '✓ Right' : <>✗ Answer: <span className="text-emerald-700">{shown.correct}</span></>}
                </p>
                {!shown.ok && shown.note && <p className="text-[13px] leading-snug text-gray-600">{shown.note}</p>}
              </div>
            )}
            <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); if (phase === 'ask') void submit(value); else void next(); }}>
              <input ref={input} value={value} onChange={e => { if (phase === 'ask') setValue(e.target.value); }} aria-label={`Line ${line.label}`}
                placeholder="The correct word" maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint={phase === 'ask' ? 'send' : 'next'}
                className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-[16px] text-gray-900 focus:outline-none focus:border-violet-500 ${phase === 'shown' && shown ? (shown.ok ? 'border-emerald-300 bg-emerald-50/60' : 'border-red-300 bg-red-50/50') : 'border-black/15 bg-white'}`} />
              {phase === 'ask' ? (
                <>
                  <button type="button" onClick={() => void submit('✓')} disabled={busy} aria-label="No error in this line"
                    className="shrink-0 w-11 h-11 rounded-xl border border-violet-300 bg-white text-violet-700 text-[18px] font-bold disabled:opacity-50">✓</button>
                  <button type="submit" disabled={busy || !value.trim()} className="shrink-0 rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 h-11 disabled:opacity-50">{busy ? '…' : 'Submit'}</button>
                </>
              ) : (
                <button type="submit" disabled={busy} className="shrink-0 rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 h-11 disabled:opacity-50">{busy ? '…' : last ? 'See my score' : 'Next line'}</button>
              )}
            </form>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
