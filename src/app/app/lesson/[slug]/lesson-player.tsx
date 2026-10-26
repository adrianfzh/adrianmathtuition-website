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
import { createPortal } from 'react-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { MathMarkdown, katexOptions } from '@/lib/math-markdown';
import { checkTypedAnswer } from '@/lib/notebook';
import { boardTexAt, clipContext, readyAsks } from '@/lib/clip-ask';
import ClipAskPanel, { type ClipAskStep } from './clip-ask-panel';
import {
  hasBeats, lessonHasAudio, narrationLayout, sceneStepCount,
  type AnnotateScene, type CaptionScene, type EquationStepsScene,
  type GraphMorphScene, type GraphPiece, type MotionGraphScene, type StepGraph, graphFn, type LessonCharacter, type LessonTheme, type LessonTone, type PlayScene,
  type ResolvedCheckScene, type StepToken, type TitleScene, type SceneSketch,
} from '@/lib/lesson-script';
import {
  PLAYBACK_RATES, alignShownToSpoken, buildSpeechTrack, handWriteS, isBlockMarkdown, rateLabel, scaleBeat,
  speechStatesAt, speechWeight, splitProse, wordsLitAt,
  type PlaybackRate, type SpeechTrack, type SpeechState, type Window as SpeechWindow,
} from '@/lib/lesson-speech';
import {
  beatAutoMs, beatTimeline, boardStateAt, elementShown, firedCountAt, lineKey, lineOn, pieceKey, proseGroup, sceneNotes, scenesHaveCharacter,
  tokKey, tokenAway, tokenGone, tokenPieceWaiting, tokenShown, tokenWritten, type BoardState,
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
import { characterLook } from './lesson-character';
import { ChalkWriter } from './chalk-writer';

// ── Small shared renderers ───────────────────────────────────────────────────

/** One KaTeX fragment (no $ delimiters). */
function Tex({ tex, className }: { tex: string; className?: string }) {
  // The SAME object each render: React 19 re-sets innerHTML whenever the dangerouslySetInnerHTML
  // object changes, so a fresh { __html } rebuilt the maths on every player tick — a lit piece
  // (\htmlClass) lost its colour and faded back in about once a second (Adrian, 20 Oct 2026: "the
  // highlight for e and x flickers (some bug?)").
  const html = useMemo(
    () => ({ __html: katex.renderToString(tex, { ...katexOptions, displayMode: false }) }),
    [tex],
  );
  return <span className={className} dangerouslySetInnerHTML={html} />;
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

function TokenSpan({ t, bits, away = false, wait = null }: { t: StepToken; bits?: ElementBits | null; away?: false | 'gone' | 'held'; wait?: string | null }) {
  return (
    <span data-gone={away === 'gone' ? '1' : undefined} data-held={away === 'held' ? '1' : undefined}
      data-token-id={t.id || undefined}
      data-from={t.from || undefined}
      data-into={t.into ? [t.into, ...(t.also ?? []).map(a => a.into)].join(',') : undefined}
      data-rewrite={t.replaces ? '1' : undefined}
      data-also={t.also?.length ? t.also.map(a => `${a.from}:${a.into}`).join(',') : undefined}
      data-from-piece={t.fromPiece || undefined}
      data-into-wait={wait || undefined}
      data-key={bits?.key}
      className={`lsn-tok inline-block ${t.tight ? 'lsn-tok-tight' : ''} ${t.hl ? `lsn-hl ${TONE[t.hl].hl}` : ''} ${elCls(bits ?? null)}`}
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

type Rect = ReturnType<typeof offsetRect>;
/** Where a piece's source sat (box + letters), kept for when it has left the line. */
type PieceSpot = { box: Rect; glyph: { left: number; top: number } | null };
/** A clip's finished board fades for this long before the next board comes in. */
const SCENE_LEAVE_MS = 700;

/** Where the letters of `el` start inside its own box (layout px): a token's box also holds the
 *  line's strut, a piece inside a fraction holds none, so boxes alone land a piece a little off
 *  (Adrian, 19 Oct 2026: "the animation of moving the 5^(2x-1) is not smooth"). */
function glyphOffset(el: HTMLElement): { left: number; top: number } | null {
  const walk = document.createTreeWalker(el.querySelector('.katex-html') ?? el, NodeFilter.SHOW_TEXT);
  let first: Text | null = null, last: Text | null = null;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if ((n.textContent ?? '').trim()) { first ??= n as Text; last = n as Text; }
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.length);
  const g = range.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  if (!g.width || !b.width) return null;
  const k = el.offsetWidth ? b.width / el.offsetWidth : 1; // undo any scale on the board
  return { left: (g.left - b.left) / k, top: (g.top - b.top) / k };
}

/** A box in the container's own pixels, from the screen rects: offset sums go wrong for a piece
 *  deep inside a KaTeX fraction (its inline box is a sliver), so piece flights measure this way. */
function boxIn(el: HTMLElement, container: HTMLElement): Rect {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const z = container.offsetWidth ? c.width / container.offsetWidth : 1;
  return { left: (r.left - c.left) / z, top: (r.top - c.top) / z, width: r.width / z, height: r.height / z };
}
const mathText = (el: HTMLElement) => ((el.querySelector('.katex-html') ?? el).textContent ?? '').replace(/\s+/g, '');

/** A copy of a piece standing exactly where it was, ready to be moved by keyframes (the two-step
 *  rewrite below). Same look as flyClone's copy: the piece's colour, size, and KaTeX around it. */
function makeFlyer(container: HTMLElement, source: HTMLElement, at: Rect): HTMLElement {
  const raw = source.cloneNode(true) as HTMLElement;
  for (const a of ['data-gone', 'data-held', 'data-token-id', 'data-key']) raw.removeAttribute(a);
  raw.classList.remove('lsn-into-wait', 'lsn-landing');
  let el = raw;
  if (!raw.classList.contains('katex') && !raw.querySelector('.katex') && source.closest('.katex')) {
    el = document.createElement('span');
    el.className = 'katex';
    const html = document.createElement('span');
    html.className = 'katex-html';
    html.appendChild(raw);
    el.appendChild(html);
  }
  const css = getComputedStyle(source);
  el.setAttribute('aria-hidden', 'true');
  el.style.fontSize = css.fontSize;
  el.style.lineHeight = css.lineHeight;
  el.style.setProperty('color', css.color, 'important');
  el.style.textShadow = `0 0 10px ${css.color}`;
  for (const k of Array.from(el.querySelectorAll<HTMLElement>('.katex, .katex *'))) {
    if (!k.getAttribute('style')?.includes('color')) k.style.setProperty('color', 'inherit', 'important');
  }
  Object.assign(el.style, { position: 'absolute', left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`,
    height: `${at.height}px`, margin: '0', whiteSpace: 'nowrap', opacity: '1', pointerEvents: 'none', zIndex: '20', transformOrigin: 'top left' });
  container.appendChild(el);
  return el;
}

function flyClone(container: HTMLElement, source: HTMLElement, target: HTMLElement, was?: Rect,
  align?: { from?: PieceSpot | null }) {
  let s = was ?? offsetRect(source, container);
  let t = offsetRect(target, container);
  if (align) {
    s = align.from?.box ?? boxIn(source, container);
    t = boxIn(target, container);
  }
  if (s.width === 0 || t.width === 0) return;

  const raw = source.cloneNode(true) as HTMLElement;
  // A piece cut from inside a KaTeX token (`into` / `fromPiece`) needs its .katex ancestors, or its
  // power drops to the line ("5x" for 5^x): wrap the copy in them.
  let clone = raw;
  if (!raw.classList.contains('katex') && !raw.querySelector('.katex') && source.closest('.katex')) {
    clone = document.createElement('span');
    clone.className = 'katex';
    const html = document.createElement('span');
    html.className = 'katex-html';
    html.appendChild(raw);
    clone.appendChild(html);
    raw.classList.remove('lsn-into-wait', 'lsn-landing');
  }
  clone.removeAttribute('data-gone');
  clone.removeAttribute('data-held');
  clone.removeAttribute('data-token-id');
  clone.removeAttribute('data-key');
  clone.setAttribute('aria-hidden', 'true');
  for (const a of clone.getAnimations?.() ?? []) a.cancel();
  // The copy flies outside its line, so it would lose the chalk colour and turn black (Adrian,
  // 16 Oct 2026: "why did 9 become black during the movement?"): it carries the piece's own colour,
  // with a soft glow so the eye follows it. A clip flies slower and fades only as it lands
  // ("are you able to show 2 from 2log_3 3 moving to 3^2?").
  const css = getComputedStyle(source);
  const colour = css.color;
  // …and its line's text size, which it would also lose outside the line (the 9 came out small).
  clone.style.fontSize = css.fontSize;
  clone.style.lineHeight = css.lineHeight;
  clone.style.setProperty('color', colour, 'important');
  clone.style.textShadow = `0 0 10px ${colour}`;
  for (const k of Array.from(clone.querySelectorAll<HTMLElement>('.katex, .katex *'))) {
    if (!k.getAttribute('style')?.includes('color')) k.style.setProperty('color', 'inherit', 'important');
  }
  const slow = !!container.closest('[data-lsn-clip]');
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${s.left}px`,
    top: `${s.top}px`,
    width: `${s.width}px`,
    height: `${s.height}px`,
    margin: '0',
    whiteSpace: 'nowrap',   // the copy is exactly the piece's width: never let it break onto two lines
    opacity: '1',
    clipPath: 'none',
    transformOrigin: 'top left',
    transition: slow
      ? `transform 1100ms cubic-bezier(0.45, 0, 0.25, 1), opacity 180ms ease 1000ms`
      : `transform 620ms cubic-bezier(0.3, 0.85, 0.25, 1), opacity 200ms ease 440ms`,
    willChange: 'transform',
    pointerEvents: 'none',
    zIndex: '20',
  });
  container.appendChild(clone);
  target.classList.add('lsn-landing'); // destination stays invisible while the clone flies

  // Commit the start frame, then animate to the measured destination.
  void clone.getBoundingClientRect();
  // One scale for both directions, so a piece keeps its shape (Adrian, 16 Oct 2026: "why is the 9
  // flattened in transition? … it's just a translation right?"). It changes size only when its
  // landing spot is a different size (a 2 going up into a power); a landing spot with more in it
  // ("= 9" for a 9) takes the piece at the end where its text sits.
  // The size is the letters' own size (the last letter drawn), not the box's height: a token's box
  // also holds the line's strut, so box heights made a 9 shrink on its way to "= 9".
  const letter = (el: HTMLElement) => {
    const walk = document.createTreeWalker(el.querySelector('.katex-html') ?? el, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if ((n.textContent ?? '').trim()) last = n;
    const at = last?.parentElement;
    return at ? parseFloat(getComputedStyle(at).fontSize) || 0 : 0;
  };
  const fs = letter(source);
  const ft = letter(target);
  // A piece moving inside the working keeps its own size (5^{2x-1} down under 5^{x-1}).
  const k = align && mathText(source) === mathText(target) ? 1
    : fs > 0 && ft > 0 ? ft / fs : t.height / Math.max(s.height, 1);
  const w = s.width * k;
  const seen = (el: HTMLElement) => Array.from(el.querySelectorAll('.katex-html')).map(n => n.textContent ?? '').join('')
    .replace(/\s+/g, '');
  const st = seen(source);
  const tt = seen(target);
  const dx = (t.width - w < 2 || !st ? (t.width - w) / 2
    : tt.endsWith(st) && !tt.startsWith(st) ? t.width - w
    : tt.startsWith(st) ? 0 : (t.width - w) / 2) + t.left - s.left;
  let dy = t.top - s.top;
  let ddx = dx;
  if (align) {
    // A piece flight: land letter on letter, not box on box.
    const gs = align.from?.glyph ?? glyphOffset(source);
    const gt = glyphOffset(target);
    if (gs && gt) {
      ddx = t.left + gt.left - s.left - k * gs.left;
      dy = t.top + gt.top - s.top - k * gs.top;
    }
  }
  requestAnimationFrame(() => {
    clone.style.transform = `translate(${ddx}px, ${dy}px) scale(${k})`;
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
  window.setTimeout(finish, slow ? 1350 : 800); // belt-and-braces if transitionend is swallowed
}

/**
 * Line a clip's notes up under the tokens they explain (Adrian, 15 Oct 2026: "annotation on the
 * next line with arrow pointing leftwards seem to point to nowhere … put an up arrow so that arrow
 * points exactly where it needs to be"). The note's ↑ sits under the centre of its token; the words
 * follow it on the same row when the token is in the left half of the line, else the ↑ stands on
 * its own row and the words end at the right edge below it. Pure DOM measurement — no state.
 */
function placeClipNotes(cont: HTMLElement) {
  // Adrian, 15 Oct 2026: "the up arrow should point in the middle … and the log property should be
  // on one line, putting as two lines make it less clear". The ↑ sits under the MIDDLE of the
  // token(s) it explains; the words stay on ONE line — beside the ↑ when they fit, else on the line
  // under it, centred on the ↑ and kept inside the board, shrunk (never under 62 %) if still too long.
  const where = (el: HTMLElement) => `${el.className}|${el.getAttribute('style') ?? ''}|${el.querySelector('.lsn-note-arrow')?.getAttribute('style') ?? ''}|${el.querySelector('.lsn-note-text')?.getAttribute('style') ?? ''}`;
  const notes = Array.from(cont.querySelectorAll<HTMLElement>('.lsn-note-up[data-point-at]'));
  const before = notes.map(where);
  placeNotes(cont, notes);
  // A note the hand already wrote has moved: its ink must follow (the chalk re-lays itself).
  if (notes.some((el, i) => where(el) !== before[i])) cont.dispatchEvent(new Event('lsn-refit', { bubbles: true }));
}

function placeNotes(cont: HTMLElement, notes: HTMLElement[]) {
  for (const el of notes) {
    const row = el.closest<HTMLElement>('.lsn-note-row');   // (a note sits in a display: contents wrapper)
    const toks = (el.dataset.pointAt ?? '').split(' ').map(k => cont.querySelector<HTMLElement>(`[data-key="${k}"]`)).filter((t): t is HTMLElement => !!t);
    const arrow = el.querySelector<HTMLElement>('.lsn-note-arrow');
    const text = el.querySelector<HTMLElement>('.lsn-note-text');
    if (!row || !toks.length || !arrow || !text) continue;
    el.style.paddingLeft = '0px';
    el.style.fontSize = '';
    el.classList.remove('stack');
    arrow.style.marginLeft = '';
    text.style.marginLeft = '';
    const raw = row.getBoundingClientRect();
    if (!raw.width || !row.offsetWidth) continue;
    // Measure in the board's OWN units: the "Ask about this step" sheet scales the whole card down
    // (CSS scale), and a position set from scaled measurements moved the typed maths away from the
    // chalk the hand had already written (Adrian, 16 Oct 2026: "the add power words and the
    // property words are overlapping").
    const k = raw.width / row.offsetWidth;
    const rr = { left: raw.left / k, width: raw.width / k };
    const rects = toks.map(t => t.getBoundingClientRect()).filter(r => r.width > 0);
    if (!rects.length) continue;
    const cx = (Math.min(...rects.map(r => r.left)) + Math.max(...rects.map(r => r.right))) / 2 / k - rr.left;
    let tw = text.getBoundingClientRect().width / k;
    if (tw > rr.width) {
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${(base * Math.max(0.62, (rr.width / tw) * 0.98)).toFixed(2)}px`;
      tw = text.getBoundingClientRect().width / k;
    }
    const aw = arrow.getBoundingClientRect().width / k;
    const x = Math.max(0, cx - aw / 2);
    if (x + aw * 2 + tw <= rr.width) {
      el.style.paddingLeft = `${x.toFixed(1)}px`;
    } else {
      el.classList.add('stack');
      arrow.style.marginLeft = `${x.toFixed(1)}px`;
      text.style.marginLeft = `${Math.max(0, Math.min(rr.width - tw, cx - tw / 2)).toFixed(1)}px`;
    }
  }
}

/**
 * A clip's board must fit on the phone screen with the page at the top (Adrian's phone shots,
 * 15 Oct 2026: the top of the question or the last line hidden under a bar). When the stage would
 * run below the bottom bar, the working's maths is scaled down (--lsn-clip-fit, never under 0.56)
 * and the gaps between its lines with it (--lsn-gap-fit, faster — 15 Oct 2026, when the subtitle
 * strip took the board's foot);
 * words and notes keep their size. Measured, so it holds for any board on any phone.
 */
/**
 * A SCROLLING clip board (scene.scroll): the board fills the screen down to the slider and keeps the
 * maths at full size; when the newest line (and its notes) would go below the subtitle, the whole
 * board slides up — words, chalk ink and marks together (they share the zoom wrapper) — and the top
 * of the board fades where lines leave it. Adrian, 16 Oct 2026: "make the lines move up, like
 * scrolling up, then we don't have to change screen".
 */
/**
 * Look back up a scrolling board while the clip plays on (Adrian, 17 Oct 2026: "allow users to scroll
 * up the lines using their finger … WHILE the narration and animation is still on going"). A finger
 * drag (or the mouse wheel) moves the view; the voice and the writing never stop. A "⬇ Back to now"
 * button shows while the view is off the writing; it, or 4 s untouched, glides the board back.
 * A drag is never a tap: the card's tap-to-pause is swallowed after one.
 */
function attachBoardLook(cont: HTMLElement): () => void {
  const board = cont.closest<HTMLElement>('.lsn-board');
  const zoom = cont.closest<HTMLElement>('.lsn-zoom');
  if (!board || !zoom) return () => {};
  board.style.touchAction = 'pan-x pinch-zoom';
  board.style.position = board.style.position || 'relative';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '⬇ Back to now';
  btn.className = 'lsn-back-now';
  btn.style.display = 'none';
  board.appendChild(btn);
  const GLIDE = 'translate 650ms cubic-bezier(0.45, 0, 0.3, 1)';
  const auto = () => Number(cont.dataset.scrollAt ?? 0);
  const view = () => (cont.dataset.viewAt ? Number(cont.dataset.viewAt) : auto());
  let timer = 0;
  const show = (v: number, glide: boolean) => {
    const a = auto();
    // The very top is reachable: once the board has scrolled, its top strip fades (and the corner
    // plan sits there), so looking back may go past 0 until the first line clears it (Adrian, 26 Oct
    // 2026: "when i try to scroll up while video is playing > there is only a limit it can scroll up
    // to (i can't scroll up to the very top)").
    const top = -Number(cont.dataset.fadeTop ?? 0);
    const at = Math.max(top, Math.min(a, v));
    if (at >= a - 2) delete cont.dataset.viewAt; else cont.dataset.viewAt = String(at);
    zoom.style.transition = glide ? GLIDE : 'none';
    zoom.style.translate = `0 ${-(cont.dataset.viewAt ? at : a)}px`;
    btn.style.display = cont.dataset.viewAt ? '' : 'none';
    // Low on the board, just above the subtitle strip (Adrian: "the back to now can be placed lower").
    const subs = board.closest('.lsn-stage')?.querySelector<HTMLElement>('.lsn-subs');
    const sr = subs?.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    btn.style.bottom = `${Math.max(8, sr && sr.height ? br.bottom - sr.top + 6 : 12)}px`;
  };
  const back = () => { window.clearTimeout(timer); show(auto(), true); };
  const arm = () => { window.clearTimeout(timer); timer = window.setTimeout(back, 4000); };
  let startY = 0, startV = 0, down = false, moved = false;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || auto() <= 0 || (e.target as HTMLElement).closest('button')) return;
    down = true; moved = false; startY = e.clientY; startV = view();
  };
  const onMove = (e: PointerEvent) => {
    if (!down) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 8) return;
    moved = true;
    window.clearTimeout(timer);
    show(startV - dy, false);
  };
  const swallow = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
  const onUp = () => {
    if (!down) return;
    down = false;
    if (!moved) return;
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
    zoom.style.transition = GLIDE;
    if (cont.dataset.viewAt) arm();
  };
  const onWheel = (e: WheelEvent) => {
    if (auto() <= 0) return;
    e.preventDefault();
    show(view() + e.deltaY, false);
    if (cont.dataset.viewAt) arm(); else zoom.style.transition = GLIDE;
  };
  const onBtn = (e: MouseEvent) => { e.stopPropagation(); back(); };
  board.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  board.addEventListener('wheel', onWheel, { passive: false });
  btn.addEventListener('click', onBtn);
  return () => {
    window.clearTimeout(timer);
    board.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    board.removeEventListener('wheel', onWheel);
    btn.remove();
  };
}

/**
 * A curve sketch drawn in chalk under its line (StepGraph): axes, a dashed asymptote, the curve drawn
 * on as the line is written, then the labelled points (Adrian, 17 Oct 2026: "if you need to include
 * diagrams in the clips, please do so").
 */
function ClipGraph({ g, on }: { g: StepGraph; on: boolean }) {
  const W = 300, H = 165, P = 14;
  const sx = (x: number) => P + ((x - g.xMin) / (g.xMax - g.xMin)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y - g.yMin) / (g.yMax - g.yMin)) * (H - 2 * P);
  const pathOf = (fn: string) => {
    const f = graphFn(fn);
    if (!f) return '';
    let path = '', pen = false;
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const x = g.xMin + ((g.xMax - g.xMin) * i) / N;
      const y = f(x);
      if (!Number.isFinite(y) || y < g.yMin - 0.5 || y > g.yMax + 0.5) { pen = false; continue; }
      path += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(Math.max(g.yMin, Math.min(g.yMax, y))).toFixed(1)} `;
      pen = true;
    }
    return path;
  };
  // The main curve first, then any more on the same axes (the four basic shapes, 18 Oct 2026).
  const all = useMemo(() => [{ fn: g.fn, id: g.id, label: g.label, labelAt: g.labelAt, dash: false }, ...(g.curves ?? [])]
    .map(c => {
      const f = graphFn(c.fn);
      const ly = c.labelAt !== undefined && f ? f(c.labelAt) : NaN;
      return { ...c, d: pathOf(c.fn), lab: c.label && Number.isFinite(ly) ? { x: sx(c.labelAt!), y: sy(Math.max(g.yMin + 0.3, Math.min(g.yMax - 0.3, ly))), below: ly < 0 } : null };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(g)]);
  const x0 = g.xMin <= 0 && g.xMax >= 0 ? sx(0) : null;
  const y0 = g.yMin <= 0 && g.yMax >= 0 ? sy(0) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`lsn-graph ${on ? 'on' : ''}`} aria-hidden>
      {y0 !== null && <line x1={P - 6} y1={y0} x2={W - P + 6} y2={y0} className="lsn-graph-axis" />}
      {x0 !== null && <line x1={x0} y1={H - P + 6} x2={x0} y2={P - 6} className="lsn-graph-axis" />}
      {y0 !== null && <text x={W - P + 4} y={y0 - 5} className="lsn-graph-lab">x</text>}
      {x0 !== null && <text x={x0 + 5} y={P} className="lsn-graph-lab">y</text>}
      {g.asymptote?.x !== undefined && (
        <g className="lsn-graph-asy">
          <line x1={sx(g.asymptote.x)} y1={P - 4} x2={sx(g.asymptote.x)} y2={H - P + 4} />
          {g.asymptote.label && <text x={sx(g.asymptote.x) + 5} y={P + 10} className="lsn-graph-lab">{g.asymptote.label}</text>}
        </g>
      )}
      {g.asymptote?.y !== undefined && (
        <g className="lsn-graph-asy">
          <line x1={P - 4} y1={sy(g.asymptote.y)} x2={W - P + 4} y2={sy(g.asymptote.y)} />
          {g.asymptote.label && <text x={P + 2} y={sy(g.asymptote.y) - 5} className="lsn-graph-lab">{g.asymptote.label}</text>}
        </g>
      )}
      {all.map((c, i) => (
        <g key={i} data-token-id={c.id} data-ci={i} className="lsn-graph-c">
          <path d={c.d} pathLength={1} className="lsn-graph-curve" />
          {c.lab && <text x={c.lab.x} y={c.lab.below ? c.lab.y + 15 : c.lab.y - 7} textAnchor={c.lab.x > W / 2 ? 'end' : 'start'} className="lsn-graph-lab lsn-graph-clab">{c.label}</text>}
        </g>
      ))}
      {(g.points ?? []).map((pt, i) => (
        <g key={i} className="lsn-graph-pt">
          <circle cx={sx(pt.x)} cy={sy(pt.y)} r={3.6} />
          <text x={sx(pt.x) + (sx(pt.x) > W * 0.7 ? -8 : 7)} y={sy(pt.y) + (pt.y >= 0 ? -7 : 15)} textAnchor={sx(pt.x) > W * 0.7 ? 'end' : 'start'} className="lsn-graph-lab">{pt.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** A graph label with its power raised: "e^−x" draws e with −x up as a power (the font has no
 *  raised minus, so "e⁻ˣ" lost its minus on a phone, 20 Oct 2026). */
function SvgPower({ text }: { text: string }) {
  const k = text.indexOf('^');
  if (k < 0) return <>{text}</>;
  return <>{text.slice(0, k)}<tspan dy="-0.45em" fontSize="0.72em">{text.slice(k + 1)}</tspan></>;
}

/** One curve as an SVG path in a W×H box over the window. */
function plotPath(fn: string, win: { xMin: number; xMax: number; yMin: number; yMax: number }, W: number, H: number, P: number, clip?: { yMin: number; yMax: number }): string {
  const w = win;
  const lo = clip?.yMin ?? win.yMin, hi = clip?.yMax ?? win.yMax;
  const f = graphFn(fn);
  if (!f) return '';
  const sx = (x: number) => P + ((x - w.xMin) / (w.xMax - w.xMin)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y - w.yMin) / (w.yMax - w.yMin)) * (H - 2 * P);
  // The curve stops where it leaves the window — cut at the edge, never run flat along it (the
  // flat hooks at the corner shapes' ends, 20 Oct 2026).
  let path = '', pen = false, px = NaN, py = NaN;
  const inside = (y: number) => Number.isFinite(y) && y >= lo && y <= hi;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const b = (y0 > hi || y1 > hi) ? hi : lo;
    const t = (b - y0) / (y1 - y0);
    return `${sx(x0 + (x1 - x0) * t).toFixed(1)} ${sy(b).toFixed(1)}`;
  };
  for (let i = 0; i <= 240; i++) {
    const x = w.xMin + ((w.xMax - w.xMin) * i) / 240;
    const y = f(x);
    if (inside(y)) {
      if (!pen) path += `M${Number.isFinite(py) && !inside(py) ? edge(px, py, x, y) : `${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`} `;
      path += `L${sx(x).toFixed(1)} ${sy(y).toFixed(1)} `;
      pen = true;
    } else {
      if (pen && Number.isFinite(y)) path += `L${edge(px, py, x, y)} `;
      pen = false;
    }
    px = x; py = y;
  }
  return path;
}

/** The curve's equation beside it (Adrian, 26 Oct 2026: "label the graph"): "y = (a)/(b)" is drawn
 *  as a stacked fraction centred at (x, y); anything else as one line. */
function SketchLabel({ text, x, y }: { text: string; x: number; y: number }) {
  const m = text.match(/^(.*?=\s*)\((.+)\)\/\((.+)\)$/);
  if (!m) return <text x={x} y={y} textAnchor="middle" className="lsn-graph-lab lsn-sketch-label">{text}</text>;
  const [, pre, num, den] = m;
  const fw = Math.max(num.length, den.length) * 6.6 + 4;   // the fraction's width, 13 px italic serif
  const pw = pre.length * 6.2;
  const fx = x + pw / 2;                                    // the fraction's centre
  return (
    <g className="lsn-sketch-label">
      <text x={fx - fw / 2 - 3} y={y + 4.5} textAnchor="end" className="lsn-graph-lab">{pre.trim()}</text>
      <text x={fx} y={y - 4} textAnchor="middle" className="lsn-graph-lab">{num}</text>
      <line x1={fx - fw / 2} y1={y} x2={fx + fw / 2} y2={y} />
      <text x={fx} y={y + 13} textAnchor="middle" className="lsn-graph-lab">{den}</text>
    </g>
  );
}

/** The side sketch (Adrian, 18 Oct 2026): the basic shapes small in the corner (each lit by its id),
 *  and under them the working sketch, built stage by stage — empty axes, the dashed asymptote, the
 *  shape lifted out of the corner and enlarged onto the axes, slid to its place, then each point. */
function SketchPanel({ sk, stages }: { sk: SceneSketch; stages: string[] }) {
  const has = (s: string) => stages.includes(s);
  const iw = sk.inset ? { xMin: sk.inset.xMin, xMax: sk.inset.xMax, yMin: sk.inset.yMin, yMax: sk.inset.yMax } : { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  // Big enough to read on a phone (Adrian, 20 Oct 2026: "graph is hard to see, y=e^x can hardly been
  // seen (too small) - make sure graphs are clearly seen").
  const IW = 180, IH = 118, IP = 8;
  const W = 200, H = 230, P = 14;
  const sx = (x: number) => P + ((x - sk.xMin) / (sk.xMax - sk.xMin)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y - sk.yMin) / (sk.yMax - sk.yMin)) * (H - 2 * P);
  const isx = (x: number) => IP + ((x - iw.xMin) / (iw.xMax - iw.xMin)) * (IW - 2 * IP);
  const isy = (y: number) => IH - IP - ((y - iw.yMin) / (iw.yMax - iw.yMin)) * (IH - 2 * IP);
  const insetCurves = sk.inset ? [{ fn: sk.inset.fn, id: sk.inset.id, label: sk.inset.label, labelAt: sk.inset.labelAt }, ...(sk.inset.curves ?? [])] : [];
  // The shape is cut where it would leave the window AFTER its shift (it slides up by dy).
  const cut = { yMin: sk.yMin - (sk.shift?.dy ?? 0), yMax: sk.yMax - (sk.shift?.dy ?? 0) };
  const shapeD = useMemo(() => plotPath(sk.shape, sk, W, H, P, cut), [sk]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dx = sk.shift?.dx ? sx(sk.shift.dx) - sx(0) : 0;
  const dy = sk.shift?.dy ? sy(sk.shift.dy) - sy(0) : 0;
  // The lift: the shape starts exactly over its curve in the corner and grows onto the big axes.
  const flyRef = useRef<SVGGElement>(null);
  const insetRef = useRef<SVGSVGElement>(null);
  const flown = useRef<boolean | null>(null);
  const shapeOn = has('shape');
  useIsoLayoutEffect(() => {
    if (flown.current === null) { flown.current = shapeOn; return; }   // a board drawn afresh: no flight
    if (!shapeOn || flown.current) return;
    flown.current = true;
    const g = flyRef.current;
    const src = sk.from ? insetRef.current?.querySelector<SVGGraphicsElement>(`[data-token-id="${CSS.escape(sk.from)}"] path`) : null;
    if (!g || !src || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = g.getBoundingClientRect();
    const fr = src.getBoundingClientRect();
    const svg = g.ownerSVGElement;
    if (!svg || !to.width || !fr.width) return;
    const k = W / svg.getBoundingClientRect().width;   // screen px → this SVG's units
    const s = fr.width / to.width;
    g.animate([
      { transform: `translate(${(fr.left - to.left) * k}px, ${(fr.top - to.top) * k}px) scale(${s})`, opacity: 1 },
      { transform: 'none', opacity: 1 },
    ], { duration: 1300, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' });
  }, [shapeOn]);
  // The stretch (`to`): on the stretch stage the lifted shape becomes the stretched curve, drawn as a
  // blend of the two so it grows into place (y = e⁻ˣ → y = 2e⁻³ˣ); the shift stage then slides it.
  const toD = useMemo(() => (sk.to ? plotPath(sk.to, sk, W, H, P, cut) : ''), [sk]);   // eslint-disable-line react-hooks/exhaustive-deps
  const curveRef = useRef<SVGPathElement>(null);
  const stretched = useRef<boolean | null>(null);
  const shiftOn = has('stretch');
  useIsoLayoutEffect(() => {
    if (!sk.to) return;
    if (stretched.current === null || !shapeOn) { stretched.current = shiftOn; return; }   // drawn afresh: no stretch
    if (!shiftOn) { stretched.current = false; return; }
    if (stretched.current) return;
    stretched.current = true;
    const path = curveRef.current;
    if (!path || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now(), MS = 1300;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / MS);
      const e = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
      path.setAttribute('d', t >= 1 ? toD : plotPath(`(${(1 - e).toFixed(4)})*(${sk.shape})+(${e.toFixed(4)})*(${sk.to})`, sk, W, H, P, cut));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    path.setAttribute('d', shapeD);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shiftOn]);
  // The line y = c at its newest height, and where it meets the curve as drawn (stretched, slid).
  const hlStage = [...stages].reverse().find(st => /^l\d+$/.test(st));
  // (A few hundred cheap evaluations, only once the line is on — no memo needed.)
  const hl = (() => {
    if (!sk.hline || !hlStage) return null;
    const c = sk.hline.at[Number(hlStage.slice(1))];
    if (typeof c !== 'number') return null;
    const f0 = graphFn(sk.to && has('stretch') ? sk.to : sk.shape);
    const sdx = has('shift') ? sk.shift?.dx ?? 0 : 0, sdy = has('shift') ? sk.shift?.dy ?? 0 : 0;
    const g = (x: number) => (f0 ? f0(x - sdx) + sdy - c : NaN);
    const hits: number[] = [];
    let px = NaN, py = NaN;
    for (let i = 0; i <= 600; i++) {
      const x = sk.xMin + ((sk.xMax - sk.xMin) * i) / 600, y = g(x);
      if (Number.isFinite(y) && Number.isFinite(py) && py * y <= 0 && Math.abs(py - y) < 1) {
        let a = px, b = x;
        for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (g(a) * g(m) <= 0) b = m; else a = m; }
        if (!hits.length || Math.abs(a - hits[hits.length - 1]) > 1e-3) hits.push(a);
      }
      px = x; py = y;
    }
    return { c, hits, stage: hlStage };
  })();
  return (
    <div className="lsn-sketch">
      {has('inset') && sk.inset && (
        <svg ref={insetRef} viewBox={`0 0 ${IW} ${IH}`} className="lsn-graph lsn-sketch-inset on" aria-hidden>
          <line x1={IP} y1={isy(0)} x2={IW - IP} y2={isy(0)} className="lsn-graph-axis" />
          <line x1={isx(0)} y1={IH - IP} x2={isx(0)} y2={IP} className="lsn-graph-axis" />
          {insetCurves.map((c, i) => {
            const f = graphFn(c.fn);
            const ly = c.labelAt !== undefined && f ? f(c.labelAt) : NaN;
            return (
              <g key={i} data-token-id={c.id} data-ci={i} className="lsn-graph-c">
                <path d={plotPath(c.fn, iw, IW, IH, IP)} pathLength={1} className="lsn-graph-curve" />
                {c.label && Number.isFinite(ly) && (
                  // Each label in its own corner of the box — the corner its curve heads for (right or
                  // left of the y-axis, above or below the x-axis), wholly inside the box (Adrian, 20 Oct
                  // 2026: "the equations of the graphs are covered in the mobile version").
                  <text x={isx(c.labelAt!) > isx(0) ? IW - IP - 3 : IP + 3}
                    y={ly > 0 ? IP + 14 : IH - IP - 4}
                    textAnchor={isx(c.labelAt!) > isx(0) ? 'end' : 'start'} className="lsn-graph-lab lsn-graph-clab"><SvgPower text={c.label} /></text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {has('axes') && (
        <svg viewBox={`0 0 ${W} ${H}`} className="lsn-graph lsn-sketch-main on" aria-hidden>
          <line x1={P - 4} y1={sy(0)} x2={W - P + 4} y2={sy(0)} className="lsn-graph-axis" />
          <line x1={sx(0)} y1={H - P + 4} x2={sx(0)} y2={P - 4} className="lsn-graph-axis" />
          {/* x under the axis: a curve that hugs the axis from above never runs into it (20 Oct 2026). */}
          <text x={W - P + 2} y={sy(0) + 15} textAnchor="end" className="lsn-graph-lab">x</text>
          <text x={sx(0) + 5} y={P + 2} className="lsn-graph-lab">y</text>
          {has('asymptote') && sk.asymptote?.x !== undefined && (
            <g className="lsn-sketch-asy">
              <line x1={sx(sk.asymptote.x)} y1={P - 4} x2={sx(sk.asymptote.x)} y2={H - P + 4} />
              {sk.asymptote.label && <text x={sx(sk.asymptote.x) + 4} y={P + 9} className="lsn-graph-lab">{sk.asymptote.label}</text>}
            </g>
          )}
          {has('edge') && sk.edge && (
            <g className="lsn-sketch-asy">
              <line x1={sx(sk.edge.x)} y1={P - 4} x2={sx(sk.edge.x)} y2={H - P + 4} />
              <text x={sx(sk.edge.x) + 3} y={P + 9} className="lsn-graph-lab">{sk.edge.label}</text>
            </g>
          )}
          {has('asymptote') && sk.asymptote?.y !== undefined && (
            <g className="lsn-sketch-asy" style={{ transform: has('shift') ? `translate(0px, ${dy}px)` : 'none', transition: 'transform 1200ms cubic-bezier(0.45, 0, 0.3, 1)' }}>
              <line x1={P - 4} y1={sy(sk.asymptote.y)} x2={W - P + 4} y2={sy(sk.asymptote.y)} />
              {sk.asymptote.label && <text x={P} y={sy(sk.asymptote.y) + 15} className="lsn-graph-lab">{has('shift') && sk.asymptote.labelAfter ? sk.asymptote.labelAfter : sk.asymptote.label}</text>}
            </g>
          )}
          {shapeOn && (
            <g style={{ transform: has('shift') ? `translate(${dx}px, ${dy}px)` : 'none', transition: 'transform 1200ms cubic-bezier(0.45, 0, 0.3, 1)' }}>
              <g ref={flyRef} className="lsn-sketch-shape" style={{ transformBox: 'fill-box', transformOrigin: '0 0' }}>
                {/* No corner shape to lift (no `from`): the pen draws the curve on, left to right. */}
                <path ref={curveRef} d={sk.to && shiftOn ? toD : shapeD} pathLength={sk.from ? undefined : 1} className={`lsn-sketch-curve${sk.from ? '' : ' lsn-sketch-draw'}`} data-ci={Math.max(0, insetCurves.findIndex(c => c.id === sk.from))} />
              </g>
            </g>
          )}
          {shapeOn && sk.label && <SketchLabel text={sk.label.text} x={sx(sk.label.x)} y={sy(sk.label.y)} />}
          {(sk.points ?? []).map((pt, i) => has(`p${i}`) && (
            <g key={i} className="lsn-sketch-pt">
              <circle cx={sx(pt.x)} cy={sy(pt.y)} r={3.4} />
              <text x={sx(pt.x) + (sx(pt.x) > W * 0.6 ? -6 : 6)} y={sy(pt.y) + (pt.y > 0.05 ? -6 : 13)} textAnchor={sx(pt.x) > W * 0.6 ? 'end' : 'start'} className="lsn-graph-lab">{pt.label}</text>
            </g>
          ))}
          {hl && (
            // The line y = c, one line that SLIDES to each new height; a dot wherever it then meets
            // the curve (Adrian, 25 Oct 2026: "think y = c horizontal line must be 4 and above").
            <g className="lsn-sketch-hline">
              <g style={{ transform: `translate(0px, ${sy(hl.c) - sy(0)}px)`, transition: 'transform 650ms cubic-bezier(0.45, 0, 0.3, 1)' }}>
                <line x1={P - 4} y1={sy(0)} x2={W - P + 4} y2={sy(0)} />
                {/* At the LEFT end: the curve's own label sits to the right (26 Oct 2026, "c = 1" landed on it). */}
                <text x={P - 2} y={sy(0) - 6} className="lsn-graph-lab">{sk.hline!.labels?.[Number(hl.stage.slice(1))] ?? sk.hline!.label}</text>
              </g>
              {hl.hits.map((x, i) => (
                <circle key={`${hl.stage}-${i}`} cx={sx(x)} cy={sy(hl.c)} r={4.2} className="lsn-sketch-hit" />
              ))}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

/** Board elements a scrolling board has already seen written (so only a NEW one pulls it into view). */
const seenOnBoard = new WeakSet<Element>();

function scrollClipBoard(cont: HTMLElement) {
  // A piece is moving (the 2 going up into the power): that is the only thing that moves — the board
  // slides after it lands (Adrian, 16 Oct 2026: "from 2 going up to power 2, should not have any frame
  // shift … then you can shift the frame").
  if (cont.querySelector('.lsn-landing')) {
    const retry = Number(cont.dataset.scrollRetry ?? 0);
    if (retry) window.clearTimeout(retry);
    cont.dataset.scrollRetry = String(window.setTimeout(() => { delete cont.dataset.scrollRetry; scrollClipBoard(cont); }, 200));
    return;
  }
  const stage = cont.closest<HTMLElement>('.lsn-stage');
  const boardEl = cont.closest<HTMLElement>('.lsn-board');
  const zoom = cont.closest<HTMLElement>('.lsn-zoom');
  if (!stage || !boardEl || !zoom) return;
  if (!stage.closest('[data-chat-sheet]')) {
    let bar = window.innerHeight;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('nav, [data-bottom-bar], body > div *'))) {
      if (getComputedStyle(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top > window.innerHeight * 0.6 && r.top < bar) bar = r.top;
    }
    const scrub = document.querySelector<HTMLElement>('.lsn-scrub');
    const reserve = scrub ? scrub.getBoundingClientRect().height + 8 : 0;
    const br = boardEl.getBoundingClientRect();
    // Below the board sits only the stage's own bottom padding (the subtitle strip lives in it). Not
    // the stage's bottom: the stage has a min-height, so a short board left it taller than the board,
    // that gap was counted as taken and the board shrank to its 240 px floor (18 Oct 2026, Log scales:
    // the lines slid off the top early, an empty band above the subtitle).
    const cs = getComputedStyle(stage);
    const below = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
    const h = Math.max(240, Math.floor(bar - 8 - reserve - below - (br.top + window.scrollY)));
    boardEl.style.height = `${h}px`;
    boardEl.style.flex = 'none';   // .lsn-board is flex: 1 — a flex-basis would let it grow with its lines
  }
  boardEl.style.overflow = 'hidden';
  // Smaller maths on a scrolling board, so the lines before stay in view (Adrian, 18 Oct 2026: "font
  // is too large, so when narration goes to the next part, previous parts can't be seen").
  if (!stage.closest('[data-chat-sheet]')) {
    stage.style.setProperty('--lsn-clip-fit', '0.74');
    stage.style.setProperty('--lsn-gap-fit', '0.6');
  }
  // The board clips what scrolls off it — but a mark drawn round a token at the left edge (the answer's
  // box) reaches a little past the working (Adrian, 17 Oct 2026: "pink box seems partially covered on
  // the left"). The clip edge sits 16 px out into the card's own margin; the working stays put.
  boardEl.style.marginInline = '-16px';
  boardEl.style.paddingInline = '16px';
  // How far down the board's newest writing reaches, in the board's own (unslid) frame.
  const zr = zoom.getBoundingClientRect();
  let low = 0;
  for (const el of Array.from(zoom.querySelectorAll<HTMLElement>('.lsn-line.on, .lsn-note.on'))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) low = Math.max(low, r.bottom - zr.top);
  }
  const subs = stage.querySelector<HTMLElement>('.lsn-subs');
  const keepClear = (subs?.offsetHeight ?? 0) + 18;
  const room = boardEl.clientHeight - zoom.offsetTop - keepClear;
  let offset = Math.max(0, Math.ceil(low - room));
  // Like someone scrolling: in play the board only ever moves UP (notes leaving a line never pull it
  // back down — Adrian, 16 Oct 2026: "should see the scroll instead of a jump"); stepping back
  // (← or the slider) lets it come back down.
  const was = Number(cont.dataset.scrollAt ?? 0);
  if (offset < was && cont.dataset.scrollBack !== '1') offset = was;
  delete cont.dataset.scrollBack;
  // Whatever was JUST written must be in full view, even on an older line that has slid up into the
  // fade (Adrian, 17 Oct 2026: "when narrator says reject and the pink rejects appears, it's partly
  // hidden"): the board scrolls back down just enough to show it.
  // (A board just drawn — the start, or a seek — has seen everything on it already.)
  // Clear of the top fade (36 px) AND of a circle drawn round the line (it reaches ~12 px above it).
  // The plan floating in the top-right corner (`corner`) owns the top strip of the board: once the
  // board has scrolled, nothing sits under it — the fade starts below it, and a line the voice talks
  // about is kept below it (20 Oct 2026, Laws of indices: "seven squared" was said with its line half
  // under the plan box).
  const cornerEl = stage.querySelector<HTMLElement>('[data-lsn-corner]');
  const band = cornerEl ? Math.max(0, Math.ceil(cornerEl.getBoundingClientRect().bottom - boardEl.getBoundingClientRect().top)) : 0;
  const FADE = 64 + band;
  const first = cont.dataset.scrollSeen !== '1';
  cont.dataset.scrollSeen = '1';
  let fresh = Infinity;
  for (const el of Array.from(zoom.querySelectorAll<HTMLElement>('.lsn-el.on[data-key]'))) {
    if (seenOnBoard.has(el)) continue;
    seenOnBoard.add(el);
    if (first) continue;
    // A note brings its LINE into view too (a Watch out under an older line: the line it is about
    // must show, not only the note).
    const r = (el.closest<HTMLElement>('.lsn-line') ?? el).getBoundingClientRect();
    if (r.height > 0) fresh = Math.min(fresh, r.top - zr.top);
  }
  if (fresh < offset + FADE) offset = Math.max(0, Math.floor(fresh - FADE));
  // The current part's own targets (EquationStepsView sets data-focus): keep every one between the
  // fade and the subtitle — scrolling back down if needed; when they cannot all fit, the lowest wins.
  try {
    const f = JSON.parse(cont.dataset.focus || '{}') as { ids?: string[]; lines?: number[] };
    let top = Infinity, bottom = -Infinity;
    const take = (el: Element | null) => {
      const line = el?.closest('.lsn-line') ?? el;
      const r = (el as HTMLElement | null)?.getBoundingClientRect();
      const lr = (line as HTMLElement | null)?.getBoundingClientRect();
      if (!r || !lr || r.height === 0) return;
      top = Math.min(top, lr.top - zr.top);
      bottom = Math.max(bottom, r.bottom - zr.top);
    };
    for (const id of f.ids ?? []) for (const el of Array.from(zoom.querySelectorAll(`[data-token-id="${CSS.escape(id)}"]`))) take(el);
    for (const n of f.lines ?? []) take(zoom.querySelector(`[data-line="${n}"]`));
    if (top < Infinity) {
      const lo = Math.ceil(bottom - room);
      // A target near the very top needs no room for the fade: at offset 0 there is no fade at all
      // (20 Oct 2026, Laws of indices on a short laptop window: "First, the negative power" was said
      // with the question line half off the top — the 64 px kept for the fade made the beat's two
      // targets "not fit", so the lowest won).
      const hi = top < FADE ? 0 : Math.floor(top - FADE);
      if (lo <= hi) offset = Math.min(Math.max(offset, lo), hi);
      else offset = lo;
      offset = Math.max(0, offset);
    }
  } catch { /* no focus: the writing alone decides */ }
  cont.dataset.scrollAt = String(offset);
  // A student looking back up the working with a finger (attachBoardLook) keeps their view while the
  // writing goes on below; "Back to now" (or 4 s of no touching) returns the board to the writing.
  const look = cont.dataset.viewAt;
  const at = look !== undefined && look !== '' ? Math.min(Number(look), offset) : offset;
  zoom.style.translate = at ? `0 ${-at}px` : '0 0';
  // The first placement (a fresh board, or one drawn afresh by a seek) is instant; after that it glides.
  if (!zoom.style.transition) requestAnimationFrame(() => { zoom.style.transition = 'translate 1100ms cubic-bezier(0.45, 0, 0.3, 1)'; });
  const fade = offset ? `linear-gradient(to bottom, transparent 0, transparent ${band}px, #000 ${band + 36}px)` : '';
  cont.dataset.fadeTop = String(offset ? band + 36 : 0);
  boardEl.style.maskImage = fade;
  boardEl.style.setProperty('-webkit-mask-image', fade);
}

function fitClipBoard(cont: HTMLElement) {
  const stage = cont.closest<HTMLElement>('.lsn-stage');
  if (!stage) return;
  // The phone chat sheet is open: the player shrinks the whole card itself (sheetScale).
  if (stage.closest('[data-chat-sheet]')) return;
  let bar = window.innerHeight;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('nav, [data-bottom-bar], body > div *'))) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top > window.innerHeight * 0.6 && r.top < bar) bar = r.top;
  }
  // The slider sits under the board, like a video's progress bar (Adrian, 15 Oct 2026: "put the
  // slider below the clip"): leave room for it (its height + its 8 px gap) above the bottom bar.
  const scrub = document.querySelector<HTMLElement>('.lsn-scrub');
  const reserve = scrub ? scrub.getBoundingClientRect().height + 8 : 0;
  // The gaps between lines shrink with the maths, and faster (most of a board's height is gaps):
  // 1 at full size, 0.5 when the maths reaches its floor — then the gaps alone go on down to 0.25.
  const gapFor = (fit: number) => Math.max(0.5, (fit - 0.4) / 0.6);
  // The maths may come down to 0.56 (≈ 14 px on a phone) since the board also carries the subtitle strip.
  const floor = 0.56;
  for (let pass = 0; pass < 8; pass++) {
    const cur = Number(stage.style.getPropertyValue('--lsn-clip-fit')) || 1;
    const gap = Number(stage.style.getPropertyValue('--lsn-gap-fit')) || 1;
    const sr = stage.getBoundingClientRect();
    const over = sr.bottom + window.scrollY - (bar - 8 - reserve);
    const lines = cont.getBoundingClientRect().height;
    if (over <= 1 && cur >= 1) return;
    if (over > 1 && cur <= floor + 0.001) {
      if (gap <= 0.251) return;
      stage.style.setProperty('--lsn-gap-fit', Math.max(0.25, gap - 0.08).toFixed(3));
      continue;
    }
    if (over <= 1 && gap < gapFor(cur) - 0.01) {
      if (over > -24) return;  // room for a little more gap only when there is clearly room
      stage.style.setProperty('--lsn-gap-fit', Math.min(gapFor(cur), gap + 0.08).toFixed(3));
      continue;
    }
    const want = over > 1 ? Math.max(floor, cur * (lines - over) / lines) : Math.min(1, cur * 1.02);
    if (Math.abs(want - cur) < 0.01) return;
    stage.style.setProperty('--lsn-clip-fit', want.toFixed(3));
    stage.style.setProperty('--lsn-gap-fit', gapFor(want).toFixed(3));
  }
}

function EquationStepsView({ scene, step, reduced, timed, board, clip = false }: {
  scene: EquationStepsScene; step: number; reduced: boolean; timed: boolean; board: BoardState | null;
  /** A clip: a note under a line points UP at the token it explains (placeClipNotes). */
  clip?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRevealed = useRef(0);
  // Seeded with what has already moved: a board drawn afresh mid-clip (a seek back) re-flies nothing.
  const prevMoved = useRef<Set<string>>(new Set(board?.moved ?? []));
  const revealed = step + 1;

  // A line rewritten in place changes width: fit the rows and the board again BEFORE any flight
  // measures its landing spot (this effect is declared first, so it runs first).
  const goneKey = board ? scene.steps.map((st, i) => st.tokens.map((_, ti) => ({ gone: 1, held: 2 } as Record<string, number>)[String(tokenAway(board, scene, i, ti))] ?? 0).join('')).join('|') : '';
  const firstGone = useRef(goneKey);
  // A piece that just went up into a power keeps its room while it flies, so nothing else moves; once
  // it has landed the room closes in one glide (Adrian, 17 Oct 2026: "just 2 move" … then no gap left).
  // A board drawn afresh (a seek) shows it closed already.
  const heldSeen = useRef<Set<Element> | null>(null);
  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const held = Array.from(cont.querySelectorAll<HTMLElement>('.lsn-tok[data-held]'));
    if (!heldSeen.current) { heldSeen.current = new Set(held); return; }
    for (const el of held) {
      if (heldSeen.current.has(el)) continue;
      heldSeen.current.add(el);
      if (!lastAt.current.get(el)?.width || reduced) continue;
      el.style.setProperty('display', 'inline-block', 'important');
      const w = lastAt.current.get(el)!.width;
      const gap = parseFloat(getComputedStyle(el.parentElement ?? el).columnGap) || 0;
      window.setTimeout(() => {
        if (!el.isConnected) return;
        el.style.overflow = 'hidden';
        const a = el.animate([{ width: `${w}px`, marginRight: '0px' }, { width: '0px', marginRight: `${-gap}px` }],
          { duration: 600, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'forwards' });
        a.onfinish = () => {
          el.style.removeProperty('display'); el.style.removeProperty('overflow'); a.cancel();
          placeClipNotes(cont);
        };
      }, 1200);
    }
    for (const el of Array.from(heldSeen.current)) if (!el.isConnected || !el.hasAttribute('data-held')) heldSeen.current.delete(el);
  });

  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont || goneKey === firstGone.current) return;
    firstGone.current = goneKey;
    cont.dispatchEvent(new Event('lsn-refit', { bubbles: true }));
    if (clip) {
      if (scene.scroll) requestAnimationFrame(() => scrollClipBoard(cont)); else fitClipBoard(cont);
      placeClipNotes(cont);
    }
  }, [goneKey, clip, scene.scroll]);
  const lastSeq = useRef(0);
  // A finger (or wheel) can look back up a scrolling board while it plays.
  useEffect(() => {
    const cont = containerRef.current;
    if (!clip || !scene.scroll || !cont) return;
    return attachBoardLook(cont);
  }, [clip, scene.scroll]);
  // A scrolling board follows the writing: each beat may slide it up.
  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!clip || !scene.scroll || !cont || !board) return;
    // Stepped back: the board may scroll back down to where that part was.
    if (board.seq < lastSeq.current) cont.dataset.scrollBack = '1';
    lastSeq.current = board.seq;
    // What this part of the voice talks about — everything its actions touch (written, lit, circled,
    // noted, and where a moving piece STARTS) — must be in full view while it is said (Adrian, 17 Oct
    // 2026: "when -nx power flies down from the top it is already obscure partially … make sure
    // content is not obscure (even partially) when narrator is talking about it").
    const beat = (scene.beats ?? [])[step];
    const ids = new Set<string>();
    const lines = new Set<number>();
    const ref = (v: unknown) => { for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) if (typeof x === 'string') ids.add(x); };
    for (const a of beat?.do ?? []) {
      const r = a as unknown as Record<string, unknown>;
      if (typeof r.step === 'number') lines.add(r.step);
      ref(r.token); ref(r.near); ref(r.span); ref(r.from);
    }
    cont.dataset.focus = JSON.stringify({ ids: [...ids], lines: [...lines] });
    // After this commit's flights have started (their effect runs later in the commit), so a slide
    // can see a piece in the air and wait for it.
    const raf = requestAnimationFrame(() => scrollClipBoard(cont));
    return () => cancelAnimationFrame(raf);
  });
  // Where each token last sat: a piece rewritten out of its line ("2 log₃3" → "log₃3²") takes no
  // room by the time it flies, so it flies from where it was.
  const lastAt = useRef<Map<Element, Rect>>(new Map());
  // …and where its letters sat inside that box, for the tokens a piece flies from (see glyphOffset).
  const lastGlyph = useRef<Map<Element, PieceSpot>>(new Map());
  const pieceSources = useMemo(() => new Set(scene.steps.flatMap(st => st.tokens.flatMap(t =>
    t.into || t.fromPiece ? [t.from ?? '', ...(t.also ?? []).map(a => a.from)] : []))), [scene.steps]);
  // Fly a token from the earlier line that declared its `from` id.
  const fly = useCallback((cont: HTMLElement, fromId: string, lineIdx: number) => {
    const line = cont.querySelector<HTMLElement>(`[data-line="${lineIdx}"]`);
    if (!line) return;
    for (const tok of Array.from(line.querySelectorAll<HTMLElement>(`[data-from="${CSS.escape(fromId)}"]`))) {
      // An `into` token: only its piece flies in (5^{2x-1} down under 5^{x-1}).
      const into = tok.dataset.into?.split(',')[0]; // the first piece is this token's own; the rest are `also`
      const target = (into && tok.querySelector<HTMLElement>(`.lsn-pc-${CSS.escape(into)}`)) || tok;
      const source = Array.from(cont.querySelectorAll<HTMLElement>(`[data-token-id="${CSS.escape(fromId)}"]`))
        .find(el => {
          const l = el.closest('[data-line]');
          // An earlier line, or an earlier token of the same line (the 2 going up into the power).
          return l && Number(l.getAttribute('data-line')) <= lineIdx && el !== tok;
        });
      const fp = tok.dataset.fromPiece;
      const start = (source && fp && source.querySelector<HTMLElement>(`.lsn-pc-${CSS.escape(fp)}`)) || source;
      const piece = !!into || !!fp;
      const gone = start === source && !!source?.dataset.gone;
      // A rewrite in place with a partner piece moves in TWO steps (Adrian, 19 Oct 2026: "move
      // 5^(2x-1) under 5^(x-1) first, with 2^(x+2) and 5^(x-1) [still], once its under, THEN move the
      // expressions to make it nicer (to the end stage)"): the piece goes under its partner where
      // the partner stands; then the made fraction and the = slide together to the final line.
      const [pairFrom, pairInto] = (tok.dataset.also ?? '').split(',')[0]?.split(':') ?? [];
      const partner = pairFrom ? cont.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(pairFrom)}"]`) : null;
      const partnerDst = pairInto ? tok.querySelector<HTMLElement>(`.lsn-pc-${CSS.escape(pairInto)}`) : null;
      if (tok.dataset.rewrite && source && start === source && target !== tok && partner && partnerDst) {
        const spot = (el: HTMLElement): PieceSpot => (el.dataset.gone ? lastGlyph.current.get(el) : undefined)
          ?? { box: el.dataset.gone ? (lastAt.current.get(el) ?? offsetRect(el, cont)) : boxIn(el, cont), glyph: glyphOffset(el) };
        const delta = (from: PieceSpot, dst: HTMLElement) => {
          const t = boxIn(dst, cont);
          const gt = glyphOffset(dst);
          return from.glyph && gt
            ? { x: t.left + gt.left - from.box.left - from.glyph.left, y: t.top + gt.top - from.box.top - from.glyph.top }
            : { x: t.left - from.box.left, y: t.top - from.box.top };
        };
        const sM = spot(source), sP = spot(partner);
        const dM = delta(sM, target), dP = delta(sP, partnerDst);
        const fM = makeFlyer(cont, source, sM.box), fP = makeFlyer(cont, partner, sP.box);
        const E = 'cubic-bezier(0.45, 0, 0.25, 1)';
        const T = 2400;
        const at = (x: number, y: number) => `translate(${x}px, ${y}px)`;
        fM.animate?.([
          { transform: at(0, 0), easing: E },
          // down below the line first, then along it — never through the = in between
          { transform: at(0, dM.y - dP.y), offset: 0.18, easing: E },
          { transform: at(dM.x - dP.x, dM.y - dP.y), offset: 0.42 },
          { transform: at(dM.x - dP.x, dM.y - dP.y), offset: 0.55, easing: E },
          { transform: at(dM.x, dM.y) },
        ], { duration: T, fill: 'forwards' });
        fP.animate?.([
          { transform: at(0, 0), offset: 0 },
          { transform: at(0, 0), offset: 0.55, easing: E },
          { transform: at(dP.x, dP.y) },
        ], { duration: T, fill: 'forwards' });
        // The fraction line is drawn as soon as the piece is under its partner (Adrian, 19 Oct 2026:
        // "Can we have the line between fraction once the 5^(2x-1) goes underneath 5^(x-1)?"), and
        // slides with the fraction in the second step.
        const fracLine = tok.querySelector<HTMLElement>('.frac-line');
        let bar: HTMLElement | null = null;
        if (fracLine) {
          const b = boxIn(fracLine, cont);
          // Its height comes from the two pieces (the line's own box reads low while the line settles):
          // midway between the top piece's bottom and the bottom piece's top.
          const up = boxIn(partnerDst, cont), down = boxIn(target, cont);
          const thick = Math.max(1, parseFloat(getComputedStyle(fracLine).borderBottomWidth) || b.height);
          b.top = (up.top + up.height + down.top) / 2 - thick / 2;
          b.height = thick;
          bar = document.createElement('div');
          bar.setAttribute('aria-hidden', 'true');
          Object.assign(bar.style, { position: 'absolute', left: `${b.left - dP.x}px`, top: `${b.top - dP.y}px`, width: `${b.width}px`,
            height: `${Math.max(1, b.height)}px`, margin: '0', background: getComputedStyle(partner).color, opacity: '0', pointerEvents: 'none', zIndex: '20',
            transformOrigin: 'left center' });
          cont.appendChild(bar);
          bar.animate?.([
            { opacity: 0, transform: 'translate(0, 0) scaleX(0)', offset: 0 },
            { opacity: 0, transform: 'translate(0, 0) scaleX(0)', offset: 0.4 },
            { opacity: 1, transform: 'translate(0, 0) scaleX(1)', offset: 0.48 },
            { opacity: 1, transform: 'translate(0, 0) scaleX(1)', offset: 0.55, easing: E },
            { opacity: 1, transform: `${at(dP.x, dP.y)} scaleX(1)` },
          ], { duration: T, fill: 'forwards' });
        }
        tok.classList.add('lsn-landing');
        window.setTimeout(() => {
          tok.classList.remove('lsn-landing');
          for (const f of bar ? [fM, fP, bar] : [fM, fP]) {
            const out = f.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
            if (out) out.onfinish = () => f.remove(); else f.remove();
          }
        }, T);
        const flownIds = new Set([tok.dataset.from, pairFrom]);
        for (const el of Array.from(line.querySelectorAll<HTMLElement>('.lsn-tok[data-token-id][data-gone]'))) {
          const was = lastAt.current.get(el);
          if (!was || flownIds.has(el.dataset.tokenId)) continue;
          const ghost = makeFlyer(cont, el, was);
          ghost.style.textShadow = 'none';
          const fade = ghost.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
          if (fade) fade.onfinish = () => ghost.remove(); else ghost.remove();
        }
        // The = (and anything else that stays) waits for the first step, then slides with the fraction.
        for (const el of Array.from(line.querySelectorAll<HTMLElement>('.lsn-tok[data-token-id]'))) {
          if (el === tok || el.dataset.gone || el.dataset.held) continue;
          const was = lastAt.current.get(el);
          const now = offsetRect(el, cont);
          if (!was || (Math.abs(was.left - now.left) < 1 && Math.abs(was.top - now.top) < 1)) continue;
          const from = at(was.left - now.left, was.top - now.top);
          el.animate?.([{ transform: from, offset: 0 }, { transform: from, offset: 0.55, easing: E }, { transform: 'none' }], { duration: T });
        }
        continue;
      }
      if (source && start) flyClone(cont, start, target, gone ? lastAt.current.get(source) : undefined,
        piece ? { from: gone ? lastGlyph.current.get(source) : undefined } : undefined);
      // `also`: more pieces of the same rewrite fly at the same time (5^{x-1} up into the top).
      for (const pair of (tok.dataset.also ?? '').split(',').filter(Boolean)) {
        const [fromAlso, intoAlso] = pair.split(':');
        const src = cont.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(fromAlso)}"]`);
        const dst = tok.querySelector<HTMLElement>(`.lsn-pc-${CSS.escape(intoAlso)}`);
        if (!src || !dst) continue;
        const g = !!src.dataset.gone;
        flyClone(cont, src, dst, g ? lastAt.current.get(src) : undefined, { from: g ? lastGlyph.current.get(src) : undefined });
      }
      // A rewrite in place: the new token (its fraction bar) shows only once the pieces have landed,
      // so nothing flies across it; what stays on the line slides to its new place instead of jumping.
      if (tok.dataset.into && tok.dataset.rewrite) {
        tok.classList.add('lsn-landing');
        window.setTimeout(() => tok.classList.remove('lsn-landing'), 1050);
        // What the rewrite drops and nothing carries (the ×) fades where it stood, never blinks out.
        const flown = new Set([tok.dataset.from, ...(tok.dataset.also ?? '').split(',').map(p => p.split(':')[0])]);
        for (const el of Array.from(line.querySelectorAll<HTMLElement>('.lsn-tok[data-token-id][data-gone]'))) {
          const at = lastAt.current.get(el);
          if (!at || flown.has(el.dataset.tokenId)) continue;
          const ghost = el.cloneNode(true) as HTMLElement;
          for (const a of ['data-gone', 'data-held', 'data-token-id', 'data-key']) ghost.removeAttribute(a);
          ghost.setAttribute('aria-hidden', 'true');
          Object.assign(ghost.style, { position: 'absolute', left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`,
            height: `${at.height}px`, margin: '0', pointerEvents: 'none', fontSize: getComputedStyle(el).fontSize });
          cont.appendChild(ghost);
          const fade = ghost.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
          if (fade) fade.onfinish = () => ghost.remove(); else ghost.remove();
        }
        for (const el of Array.from(line.querySelectorAll<HTMLElement>('.lsn-tok[data-token-id]'))) {
          if (el === tok || el.dataset.gone || el.dataset.held) continue;
          const was = lastAt.current.get(el);
          const now = offsetRect(el, cont);
          if (!was || (Math.abs(was.left - now.left) < 1 && Math.abs(was.top - now.top) < 1)) continue;
          el.animate?.([{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }],
            { duration: 1100, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' });
        }
      }
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
  // An `into` token's piece stays empty until its move fires (and again after a seek back).
  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    for (const tok of Array.from(cont.querySelectorAll<HTMLElement>('[data-into]'))) {
      for (const name of (tok.dataset.into ?? '').split(',').filter(Boolean)) {
        tok.querySelector<HTMLElement>(`.lsn-pc-${CSS.escape(name)}`)?.classList.toggle('lsn-into-wait', !!tok.dataset.intoWait);
      }
    }
  });
  // After any flight: note where each token on the board now sits (see lastAt).
  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!cont || !board) return;
    for (const el of Array.from(cont.querySelectorAll<HTMLElement>('[data-token-id]'))) {
      if (el.dataset.gone) continue;
      lastAt.current.set(el, offsetRect(el, cont));
      if (pieceSources.has(el.dataset.tokenId ?? '')) lastGlyph.current.set(el, { box: boxIn(el, cont), glyph: glyphOffset(el) });
    }
  });

  const intro = bitsOf(board, 'text:intro');
  const notes = useMemo(() => (board ? sceneNotes(scene) : []), [board, scene]);
  // A clip's notes point UP at their token: placed before anything is written (the chalk hand
  // measures a note's letters when it writes them), and again whenever the board reflows.
  useIsoLayoutEffect(() => {
    const cont = containerRef.current;
    if (!clip || !cont || !board) return;
    const place = () => placeClipNotes(cont);
    const fit = () => { if (scene.scroll) scrollClipBoard(cont); else fitClipBoard(cont); placeClipNotes(cont); };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(cont);
    let live = true;
    document.fonts?.ready?.then(() => { if (live) fit(); });
    window.addEventListener('resize', fit);
    return () => { live = false; ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, [clip, board === null, notes]);
  return (
    <div className="lsn-body lsn-body-steps flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-heading mb-1.5">{scene.heading}</p>
      )}
      {/* The question, in the Kalam BODY size — not the marker face and not a
          headline: it is the thing being worked on, and it has to sit on one or
          two lines of a phone board. `data-fit` is the last-resort guard. */}
      {scene.intro && (
        <p data-key={intro?.key} data-prose={board ? '1' : undefined} data-fit data-board-intro
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
              className={`lsn-line ${on ? 'on' : ''}${s.corner && clip ? ' lsn-line-corner' : ''}`}>
              {s.heading && (
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-heading mb-1 lsn-step-heading">{s.heading}</p>
              )}
              <div data-fit data-cols={s.cols ? s.tokens.length : undefined} className={`lsn-tokrow text-[17px] text-slate-800 lsn-ink leading-relaxed flex flex-wrap items-baseline gap-x-1.5 gap-y-1.5${s.cols ? ' lsn-cols' : ''}`}>
                {s.tokens.map((t, ti) => (
                  <TokenSpan key={ti} t={t} away={!!board && tokenAway(board, scene, i, ti)} wait={board ? tokenPieceWaiting(board, scene, i, ti) : null}
                    bits={board ? { key: tokKey(i, ti), on: tokenShown(board, scene, i, ti), written: tokenWritten(board, i, ti) } : null} />
                ))}
              </div>
              {/* Handwritten asides beside this line's tokens: slots from mount, drawn on when their beat says so. */}
              {board && notes.some(n => n.line === i) && (
                <div className="lsn-note-row">
                  {notes.filter(n => n.line === i).map(n => {
                    // The ↑ points at the middle of the note's span (else its `near` token).
                    const ids = n.span?.length ? n.span : n.near ? [n.near] : [];
                    const keys = clip ? ids.map(id => s.tokens.findIndex(t => t.id === id)).filter(ti => ti >= 0).map(ti => tokKey(i, ti)) : [];
                    // A note on a piece the line has rewritten away leaves with it — hidden, never
                    // unmounted, so stepping back brings the same written note back.
                    const ni = n.near ? s.tokens.findIndex(t => t.id === n.near) : -1;
                    const away = ni >= 0 && tokenGone(board, scene, i, ni);
                    return (
                      <span key={n.id} data-gone={away ? '1' : undefined} className={away ? 'lsn-note-away' : 'contents'}>
                        <NoteSlotView note={n} board={board} pointAt={keys.length ? keys.join(' ') : undefined} />
                      </span>
                    );
                  })}
                </div>
              )}
              {/* The note is the prose the voice reads for this line; the
                  tokens above it arrive per step and are never walked word by
                  word. The intro (the question) stays at full ink throughout. */}
              {s.graph && <ClipGraph g={s.graph} on={on} />}
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

// ── Scene: motion-graph (▶ Watch it, 5 Oct 2026) ─────────────────────────────
// A piecewise-straight graph from the question's own numbers (speed–time,
// distance–time …) that draws itself piece by piece — segments drawn on, areas
// filled with their value inside, the gradient's rise/run triangle, dashed
// readings to the axes — with the working written under it (the same lines as
// an equation-steps scene, addressed by the same beats). Only the values the
// points carry are labelled on the axes: the reading is exact, not eyeballed.

const PIECE_TONE: Record<GraphPiece['kind'], LessonTone> = { segment: 'sky', area: 'amber', slope: 'rose', value: 'sky' };
const fmtTick = (v: number) => String(Number(v.toPrecision(6)));

function MotionGraphView({ scene, step, reduced, timed, board }: {
  scene: MotionGraphScene; step: number; reduced: boolean; timed: boolean; board: BoardState | null;
}) {
  const W = 360, H = 230, L = 46, R = 16, T = 14, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const pts = scene.points;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const xMin = Math.min(0, ...xs), xMax = Math.max(...xs) || 1;
  const yMin = Math.min(0, ...ys), yMax = Math.max(...ys) || 1;
  const px = (x: number) => L + ((x - xMin) / (xMax - xMin)) * plotW;
  const py = (y: number) => T + 8 + ((yMax - y) / (yMax - yMin)) * (plotH - 8);
  const y0 = py(0), x0 = px(Math.max(0, xMin));
  // Without beats (never the case for a Watch it clip) pieces arrive one per tap.
  const pieceOn = (k: number) => (board ? elementShown(board, pieceKey(k)) : k <= step);
  const xTicks = [...new Set(xs.filter(v => v !== 0))].sort((a, b) => a - b);
  const yTicks = [...new Set(ys.filter(v => v !== 0))].sort((a, b) => a - b);
  // Which ticks are labelled: a value once a piece that uses it is on (the axes fill in with the drawing).
  const usedOn = (axis: 0 | 1, v: number) => scene.pieces.some((pc, k) => {
    if (!pieceOn(k)) return false;
    const idx = pc.kind === 'value' ? [pc.from] : Array.from({ length: (pc.to ?? pc.from) - pc.from + 1 }, (_, i) => pc.from + i);
    return idx.some(i => pts[i]?.[axis] === v);
  });
  const stroke = (pc: GraphPiece) => TONE[pc.tone ?? PIECE_TONE[pc.kind]].stroke;
  const fade = (on: boolean, ms = 450) => ({ opacity: on ? 1 : 0, transition: reduced ? 'none' : `opacity ${ms}ms ${EASE}` });

  // Labels sit in the empty space: a slope's above its line (left of it when the line rises), a
  // reading's above its point — and on the inner side near the right edge, so nothing leaves the board.
  type Anchor = 'c' | 'l' | 'r';
  const labels: { k: number; x: number; y: number; text: string; color: string; anchor: Anchor }[] = [];
  const side = (x: number, prefer: Anchor): Anchor => (prefer === 'l' && x > W * 0.6 ? 'r' : prefer === 'r' && x < W * 0.4 ? 'l' : prefer);
  scene.pieces.forEach((pc, k) => {
    if (!pc.label) return;
    const a = pts[pc.from], b = pts[pc.to ?? pc.from];
    if (pc.kind === 'area') {
      const seg = pts.slice(pc.from, (pc.to ?? pc.from) + 1);
      const cx = (seg[0][0] + seg[seg.length - 1][0]) / 2;
      // under the line at the middle of the region, a third of the way up from the axis
      const yTop = seg.reduce((m, p) => Math.min(m, py(p[1])), y0);
      const yMid = Math.max(yTop, (() => { // the line's height at cx
        for (let i = 0; i + 1 < seg.length; i++) if (seg[i][0] <= cx && cx <= seg[i + 1][0]) {
          const f = seg[i + 1][0] === seg[i][0] ? 0 : (cx - seg[i][0]) / (seg[i + 1][0] - seg[i][0]);
          return py(seg[i][1] + f * (seg[i + 1][1] - seg[i][1]));
        }
        return yTop;
      })());
      labels.push({ k, x: px(cx), y: y0 - (y0 - yMid) * 0.38, text: pc.label, color: stroke(pc), anchor: 'c' });
    } else if (pc.kind === 'slope') {
      const mx = (px(a[0]) + px(b[0])) / 2, my = (py(a[1]) + py(b[1])) / 2;
      const rising = b[1] > a[1], flat = b[1] === a[1];
      labels.push({ k, x: flat ? mx : rising ? mx - 10 : mx + 10, y: my - 16, text: pc.label, color: stroke(pc), anchor: flat ? 'c' : rising ? 'r' : 'l' });
    } else if (pc.kind === 'value') {
      const x = px(a[0]);
      labels.push({ k, x: x > W * 0.6 ? x - 8 : x + 8, y: Math.max(T + 6, py(a[1]) - 13), text: pc.label, color: stroke(pc), anchor: side(x, 'l') });
    } else {
      labels.push({ k, x: (px(a[0]) + px(b[0])) / 2, y: (py(a[1]) + py(b[1])) / 2 - 14, text: pc.label, color: stroke(pc), anchor: 'c' });
    }
  });
  const shift: Record<Anchor, string> = { c: 'translate(-50%, -50%)', l: 'translate(0, -50%)', r: 'translate(-100%, -50%)' };

  const working = useMemo<EquationStepsScene | null>(
    () => (scene.steps?.length ? { type: 'equation-steps', steps: scene.steps, beats: scene.beats } : null),
    [scene.steps, scene.beats],
  );
  const caption = bitsOf(board, 'text:caption');

  return (
    <div className="lsn-body lsn-body-graph flex-1 px-1 py-2">
      {scene.heading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 lsn-muted lsn-heading mb-2">{scene.heading}</p>
      )}
      <div className="relative" data-motion-graph>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label={scene.heading || 'Graph'}>
          {/* areas first — under everything */}
          {scene.pieces.map((pc, k) => {
            if (pc.kind !== 'area') return null;
            const seg = pts.slice(pc.from, (pc.to ?? pc.from) + 1);
            const poly = [[seg[0][0], 0], ...seg, [seg[seg.length - 1][0], 0]].map(p => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ');
            return <polygon key={k} data-key={board ? pieceKey(k) : undefined} points={poly} fill={stroke(pc)} fillOpacity={0.26}
              stroke={stroke(pc)} strokeOpacity={0.5} strokeWidth={1} style={fade(pieceOn(k), 600)} />;
          })}
          {xTicks.map(v => <line key={`gx${v}`} x1={px(v)} y1={T} x2={px(v)} y2={T + plotH} stroke="#e2e8f0" strokeWidth="1" className="lsn-grid" style={fade(usedOn(0, v))} />)}
          {yTicks.map(v => <line key={`gy${v}`} x1={L} y1={py(v)} x2={L + plotW} y2={py(v)} stroke="#e2e8f0" strokeWidth="1" className="lsn-grid" style={fade(usedOn(1, v))} />)}
          <line x1={L} y1={y0} x2={L + plotW} y2={y0} stroke="#94a3b8" strokeWidth="1.4" className="lsn-axis" />
          <line x1={x0} y1={T} x2={x0} y2={T + plotH} stroke="#94a3b8" strokeWidth="1.4" className="lsn-axis" />
          <text x={x0 - 5} y={y0 + 13} fontSize="10" fill="#94a3b8" textAnchor="end" className="lsn-tick">0</text>
          {xTicks.map(v => <text key={`tx${v}`} x={px(v)} y={y0 + 14} fontSize="10.5" fill="#94a3b8" textAnchor="middle" className="lsn-tick" style={fade(usedOn(0, v))}>{fmtTick(v)}</text>)}
          {yTicks.map(v => <text key={`ty${v}`} x={x0 - 5} y={py(v) + 3.5} fontSize="10.5" fill="#94a3b8" textAnchor="end" className="lsn-tick" style={fade(usedOn(1, v))}>{fmtTick(v)}</text>)}
          {scene.xLabel && <text x={L + plotW} y={y0 + 26} fontSize="11" fill="#64748b" textAnchor="end" fontStyle="italic" className="lsn-axis-label">{scene.xLabel}</text>}
          {scene.yLabel && <text x={x0 + 6} y={T + 2} fontSize="11" fill="#64748b" fontStyle="italic" className="lsn-axis-label">{scene.yLabel}</text>}
          {/* readings and gradient triangles (dashed), then the graph itself on top */}
          {scene.pieces.map((pc, k) => {
            const on = pieceOn(k);
            const a = pts[pc.from], b = pts[pc.to ?? pc.from];
            if (pc.kind === 'value') return (
              <g key={k} data-key={board ? pieceKey(k) : undefined} style={fade(on)}>
                <polyline points={`${x0},${py(a[1])} ${px(a[0])},${py(a[1])} ${px(a[0])},${y0}`} fill="none" stroke={stroke(pc)} strokeWidth="1.4" strokeDasharray="4 3" />
                <circle cx={px(a[0])} cy={py(a[1])} r="3.2" fill={stroke(pc)} />
              </g>
            );
            if (pc.kind === 'slope') return (
              <g key={k} data-key={board ? pieceKey(k) : undefined} style={fade(on)}>
                <polyline points={`${px(a[0])},${py(a[1])} ${px(b[0])},${py(a[1])} ${px(b[0])},${py(b[1])}`} fill="none" stroke={stroke(pc)} strokeWidth="1.6" strokeDasharray="5 3" />
              </g>
            );
            return null;
          })}
          {scene.pieces.map((pc, k) => {
            if (pc.kind !== 'segment') return null;
            const seg = pts.slice(pc.from, (pc.to ?? pc.from) + 1);
            const d = seg.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)} ${py(p[1]).toFixed(1)}`).join('');
            const on = pieceOn(k);
            return <path key={k} data-key={board ? pieceKey(k) : undefined} d={d} fill="none" stroke="hsl(220, 60%, 20%)" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" className="lsn-curve" pathLength={1} strokeDasharray="1"
              style={{ strokeDashoffset: on ? 0 : 1, transition: reduced ? 'none' : `stroke-dashoffset 900ms ${EASE}` }} />;
          })}
        </svg>
        {/* Labels as HTML over the SVG (KaTeX does not live inside SVG text). */}
        {labels.map(l => (
          <div key={l.k} aria-hidden={!pieceOn(l.k)} className="lsn-graph-label absolute pointer-events-none whitespace-nowrap text-[12.5px] font-semibold lsn-hand"
            style={{ left: `${(l.x / W) * 100}%`, top: `${(l.y / H) * 100}%`, transform: shift[l.anchor], color: l.color, ...fade(pieceOn(l.k), 500) }}>
            <MathText text={l.text} />
          </div>
        ))}
      </div>
      {working && (
        <div className="mt-1">
          <EquationStepsView scene={working} step={Math.max(0, step - scene.pieces.length)} reduced={reduced} timed={timed} board={board} />
        </div>
      )}
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

function CheckView({ scene, slug, onResolved, onCorrect, timed, board }: {
  scene: ResolvedCheckScene; slug: string; onResolved: () => void; timed: boolean; board: BoardState | null;
  /** A lesson with a cheer clip (lib/lesson-extras): called inside the Check tap, so the clip may play with sound. */
  onCorrect?: () => void;
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
    if (verdict === 'correct') { setStatus('correct'); onCorrect?.(); onResolved(); }
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
    case 'motion-graph': return 2600;
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
          // It writes at a HAND's pace and is done (handWriteS) — it used to
          // stretch every sentence to the end of its share of the clip, so the
          // board was still writing a thing long after the voice had said it.
          const w = windows[i];
          const lead = track ? CURSOR_LEAD_S : 0;
          const p = cur.states[i] === 'speaking'
            ? Math.min(1, Math.max(0, (t - (w.start - lead)) / Math.max(0.05, Math.min(w.end - w.start, handWriteS(Number(el.dataset.w) || 1))))).toFixed(3)
            : '0';
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
          // A clip's subtitle in pieces: show the piece holding the next word to be said.
          const next = words?.[Math.min(lit, (words?.length ?? 1) - 1)]?.parentElement?.dataset.piece;
          if (next != null) ribbonRef.current?.querySelectorAll<HTMLElement>('[data-piece]').forEach(p => {
            if (p.dataset.piece === next) p.setAttribute('data-active', ''); else p.removeAttribute('data-active');
          });
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
    let times = timeline.map(x => x.at);
    // Word cues (`on`) are re-read off the LIVE clip once its length (and its
    // timing sidecar, when it has one) is known: the static times above are the
    // words' estimated shares; these are where the voice really is.
    const cued = hasBeats(scene) && timeline.some(x => typeof x.action.on === 'string');
    let trackKey = '';
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
        if (cued && c.duration) {
          const key = `${c.duration}:${c.timing ? 'sc' : 'pr'}`;
          if (key !== trackKey) {
            trackKey = key;
            times = beatTimeline(scene, step, buildSpeechTrack(c.text, c.duration, c.timing)).map(x => x.at);
          }
        }
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
        for (let j = n; j < k; j++) emit('lsn:action', { index: j, kind: timeline[j].action.do, at: times[j], on: timeline[j].action.on ?? null, frac, clipElapsed, source: clipElapsed !== null ? 'clip' : pacing === 'manual' ? 'tap' : 'timer' });
        n = k;
        setFiredState({ key: posKey, n });
      }
      if (n < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beat, done, scene, sceneIdx, step, posKey, timeline, pacing, locked, reduced, rate, clip, beatClock, cardRef]);

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
    // A CLIP sets its working large and on ONE row a line (a wrapped line of
    // algebra reads as two lines of working): a row too wide for the board
    // comes down as a whole (--lsn-row-scale), never below 0.6 of the clip size.
    const fitClipRows = () => {
      if (!card.closest('[data-lsn-clip]')) return;
      for (const row of Array.from(card.querySelectorAll<HTMLElement>('.lsn-tokrow'))) {
        row.style.removeProperty('--lsn-row-scale');
        let scale = 1;
        for (let i = 0; i < 4; i++) {
          const toks = Array.from(row.querySelectorAll<HTMLElement>(':scope > .lsn-tok:not([data-gone]), :scope > [data-key]:not([data-gone])'));
          if (toks.length === 0) break;
          const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
          const need = toks.reduce((w, t) => w + t.getBoundingClientRect().width, 0) + gap * (toks.length - 1);
          const room = row.clientWidth;
          if (!(need > room + 0.5) || room <= 0) break;
          scale = Math.max(0.6, scale * (room / need) * 0.985);
          row.style.setProperty('--lsn-row-scale', scale.toFixed(3));
          if (scale <= 0.6) break;
        }
      }
    };
    const fitAll = () => { fit(); fitClipRows(); };
    fitAll();
    lastWidth = card.clientWidth;
    // Re-fit on a real WIDTH change only: fitting changes the card's height,
    // and observing that would chase its own tail.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (card.clientWidth !== lastWidth) { lastWidth = card.clientWidth; fitAll(); } })
      : null;
    ro?.observe(card);
    // A line rewritten in place grows or shrinks mid-beat: the board asks for a re-fit.
    card.addEventListener('lsn-refit', fitAll);
    let cancelled = false;
    document.fonts?.ready?.then(() => { if (!cancelled) fit(); });
    return () => { cancelled = true; ro?.disconnect(); card.removeEventListener('lsn-refit', fitAll); };
  }, [cardRef, active, key]);
}

/** A laptop-wide screen: the clip's chat opens beside it rather than over its bottom half. */
const WIDE_QUERY = '(min-width: 1024px)';
function subscribeWide(cb: () => void): () => void {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * A clip's subtitle never runs past two lines (Adrian's look, 16 Oct 2026: a 3-line line covered the
 * board's last working line). A beat's line is cut into pieces of at most SUBTITLE_PIECE_CHARS
 * characters — two lines on a phone — at word boundaries, the way video captions are; the pieces
 * play one after another with the voice.
 */
const SUBTITLE_PIECE_CHARS = 72;
function subtitlePieces(words: string[]): { w: string; i: number }[][] {
  const out: { w: string; i: number }[][] = [];
  let cur: { w: string; i: number }[] = [];
  let len = 0;
  words.forEach((w, i) => {
    if (cur.length && len + 1 + w.length > SUBTITLE_PIECE_CHARS) { out.push(cur); cur = []; len = 0; }
    len += (cur.length ? 1 : 0) + w.length;
    cur.push({ w, i });
  });
  if (cur.length) out.push(cur);
  return out;
}

/** The sound-off caption of a clip: its pieces in turn, a reading pace apart (no voice to follow). */
function MutedCaption({ words, className, paused }: { words: string[]; className: string; paused: boolean }) {
  const pieces = useMemo(() => subtitlePieces(words), [words]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (paused || at >= pieces.length - 1) return;
    const t = window.setTimeout(() => setAt(a => a + 1), 900 + pieces[at].length * 330);
    return () => window.clearTimeout(t);
  }, [at, pieces, paused]);
  return (
    <p className={className}>
      {pieces[at]?.map(({ w, i }) => <span key={i} data-w data-on="">{i > pieces[at][0].i ? ' ' : ''}{w}</span>)}
    </p>
  );
}

// ── The player ───────────────────────────────────────────────────────────────

type Pacing = 'manual' | 'auto' | 'narrated';

/** The side clip's popup: over the main clip (which waits, paused), its own player; ✕, Esc or the
 *  end card's button closes it and the main clip carries on from the same spot. */
function SidePopup({ clip: c, onClose }: { clip: SideClip; onClose: () => void }) {
  // A SHEET from the bottom, not a new page (Adrian, 18 Oct 2026: "clicking it brings me to another
  // page, which interrupts the clip experience"): the clip's board stays in view above it, paused at
  // the same spot; ✕, Esc, a tap above the sheet or a swipe down closes it and the clip carries on.
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={c.title} data-side-popup>
      <button type="button" aria-label="Back to the clip" onClick={onClose} className="absolute inset-0 w-full h-full bg-slate-900/25 cursor-default" />
      <div className="lsn-side-sheet absolute inset-x-0 bottom-0 mx-auto max-w-lg h-[68dvh] rounded-t-3xl bg-[hsl(45,40%,97%)] shadow-[0_-12px_32px_-12px_rgba(15,23,42,0.45)] flex flex-col"
        style={{ transform: `translateY(${dragY}px)`, transition: start.current === null ? 'transform 220ms ease-out' : 'none' }}>
        <div className="shrink-0 flex items-center gap-2 px-4 pt-2 pb-1 touch-none select-none"
          onPointerDown={e => {
            if ((e.target as HTMLElement).closest('button')) return;   // the ✕ keeps its own tap
            start.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e => { if (start.current !== null) setDragY(Math.max(0, e.clientY - start.current)); }}
          onPointerUp={() => { const y = dragY; start.current = null; setDragY(0); if (y > 90) onClose(); }}
          onPointerCancel={() => { start.current = null; setDragY(0); }}>
          <span aria-hidden className="absolute left-1/2 top-2 -translate-x-1/2 h-1.5 w-10 rounded-full bg-slate-300" />
          <span className="mt-3 text-[13px] font-semibold text-navy">💡 {c.title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto mt-2 w-8 h-8 rounded-full bg-white text-navy shadow-[0_1px_2px_rgba(15,23,42,0.1)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4" data-side-sheet-body>
          <LessonPlayer slug={c.slug} title={c.title} topic={c.topic} minutes={c.minutes} theme={c.theme} scenes={c.scenes}
            clip embedded startAuto startVoice kicker="Why?" doneTitle="That's why"
            doneText="Back to the clip to carry on." practiceLabel="‹ Back to the clip" onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

/** A side clip a beat links to, ready to play in a popup (page.tsx loads it). */
export interface SideClip { slug: string; title: string; topic: string; minutes: number; theme: LessonTheme; scenes: PlayScene[]; question: string | null }

export default function LessonPlayer({ slug, title, topic, minutes, scenes, theme: themeProp, character, backHref = '/app/practice', kicker = 'Lesson', practiceHref: practiceHrefProp, practiceLabel, doneTitle = 'Lesson complete', doneText = "That's the whole idea — the fastest way to make it stick is to use it on real questions while it's fresh.", startAuto = false, startVoice = false, clip = false, onClose, cheerSrc, askAbout = false, startAt = 0, askIntro = null, askLevel = null, question = null, asides = {}, embedded = false }: {
  slug: string; title: string; topic: string; minutes: number; scenes: PlayScene[]; theme?: LessonTheme;
  /**
   * The character at the board's corner (lesson-character.tsx). `teacher`
   * (or the older `student`) shows the drawn teacher on any theme, `tutor-picture` the
   * generated tutor's pictures; `none` never. Left unset, it shows on a BOARD theme
   * whose beats carry `character` actions (the explain clip) — a committed lesson
   * without poses renders exactly as before.
   */
  character?: LessonCharacter;
  /** Where ‹ goes (the practice page for a lesson; the paper for a one-minute explanation). */
  backHref?: string;
  /** The small word above the title ("Lesson", "Explain"). */
  kicker?: string;
  /** The closer's link and its label; default = practise this lesson's topic. */
  practiceHref?: string;
  practiceLabel?: string;
  /** The closer's heading and line. */
  doneTitle?: string;
  doneText?: string;
  /** Start in ▶ Auto — a clip plays like a video from the first frame (the one-minute explanation). */
  startAuto?: boolean;
  /** Open with the 🔊 voice ON when the lesson has clips (a clip — Adrian, 9 Oct 2026: "make audio play by default"). A browser that
   *  refuses sound before a tap shows the "Play with voice" poster: one tap starts it. The viewer's own toggle wins for the visit. */
  startVoice?: boolean;
  /** A one-concept clip (script.kind === 'clip'): the working is set LARGE for a phone and the lines are spaced so an arc has room. */
  clip?: boolean;
  /** Played inside an overlay (▶ Watch it): ‹ and the closer call this instead of following a link. */
  onClose?: () => void;
  /** 🎬 The tutor's cheer clip (lib/lesson-extras): plays over the board after a correct quick check,
   *  and the timed pacings wait for it. Unset = no element, no change. */
  cheerSrc?: string;
  /** 💬 A clip: show "Ask about this step" under the controls (lib/clip-ask, CLIP_ASK_OPEN_TO_STUDENTS). */
  askAbout?: boolean;
  /** A clip: open at this stop (one per beat, as the slider counts) — the way back from Ask. */
  startAt?: number;
  /** A clip: its question as written above the working, sent to Ask with the board. */
  askIntro?: string | null;
  /** A question clip: the WHOLE question as set (TeX in $…$), shown beside the clip on a laptop and
   *  behind a "📄 The whole question" bar above it on a phone (Adrian, 15 Oct 2026: "the whole
   *  question on one side, then the explanation part by part on another side"). */
  question?: string | null;
  /** A clip: the level the Ask solver answers at on a laptop ('AM', 'EM', …), or null. */
  askLevel?: string | null;
  /** Side clips the beats link to (Beat.aside), by slug: a link opens its clip in a popup over this one. */
  asides?: Record<string, SideClip>;
  /** Played inside the side-clip sheet: no header, no step controls — the sheet has its own ✕. */
  embedded?: boolean;
}) {
  const theme = normalizeTheme(themeProp);
  // ?at= (back from Ask) opens the clip at that stop; out of range = the start.
  const [startStop] = useState(() => {
    let n = startAt;
    for (let si = 0; si < scenes.length; si++) {
      const c = sceneStepCount(scenes[si]);
      if (n < c) return { si, k: n };
      n -= c;
    }
    return { si: 0, k: 0 };
  });
  const [sceneIdx, setSceneIdx] = useState(startStop.si);
  const [step, setStep] = useState(startStop.k);
  const [done, setDone] = useState(false);
  const [auto, setAuto] = useState(startAuto);
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
  const cheerRef = useRef<HTMLVideoElement>(null);
  // The scene whose cheer is playing: a new scene (the card is keyed by scene, so the clip unmounts) ends it.
  const [cheerScene, setCheerScene] = useState<number | null>(null);
  const cheering = cheerScene === sceneIdx;
  // Leaving the scene unmounts the clip: clear it, so coming back never finds a frozen cheer.
  const cheerElRef = useCallback((el: HTMLVideoElement | null) => { cheerRef.current = el; if (!el) setCheerScene(null); }, []);
  const ribbonRef = useRef<HTMLDivElement>(null);

  // 🔊 Voice: the persisted choice only counts when this lesson has clips —
  // a silent lesson never shows the pill, and never pretends to narrate.
  const storedVoice = usePref('narrated');
  // What the viewer chose on THIS visit (null = nothing yet): it beats both the default and the remembered choice.
  const [voiceChoice, setVoiceChoice] = useState<boolean | null>(null);
  const narratedPref = voiceChoice ?? (startVoice || storedVoice);
  const muted = usePref('muted');
  // Called inside the Check tap (a gesture), so a phone lets the clip play with sound.
  const playCheer = useCallback(() => {
    const v = cheerRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = muted;
    setCheerScene(sceneIdx);
    v.play().catch(() => setCheerScene(null));
  }, [muted, sceneIdx]);
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

  // The board fading away before the next one (see onClipEnded). Any move (scrub, back, pause) cancels it.
  const [leavingScene, setLeavingScene] = useState<number | null>(null);
  const leaving = leavingScene === sceneIdx && !paused;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => { setLeavingScene(null); advance(); }, SCENE_LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving, advance]);
  useEffect(() => { setLeavingScene(null); }, [sceneIdx, step]);

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
      // A clip's board change is a breath, not a cut (Adrian, 16 Oct 2026: "the transition to another
      // screen is too sudden"): the finished board fades away first, then the next one comes in.
      if (clip && layout !== 'scene' && step >= maxStep - 1 && sceneIdx < scenes.length - 1) {
        setLeavingScene(sceneIdx);
        return;
      }
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
    if (pacing === 'manual' || done || gated || cheering || leavingScene !== null) { beatRef.current = null; return; }
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
  }, [pacing, done, gated, cheering, scene, step, rate, paused, beatKey, voiceLocked, voiceDriving, leavingScene]);
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
  // The character: the script's word first; otherwise a board theme with posed beats.
  const posed = useMemo(() => scenesHaveCharacter(scenes), [scenes]);
  const characterOn = character !== undefined ? character !== 'none' : theme !== 'slide' && posed;
  const look = characterLook(character);
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
    if (next && narratedPref) { setVoiceChoice(false); writePref('narrated', false); }
  };
  const toggleVoice = () => {
    setPaused(false);
    if (narrated) { setVoiceChoice(false); writePref('narrated', false); return; }
    setAuto(false);
    setVoiceChoice(true);
    writePref('narrated', true);
    narration.unlock();
  };
  // A clip opens with the voice on: ask the browser once, without a gesture. Where
  // sound is allowed (a desktop that has played this site before) it simply starts;
  // where it is not (a phone), the refusal leaves the "Play with voice" poster up.
  const autoVoiceTried = useRef(false);
  useEffect(() => {
    if (!startVoice || !hasVoice || autoVoiceTried.current) return;
    autoVoiceTried.current = true;
    narration.unlock();
  }, [startVoice, hasVoice, narration]);
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

  // 💬 Ask about this step (clip-ask-panel.tsx; Adrian, 15 Oct 2026: "on a phone, it shouldn't go
  // to another page … a student should be able to continue watching the video, and type a side
  // question, watch that being replied, while video is still playing and student can see both").
  // The button opens the chat WITH the clip and never pauses it: on a phone a sheet over the bottom
  // of the screen with the clip shrunk into the top part; on a laptop a panel beside the clip.
  // Seeking BACK (← or the slider) draws the board afresh at that point, like a video player seeking:
  // nothing written later (ink, notes, a piece that moved) can linger (Adrian, 16 Oct 2026: "Add Power
  // and the arrow just sticks there").
  const [seekEpoch, setSeekEpoch] = useState(0);
  const scrubRef = useRef<HTMLInputElement>(null);
  const scrubDrag = useRef(false);
  const scrubWasPlaying = useRef(false);
  const scrubAt = useRef(0);
  const scrubLabel = useRef<HTMLSpanElement>(null);
  // The side clip open in the popup (null = none). The main clip pauses under it and goes on after.
  const [side, setSide] = useState<string | null>(null);
  const openSide = (s: string) => { setPaused(true); setSide(s); };
  const closeSide = useCallback(() => { setSide(null); setPaused(false); }, []);
  // The written drop-down of a side point (Beat.aside.read): open = that slug. The clip pauses
  // while it is read and goes on when it is closed.
  const [readOpen, setReadOpen] = useState<string | null>(null);
  // Closed unless asked for (Adrian, 18 Oct 2026: "make the written drop-down closed by default >
  // student can click if they need explanation"): moving on to another part shuts it again.
  useEffect(() => { setReadOpen(null); }, [sceneIdx, step]);
  const toggleRead = (s: string) => { if (readOpen === s) { setReadOpen(null); setPaused(false); } else { setPaused(true); setReadOpen(s); } };
  const stops = useMemo(() => scenes.flatMap((sc, si) => Array.from({ length: sceneStepCount(sc) }, (_, k) => [si, k] as const)), [scenes]);
  const stopAt = Math.max(0, stops.findIndex(([si, k]) => si === sceneIdx && k === step));
  // ⏪ 10 / 10 ⏩: about ten seconds of voice back or forward, landing at the start of that part. A
  // part's length is its words at a steady speaking pace (the voice clips load only as they play).
  const partSecs = useMemo(() => stops.map(([si, k]) => {
    const sc = scenes[si];
    const say = hasBeats(sc) ? (sc.beats[k]?.say ?? '') : '';
    return Math.max(1.5, say.split(/\s+/).filter(Boolean).length / 2.6 + 0.5) / rate;
  }), [stops, scenes, rate]);
  const jumpSeconds = (d: number): number => {
    const at = done ? stops.length - 1 : stopAt;
    const c = narration.clock();
    const f = c && c.duration ? Math.min(1, c.elapsed / c.duration) : 0;
    let t = partSecs.slice(0, at).reduce((a, b) => a + b, 0) + f * (partSecs[at] ?? 0) + d;
    if (t <= 0) return 0;
    for (let i = 0; i < partSecs.length; i++) {
      if (t < partSecs[i]) return d > 0 && i <= at ? at + 1 : i;
      t -= partSecs[i];
    }
    return partSecs.length - 1;
  };
  // scrubTick: the slider's thumb glides through the part being spoken (its share of the voice
  // played), straight from the audio clock each frame — no re-render; a drag in progress wins.
  const { clock: narrationClock } = narration;
  useEffect(() => {
    if (!clip) return;
    let raf = 0;
    const n = stops.length;
    const tick = () => {
      const el = scrubRef.current;
      if (el && !scrubDrag.current) {
        let f = 0;
        const c = narrationClock();
        if (c && c.scene === sceneIdx && c.step === step && c.duration) f = Math.min(0.995, Math.max(0, c.elapsed / c.duration));
        const v = done ? n : stopAt + f;
        if (Math.abs(Number(el.value) - v) > 0.001) {
          el.value = String(v);
          el.style.setProperty('--lsn-scrub', `${(v / Math.max(1, n)) * 100}%`);
        }
        // The part counter (written here and by a drag, never by React, so the two never fight).
        const label = `${done ? n : stopAt + 1}/${n}`;
        if (scrubLabel.current && scrubLabel.current.textContent !== label) scrubLabel.current.textContent = label;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clip, stops.length, stopAt, sceneIdx, step, done, narrationClock]);
  const canAsk = clip && askAbout && !done && hasBeats(scene) && !gated;
  const [chatOpen, setChatOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const sheet = chatOpen && !wide;
  const askLabel = `${title} · step ${stopAt + 1} of ${stops.length}`;
  const askNow = canAsk ? readyAsks(scene, step) : [];
  // Read when a question is SENT: the step on screen then, not when the chat was opened.
  const stepRef = useRef<ClipAskStep | null>(null);
  useEffect(() => {
    stepRef.current = hasBeats(scene) && !done
      ? { context: clipContext({ title, topic, intro: askIntro, lines: boardTexAt(scene, step), say: scene.beats[step]?.say ?? '' }), stopKey: `${sceneIdx}:${step}`, label: askLabel }
      : null;
  }, [scene, step, sceneIdx, done, title, topic, askIntro, askLabel]);
  const getAskStep = useCallback(() => stepRef.current, []);
  // Phone + chat: bring the clip to the top of the screen and shrink the board card (a transform,
  // so the chalk hand and the cues are untouched) until the board and its slider sit above the
  // sheet. Re-measured on every step and on resize.
  const [sheetFit, setSheetFit] = useState<{ scale: number; height: number }>({ scale: 1, height: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  /** The bottom of the site's own top bar (fixed or sticky), 0 when it scrolls away. */
  const topBarBottom = () => {
    let top = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('header, nav, body > div *'))) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (r.top <= 1 && r.height > 0 && r.height < 140 && r.bottom > top) top = r.bottom;
    }
    return top;
  };
  useEffect(() => {
    if (!sheet) return;
    // The scale is worked out for the clip as it will sit once scrolled up under the top bar.
    const measure = () => {
      const root = rootRef.current, card = cardRef.current;
      const panel = document.querySelector<HTMLElement>('[data-clip-ask-panel]');
      if (!root || !card || !panel) return;
      const cardTopAfter = topBarBottom() + 4 + (card.getBoundingClientRect().top - root.getBoundingClientRect().top);
      const scrub = root.querySelector<HTMLElement>('.lsn-scrub');
      const room = panel.getBoundingClientRect().top - 8 - (scrub ? scrub.offsetHeight + 8 : 0) - cardTopAfter;
      setSheetFit({ scale: Math.max(0.4, Math.min(1, room / card.offsetHeight)), height: card.offsetHeight });
    };
    const t = window.setTimeout(measure, 80);
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [sheet, sceneIdx, step, done]);
  // …then, once the shrink has landed, bring the clip up under the top bar.
  useEffect(() => {
    if (!sheet || !rootRef.current) return;
    window.scrollBy({ top: rootRef.current.getBoundingClientRect().top - topBarBottom() - 4, behavior: 'instant' as ScrollBehavior });
  }, [sheet, sheetFit]);

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
      if (e.code !== 'Space' || e.repeat || !canPause || side) return;
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
  }, [canPause, paused, flashGesture, side]);

  // ← / → step back and forward one part, like a video player's arrow keys (Adrian, 16 Oct 2026:
  // "allow left and right arrows to go forward and backwards in the video? like in youtube?").
  useEffect(() => {
    if (!clip) return;
    const onArrow = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (side) return;   // the popup's own clip has the keys
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      const at = done ? stops.length - 1 : stopAt;
      const to = Math.min(stops.length - 1, Math.max(0, at + (e.key === 'ArrowRight' ? 1 : -1)));
      if (to === at && !done) return;
      const [si, k] = stops[to];
      if (to < at) setSeekEpoch(n => n + 1);
      setDone(false); setSceneIdx(si); setStep(k);
      flashGesture(e.key === 'ArrowRight' ? '⏩' : '⏪');
    };
    window.addEventListener('keydown', onArrow);
    return () => window.removeEventListener('keydown', onArrow);
  }, [clip, done, stops, stopAt, flashGesture, side]);
  useEffect(() => {
    if (!rateOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('[data-rate-menu]')) setRateOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [rateOpen]);

  const practiceHref = practiceHrefProp ?? `/app/practice?topic=${encodeURIComponent(topic)}&from=lesson`;
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

  // The whole question beside the clip (laptop, chat closed) — see the grid below.
  const qSide = clip && !!question && wide && !chatOpen;
  // The spoken line: under the board in a lesson; inside the bottom of the board in a clip (subtitles).
  const ribbonCls = clip ? 'lsn-subs' : 'lsn-ribbon mt-3 px-1 min-h-[42px]';
  const lineCls = clip ? 'lsn-subs-line' : 'lsn-ribbon-line border-l-2 border-amber-400 pl-3 text-[13px] leading-snug';
  const subtitles = (
    <>
      {/* The spoken-line ribbon (Voice only): the narration sentence being
          said, its words brightening as the voice reaches them. Fixed height
          so the controls below never jump; empty on silent positions. */}
      {pacing === 'narrated' && !done && (
        <div ref={ribbonRef} className={ribbonCls} aria-hidden data-ribbon>
          {ribbon && (
            <p key={ribbon.key} className={lineCls}>
              {clip ? subtitlePieces(ribbon.words).map((piece, pi) => (
                // A clip's line in pieces of at most two lines; the speech cursor shows the piece
                // being said (data-active). Words keep their order, so [data-w] indices still match.
                <span key={pi} data-piece={pi} data-active={pi === 0 ? '' : undefined}>
                  {piece.map(({ w, i }) => <span key={i} data-w>{i > piece[0].i ? ' ' : ''}{w}</span>)}
                </span>
              )) : ribbon.words.map((w, i) => (
                <span key={i} data-w>{i > 0 ? ' ' : ''}{w}</span>
              ))}
            </p>
          )}
        </div>
      )}
      {/* A clip with the sound OFF (▶ Auto): the beat's spoken line as a plain caption,
          so a student watching on mute still gets the words (SPEC-CLIP-PIPELINE §2b). */}
      {clip && pacing === 'auto' && !done && hasBeats(scene) && scene.beats[step] && (
        <div className={ribbonCls} aria-hidden data-ribbon="caption">
          <MutedCaption key={`${sceneIdx}:${step}`} className={lineCls} words={scene.beats[step].say.split(/\s+/).filter(Boolean)} paused={paused} />
        </div>
      )}
    </>
  );

  return (
    <>
    <div ref={rootRef} className={`${qSide ? 'max-w-4xl' : 'max-w-lg'} mx-auto pb-24 sm:pb-6 motion-safe:transition-transform duration-300 ${chatOpen && wide ? '-translate-x-[200px]' : ''}`} data-chat-sheet={sheet ? '' : undefined} data-lsn-theme={theme} data-lsn-themed={themed ? '' : undefined} data-lsn-clip={clip ? '' : undefined} data-qcard={clip && question && !wide ? '' : undefined}
      data-lsn-tip={tipStyle} data-lsn-write={writing ? 'on' : undefined}
      // The phone chat sheet covers the bottom half: the page needs that much more room to scroll the clip up.
      style={sheet ? { ...themeStyle, paddingBottom: '42dvh' } : themeStyle}>
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
      <div className={`flex items-center gap-2.5 ${embedded ? 'mb-2' : 'pt-1 mb-3'}`}>
        {embedded ? null : onClose ? (
          <button type="button" onClick={onClose} aria-label="Back"
            className="shrink-0 w-9 h-9 rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-navy inline-flex items-center justify-center hover:bg-slate-50 active:scale-95 motion-safe:transition-transform">
            <span className="text-lg leading-none" aria-hidden>‹</span>
          </button>
        ) : (
          <Link href={backHref} aria-label="Back"
            className="shrink-0 w-9 h-9 rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-navy inline-flex items-center justify-center hover:bg-slate-50 active:scale-95 motion-safe:transition-transform">
            <span className="text-lg leading-none" aria-hidden>‹</span>
          </Link>
        )}
        <div className={`min-w-0 flex-1 ${embedded ? 'invisible h-0' : ''}`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">▶ {kicker} · {minutes} min</p>
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
          {clip && question && !wide && (
            <button type="button" onClick={() => setQOpen(o => !o)} aria-pressed={qOpen} aria-label="The whole question" data-question-pill
              className={`${PILL} ${qOpen ? PILL_ON : PILL_OFF}`}>📄</button>
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
      {!clip && <div className="lsn-dots flex items-center gap-1 mb-3 px-0.5" aria-hidden>
        {scenes.map((_, i) => (
          <span key={i}
            className={`h-1.5 rounded-full ${
              done || i < sceneIdx ? 'w-1.5 bg-navy/60' : i === sceneIdx ? 'w-6 bg-navy' : 'w-1.5 bg-slate-200'}`}
            style={{ transition: `width 300ms ${EASE}, background-color 300ms ease` }} />
        ))}
      </div>}

      {/* A question clip on a laptop: the whole question on the left, the clip on the right
          (Adrian, 15 Oct 2026). On a phone there is no room beside or above the board (it already
          fills the screen), so the 📄 pill in the header lays the question over the board.
          Hidden while the laptop chat panel is open. */}
      <div className={qSide ? 'lg:grid lg:grid-cols-[minmax(0,300px)_minmax(0,512px)] lg:gap-5 lg:justify-center lg:items-start' : undefined}>
      {qSide && question && (
        <aside className="lsn-question lg:sticky lg:top-20 rounded-3xl p-5 text-[15px] leading-relaxed" data-lsn-question>
          <p className="lsn-question-kicker text-[11px] font-bold uppercase tracking-wider mb-2">The question</p>
          <div className="whitespace-pre-line"><MathText text={question} /></div>
        </aside>
      )}
      <div className="min-w-0">
      {/* The question on a phone: always in view ABOVE the clip, off the board (Adrian, 17 Oct 2026:
          "we should put the question out for students to see, perhaps the question should be at the
          top (but not in the clip?)"). Two lines at most; a long one opens whole on a tap. */}
      {clip && question && !wide && !done && (
        <button type="button" onClick={() => setQOpen(o => !o)} data-question-strip
          className="lsn-qstrip relative block w-full text-left mt-3 mb-2 rounded-2xl bg-white ring-1 ring-slate-200 px-3.5 pt-3 pb-2 shadow-[0_6px_16px_-12px_rgba(15,23,42,0.4)] active:scale-[0.99] motion-safe:transition-transform">
          {/* Design B (Adrian picked it, 17 Oct 2026): an amber tag floats on the card's top edge. */}
          <span className="absolute -top-2.5 left-3 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">Question</span>
          {/* The WHOLE question, always (Adrian, 18 Oct 2026: "the question itself is only partially shown"). */}
          <span className={`block ${question.length > 140 ? 'text-[13px] leading-[1.3]' : 'text-[15px] leading-snug'} text-navy`}><MathText text={question} /></span>
        </button>
      )}
      {done ? (
        /* ── Completion — the closer CTA ── */
        <div className="bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-6 min-h-[440px] flex flex-col items-center justify-center text-center lsn-scene">
          <span className="inline-block text-4xl mb-3 lsn-rise" aria-hidden>🎉</span>
          <h2 className="text-xl font-bold text-navy lsn-ink lsn-rise" style={{ animationDelay: '120ms' }}>{doneTitle}</h2>
          <p className="mt-2 max-w-xs text-sm text-slate-600 lsn-ink-2 lsn-rise" style={{ animationDelay: '240ms' }}>
            {doneText}
          </p>
          {onClose ? (
            <button type="button" onClick={onClose}
              className="block text-center mt-6 w-full max-w-xs bg-amber-400 text-navy rounded-2xl px-4 py-3.5 font-bold text-[15px] shadow-[0_8px_24px_-10px_rgba(245,158,11,0.8)] hover:bg-amber-300 active:scale-[0.98] motion-safe:transition lsn-rise"
              style={{ animationDelay: '360ms' }}>
              {practiceLabel ?? '‹ Back to the question'}
            </button>
          ) : (
            <Link href={practiceHref}
              className="block text-center mt-6 w-full max-w-xs bg-amber-400 text-navy rounded-2xl px-4 py-3.5 font-bold text-[15px] shadow-[0_8px_24px_-10px_rgba(245,158,11,0.8)] hover:bg-amber-300 active:scale-[0.98] motion-safe:transition lsn-rise"
              style={{ animationDelay: '360ms' }}>
              {practiceLabel ?? `✏️ Practise ${topic} →`}
            </Link>
          )}
          <button type="button" onClick={restart}
            className="mt-3 text-sm font-semibold text-slate-500 lsn-muted hover:text-navy">
            ↺ Watch again
          </button>
        </div>
      ) : (
        /* ── The scene card. Tapping it advances (except mid-check); while
              paused, a tap resumes instead. ── */
        <div key={`${sceneIdx}:${seekEpoch}`} ref={cardRef} onClick={onCardTap} data-paused={paused || undefined} data-beats={board ? maxStep : undefined}
          style={sheet && sheetFit.scale < 1 ? { scale: String(sheetFit.scale), transformOrigin: 'top center', marginBottom: `${-((1 - sheetFit.scale) * sheetFit.height)}px` } : undefined}
          data-step={step} data-leaving={leaving || undefined}
          className={`lsn-scene relative bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5 flex flex-col ${themed ? 'lsn-stage' : 'min-h-[440px]'} ${gated ? '' : 'cursor-pointer'}`}>
          {/* The method's steps, pinned above the board for the whole clip; the step being done is lit
              (Adrian, 18 Oct 2026: "list it out on screen … keeping those steps in view … highlight
              the steps when it comes to their turn"). Outside the board, so it never scrolls away. */}
          {scene.type === 'equation-steps' && (scene.pinned?.length || scene.sketch) && (
            <div className="lsn-sidewrap" data-has-sketch={scene.sketch ? '' : undefined}>
              {scene.pinned?.length && board && board.pinShown > 0 ? (
                <ol className="lsn-pinned" data-lsn-pinned>
                  {scene.pinned.slice(0, board.pinShown).map((t, i) => (
                    <li key={i} data-on={board.pinLit === i + 1 || undefined} data-done={board.pinLit > i + 1 || undefined}>
                      <span className="lsn-pinned-n">{i + 1}</span><MathText text={t} />
                    </li>
                  ))}
                </ol>
              ) : <div className="lsn-pinned lsn-pinned-empty" aria-hidden />}
              {scene.sketch && board && <SketchPanel sk={scene.sketch} stages={board.sketch} />}
            </div>
          )}
          {/* The plan, floating in the top-right corner once it is written, outside the board so it
              never scrolls away (Adrian, 20 Oct 2026: "put that plan at perhaps the top right hand
              corner (always) so that it is a constant reminder"). The box is padded for a FRACTION plan
              too (20 Oct 2026, Surds: "plan can't be seen … it's partially covered" — the 3 px padding
              fitted a one-line plan; a fraction's top and bottom touched the border). */}
          {scene.type === 'equation-steps' && board && (() => {
            const ci = scene.steps.findIndex(st => st.corner);
            if (ci < 0 || !lineOn(board, ci)) return null;
            return (
              <div data-lsn-corner className="lsn-corner absolute top-3 right-3 z-10 pointer-events-none">
                <MathText text={scene.steps[ci].tokens.map(t => `$${t.tex}$`).join(' ')} />
              </div>
            );
          })()}
          <BoardLayer board={board} notes={marginNotes} reduced={reduced} rate={rate} writing={writing} paused={paused}
            character={characterOn ? (board?.pose ?? 'idle') : null} look={look}>
            {scene.type === 'title' && <TitleView scene={scene} minutes={minutes} timed={timed} board={board} />}
            {scene.type === 'caption' && <CaptionView scene={scene} timed={timed} board={board} />}
            {scene.type === 'equation-steps' && <EquationStepsView scene={scene} step={step} reduced={reduced} timed={timed} board={board} clip={clip} />}
            {scene.type === 'graph-morph' && <GraphMorphView scene={scene} step={step} reduced={reduced} board={board} />}
            {scene.type === 'motion-graph' && <MotionGraphView scene={scene} step={step} reduced={reduced} timed={timed} board={board} />}
            {scene.type === 'annotate' && <AnnotateView scene={scene} step={step} timed={timed} board={board} />}
            {scene.type === 'check' && (
              <CheckView scene={scene} slug={slug} timed={timed} board={board}
                onCorrect={cheerSrc ? playCheer : undefined}
                onResolved={() => setResolved(prev => new Set(prev).add(sceneIdx))} />
            )}
            {scene.type === 'check-skipped' && <CheckSkippedView />}
          </BoardLayer>
          {/* A written side point (Beat.aside.read) sits ON the board, so nothing under it moves
              (Adrian, 18 Oct 2026: "when the popup appears, it pushes the slider down > any better,
              more elegant way?"): a small 💡 chip in the board's top corner; a tap lays the
              explanation over the board, the clip paused behind it. Closed until asked for. */}
          {clip && hasBeats(scene) && (() => {
            const reads = scene.beats.slice(0, step + 1).map((b, i) => ({ a: b.aside, i })).filter((r): r is { a: { text: string; slug: string; read: string[] }; i: number } => !!r.a?.read?.length);
            const a = reads[reads.length - 1]?.a;
            if (!a) return null;
            const open = readOpen === a.slug;
            // Once its step has passed, the chip shrinks to a small 💡 so it does not sit on the maths
            // scrolling past the corner (19 Oct 2026, seen in Compare powers: it hid "y = 10 − 2x").
            const small = step - reads[reads.length - 1].i > 1;
            // With steps pinned along the top (graph sketching), the top corner is a step: the chip
            // goes to the bottom corner instead (20 Oct 2026, Exponential graphs: it hid step 4 "draw").
            const low = scene.type === 'equation-steps' && (!!scene.pinned?.length || scene.steps.some(st => st.corner));
            const at = low ? (small ? 'bottom-16 right-1.5' : 'bottom-16 right-2.5') : (small ? 'top-1.5 right-1.5' : 'top-2.5 right-2.5');
            return (<>
              {!open && (
                <button key={`chip-${a.slug}`} type="button" data-aside-read-chip aria-expanded={false} aria-label={a.text}
                  onClick={e => { e.stopPropagation(); toggleRead(a.slug); }}
                  data-small={small || undefined}
                  className={`lsn-read-chip absolute z-20 inline-flex items-center gap-1 rounded-full bg-amber-100/95 text-navy font-bold shadow-md transition-all duration-300 ${at} ${small ? 'text-[12px] px-1.5 py-1' : 'text-[13px] px-3 py-1.5'}`}>
                  {small ? '💡' : '💡 Why?'}
                </button>
              )}
              {open && (
                <div data-aside-read onClick={e => { e.stopPropagation(); toggleRead(a.slug); }}
                  className="lsn-read-veil absolute inset-0 z-30 rounded-3xl bg-slate-950/45 flex items-end p-2.5 cursor-default">
                  <div role="dialog" aria-label={a.text} onClick={e => e.stopPropagation()}
                    className="lsn-read-card w-full max-h-full overflow-y-auto rounded-2xl bg-[hsl(45,40%,98%)] px-3.5 pt-2.5 pb-3 text-[14px] leading-snug sm:text-[15px] sm:leading-relaxed text-slate-800 shadow-xl">
                    <div className="flex items-start gap-2 mb-1.5">
                      <p className="flex-1 text-[14px] font-bold text-navy">💡 {a.text}</p>
                      <button type="button" aria-label="Close" onClick={() => toggleRead(a.slug)}
                        className="shrink-0 -mt-0.5 w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-[15px] font-bold">✕</button>
                    </div>
                    <ul className="space-y-1 sm:space-y-1.5">
                      {a.read.map((l, i) => <li key={i}><MathText text={l} /></li>)}
                    </ul>
                  </div>
                </div>
              )}
            </>);
          })()}
          {/* The tap's own feedback: ⏸ / ▶ in the middle of the board, grown and
              gone inside half a second — the gesture every video player uses. */}
          {gesture && (
            <span key={gesture.id} aria-hidden data-lsn-gesture={gesture.glyph === '⏸' ? 'pause' : 'play'}
              className="lsn-gesture">{gesture.glyph}</span>
          )}
          {/* 🎬 The tutor's cheer after a correct check (lib/lesson-extras). Always in the DOM
              when the lesson has one, so the Check tap can start it with sound; shown only
              while it plays. Tapping it stops it. */}
          {cheerSrc && scene.type === 'check' && (
            <video ref={cheerElRef} src={cheerSrc} poster={cheerSrc.replace(/\.mp4$/, '.jpg')} playsInline preload="auto" aria-hidden data-lsn-cheer={cheering ? 'on' : 'off'}
              onEnded={() => setCheerScene(null)} onError={() => setCheerScene(null)}
              onClick={(e) => { e.stopPropagation(); e.currentTarget.pause(); setCheerScene(null); }}
              className={`absolute right-3 top-3 w-[42%] max-w-[200px] aspect-square rounded-2xl object-cover shadow-[0_10px_28px_-10px_rgba(0,0,0,0.6)] motion-safe:transition-opacity duration-300 ${cheering ? 'opacity-100 z-20' : 'opacity-0 pointer-events-none -z-10'}`} />
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
          {/* A clip's subtitles: the spoken line over the bottom of the board, like a video's
              (Adrian, 15 Oct 2026: "the voice transcript at the bottom of the clip, like how youtube
              have subs"). The stage keeps that strip clear (padding), so no working is covered. */}
          {clip && subtitles}
          {clip && question && !wide && qOpen && (
            <div role="dialog" aria-label="The whole question" data-lsn-question
              onClick={(e) => { e.stopPropagation(); setQOpen(false); }}
              className="lsn-question absolute inset-x-3 top-3 z-30 max-h-[78%] overflow-auto rounded-2xl p-4 text-[15px] leading-relaxed lsn-rise">
              <p className="lsn-question-kicker text-[11px] font-bold uppercase tracking-wider mb-2">The question <span className="float-right normal-case">✕</span></p>
              <div className="whitespace-pre-line"><MathText text={question} /></div>
            </div>
          )}
        </div>
      )}

      {/* A clip: a slider to drag to any part (Adrian, 15 Oct 2026: "a drag slider to allow
          students to go to any parts they want on the clip"). One stop per beat; landing on a
          beat shows the board up to it and the voice starts that beat. Under the board, like a video's
          progress bar (Adrian, 15 Oct 2026: "put the slider below the clip"). */}
      {/* Side links from the beats so far (Beat.aside): another clip that explains one point in
          depth, a tap away, without stopping the main lesson for everyone. */}
      {clip && !done && (() => {
        const sc = scenes[sceneIdx];
        const links = hasBeats(sc) ? sc.beats.slice(0, step + 1).map(b => b.aside).filter((a): a is { text: string; slug: string; read?: string[] } => !!a) : [];
        if (!links.some(a => !a.read?.length)) return null;   // written points live ON the board
        return (
          <div className="mt-2 flex flex-wrap gap-2 px-0.5">
            {links.filter(a => !a.read?.length).map(a => asides[a.slug] ? (
              <button key={a.slug} type="button" onClick={() => openSide(a.slug)} data-aside-chip
                className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(45,60%,97%)] border border-amber-200 px-3 py-1.5 text-[13px] font-semibold text-navy hover:bg-amber-50">
                💡 {a.text}
              </button>
            ) : (
              <Link key={a.slug} href={`/app/lesson/${a.slug}?from=${encodeURIComponent(slug)}&fromAt=${stopAt}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(45,60%,97%)] border border-amber-200 px-3 py-1.5 text-[13px] font-semibold text-navy hover:bg-amber-50">
                ▶ {a.text}
              </Link>
            ))}
            {side && asides[side] && typeof document !== 'undefined' && createPortal(
              <SidePopup clip={asides[side]} onClose={closeSide} />, document.body)}
          </div>
        );
      })()}

      {clip && (() => {
        const at = done ? stops.length - 1 : stopAt;
        const n = stops.length;
        // A video's bar (Adrian, 17 Oct 2026: "when moving the scroll bar … able to make it smooth? like
        // youtube"): the thumb glides through each part with the voice (scrubTick), a touch ANYWHERE on
        // the bar brings the thumb to the finger at once and it follows the drag; the clip goes to that
        // part when the finger lifts ("I want the slider to come to the finger immediately"). ⏪ 10 / 10 ⏩
        // jump about ten seconds of voice.
        const valueAt = (x: number) => {
          const el = scrubRef.current;
          if (!el) return 0;
          const r = el.getBoundingClientRect();
          return Math.max(0, Math.min(n, ((x - r.left) / Math.max(1, r.width)) * n));
        };
        const paint = (v: number) => {
          const el = scrubRef.current;
          if (!el) return;
          el.value = String(v);
          el.style.setProperty('--lsn-scrub', `${(v / Math.max(1, n)) * 100}%`);
          if (scrubLabel.current) scrubLabel.current.textContent = `${Math.min(n, Math.floor(v) + 1)}/${n}`;
        };
        // Where the board is (or is about to be, mid-drag): many pointer moves land before React
        // renders, so compare with this, not with the render's `at` — one seek per part crossed.
        scrubAt.current = scrubDrag.current ? scrubAt.current : at;
        const seekTo = (to: number) => {
          to = Math.min(n - 1, Math.max(0, to));
          const from = scrubAt.current;
          if (to === from && !done) return;
          const [si, k] = stops[to] ?? stops[0];
          if (to < from) setSeekEpoch(x => x + 1);
          scrubAt.current = to;
          setDone(false); setSceneIdx(si); setStep(k);
        };
        return (
          <div className="lsn-scrub mt-2 px-0.5 flex items-center gap-1.5">
            <button type="button" onClick={() => seekTo(jumpSeconds(-5))} aria-label="Back 5 seconds"
              className="shrink-0 h-8 px-2 rounded-full bg-white text-navy text-[12px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.08)] active:scale-95">⏪ 5</button>
            <div className="relative flex-1 flex items-center touch-none"
              onPointerDown={e => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                scrubDrag.current = true;
                // The voice holds while the finger drags (the board follows it), and goes on after.
                scrubWasPlaying.current = !paused;
                if (!paused) setPaused(true);
                const v = valueAt(e.clientX);
                paint(v);
                seekTo(Math.floor(v));
              }}
              onPointerMove={e => {
                if (!scrubDrag.current) return;
                const v = valueAt(e.clientX);
                paint(v);
                // Like a video bar: the board moves to the part under the finger as it drags.
                seekTo(Math.floor(v));
              }}
              onPointerUp={e => {
                if (!scrubDrag.current) return;
                scrubDrag.current = false;
                seekTo(Math.floor(valueAt(e.clientX)));
                if (scrubWasPlaying.current) setPaused(false);
              }}
              onPointerCancel={() => { scrubDrag.current = false; if (scrubWasPlaying.current) setPaused(false); }}>
              <input ref={scrubRef} type="range" min={0} max={Math.max(1, n)} step="any" defaultValue={at}
                aria-label="Go to a part of the clip"
                onChange={e => { paint(Number(e.target.value)); seekTo(Math.floor(Number(e.target.value))); }}
                className="lsn-scrub-range flex-1 pointer-events-none" />
            </div>
            <button type="button" onClick={() => seekTo(jumpSeconds(5))} aria-label="Forward 5 seconds"
              className="shrink-0 h-8 px-2 rounded-full bg-white text-navy text-[12px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.08)] active:scale-95">5 ⏩</button>
            <span ref={scrubLabel} className="text-[11px] tabular-nums text-slate-400 w-9 text-right" />
          </div>
        );
      })()}

      {!clip && subtitles}

      {/* Bottom controls — fixed shape, never jumps between scenes. */}
      {!done && !embedded && (
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

      {/* 💬 Ask about this step: opens the chat with the clip still playing (clip-ask-panel.tsx). */}
      {canAsk && (
        <div className="mt-3" data-clip-ask>
          <button type="button" onClick={() => setChatOpen(o => !o)} aria-expanded={chatOpen}
            className={`w-full h-11 rounded-2xl border text-[14px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99] motion-safe:transition ${chatOpen ? 'bg-amber-50 border-amber-300 text-navy' : 'bg-white border-slate-200 text-navy hover:bg-slate-50'}`}>
            <span aria-hidden>💬</span> {chatOpen ? 'Close the chat' : 'Ask about this step'}
          </button>
        </div>
      )}
      </div>
      </div>
    </div>
    {/* Outside the sliding column: a fixed panel inside a transformed box would move with it. */}
    {clip && askAbout && chatOpen && (
      <ClipAskPanel botLevel={askLevel} asks={askNow} label={askLabel} getStep={getAskStep} onClose={() => setChatOpen(false)} />
    )}
    </>
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
[data-lsn-clip] .lsn-scene { animation: lsnFade 700ms ease-out both; }
[data-lsn-clip] .lsn-scene .lsn-board { transition: opacity ${SCENE_LEAVE_MS}ms ease-in; }
[data-lsn-clip] .lsn-scene[data-leaving] .lsn-board { opacity: 0; }
.lsn-rise { animation: lsnRise 420ms ${EASE} both; }
/* Two answers side by side, each worked straight down its own column (EquationStep.cols). */
.lsn-line .lsn-tokrow.lsn-cols { display: grid; grid-template-columns: minmax(0, 1fr) 3.2em minmax(0, 1fr); justify-items: start; align-items: baseline; column-gap: 0.4em; }
.lsn-line .lsn-tokrow.lsn-cols > :nth-child(2) { justify-self: center; }
.lsn-line .lsn-tokrow.lsn-cols[data-cols="2"] > :nth-child(2) { grid-column: 3; justify-self: start; }
.lsn-line { opacity: 0; transform: translateY(6px); transition: opacity 420ms ${EASE}, transform 420ms ${EASE}; }
.lsn-line.on { opacity: 1; transform: none; }
.lsn-tok { transition: opacity 180ms ease; }
.lsn-landing { opacity: 0 !important; }
.lsn-into-wait { opacity: 0 !important; }
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
/* A clip: one concept on a phone board. The working is the whole picture, so it
   is set large, and the lines stand apart so an arc over or under a row has
   its own air (never across the heading or the next line). */
[data-lsn-clip] .lsn-line .lsn-tok { font-size: calc(var(--lsn-line-px) * 1.45 * var(--lsn-clip-fit, 1) * var(--lsn-row-scale, 1)); }
[data-lsn-clip] .lsn-tokrow { column-gap: 0.7rem; flex-wrap: nowrap; }
[data-lsn-clip] .lsn-tokrow > * { flex-shrink: 0; white-space: nowrap; }
/* A tight token (a power or a base that flies into place) sits against the one before it. */
.lsn-tokrow > .lsn-tok-tight { margin-left: -0.375rem; }
.lsn-tok[data-gone] { display: none !important; }
.lsn-tok[data-held] { display: none !important; visibility: hidden !important; }
.lsn-note-away { display: none !important; }
/* The whole question sits in the card above the clip: the board's own short copy would say it twice. */
[data-qcard] [data-board-intro] { display: none !important; }
.lsn-graph { display: block; width: min(100%, 300px); height: auto; margin: 6px 0 2px; overflow: visible; }
.lsn-graph-axis { stroke: rgba(248,250,252,0.55); stroke-width: 1.4; }
.lsn-graph-lab { fill: rgba(248,250,252,0.85); font: italic 12px Georgia, 'Times New Roman', serif; }
.lsn-graph-curve { fill: none; stroke: #ffe89a; stroke-width: 2.6; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
.lsn-graph.on .lsn-graph-curve { stroke-dashoffset: 0; transition: stroke-dashoffset 1.8s ease-in-out 0.3s; }
.lsn-sidewrap { position: relative; z-index: 6; }
.lsn-pinned-empty { margin: 0; height: 0; }
.lsn-sketch { position: absolute; top: calc(100% + 4px); right: 0; width: 46%; pointer-events: none; }
.lsn-sketch svg { display: block; width: 100%; height: auto; overflow: visible; }
.lsn-sketch-inset { background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; }
.lsn-sketch-inset .lsn-graph-lab { font-size: 15px; font-weight: 600; }
.lsn-sketch-inset .lsn-graph-curve { stroke-width: 3.2; }
.lsn-sketch-inset .lsn-graph-c.lsn-lit .lsn-graph-curve { stroke-width: 4.6; }
.lsn-sketch-main .lsn-graph-lab { font-size: 14px; }
.lsn-sketch-main .lsn-graph-axis { stroke-width: 1.8; }
.lsn-sketch-main { margin-top: 8px; animation: lsnFade 400ms ease both; }
.lsn-sketch-curve { fill: none; stroke: #ffe89a; stroke-width: 3.6; stroke-linecap: round; }
/* The lifted shape keeps the colour it had in the corner (a moving piece keeps its colour). */
.lsn-sketch-curve[data-ci="1"] { stroke: #a8ecfb; } .lsn-sketch-curve[data-ci="2"] { stroke: #fda4af; } .lsn-sketch-curve[data-ci="3"] { stroke: #c4b5fd; }
.lsn-sketch-asy { animation: lsnFade 500ms ease both; }
.lsn-sketch-asy line { stroke: #a8ecfb; stroke-width: 1.5; stroke-dasharray: 5 4; }
.lsn-sketch-pt { animation: lsnFade 400ms ease both; }
.lsn-sketch-pt circle { fill: #f9a8d4; }
.lsn-sketch-draw { stroke-dasharray: 1; animation: lsnSketchDraw 1.8s ease-in-out both; }
@keyframes lsnSketchDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
.lsn-sketch-hline { animation: lsnFade 400ms ease both; }
.lsn-sketch-hline line { stroke: #fdba74; stroke-width: 2.6; stroke-linecap: round; }
.lsn-sketch-hline text { fill: #fdba74; font-weight: 700; }
/* A dark outline round the labels: the line y = c can sit on a dashed asymptote (c = 4 on y = 4,
   25 Oct 2026) and both labels must still read. */
.lsn-sketch-hline text, .lsn-sketch-asy text { paint-order: stroke; stroke: rgba(15,23,42,0.9); stroke-width: 4px; stroke-linejoin: round; }
.lsn-sketch-label { animation: lsnFade 500ms ease 1.6s both; }
.lsn-sketch-label text, text.lsn-sketch-label { fill: #ffe89a; font-size: 13px; paint-order: stroke; stroke: rgba(15,23,42,0.9); stroke-width: 4px; stroke-linejoin: round; }
.lsn-sketch-label line { stroke: #ffe89a; stroke-width: 1.2; }
.lsn-sketch-hit { fill: #fb7185; animation: lsnFade 400ms ease 650ms both; }
/* The corner plan owns the top-right corner: the side sketch starts under it. */
.lsn-scene:has([data-lsn-corner]) .lsn-sketch { top: calc(100% + 54px); }
/* With a side sketch the working takes the left of the board, the sketch the right. */
.lsn-scene:has(.lsn-sidewrap[data-has-sketch]) .lsn-zoom { width: 54%; flex: none; }
/* The pinned steps own the top of the card: the Paused chip moves down, above the subtitle. */
.lsn-scene:has(.lsn-pinned li) .lsn-paused-chip { top: auto; bottom: 4.6rem; right: 50%; translate: 50% 0; }
.lsn-scene:has([data-lsn-corner]) .lsn-paused-chip { top: auto; bottom: 4.6rem; right: 50%; translate: 50% 0; }
.lsn-line-corner { display: none; }
.lsn-corner { padding: 9px 9px 7px; border-radius: 12px; font-size: 15px; color: #7dd3fc; background: rgba(15,23,42,0.55); border: 1px solid rgba(125,211,252,0.35); animation: lsnFade 400ms ease both; }
@media (min-width: 520px) { .lsn-corner { font-size: 17px; } }
.lsn-pinned { display: flex; flex-wrap: wrap; gap: 4px 4px; margin: 0 0 8px; padding: 0; list-style: none; animation: lsnFade 300ms ease both; position: relative; z-index: 5; }
.lsn-pinned li { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px 2px 3px; border-radius: 999px; font: 600 11.5px ui-sans-serif, system-ui, sans-serif; color: rgba(248,250,252,0.7); background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); transition: background 300ms ease, color 300ms ease, border-color 300ms ease; }
.lsn-pinned-n { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 999px; background: rgba(255,255,255,0.14); font-size: 11px; }
.lsn-pinned li[data-done] { color: rgba(248,250,252,0.5); }
.lsn-pinned li[data-on] { color: #1e293b; background: #fcd34d; border-color: #fcd34d; box-shadow: 0 0 10px rgba(252,211,77,0.55); }
.lsn-pinned li[data-on] .lsn-pinned-n { background: rgba(30,41,59,0.18); }
@media (min-width: 520px) { .lsn-pinned li { font-size: 14px; } }
.lsn-graph-clab { opacity: 0; transition: opacity 400ms ease 1.6s; font-size: 11px; }
.lsn-graph.on .lsn-graph-clab { opacity: 1; }
/* More curves on one sketch: each its own colour, its label in that colour (the four basic shapes). */
.lsn-graph-c[data-ci="1"] .lsn-graph-curve { stroke: #a8ecfb; } .lsn-graph-c[data-ci="1"] .lsn-graph-clab { fill: #a8ecfb; }
.lsn-graph-c[data-ci="2"] .lsn-graph-curve { stroke: #fda4af; } .lsn-graph-c[data-ci="2"] .lsn-graph-clab { fill: #fda4af; }
.lsn-graph-c[data-ci="3"] .lsn-graph-curve { stroke: #c4b5fd; } .lsn-graph-c[data-ci="3"] .lsn-graph-clab { fill: #c4b5fd; }
.lsn-graph-c[data-ci="0"] .lsn-graph-clab { fill: #ffe89a; }
/* One curve lit as the voice names it; the others step back. */
.lsn-graph:has(.lsn-graph-c.lsn-lit) .lsn-graph-c:not(.lsn-lit) { opacity: 0.3; transition: opacity 300ms ease; }
.lsn-graph-c.lsn-lit .lsn-graph-curve { stroke-width: 3.6; filter: drop-shadow(0 0 4px currentColor); }
.lsn-graph-c.lsn-lit .lsn-graph-clab { font-weight: bold; }
.lsn-graph-asy line { stroke: #a8ecfb; stroke-width: 1.4; stroke-dasharray: 5 4; }
.lsn-graph-asy, .lsn-graph-pt { opacity: 0; }
.lsn-graph.on .lsn-graph-asy { opacity: 1; transition: opacity 0.5s ease 0s; }
.lsn-graph.on .lsn-graph-pt { opacity: 1; transition: opacity 0.5s ease 2.1s; }
.lsn-graph-pt circle { fill: #f9a8d4; }
.lsn-back-now { position: absolute; right: 10px; bottom: 12px; z-index: 30; border-radius: 999px; padding: 6px 14px; font: 600 13px/1.2 ui-sans-serif, system-ui, sans-serif; color: hsl(220, 60%, 20%); background: hsl(45, 100%, 92%); box-shadow: 0 4px 14px -4px rgba(0,0,0,0.45); }
[data-lsn-clip] .lsn-tokrow > .lsn-tok-tight { margin-left: -0.7rem; }
[data-lsn-clip] .lsn-steps { margin-top: calc(2.6rem * var(--lsn-gap-fit, 1)); }
[data-lsn-clip] .lsn-steps > * + * { margin-top: calc(2.8rem * var(--lsn-gap-fit, 1)); }
/* The question above a clip's working: its maths is as large as its words. */
[data-lsn-clip] .lsn-body-steps > p .katex { font-size: 1.22em; }
/* Five lines or more: closer together, so the whole working stays on a phone screen (such a board has margin words, not arcs). */
[data-lsn-clip] .lsn-steps:has(> :nth-child(5)) > * + * { margin-top: calc(1.7rem * var(--lsn-gap-fit, 1)); }
[data-lsn-clip] .lsn-note-row { margin-top: 0.9rem; }
/* A board that carries laws beside its lines (the log clips, 15 Oct 2026) is taller: closer lines. */
[data-lsn-clip] .lsn-steps:has(.lsn-note-up) { margin-top: calc(1.4rem * var(--lsn-gap-fit, 1)); }
[data-lsn-clip] .lsn-steps:has(.lsn-note-up) > * + * { margin-top: calc(1.25rem * var(--lsn-gap-fit, 1)); }
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
/* A clip's highlight stays lit while it is talked about (lesson-board 2b): the chalk turns yellow. */
[data-lsn-clip] .lsn-lit, [data-lsn-clip] .lsn-lit .katex { color: var(--lsn-hl-amber); transition: color 250ms ease; }
/* A law's x and y, matched on the board: orange and blue chalk (Adrian, 16 Oct 2026). */
/* One letter of a fraction lit (Adrian, 18 Oct 2026: "when narrator says I is its intensity, we can
   highlight I, likewise for k"): KaTeX lays a fraction out bottom, line, top. */
[data-lsn-clip] .lsn-lit-num .mfrac > .vlist-t > .vlist-r:first-child > .vlist > span:nth-child(3),
[data-lsn-clip] .lsn-lit-den .mfrac > .vlist-t > .vlist-r:first-child > .vlist > span:nth-child(1) { color: var(--lsn-hl-amber); text-shadow: 0 0 8px rgba(252,211,77,0.65); transition: color 250ms ease; }
[data-lsn-clip] .lsn-lit-orange, [data-lsn-clip] .lsn-lit-orange .katex { color: #ff9a3c; text-shadow: 0 0 8px rgba(255,154,60,0.6); transition: color 250ms ease; }
[data-lsn-clip] .lsn-lit-blue, [data-lsn-clip] .lsn-lit-blue .katex { color: #a8ecfb; text-shadow: 0 0 8px rgba(168,236,251,0.6); transition: color 250ms ease; }
/* A piece inside a token (\htmlClass{lsn-pc-…}) lit on its own (19 Oct 2026). */
[data-lsn-clip] .lsn-lit-pc, [data-lsn-clip] .lsn-lit-pc * { color: var(--lsn-hl-amber); text-shadow: 0 0 8px rgba(252,211,77,0.65); transition: color 250ms ease; }
[data-lsn-clip] .lsn-lit-pc-orange, [data-lsn-clip] .lsn-lit-pc-orange * { color: #ff9a3c; text-shadow: 0 0 8px rgba(255,154,60,0.6); transition: color 250ms ease; }
[data-lsn-clip] .lsn-lit-pc-blue, [data-lsn-clip] .lsn-lit-pc-blue * { color: #a8ecfb; text-shadow: 0 0 8px rgba(168,236,251,0.6); transition: color 250ms ease; }
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
[data-lsn-themed] .lsn-graph-label { text-shadow: 0 0 5px rgba(15,23,42,0.95), 0 0 2px rgba(15,23,42,0.95); }
[data-lsn-themed] .lsn-ghost { stroke: var(--lsn-ghost); }
[data-lsn-themed] .lsn-poster { background: rgba(8, 12, 10, 0.42); }
[data-lsn-themed] .lsn-ribbon { background-color: var(--lsn-board); background-image: var(--lsn-texture); background-size: var(--lsn-texture-size); background-blend-mode: var(--lsn-texture-blend); border-radius: 14px; padding: 8px 12px; box-shadow: inset 0 0 0 1px var(--lsn-edge); }
[data-lsn-themed] .lsn-ribbon-line { color: var(--lsn-ribbon); border-color: var(--lsn-pen); }
[data-lsn-themed] .lsn-ribbon-line [data-w][data-on] { color: var(--lsn-ribbon-lit); }
/* Marks are chalk too: one colour per kind (pointing / attention / the answer). */
.lsn-marks path[data-mark="underline"] { stroke: var(--lsn-mark-underline, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-marks path[data-mark="circle"] { stroke: var(--lsn-mark-circle, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-marks path[data-mark="box"] { stroke: var(--lsn-mark-box, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-marks path[data-mark="arc"] { stroke: var(--lsn-mark-arc, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-marks path[data-mark="arc-under"] { stroke: var(--lsn-mark-arc-under, var(--lsn-pen, hsl(40, 85%, 52%))); }
[data-lsn-theme="chalk"] .lsn-marks path { stroke-width: 2.4; opacity: 0.96;
  -webkit-mask-image: ${CHALK_GRAIN}; mask-image: ${CHALK_GRAIN}; -webkit-mask-size: 72px 72px; mask-size: 72px 72px; }
/* An arc's number: a small ringed digit in the arc's own colour, fading in with it. */
/* (opacity only: a transform animation would override the SVG transform that places it) */
@keyframes lsnLabelIn { from { opacity: 0; } to { opacity: 1; } }
.lsn-arc-label { animation: lsnLabelIn 320ms ease both; }
.lsn-arc-label circle { fill: var(--lsn-board, #2b3531); stroke-width: 1.3; stroke: var(--lsn-mark-arc, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-arc-label text { font: 600 10.5px/1 ui-sans-serif, system-ui, sans-serif; stroke: none; fill: var(--lsn-mark-arc, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-arc-label[data-mark="arc-under"] circle { stroke: var(--lsn-mark-arc-under, var(--lsn-pen, hsl(40, 85%, 52%))); }
.lsn-arc-label[data-mark="arc-under"] text { fill: var(--lsn-mark-arc-under, var(--lsn-pen, hsl(40, 85%, 52%))); }
/* In a clip a note is the notes' own margin words ("← Add up like terms"): no "↳" in front. */
[data-lsn-clip] .lsn-note-row .lsn-note::before { content: none; }
/* The clip slider: a navy track filled to where the clip is, a thumb big enough for a thumb. */
/* A clip's subtitles: a dark strip over the bottom of the board, the words lighting up as they are
   said; the stage keeps 84 px clear at its foot so the strip never covers working. */
[data-lsn-clip] .lsn-stage { padding-bottom: 56px; }
@media (min-width: 520px) { [data-lsn-clip] .lsn-stage { padding-bottom: 72px; } }
.lsn-subs { position: absolute; left: 6px; right: 6px; bottom: 6px; min-height: 48px; display: flex; align-items: flex-end; justify-content: center; pointer-events: none; z-index: 15; }
.lsn-subs-line { animation: lsnFade 180ms ease both; background: rgba(8, 10, 14, 0.72); color: rgba(255, 255, 255, 0.62); border-radius: 10px; padding: 4px 10px; font-size: 13.5px; line-height: 1.35; text-align: center; max-width: 100%; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
.lsn-subs-line [data-w] { transition: color 160ms ease; }
.lsn-subs-line [data-piece]:not([data-active]) { display: none; }
.lsn-subs-line [data-w][data-on] { color: #fff; }
@media (min-width: 520px) { .lsn-subs { left: 10px; right: 10px; bottom: 10px; min-height: 56px; } .lsn-subs-line { font-size: 16px; padding: 5px 12px; } }
/* The whole question beside / above a question clip, on the board's colours. */
.lsn-question { background: #fff; color: hsl(220, 60%, 20%); box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 6px 16px -4px rgba(15,23,42,0.08); }
.lsn-question-kicker { color: rgb(148, 163, 184); }
[data-lsn-themed] .lsn-question { background-color: var(--lsn-board); background-image: var(--lsn-texture); background-size: var(--lsn-texture-size); background-blend-mode: var(--lsn-texture-blend); color: var(--lsn-ink, #f8fafc); box-shadow: inset 0 0 0 1px var(--lsn-edge); }
[data-lsn-themed] .lsn-question-kicker { color: var(--lsn-ribbon); }
.lsn-scrub-range { -webkit-appearance: none; appearance: none; height: 28px; background: transparent; touch-action: none; }
.lsn-scrub-range::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: linear-gradient(to right, hsl(220, 60%, 20%) var(--lsn-scrub), rgb(226, 232, 240) var(--lsn-scrub)); }
.lsn-scrub-range::-moz-range-track { height: 6px; border-radius: 999px; background: rgb(226, 232, 240); }
.lsn-scrub-range::-moz-range-progress { height: 6px; border-radius: 999px; background: hsl(220, 60%, 20%); }
.lsn-scrub-range::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 999px; background: hsl(220, 60%, 20%); border: 3px solid white; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35); }
.lsn-scrub-range::-moz-range-thumb { width: 16px; height: 16px; border-radius: 999px; background: hsl(220, 60%, 20%); border: 3px solid white; }
/* A clip's note points UP at its token (placeClipNotes): one note a row, the ↑ under the token. */
[data-lsn-clip] .lsn-note-row:has(.lsn-note-up) { flex-direction: column; margin-top: 0.35rem; }
[data-lsn-clip] .lsn-note-up { display: block; width: 100%; }
[data-lsn-clip] .lsn-note-up .lsn-note-arrow { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 600; }
[data-lsn-clip] .lsn-note-up .katex { font-size: 0.98em; }
[data-lsn-clip] .lsn-note-up .lsn-note-text { display: inline-block; white-space: nowrap; }
[data-lsn-clip] .lsn-note-up.stack .lsn-note-arrow { display: block; width: max-content; }
[data-lsn-clip] .lsn-note-up.stack .lsn-note-text { display: block; width: max-content; }
/* A mistake shown on the board (a note starting with ✗): red chalk. */
[data-lsn-clip] .lsn-note.lsn-note-warn, [data-lsn-clip] .lsn-note.lsn-note-warn .katex { color: var(--lsn-hl-rose, #fda4af); }
/* The base lit on its own (highlight part "sub"): the small 3 of log₃ in blue chalk. */
[data-lsn-clip] .lsn-lit-sub .msupsub, [data-lsn-clip] .lsn-lit-sub .msupsub .mord { color: var(--lsn-hl-sky, #7dd3fc); text-shadow: 0 0 6px var(--lsn-hl-sky, #7dd3fc), 0 0 12px var(--lsn-hl-sky, #7dd3fc); transition: color 250ms ease, text-shadow 250ms ease; }
/* An arrow is a clean line: no chalk grain eating into it, a touch finer. */
[data-lsn-theme="chalk"] .lsn-marks path[data-mark^="arc"] { -webkit-mask-image: none; mask-image: none; stroke-width: 2; opacity: 1; }
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
[data-lsn-write="on"] [data-ink], [data-lsn-write="on"] [data-ink] *:not([style*="color"]):not([style*="color"] *) { color: transparent !important; text-shadow: none !important; }
[data-lsn-write="on"] [data-ink] .katex, [data-lsn-write="on"] [data-ink] .katex *:not([style*="color"]):not([style*="color"] *) { color: var(--lsn-own-color, var(--lsn-ink)) !important; }
/* …except maths that carries its OWN colour (a textcolor — a law's x in orange and y in blue, Adrian
   16 Oct 2026): it keeps that colour. */
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
.lsn-read-chip { animation: lsnFade 240ms ease both; }
/* The 💡 Why? chip owns the top corner; the Paused chip steps left of it. */
.lsn-scene:has([data-aside-read-chip]) .lsn-paused-chip { right: 6rem; }
.lsn-scene:has([data-aside-read-chip][data-small]) .lsn-paused-chip { right: 3rem; }
.lsn-read-chip[data-small] { opacity: 0.6 !important; }
.lsn-read-veil { animation: lsnFade 180ms ease both; }
.lsn-read-card { animation: lsnReadUp 240ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes lsnReadUp { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .lsn-read-chip, .lsn-read-veil, .lsn-read-card { animation: none; } }
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
