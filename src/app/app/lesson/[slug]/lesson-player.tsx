'use client';

// The animated lesson player — pure client code interpreting a scene script
// (lib/lesson-script.ts). No AI at runtime; every frame is computed.
//
// Motion is designed, not incidental. The rules this file holds itself to:
//
//   · NO LAYOUT SHIFT on progressive reveals. Every equation line, note and
//     callout is rendered (and laid out) from the moment its scene mounts,
//     hidden by opacity alone — revealing flips a class, never the geometry.
//     This is also what makes the moved-term FLIP exact: the destination
//     glyph's rect is measurable before it is visible.
//   · The moved-term animation is a real FLIP: a clone of the source token
//     flies along a transform to the measured destination rect (scaled to
//     match), then crossfades into the live destination token — it lands on
//     the glyph, not near it.
//   · Graph morphs hold axes, gridlines and labels rock-steady; only the
//     curve's path data mutates, imperatively via rAF (no React re-render per
//     frame). States are polynomial coefficient arrays, lerped — every
//     intermediate frame is a real polynomial.
//   · One easing family throughout: cubic-bezier(.22,1,.36,1) for reveals,
//     ease-in-out cubic for morphs — nothing snaps.
//   · prefers-reduced-motion collapses flights and morphs to instant states.
//   · Three pacings, one control row: Manual (tap), ▶ Auto (silent timer
//     beats) and 🔊 Voice (the narration clips set the pace — see
//     lesson-narration.ts). Captions never leave the screen in any of them;
//     the voice is additive. Reduced-motion users get the voice too.
//   · The timed pacings share a speed (1×–3×, lsn:rate) and a pause. Speed
//     divides every beat and sets the clip's playbackRate; pause freezes the
//     clip AND the running beat where they are, and resume continues from
//     that point (never a restart, never a re-lock).
//   · The teacher's cursor: as the voice speaks, the prose on the card wakes
//     sentence by sentence — the one being said sits at full ink under a slim
//     amber underline that sweeps at the spoken pace, the ones to come wait
//     at 40 %, the ones said settle to 85 % — and a spoken-line ribbon under
//     the card brightens the narration's words as they are said. Timing comes
//     from a sidecar when the script declares one, else proportionally from
//     the clip's duration (lib/lesson-speech.ts). Equation tokens are never
//     animated word by word — they arrive per step already. Silent Auto beats
//     reveal sentences across the beat; Manual shows everything at once.
//     Driven from audio.currentTime in a rAF, so rate and pause come free;
//     the DOM is mutated in place (data-state / --sweep), never re-rendered
//     per frame. Reduced motion keeps the opacity states, drops the sweep.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { MathMarkdown, katexOptions } from '@/lib/math-markdown';
import { checkTypedAnswer } from '@/lib/notebook';
import {
  lessonHasAudio, narrationLayout, sceneStepCount,
  type AnnotateScene, type CaptionScene, type EquationStepsScene,
  type GraphMorphScene, type LessonTone, type PlayScene,
  type ResolvedCheckScene, type StepToken, type TitleScene,
} from '@/lib/lesson-script';
import {
  PLAYBACK_RATES, alignShownToSpoken, buildSpeechTrack, isBlockMarkdown, rateLabel, scaleBeat,
  speechStatesAt, speechWeight, splitProse, wordsLitAt,
  type PlaybackRate, type SpeechTrack, type SpeechState,
} from '@/lib/lesson-speech';
import { useNarration, usePref, useRatePref, writePref, writeRate } from './lesson-narration';

// useLayoutEffect measures cloned-token flight paths; on the server it must
// quietly be useEffect (standard isomorphic guard — avoids the SSR warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

// ── Small shared renderers ───────────────────────────────────────────────────

