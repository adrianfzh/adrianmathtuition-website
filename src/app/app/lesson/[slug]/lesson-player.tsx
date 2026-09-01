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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { MathMarkdown, katexOptions } from '@/lib/math-markdown';
import { checkTypedAnswer } from '@/lib/notebook';
import {
  sceneStepCount,
  type AnnotateScene, type CaptionScene, type EquationStepsScene,
  type GraphMorphScene, type LessonTone, type PlayScene,
  type ResolvedCheckScene, type StepToken, type TitleScene,
} from '@/lib/lesson-script';

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

function TitleView({ scene, minutes }: { scene: TitleScene; minutes: number }) {
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
        <MathText text={scene.promise} />
      </p>
    </div>
  );
}

// ── Scene: caption ───────────────────────────────────────────────────────────

function CaptionView({ scene }: { scene: CaptionScene }) {
  return (
    <div className="flex-1 flex flex-col justify-center px-1 py-6">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 lsn-rise">{scene.heading}</p>
      )}
      <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed text-[15px] [&>p]:my-0 [&>p+p]:mt-3 lsn-rise" style={{ animationDelay: '120ms' }}>
        <MathMarkdown content={scene.text} />
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

function EquationStepsView({ scene, step, reduced }: {
  scene: EquationStepsScene; step: number; reduced: boolean;
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
            {s.note && (
              <p className="mt-1.5 text-[13px] text-slate-500 leading-snug"><MathText text={s.note} /></p>
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

function AnnotateView({ scene, step }: { scene: AnnotateScene; step: number }) {
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
      {scene.intro && (
        <p className="text-[15px] text-slate-700 mb-2"><MathText text={scene.intro} /></p>
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
              <span className="text-[13.5px] leading-snug"><MathText text={c.label} /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Scene: check (real bank question, graded locally, recorded server-side) ──

type CheckStatus = 'idle' | 'retry' | 'correct' | 'reveal' | 'unclear';

function CheckView({ scene, slug, onResolved }: {
  scene: ResolvedCheckScene; slug: string; onResolved: () => void;
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
        <p className="text-[13px] text-slate-500 mb-3 leading-snug"><MathText text={scene.prompt} /></p>
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
            Not quite — one more go. Check each power, and keep the sign inside it.
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

// ── The player ───────────────────────────────────────────────────────────────

export default function LessonPlayer({ slug, title, topic, minutes, scenes }: {
  slug: string; title: string; topic: string; minutes: number; scenes: PlayScene[];
}) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [auto, setAuto] = useState(false);
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const reduced = useReducedMotion();

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

  const back = useCallback(() => {
    if (done) { setDone(false); return; }
    if (step > 0) { setStep(s => s - 1); return; }
    if (sceneIdx === 0) return;
    const prev = sceneIdx - 1;
    setSceneIdx(prev);
    setStep(sceneStepCount(scenes[prev]) - 1); // land on the finished scene
  }, [done, step, sceneIdx, scenes]);

  const restart = useCallback(() => {
    setDone(false); setSceneIdx(0); setStep(0); setResolved(new Set());
  }, []);

  // Autoplay: one timer per beat; an unanswered check pauses it, and a freshly
  // answered one gets a longer beat so the "why" can actually be read.
  useEffect(() => {
    if (!auto || done || gated) return;
    const ms = scene.type === 'check' ? 3600 : beatDuration(scene, step);
    if (ms === null) return;
    const t = window.setTimeout(advance, ms);
    return () => window.clearTimeout(t);
  }, [auto, done, gated, scene, step, advance]);

  // Telemetry — fire-and-forget scene beacons into portal_event_log (bounded
  // kinds: lesson:<slug>:scene:<n> / lesson:<slug>:done). Deduped per visit;
  // failures (or Adrian's account-less admin session) are silently dropped.
  const sent = useRef<Set<string>>(new Set());
  useEffect(() => {
    const key = done ? 'done' : `s${sceneIdx}`;
    if (sent.current.has(key)) return;
    sent.current.add(key);
    fetch('/api/portal/lesson-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(done ? { slug, done: true } : { slug, scene: sceneIdx }),
      keepalive: true,
    }).catch(() => {});
  }, [sceneIdx, done, slug]);

  const practiceHref = `/app/practice?topic=${encodeURIComponent(topic)}&from=lesson`;

  return (
    <div className="max-w-lg mx-auto pb-24 sm:pb-6">
      <style>{PLAYER_CSS}</style>

      {/* Header: way back + identity + autoplay */}
      <div className="flex items-center gap-3 pt-1 mb-3">
        <Link href="/app/practice" aria-label="Back to practice"
          className="shrink-0 w-9 h-9 rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-navy inline-flex items-center justify-center hover:bg-slate-50 active:scale-95 motion-safe:transition-transform">
          <span className="text-lg leading-none" aria-hidden>‹</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">▶ Lesson · {minutes} min</p>
          <h1 className="font-bold text-navy text-sm truncate">{title}</h1>
        </div>
        <button type="button" onClick={() => setAuto(a => !a)} aria-pressed={auto}
          className={`shrink-0 text-[11px] font-semibold rounded-full px-3 py-1.5 motion-safe:transition-colors ${
            auto ? 'bg-navy text-[hsl(45,100%,96%)]' : 'bg-white text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:text-navy'}`}>
          {auto ? '⏸ Auto on' : '▶ Auto'}
        </button>
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
            The general term is yours now — the fastest way to make it stick is to use it on real questions while it&apos;s fresh.
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
        /* ── The scene card. Tapping it advances (except mid-check). ── */
        <div key={sceneIdx} onClick={() => { if (!gated) advance(); }}
          className={`lsn-scene bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5 min-h-[440px] flex flex-col ${gated ? '' : 'cursor-pointer'}`}>
          {scene.type === 'title' && <TitleView scene={scene} minutes={minutes} />}
          {scene.type === 'caption' && <CaptionView scene={scene} />}
          {scene.type === 'equation-steps' && <EquationStepsView scene={scene} step={step} reduced={reduced} />}
          {scene.type === 'graph-morph' && <GraphMorphView scene={scene} step={step} reduced={reduced} />}
          {scene.type === 'annotate' && <AnnotateView scene={scene} step={step} />}
          {scene.type === 'check' && (
            <CheckView scene={scene} slug={slug}
              onResolved={() => setResolved(prev => new Set(prev).add(sceneIdx))} />
          )}
          {scene.type === 'check-skipped' && <CheckSkippedView />}
        </div>
      )}

      {/* Bottom controls — fixed shape, never jumps between scenes. */}
      {!done && (
        <div className="flex items-center gap-2 mt-4">
          <button type="button" onClick={back} disabled={sceneIdx === 0 && step === 0}
            aria-label="Back one step"
            className="shrink-0 w-12 h-12 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-navy inline-flex items-center justify-center disabled:opacity-30 hover:bg-slate-50 active:scale-95 motion-safe:transition-transform">
            <span className="text-xl leading-none" aria-hidden>‹</span>
          </button>
          <button type="button" onClick={advance} disabled={gated}
            className="flex-1 h-12 bg-navy text-[hsl(45,100%,96%)] rounded-2xl font-semibold text-[15px] disabled:opacity-40 active:scale-[0.99] motion-safe:transition-transform">
            {gated ? 'Answer to continue' : atEnd ? 'Finish' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}

// Scoped-by-prefix player styles: reveal/entrance transitions, highlight
// pulses, connector draws. Kept as CSS (not JS timers) so the compositor owns
// the easing and reduced-motion can switch everything off in one block.
const PLAYER_CSS = `
@keyframes lsnSceneIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes lsnRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes lsnHlPulse { from { filter: saturate(1.9) brightness(0.96); } to { filter: none; } }
@keyframes lsnConnDraw { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
@keyframes lsnDotIn { from { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; } to { opacity: 1; transform: none; } }
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
@media (prefers-reduced-motion: reduce) {
  .lsn-scene, .lsn-rise, .lsn-line, .lsn-conn, .lsn-conn-dot { animation: none !important; transition: none !important; }
  .lsn-line { opacity: 0; }
  .lsn-line.on { opacity: 1; transform: none; }
}
`;
