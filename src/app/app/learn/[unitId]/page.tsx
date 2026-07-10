'use client';
import { studentTitle } from '@/lib/learn';
// /app/learn/[unitId] — THE PLAYER. Renders one learning_unit by kind. All
// interaction is client-side (zero server round-trips after the unit loads).
// Mechanics ported from public/prototype-step-player.html.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { markDone, bumpSessionCleared, postUnitEvent, type UnitEvent } from '@/lib/learn-progress';
import type {
  AutopsyPayload, CheckPayload, CorePayload, Decision, ExamplePayload,
  LearnUnit, TryPayload, UnitSummary,
} from '@/lib/learn-types';

const REMARK = [remarkMath, remarkGfm];
const REHYPE = [rehypeRaw, rehypeKatex];

// Markdown + math. `block` renders raw LaTeX as display math ($$…$$).
function Md({ children, block = false, className = '' }: { children: string; block?: boolean; className?: string }) {
  const src = block ? `$$\n${children}\n$$` : children;
  return (
    <div className={`prose prose-sm max-w-none text-[#22303f] [&_p]:my-1 [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto ${className}`}>
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{src}</ReactMarkdown>
    </div>
  );
}

const CARD = 'bg-white border border-[#e3ddcc] rounded-2xl shadow-[0_1px_3px_rgba(30,45,70,.06)]';

// Next unit in the topic by authored order (unit_order).
function nextOf(siblings: UnitSummary[], current: LearnUnit): UnitSummary | null {
  const sorted = [...siblings].sort((a, b) => a.unit_order - b.unit_order);
  const idx = sorted.findIndex(s => s.id === current.id);
  return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
}

function SessionRecap({ cleared }: { cleared: number }) {
  if (cleared <= 0) return null;
  return (
    <p className="text-center text-sm font-semibold text-[#1f9e6f] mb-0.5">
      ✨ {cleared} cleared this session
    </p>
  );
}

function NextButton({ next, cleared = 0 }: { next: UnitSummary | null; cleared?: number }) {
  return (
    <div className="space-y-2">
      <SessionRecap cleared={cleared} />
      {!next ? (
        <Link href="/app/learn" className="block text-center bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3.5 font-semibold">
          ↺ Back to Learn
        </Link>
      ) : (
        <Link href={`/app/learn/${next.id}`} className="block text-center bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3.5 font-semibold">
          Next: {studentTitle(next.kind, next.title)} →
        </Link>
      )}
    </div>
  );
}

// ------------------------------------------------------- explain it back
// Optional one-sentence "when/why do you use this?" self-explanation, judged by
// the AI against the unit's own payload. Never blocks the Next button.
const VERDICT_TONE: Record<string, string> = {
  pass: 'border-[#1f9e6f] bg-[#f6fcf9] text-[#186a4c]',
  close: 'border-[#ecd9a8] bg-[hsl(43,90%,94%)] text-[#6b5310]',
  miss: 'border-[#d1495b] bg-[#fdeef0] text-[#8a2f3b]',
};
const VERDICT_ICON: Record<string, string> = { pass: '✓', close: '~', miss: '↻' };

