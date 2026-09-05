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
//   · THE BEAT MODEL (2026-09-04). A scene with `beats` is narrated as short
//     ideas, one clip each; every beat's actions are cued to ITS OWN clip. A
//     beat is the sub-step, so the pacing machinery above is untouched — what
//     changes is what a step SHOWS: the views render from a BoardState
//     (lib/lesson-beats.ts) derived from "beat k, `fired` actions in", and a
//     director rAF advances `fired` as the clip's fraction (Voice), the beat
//     timer (Auto) or a short tap clock (Manual) crosses each action's `at`.
//     Sync is exact at every beat boundary (a clip starts, its actions start),
//     estimated inside a clip (`at` is the author's guess). The pen layer —
//     draw-on, marks, notes, focus — lives in lesson-board.tsx.
//   · THEMES. `slide` is the original card (its tokens are the values this
//     file always used, so unthemed scripts render as before); `chalk` and
//     `paper` restyle the stage through `--lsn-*` custom properties only
//     (lib/lesson-theme.ts). The header, dots and controls stay portal-styled.
//   · THE SLATE + THE HAND (2026-09-05). On the board themes the card IS a
//     slate — a radial ground, blended fractal grain, a dust haze, two erased
//     ghosts, a vignette, all in one element's background stack — and the
//     prose is WRITTEN on it: a chalk tip travels the letters and the ink
//     appears behind it (./chalk-writer.ts, paced by `--lsn-p`, the fraction
//     of its clip the sentence being spoken has reached, so speed and pause
//     come free). MATHS IS NEVER WRITTEN: KaTeX chalk-dusts in on its beat.
//     Everything the hand needs is a class and two custom properties; when it
//     cannot run (reduced motion, no canvas, the face not in yet) the root
//     drops `data-lsn-write` and the words simply appear.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { MathMarkdown, katexOptions } from '@/lib/math-markdown';
import { checkTypedAnswer } from '@/lib/notebook';
import {
  hasBeats, lessonHasAudio, narrationLayout, sceneStepCount,
  type AnnotateScene, type CaptionScene, type EquationStepsScene,
  type GraphMorphScene, type LessonTheme, type LessonTone, type PlayScene,
  type ResolvedCheckScene, type StepToken, type TitleScene,
} from '@/lib/lesson-script';
import {
  PLAYBACK_RATES, alignShownToSpoken, buildSpeechTrack, isBlockMarkdown, rateLabel, scaleBeat,
  speechStatesAt, speechWeight, splitProse, wordsLitAt,
  type PlaybackRate, type SpeechTrack, type SpeechState, type Window as SpeechWindow,
} from '@/lib/lesson-speech';
import {
  beatAutoMs, beatTimeline, boardStateAt, elementShown, firedCountAt, lineKey, lineOn, proseGroup, sceneNotes,
  tokKey, tokenShown, tokenWritten, type BoardState,
} from '@/lib/lesson-beats';
import {
  HAND_FONT_FACES, HAND_FONT_FAMILY, HAND_FONT_URL, THEME_TOKENS, TITLE_FONT_FAMILY, TITLE_FONT_URL,
  needsHandFont, normalizeTheme, themeCssVars,
} from '@/lib/lesson-theme';
import {
  FIT_MIN_PX, TAP_GLYPH_MS, TAP_INTERACTIVE_SELECTOR, boardTapAction, fitDone, fitFontPx, tapGlyph,
} from '@/lib/lesson-stage';
import { useNarration, usePref, useRatePref, writePref, writeRate } from './lesson-narration';
import BoardLayer, { EASE, MathText, NoteSlotView, offsetRect, useIsoLayoutEffect } from './lesson-board';
import { ChalkWriter } from './chalk-writer';

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

/** A beat scene's element: the key the board addresses it by, and its state. */
interface ElementBits { key: string; on: boolean; written: boolean }
/** The classes an element carries (empty outside beat scenes). */
const elCls = (b: ElementBits | null) => (b ? `lsn-el ${b.on ? 'on' : ''} ${b.written ? 'w' : ''}` : '');

/** Per-paragraph overrides for a caption written paragraph by paragraph. */
interface ParaMeta { group: number; from: number; bits: ElementBits | null }

/**
 * Prose that the teacher's cursor can walk: one <span data-sent> per sentence,
 * grouped by the sub-step (`group`) whose narration reads it. `data-w` is the
 * sentence's speaking weight (the proportional map reads it back from the
 * DOM); `data-state` starts at `waiting` in a timed pacing and `idle` (full
 * ink) in Manual — the rAF cursor then owns it. Markdown and `$…$` survive per
 * sentence (the splitter never cuts inside them); a block-markdown paragraph
 * (list, display math) renders whole as one unit. `group` −1 = static prose
 * no beat reads (idle, never walked). `from` = the fraction into the group's
 * clip at which the prose appears (beat scenes: its write's `at`), so the
 * cursor spreads its sentences over the rest of the clip.
 */
