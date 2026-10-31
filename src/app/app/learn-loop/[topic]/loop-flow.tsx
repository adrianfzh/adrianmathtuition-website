'use client';
// 🔁 The learning loop, on the student's screen (SPEC-LEARN-LOOP.md). One question type at
// a time: a question → write it here / send a photo / type it → marked at once →
// right: the next type · wrong: what went wrong, the worked solution, and another one.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { McqChips, Md, MathText, QuestionView, mcqLettersIn, type Question } from '@/app/app/practice/question-view';
import { fileToJpegDataUrl } from '@/app/app/practice/image-downscale';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';
import AnswerPad, { type AnswerPadHandle } from './answer-pad';
import 'katex/dist/katex.min.css';

type TypeRow = { id: number; name: string; tries: number; misses: number; done: boolean };
type Grade = {
  verdict: 'correct' | 'partial' | 'wrong';
  score: number; outOf: number;
  partBreakdown: { label: string; awarded: number; outOf: number; comment: string }[];
  lineComments: { line: number; ok: boolean; comment: string; fix?: string }[];
  nextSteps: string[];
  transcribedLines?: string[];
};
type Mode = 'write' | 'photo' | 'type';

export default function LoopFlow({ topicKey, title, clipHref, clipFirst, initialTypes, missesBeforeHelp, seenExample }: {
  topicKey: string; title: string; clipHref: string | null; clipFirst: boolean;
  initialTypes: TypeRow[]; missesBeforeHelp: number;
  /** The type whose example clip the student just came back from (?seen=). */
  seenExample: number | null;
}) {
  const [types, setTypes] = useState<TypeRow[]>(initialTypes);
  const [showClip, setShowClip] = useState(clipFirst && !!clipHref);
  const [skipped, setSkipped] = useState<number[]>([]);
  const current = types.find(t => !t.done && !skipped.includes(t.id)) ?? null;

  const [q, setQ] = useState<Question | null>(null);
  const [mcq, setMcq] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [shown, setShown] = useState<string[]>([]);
  const shownRef = useRef<string[]>([]);
  useEffect(() => { shownRef.current = shown; }, [shown]);
  const [mode, setMode] = useState<Mode>('write');
  const [typed, setTyped] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [padEmpty, setPadEmpty] = useState(true);
  const pad = useRef<AnswerPadHandle>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [solution, setSolution] = useState<string | null>(null);
  // 📺 One worked example before a type's first question (Adrian, 31 Oct 2026): a clip of a
  // question of that type when there is one, else a question with its worked solution.
  const [examplesSeen, setExamplesSeen] = useState<number[]>(seenExample != null ? [seenExample] : []);
  const [example, setExample] = useState<{ clipId?: string; q?: Question; solution?: string | null } | null>(null);

  const loadQuestion = useCallback(async (typeId: number, exclude: string[]) => {
    setBusy('Finding a question…'); setErr(null); setGrade(null); setSolution(null);
    setTyped(''); setPhoto(null); setPadEmpty(true); setQ(null); setNoMore(false);
    try {
      const d = await portalFetch<{ question: Question | null; mcq?: string[] }>('/api/portal/loop', {
        json: { topic: topicKey, action: 'next', subgroupId: typeId, exclude },
      });
      if (!d.question) { setNoMore(true); return; }
      setQ(d.question);
      setMcq(!!d.mcq);
      setShown(s => [...s, d.question!.id]);
    } catch (e) {
      setErr(portalMessage(e));
    } finally { setBusy(null); }
  }, [topicKey]);

  const loadExample = useCallback(async (typeId: number) => {
    setBusy('Finding a worked example…'); setErr(null); setExample(null); setQ(null); setGrade(null);
    try {
      const d = await portalFetch<{ clipId?: string; question?: Question | null }>('/api/portal/loop', {
        json: { topic: topicKey, action: 'example', subgroupId: typeId },
      });
      if (d.clipId) { setExample({ clipId: d.clipId }); setShown(s => [...s, d.clipId!]); return; }
      if (!d.question) { setExamplesSeen(s => [...s, typeId]); return; }   // nothing to show → straight to a question
      const ex = d.question;
      setShown(s => [...s, ex.id]);
      setExample({ q: ex, solution: null });
      portalFetch<{ markdown?: string }>(`/api/portal/practice/solution?id=${ex.id}`)
        .then(r => setExample(cur => (cur?.q?.id === ex.id ? { ...cur, solution: r.markdown || null } : cur)))
        .catch(() => setExamplesSeen(s => [...s, typeId]));
    } catch {
      setExamplesSeen(s => [...s, typeId]);
    } finally { setBusy(null); }
  }, [topicKey]);

  // A new type on screen → its worked example (first time only), then its first question.
  const currentId = current?.id ?? null;
  const needsExample = !!current && current.tries === 0 && !examplesSeen.includes(current.id);
  useEffect(() => {
    if (showClip || currentId == null) return;
    if (needsExample) void loadExample(currentId);
    else { setExample(null); void loadQuestion(currentId, shownRef.current); }
  }, [showClip, currentId, needsExample, loadExample, loadQuestion]);

  async function refreshTypes() {
    try {
      const d = await portalFetch<{ types: TypeRow[] }>('/api/portal/loop', { json: { topic: topicKey, action: 'state' } });
      setTypes(d.types);
    } catch { /* the next tap tries again */ }
  }

  async function submit() {
    if (!q || !current) return;
    let body: Record<string, unknown>;
    if (mcq) {
      if (!typed) return;
      body = { lines: [typed] };
    } else if (mode === 'write') {
      const img = pad.current?.toJpeg();
      if (!img) { setErr('Write your working first.'); return; }
      body = { image: { data: img, mediaType: 'image/jpeg' }, inked: true };
    } else if (mode === 'photo') {
      if (!photo) { setErr('Add a photo of your working first.'); return; }
      body = { image: { data: photo, mediaType: 'image/jpeg' } };
    } else {
      const lines = typed.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) { setErr('Type your working first.'); return; }
      body = { lines };
    }
    setBusy('Marking… (about half a minute)'); setErr(null);
    try {
      const d = await portalFetch<{ result: Grade }>('/api/portal/practice/grade', {
        json: { questionId: q.id, ...body, loop: { topic: topicKey, subgroupId: current.id } },
        fallback: 'Marking didn’t go through — try again.',
      });
      setGrade(d.result);
      if (d.result.verdict !== 'correct') {
        portalFetch<{ markdown?: string }>(`/api/portal/practice/solution?id=${q.id}`)
          .then(s => setSolution(s.markdown || null)).catch(() => setSolution(null));
      }
    } catch (e) {
      setErr(portalMessage(e));
    } finally { setBusy(null); }
  }

  async function nextType() {
    await refreshTypes();
    setGrade(null); setQ(null);
  }
  function anotherOne() {
    if (!current) return;
    void refreshTypes();
    void loadQuestion(current.id, shown);
  }

  const doneCount = types.filter(t => t.done).length;
  const misses = current ? current.misses + (grade && grade.verdict !== 'correct' ? 1 : 0) : 0;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <Link href="/app" className="text-[13px] text-slate-500">‹ Home</Link>
      <h1 className="mt-1 text-xl font-bold text-navy">{title}</h1>
      <p className="text-[13px] text-slate-500">{doneCount} of {types.length} question types done</p>

      {/* The types, in order: ✓ done, ● on now, ○ to come */}
      <ol className="mt-3 space-y-1">
        {types.map(t => (
          <li key={t.id} className={`flex items-center gap-2 text-[13px] ${t.id === current?.id ? 'font-semibold text-navy' : t.done ? 'text-emerald-700' : 'text-slate-400'}`}>
            <span className="w-4 text-center">{t.done ? '✓' : t.id === current?.id ? '●' : '○'}</span>
            <span>{t.name}</span>
          </li>
        ))}
      </ol>

      {showClip && clipHref && (
        <section className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
          <p className="text-[15px] font-semibold text-sky-900">Start with the clip</p>
          <p className="mt-1 text-[13px] text-slate-600">A few minutes on how {title.toLowerCase()} works. Then the questions, one type at a time.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={clipHref} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">▶ Watch the clip</Link>
            <button type="button" onClick={() => setShowClip(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Skip to the questions</button>
          </div>
        </section>
      )}

      {!showClip && !current && (
        <section className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[15px] font-bold text-emerald-800">✓ Every question type done.</p>
          <p className="mt-1 text-[13px] text-emerald-900">You got one of each right. That is the whole topic.</p>
        </section>
      )}

      {!showClip && current && (
        <section className="mt-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Now: {current.name}</p>

          {needsExample && example?.clipId && (
            <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
              <p className="text-[15px] font-semibold text-sky-900">Watch one worked first</p>
              <p className="mt-1 text-[13px] text-slate-600">A short clip of one question of this type, step by step. Then you try one.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/app/clip/q/${example.clipId}?back=${encodeURIComponent(`/app/learn-loop/${topicKey}?watched=1&seen=${current.id}`)}`}
                  className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">▶ Watch the example</Link>
                <button type="button" onClick={() => setExamplesSeen(s => [...s, current.id])}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Skip to my question</button>
              </div>
            </div>
          )}

          {needsExample && example?.q && (
            <div className="mt-2 space-y-2">
              <p className="text-[15px] font-semibold text-sky-900">One worked first</p>
              <div className="rounded-xl bg-slate-50 p-3 text-[15px]"><QuestionView q={example.q} /></div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">How it goes</p>
                {example.solution ? <div className="mt-1 text-[15px]"><Md text={example.solution} /></div> : <p className="mt-1 text-[13px] text-slate-500">Loading the worked solution…</p>}
              </div>
              <button type="button" onClick={() => setExamplesSeen(s => [...s, current.id])}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-[15px] font-semibold text-white">Now try one ›</button>
            </div>
          )}

          {noMore && (
            <div className="mt-2 text-[14px] text-slate-700">
              <p>No more questions of this type right now.</p>
              <button type="button" onClick={() => setSkipped(s => [...s, current.id])} className="mt-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Go to the next type</button>
            </div>
          )}

          {q && (
            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-[15px]">
              <QuestionView q={q} />
            </div>
          )}

          {/* The answer */}
          {q && !grade && (
            <div className="mt-3">
              {mcq ? (
                <McqChips letters={mcqLettersIn(q.markdown)} value={typed} onPick={setTyped} disabled={!!busy} />
              ) : (
                <>
                  <div className="mb-2 flex gap-1.5" role="tablist">
                    {([['write', '✍️ Write here'], ['photo', '📷 Photo'], ['type', '⌨️ Type']] as [Mode, string][]).map(([m, label]) => (
                      <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(null); }}
                        className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${mode === m ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>
                    ))}
                  </div>
                  {mode === 'write' && <AnswerPad ref={pad} onChange={setPadEmpty} />}
                  {mode === 'photo' && (
                    <div className="rounded-xl border border-dashed border-slate-300 p-3">
                      <p className="text-[13px] text-slate-600">Work it out on paper, then take one clear photo of your working.</p>
                      <input type="file" accept="image/*" capture="environment" className="mt-2 text-[13px]"
                        onChange={async e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try { setPhoto(await fileToJpegDataUrl(f)); } catch (x) { setErr((x as Error).message); }
                        }} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {photo && <img src={photo} alt="Your working" className="mt-2 max-h-80 rounded-lg border" />}
                    </div>
                  )}
                  {mode === 'type' && (
                    <textarea value={typed} onChange={e => setTyped(e.target.value)} rows={6}
                      placeholder="Your working, one step a line"
                      className="w-full rounded-xl border border-slate-200 p-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-300" />
                  )}
                </>
              )}
              <button type="button" onClick={submit}
                disabled={!!busy || (mcq ? !typed : mode === 'write' ? padEmpty : mode === 'photo' ? !photo : !typed.trim())}
                className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50">
                {busy ?? 'Mark it'}
              </button>
            </div>
          )}

          {!q && !example && busy && <p className="mt-3 text-[13px] text-slate-500">{busy}</p>}

          {/* The result */}
          {grade && grade.verdict === 'correct' && (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-[16px] font-bold text-emerald-800">✓ {grade.score}/{grade.outOf} — you’ve got this type.</p>
              <button type="button" onClick={nextType} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white">Next question type ›</button>
            </div>
          )}

          {grade && grade.verdict !== 'correct' && (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                <p className="text-[16px] font-bold text-rose-800">{grade.score}/{grade.outOf} — not yet.</p>
                {grade.lineComments.filter(c => !c.ok).slice(0, 4).map((c, i) => (
                  <div key={i} className="mt-2 text-[14px] text-slate-800">
                    {grade.transcribedLines?.[c.line - 1] && (
                      <p className="text-[13px] text-slate-500">Your line: <MathText text={grade.transcribedLines[c.line - 1]} /></p>
                    )}
                    <p><MathText text={c.comment} /></p>
                    {c.fix && <p className="text-emerald-800">Should be: <MathText text={c.fix} /></p>}
                  </div>
                ))}
                {grade.nextSteps.length > 0 && (
                  <p className="mt-2 text-[13px] text-slate-700"><b>Next time:</b> <MathText text={grade.nextSteps[0]} /></p>
                )}
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">How it goes</p>
                {solution ? <div className="mt-1 text-[15px]"><Md text={solution} /></div> : <p className="mt-1 text-[13px] text-slate-500">Loading the worked solution…</p>}
              </div>
              <button type="button" onClick={anotherOne} disabled={!!busy}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50">
                Try another one like it
              </button>
              {misses >= missesBeforeHelp && (
                <div className="text-center">
                  <p className="text-[13px] text-slate-600">This type is a tough one. Your tutor will go through it with you.</p>
                  <button type="button" onClick={() => { setSkipped(s => [...s, current.id]); setGrade(null); setQ(null); }}
                    className="mt-1 text-[13px] font-semibold text-sky-700 underline underline-offset-2">Move on to the next type for now</button>
                </div>
              )}
            </div>
          )}

          {err && <p className="mt-2 text-[13px] text-rose-700">{err}</p>}
        </section>
      )}
    </main>
  );
}
