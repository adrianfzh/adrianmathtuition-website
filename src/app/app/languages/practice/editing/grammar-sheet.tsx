'use client';
// The crash course pop-up (13 Oct 2026, Adrian: "add like a link say to mini crash course about that
// particular error … a pop up? And will keep linking students to go deeper and deeper"). A bottom
// sheet over the page, so the passage keeps its place: the rule in a line or two, one ✗ and one ✓,
// how to spot it → Try 3 (three single lines of the same kind from our passages, answered as in the
// exam: tap the wrong word, type the correction) → Go deeper (more to know, the next kind on the
// same path, the grammar map). Lessons: data/english/grammar/<kind>.json via lib/english-grammar.ts.
// Try lines: GET/POST /api/portal/english/grammar — nothing stored.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { GRAMMAR, nextInPath } from '@/lib/english-grammar';
import { lineWords, type EditingAnswer, type EditingResult } from '@/lib/english-practice';
import type { EditKind } from '@/lib/english-own';
import { verdict } from './editing-verdict';

const API = '/api/portal/english/grammar';
type View = 'learn' | 'try' | 'deeper';
interface TryLine { ref: string; before: string | null; text: string; after: string | null }
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A sentence with one word ringed: red on the ✗ example, green on the ✓. */
function Example({ text, word, good }: { text: string; word: string; good: boolean }) {
  const words = lineWords(text);
  const at = words.findIndex(w => w.word === word);
  return (
    <p className="flex gap-1.5 text-[15px] leading-relaxed text-gray-900">
      <span aria-hidden className={`shrink-0 w-4 font-bold ${good ? 'text-emerald-700' : 'text-red-600'}`}>{good ? '✓' : '✗'}</span>
      <span>{words.map((w, i) => {
        const hit = i === at;
        return <span key={i}>{w.before}{hit ? <b className={`rounded-full px-1 ${good ? 'ring-2 ring-emerald-600 bg-emerald-50 text-emerald-800' : 'ring-2 ring-red-500 bg-red-50 text-red-700'}`}>{w.word}</b> : w.word}{w.after}{' '}</span>;
      })}</span>
    </p>
  );
}

