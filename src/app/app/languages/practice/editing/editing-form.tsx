'use client';
// One editing passage: the text as printed, an answer box per line (a word, or ✓ for
// no error), Submit → every line ✓/✗ with the right word, at once (marked by rule), then Next
// brings the following passage at the same level. POST /api/portal/english/practice.
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { EditingResult } from '@/lib/english-practice';

const CARD = 'bg-white rounded-3xl border border-black/5 shadow-sm';
type Result = { results: EditingResult[]; right: number; total: number };

export default function EditingForm({ itemId, text, rows, lines, nextHref, levelName, progress }: {
  itemId: string; text: string; rows: { label: string | null; text: string }[] | null; lines: { label: string; where: string }[]; nextHref: string | null;
  levelName?: string; progress?: string;
}) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const filled = lines.filter(l => (answers[l.label] ?? '').trim()).length;
  const byLabel = new Map((res?.results ?? []).map(r => [r.label, r]));

  const set = (label: string, v: string) => { setAnswers(a => ({ ...a, [label]: v })); };
  const check = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/english/practice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editing: itemId, answers }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not check it. Try again.');
      setRes(j as Result);
      setTimeout(() => scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check it. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/languages/practice?t=editing" className="text-xs text-gray-500">‹ Editing</Link>
        <h1 className="text-xl font-bold text-navy mt-1">Editing</h1>
        {levelName && <p className="text-[12px] text-gray-500">{levelName}{progress ? ` · passage ${progress}` : ''}</p>}
      </div>

      <div className={`${CARD} p-4`}>
        {rows ? (
          <>
            <p className="text-[13px] leading-snug text-gray-500 mb-2.5">The first and last lines are correct. Eight of the numbered lines have one wrong word each. Two have none.</p>
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2.5">
                  <span aria-hidden className={`shrink-0 w-5 pt-[3px] text-right text-[12px] font-bold ${r.label ? 'text-violet-600' : 'text-transparent'}`}>{r.label ?? '·'}</span>
                  <p className="flex-1 min-w-0 text-[15px] leading-relaxed text-gray-900">{r.text}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">{text}</p>
        )}
      </div>

      <div ref={scoreRef} className={`${CARD} p-4 space-y-2.5 scroll-mt-24`}>
        {res && <p className={`text-[18px] font-bold ${res.right === res.total ? 'text-emerald-700' : 'text-navy'}`}>{res.right} of {res.total} lines right</p>}
        <p className="text-[12px] font-bold uppercase tracking-wide text-violet-700">Your answers</p>
        <p className="text-[13px] text-gray-500 -mt-1.5">Type the correct word, or tap ✓ when the line has no error.</p>
        {lines.map(l => {
          const r = byLabel.get(l.label);
          return (
            <div key={l.label}>
              <div className="flex items-center gap-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-800 text-[12px] font-bold flex items-center justify-center" aria-hidden>{l.label}</span>
                <input
                  value={answers[l.label] ?? ''} onChange={e => set(l.label, e.target.value)} disabled={busy || !!res}
                  aria-label={l.where} placeholder={l.where} maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  className={`flex-1 min-w-0 rounded-xl border px-3 py-2 text-[15px] text-gray-900 focus:outline-none focus:border-violet-500 ${r ? (r.ok ? 'border-emerald-300 bg-emerald-50/50' : 'border-red-300 bg-red-50/40') : 'border-black/10 bg-white'}`}
                />
                <button type="button" onClick={() => set(l.label, '✓')} disabled={busy || !!res} aria-label={`No error in ${l.where}`}
                  className={`shrink-0 w-10 h-10 rounded-xl border text-[16px] font-bold ${answers[l.label] === '✓' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200'}`}>✓</button>
                {r && <span aria-hidden className={`shrink-0 w-5 text-center font-bold ${r.ok ? 'text-emerald-600' : 'text-red-500'}`}>{r.ok ? '✓' : '✗'}</span>}
              </div>
              {r && !r.ok && (
                <div className="ml-9 mt-1 space-y-0.5">
                  <p className="text-[14px] text-gray-800"><span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mr-1.5">Answer</span><b>{r.correct}</b></p>
                  {r.note && <p className="text-[13px] leading-snug text-gray-500">{r.note}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!res ? (
        <button onClick={check} disabled={busy || filled === 0}
          className="w-full rounded-xl bg-violet-600 text-white text-sm font-semibold px-4 py-3 disabled:opacity-50">
          {busy ? 'Checking…' : filled < lines.length ? `Submit (${filled} of ${lines.length} filled)` : 'Submit'}
        </button>
      ) : nextHref ? (
        <a href={nextHref} className="block text-center w-full rounded-xl bg-violet-600 text-white text-sm font-semibold px-4 py-3">Next passage</a>
      ) : (
        <Link href="/app/languages/practice?t=editing" className="block text-center w-full rounded-xl border border-violet-600 text-violet-700 text-sm font-semibold px-4 py-3">Back to Editing</Link>
      )}
    </div>
  );
}