function Prose({ text, group, timed, markdown = false, className, from = 0, para }: {
  text: string; group: number; timed: boolean; markdown?: boolean; className?: string;
  from?: number;
  para?: (p: number) => ParaMeta;
}) {
  const paras = useMemo(() => splitProse(text), [text]);
  let idx = 0;
  const sentence = (sent: string, g: number, f: number) => {
    const i = idx++;
    const rich = markdown || /[$*`]/.test(sent);
    const state = g < 0 || !timed ? 'idle' : 'waiting';
    return (
      <span key={i} className="lsn-sent" data-sent-group={g} data-sent={i} data-w={speechWeight(sent)} data-state={state}
        data-sent-from={f > 0 ? f.toFixed(3) : undefined} data-rich={rich ? '' : undefined}>
        {rich ? <MathMarkdown content={sent} components={INLINE_P} /> : sent}
      </span>
    );
  };
  const inline = (sents: string[], g: number, f: number) =>
    sents.flatMap((sent, i) => (i === 0 ? [sentence(sent, g, f)] : [' ', sentence(sent, g, f)]));
  if (paras.length === 1 && !isBlockMarkdown(paras[0][0]) && !para) {
    return className ? <span className={className}>{inline(paras[0], group, from)}</span> : <>{inline(paras[0], group, from)}</>;
  }
  return (
    <div className={className}>
      {paras.map((sents, p) => {
        const meta = para?.(p);
        const g = meta ? meta.group : group;
        const f = meta ? meta.from : from;
        const bits = meta?.bits ?? null;
        const attrs = bits ? { 'data-key': bits.key, 'data-prose': '1', className: elCls(bits) } : {};
        if (isBlockMarkdown(sents[0])) {
          const block = (
            <div key={p} className={bits ? 'lsn-sent' : `lsn-sent ${elCls(bits)}`} data-sent-group={g} data-sent={idx++} data-w={speechWeight(sents[0])}
              data-state={g < 0 || !timed ? 'idle' : 'waiting'} data-sent-from={f > 0 ? f.toFixed(3) : undefined} data-rich="">
              <MathMarkdown content={sents[0]} />
            </div>
          );
          return bits ? <div key={p} {...attrs}>{block}</div> : block;
        }
        return <p key={p} {...attrs}>{inline(sents, g, f)}</p>;
      })}
    </div>
  );
}

const TONE = {
  amber: { hl: 'lsn-hl-amber', chip: 'lsn-chip-amber bg-amber-50 border-amber-200 text-amber-900', stroke: '#f59e0b' },
  sky: { hl: 'lsn-hl-sky', chip: 'lsn-chip-sky bg-sky-50 border-sky-200 text-sky-900', stroke: '#0ea5e9' },
  rose: { hl: 'lsn-hl-rose', chip: 'lsn-chip-rose bg-rose-50 border-rose-200 text-rose-900', stroke: '#f43f5e' },
  emerald: { hl: 'lsn-hl-emerald', chip: 'lsn-chip-emerald bg-emerald-50 border-emerald-200 text-emerald-900', stroke: '#10b981' },
} as const satisfies Record<LessonTone, { hl: string; chip: string; stroke: string }>;

function TokenSpan({ t, bits }: { t: StepToken; bits?: ElementBits | null }) {
  return (
    <span
      data-token-id={t.id || undefined}
      data-from={t.from || undefined}
      data-key={bits?.key}
      className={`lsn-tok inline-block ${t.hl ? `lsn-hl ${TONE[t.hl].hl}` : ''} ${elCls(bits ?? null)}`}
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

// ── Beat-scene helpers shared by the views ───────────────────────────────────

/** Element bits for a board key (null outside beat scenes). */
function bitsOf(board: BoardState | null, key: string): ElementBits | null {
  if (!board) return null;
  return { key, on: elementShown(board, key), written: board.written.has(key) };
}

/** The prose group + start fraction for an element in a beat scene; the given default otherwise. */
function groupOf(board: BoardState | null, scene: PlayScene, key: string, fallback: number): { group: number; from: number } {
  if (!board) return { group: fallback, from: 0 };
  const g = proseGroup(scene, key);
  return g ? { group: g.beat, from: g.at } : { group: -1, from: 0 };
}

// ── Scene: title ─────────────────────────────────────────────────────────────

function TitleView({ scene, minutes, timed, board }: { scene: TitleScene; minutes: number; timed: boolean; board: BoardState | null }) {
  const title = bitsOf(board, 'text:title');
  const promise = bitsOf(board, 'text:promise');
  const pg = groupOf(board, scene, 'text:promise', 0);
  return (
    <div className="lsn-body lsn-body-title flex-1 flex flex-col items-center justify-center text-center px-2 py-10">
      {/* inline-block: transforms are ignored on plain inline boxes, and the
          rise animation translates. Same reason on every lsn-rise span below. */}
      <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-kicker lsn-rise" style={{ animationDelay: '80ms' }}>
        ▶ Animated lesson · ≈ {minutes} min
      </span>
      <h2 data-key={title?.key} className={`mt-3 text-[27px] leading-tight font-bold text-navy lsn-ink lsn-hand-title ${board ? elCls(title) : 'lsn-rise'}`}
        style={board ? undefined : { animationDelay: '200ms' }}>
        {scene.title}
      </h2>
      <p data-key={promise?.key} data-prose={board ? '1' : undefined}
        className={`mt-4 max-w-xs text-[15px] text-slate-600 leading-relaxed lsn-ink-2 lsn-hand ${board ? elCls(promise) : 'lsn-rise'}`}
        style={board ? undefined : { animationDelay: '380ms' }}>
        <Prose text={scene.promise} group={pg.group} from={pg.from} timed={timed} />
      </p>
    </div>
  );
}

// ── Scene: caption ───────────────────────────────────────────────────────────

function CaptionView({ scene, timed, board }: { scene: CaptionScene; timed: boolean; board: BoardState | null }) {
  const heading = bitsOf(board, 'text:heading');
  const para = board
    ? (p: number): ParaMeta => {
        const key = `para:${p}`;
        const g = groupOf(board, scene, key, 0);
        return { group: g.group, from: g.from, bits: bitsOf(board, key) };
      }
    : undefined;
  return (
    <div className="lsn-body lsn-body-caption flex-1 flex flex-col justify-center px-1 py-6">
      {scene.heading && (
        <p data-key={heading?.key} className={`text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-heading mb-3 ${board ? elCls(heading) : 'lsn-rise'}`}>{scene.heading}</p>
      )}
      <div data-fit className={board ? '' : 'lsn-rise'} style={board ? undefined : { animationDelay: '120ms' }}>
        <Prose text={scene.text} group={0} timed={timed} markdown para={para}
          className="prose prose-sm max-w-none text-slate-700 lsn-ink-2 lsn-hand leading-relaxed text-[15px] [&>p]:my-0 [&>*+*]:mt-3 block" />
      </div>
    </div>
  );
}

// ── Scene: equation-steps (with moved-term FLIP) ─────────────────────────────

function flyClone(container: HTMLElement, source: HTMLElement, target: HTMLElement) {
  const s = offsetRect(source, container);
  const t = offsetRect(target, container);
  if (s.width === 0 || t.width === 0) return;

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-token-id');
  clone.removeAttribute('data-key');
  clone.setAttribute('aria-hidden', 'true');
  for (const a of clone.getAnimations?.() ?? []) a.cancel();
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${s.left}px`,
    top: `${s.top}px`,
    width: `${s.width}px`,
    height: `${s.height}px`,
    margin: '0',
    opacity: '1',
    clipPath: 'none',
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

function EquationStepsView({ scene, step, reduced, timed, board }: {
  scene: EquationStepsScene; step: number; reduced: boolean; timed: boolean; board: BoardState | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRevealed = useRef(0);
  const prevMoved = useRef<Set<string>>(new Set());
  const revealed = step + 1;

  // Fly a token from the earlier line that declared its `from` id.
  const fly = useCallback((cont: HTMLElement, fromId: string, lineIdx: number) => {
    const line = cont.querySelector<HTMLElement>(`[data-line="${lineIdx}"]`);
    if (!line) return;
    for (const target of Array.from(line.querySelectorAll<HTMLElement>(`[data-from="${CSS.escape(fromId)}"]`))) {
      const source = Array.from(cont.querySelectorAll<HTMLElement>(`[data-token-id="${CSS.escape(fromId)}"]`))
        .find(el => {
          const l = el.closest('[data-line]');
          return l && Number(l.getAttribute('data-line')) < lineIdx;
        });
      if (source) flyClone(cont, source, target);
    }
  }, []);

  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    if (board) {
      // Beat scene: a flight per `from` id whose move has fired since last commit.
      const was = prevMoved.current;
      prevMoved.current = new Set(board.moved);
      if (reduced) return;
      for (const fromId of board.moved) {
        if (was.has(fromId)) continue;
        scene.steps.forEach((s, li) => { if (s.tokens.some(t => t.from === fromId)) fly(cont, fromId, li); });
      }
      return;
    }
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
      if (fromId) fly(cont, fromId, lineIdx);
    }
  }, [revealed, reduced, board, scene.steps, fly]);

  const intro = bitsOf(board, 'text:intro');
  const notes = useMemo(() => (board ? sceneNotes(scene) : []), [board, scene]);
  return (
    <div className="lsn-body lsn-body-steps flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-heading mb-1.5">{scene.heading}</p>
      )}
      {/* The question, in the Kalam BODY size — not the marker face and not a
          headline: it is the thing being worked on, and it has to sit on one or
          two lines of a phone board. `data-fit` is the last-resort guard. */}
      {scene.intro && (
        <p data-key={intro?.key} data-prose={board ? '1' : undefined} data-fit
          className={`text-[15px] text-slate-700 lsn-ink-2 lsn-hand mb-4 ${elCls(intro)}`}><MathText text={scene.intro} /></p>
      )}
      {/* relative: FLIP clones are positioned against this box. Every line is
          laid out from mount (hidden by opacity), so revealing never shifts
          layout and flight destinations are measurable in advance. */}
      <div ref={containerRef} className="lsn-steps relative space-y-4">
        {scene.steps.map((s, i) => {
          const on = board ? lineOn(board, i) : i < revealed;
          const ng = groupOf(board, scene, lineKey(i), i);
          return (
            <div key={i} data-line={i} data-key={board ? lineKey(i) : undefined} aria-hidden={!on}
              className={`lsn-line ${on ? 'on' : ''}`}>
              <div data-fit className="lsn-tokrow text-[17px] text-slate-800 lsn-ink leading-relaxed flex flex-wrap items-baseline gap-x-1.5 gap-y-1.5">
                {s.tokens.map((t, ti) => (
                  <TokenSpan key={ti} t={t}
                    bits={board ? { key: tokKey(i, ti), on: tokenShown(board, scene, i, ti), written: tokenWritten(board, i, ti) } : null} />
                ))}
              </div>
              {/* Handwritten asides beside this line's tokens: slots from mount, drawn on when their beat says so. */}
              {board && notes.some(n => n.line === i) && (
                <div className="lsn-note-row">
                  {notes.filter(n => n.line === i).map(n => <NoteSlotView key={n.id} note={n} board={board} />)}
                </div>
              )}
              {/* The note is the prose the voice reads for this line; the
                  tokens above it arrive per step and are never walked word by
                  word. The intro (the question) stays at full ink throughout. */}
              {s.note && (
                <p data-fit className="lsn-step-note mt-1.5 text-[13px] text-slate-500 lsn-muted-2 lsn-hand leading-snug"><Prose text={s.note} group={ng.group} from={ng.from} timed={timed} /></p>
              )}
            </div>
          );
        })}
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

function GraphMorphView({ scene, step, reduced, board }: {
  scene: GraphMorphScene; step: number; reduced: boolean; board: BoardState | null;
}) {
  const W = 360, H = 250, L = 38, R = 12, T = 12, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const { xMin, xMax, yMin, yMax } = scene.window;
  const px = useCallback((x: number) => L + ((x - xMin) / (xMax - xMin)) * plotW, [xMin, xMax, plotW]);
  const py = useCallback((y: number) => T + ((yMax - y) / (yMax - yMin)) * plotH, [yMin, yMax, plotH]);
  // Beat scenes: the state a `morph` action set; otherwise the sub-step.
  const state = board ? board.state : step;

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
    const target = Math.min(state, padded.length - 1);
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
  }, [state, pathFor, reduced, padded.length]);

  // Axes + ticks: static for the whole scene — only the curve ever moves.
  const xTicks: number[] = [];
  for (let v = Math.ceil(xMin); v <= Math.floor(xMax); v++) if (v !== 0) xTicks.push(v);
  const yStep = yMax - yMin > 6 ? 2 : 1;
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) if (v !== 0) yTicks.push(v);
  const x0 = xMin <= 0 && 0 <= xMax ? px(0) : L;
  const y0 = yMin <= 0 && 0 <= yMax ? py(0) : T + plotH;
  const current = Math.min(state, scene.states.length - 1);
  const caption = bitsOf(board, 'text:caption');

  return (
    <div className="lsn-body lsn-body-graph flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-heading mb-2">{scene.heading}</p>
      )}
      {/* Fixed-height label slot — states crossfade in place, no reflow. */}
      <div className="relative h-12 mb-1">
        {scene.states.map((s, i) => (
          <div key={i} aria-hidden={i !== current}
            className="absolute inset-0 flex items-center justify-center text-center text-[15px] text-navy lsn-ink font-medium"
            style={{ opacity: i === current ? 1 : 0, transition: `opacity 360ms ${EASE}` }}>
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
          <line key={`gx${v}`} x1={px(v)} y1={T} x2={px(v)} y2={T + plotH} stroke="#e2e8f0" strokeWidth="1" className="lsn-grid" />
        ))}
        {yTicks.map(v => (
          <line key={`gy${v}`} x1={L} y1={py(v)} x2={L + plotW} y2={py(v)} stroke="#e2e8f0" strokeWidth="1" className="lsn-grid" />
        ))}
        {/* axes */}
        <line x1={L} y1={y0} x2={L + plotW} y2={y0} stroke="#94a3b8" strokeWidth="1.2" className="lsn-axis" />
        <line x1={x0} y1={T} x2={x0} y2={T + plotH} stroke="#94a3b8" strokeWidth="1.2" className="lsn-axis" />
        {/* tick labels — upright, small, steady */}
        {xTicks.map(v => (
          <text key={`tx${v}`} x={px(v)} y={y0 + 14} fontSize="10" fill="#94a3b8" textAnchor="middle" className="lsn-tick">{v}</text>
        ))}
        {yTicks.map(v => (
          <text key={`ty${v}`} x={x0 - 5} y={py(v) + 3.5} fontSize="10" fill="#94a3b8" textAnchor="end" className="lsn-tick">{v}</text>
        ))}
        {scene.xLabel && (
          <text x={L + plotW - 2} y={y0 - 6} fontSize="11" fill="#64748b" textAnchor="end" fontStyle="italic" className="lsn-axis-label">{scene.xLabel}</text>
        )}
        {scene.yLabel && (
          <text x={x0 + 7} y={T + 10} fontSize="11" fill="#64748b" fontStyle="italic" className="lsn-axis-label">{scene.yLabel}</text>
        )}
        <g clipPath="url(#lsn-plot-clip)">
          {/* outgoing curve, frozen faint while the live one morphs away from it */}
          <path ref={ghostRef} d="" fill="none" stroke="#cbd5e1" strokeWidth="1.6"
            strokeDasharray="4 4" style={{ opacity: 0, transition: 'opacity 300ms ease' }} className="lsn-ghost" />
          <path ref={pathRef} d="" fill="none" stroke="hsl(220, 60%, 20%)" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" className="lsn-curve" />
        </g>
      </svg>
      {scene.caption && (
        <p data-key={caption?.key} data-prose={board ? '1' : undefined} data-fit className={`mt-3 text-[13px] text-slate-500 lsn-muted-2 lsn-hand leading-snug ${elCls(caption)}`}><MathText text={scene.caption} /></p>
      )}
    </div>
  );
}