/** One KaTeX fragment (no $ delimiters). */
function Tex({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { ...katexOptions, displayMode: false }),
    [tex],
  );
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Inline prose with $…$ math — same guard as practice-flow's MathText: plain
// strings never enter markdown, so nothing gets accidentally italicised.
const INLINE_P = { p: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
function MathText({ text }: { text: string }) {
  if (!text.includes('$')) return <>{text}</>;
  return <MathMarkdown content={text} components={INLINE_P} />;
}

/**
 * Prose that the teacher's cursor can walk: one <span data-sent> per sentence,
 * grouped by the sub-step (`group`) whose narration reads it. `data-w` is the
 * sentence's speaking weight (the proportional map reads it back from the
 * DOM); `data-state` starts at `waiting` in a timed pacing and `idle` (full
 * ink) in Manual — the rAF cursor then owns it. Markdown and `$…$` survive per
 * sentence (the splitter never cuts inside them); a block-markdown paragraph
 * (list, display math) renders whole as one unit.
 */
function Prose({ text, group, timed, markdown = false, className }: {
  text: string; group: number; timed: boolean; markdown?: boolean; className?: string;
}) {
  const paras = useMemo(() => splitProse(text), [text]);
  const state = timed ? 'waiting' : 'idle';
  let idx = 0;
  const sentence = (sent: string) => {
    const i = idx++;
    const rich = markdown || /[$*`]/.test(sent);
    return (
      <span key={i} className="lsn-sent" data-sent-group={group} data-sent={i} data-w={speechWeight(sent)} data-state={state}>
        {rich ? <MathMarkdown content={sent} components={INLINE_P} /> : sent}
      </span>
    );
  };
  const inline = (sents: string[]) => sents.flatMap((sent, i) => (i === 0 ? [sentence(sent)] : [' ', sentence(sent)]));
  if (paras.length === 1 && !isBlockMarkdown(paras[0][0])) {
    return className ? <span className={className}>{inline(paras[0])}</span> : <>{inline(paras[0])}</>;
  }
  return (
    <div className={className}>
      {paras.map((sents, p) =>
        isBlockMarkdown(sents[0]) ? (
          <div key={p} className="lsn-sent" data-sent-group={group} data-sent={idx++} data-w={speechWeight(sents[0])} data-state={state}>
            <MathMarkdown content={sents[0]} />
          </div>
        ) : (
          <p key={p}>{inline(sents)}</p>
        ),
      )}
    </div>
  );
}

const TONE = {
  amber: { hl: 'lsn-hl-amber', chip: 'bg-amber-50 border-amber-200 text-amber-900', stroke: '#f59e0b' },
  sky: { hl: 'lsn-hl-sky', chip: 'bg-sky-50 border-sky-200 text-sky-900', stroke: '#0ea5e9' },
  rose: { hl: 'lsn-hl-rose', chip: 'bg-rose-50 border-rose-200 text-rose-900', stroke: '#f43f5e' },
  emerald: { hl: 'lsn-hl-emerald', chip: 'bg-emerald-50 border-emerald-200 text-emerald-900', stroke: '#10b981' },
} as const satisfies Record<LessonTone, { hl: string; chip: string; stroke: string }>;

function TokenSpan({ t }: { t: StepToken }) {
  return (
    <span
      data-token-id={t.id || undefined}
      data-from={t.from || undefined}
      className={`lsn-tok inline-block ${t.hl ? `lsn-hl ${TONE[t.hl].hl}` : ''}`}
    >
      <Tex tex={t.tex} />
    </span>
  );
}

// prefers-reduced-motion as an external store — SSR-safe (false on the server)
// and no setState-in-effect cascade.
const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

// ── Scene: title ─────────────────────────────────────────────────────────────

function TitleView({ scene, minutes, timed }: { scene: TitleScene; minutes: number; timed: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-2 py-10">
      {/* inline-block: transforms are ignored on plain inline boxes, and the
          rise animation translates. Same reason on every lsn-rise span below. */}
      <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-rise" style={{ animationDelay: '80ms' }}>
        ▶ Animated lesson · ≈ {minutes} min
      </span>
      <h2 className="mt-3 text-[27px] leading-tight font-bold text-navy lsn-rise" style={{ animationDelay: '200ms' }}>
        {scene.title}
      </h2>
      <p className="mt-4 max-w-xs text-[15px] text-slate-600 leading-relaxed lsn-rise" style={{ animationDelay: '380ms' }}>
        <Prose text={scene.promise} group={0} timed={timed} />
      </p>
    </div>
  );
}

// ── Scene: caption ───────────────────────────────────────────────────────────

function CaptionView({ scene, timed }: { scene: CaptionScene; timed: boolean }) {
  return (
    <div className="flex-1 flex flex-col justify-center px-1 py-6">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 lsn-rise">{scene.heading}</p>
      )}
      <div className="lsn-rise" style={{ animationDelay: '120ms' }}>
        <Prose text={scene.text} group={0} timed={timed} markdown
          className="prose prose-sm max-w-none text-slate-700 leading-relaxed text-[15px] [&>p]:my-0 [&>*+*]:mt-3 block" />
      </div>
    </div>
  );
}

// ── Scene: equation-steps (with moved-term FLIP) ─────────────────────────────

/**
 * An element's LAYOUT box relative to `container`, via the offsetParent chain.
 * Deliberately not getBoundingClientRect: a freshly revealed line is mid
 * translateY(6px)→0 transition when the layout effect measures, so client
 * rects come back 6px low — offsets are transform-immune, so flights and
 * connectors land on the glyph's RESTING position, exactly.
 */
function offsetRect(el: HTMLElement, container: HTMLElement) {
  let x = 0, y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

function flyClone(container: HTMLElement, source: HTMLElement, target: HTMLElement) {
  const s = offsetRect(source, container);
  const t = offsetRect(target, container);
  if (s.width === 0 || t.width === 0) return;

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-token-id');
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${s.left}px`,
    top: `${s.top}px`,
    width: `${s.width}px`,
    height: `${s.height}px`,
    margin: '0',
    opacity: '1',
    transformOrigin: 'top left',
    transition: `transform 620ms cubic-bezier(0.3, 0.85, 0.25, 1), opacity 200ms ease 440ms`,
    willChange: 'transform',
    pointerEvents: 'none',
    zIndex: '20',
  });
  container.appendChild(clone);
  target.classList.add('lsn-landing'); // destination stays invisible while the clone flies

  // Commit the start frame, then animate to the measured destination.
  void clone.getBoundingClientRect();
  const dx = t.left - s.left;
  const dy = t.top - s.top;
  const sx = t.width / Math.max(s.width, 1);
  const sy = t.height / Math.max(s.height, 1);
  requestAnimationFrame(() => {
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    clone.style.opacity = '0';
  });

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    target.classList.remove('lsn-landing'); // crossfade in (token opacity transition)
    clone.remove();
  };
  clone.addEventListener('transitionend', (e) => { if (e.propertyName === 'opacity') finish(); });
  window.setTimeout(finish, 800); // belt-and-braces if transitionend is swallowed
}