function ExplainBack({ unitId }: { unitId: string }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ verdict: string; feedback: string } | null>(null);

  if (gone) return null;

  if (result) {
    return (
      <div className={`rounded-2xl border p-4 ${VERDICT_TONE[result.verdict] || VERDICT_TONE.close}`}>
        <p className="text-[.68rem] font-extrabold uppercase tracking-[.1em] mb-1 opacity-80">
          {VERDICT_ICON[result.verdict] || '~'} Explain it back
        </p>
        <p className="text-[.9rem] leading-snug">{result.feedback}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block w-full text-center border border-dashed border-[#d8d2bf] rounded-xl py-3 text-[.86rem] font-semibold text-[#66788d] hover:border-navy/40 hover:text-navy transition-colors"
      >
        🧠 Explain it back — one sentence
      </button>
    );
  }

  const submit = async () => {
    const a = answer.trim();
    if (!a || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/portal/learn/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, answer: a }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Couldn’t check that — try again.'); setBusy(false); return; }
      setResult({ verdict: d.verdict, feedback: d.feedback });
    } catch {
      setErr('Couldn’t check that — try again.'); setBusy(false);
    }
  };

  return (
    <div className={`${CARD} p-4 space-y-2.5`}>
      <p className="font-semibold text-navy text-[.9rem]">In one sentence — when or why do you use this?</p>
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value.slice(0, 200))}
        maxLength={200}
        rows={2}
        autoFocus
        placeholder="You use this when…"
        className="w-full rounded-xl border border-[#d8d2bf] bg-[hsl(45,60%,98%)] px-3 py-2.5 text-[.9rem] text-[#22303f] focus:outline-none focus:border-navy resize-none"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[.7rem] text-gray-400">{answer.length}/200</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setGone(true)} className="text-[.82rem] text-gray-400 px-2 py-1.5">Maybe later</button>
          <button
            onClick={submit}
            disabled={busy || !answer.trim()}
            className="bg-navy text-[hsl(45,100%,96%)] rounded-lg px-4 py-2 text-[.85rem] font-semibold disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      </div>
      {err && <p className="text-[.8rem] text-red-500">{err}</p>}
    </div>
  );
}

