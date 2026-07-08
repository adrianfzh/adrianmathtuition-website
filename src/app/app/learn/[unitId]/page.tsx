'use client';
// /app/learn/[unitId] — THE PLAYER. Renders one learning_unit by kind. All
// interaction is client-side (zero server round-trips after the unit loads).
// Mechanics ported from public/prototype-step-player.html.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { markDone } from '@/lib/learn-progress';
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

function NextButton({ next }: { next: UnitSummary | null }) {
  if (!next) {
    return (
      <Link href="/app/learn" className="block text-center bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3.5 font-semibold">
        ↺ Back to Learn
      </Link>
    );
  }
  return (
    <Link href={`/app/learn/${next.id}`} className="block text-center bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3.5 font-semibold">
      Next: {next.title} →
    </Link>
  );
}

// ---------------------------------------------------------------- core
function CorePlayer({ payload, next, onDone }: { payload: CorePayload; next: UnitSummary | null; onDone: () => void }) {
  const router = useRouter();
  const go = () => { onDone(); router.push(next ? `/app/learn/${next.id}` : '/app/learn'); };
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-4`}>
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
      <button onClick={go} className="block w-full text-center bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3.5 font-semibold">
        {next ? 'Got it →' : 'Got it — back to Learn'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- example
type Beat =
  | { type: 'step'; label?: string; math?: string; annotation_md?: string }
  | { type: 'decision'; decision: Decision }
  | { type: 'answer'; md: string };

function ExamplePlayer({ payload, next, onDone, onProgress }: { payload: ExamplePayload; next: UnitSummary | null; onDone: () => void; onProgress: (v: number) => void }) {
  const beats = useMemo<Beat[]>(() => {
    const out: Beat[] = [];
    payload.steps.forEach((s, idx) => {
      out.push({ type: 'step', label: s.label, math: s.math, annotation_md: s.annotation_md });
      (payload.decisions || [])
        .filter(d => d.after_step === idx + 1)
        .forEach(d => out.push({ type: 'decision', decision: d }));
    });
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
                {b.math && <Md block>{b.math}</Md>}
                {b.annotation_md && (
                  <div className="mt-2.5 rounded-xl rounded-tl-sm border border-[#ecd9a8] bg-[hsl(43,90%,94%)] px-3.5 py-2.5 text-[.86rem] text-[#6b5310]">
                    <span className="mr-1.5">💬</span>
                    <span className="inline [&_p]:inline [&_*]:text-[#6b5310]"><Md className="inline">{b.annotation_md}</Md></span>
                  </div>
                )}
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

        {finished && <NextButton next={next} />}
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
function CheckPlayer({ payload, next, onDone }: { payload: CheckPayload; next: UnitSummary | null; onDone: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const solved = pick != null && !!payload.options[pick]?.ok;
  useEffect(() => { if (solved) onDone(); }, [solved, onDone]);
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
              onClick={() => setPick(oi)}
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
      {solved && <NextButton next={next} />}
    </div>
  );
}

// ---------------------------------------------------------------- autopsy
function AutopsyPlayer({ payload, next, onDone }: { payload: AutopsyPayload; next: UnitSummary | null; onDone: () => void }) {
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
      {solved && <NextButton next={next} />}
    </div>
  );
}

// ---------------------------------------------------------------- try
function TryPlayer({ payload, next, onDone }: { payload: TryPayload; next: UnitSummary | null; onDone: () => void }) {
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
      <NextButton next={next} />
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

  const onDone = useCallback(() => { if (unit) markDone(unit.id); setDoneLocal(true); }, [unit]);
  const next = useMemo(() => (unit ? nextOf(siblings, unit) : null), [siblings, unit]);
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
            {unit.kind === 'core' && <CorePlayer payload={unit.payload as CorePayload} next={next} onDone={onDone} />}
            {unit.kind === 'example' && <ExamplePlayer payload={unit.payload as ExamplePayload} next={next} onDone={onDone} onProgress={setExProgress} />}
            {unit.kind === 'check' && <CheckPlayer payload={unit.payload as CheckPayload} next={next} onDone={onDone} />}
            {unit.kind === 'autopsy' && <AutopsyPlayer payload={unit.payload as AutopsyPayload} next={next} onDone={onDone} />}
            {unit.kind === 'try' && <TryPlayer payload={unit.payload as TryPayload} next={next} onDone={onDone} />}
          </>
        )}
      </div>
    </div>
  );
}
