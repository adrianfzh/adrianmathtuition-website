'use client';
// The timed paper (SPEC-HUMANITIES.md §A4): a clock, the sources one tap away,
// seven answer boxes. The start time and the answers live in localStorage until
// hand-in, so a closed tab loses nothing. Time up does not lock the paper — the
// bar says so and the student hands in.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HumanitiesSource } from '@/lib/humanities-questions';
import { clockLabel } from '@/lib/humanities-paper';
import { SourceCards } from '../../sources';

interface Part { id: string; label: string; section: 'A' | 'B'; question: string; marks: number }
interface Saved { startedAt: number; answers: Record<string, string> }

const wordsOf = (t: string): number => (t.trim() ? t.trim().split(/\s+/).length : 0);

export default function PaperForm(props: {
  caseStudyId: string; structuredId: string; title: string; issue: string; background: string;
  sources: HumanitiesSource[]; extract: string; extractTitle: string; parts: Part[]; minutes: number; maxWords: number;
}) {
  const { parts, minutes, maxWords } = props;
  const router = useRouter();
  const key = `hum-paper:${props.caseStudyId}:${props.structuredId}`;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [now, setNow] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let s: Saved | null = null;
    try { s = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* start fresh */ }
    if (!s?.startedAt) s = { startedAt: Date.now(), answers: {} };
    setSaved(s); setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [key]);
  useEffect(() => {
    if (saved) try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* private window: the page still works */ }
  }, [saved, key]);

  const answers = useMemo(() => saved?.answers ?? {}, [saved]);
  const left = saved ? minutes * 60 - Math.floor((now - saved.startedAt) / 1000) : minutes * 60;
  const over = left < 0;
  const written = parts.filter(p => wordsOf(answers[p.id] ?? '') >= 3);
  const tooLong = parts.filter(p => wordsOf(answers[p.id] ?? '') > maxWords);
  const setAnswer = (id: string, text: string) => setSaved(s => (s ? { ...s, answers: { ...s.answers, [id]: text } } : s));

  async function handIn() {
    if (!saved) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/humanities/paper', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseStudyId: props.caseStudyId, structuredId: props.structuredId, answers, minutes: Math.round((Date.now() - saved.startedAt) / 60000) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'Something went wrong.'); setBusy(false); setConfirming(false); return; }
      try { localStorage.removeItem(key); } catch { /* nothing to clear */ }
      router.push(`/app/humanities/paper/${j.paperId}`);
    } catch {
      setError('No connection — try again. Your answers are still here.'); setBusy(false); setConfirming(false);
    }
  }

  const section = (s: 'A' | 'B') => parts.filter(p => p.section === s);
  const partBox = (p: Part) => {
    const wc = wordsOf(answers[p.id] ?? '');
    return (
      <div key={p.id} className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <p className="text-[16px] font-semibold text-navy leading-snug">
          <span className="text-amber-800">{p.label}</span>{' '}{p.question} <span className="text-gray-500 font-normal">[{p.marks}]</span>
        </p>
        <textarea value={answers[p.id] ?? ''} onChange={e => setAnswer(p.id, e.target.value)} rows={8}
          placeholder="Type your answer here." aria-label={`Answer to question ${p.label}`}
          className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-navy" />
        <p className={`text-right text-[12px] ${wc > maxWords ? 'text-rose-700 font-semibold' : 'text-gray-400'}`}>{wc > maxWords ? `${wc} words — keep it under ${maxWords}` : `${wc} words`}</p>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-28 sm:pb-6">
      <div className={`sticky top-0 z-20 -mx-4 px-4 py-2 flex items-center gap-3 border-b backdrop-blur ${over ? 'bg-rose-50/95 border-rose-200' : 'bg-white/95 border-black/5'}`}>
        <span className="flex-1 min-w-0">
          <span className={`block text-lg font-bold tabular-nums leading-tight ${over ? 'text-rose-700' : 'text-navy'}`}>{saved ? clockLabel(left) : '–:––:––'}</span>
          <span className={`block text-[12px] ${over ? 'text-rose-700' : 'text-gray-500'}`}>{over ? 'Time is up. Hand in now.' : 'left'}</span>
        </span>
        <button type="button" onClick={() => setShowSources(true)} className="shrink-0 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3.5 py-1.5">Sources</button>
      </div>

      <div>
        <p className="text-[12px] font-semibold text-amber-800">Section A · Source-based case study [35]</p>
        <h1 className="text-xl font-bold text-navy leading-snug">{props.title}</h1>
        <p className="text-sm text-gray-600 mt-1">{props.issue}</p>
        <p className="text-[12px] text-gray-500 mt-1">Tap <b>Sources</b> to read the background and Sources A to {props.sources[props.sources.length - 1]?.id}.</p>
      </div>
      {section('A').map(partBox)}

      <div className="pt-2">
        <p className="text-[12px] font-semibold text-amber-800">Section B · Structured response [15]</p>
        <h2 className="text-lg font-bold text-navy leading-snug">{props.extractTitle}</h2>
      </div>
      <div className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <p className="text-sm font-bold text-navy">Extract</p>
        <p className="text-[15px] text-gray-800 leading-relaxed mt-1 whitespace-pre-line">{props.extract}</p>
        <p className="text-[12px] text-gray-500 mt-2">Answer from what you have learnt. Do not copy the extract.</p>
      </div>
      {section('B').map(partBox)}

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-3 py-2">{error}</p>}
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy || written.length === 0 || tooLong.length > 0}
          className="w-full bg-amber-600 text-white rounded-3xl px-4 py-3.5 font-semibold hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50">
          Hand in the paper
        </button>
      ) : (
        <div className="bg-white rounded-3xl p-4 border border-amber-200 shadow-sm space-y-3">
          <p className="text-[15px] font-semibold text-navy">
            Hand in {written.length} of {parts.length} answers?
            {written.length < parts.length && <span className="block text-sm font-normal text-gray-600 mt-0.5">Not answered: {parts.filter(p => !written.includes(p)).map(p => p.label).join(', ')}</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="flex-1 rounded-2xl border border-black/10 px-3 py-2.5 text-sm font-semibold text-navy">Keep writing</button>
            <button type="button" onClick={handIn} disabled={busy} className="flex-1 rounded-2xl bg-amber-600 text-white px-3 py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? 'Handing in…' : 'Hand in'}</button>
          </div>
        </div>
      )}

      {showSources && (
        <div className="fixed inset-0 z-50 bg-[#fbf7ef] overflow-y-auto" role="dialog" aria-label="Sources">
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-black/5 px-4 py-2 flex items-center gap-3">
            <span className={`flex-1 text-lg font-bold tabular-nums ${over ? 'text-rose-700' : 'text-navy'}`}>{saved ? clockLabel(left) : ''}</span>
            <button type="button" onClick={() => setShowSources(false)} className="text-sm font-semibold text-white bg-amber-600 rounded-full px-4 py-1.5">Back to the questions</button>
          </div>
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
            <div className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
              <p className="text-sm font-bold text-navy">Background information</p>
              <div className="mt-2 space-y-2">
                {props.background.split(/\n\s*\n/).map((p, i) => <p key={i} className="text-[15px] text-gray-800 leading-relaxed">{p}</p>)}
              </div>
            </div>
            <SourceCards sources={props.sources} />
          </div>
        </div>
      )}
    </div>
  );
}