export default function GrammarSheet({ kind: first, notSet, onClose, mapHref = '/app/languages/practice/editing/map' }: {
  kind: EditKind; notSet?: string | null; onClose: () => void; mapHref?: string | null;
}) {
  const [kind, setKind] = useState<EditKind>(first);
  const [view, setView] = useState<View>('learn');
  const [lines, setLines] = useState<TryLine[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const [circled, setCircled] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<EditingResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lesson = GRAMMAR[kind];
  const next = nextInPath(kind);
  const line = lines[at];
  const shown = results[at];
  const finished = view === 'try' && lines.length > 0 && results.length === lines.length && at === lines.length - 1 && !!shown;

  // Escape closes; the page under the sheet does not scroll while it is open
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const was = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = was; };
  }, [onClose]);
  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [view, kind]);

  const startTry = async (k: EditKind = kind) => {
    setBusy(true); setError(null);
    try {
      const q = new URLSearchParams({ kind: k, skip: seen.join(',') });
      if (notSet) q.set('not', notSet);
      const r = await fetch(`${API}?${q}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(j.lines) || j.lines.length === 0) throw new Error(j.error || 'Could not load the lines. Try again.');
      setLines(j.lines); setSeen(s => [...s, ...j.lines.map((l: TryLine) => l.ref)].slice(-60));
      setAt(0); setResults([]); setCircled(null); setValue(''); setView('try');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the lines. Try again.'); }
    finally { setBusy(false); }
  };

  const submit = async (tick = false) => {
    if (!line || busy) return;
    const word = value.trim();
    const circledWord = circled != null ? lineWords(line.text)[circled]?.word ?? null : null;
    if (!tick && !circledWord) { setError('Tap the wrong word in the line first.'); return; }
    if (!tick && !word) { setError('Type the correct word.'); input.current?.focus(); return; }
    const answer: EditingAnswer = tick ? '✓' : { circled: circledWord, word };
    setBusy(true); setError(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: line.ref, answer }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.result) throw new Error(j.error || 'Could not check it. Try again.');
      setResults(x => { const y = [...x]; y[at] = j.result; return y; });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check it. Try again.'); }
    finally { setBusy(false); }
  };

  const nextLine = () => { setAt(a => a + 1); setCircled(null); setValue(''); setError(null); };
  const goKind = (k: EditKind) => { setKind(k); setView('learn'); setLines([]); setResults([]); setError(null); };

  const right = results.filter(r => r?.ok).length;
  const btn = 'rounded-xl text-[15px] font-semibold px-4 py-3 text-center disabled:opacity-50';

  // drawn on <body>, so the page's own layers (the bottom tab bar) cannot sit over it
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Learn this: ${lesson.name}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div ref={box} className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-w-lg">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 pt-2 pb-2 border-b border-black/5">
          <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300" />
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-violet-700">{view === 'try' ? 'Try 3' : view === 'deeper' ? 'Go deeper' : 'Learn this · 1 min'}</p>
              <h2 className="text-[18px] font-bold text-navy leading-tight">{lesson.name}</h2>
              <p className="text-[13px] text-gray-500">{lesson.tag}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full bg-gray-100 text-gray-600 text-[18px] leading-none">×</button>
          </div>
        </div>

        <div className="px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
          {view === 'learn' && (
            <>
              <div className="space-y-1">
                {lesson.rule.map((r, i) => <p key={i} className="text-[16px] leading-snug text-gray-900">{r}</p>)}
              </div>
              <div className="rounded-2xl bg-gray-50 px-3 py-2.5 space-y-1.5">
                <Example text={lesson.wrong.text} word={lesson.wrong.word} good={false} />
                <Example text={lesson.right.text} word={lesson.right.word} good />
              </div>
              <p className="text-[13px] leading-snug text-gray-600"><b className="text-gray-700">How to spot it: </b>{lesson.spot}</p>
            </>
          )}

          {view === 'deeper' && (
            <>
              <ul className="space-y-2">
                {lesson.deeper.map((d, i) => <li key={i} className="flex gap-2 text-[15px] leading-snug text-gray-900"><span aria-hidden className="text-violet-600 font-bold">•</span><span>{d}</span></li>)}
              </ul>
              {next && (
                <button type="button" onClick={() => goKind(next)} className="w-full text-left rounded-2xl border border-violet-200 bg-violet-50 px-3.5 py-3">
                  <span className="block text-[12px] text-violet-700 font-semibold">Next on this path</span>
                  <span className="block text-[15px] font-semibold text-navy">{GRAMMAR[next].name} ›</span>
                  <span className="block text-[12px] text-gray-500">{GRAMMAR[next].tag}</span>
                </button>
              )}
              {mapHref && <Link href={`${mapHref}?kind=${kind}`} className="block text-center text-[14px] font-semibold text-violet-700 py-1">See the grammar map ›</Link>}
            </>
          )}

          {view === 'try' && line && (
            <div className="space-y-3">
              <p className="text-[13px] text-gray-500">Line {at + 1} of {lines.length}. Tap the wrong word, then type the correct word.</p>
              <div className="rounded-2xl bg-violet-50 ring-2 ring-violet-500 px-3 py-2.5">
                {line.before && <p className="text-[13px] leading-snug text-gray-400">{line.before}</p>}
                <p className="text-[15px] leading-[2.1] text-gray-900 font-medium">
                  {lineWords(line.text).map((w, k) => {
                    const mine = circled === k;
                    const real = !!shown?.wrongWord && same(w.word, shown.wrongWord);
                    const ring = shown ? (real ? 'ring-2 ring-emerald-600 bg-emerald-50' : mine ? 'ring-2 ring-red-500 bg-red-50' : '') : mine ? 'ring-2 ring-red-500 bg-white' : '';
                    return (
                      <span key={k}>
                        {w.before}
                        <button type="button" disabled={!!shown || busy} aria-pressed={mine} onPointerDown={e => e.preventDefault()}
                          onClick={() => { setCircled(mine ? null : k); setError(null); }}
                          className={`rounded-full px-0.5 -mx-0.5 ${ring} ${!shown && !mine ? 'active:bg-violet-200' : ''}`}>{w.word}</button>
                        {w.after}{' '}
                      </span>
                    );
                  })}
                </p>
                {line.after && <p className="text-[13px] leading-snug text-gray-400">{line.after}</p>}
              </div>
              {shown && (
                <div aria-live="polite">
                  <p className={`text-[15px] font-bold ${shown.ok ? 'text-emerald-700' : 'text-red-600'}`}>{verdict(shown).head}</p>
                  {verdict(shown).fix && <p className="text-[15px] font-bold text-emerald-700">{verdict(shown).fix}</p>}
                  {shown.note && <p className="text-[13px] leading-snug text-gray-600">{shown.note}</p>}
                </div>
              )}
              {!shown ? (
                <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); void submit(); }}>
                  <input ref={input} value={value} onChange={e => setValue(e.target.value)} aria-label="Correct word"
                    placeholder={circled == null ? 'Tap the wrong word' : 'Correct word'} maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send"
                    className="flex-1 min-w-0 rounded-xl border border-violet-300 bg-white px-3 py-2.5 text-[16px] text-gray-900 focus:outline-none focus:border-violet-600" />
                  <button type="submit" disabled={busy || !value.trim()} className="shrink-0 rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-3.5 h-11 disabled:opacity-50">{busy ? '…' : 'Submit'}</button>
                </form>
              ) : !finished ? (
                <button type="button" onClick={nextLine} className={`${btn} w-full bg-violet-600 text-white`}>Next line</button>
              ) : (
                <p className={`text-[18px] font-bold ${right === lines.length ? 'text-emerald-700' : 'text-navy'}`}>{right} of {lines.length} right</p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {(view !== 'try' || finished) && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" disabled={busy} onClick={() => void startTry()} className={`${btn} bg-violet-600 text-white`}>{busy ? '…' : view === 'try' ? 'Try 3 more' : 'Try 3'}</button>
              {view === 'deeper'
                ? <button type="button" onClick={() => setView('learn')} className={`${btn} border border-violet-300 text-violet-700`}>‹ The rule</button>
                : <button type="button" onClick={() => setView('deeper')} className={`${btn} border border-violet-300 text-violet-700`}>Go deeper ›</button>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
