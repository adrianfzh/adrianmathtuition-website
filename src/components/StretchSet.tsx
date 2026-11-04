'use client';
// 🧩 This week's stretch set — the cards (SPEC-STRETCH-SET.md). Used on
// /app/stretch (the student) and /admin/stretch (Adrian's preview: read-only,
// with a grey "why" line under each card).
//
// Each question card shows the question, the optional prompts BEFORE the
// student starts (guess first · what does this remind you of?), and a button
// into the ordinary practice flow (/app/practice?qid=…&from=stretch) where it
// is marked. Back here afterwards: done / right first time, and the guess next
// to the answer with one tap "was it close?". Nothing here is graded and
// nothing blocks: every prompt can be skipped.
import { useState } from 'react';
import Link from 'next/link';
import { MathMarkdown } from '@/lib/math-markdown';
import SpotErrorCard from '@/components/SpotErrorCard';
import type { AutopsyPayload } from '@/lib/learn-types';
import type { ScreenItem } from '@/lib/stretch-set-store';
import { SLOT_TITLE, predictionLine, type Prediction, type SlotResponse } from '@/lib/stretch-set';
import 'katex/dist/katex.min.css';

async function post(body: Record<string, unknown>): Promise<SlotResponse | null> {
  try {
    const r = await fetch('/api/portal/stretch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    return (await r.json()).response ?? null;
  } catch { return null; }
}

function Status({ item, response }: { item: ScreenItem; response: SlotResponse }) {
  if (item.slot === 'spot') {
    if (!response.spotPicked) return null;
    return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${response.spotRight ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{response.spotRight ? '✓ Found it' : 'Done'}</span>;
  }
  if (!item.result.tried) return null;
  return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${item.result.rightFirstTime ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{item.result.rightFirstTime ? '✓ Right first time' : 'Done'}</span>;
}

function GuessBox({ onSave }: { onSave: (p: Prediction) => void }) {
  const [sign, setSign] = useState<Prediction['sign']>();
  const [size, setSize] = useState('');
  const [note, setNote] = useState('');
  const any = !!sign || !!size.trim() || !!note.trim();
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2">
      <p className="text-sm font-semibold text-sky-900">🔮 Guess first</p>
      <p className="text-[13px] text-sky-900/80">Before you work it out: what do you expect the answer to look like? A quick guess — no marks for it.</p>
      <div className="flex flex-wrap gap-1.5">
        {(['positive', 'negative', 'zero'] as const).map(s => (
          <button key={s} type="button" onClick={() => setSign(sign === s ? undefined : s)}
            className={`text-sm rounded-full border px-3 py-1 ${sign === s ? 'bg-sky-700 text-white border-sky-700' : 'bg-white border-sky-200 text-sky-900'}`}>
            {s === 'positive' ? 'Positive' : s === 'negative' ? 'Negative' : 'Zero'}
          </button>
        ))}
      </div>
      <input value={size} onChange={e => setSize(e.target.value)} maxLength={40} placeholder="Roughly how big? e.g. 20"
        className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-[15px]" />
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={120} placeholder="Or the shape, e.g. two answers"
        className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-[15px]" />
      <button type="button" disabled={!any} onClick={() => onSave({ ...(sign ? { sign } : {}), ...(size.trim() ? { size: size.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) })}
        className="text-sm font-semibold rounded-lg bg-sky-700 text-white px-3 py-1.5 disabled:opacity-40">Save my guess</button>
    </div>
  );
}

function RemindBox({ onSave }: { onSave: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
      <p className="text-sm font-semibold text-amber-900">💭 What does this remind you of?</p>
      <p className="text-[13px] text-amber-900/80">A question you have done before, a topic, a trick. One line — or skip it.</p>
      <input value={t} onChange={e => setT(e.target.value)} maxLength={200} placeholder="e.g. a tangent question"
        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-[15px]" />
      <button type="button" disabled={!t.trim()} onClick={() => onSave(t.trim())}
        className="text-sm font-semibold rounded-lg bg-amber-600 text-white px-3 py-1.5 disabled:opacity-40">Save</button>
    </div>
  );
}

function Card({ item, preview, index, total }: { item: ScreenItem; preview: boolean; index: number; total: number }) {
  const [response, setResponse] = useState<SlotResponse>(item.response);
  const t = SLOT_TITLE[item.slot];
  const save = async (body: Record<string, unknown>) => {
    if (preview) return;
    const next = await post({ slot: item.slot, ...body });
    if (next) setResponse(next);
  };
  const tried = item.result.tried;

  return (
    <section className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{index + 1} of {total}</p>
          <h2 className="text-base font-bold text-navy">{t.emoji} {t.title}</h2>
          <p className="text-[13px] text-gray-500">{t.blurb}{item.topic ? <> · <span className="text-gray-700">{item.topic}</span></> : null}</p>
        </div>
        <Status item={item} response={response} />
      </header>
      {preview && item.why && <p className="text-[12px] text-gray-400">Why: {item.why}</p>}

      {item.missing ? (
        <p className="text-sm text-gray-500">This one is no longer available — skip it this week.</p>
      ) : item.slot === 'spot' ? (
        <SpotErrorCard payload={item.unitPayload as AutopsyPayload} revealed={preview || !!response.spotPicked}
          onPick={right => { void save({ spotRight: right }); }} />
      ) : (
        <>
          <div className="rounded-xl bg-[hsl(45,100%,98%)] border border-black/5 p-3 text-[15px] text-gray-800 overflow-x-auto [&_img]:max-w-full">
            <MathMarkdown content={item.markdown ?? ''} />
            {item.marks ? <p className="text-right text-[12px] text-gray-400 mt-1">[{item.marks} mark{item.marks === 1 ? '' : 's'}]</p> : null}
          </div>

          {!tried && item.remind && !response.remind && (preview ? <p className="text-[13px] text-amber-800">💭 Asks first: “What does this remind you of?”</p> : <RemindBox onSave={remind => void save({ remind })} />)}
          {!tried && item.remind && response.remind && <p className="text-[13px] text-amber-900">💭 You said: {response.remind}</p>}
          {!tried && item.estimate && !response.prediction && (preview ? <p className="text-[13px] text-sky-800">🔮 Asks for a guess first (sign, rough size or shape)</p> : <GuessBox onSave={prediction => void save({ prediction })} />)}
          {!tried && item.estimate && response.prediction && <p className="text-[13px] text-sky-900">🔮 Your guess: {predictionLine(response.prediction)}</p>}

          {tried && response.prediction && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2">
              <p className="text-[14px] text-sky-950"><b>Your guess:</b> {predictionLine(response.prediction)}</p>
              {item.answer && <div className="text-[14px] text-sky-950 [&_p]:my-0"><b>Answer:</b> <MathMarkdown content={item.answer} /></div>}
              {typeof response.predictionClose !== 'boolean' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-sky-900">Was your guess close?</span>
                  <button type="button" onClick={() => void save({ predictionClose: true })} className="text-sm rounded-full bg-white border border-sky-300 px-3 py-0.5">Yes</button>
                  <button type="button" onClick={() => void save({ predictionClose: false })} className="text-sm rounded-full bg-white border border-sky-300 px-3 py-0.5">Not really</button>
                </div>
              ) : (
                <p className="text-[13px] text-sky-900">{response.predictionClose ? 'Good instinct — keep guessing first.' : 'Worth a look: what made the answer different from your guess?'}</p>
              )}
            </div>
          )}
          {preview && item.answer && <div className="text-[12px] text-gray-400 [&_p]:my-0">Answer (student sees it after trying): <MathMarkdown content={item.answer} /></div>}

          {item.questionId && !preview && (
            <Link href={`/app/practice?qid=${item.questionId}&from=stretch`}
              className="inline-flex items-center gap-1 text-sm font-semibold rounded-xl bg-navy text-white px-4 py-2 hover:opacity-90">
              {tried ? 'Open it again' : 'Work it out'} →
            </Link>
          )}
        </>
      )}
    </section>
  );
}

export default function StretchSet({ items, preview = false }: { items: ScreenItem[]; preview?: boolean }) {
  if (!items.length) return <p className="text-sm text-gray-500">Nothing this week yet — check back soon.</p>;
  return <div className="space-y-4">{items.map((it, i) => <Card key={it.slot} item={it} preview={preview} index={i} total={items.length} />)}</div>;
}
