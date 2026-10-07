'use client';
// One text and its questions. Each question is checked by itself: type → Check →
// the marks, one line on why, then "The scheme says" / "You wrote". A summary shows
// which of the scheme's points were made. POST /api/portal/english/practice.
import { useState } from 'react';
import Link from 'next/link';
import type { PublicUnit } from '@/lib/english-practice';
import type { VisualBlock, VisualTheme } from '@/lib/english-own';
import VisualText from './visual-text';

const CARD = 'bg-white rounded-3xl border border-black/5 shadow-sm';
const TAG = 'text-[11px] font-semibold uppercase tracking-wide mr-1.5';

type Shown = { answer: string | null; accept: string[]; points: string[] };
type ShortRes = { kind: 'short'; awarded: number; marks: number; line: string; why: string; missing: string | null; scheme: Shown };
type SummaryRes = { kind: 'summary'; content: number; contentMax: number; hit: number[]; language: string; words: number; over: boolean; scheme: Shown };
type Res = ShortRes | SummaryRes;

const countWords = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;

function Question({ u, wordLimit }: { u: PublicUnit; wordLimit: number }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [sent, setSent] = useState('');
  const summary = u.kind === 'summary';
  const words = countWords(answer);

  const check = async (value: string) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/english/practice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit: u.key, answer: value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not check it. Try again.');
      setRes(j as Res); setSent(value);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check it. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <section className={`${CARD} p-4 space-y-2.5`} aria-label={`Question ${u.number}`}>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-[13px] font-bold text-violet-700">{u.number}</span>
        <div className="flex-1 min-w-0 space-y-1">
          {u.stem && <p className="whitespace-pre-wrap text-[14px] leading-snug text-gray-600">{u.stem}</p>}
          <p className="whitespace-pre-wrap text-[15px] leading-snug text-gray-900">{u.text}</p>
        </div>
        <span className="shrink-0 text-[12px] text-gray-500">[{summary ? 15 : u.marks}]</span>
      </div>

      {u.kind === 'choice' && u.options ? (
        <div className="space-y-1.5">
          {u.options.map(o => (
            <button key={o.label} type="button" disabled={busy} onClick={() => { setAnswer(o.label); void check(o.label); }}
              className={`w-full text-left rounded-xl border px-3 py-2 text-[15px] ${answer === o.label ? 'border-violet-500 bg-violet-50' : 'border-black/10 bg-white'}`}>
              <b className="mr-2 text-violet-700">{o.label}</b>{o.text}
            </button>
          ))}
        </div>
      ) : (
        <>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={summary ? 7 : u.marks >= 2 ? 3 : 2} maxLength={1500} disabled={busy}
            placeholder={summary ? 'Write your summary in continuous writing.' : 'Type your answer.'}
            className="w-full rounded-2xl border border-black/10 bg-white p-3 text-[15px] text-gray-900 focus:outline-none focus:border-violet-500" />
          {summary && <p className={`text-[12px] -mt-1.5 ${words > wordLimit ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{words} of {wordLimit} words</p>}
          <button onClick={() => void check(answer)} disabled={busy || answer.trim().length < 1}
            className="w-full rounded-xl bg-violet-600 text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-50">
            {busy ? 'Checking…' : res ? 'Check again' : 'Check my answer'}
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {res?.kind === 'short' && (
        <div className="space-y-1.5 border-t border-gray-100 pt-2.5">
          <p className={`text-[15px] font-bold ${res.awarded >= res.marks ? 'text-emerald-700' : res.awarded > 0 ? 'text-amber-700' : 'text-red-600'}`}>
            <span aria-hidden className="mr-1.5">{res.awarded >= res.marks ? '✓' : res.awarded > 0 ? '◐' : '✗'}</span>{res.line}
          </p>
          <p className="text-[14px] leading-snug text-gray-800">{res.why}</p>
          {res.missing && <p className="text-[14px] leading-snug text-gray-800"><span className={`${TAG} text-amber-700`}>Still needed</span>{res.missing}</p>}
          {/* one statement of the scheme, not two: its points when it lists them, else its answer */}
          {res.scheme.points.length > 0 ? (
            <div>
              <p className={`${TAG} text-emerald-700`}>The scheme says</p>
              <ul className="text-[14px] leading-snug text-gray-800 list-disc pl-5 mt-0.5">{res.scheme.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          ) : res.scheme.answer && <p className="text-[14px] leading-snug text-gray-800"><span className={`${TAG} text-emerald-700`}>The scheme says</span>{res.scheme.answer}</p>}
          {res.scheme.accept.length > 0 && <p className="text-[13px] leading-snug text-gray-500">Also accepted: {res.scheme.accept.join(' · ')}</p>}
          <p className="text-[14px] leading-snug text-gray-600"><span className={`${TAG} text-gray-500`}>You wrote</span>{sent}</p>
        </div>
      )}

      {res?.kind === 'summary' && (
        <div className="space-y-2 border-t border-gray-100 pt-2.5">
          <p className="text-[15px] font-bold text-navy">Content: {res.content} of {res.contentMax} points</p>
          {res.over && <p className="text-[14px] font-semibold text-red-600">{res.words} words. Only the first {wordLimit} are read.</p>}
          <p className="text-[14px] leading-snug text-gray-800"><span className={`${TAG} text-violet-700`}>Your wording</span>{res.language}</p>
          {res.scheme.points.length > 0 && (
            <ul className="space-y-1">
              {res.scheme.points.map((p, i) => {
                const ok = res.hit.includes(i + 1);
                return (
                  <li key={i} className="flex gap-2 text-[14px] leading-snug text-gray-800">
                    <span aria-hidden className={`shrink-0 font-bold ${ok ? 'text-emerald-600' : 'text-red-500'}`}>{ok ? '✓' : '✗'}</span><span>{p}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {res.scheme.answer && (
            <details className="text-[14px] leading-snug text-gray-800">
              <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wide text-emerald-700">The scheme’s summary</summary>
              <p className="mt-1 whitespace-pre-wrap">{res.scheme.answer}</p>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

export default function ReadingForm({ title, paragraphs, visual, units, backHref, wordLimit }: {
  title: string; paragraphs: string[] | null; visual: { format: string; theme: VisualTheme; blocks: VisualBlock[] } | null;
  units: PublicUnit[]; backHref: string; wordLimit: number;
}) {
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href={backHref} className="text-xs text-gray-500">‹ Practise</Link>
        <h1 className="text-xl font-bold text-navy mt-1 leading-tight">{title}</h1>
      </div>

      {visual && <VisualText format={visual.format} theme={visual.theme} blocks={visual.blocks} />}

      {paragraphs && (
        <div className={`${CARD} p-4 space-y-3`}>
          {paragraphs.map((p, i) => (
            <div key={i} className="flex gap-2.5">
              <span aria-label={`Paragraph ${i + 1}`} className="shrink-0 w-5 pt-[3px] text-right text-[12px] font-semibold text-violet-500">{i + 1}</span>
              <p className="flex-1 min-w-0 text-[15px] leading-relaxed text-gray-900">{p}</p>
            </div>
          ))}
        </div>
      )}

      {units.map(u => <Question key={u.key} u={u} wordLimit={wordLimit} />)}

      <Link href={backHref} className="block text-center w-full rounded-xl border border-violet-600 text-violet-700 text-sm font-semibold px-4 py-3">Choose another text</Link>
    </div>
  );
}