function EquationStepsView({ scene, step, reduced, timed }: {
  scene: EquationStepsScene; step: number; reduced: boolean; timed: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRevealed = useRef(0);
  const revealed = step + 1;

  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const prev = prevRevealed.current;
    prevRevealed.current = revealed;
    // Fly tokens only when moving FORWARD by exactly one line (tap/beat) —
    // back-nav or a jump shows the finished state without re-animating.
    if (reduced || revealed !== prev + 1) return;
    const lineIdx = revealed - 1;
    const newLine = cont.querySelector<HTMLElement>(`[data-line="${lineIdx}"]`);
    if (!newLine) return;
    for (const target of Array.from(newLine.querySelectorAll<HTMLElement>('[data-from]'))) {
      const fromId = target.getAttribute('data-from');
      if (!fromId) continue;
      const source = Array.from(cont.querySelectorAll<HTMLElement>(`[data-token-id="${CSS.escape(fromId)}"]`))
        .find(el => {
          const line = el.closest('[data-line]');
          return line && Number(line.getAttribute('data-line')) < lineIdx;
        });
      if (source) flyClone(cont, source, target);
    }
  }, [revealed, reduced]);

  return (
    <div className="flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{scene.heading}</p>
      )}
      {scene.intro && (
        <p className="text-[15px] text-slate-700 mb-4"><MathText text={scene.intro} /></p>
      )}
      {/* relative: FLIP clones are positioned against this box. Every line is
          laid out from mount (hidden by opacity), so revealing never shifts
          layout and flight destinations are measurable in advance. */}
      <div ref={containerRef} className="relative space-y-4">
        {scene.steps.map((s, i) => (
          <div key={i} data-line={i} aria-hidden={i >= revealed}
            className={`lsn-line ${i < revealed ? 'on' : ''}`}>
            <div className="text-[17px] text-slate-800 leading-relaxed flex flex-wrap items-baseline gap-x-1.5 gap-y-1.5">
              {s.tokens.map((t, ti) => <TokenSpan key={ti} t={t} />)}
            </div>
            {/* The note is the prose the voice reads for this line; the
                tokens above it arrive per step and are never walked word by
                word. The intro (the question) stays at full ink throughout. */}
            {s.note && (
              <p className="mt-1.5 text-[13px] text-slate-500 leading-snug"><Prose text={s.note} group={i} timed={timed} /></p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scene: graph-morph ───────────────────────────────────────────────────────

const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function polyAt(coeffs: number[], x: number): number {
  let y = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) y = y * x + coeffs[i];
  return y;
}

function GraphMorphView({ scene, step, reduced }: {
  scene: GraphMorphScene; step: number; reduced: boolean;
}) {
  const W = 360, H = 250, L = 38, R = 12, T = 12, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const { xMin, xMax, yMin, yMax } = scene.window;
  const px = useCallback((x: number) => L + ((x - xMin) / (xMax - xMin)) * plotW, [xMin, xMax, plotW]);
  const py = useCallback((y: number) => T + ((yMax - y) / (yMax - yMin)) * plotH, [yMin, yMax, plotH]);

  const maxLen = Math.max(...scene.states.map(s => s.coeffs.length));
  const padded = useMemo(
    () => scene.states.map(s => [...s.coeffs, ...Array(maxLen - s.coeffs.length).fill(0)]),
    [scene.states, maxLen],
  );

  const pathFor = useCallback((t: number): string => {
    const i0 = Math.max(0, Math.min(padded.length - 1, Math.floor(t)));
    const i1 = Math.max(0, Math.min(padded.length - 1, Math.ceil(t)));
    const f = t - i0;
    const coeffs = padded[i0].map((c, i) => c + (padded[i1][i] - c) * f);
    const N = 120;
    let d = '';
    let pen = false; // lift the pen over non-finite samples
    for (let i = 0; i <= N; i++) {
      const x = xMin + ((xMax - xMin) * i) / N;
      let y = polyAt(coeffs, x);
      if (!Number.isFinite(y)) { pen = false; continue; }
      // Keep SVG numbers sane far outside the window; the clipPath crops.
      y = Math.max(yMin - 40, Math.min(yMax + 40, y));
      d += `${pen ? 'L' : 'M'}${px(x).toFixed(2)} ${py(y).toFixed(2)}`;
      pen = true;
    }
    return d;
  }, [padded, xMin, xMax, yMin, yMax, px, py]);

  const pathRef = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGPathElement>(null);
  const tRef = useRef(0);
  const rafRef = useRef(0);

  // Layout effect: the FIRST draw must land before paint (a plain effect
  // would let one frame through with an empty path — a visible blink).
  useIsoLayoutEffect(() => {
    const target = Math.min(step, padded.length - 1);
    const start = tRef.current;
    const setPath = (t: number) => pathRef.current?.setAttribute('d', pathFor(t));
    if (start === target || reduced) {
      tRef.current = target;
      setPath(target);
      if (ghostRef.current) ghostRef.current.style.opacity = '0';
      return;
    }
    // Freeze the outgoing curve as a faint ghost so the change reads.
    if (ghostRef.current) {
      ghostRef.current.setAttribute('d', pathFor(start));
      ghostRef.current.style.opacity = '1';
    }
    const t0 = performance.now();
    const D = 950;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / D);
      tRef.current = start + (target - start) * easeInOutCubic(p);
      setPath(tRef.current);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [step, pathFor, reduced, padded.length]);

  // Axes + ticks: static for the whole scene — only the curve ever moves.
  const xTicks: number[] = [];
  for (let v = Math.ceil(xMin); v <= Math.floor(xMax); v++) if (v !== 0) xTicks.push(v);
  const yStep = yMax - yMin > 6 ? 2 : 1;
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) if (v !== 0) yTicks.push(v);
  const x0 = xMin <= 0 && 0 <= xMax ? px(0) : L;
  const y0 = yMin <= 0 && 0 <= yMax ? py(0) : T + plotH;

  return (
    <div className="flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{scene.heading}</p>
      )}
      {/* Fixed-height label slot — states crossfade in place, no reflow. */}
      <div className="relative h-12 mb-1">
        {scene.states.map((s, i) => (
          <div key={i} aria-hidden={i !== Math.min(step, scene.states.length - 1)}
            className="absolute inset-0 flex items-center justify-center text-center text-[15px] text-navy font-medium"
            style={{ opacity: i === Math.min(step, scene.states.length - 1) ? 1 : 0, transition: `opacity 360ms ${EASE}` }}>
            <MathText text={s.label} />
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img"
        aria-label={scene.heading || 'Graph'}>
        <defs>
          <clipPath id="lsn-plot-clip"><rect x={L} y={T} width={plotW} height={plotH} /></clipPath>
        </defs>
        {/* gridlines */}
        {xTicks.map(v => (
          <line key={`gx${v}`} x1={px(v)} y1={T} x2={px(v)} y2={T + plotH} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {yTicks.map(v => (
          <line key={`gy${v}`} x1={L} y1={py(v)} x2={L + plotW} y2={py(v)} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {/* axes */}
        <line x1={L} y1={y0} x2={L + plotW} y2={y0} stroke="#94a3b8" strokeWidth="1.2" />
        <line x1={x0} y1={T} x2={x0} y2={T + plotH} stroke="#94a3b8" strokeWidth="1.2" />
        {/* tick labels — upright, small, steady */}
        {xTicks.map(v => (
          <text key={`tx${v}`} x={px(v)} y={y0 + 14} fontSize="10" fill="#94a3b8" textAnchor="middle">{v}</text>
        ))}
        {yTicks.map(v => (
          <text key={`ty${v}`} x={x0 - 5} y={py(v) + 3.5} fontSize="10" fill="#94a3b8" textAnchor="end">{v}</text>
        ))}
        {scene.xLabel && (
          <text x={L + plotW - 2} y={y0 - 6} fontSize="11" fill="#64748b" textAnchor="end" fontStyle="italic">{scene.xLabel}</text>
        )}
        {scene.yLabel && (
          <text x={x0 + 7} y={T + 10} fontSize="11" fill="#64748b" fontStyle="italic">{scene.yLabel}</text>
        )}
        <g clipPath="url(#lsn-plot-clip)">
          {/* outgoing curve, frozen faint while the live one morphs away from it */}
          <path ref={ghostRef} d="" fill="none" stroke="#cbd5e1" strokeWidth="1.6"
            strokeDasharray="4 4" style={{ opacity: 0, transition: 'opacity 300ms ease' }} />
          <path ref={pathRef} d="" fill="none" stroke="hsl(220, 60%, 20%)" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
      {scene.caption && (
        <p className="mt-3 text-[13px] text-slate-500 leading-snug"><MathText text={scene.caption} /></p>
      )}
    </div>
  );
}

// ── Scene: annotate ──────────────────────────────────────────────────────────

type ConnLine = { x1: number; y1: number; x2: number; y2: number; tone: LessonTone };

function AnnotateView({ scene, step, timed }: { scene: AnnotateScene; step: number; timed: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<ConnLine[]>([]);
  const shownCallouts = Math.max(0, step); // step 0 = expression only

  const measure = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const next: ConnLine[] = [];
    // offsetRect, not client rects: chips/tokens may still be mid reveal
    // transition when this runs — offsets give their RESTING geometry, so a
    // connector drawn early is already anchored where things settle.
    scene.callouts.forEach((c, i) => {
      const dot = cont.querySelector<HTMLElement>(`[data-conn-dot="${i}"]`);
      const target = cont.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(c.target)}"]`);
      if (!dot || !target) return;
      const d = offsetRect(dot, cont);
      const t = offsetRect(target, cont);
      next.push({
        x1: d.left + d.width / 2,
        y1: d.top + d.height / 2,
        x2: t.left + t.width / 2,
        y2: t.top + t.height + 3,
        tone: c.tone ?? 'amber',
      });
    });
    setLines(next);
  }, [scene.callouts]);

  useIsoLayoutEffect(() => {
    measure();
    const cont = containerRef.current;
    if (!cont || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(cont);
    // KaTeX webfonts can land after first paint and nudge glyph widths — the
    // container height may not change, so ResizeObserver alone would leave
    // connectors anchored to stale positions. Re-measure once fonts settle.
    let fontsCancelled = false;
    document.fonts?.ready?.then(() => { if (!fontsCancelled) measure(); });
    return () => { fontsCancelled = true; ro.disconnect(); };
  }, [measure, step]);

  return (
    <div className="flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{scene.heading}</p>
      )}
      {/* The intro is step 0's prose (the expression reveal has no other words). */}
      {scene.intro && (
        <p className="text-[15px] text-slate-700 mb-2"><Prose text={scene.intro} group={0} timed={timed} /></p>
      )}
      <div ref={containerRef} className="relative">
        {/* connector overlay — pointer-transparent, px coordinates vs container */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          {lines.slice(0, shownCallouts).map((l, i) => {
            const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
            return (
              <g key={i}>
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={TONE[l.tone].stroke}
                  strokeWidth="1.5" strokeDasharray={len}
                  className="lsn-conn" style={{ '--len': `${len}` } as React.CSSProperties} />
                <circle cx={l.x2} cy={l.y2} r="3" fill={TONE[l.tone].stroke} className="lsn-conn-dot" />
              </g>
            );
          })}
        </svg>
        {/* the expression — tokens stagger up on scene entry */}
        <div className="min-h-[96px] flex items-center justify-center py-5">
          <div className="text-[19px] text-navy flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-2">
            {scene.tokens.map((t, i) => (
              <span key={i} className="inline-block lsn-rise" style={{ animationDelay: `${i * 70}ms` }}>
                <TokenSpan t={t} />
              </span>
            ))}
          </div>
        </div>
        {/* callouts — every slot laid out from mount; reveal is opacity-only */}
        <div className="space-y-2 pt-2">
          {scene.callouts.map((c, i) => (
            <div key={i} aria-hidden={i >= shownCallouts}
              className={`lsn-line ${i < shownCallouts ? 'on' : ''} flex items-start gap-2.5 border rounded-xl px-3 py-2 ${TONE[c.tone ?? 'amber'].chip}`}>
              <span data-conn-dot={i} aria-hidden
                className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                style={{ background: TONE[c.tone ?? 'amber'].stroke }} />
              <span className="text-[13.5px] leading-snug"><Prose text={c.label} group={i + 1} timed={timed} /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Scene: check (real bank question, graded locally, recorded server-side) ──

type CheckStatus = 'idle' | 'retry' | 'correct' | 'reveal' | 'unclear';

function CheckView({ scene, slug, onResolved, timed }: {
  scene: ResolvedCheckScene; slug: string; onResolved: () => void; timed: boolean;
}) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<CheckStatus>('idle');
  const [attempts, setAttempts] = useState(0);
  const recorded = useRef(false);

  function submit() {
    const typed = value.trim();
    if (!typed || status === 'correct' || status === 'reveal' || status === 'unclear') return;
    const verdict = checkTypedAnswer(typed, scene.answer);
    // Record the FIRST attempt only — that's the honest diagnostic signal; the
    // retry is aided. Fire-and-forget: the server re-grades against the bank
    // answer with the same checker and writes the student_attempts row so
    // mastery credit accrues (route: /api/portal/lesson-check). A network
    // failure here never blocks the lesson — grading already happened locally.
    if (!recorded.current) {
      recorded.current = true;
      fetch('/api/portal/lesson-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, qid: scene.qid, answer: typed }),
        keepalive: true,
      }).catch(() => {});
    }
    setAttempts(a => a + 1);
    if (verdict === 'correct') { setStatus('correct'); onResolved(); }
    else if (verdict === 'wrong' && attempts === 0) setStatus('retry'); // exactly one retry
    else if (verdict === 'wrong') { setStatus('reveal'); onResolved(); }
    else { setStatus('unclear'); onResolved(); }
  }

  const settled = status === 'correct' || status === 'reveal' || status === 'unclear';

  return (
    // Stop card-level tap-to-advance while the student is answering.
    <div className="flex-1 px-1 py-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-1.5">
        ✋ Quick check — a real exam question
      </p>
      {scene.prompt && (
        <p className="text-[13px] text-slate-500 mb-3 leading-snug"><Prose text={scene.prompt} group={0} timed={timed} /></p>
      )}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed [&>p]:my-0 [&>p+p]:mt-2">
            <MathMarkdown content={scene.markdown} />
          </div>
          {scene.marks ? (
            <span className="shrink-0 text-xs text-slate-400 font-semibold whitespace-nowrap">[{scene.marks}]</span>
          ) : null}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={scene.placeholder ?? 'Your answer'}
          disabled={settled}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
          className="flex-1 min-w-0 border border-slate-300 rounded-xl px-3.5 py-2.5 text-base font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/60 disabled:bg-slate-50 disabled:text-slate-500"
        />
        <button type="submit" disabled={settled || !value.trim()}
          className="shrink-0 bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 active:scale-[0.97] motion-safe:transition-transform">
          Check
        </button>
      </form>
      {/* Fixed-slot feedback zone: space reserved so the verdict never shoves
          the layout; content fades up inside it. */}
      <div className="min-h-[64px] mt-3">
        {status === 'retry' && (
          <div className="lsn-rise bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-[13.5px] text-amber-900">
            Not quite — one more go. Check each sign and each number before you type.
          </div>
        )}
        {status === 'correct' && (
          <div className="lsn-rise bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-[13.5px] text-emerald-900">
            <span className="font-bold">✓ Correct.</span>{' '}<MathText text={scene.why} />
          </div>
        )}
        {status === 'reveal' && (
          <div className="lsn-rise bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 text-[13.5px] text-rose-900">
            <span className="font-bold">Answer: <MathText text={scene.answer} /></span>
            <span className="block mt-1 text-rose-800"><MathText text={scene.why} /></span>
          </div>
        )}
        {status === 'unclear' && (
          <div className="lsn-rise bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13.5px] text-slate-700">
            <span className="font-bold">Compare with the official answer: <MathText text={scene.answer} /></span>
            <span className="block mt-1"><MathText text={scene.why} /></span>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckSkippedView() {
  return (
    <div className="flex-1 flex items-center px-1 py-6">
      <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 text-sm text-amber-800">
        This check question is off getting fixed — carry on with the lesson.
      </div>
    </div>
  );
}

// ── Autoplay pacing ──────────────────────────────────────────────────────────

/** Silent beat per position at 1× (ms); null = interactive, autoplay waits. */
function beatDuration(scene: PlayScene, step: number): number | null {
  switch (scene.type) {
    case 'title': return 3200;
    case 'caption': return Math.min(9000, 2200 + scene.text.length * 26);
    case 'equation-steps': {
      const s = scene.steps[step];
      return 2400 + (s?.note ? Math.min(2400, s.note.length * 22) : 0);
    }
    case 'graph-morph': return 2600;
    case 'annotate': return step === 0 ? 2200 : 2600;
    case 'check': return null;         // interactive — autoplay waits
    case 'check-skipped': return 2000;
  }
}

/** The beat after a freshly answered check, so the "why" can be read (1×). */
const CHECK_WHY_BEAT_MS = 3600;
/** The cursor runs this far ahead of the voice, so the eye is there first (s). */
const CURSOR_LEAD_S = 0.12;

// ── The teacher's cursor (rAF, imperative DOM) ───────────────────────────────

interface BeatClock { elapsedMs: number; totalMs: number }

/** The ribbon's current sentence — React state, changed only at sentence boundaries. */
interface RibbonLine { key: string; words: string[] }

/**
 * Walks the sentences on the card each frame. Source of time, in order: the
 * live clip (Voice) → the running silent beat (Auto, or a silent position in
 * Voice) → nothing (Manual: everything idle). Writes `data-state` and the
 * `--sweep` custom property straight onto the sentence spans and lights the
 * ribbon's words; React only re-renders when the ribbon's SENTENCE changes.
 */
function useSpeechCursor({ cardRef, ribbonRef, active, sceneIdx, step, scene, clip, beatClock, setRibbon }: {
  cardRef: React.RefObject<HTMLDivElement | null>;
  ribbonRef: React.RefObject<HTMLDivElement | null>;
  /** A timed pacing is on (Auto or Voice) and the lesson is not done. */
  active: boolean;
  sceneIdx: number;
  step: number;
  scene: PlayScene;
  clip: () => ReturnType<ReturnType<typeof useNarration>['clock']>;
  beatClock: () => BeatClock | null;
  setRibbon: (line: RibbonLine | null) => void;
}) {
  const trackRef = useRef<{ key: string; track: SpeechTrack } | null>(null);
  const ribbonKeyRef = useRef<string | null>(null);
  const litRef = useRef(-1);
  const layout = narrationLayout(scene);
  const steps = sceneStepCount(scene);

  useEffect(() => {
    const card = cardRef.current;
    if (!active || !card) { ribbonKeyRef.current = null; setRibbon(null); return; }
    let raf = 0;
    const setState = (el: HTMLElement, s: SpeechState | 'idle') => { if (el.dataset.state !== s) el.dataset.state = s; };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const c = clip();
      let t: number; let duration: number; let track: SpeechTrack | null = null;
      let groups: number[];
      if (c && c.scene === sceneIdx) {
        // Voice: the clip's own clock. A whole-scene clip reads every step's
        // prose in one go; per-step clips read their own step.
        const key = `${c.scene}:${c.step}:${c.duration ?? 'na'}:${c.timing ? 'sc' : 'pr'}`;
        if (!trackRef.current || trackRef.current.key !== key) {
          trackRef.current = { key, track: buildSpeechTrack(c.text, c.duration ?? 1, c.timing) };
        }
        track = trackRef.current.track;
        t = c.elapsed; duration = track.duration;
        groups = c.layout === 'scene' ? Array.from({ length: steps }, (_, i) => i) : [c.step];
      } else {
        const b = beatClock();
        if (!b) {
          // Nothing is driving (a gated check, the beat after a clip): the
          // last state stands — sentences already reached stay lit.
          return;
        }
        t = b.elapsedMs / 1000; duration = b.totalMs / 1000;
        groups = [step];
      }

      // Sentence spans by group, in DOM order.
      const spans = Array.from(card.querySelectorAll<HTMLElement>('[data-sent]'));
      const byGroup = new Map<number, HTMLElement[]>();
      for (const el of spans) {
        const g = Number(el.dataset.sentGroup);
        const list = byGroup.get(g);
        if (list) list.push(el); else byGroup.set(g, [el]);
      }
      const activeSet = new Set(groups);
      const first = Math.min(...groups);
      const shown: HTMLElement[] = [];
      for (const g of groups) for (const el of byGroup.get(g) ?? []) shown.push(el);
      for (const [g, list] of byGroup) {
        if (activeSet.has(g)) continue;
        for (const el of list) setState(el, g < first ? 'spoken' : 'waiting');
      }
      if (shown.length > 0) {
        const weights = shown.map(el => Number(el.dataset.w) || 1);
        const windows = alignShownToSpoken(weights, track ? track.sentences : null, duration);
        const cur = speechStatesAt(windows, t, track ? CURSOR_LEAD_S : 0);
        shown.forEach((el, i) => {
          setState(el, cur.states[i]);
          // The sweep is the voice's pace — a silent beat only lifts the sentence.
          const sweep = track && cur.states[i] === 'speaking' ? cur.progress.toFixed(3) : '0';
          if (el.style.getPropertyValue('--sweep') !== sweep) el.style.setProperty('--sweep', sweep);
        });
      }

      // The ribbon: the narration sentence being said, words lit as they are reached.
      if (track && track.sentences.length > 0) {
        const cur = speechStatesAt(track.sentences, t, CURSOR_LEAD_S);
        const idx = Math.max(0, cur.current);
        const key = `${sceneIdx}:${c!.step}:${idx}`;
        if (ribbonKeyRef.current !== key) {
          ribbonKeyRef.current = key;
          litRef.current = -1;
          setRibbon({ key, words: track.sentences[idx].words.map(w => w.text) });
        }
        const lit = cur.current < 0 ? 0 : wordsLitAt(track.sentences[idx].words, t, CURSOR_LEAD_S);
        if (lit !== litRef.current) {
          litRef.current = lit;
          const words = ribbonRef.current?.querySelectorAll<HTMLElement>('[data-w]');
          words?.forEach((w, i) => { if (i < lit) w.setAttribute('data-on', ''); else w.removeAttribute('data-on'); });
        }
      } else if (!c && ribbonKeyRef.current && !ribbonKeyRef.current.startsWith(`${sceneIdx}:`)) {
        // Moved to a position with no clip: the old scene's line goes.
        ribbonKeyRef.current = null;
        setRibbon(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, sceneIdx, step, steps, layout, cardRef, ribbonRef, clip, beatClock, setRibbon]);
}

// ── Header controls ──────────────────────────────────────────────────────────

const PILL = 'shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1.5 leading-4 motion-safe:transition-colors';
const PILL_ON = 'bg-navy text-[hsl(45,100%,96%)]';
const PILL_OFF = 'bg-white text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:text-navy';

/**
 * Playback speed: a pill showing the rate, opening a row of six chips
 * (1× … 3×). The row is anchored to the whole pill group (right-aligned) so
 * it never runs off a phone's left edge; closes on pick, outside tap, Escape.
 */
function RateMenu({ rate, open, onOpen, onPick }: {
  rate: PlaybackRate; open: boolean; onOpen: (open: boolean) => void; onPick: (rate: PlaybackRate) => void;
}) {
  return (
    <>
      <button type="button" onClick={() => onOpen(!open)}
        aria-haspopup="menu" aria-expanded={open} aria-label={`Playback speed, ${rateLabel(rate)}`}
        title="Playback speed" data-rate={rate}
        className={`${PILL} tabular-nums ${open ? PILL_ON : PILL_OFF} ${rate !== 1 && !open ? 'text-navy' : ''}`}>
        {rateLabel(rate)}
      </button>
      {open && (
        <div role="menu" aria-label="Playback speed"
          className="absolute right-0 top-full mt-1.5 z-30 flex items-center gap-1 bg-white rounded-full p-1 pl-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_10px_28px_-10px_rgba(15,23,42,0.35)] border border-slate-100 lsn-rise"
          style={{ animationDuration: '220ms' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1" aria-hidden>Speed</span>
          {PLAYBACK_RATES.map(r => (
            <button key={r} type="button" role="menuitemradio" aria-checked={r === rate}
              onClick={() => onPick(r)}
              className={`text-[11px] font-semibold rounded-full px-2 py-1 leading-4 tabular-nums motion-safe:transition-colors ${
                r === rate ? PILL_ON : 'text-slate-600 hover:bg-slate-100 hover:text-navy'}`}>
              {rateLabel(r)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ── The player ───────────────────────────────────────────────────────────────

type Pacing = 'manual' | 'auto' | 'narrated';

export default function LessonPlayer({ slug, title, topic, minutes, scenes }: {
  slug: string; title: string; topic: string; minutes: number; scenes: PlayScene[];
}) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [auto, setAuto] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const [narratedUsed, setNarratedUsed] = useState(false);
  const [ribbon, setRibbon] = useState<RibbonLine | null>(null);
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);

  // 🔊 Voice: the persisted choice only counts when this lesson has clips —
  // a silent lesson never shows the pill, and never pretends to narrate.
  const narratedPref = usePref('narrated');
  const muted = usePref('muted');
  const rate = useRatePref();
  const hasVoice = useMemo(() => lessonHasAudio(scenes), [scenes]);
  const narrated = narratedPref && hasVoice;
  const pacing: Pacing = narrated ? 'narrated' : auto ? 'auto' : 'manual';
  const timed = pacing !== 'manual' && !done;

  const scene = scenes[sceneIdx];
  const maxStep = sceneStepCount(scene);
  const gated = scene.type === 'check' && !resolved.has(sceneIdx);
  const atEnd = sceneIdx === scenes.length - 1 && step >= maxStep - 1;

  const advance = useCallback(() => {
    if (done) return;
    if (step < maxStep - 1) { setStep(step + 1); return; }
    if (sceneIdx < scenes.length - 1) { setSceneIdx(sceneIdx + 1); setStep(0); return; }
    setDone(true);
  }, [done, step, maxStep, sceneIdx, scenes.length]);

  const nextScene = useCallback(() => {
    if (done) return;
    if (sceneIdx < scenes.length - 1) { setSceneIdx(sceneIdx + 1); setStep(0); return; }
    setDone(true);
  }, [done, sceneIdx, scenes.length]);

  // The voice track. A per-step clip ending advances one step; a whole-scene
  // clip ending moves to the next scene; a check's lead-in ending does nothing
  // (the answer gate + the longer post-answer beat below own that scene).
  const narration = useNarration({
    scenes, sceneIdx, step, done, muted, rate, paused,
    enabled: pacing === 'narrated',
    revealStep: setStep,
    onClipEnded: (layout) => {
      if (scene.type === 'check') return;
      if (layout === 'scene') nextScene(); else advance();
    },
    onFirstPlay: () => setNarratedUsed(true),
  });

  const back = useCallback(() => {
    if (done) { setDone(false); return; }
    if (pacing === 'narrated') {
      // Video-player ⏮: a scene under way restarts from its top; at the top,
      // the previous scene replays from ITS top (never lands mid-clip).
      if (step > 0) { setStep(0); return; }
      if (narration.elapsed() > 2.5 || sceneIdx === 0) { narration.replay(); return; }
      setSceneIdx(sceneIdx - 1); setStep(0);
      return;
    }
    if (step > 0) { setStep(s => s - 1); return; }
    if (sceneIdx === 0) return;
    const prev = sceneIdx - 1;
    setSceneIdx(prev);
    setStep(sceneStepCount(scenes[prev]) - 1); // land on the finished scene
  }, [done, pacing, step, sceneIdx, scenes, narration]);

  const restart = useCallback(() => {
    setDone(false); setSceneIdx(0); setStep(0); setResolved(new Set()); setPaused(false);
  }, []);

  // Timer pacing (▶ Auto, and the silent gaps of 🔊 Voice): one beat per
  // position; an unanswered check pauses it, and a freshly answered one gets a
  // longer beat so the "why" can actually be read. In Voice mode the timer
  // stands down while a clip is driving — and entirely until the first tap
  // has unlocked audio, so the lesson never runs off silently on its own.
  // Every beat is divided by the playback rate. PAUSE freezes the running
  // beat with its remaining time and resume re-arms just that remainder; a
  // rate change mid-beat rescales the remainder. (Primitives + the stable
  // isDriving are the deps, not the controller object: a fresh object per
  // render would reset a running beat on every unrelated re-render; `version`
  // bumps on clip ended/failed. isDriving is read INSIDE the effect because
  // the narration hook's position effect — declared above — has already
  // started the clip by the time this one runs.)
  const { locked: voiceLocked, version: voiceVersion, isDriving: voiceDriving } = narration;
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; });
  const beatRef = useRef<{ key: string; totalMs: number; remainingMs: number; startedAt: number; running: boolean } | null>(null);
  const beatKey = `${sceneIdx}:${step}:${voiceVersion}:${gated}:${pacing}`;
  useEffect(() => {
    if (pacing === 'manual' || done || gated) { beatRef.current = null; return; }
    if (pacing === 'narrated' && (voiceLocked || voiceDriving())) { beatRef.current = null; return; }
    const base = scene.type === 'check' ? CHECK_WHY_BEAT_MS : beatDuration(scene, step);
    if (base === null) { beatRef.current = null; return; }
    const ms = scaleBeat(base, rate);
    const prev = beatRef.current;
    // Same beat re-armed (pause → resume, or a rate change): keep the share left.
    const remaining = prev && prev.key === beatKey && prev.totalMs > 0
      ? Math.round(prev.remainingMs * (ms / prev.totalMs))
      : ms;
    if (paused) { beatRef.current = { key: beatKey, totalMs: ms, remainingMs: remaining, startedAt: 0, running: false }; return; }
    const startedAt = performance.now();
    beatRef.current = { key: beatKey, totalMs: ms, remainingMs: remaining, startedAt, running: true };
    const t = window.setTimeout(() => { beatRef.current = null; advanceRef.current(); }, remaining);
    return () => {
      window.clearTimeout(t);
      const b = beatRef.current;
      if (b && b.key === beatKey && b.running) {
        b.remainingMs = Math.max(0, b.remainingMs - (performance.now() - b.startedAt));
        b.running = false;
      }
    };
  }, [pacing, done, gated, scene, step, rate, paused, beatKey, voiceLocked, voiceDriving]);
  const beatClock = useCallback((): BeatClock | null => {
    const b = beatRef.current;
    if (!b) return null;
    const run = b.running ? performance.now() - b.startedAt : 0;
    return { elapsedMs: Math.min(b.totalMs, b.totalMs - b.remainingMs + run), totalMs: b.totalMs };
  }, []);

  // The teacher's cursor + the spoken-line ribbon.
  useSpeechCursor({
    cardRef, ribbonRef, active: timed, sceneIdx, step, scene,
    clip: narration.clock, beatClock, setRibbon,
  });

  // Telemetry — fire-and-forget beacons into portal_event_log (bounded kinds:
  // lesson:<slug>:scene:<n> / :done / :narrated). Deduped per visit; failures
  // (or Adrian's account-less admin session) are silently dropped.
  const sent = useRef<Set<string>>(new Set());
  const beacon = useCallback((key: string, body: Record<string, unknown>) => {
    if (sent.current.has(key)) return;
    sent.current.add(key);
    fetch('/api/portal/lesson-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ...body }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);
  useEffect(() => {
    if (done) beacon('done', { done: true });
    else beacon(`s${sceneIdx}`, { scene: sceneIdx });
  }, [sceneIdx, done, beacon]);
  useEffect(() => {
    if (narratedUsed) beacon('narrated', { narrated: true });
  }, [narratedUsed, beacon]);

  // Mode controls. Auto and Voice are exclusive (Voice implies auto-advance);
  // turning Voice on is a gesture, so the element unlocks right here. A mode
  // change always releases a pause.
  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    setPaused(false);
    if (next && narratedPref) writePref('narrated', false);
  };
  const toggleVoice = () => {
    setPaused(false);
    if (narrated) { writePref('narrated', false); return; }
    setAuto(false);
    writePref('narrated', true);
    narration.unlock();
  };
  const toggleMute = () => writePref('muted', !muted);
  const pickRate = (r: PlaybackRate) => { writeRate(r); setRateOpen(false); };
  const waitingForTap = pacing === 'narrated' && narration.locked && !done;
  const canPause = timed && !waitingForTap;
  const togglePause = () => { if (canPause) setPaused(p => !p); };

  // Tap-to-advance: a first tap while Voice is still locked also unlocks the
  // element (silently) so the NEXT position's clip can start on its own.
  // Continue / ‹ are navigation: they release a pause and move. The CARD is
  // the pause surface: tapping it while paused resumes in place.
  const tapAdvance = () => {
    if (gated) return;
    if (pacing === 'narrated' && narration.locked) narration.unlockSilently();
    advance();
  };
  const onContinue = () => { setPaused(false); tapAdvance(); };
  const onBack = () => { setPaused(false); back(); };
  const onCardTap = () => {
    if (paused) { setPaused(false); return; }
    tapAdvance();
  };

  // Space toggles pause on a keyboard (never while typing an answer or with a
  // control focused — those keep their own space behaviour). Escape closes
  // the speed menu; any outside tap does too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRateOpen(false); return; }
      if (e.code !== 'Space' || e.repeat || !canPause) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')) return;
      e.preventDefault();
      setPaused(p => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPause]);
  useEffect(() => {
    if (!rateOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('[data-rate-menu]')) setRateOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [rateOpen]);

  const practiceHref = `/app/practice?topic=${encodeURIComponent(topic)}&from=lesson`;

  return (
    <div className="max-w-lg mx-auto pb-24 sm:pb-6">
      <style>{PLAYER_CSS}</style>

      {/* Header: way back + identity + pacing pills. Speed and pause appear
          with the timed pacings they control; Auto ⇄ Mute swap places so the
          row keeps its shape whichever mode is on. Long labels are for ≥ sm;
          a phone gets icons + the fill colour (measured: one row at 390 px). */}
      <div className="flex items-center gap-2.5 pt-1 mb-3">
        <Link href="/app/practice" aria-label="Back to practice"
          className="shrink-0 w-9 h-9 rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-navy inline-flex items-center justify-center hover:bg-slate-50 active:scale-95 motion-safe:transition-transform">
          <span className="text-lg leading-none" aria-hidden>‹</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">▶ Lesson · {minutes} min</p>
          <h1 className="font-bold text-navy text-sm truncate">{title}</h1>
        </div>
        <div className="relative shrink-0 flex items-center gap-1.5" data-rate-menu data-pills>
          {timed && (
            <RateMenu rate={rate} open={rateOpen} onOpen={setRateOpen} onPick={pickRate} />
          )}
          {timed && (
            <button type="button" onClick={togglePause} disabled={!canPause} aria-pressed={paused}
              aria-label={paused ? 'Resume' : 'Pause'} title={paused ? 'Resume (space)' : 'Pause (space)'}
              data-pause={paused ? 'paused' : 'playing'}
              className={`${PILL} min-w-[30px] disabled:opacity-40 ${paused ? PILL_ON : PILL_OFF}`}>
              <span aria-hidden>{paused ? '▶' : '⏸'}</span>
              <span className="hidden sm:inline">{paused ? ' Resume' : ' Pause'}</span>
            </button>
          )}
          {narrated ? (
            <button type="button" onClick={toggleMute} aria-pressed={muted}
              aria-label={muted ? 'Unmute the voice' : 'Mute the voice'}
              data-mute={muted ? 'muted' : 'live'}
              className={`${PILL} ${muted ? PILL_ON : PILL_OFF}`}>
              <span aria-hidden>{muted ? '🔇' : '🔈'}</span>
              <span className="hidden sm:inline">{muted ? ' Muted' : ' Mute'}</span>
            </button>
          ) : (
            <button type="button" onClick={toggleAuto} aria-pressed={auto} data-auto={auto ? 'on' : 'off'}
              className={`${PILL} ${auto ? PILL_ON : PILL_OFF}`}>
              {auto ? 'Auto on' : '▶ Auto'}
            </button>
          )}
          {hasVoice && (
            <button type="button" onClick={toggleVoice} aria-pressed={narrated} data-voice={narrated ? 'on' : 'off'}
              className={`${PILL} ${narrated ? PILL_ON : PILL_OFF}`}>
              🔊 Voice{narrated && <span className="hidden sm:inline"> on</span>}
            </button>
          )}
        </div>
      </div>

      {/* Progress dots — one per scene; the current one stretches. */}
      <div className="flex items-center gap-1 mb-3 px-0.5" aria-hidden>
        {scenes.map((_, i) => (
          <span key={i}
            className={`h-1.5 rounded-full ${
              done || i < sceneIdx ? 'w-1.5 bg-navy/60' : i === sceneIdx ? 'w-6 bg-navy' : 'w-1.5 bg-slate-200'}`}
            style={{ transition: `width 300ms ${EASE}, background-color 300ms ease` }} />
        ))}
      </div>

      {done ? (
        /* ── Completion — the closer CTA ── */
        <div className="bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-6 min-h-[440px] flex flex-col items-center justify-center text-center lsn-scene">
          <span className="inline-block text-4xl mb-3 lsn-rise" aria-hidden>🎉</span>
          <h2 className="text-xl font-bold text-navy lsn-rise" style={{ animationDelay: '120ms' }}>Lesson complete</h2>
          <p className="mt-2 max-w-xs text-sm text-slate-600 lsn-rise" style={{ animationDelay: '240ms' }}>
            That&apos;s the whole idea — the fastest way to make it stick is to use it on real questions while it&apos;s fresh.
          </p>
          <Link href={practiceHref}
            className="block text-center mt-6 w-full max-w-xs bg-amber-400 text-navy rounded-2xl px-4 py-3.5 font-bold text-[15px] shadow-[0_8px_24px_-10px_rgba(245,158,11,0.8)] hover:bg-amber-300 active:scale-[0.98] motion-safe:transition lsn-rise"
            style={{ animationDelay: '360ms' }}>
            ✏️ Practise {topic} →
          </Link>
          <button type="button" onClick={restart}
            className="mt-3 text-sm font-semibold text-slate-500 hover:text-navy">
            ↺ Watch again
          </button>
        </div>
      ) : (
        /* ── The scene card. Tapping it advances (except mid-check); while
              paused, a tap resumes instead. ── */
        <div key={sceneIdx} ref={cardRef} onClick={onCardTap} data-paused={paused || undefined}
          className={`lsn-scene relative bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5 min-h-[440px] flex flex-col ${gated ? '' : 'cursor-pointer'}`}>
          {scene.type === 'title' && <TitleView scene={scene} minutes={minutes} timed={timed} />}
          {scene.type === 'caption' && <CaptionView scene={scene} timed={timed} />}
          {scene.type === 'equation-steps' && <EquationStepsView scene={scene} step={step} reduced={reduced} timed={timed} />}
          {scene.type === 'graph-morph' && <GraphMorphView scene={scene} step={step} reduced={reduced} />}
          {scene.type === 'annotate' && <AnnotateView scene={scene} step={step} timed={timed} />}
          {scene.type === 'check' && (
            <CheckView scene={scene} slug={slug} timed={timed}
              onResolved={() => setResolved(prev => new Set(prev).add(sceneIdx))} />
          )}
          {scene.type === 'check-skipped' && <CheckSkippedView />}
          {/* Paused: a quiet chip; the card itself is the resume surface. */}
          {paused && (
            <span aria-hidden data-paused-chip
              className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] lsn-rise"
              style={{ animationDuration: '220ms' }}>
              ⏸ Paused · tap to resume
            </span>
          )}
          {/* Voice is on but no gesture has unlocked audio yet (a fresh visit
              with the choice remembered): a poster-style play affordance. The
              tap that starts it is the gesture browsers require. */}
          {waitingForTap && (
            <div role="button" tabIndex={0} aria-label="Play with voice"
              onClick={(e) => { e.stopPropagation(); narration.unlock(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); narration.unlock(); } }}
              className="absolute inset-0 rounded-3xl flex items-center justify-center bg-white/55 backdrop-blur-[2px] lsn-rise cursor-pointer">
              <span className="inline-flex items-center gap-2.5 bg-navy text-[hsl(45,100%,96%)] rounded-full pl-3 pr-5 py-2.5 font-semibold text-[15px] shadow-[0_10px_28px_-10px_rgba(15,23,42,0.6)]">
                <span aria-hidden className="w-8 h-8 rounded-full bg-white/15 inline-flex items-center justify-center text-sm">▶</span>
                Play with voice
              </span>
            </div>
          )}
        </div>
      )}

      {/* The spoken-line ribbon (Voice only): the narration sentence being
          said, its words brightening as the voice reaches them. Fixed height
          so the controls below never jump; empty on silent positions. */}
      {pacing === 'narrated' && !done && (
        <div ref={ribbonRef} className="lsn-ribbon mt-3 px-1 min-h-[42px]" aria-hidden data-ribbon>
          {ribbon && (
            <p key={ribbon.key} className="lsn-ribbon-line border-l-2 border-amber-400 pl-3 text-[13px] leading-snug">
              {ribbon.words.map((w, i) => (
                <span key={i} data-w>{i > 0 ? ' ' : ''}{w}</span>
              ))}
            </p>
          )}
        </div>
      )}

      {/* Bottom controls — fixed shape, never jumps between scenes. */}
      {!done && (
        <div className={`flex items-center gap-2 ${pacing === 'narrated' ? 'mt-3' : 'mt-4'}`}>
          <button type="button" onClick={onBack} disabled={sceneIdx === 0 && step === 0}
            aria-label={pacing === 'narrated' ? 'Replay this scene' : 'Back one step'}
            className="shrink-0 w-12 h-12 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-navy inline-flex items-center justify-center disabled:opacity-30 hover:bg-slate-50 active:scale-95 motion-safe:transition-transform">
            <span className="text-xl leading-none" aria-hidden>‹</span>
          </button>
          <button type="button" onClick={onContinue} disabled={gated}
            className="flex-1 h-12 bg-navy text-[hsl(45,100%,96%)] rounded-2xl font-semibold text-[15px] disabled:opacity-40 active:scale-[0.99] motion-safe:transition-transform">
            {gated ? 'Answer to continue' : atEnd ? 'Finish' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}

// Scoped-by-prefix player styles: reveal/entrance transitions, highlight
// pulses, connector draws, the teacher's cursor. Kept as CSS (not JS timers)
// so the compositor owns the easing and reduced-motion can switch everything
// off in one block.
const PLAYER_CSS = `
@keyframes lsnSceneIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes lsnRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes lsnHlPulse { from { filter: saturate(1.9) brightness(0.96); } to { filter: none; } }
@keyframes lsnConnDraw { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
@keyframes lsnDotIn { from { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; } to { opacity: 1; transform: none; } }
@keyframes lsnFade { from { opacity: 0; } to { opacity: 1; } }
.lsn-scene { animation: lsnSceneIn 300ms ${EASE} both; }
.lsn-rise { animation: lsnRise 420ms ${EASE} both; }
.lsn-line { opacity: 0; transform: translateY(6px); transition: opacity 420ms ${EASE}, transform 420ms ${EASE}; }
.lsn-line.on { opacity: 1; transform: none; }
.lsn-tok { transition: opacity 180ms ease; }
.lsn-landing { opacity: 0 !important; }
.lsn-hl { border-radius: 0.375rem; padding: 0 0.25rem; margin: 0 -0.125rem; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.lsn-hl-amber { background: #fef3c7; }
.lsn-hl-sky { background: #e0f2fe; }
.lsn-hl-rose { background: #ffe4e6; }
.lsn-hl-emerald { background: #d1fae5; }
.lsn-line.on .lsn-hl { animation: lsnHlPulse 900ms ${EASE} 250ms backwards; }
.lsn-conn { animation: lsnConnDraw 360ms ease-out both; }
.lsn-conn-dot { animation: lsnDotIn 300ms ${EASE} 120ms backwards; transform-origin: center; transform-box: fill-box; }
/* The teacher's cursor. Inline spans: the 4 px lift rides \`top\` (transforms
   are ignored on inline boxes), the sweep is a bottom-anchored gradient sized
   by --sweep (0‥1) — across a wrapped sentence it runs on as one line. */
.lsn-sent { position: relative; top: 0; padding-bottom: 1px; transition: opacity 300ms ${EASE}, top 300ms ${EASE};
  background-image: linear-gradient(hsl(40, 85%, 52%), hsl(40, 85%, 52%)); background-repeat: no-repeat;
  background-size: 0 2px; background-position: 0 100%; }
.lsn-sent[data-state="idle"] { opacity: 1; }
.lsn-sent[data-state="waiting"] { opacity: 0.4; top: 4px; }
.lsn-sent[data-state="speaking"] { opacity: 1; background-size: calc(var(--sweep, 0) * 100%) 2px; }
.lsn-sent[data-state="spoken"] { opacity: 0.85; }
.lsn-sent .katex-display { margin: 0.4em 0; }
/* The spoken-line ribbon. */
.lsn-ribbon-line { animation: lsnFade 180ms ease both; color: #94a3b8; }
.lsn-ribbon-line [data-w] { transition: color 160ms ease; }
.lsn-ribbon-line [data-w][data-on] { color: hsl(220, 60%, 20%); }
@media (prefers-reduced-motion: reduce) {
  .lsn-scene, .lsn-rise, .lsn-line, .lsn-conn, .lsn-conn-dot, .lsn-ribbon-line { animation: none !important; transition: none !important; }
  .lsn-line { opacity: 0; }
  .lsn-line.on { opacity: 1; transform: none; }
  .lsn-sent { transition: opacity 200ms ease; top: 0 !important; background-image: none !important; }
  .lsn-ribbon-line [data-w] { transition: none; }
}
`;