// ── Scene: annotate ──────────────────────────────────────────────────────────

type ConnLine = { x1: number; y1: number; x2: number; y2: number; tone: LessonTone };

function AnnotateView({ scene, step, timed, board }: { scene: AnnotateScene; step: number; timed: boolean; board: BoardState | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<ConnLine[]>([]);
  const shownCallouts = Math.max(0, step); // step 0 = expression only
  const calloutOn = (i: number) => (board ? elementShown(board, `callout:${i}`) : i < shownCallouts);
  const exprOn = board ? lineOn(board, 0) : true;

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

  const intro = bitsOf(board, 'text:intro');
  const ig = groupOf(board, scene, 'text:intro', 0);
  const notes = useMemo(() => (board ? sceneNotes(scene).filter(n => n.line === 0) : []), [board, scene]);
  return (
    <div className="lsn-body lsn-body-annotate flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-heading mb-1.5">{scene.heading}</p>
      )}
      {/* The intro is step 0's prose (the expression reveal has no other words). */}
      {scene.intro && (
        <p data-key={intro?.key} data-prose={board ? '1' : undefined} data-fit className={`text-[15px] text-slate-700 lsn-ink-2 lsn-hand mb-2 ${elCls(intro)}`}><Prose text={scene.intro} group={ig.group} from={ig.from} timed={timed} /></p>
      )}
      <div ref={containerRef} className="relative">
        {/* connector overlay — pointer-transparent, px coordinates vs container */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          {lines.map((l, i) => {
            if (!calloutOn(i)) return null;
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
        {/* the expression — tokens stagger up on scene entry (beat scenes: when written) */}
        <div className="min-h-[96px] flex items-center justify-center py-5">
          <div data-fit data-key={board ? lineKey(0) : undefined} className={`lsn-tokrow text-[19px] text-navy lsn-ink flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-2 ${board ? `lsn-line ${exprOn ? 'on' : ''}` : ''}`}>
            {scene.tokens.map((t, i) => (
              <span key={i} className={`inline-block ${board ? '' : 'lsn-rise'}`} style={board ? undefined : { animationDelay: `${i * 70}ms` }}>
                <TokenSpan t={t}
                  bits={board ? { key: tokKey(0, i), on: tokenShown(board, scene, 0, i), written: tokenWritten(board, 0, i) } : null} />
              </span>
            ))}
          </div>
        </div>
        {board && notes.length > 0 && (
          <div className="lsn-note-row justify-center -mt-3 mb-2">
            {notes.map(n => <NoteSlotView key={n.id} note={n} board={board} />)}
          </div>
        )}
        {/* callouts — every slot laid out from mount; reveal is opacity-only */}
        <div className="space-y-2 pt-2">
          {scene.callouts.map((c, i) => {
            const on = calloutOn(i);
            const cg = groupOf(board, scene, `callout:${i}`, i + 1);
            return (
              <div key={i} data-key={board ? `callout:${i}` : undefined} aria-hidden={!on}
                className={`lsn-line ${on ? 'on' : ''} flex items-start gap-2.5 border rounded-xl px-3 py-2 lsn-chip ${TONE[c.tone ?? 'amber'].chip}`}>
                <span data-conn-dot={i} aria-hidden
                  className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style={{ background: TONE[c.tone ?? 'amber'].stroke }} />
                <span className="text-[13.5px] leading-snug lsn-hand"><Prose text={c.label} group={cg.group} from={cg.from} timed={timed} /></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Scene: check (real bank question, graded locally, recorded server-side) ──

type CheckStatus = 'idle' | 'retry' | 'correct' | 'reveal' | 'unclear';

function CheckView({ scene, slug, onResolved, timed, board }: {
  scene: ResolvedCheckScene; slug: string; onResolved: () => void; timed: boolean; board: BoardState | null;
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
  const prompt = bitsOf(board, 'text:prompt');
  const pg = groupOf(board, scene, 'text:prompt', 0);

  return (
    // Stop card-level tap-to-advance while the student is answering.
    <div className="lsn-body lsn-body-check flex-1 px-1 py-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 lsn-accent lsn-heading lsn-heading-accent mb-1.5">
        ✋ Quick check — a real exam question
      </p>
      {scene.prompt && (
        <p data-key={prompt?.key} data-prose={board ? '1' : undefined} className={`text-[13px] text-slate-500 lsn-muted-2 lsn-hand mb-3 leading-snug ${elCls(prompt)}`}><Prose text={scene.prompt} group={pg.group} from={pg.from} timed={timed} /></p>
      )}
      <div className="bg-slate-50 border border-slate-200 lsn-well rounded-2xl p-4 mb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="prose prose-sm max-w-none text-slate-800 lsn-ink leading-relaxed [&>p]:my-0 [&>p+p]:mt-2">
            <MathMarkdown content={scene.markdown} />
          </div>
          {scene.marks ? (
            <span className="shrink-0 text-xs text-slate-400 lsn-muted font-semibold whitespace-nowrap">[{scene.marks}]</span>
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
          className="flex-1 min-w-0 border border-slate-300 rounded-xl px-3.5 py-2.5 text-base font-mono bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400/60 disabled:bg-slate-50 disabled:text-slate-500"
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
  // A beat scene paces to its beats: a tutor's speed over the words said.
  if (hasBeats(scene) && scene.type !== 'check') return beatAutoMs(scene.beats[step] ?? scene.beats[0]);
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
/** Manual pacing of a beat's actions: their `at` fractions play out over this span (ms at 1×). */
const MANUAL_SPREAD_MS = 900;

// ── The teacher's cursor (rAF, imperative DOM) ───────────────────────────────

interface BeatClock { elapsedMs: number; totalMs: number }

/** The ribbon's current sentence — React state, changed only at sentence boundaries. */
interface RibbonLine { key: string; words: string[] }

/**
 * Time windows for the shown sentences of one group. All from 0: aligned to
 * the spoken sentences (the original map). Otherwise (beat scenes: prose that
 * appears part-way through a clip) each cluster of sentences sharing a start
 * fraction takes the clip from that fraction to the next cluster's, spread by
 * weight — the words wake once they are on the board, never before.
 */
function windowsFor(shown: HTMLElement[], track: SpeechTrack | null, duration: number): SpeechWindow[] {
  const froms = shown.map(el => Number(el.dataset.sentFrom) || 0);
  const weights = shown.map(el => Number(el.dataset.w) || 1);
  if (froms.every(f => f === 0)) return alignShownToSpoken(weights, track ? track.sentences : null, duration);
  const starts = Array.from(new Set(froms)).sort((a, b) => a - b);
  const out: SpeechWindow[] = new Array(shown.length);
  starts.forEach((f, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : 1;
    const idx = froms.map((v, i) => (v === f ? i : -1)).filter(i => i >= 0);
    const ws = alignShownToSpoken(idx.map(i => weights[i]), null, 1);
    idx.forEach((i, j) => { out[i] = { start: (f + ws[j].start * (end - f)) * duration, end: (f + ws[j].end * (end - f)) * duration }; });
  });
  return out;
}

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

      // Sentence spans by group, in DOM order. Group −1 is static prose no
      // beat reads — it stays idle (full ink) and is never walked.
      const spans = Array.from(card.querySelectorAll<HTMLElement>('[data-sent]'));
      const byGroup = new Map<number, HTMLElement[]>();
      for (const el of spans) {
        const g = Number(el.dataset.sentGroup);
        if (g < 0) continue;
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
        const windows = windowsFor(shown, track, duration);
        const cur = speechStatesAt(windows, t, track ? CURSOR_LEAD_S : 0);
        shown.forEach((el, i) => {
          setState(el, cur.states[i]);
          // The sweep is the voice's pace — a silent beat only lifts the sentence.
          const sweep = track && cur.states[i] === 'speaking' ? cur.progress.toFixed(3) : '0';
          if (el.style.getPropertyValue('--sweep') !== sweep) el.style.setProperty('--sweep', sweep);
          // …but the chalk HAND writes at the beat's pace whether or not there
          // is a voice, so it gets its own fraction: how far into this
          // sentence's share of the clip (or the silent beat) we are.
          const p = cur.states[i] === 'speaking' ? cur.progress.toFixed(3) : '0';
          if (el.style.getPropertyValue('--lsn-p') !== p) el.style.setProperty('--lsn-p', p);
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

// ── The beat director (rAF: which of this beat's actions have fired) ─────────

/**
 * Advances `fired` for the current beat as time crosses each action's `at`.
 * Time source, in order: the live clip's fraction (Voice — exact at the clip's
 * start, rate and pause for free); the running silent beat (Auto, or a silent
 * position in Voice); a short tap clock in Manual (the `at`s play out over
 * MANUAL_SPREAD_MS). Moving BACK to a beat, or reduced motion, fires
 * everything at once — the finished state, never a replay. Dispatches
 * `lsn:beat` / `lsn:action` DOM events on the card (what a browser driver
 * listens to; nothing in the app does).
 */
function useBeatDirector({ cardRef, scene, sceneIdx, step, done, pacing, locked, reduced, rate, clip, beatClock }: {
  cardRef: React.RefObject<HTMLDivElement | null>;
  scene: PlayScene; sceneIdx: number; step: number; done: boolean;
  pacing: Pacing;
  /** Voice is on but no gesture has unlocked audio (the poster is up): nothing fires until it does. */
  locked: boolean;
  reduced: boolean; rate: number;
  clip: () => ReturnType<ReturnType<typeof useNarration>['clock']>;
  beatClock: () => BeatClock | null;
}): number {
  const posKey = `${sceneIdx}:${step}`;
  const [firedState, setFiredState] = useState<{ key: string; n: number }>({ key: '', n: 0 });
  const firedRef = useRef(firedState);
  useEffect(() => { firedRef.current = firedState; });
  const lastPosRef = useRef<{ scene: number; step: number } | null>(null);
  const timeline = useMemo(() => beatTimeline(scene, step), [scene, step]);
  const beat = hasBeats(scene);

  useEffect(() => {
    const prev = lastPosRef.current;
    lastPosRef.current = { scene: sceneIdx, step };
    if (!beat || done) return;
    const total = timeline.length;
    const card = cardRef.current;
    const emit = (name: string, detail: Record<string, unknown>) =>
      card?.dispatchEvent(new CustomEvent(name, { detail: { scene: sceneIdx, beat: step, t: performance.now(), ...detail }, bubbles: true }));
    // Moving BACK onto a beat shows its finished state — except landing on a
    // scene's FIRST beat (‹ in Voice, a restart), which is a fresh entry and
    // replays, exactly as the clip does.
    const backwards = prev !== null && step > 0 && (prev.scene > sceneIdx || (prev.scene === sceneIdx && prev.step > step));
    const startN = firedRef.current.key === posKey ? firedRef.current.n : 0;
    if (startN === 0) emit('lsn:beat', { actions: total, backwards });
    if (total === 0) return;
    const times = timeline.map(x => x.at);
    const entered = performance.now();
    let n = startN;
    let raf = 0;
    if (backwards || reduced) {
      // The finished state, on the next frame (never a replay).
      if (startN < total) raf = requestAnimationFrame(() => setFiredState({ key: posKey, n: total }));
      return () => cancelAnimationFrame(raf);
    }
    const tick = () => {
      let frac: number;
      let clipElapsed: number | null = null;
      const c = clip();
      if (pacing === 'narrated' && locked) {
        // The poster is up: the board waits for the tap that starts the voice.
        raf = requestAnimationFrame(tick);
        return;
      }
      if (c && c.scene === sceneIdx && c.step === step) {
        clipElapsed = c.elapsed;
        frac = c.duration ? Math.min(1, c.elapsed / c.duration) : 0;
        if (!c.playing && c.duration && c.elapsed >= c.duration - 0.05) frac = 1;
      } else if (pacing !== 'manual') {
        const b = beatClock();
        frac = b ? Math.min(1, b.elapsedMs / Math.max(1, b.totalMs)) : 0;
      } else {
        frac = Math.min(1, (performance.now() - entered) / scaleBeat(MANUAL_SPREAD_MS, rate));
      }
      const k = firedCountAt(times, frac);
      if (k > n) {
        for (let j = n; j < k; j++) emit('lsn:action', { index: j, kind: timeline[j].action.do, at: timeline[j].at, frac, clipElapsed, source: clipElapsed !== null ? 'clip' : pacing === 'manual' ? 'tap' : 'timer' });
        n = k;
        setFiredState({ key: posKey, n });
      }
      if (n < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beat, done, sceneIdx, step, posKey, timeline, pacing, locked, reduced, rate, clip, beatClock, cardRef]);

  return firedState.key === posKey ? firedState.n : 0;
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

/**
 * NOTHING OVERFLOWS THE BOARD (2026-09-06). Prose wraps and the token rows wrap
 * on their own, but a single KaTeX island cannot break — so any `[data-fit]`
 * row still wider than its box has its font-size taken down until it fits
 * (never below FIT_MIN_PX). Runs in a LAYOUT effect, so the smaller size is in
 * the first painted frame: no shift, and the chalk writer measures the size
 * that actually shipped. Only the board themes run it; the slide card is
 * untouched.
 */
function useFitToBoard(cardRef: React.RefObject<HTMLDivElement | null>, active: boolean, key: string) {
  useIsoLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !active) return;
    let lastWidth = -1;
    // The widest thing in this row that CANNOT break: a typeset formula
    // (.katex-html — never the invisible .katex-mathml, whose 1 px clipped box
    // still reports a full-width rect and would trigger a phantom shrink) or a
    // whole equation token. Everything else wraps on its own.
    const widestAtom = (el: HTMLElement): number => {
      let w = 0;
      for (const atom of Array.from(el.querySelectorAll<HTMLElement>('.katex-html, .lsn-tok'))) {
        w = Math.max(w, atom.getBoundingClientRect().width);
      }
      return w;
    };
    const fit = () => {
      for (const el of Array.from(card.querySelectorAll<HTMLElement>('[data-fit]'))) {
        el.style.removeProperty('font-size');
        let px = parseFloat(getComputedStyle(el).fontSize) || 16;
        // Bounded: each step is at least 0.25 px, and the guess is the linear
        // one — two or three passes in practice, never a spin.
        for (let i = 0; i < 20; i++) {
          const natural = widestAtom(el);
          if (fitDone(natural, el.clientWidth, px)) break;
          px = fitFontPx(px, natural, el.clientWidth);
          el.style.fontSize = `${px}px`;
          if (px <= FIT_MIN_PX) break;
        }
      }
    };
    fit();
    lastWidth = card.clientWidth;
    // Re-fit on a real WIDTH change only: fitting changes the card's height,
    // and observing that would chase its own tail.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (card.clientWidth !== lastWidth) { lastWidth = card.clientWidth; fit(); } })
      : null;
    ro?.observe(card);
    let cancelled = false;
    document.fonts?.ready?.then(() => { if (!cancelled) fit(); });
    return () => { cancelled = true; ro?.disconnect(); };
  }, [cardRef, active, key]);
}

// ── The player ───────────────────────────────────────────────────────────────

type Pacing = 'manual' | 'auto' | 'narrated';

export default function LessonPlayer({ slug, title, topic, minutes, scenes, theme: themeProp }: {
  slug: string; title: string; topic: string; minutes: number; scenes: PlayScene[]; theme?: LessonTheme;
}) {
  const theme = normalizeTheme(themeProp);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [auto, setAuto] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const [narratedUsed, setNarratedUsed] = useState(false);
  const [ribbon, setRibbon] = useState<RibbonLine | null>(null);
  /** The ⏸ / ▶ that flashes in the middle of the board when a tap changes the play state. */
  const [gesture, setGesture] = useState<{ glyph: string; id: number } | null>(null);
  const gestureSeq = useRef(0);
  const gestureTimer = useRef(0);
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

  // The beat director + the board it implies (null outside beat scenes).
  const fired = useBeatDirector({
    cardRef, scene, sceneIdx, step, done, pacing, locked: narration.locked, reduced, rate,
    clip: narration.clock, beatClock,
  });
  const board = useMemo(() => (hasBeats(scene) ? boardStateAt(scene, step, fired) : null), [scene, step, fired]);
  const marginNotes = useMemo(() => (board ? sceneNotes(scene).filter(n => n.line === null) : []), [board, scene]);

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

  /** The YouTube gesture: a glyph in the middle of the board, gone in half a second. */
  const flashGesture = useCallback((glyph: string) => {
    gestureSeq.current += 1;
    setGesture({ glyph, id: gestureSeq.current });
    window.clearTimeout(gestureTimer.current);
    gestureTimer.current = window.setTimeout(() => setGesture(null), TAP_GLYPH_MS + 60);
  }, []);
  useEffect(() => () => window.clearTimeout(gestureTimer.current), []);

  /**
   * TAP THE BOARD (Adrian, 2026-09-06: "can i click/tap at the video itself and
   * it pauses/unpauses?"). In a timed pacing a tap anywhere on the board is
   * pause ⇄ resume — the same state the header pill and the space bar own, so
   * all three stay in step — and resume continues exactly where it stopped
   * (the existing pause path: the clip keeps its currentTime, the beat timer
   * keeps its remainder). Manual pacing still taps to advance. A tap that
   * landed on a control does nothing: the check's answer gate is untouched.
   * The rule itself is pure — lib/lesson-stage.boardTapAction.
   */
  const onCardTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const action = boardTapAction({
      interactive: !!target?.closest(TAP_INTERACTIVE_SELECTOR),
      gated, canPause, paused,
    });
    if (action === 'ignore') return;
    if (action === 'advance') { tapAdvance(); return; }
    setPaused(action === 'pause');
    const glyph = tapGlyph(action);
    if (glyph) flashGesture(glyph);
  };

  // Space toggles pause on a keyboard (never while typing an answer or with a
  // control focused — those keep their own space behaviour). Escape closes
  // the speed menu; any outside tap does too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRateOpen(false); return; }
      if (e.code !== 'Space' || e.repeat || !canPause) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest(TAP_INTERACTIVE_SELECTOR)) return;
      e.preventDefault();
      const action = boardTapAction({ canPause, paused });
      setPaused(action === 'pause');
      const glyph = tapGlyph(action);
      if (glyph) flashGesture(glyph);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPause, paused, flashGesture]);
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
  const themed = theme !== 'slide';
  const themeStyle = useMemo(() => themeCssVars(theme) as React.CSSProperties, [theme]);

  // The chalk hand needs three things: a board theme, an engine this browser
  // can run, and the FACE ALREADY IN — it derives its pen paths by rasterising
  // the very glyphs the browser laid out, so measuring against a fallback font
  // would write one hand over another's layout. Until all three hold (and
  // always under reduced motion) `data-lsn-write` is off and the CSS simply
  // shows each sentence as it is reached.
  const [faceReady, setFaceReady] = useState(false);
  useEffect(() => {
    if (!needsHandFont(theme) || !document.fonts) return;
    let cancelled = false;
    Promise.all([`16px "${HAND_FONT_FAMILY}"`, `16px "${TITLE_FONT_FAMILY}"`].map(f => document.fonts.load(f)))
      .then(() => { if (!cancelled) setFaceReady(document.fonts.check(`16px "${HAND_FONT_FAMILY}"`)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [theme]);
  const engineOk = useMemo(() => ChalkWriter.available(), []);
  const writing = themed && faceReady && engineOk && !reduced;
  const tipStyle = THEME_TOKENS[theme].tip;
  // Re-fit whenever the scene, the step or the face changes the measurements.
  useFitToBoard(cardRef, themed, `${sceneIdx}:${step}:${faceReady}:${done}`);

  return (
    <div className="max-w-lg mx-auto pb-24 sm:pb-6" data-lsn-theme={theme} data-lsn-themed={themed ? '' : undefined}
      data-lsn-tip={tipStyle} data-lsn-write={writing ? 'on' : undefined} style={themeStyle}>
      <style>{PLAYER_CSS}</style>
      {/* The two handwriting faces for the board stages: SELF-HOSTED subsets
          (public/lessons/fonts, ~43 KB the pair), because the chalk writer has
          to read the same file the CSS laid the text out with. Preloaded so the
          hand can start on the first beat rather than after a swap. The slide
          theme loads nothing. */}
      {needsHandFont(theme) && (
        <>
          <link rel="preload" as="font" type="font/woff" href={HAND_FONT_URL} crossOrigin="anonymous" />
          <link rel="preload" as="font" type="font/woff" href={TITLE_FONT_URL} crossOrigin="anonymous" />
          <style>{HAND_FONT_FACES}</style>
        </>
      )}

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
      <div className="lsn-dots flex items-center gap-1 mb-3 px-0.5" aria-hidden>
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
          <h2 className="text-xl font-bold text-navy lsn-ink lsn-rise" style={{ animationDelay: '120ms' }}>Lesson complete</h2>
          <p className="mt-2 max-w-xs text-sm text-slate-600 lsn-ink-2 lsn-rise" style={{ animationDelay: '240ms' }}>
            That&apos;s the whole idea — the fastest way to make it stick is to use it on real questions while it&apos;s fresh.
          </p>
          <Link href={practiceHref}
            className="block text-center mt-6 w-full max-w-xs bg-amber-400 text-navy rounded-2xl px-4 py-3.5 font-bold text-[15px] shadow-[0_8px_24px_-10px_rgba(245,158,11,0.8)] hover:bg-amber-300 active:scale-[0.98] motion-safe:transition lsn-rise"
            style={{ animationDelay: '360ms' }}>
            ✏️ Practise {topic} →
          </Link>
          <button type="button" onClick={restart}
            className="mt-3 text-sm font-semibold text-slate-500 lsn-muted hover:text-navy">
            ↺ Watch again
          </button>
        </div>
      ) : (
        /* ── The scene card. Tapping it advances (except mid-check); while
              paused, a tap resumes instead. ── */
        <div key={sceneIdx} ref={cardRef} onClick={onCardTap} data-paused={paused || undefined} data-beats={board ? maxStep : undefined}
          data-step={step}
          className={`lsn-scene relative bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5 flex flex-col ${themed ? 'lsn-stage' : 'min-h-[440px]'} ${gated ? '' : 'cursor-pointer'}`}>
          <BoardLayer board={board} notes={marginNotes} reduced={reduced} rate={rate} writing={writing} paused={paused}>
            {scene.type === 'title' && <TitleView scene={scene} minutes={minutes} timed={timed} board={board} />}
            {scene.type === 'caption' && <CaptionView scene={scene} timed={timed} board={board} />}
            {scene.type === 'equation-steps' && <EquationStepsView scene={scene} step={step} reduced={reduced} timed={timed} board={board} />}
            {scene.type === 'graph-morph' && <GraphMorphView scene={scene} step={step} reduced={reduced} board={board} />}
            {scene.type === 'annotate' && <AnnotateView scene={scene} step={step} timed={timed} board={board} />}
            {scene.type === 'check' && (
              <CheckView scene={scene} slug={slug} timed={timed} board={board}
                onResolved={() => setResolved(prev => new Set(prev).add(sceneIdx))} />
            )}
            {scene.type === 'check-skipped' && <CheckSkippedView />}
          </BoardLayer>
          {/* The tap's own feedback: ⏸ / ▶ in the middle of the board, grown and
              gone inside half a second — the gesture every video player uses. */}
          {gesture && (
            <span key={gesture.id} aria-hidden data-lsn-gesture={gesture.glyph === '⏸' ? 'pause' : 'play'}
              className="lsn-gesture">{gesture.glyph}</span>
          )}
          {/* Paused: a quiet chip; the card itself is the resume surface. */}
          {paused && (
            <span aria-hidden data-paused-chip
              className="lsn-paused-chip absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] lsn-rise"
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
              className="absolute inset-0 rounded-3xl flex items-center justify-center bg-white/55 backdrop-blur-[2px] lsn-poster lsn-rise cursor-pointer">
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
        <div className={`lsn-controls flex items-center gap-2 ${pacing === 'narrated' ? 'mt-3' : 'mt-4'}`}>
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
// off in one block. The theme block at the end reads only `--lsn-*` custom
// properties (lib/lesson-theme.ts) and applies ONLY under [data-lsn-themed],
// so the slide theme's cascade is exactly what it was.
/**
 * The chalk grain — a fine-noise ALPHA tile used as a `mask-image` on typeset
 * maths, on the title and on the hand-drawn marks. It nibbles the anti-aliased
 * rim of every glyph, which is what makes print type read as chalk. A mask (not
 * an SVG filter graph) on purpose: it is rasterised once per tile and never
 * re-runs, where an feDisplacementMap over a whole card re-runs on every
 * repaint.
 *
 * 2026-09-06: the alpha row was `0.62 · noise + 0.38` — it took up to 62 % of
 * the ink out of the INTERIOR of every glyph, and with a 6 px glow on top the
 * maths read as out of focus. Now `0.26 · noise + 0.74`: the same rough rim, a
 * solid letter.
 */
const CHALK_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><filter id='c' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch' seed='7'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.26 0.74'/></filter><rect width='64' height='64' filter='url(%23c)'/></svg>\")";

const PLAYER_CSS = `
@keyframes lsnSceneIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes lsnRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes lsnHlPulse { from { filter: saturate(1.9) brightness(0.96); } to { filter: none; } }
@keyframes lsnConnDraw { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
@keyframes lsnDotIn { from { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; } to { opacity: 1; transform: none; } }
@keyframes lsnFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes lsnPulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 var(--lsn-pen-soft, rgba(245,158,11,0.25)); } 35% { transform: scale(1.12); box-shadow: 0 0 0 6px var(--lsn-pen-soft, rgba(245,158,11,0.25)); } 100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; } }
/* On a board a token is not pulsed, it is gone over again with a fresh stick. */
@keyframes lsnGlow { 0% { transform: scale(1); } 35% { transform: scale(1.06); text-shadow: 0 0 16px currentColor, 0 0 4px currentColor; } 100% { transform: scale(1); } }
/* Typeset maths arrives as a puff of chalk dust — it is never written. */
@keyframes lsnDust { 0% { opacity: 0; filter: blur(3px); } 55% { opacity: 1; } 100% { opacity: 1; filter: none; } }
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

/* ── The beat model: elements a board shows, the pen layer ── */
.lsn-board { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.lsn-zoom { flex: 1; display: flex; flex-direction: column; position: relative; transform-origin: 0 0; transition: transform 700ms ${EASE}; }
.lsn-scene[data-focus] { overflow: hidden; }
.lsn-el { opacity: 0; transition: opacity 420ms ${EASE}, transform 420ms ${EASE}; }
.lsn-el.on { opacity: 1; }
.lsn-el.w.on { transition: none; }
.lsn-line .lsn-el { transform: translateY(4px); }
.lsn-line .lsn-el.on { transform: none; }
.lsn-line .lsn-el.w { transform: none; }
.lsn-pulse { animation: lsnPulse 900ms ${EASE} both; border-radius: 0.375rem; }
.lsn-marks { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 5; }
.lsn-marks path { fill: none; stroke: var(--lsn-pen, hsl(40, 85%, 52%)); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; opacity: 0.92; }
.lsn-pen { position: absolute; left: 0; top: 0; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--lsn-pen, hsl(40, 85%, 52%));
  box-shadow: 0 0 0 3px var(--lsn-pen-soft, rgba(245,158,11,0.25)); opacity: 0; transition: opacity 200ms ease; pointer-events: none; z-index: 6; will-change: transform; }
.lsn-pen.on { opacity: 1; }
.lsn-note { display: inline-block; font-family: var(--lsn-hand, inherit); font-size: calc(13.5px * var(--lsn-hand-scale, 1)); line-height: 1.25; color: var(--lsn-pen, hsl(40, 80%, 42%)); }
.lsn-note-row { display: flex; flex-wrap: wrap; gap: 0.1rem 0.9rem; margin-top: 0.15rem; }
.lsn-note-row .lsn-note::before { content: '↳ '; opacity: 0.7; }
.lsn-notes-flow { margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
.lsn-zoom[data-focus] .lsn-line:not([data-focused]):not(:has([data-focused])), .lsn-zoom[data-focus] .lsn-el:not([data-focused]):not(:has([data-focused])):not([data-focused] *) { opacity: 0.45; }
.lsn-zoom[data-focus] .lsn-line.on:has([data-focused]) .lsn-el:not([data-focused]) { opacity: 0.45; }
.lsn-zoom[data-focus] [data-focused], .lsn-zoom[data-focus] [data-focused] .lsn-el.on { opacity: 1; }

/* ── Themes: only under [data-lsn-themed] (chalk / paper) — the slide theme's cascade is untouched ── */
/* The SLATE. One element's background carries the whole stack, top layer first:
   vignette · chalk-dust haze · fractal grain (blended "overlay", the probe's
   pass) · the radial ground. The two erased ghosts are pseudo-elements at
   z-index −1, which is why the card isolates. */
[data-lsn-themed] .lsn-scene { position: relative; isolation: isolate; overflow: hidden;
  background-color: var(--lsn-board); background-image: var(--lsn-texture);
  background-size: var(--lsn-texture-size); background-blend-mode: var(--lsn-texture-blend);
  box-shadow: inset 0 0 0 1px var(--lsn-edge), 0 1px 2px rgba(15,23,42,0.06), 0 10px 28px -12px rgba(15,23,42,0.45); }
/* One vignette, not two: the gradient's own plus a 70 px inset black made the
   board a tunnel. 46 px at 0.20 is a frame, not a shadow. */
[data-lsn-theme="chalk"] .lsn-scene { box-shadow: inset 0 0 0 1px var(--lsn-edge), inset 0 0 46px rgba(0,0,0,0.20), 0 14px 40px -18px rgba(0,0,0,0.7); }
/* The erased ghosts. At 0.075 white they were the "blotchy patches" in Adrian's
   screenshots; at 0.022 they are the history of a board you only notice when
   you look for it. */
[data-lsn-theme="chalk"] .lsn-scene::before, [data-lsn-theme="chalk"] .lsn-scene::after {
  content: ''; position: absolute; z-index: -1; pointer-events: none; border-radius: 50%; filter: blur(3px);
  background: repeating-linear-gradient(104deg, rgba(255,255,255,0.012) 0 1.5px, rgba(255,255,255,0) 1.5px 7px),
              radial-gradient(ellipse at center, rgba(255,255,255,0.022), rgba(255,255,255,0) 72%);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 20%, transparent 72%);
  mask-image: radial-gradient(ellipse at center, #000 20%, transparent 72%); }
[data-lsn-theme="chalk"] .lsn-scene::before { left: 46%; top: 22%; width: 52%; height: 40%; transform: rotate(-9deg); }
[data-lsn-theme="chalk"] .lsn-scene::after { left: -10%; top: 58%; width: 48%; height: 36%; transform: rotate(7deg); opacity: 0.85; }
/* The board stands this tall EMPTY and grows with its content (lib/lesson-stage
   stageMinHeightPx mirrors it). The flat 440 px it replaces left a two-line
   scene floating in an empty slate and pushed Continue below a phone's fold. */
.lsn-stage { min-height: clamp(280px, 46vh, 420px); }
/* A phone board buys its margins back from the card: 16 px of slate round the
   working is comfortable, and the 4 px a side it returns is 4 px the Continue
   button does not have to be scrolled to. */
[data-lsn-themed] .lsn-stage { padding: 1rem; }
@media (min-width: 520px) { [data-lsn-themed] .lsn-stage { padding: 1.25rem; } }
[data-lsn-themed] .lsn-ink { color: var(--lsn-ink); }
[data-lsn-themed] .lsn-ink-2 { color: var(--lsn-ink-2); }
[data-lsn-themed] .lsn-muted { color: var(--lsn-muted); }
[data-lsn-themed] .lsn-muted-2 { color: var(--lsn-ink-2); opacity: 0.86; }
[data-lsn-themed] .lsn-accent { color: var(--lsn-pen); }
/* Scene headings are chalk, not a sans label: the marker face, sentence case,
   modest, in a quiet cyan (Adrian, 2026-09-06 — "WHY THE ORDINARY FORM HIDES
   THINGS" in uppercase sans does not belong on a slate). */
[data-lsn-themed] .lsn-heading { font-family: var(--lsn-title); font-size: var(--lsn-heading-px);
  font-weight: 400; text-transform: none; letter-spacing: 0.005em; line-height: 1.2; color: var(--lsn-heading); }
[data-lsn-themed] .lsn-heading-accent { color: var(--lsn-pen); }
/* FLUID sizes, not absolute px: these rules REPLACE the element's own
   text-[..px] utility, so an em would resolve against the PARENT and every role
   would come out the same size. The three roles the prose classes encode —
   body 15 px, callout label 13.5 px, note / caption 13 px — are multiplied by
   the theme's hand scale (chalk 1.6 → 24 px body) at a full-width board and
   drop to 85 % of that on a 390 px phone: 24 px Kalam measured ~22 characters a
   line there and ran off the slate; 20.4 px measures ~36. lib/lesson-theme
   fluidPx() builds the clamps. */
[data-lsn-themed] .lsn-hand { font-family: var(--lsn-hand); font-size: var(--lsn-hand-label); line-height: 1.34; }
[data-lsn-themed] .lsn-ink-2.lsn-hand, [data-lsn-themed] .lsn-hand.prose { font-size: var(--lsn-hand-body); }
[data-lsn-themed] .lsn-muted-2.lsn-hand { font-size: var(--lsn-hand-small); }
/* Worked lines are the maths of the lesson: they must not read SMALLER than
   the words beside them. The token row wraps AND shrinks to fit (data-fit), so
   this never scrolls the board sideways. */
[data-lsn-themed] .lsn-line .lsn-tok { font-size: var(--lsn-line-px); }
/* Room to breathe: a wrapped row of fractions needs more than 6 px, and the
   hand-drawn marks live in these gaps. */
[data-lsn-themed] .lsn-tokrow { column-gap: 0.5rem; row-gap: 0.55rem; }
[data-lsn-themed] .lsn-steps > * + * { margin-top: 1rem; }
[data-lsn-themed] .lsn-step-note { margin-top: 0.45rem; }
/* Content sits in the UPPER part of the board with comfortable margins — a
   short scene should not float in the middle of a tall empty slate. */
[data-lsn-themed] .lsn-body-caption { justify-content: flex-start; padding-top: 0.5rem; }
/* One idea, one paragraph: at 12 px the break between them read as a slightly
   wide line gap rather than a new thought. */
[data-lsn-themed] .lsn-body-caption .prose > * + * { margin-top: 0.85rem; }
[data-lsn-themed] .lsn-body-steps, [data-lsn-themed] .lsn-body-annotate, [data-lsn-themed] .lsn-body-graph { padding-top: 0; }
/* Every millimetre the chrome gives back is a millimetre of board that does
   not push Continue under the phone's tab bar. Themed only: the slide card's
   chrome is untouched. */
[data-lsn-themed] .lsn-dots { margin-bottom: 0.5rem; }
[data-lsn-themed] .lsn-controls { margin-top: 0.75rem; }
/* Typeset maths inside handwriting — Kalam runs large for its point size, so
   the maths is pulled back up (--lsn-math-scale) or it reads small beside the
   words. white-space: nowrap, because KaTeX will otherwise break an
   inline formula at its own binary operators, and "a(x − h)² +" / "k" across
   two lines of a phone board is worse than moving the whole formula down — if
   a formula really is wider than the board, the fit pass takes the row down
   instead. The margin is breathing room: an italic KaTeX x butted straight
   against a Kalam l read as one word ("4xlooks"). */
[data-lsn-themed] .lsn-hand .katex { font-size: calc(1em / var(--lsn-hand-scale) * var(--lsn-math-scale));
  white-space: nowrap; margin-inline: 0.1em; }
/* No orphan last line: the browser looks ahead so a wrapped question does not
   leave one token alone on its own row. */
[data-lsn-themed] .lsn-hand, [data-lsn-themed] .lsn-heading { text-wrap: pretty; }
/* A kicker on a board is quiet handwriting, not a tracked-out sans label. */
[data-lsn-themed] .lsn-kicker { font-family: var(--lsn-hand); font-size: var(--lsn-hand-small);
  font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--lsn-muted); }
[data-lsn-themed] .lsn-hand-title { font-family: var(--lsn-title); font-size: var(--lsn-title-px); font-weight: 400; letter-spacing: 0.01em; line-height: 1.15; }
[data-lsn-themed] .lsn-scene .prose { color: var(--lsn-ink-2); }
[data-lsn-themed] .lsn-scene .prose strong, [data-lsn-themed] .lsn-scene .prose b { color: var(--lsn-ink); }
/* A highlight on a board is a CHANGE OF CHALK, not a pill: the colour moves
   and a fresh stick leaves a soft glow round it. */
[data-lsn-themed] .lsn-hl { background: none; padding: 0; margin: 0; }
[data-lsn-themed] .lsn-hl-amber { color: var(--lsn-hl-amber); }
[data-lsn-themed] .lsn-hl-sky { color: var(--lsn-hl-sky); }
[data-lsn-themed] .lsn-hl-rose { color: var(--lsn-hl-rose); }
[data-lsn-themed] .lsn-hl-emerald { color: var(--lsn-hl-emerald); }
[data-lsn-themed] .lsn-hl .katex, [data-lsn-themed] .lsn-hl .katex * { color: inherit; }
/* A highlight is a change of chalk. The 9 px bloom this replaces washed the
   cyan and the yellow out into the board; the colour carries it now. */
[data-lsn-theme="chalk"] .lsn-hl { text-shadow: 0 0 1px currentColor; }
[data-lsn-themed] .lsn-line.on .lsn-hl { animation: none; }
[data-lsn-themed] .lsn-pulse { animation: lsnGlow 900ms ${EASE} both; box-shadow: none; }
[data-lsn-themed] .lsn-chip-amber { background: var(--lsn-chip-amber-bg); border-color: var(--lsn-chip-amber-border); color: var(--lsn-chip-amber-text); }
[data-lsn-themed] .lsn-chip-sky { background: var(--lsn-chip-sky-bg); border-color: var(--lsn-chip-sky-border); color: var(--lsn-chip-sky-text); }
[data-lsn-themed] .lsn-chip-rose { background: var(--lsn-chip-rose-bg); border-color: var(--lsn-chip-rose-border); color: var(--lsn-chip-rose-text); }
[data-lsn-themed] .lsn-chip-emerald { background: var(--lsn-chip-emerald-bg); border-color: var(--lsn-chip-emerald-border); color: var(--lsn-chip-emerald-text); }
[data-lsn-themed] .lsn-well { background: var(--lsn-well); border-color: var(--lsn-well-edge); }
[data-lsn-themed] .lsn-grid { stroke: var(--lsn-grid); }
[data-lsn-themed] .lsn-axis { stroke: var(--lsn-axis); }
[data-lsn-themed] .lsn-tick, [data-lsn-themed] .lsn-axis-label { fill: var(--lsn-muted); }
[data-lsn-themed] .lsn-curve { stroke: var(--lsn-curve); }
[data-lsn-themed] .lsn-ghost { stroke: var(--lsn-ghost); }
[data-lsn-themed] .lsn-poster { background: rgba(8, 12, 10, 0.42); }
[data-lsn-themed] .lsn-ribbon { background-color: var(--lsn-board); background-image: var(--lsn-texture); background-size: var(--lsn-texture-size); background-blend-mode: var(--lsn-texture-blend); border-radius: 14px; padding: 8px 12px; box-shadow: inset 0 0 0 1px var(--lsn-edge); }
[data-lsn-themed] .lsn-ribbon-line { color: var(--lsn-ribbon); border-color: var(--lsn-pen); }
[data-lsn-themed] .lsn-ribbon-line [data-w][data-on] { color: var(--lsn-ribbon-lit); }
/* Marks are chalk too: one colour per kind (pointing / attention / the answer). */
.lsn-marks path[data-mark="underline"] { stroke: var(--lsn-mark-underline, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-marks path[data-mark="circle"] { stroke: var(--lsn-mark-circle, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-marks path[data-mark="box"] { stroke: var(--lsn-mark-box, var(--lsn-pen, hsl(40, 85%, 52%))); }
[data-lsn-theme="chalk"] .lsn-marks path { stroke-width: 2.4; opacity: 0.96;
  -webkit-mask-image: ${CHALK_GRAIN}; mask-image: ${CHALK_GRAIN}; -webkit-mask-size: 72px 72px; mask-size: 72px 72px; }
[data-lsn-theme="chalk"] .lsn-pen { width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px;
  background: radial-gradient(circle, rgba(255,255,250,0.85), rgba(255,255,250,0) 68%); box-shadow: none; }
/* NO PEN by default (Adrian, 2026-09-06). The board's own pen dot rides the
   clip-path sweeps and the marks; with tip: 'none' the growing stroke is the
   cue and nothing leads it. The MOTION is untouched — only the dot is gone.
   The slide theme is tip: 'stick', so its pen is exactly where it was. */
[data-lsn-tip="none"] .lsn-pen { display: none; }
/* TYPESET MATHS IS CRISP. It used to carry the grain mask and a 6 px glow, and
   both had to go: the glow is what made it read out of focus, and the mask ATE
   SMALL GLYPHS — a superscript 2 at ~11 px came out as a stray diagonal (a
   masked/unmasked pair of the same token proved it in the browser, 2026-09-06).
   The maths gets its chalk from the colour and from dusting in; the roughness
   belongs to the written words, where the hand paints it per pixel.
   The title keeps the mask: it is the FALLBACK texture for when the writer is
   not running (reduced motion, no canvas) — with the hand on, the element's own
   glyphs are transparent and the mask is inert. */
[data-lsn-theme="chalk"] .lsn-hand-title {
  -webkit-mask-image: ${CHALK_GRAIN}; mask-image: ${CHALK_GRAIN}; -webkit-mask-size: 64px 64px; mask-size: 64px 64px; }
[data-lsn-theme="chalk"] .lsn-scene input { color: #0f172a; }
[data-lsn-theme="chalk"] .lsn-scene input::placeholder { color: #64748b; }

/* ── The hand (chalk-writer.ts): words written, maths appearing ── */
.lsn-ink-canvas, .lsn-tip-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.lsn-ink-canvas { z-index: 2; }
.lsn-tip-canvas { z-index: 7; }
/* No drop-shadow on the ink canvas: a 2 px white glow under every written
   letter is exactly the "out of focus" Adrian saw. The writer's own edge noise
   (chalk-writer EDGE_NOISE_PX) is the roughness now. */
/* An element the hand has taken over keeps its text — layout, selection and a
   screen reader all still see it — and simply stops painting it; the canvas
   carries the ink. Its maths keeps the element's own colour and dusts in. */
[data-lsn-write="on"] [data-ink], [data-lsn-write="on"] [data-ink] * { color: transparent !important; text-shadow: none !important; }
[data-lsn-write="on"] [data-ink] .katex, [data-lsn-write="on"] [data-ink] .katex * { color: var(--lsn-own-color, var(--lsn-ink)) !important; }
[data-lsn-write="on"] [data-ink] .katex[data-dust="wait"] { opacity: 0; }
[data-lsn-write="on"] [data-ink] .katex[data-dust="on"] { animation: lsnDust 560ms ${EASE} both; }
[data-lsn-write="on"] .lsn-sent[data-ink] { transition: none; }
[data-lsn-write="on"] .lsn-sent[data-ink][data-state="speaking"], [data-lsn-write="on"] .lsn-sent[data-ink][data-state="spoken"] { opacity: 1; }
/* Typeset maths the board reveals on its own beat: it dusts in, never drawn. */
.lsn-dust { animation: lsnDust 560ms ${EASE} both; }
/* Without the hand (reduced motion, no canvas, the face not in yet) a sentence
   is simply not on the board until it is said — the words appear. */
[data-lsn-themed] .lsn-sent { background-image: none; transition: opacity 260ms ${EASE}; top: 0; }
/* Notes get their OWN slot with clear air above: at 0.15rem the yellow aside
   sat on the fraction it was annotating (Adrian's screenshot, 2026-09-06). */
[data-lsn-themed] .lsn-note-row { margin-top: 0.6rem; gap: 0.2rem 1.1rem; }
[data-lsn-themed] .lsn-note { min-width: 0; max-width: 100%; font-size: var(--lsn-hand-label); overflow-wrap: anywhere; }
[data-lsn-themed] .lsn-notes-flow { margin-top: 1rem; }
/* Focus is the DIM plus a hair of lift on the target — never a scale on the
   board (that could only crop; lesson-board.tsx has the archaeology). */
.lsn-zoom[data-focus] [data-focused] { transition: filter 320ms ${EASE}; }
[data-lsn-themed] .lsn-zoom[data-focus] [data-focused] { filter: brightness(1.1); }
/* The tap gesture: the glyph a video player flashes when you tap to pause. */
@keyframes lsnGesture { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.72); } 18% { opacity: 0.92; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); } }
.lsn-gesture { position: absolute; left: 50%; top: 50%; z-index: 9; pointer-events: none;
  width: 62px; height: 62px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 24px; line-height: 1; color: #fff; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(2px);
  animation: lsnGesture ${TAP_GLYPH_MS}ms ease-out both; }
[data-lsn-theme="chalk"] .lsn-gesture { background: rgba(8, 14, 11, 0.5); color: var(--lsn-ink); }
[data-lsn-themed] .lsn-paused-chip { background: rgba(10, 16, 13, 0.55); border-color: var(--lsn-edge); color: var(--lsn-muted); }
[data-lsn-themed] .lsn-sent[data-state="waiting"] { opacity: 0; top: 0; }
[data-lsn-themed] .lsn-sent[data-state="speaking"] { opacity: 1; }
[data-lsn-themed] .lsn-sent[data-state="spoken"] { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .lsn-scene, .lsn-rise, .lsn-line, .lsn-conn, .lsn-conn-dot, .lsn-ribbon-line, .lsn-pulse { animation: none !important; transition: none !important; }
  .lsn-line { opacity: 0; }
  .lsn-line.on { opacity: 1; transform: none; }
  .lsn-sent { transition: opacity 200ms ease; top: 0 !important; background-image: none !important; }
  .lsn-ribbon-line [data-w] { transition: none; }
  .lsn-el { transition: opacity 200ms ease !important; transform: none !important; }
  .lsn-zoom { transition: none !important; transform: none !important; }
  .lsn-pen { display: none; }
  .lsn-gesture { animation: none !important; opacity: 0.9; transform: translate(-50%, -50%); }
  .lsn-dust, [data-ink] .katex[data-dust="on"] { animation: none !important; }
}
`;