// ----------------------------------------------------------- faded replay
// Re-run the same worked example with every step's math hidden. The student
// works it on paper, reveals to check, then self-reports. A pure recall rep;
// self-reports post check_pass/check_fail against the unit.
function FadedReplay({ payload, onEvent, tryUnit }: {
  payload: ExamplePayload; onEvent: (e: UnitEvent) => void; tryUnit: UnitSummary | null;
}) {
  const [active, setActive] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [reported, setReported] = useState<null | 'pass' | 'fail'>(null);

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="block w-full text-center border border-[#d8d2bf] rounded-xl py-3 text-[.88rem] font-semibold text-navy hover:bg-[hsl(45,100%,97%)] transition-colors"
      >
        🔁 Try it faded — hide the working, do it on paper
      </button>
    );
  }

  const withMath = payload.steps.map((s, i) => (s.math ? i : -1)).filter(i => i >= 0);
  const allRevealed = withMath.every(i => revealed[i]);

  const report = (r: 'pass' | 'fail') => {
    if (reported) return;
    setReported(r);
    onEvent(r === 'pass' ? 'check_pass' : 'check_fail');
  };

  return (
    <div className={`${CARD} border-navy p-4 space-y-3`}>
      <p className="text-[.68rem] font-extrabold uppercase tracking-[.1em] text-navy">🔁 Faded replay</p>
      <p className="text-[.82rem] text-[#66788d]">Work each step on paper, then reveal to check yourself.</p>
      {payload.steps.map((s, i) => (
        <div key={i} className="border-t border-gray-100 pt-2.5 first:border-0 first:pt-0">
          {s.label && <div className="font-bold text-navy text-[.9rem] mb-1"><Md>{s.label}</Md></div>}
          {s.figure_svg && revealed[i] && <FigureSvg svg={s.figure_svg} />}
          {s.math && (
            revealed[i] ? (
              <div className="animate-[pop_.2s_ease]"><Md block>{s.math}</Md></div>
            ) : (
              <button
                onClick={() => setRevealed(r => ({ ...r, [i]: true }))}
                className="relative block w-full overflow-hidden rounded-lg border border-[#d8d2bf] bg-[hsl(45,60%,98%)]"
              >
                <div className="blur-[6px] select-none pointer-events-none opacity-70 px-2 py-1"><Md block>{s.math}</Md></div>
                <span className="absolute inset-0 flex items-center justify-center text-[.82rem] font-semibold text-navy">Reveal ▾</span>
              </button>
            )
          )}
        </div>
      ))}
      {allRevealed && reported === null && (
        <div className="flex gap-2 pt-1">
          <button onClick={() => report('pass')} className="flex-1 rounded-xl py-3 font-semibold border-[1.5px] border-[#1f9e6f] bg-[#e9f7f0] text-[#186a4c]">✓ Got it</button>
          <button onClick={() => report('fail')} className="flex-1 rounded-xl py-3 font-semibold border-[1.5px] border-[#d1495b] bg-[#fdeef0] text-[#8a2f3b]">✗ Not quite</button>
        </div>
      )}
      {reported && (
        <div className="pt-1">
          <p className="text-[.86rem] text-[#4a5a6d] mb-2">
            {reported === 'pass' ? 'Nice — that one’s sticking.' : 'No worries — that’s exactly what practice is for.'}
          </p>
          {tryUnit && (
            <Link href={`/app/learn/${tryUnit.id}`} className="block text-center bg-[#E7A417] text-white rounded-xl py-3 font-semibold">
              Ready for a fresh one? → {tryUnit.title}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- core
function CorePlayer({ payload, next, onDone, unitId }: { payload: CorePayload; next: UnitSummary | null; onDone: () => void; unitId: string }) {
  const [done, setDone] = useState(false);
  const finish = () => { if (!done) { setDone(true); onDone(); } };
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-4`}>
        {payload.figure_svg && <FigureSvg svg={payload.figure_svg} />}
        <Md>{payload.summary_md}</Md>
        {payload.formula_md && (
          <div className="mt-3">
            <Md>{payload.formula_md}</Md>
          </div>
        )}
      </div>
      {payload.remember_md && (
        <div className="rounded-2xl border border-[#ecd9a8] bg-[hsl(43,90%,94%)] rounded-tl-sm p-4 text-[#6b5310]">
          <p className="text-[.68rem] font-extrabold uppercase tracking-[.1em] text-[#b8860b] mb-1">Remember</p>
          <Md className="[&_*]:text-[#6b5310]">{payload.remember_md}</Md>
        </div>
      )}
      {!done ? (
        <button onClick={finish} className="block w-full text-center bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3.5 font-semibold">
          {next ? 'Got it →' : 'Got it — back to Learn'}
        </button>
      ) : (
        <>
          <ExplainBack unitId={unitId} />
          <NextButton next={next} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- example
type Beat =
  | { type: 'step'; label?: string; math?: string; annotation_md?: string; more_md?: string; figure_svg?: string }
  | { type: 'decision'; decision: Decision }
  | { type: 'answer'; md: string };

// Inline SVG diagram. Payloads are admin-authored, but strip active content
// defensively before injecting.
function FigureSvg({ svg }: { svg: string }) {
  const clean = useMemo(
    () => svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, ''),
    [svg],
  );
  if (!/^\s*<svg[\s>]/i.test(clean)) return null;
  return (
    <div
      className="mb-3 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto animate-[pop_.28s_ease]"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

// Collapsed "why" layer under a step — teaching depth on demand.
function WhyMore({ md }: { md: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-1.5 text-[.78rem] font-semibold text-navy/60 underline decoration-dotted underline-offset-2">
        Why? ▾
      </button>
    );
  }
  return (
    <div className="mt-1.5 rounded-xl border border-[#dfe5ec] bg-[#f7f9fb] px-3.5 py-2.5 text-[.84rem] text-[#4a5a6d] animate-[pop_.2s_ease]">
      <Md>{md}</Md>
    </div>
  );
}

function ExamplePlayer({ payload, next, onDone, onProgress, cleared, onEvent, tryUnit, unitId }: { payload: ExamplePayload; next: UnitSummary | null; onDone: () => void; onProgress: (v: number) => void; cleared: number; onEvent: (e: UnitEvent) => void; tryUnit: UnitSummary | null; unitId: string }) {
  const beats = useMemo<Beat[]>(() => {
    const out: Beat[] = [];
    payload.steps.forEach((s) => {
      out.push({ type: 'step', label: s.label, math: s.math, annotation_md: s.annotation_md, more_md: s.more_md, figure_svg: s.figure_svg });
    });
    // Decision quizzes are deliberately NOT rendered on the first-teach path —
    // Adrian's call (2026-07-10): students learning something new want the
    // content straight up; questions live in check/try decks. The decisions
    // data stays in payloads for a future optional "test yourself" replay.
    if (payload.answer_md) out.push({ type: 'answer', md: payload.answer_md });
    return out;
  }, [payload]);

  const [revealed, setRevealed] = useState(1);            // first beat shown on load
  const [answered, setAnswered] = useState<Record<number, { pick: number; ok: boolean }>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const lastIdx = revealed - 1;
  const lastBeat = beats[lastIdx];
  const locked = !!lastBeat && lastBeat.type === 'decision' && !answered[lastIdx]?.ok;
  const finished = revealed >= beats.length && !locked;

  const next$ = useCallback(() => {
    setRevealed(r => (r < beats.length ? r + 1 : r));
  }, [beats.length]);

  const advance = useCallback(() => { if (!locked) next$(); }, [locked, next$]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [revealed, answered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); advance(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  useEffect(() => { if (finished) onDone(); }, [finished, onDone]);

  const pick = (beatIdx: number, optIdx: number, ok: boolean) => {
    if (answered[beatIdx]?.ok) return;
    setAnswered(a => ({ ...a, [beatIdx]: { pick: optIdx, ok } }));
    if (ok) setTimeout(() => setRevealed(r => (r < beats.length ? r + 1 : r)), 650);
    else onEvent('decision_wrong');
  };

  const progress = beats.length ? Math.min(revealed / beats.length, 1) : 1;
  useEffect(() => { onProgress(progress); }, [progress, onProgress]);

  return (
    <>
      <div className="space-y-3">
        {/* Pinned problem */}
        <div className={`${CARD} p-4`}>
          <p className="text-[.68rem] font-bold uppercase tracking-[.1em] text-[#8a97a8] mb-1.5">Problem</p>
          <Md>{payload.problem_md}</Md>
        </div>

        {beats.slice(0, revealed).map((b, idx) => {
          if (b.type === 'step') {
            return (
              <div key={idx} className={`${CARD} p-4 animate-[pop_.28s_ease]`}>
                {b.label && <div className="font-bold text-navy text-[.92rem] mb-1"><Md>{b.label}</Md></div>}
                {b.figure_svg && <FigureSvg svg={b.figure_svg} />}
                {b.math && <Md block>{b.math}</Md>}
                {b.annotation_md && (
                  <div className="mt-2.5 rounded-xl rounded-tl-sm border border-[#ecd9a8] bg-[hsl(43,90%,94%)] px-3.5 py-2.5 text-[.86rem] text-[#6b5310]">
                    <span className="mr-1.5">💬</span>
                    <span className="inline [&_p]:inline [&_*]:text-[#6b5310]"><Md className="inline">{b.annotation_md}</Md></span>
                  </div>
                )}
                {b.more_md && <WhyMore md={b.more_md} />}
              </div>
            );
          }
          if (b.type === 'answer') {
            return (
              <div key={idx} className="rounded-2xl border border-[#1f9e6f] bg-[#f6fcf9] p-4 animate-[pop_.28s_ease]">
                <p className="font-bold text-[#1f9e6f] mb-1">Done ✓</p>
                <Md>{b.md}</Md>
              </div>
            );
          }
          // decision
          const d = b.decision;
          const ans = answered[idx];
          return (
            <div key={idx} className={`${CARD} border-navy p-4 animate-[pop_.28s_ease]`}>
              {d.context_strip_md && (
                <div className="mb-2.5 rounded-lg border border-dashed border-[#d8d2bf] bg-[hsl(45,50%,97%)] px-2.5 py-1.5 text-[.8rem] overflow-x-auto whitespace-nowrap">
                  <Md className="inline [&_p]:inline">{d.context_strip_md}</Md>
                </div>
              )}
              <div className="font-semibold mb-2.5"><Md className="inline [&_p]:inline">{d.prompt_md}</Md></div>
              {d.options.map((o, oi) => {
                const chosen = ans?.pick === oi;
                const tone = chosen ? (o.ok ? 'border-[#1f9e6f] bg-[#e9f7f0]' : 'border-[#d1495b] bg-[#fdeef0]') : 'border-[#d8d2bf] bg-[hsl(45,60%,97%)]';
                return (
                  <button
                    key={oi}
                    disabled={!!ans?.ok}
                    onClick={() => pick(idx, oi, !!o.ok)}
                    className={`block w-full text-left border-[1.5px] rounded-xl px-3.5 py-3 mb-2 min-h-[48px] text-[#22303f] transition active:scale-[.985] ${tone}`}
                  >
                    <Md className="inline [&_p]:inline">{o.label_md}</Md>
                  </button>
                );
              })}
              {ans && (() => {
                const fb = d.options[ans.pick]?.feedback_md;
                return fb ? <p className="text-[.84rem] text-[#4a5a6d] mt-1 px-0.5"><Md className="inline [&_p]:inline">{fb}</Md></p> : null;
              })()}
            </div>
          );
        })}
        <div ref={endRef} />

        {finished && (
          <>
            <FadedReplay payload={payload} onEvent={onEvent} tryUnit={tryUnit} />
            <ExplainBack unitId={unitId} />
            <NextButton next={next} cleared={cleared} />
          </>
        )}
      </div>

      {!finished && (
        <div
          onClick={advance}
          className={`fixed left-0 right-0 bottom-14 sm:bottom-0 z-30 text-center text-white font-bold cursor-pointer select-none ${locked ? 'bg-[#8794a6] pointer-events-none' : 'bg-navy'}`}
          style={{ paddingTop: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <span className="opacity-90">Tap to continue ▾</span>
          <span className="hidden min-[700px]:inline font-normal opacity-70 text-[.8rem]">  ·  or press Space</span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- check
function CheckPlayer({ payload, next, onDone, cleared, onEvent }: { payload: CheckPayload; next: UnitSummary | null; onDone: () => void; cleared: number; onEvent: (e: UnitEvent) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const solved = pick != null && !!payload.options[pick]?.ok;
  useEffect(() => { if (solved) onDone(); }, [solved, onDone]);
  const choose = (oi: number, ok: boolean) => {
    if (solved) return;
    setPick(oi);
    onEvent(ok ? 'check_pass' : 'check_fail');
  };
  return (
    <div className="space-y-3">
      <div className={`${CARD} border-navy p-4`}>
        <p className="text-[.68rem] font-extrabold uppercase tracking-[.1em] text-[#E7A417] mb-1.5">⚡ Quick check</p>
        <div className="font-semibold mb-2.5"><Md className="inline [&_p]:inline">{payload.prompt_md}</Md></div>
        {payload.options.map((o, oi) => {
          const chosen = pick === oi;
          const tone = chosen ? (o.ok ? 'border-[#1f9e6f] bg-[#e9f7f0]' : 'border-[#d1495b] bg-[#fdeef0]') : 'border-[#d8d2bf] bg-[hsl(45,60%,97%)]';
          return (
            <button
              key={oi}
              disabled={solved}
              onClick={() => choose(oi, !!o.ok)}
              className={`block w-full text-left border-[1.5px] rounded-xl px-3.5 py-3 mb-2 min-h-[48px] text-[#22303f] transition active:scale-[.985] ${tone}`}
            >
              <Md className="inline [&_p]:inline">{o.label_md}</Md>
            </button>
          );
        })}
        {pick != null && payload.options[pick]?.feedback_md && (
          <p className="text-[.84rem] text-[#4a5a6d] mt-1 px-0.5"><Md className="inline [&_p]:inline">{payload.options[pick]!.feedback_md!}</Md></p>
        )}
      </div>
      {solved && <NextButton next={next} cleared={cleared} />}
    </div>
  );
}

// ---------------------------------------------------------------- autopsy
function AutopsyPlayer({ payload, next, onDone, cleared }: { payload: AutopsyPayload; next: UnitSummary | null; onDone: () => void; cleared: number }) {
  const [solved, setSolved] = useState(false);
  const [misses, setMisses] = useState<Record<number, boolean>>({});
  useEffect(() => { if (solved) onDone(); }, [solved, onDone]);
  const tap = (lineNo: number) => {
    if (solved) return;
    if (lineNo === payload.wrong_line) setSolved(true);
    else setMisses(m => ({ ...m, [lineNo]: true }));
  };
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-4`}>
        <p className="text-[.68rem] font-extrabold uppercase tracking-[.1em] text-[#E7A417] mb-1.5">🔍 Spot the error</p>
        <Md>{payload.problem_md}</Md>
        {!solved && <p className="text-[.82rem] text-[#66788d] mt-2">Tap the line where the mistake first appears.</p>}
      </div>
      <div className="space-y-2">
        {payload.working.map((line, i) => {
          const lineNo = i + 1;
          const isWrong = solved && lineNo === payload.wrong_line;
          const missed = misses[lineNo];
          const tone = isWrong ? 'border-[#d1495b] bg-[#fdeef0]'
            : missed ? 'border-[#e3ddcc] bg-white opacity-60'
            : 'border-[#d8d2bf] bg-[hsl(45,60%,97%)]';
          return (
            <button
              key={i}
              disabled={solved}
              onClick={() => tap(lineNo)}
              className={`block w-full text-left border-[1.5px] rounded-xl px-3.5 py-3 min-h-[48px] transition active:scale-[.985] ${tone}`}
            >
              <Md className="inline [&_p]:inline">{line}</Md>
              {missed && !solved && <span className="block text-[.78rem] text-[#a06a70] mt-1">Not here — look again.</span>}
            </button>
          );
        })}
      </div>
      {solved && (
        <div className="rounded-2xl border border-[#1f9e6f] bg-[#f6fcf9] p-4 space-y-2">
          <div>
            <p className="text-[.68rem] font-bold uppercase tracking-[.1em] text-[#d1495b] mb-1">Why it’s wrong</p>
            <Md>{payload.why_md}</Md>
          </div>
          <div>
            <p className="text-[.68rem] font-bold uppercase tracking-[.1em] text-[#1f9e6f] mb-1">The fix</p>
            <Md>{payload.fix_md}</Md>
          </div>
        </div>
      )}
      {solved && <NextButton next={next} cleared={cleared} />}
    </div>
  );
}

// ---------------------------------------------------------------- try
function TryPlayer({ payload, next, onDone, cleared }: { payload: TryPayload; next: UnitSummary | null; onDone: () => void; cleared: number }) {
  const [showAns, setShowAns] = useState(false);
  return (
    <div className="space-y-3">
      <div className={`${CARD} border-dashed p-4`}>
        <p className="text-[.68rem] font-extrabold uppercase tracking-[.1em] text-[#E7A417] mb-1.5">✏️ Your turn</p>
        <Md>{payload.problem_md}</Md>
        {payload.note_md && <p className="text-[.82rem] text-[#66788d] mt-2"><Md className="inline [&_p]:inline">{payload.note_md}</Md></p>}
      </div>
      <Link
        href="/app/practice"
        onClick={onDone}
        className="block text-center bg-[#E7A417] text-white rounded-xl py-3.5 font-semibold"
      >
        Try it — get marked →
      </Link>
      {payload.answer_md && (
        <div className={`${CARD} p-4`}>
          <button onClick={() => setShowAns(s => !s)} className="text-sm font-semibold text-navy">
            {showAns ? 'Hide answer' : 'Show answer'}
          </button>
          {showAns && <div className="mt-2"><Md>{payload.answer_md}</Md></div>}
        </div>
      )}
      <NextButton next={next} cleared={cleared} />
    </div>
  );
}

// ---------------------------------------------------------------- header bits
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 bg-white/20 rounded-full overflow-hidden mt-2">
      <div className="h-full bg-[#E7A417] transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function UnitPlayerPage() {
  const params = useParams<{ unitId: string }>();
  const unitId = params.unitId;
  const [unit, setUnit] = useState<LearnUnit | null>(null);
  const [siblings, setSiblings] = useState<UnitSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [exProgress, setExProgress] = useState(0);
  const [doneLocal, setDoneLocal] = useState(false);
  const [cleared, setCleared] = useState(0);
  const bumpedRef = useRef(false);

  useEffect(() => {
    if (!unitId) return;
    fetch(`/api/portal/learn/unit?id=${encodeURIComponent(unitId)}`)
      .then(async r => {
        if (r.status === 404 || r.status === 403) { setStatus('notfound'); return null; }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setUnit(d.unit);
        setSiblings(d.siblings || []);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [unitId]);

  const logEvent = useCallback((event: UnitEvent) => {
    if (!unit) return;
    postUnitEvent({ unitId: unit.id, subject: unit.subject, topic: unit.topic, kind: unit.kind }, event);
  }, [unit]);

  const onDone = useCallback(() => {
    if (unit) markDone(unit.id);
    setDoneLocal(true);
    if (!bumpedRef.current) {
      bumpedRef.current = true;
      setCleared(bumpSessionCleared());
      logEvent('completed');
    }
  }, [unit, logEvent]);
  const next = useMemo(() => (unit ? nextOf(siblings, unit) : null), [siblings, unit]);
  const tryUnit = useMemo(() => siblings.find(s => s.kind === 'try') ?? null, [siblings]);
  const headerProgress = !unit ? 0
    : unit.kind === 'example' ? exProgress
    : doneLocal ? 1 : 0.12;

  return (
    <div className="-mx-4 -my-5">
      {/* Sticky navy header (under the app top nav) */}
      <div className="sticky top-14 z-20 bg-navy text-white px-4 pt-2.5 pb-2" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <div className="max-w-[560px] mx-auto">
          <Link href="/app/learn" className="text-[.7rem] text-white/70 hover:text-white">← Learn</Link>
          <div className="font-bold text-[.9rem] leading-tight">{unit?.topic || 'Lesson'}</div>
          <div className="text-[.7rem] opacity-75">{unit?.title || ''}{unit?.pending ? ' · pending' : ''}</div>
          <ProgressBar value={headerProgress} />
        </div>
      </div>

      <div className="max-w-[560px] mx-auto px-4 pt-4 pb-40">
        {status === 'loading' && <p className="text-sm text-gray-400">Loading…</p>}
        {status === 'error' && <p className="text-sm text-red-500">Couldn’t load this lesson.</p>}
        {status === 'notfound' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">This lesson isn’t available.</p>
            <Link href="/app/learn" className="text-sm text-navy underline underline-offset-2">← Back to Learn</Link>
          </div>
        )}
        {status === 'ready' && unit && (
          <>
            {unit.kind === 'core' && <CorePlayer payload={unit.payload as CorePayload} next={next} onDone={onDone} unitId={unit.id} />}
            {unit.kind === 'example' && <ExamplePlayer payload={unit.payload as ExamplePayload} next={next} onDone={onDone} onProgress={setExProgress} cleared={cleared} onEvent={logEvent} tryUnit={tryUnit} unitId={unit.id} />}
            {unit.kind === 'check' && <CheckPlayer payload={unit.payload as CheckPayload} next={next} onDone={onDone} cleared={cleared} onEvent={logEvent} />}
            {unit.kind === 'autopsy' && <AutopsyPlayer payload={unit.payload as AutopsyPayload} next={next} onDone={onDone} cleared={cleared} />}
            {unit.kind === 'try' && <TryPlayer payload={unit.payload as TryPayload} next={next} onDone={onDone} cleared={cleared} />}
          </>
        )}
      </div>
    </div>
  );
}
