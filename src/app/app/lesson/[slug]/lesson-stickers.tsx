'use client';

// Stickers (1 Oct 2026, Adrian: "do the stickers") — small reaction pictures the
// clip drops onto the board at the moment the voice says the thing, gone when the
// next beat starts: the "viral shot" feel of 洋葱学园 / 作业帮 videos. The rules he
// agreed: at most ONE per beat, two or three per clip, a FIXED curated set (no live
// search), sized like a thumb (~64–96 px on a phone), placed beside the line it is
// about or at a corner.
//
// The twenty-two kinds (lib/lesson-script STICKER_KINDS) are inline SVG — no image
// files, no dependency — flat, bold, two or three colours each, readable at 64 px.
// Each is one function keyed by its kind name, so a LottieFiles / Tenor asset can
// replace any one later behind the same name (docs/LESSONS.md § Stickers). The
// pop-in (scale 0.6 → 1.05 → 1, 220 ms) and the tiny idle wobble are CSS;
// prefers-reduced-motion shows the sticker still.
//
// Placement (LessonSticker): `near` a token → measured like a mark (offsetRect of
// the token's resting box inside the zoom wrapper), set just right of that token's
// line; no room there, or no `near`, → the board's top-right corner. It never sits
// on the character (bottom-right): the near placement falls back to the corner
// when it would reach into that corner. Absolutely positioned in the overlay,
// pointer-events none — a sticker never moves a glyph.

import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { STICKER_KINDS, type StickerKind } from '@/lib/lesson-script';

// The same two helpers lesson-board.tsx exports — repeated here (six lines) so this
// file and the board layer never import each other.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
/** An element's LAYOUT box inside `container` via the offsetParent chain (transform-immune: the resting glyph). */
function offsetRect(el: HTMLElement, container: HTMLElement) {
  let x = 0, y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

export const STICKER_CSS = `
.lsn-sticker { position: absolute; width: var(--lsn-sticker-size, clamp(64px, 22%, 96px)); aspect-ratio: 1 / 1; pointer-events: none; z-index: 5;
  animation: lsnStickerPop 220ms cubic-bezier(0.22, 1, 0.36, 1) both, lsnStickerWobble 2.6s ease-in-out 220ms infinite; transform-origin: 50% 60%; }
.lsn-sticker[data-place="corner"] { top: 4px; right: 4px; }
.lsn-sticker svg { width: 100%; height: 100%; display: block; overflow: visible; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25)); }
.lsn-sticker .s-line { stroke: #2b2320; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
@keyframes lsnStickerPop { 0% { transform: scale(0.6); opacity: 0; } 70% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes lsnStickerWobble { 0%, 100% { rotate: -3deg; } 50% { rotate: 3deg; } }
@media (prefers-reduced-motion: reduce) { .lsn-sticker { animation: none !important; } }
`;

// ── The art — one SVG per kind, viewBox 0 0 64 64 ────────────────────────────

const Y = '#ffd34e', YD = '#e8a93a', K = '#2b2320', W = '#ffffff';

function Facepalm() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      {/* the face */}
      <circle cx="32" cy="36" r="25" fill={Y} className="s-line" />
      {/* two closed eyes — big arcs that stay visible above the fingertips */}
      <path d="M15 25 Q22 17 29 25" fill="none" stroke={K} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M35 25 Q42 17 49 25" fill="none" stroke={K} strokeWidth="3.4" strokeLinecap="round" />
      {/* the hand slapped over the face: four fingertips just under the eyes, palm down over the mouth */}
      <path d="M11 44 Q9 36 15 35 L15 33 Q15 29 19 29 Q23 29 23 33 L23 32 Q23 28 27 28 Q31 28 31 32 L31 31 Q31 27 35 27 Q39 27 39 31 L39 33 Q39 29 43 29 Q47 29 47 33 L47 46 Q47 56 37 58 L23 58 Q13 58 11 48 Z" fill={YD} className="s-line" />
      <path d="M23 33 L23 44 M31 32 L31 44 M39 33 L39 44" fill="none" stroke={K} strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
      {/* a sweat drop */}
      <path d="M56 6 Q63 18 58 23 Q53 26 51 21 Q49 16 56 6 Z" fill="#4fb0ff" className="s-line" />
    </svg>
  );
}

function Lightbulb() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 4 L32 0 M14 10 L11 7 M50 10 L53 7 M8 26 L4 25 M56 26 L60 25" fill="none" stroke={YD} strokeWidth="3" strokeLinecap="round" />
      <path d="M32 8 Q14 8 14 26 Q14 36 22 42 L22 48 L42 48 L42 42 Q50 36 50 26 Q50 8 32 8 Z" fill={Y} className="s-line" />
      <path d="M26 30 L32 38 L38 30" fill="none" stroke={YD} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="23" y="48" width="18" height="6" rx="2" fill="#9aa3ad" className="s-line" />
      <rect x="26" y="54" width="12" height="6" rx="3" fill="#6b7480" className="s-line" />
    </svg>
  );
}

function Confetti() {
  const bits: [number, number, number, string, number][] = [
    [10, 14, -20, '#ff6b6b', 1], [26, 6, 30, '#4fb0ff', 1], [46, 10, 10, Y, 1], [56, 26, -35, '#7ed957', 1],
    [8, 36, 25, '#4fb0ff', 1], [22, 28, -10, Y, 0], [40, 30, 40, '#ff6b6b', 1], [54, 46, -15, Y, 1],
    [16, 52, 15, '#7ed957', 0], [34, 48, -30, '#4fb0ff', 1], [46, 58, 20, '#ff6b6b', 0], [30, 16, 0, '#7ed957', 0],
  ];
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      {bits.map(([x, y, r, c, rect], i) => rect
        ? <rect key={i} x={x} y={y} width="9" height="5" rx="1" fill={c} stroke={K} strokeWidth="1.5" transform={`rotate(${r} ${x + 4.5} ${y + 2.5})`} />
        : <circle key={i} cx={x + 3} cy={y + 3} r="3.5" fill={c} stroke={K} strokeWidth="1.5" />)}
    </svg>
  );
}

function Magnifier() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M38 38 L56 56" stroke={K} strokeWidth="9" strokeLinecap="round" />
      <path d="M38 38 L56 56" stroke="#a8713a" strokeWidth="5" strokeLinecap="round" />
      <circle cx="26" cy="26" r="18" fill="#bfe6ff" className="s-line" />
      <circle cx="26" cy="26" r="13" fill="#e8f7ff" />
      <path d="M17 22 Q20 15 27 15" fill="none" stroke={W} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Warning() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 6 L60 56 L4 56 Z" fill={Y} className="s-line" />
      <path d="M32 22 L32 38" stroke={K} strokeWidth="6" strokeLinecap="round" />
      <circle cx="32" cy="47" r="3.5" fill={K} />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="26" fill="#3ec46d" className="s-line" />
      <path d="M18 33 L28 43 L46 22" fill="none" stroke={W} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Question() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="26" fill="#4fb0ff" className="s-line" />
      <path d="M23 24 Q23 14 32 14 Q42 14 42 23 Q42 29 35 32 Q32 34 32 39" fill="none" stroke={W} strokeWidth="6" strokeLinecap="round" />
      <circle cx="32" cy="48" r="3.8" fill={W} />
    </svg>
  );
}

function Fire() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 4 Q36 18 46 24 Q56 32 52 46 Q48 60 32 60 Q16 60 12 46 Q9 34 20 24 Q22 32 28 30 Q24 16 32 4 Z" fill="#ff7a2f" className="s-line" />
      <path d="M32 30 Q38 38 40 46 Q40 56 32 56 Q24 56 24 46 Q25 40 32 30 Z" fill={Y} />
    </svg>
  );
}

function Sweat() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="34" r="24" fill={Y} className="s-line" />
      <path d="M16 24 L24 27 M40 27 L48 24" fill="none" className="s-line" />
      <circle cx="21" cy="34" r="2.6" fill={K} />
      <circle cx="37" cy="34" r="2.6" fill={K} />
      <path d="M20 46 L36 46" fill="none" className="s-line" />
      <path d="M53 8 Q62 22 56 28 Q50 32 47 26 Q44 20 53 8 Z" fill="#4fb0ff" className="s-line" />
      <path d="M52 20 Q51 24 54 25" fill="none" stroke={W} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 4 L39.5 23 L60 24.5 L44 37.5 L49.5 58 L32 46.5 L14.5 58 L20 37.5 L4 24.5 L24.5 23 Z" fill={Y} className="s-line" />
      <path d="M26 24 L32 12" fill="none" stroke={W} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function Clap() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 18 L8 10 M14 12 L12 4 M20 14 L22 6" fill="none" stroke={YD} strokeWidth="3" strokeLinecap="round" />
      <path d="M56 18 L56 10 M50 12 L52 4 M44 14 L42 6" fill="none" stroke={YD} strokeWidth="3" strokeLinecap="round" />
      {/* left hand */}
      <path d="M10 26 Q8 20 13 20 L26 20 Q31 20 31 26 L31 52 Q31 58 25 58 L18 58 Q10 58 10 48 Z" fill="#f6cfa6" className="s-line" />
      <path d="M17 20 L17 36 M23 20 L23 36" fill="none" stroke={K} strokeWidth="1.6" opacity="0.45" strokeLinecap="round" />
      {/* right hand */}
      <path d="M54 26 Q56 20 51 20 L38 20 Q33 20 33 26 L33 52 Q33 58 39 58 L46 58 Q54 58 54 48 Z" fill="#f6cfa6" className="s-line" />
      <path d="M47 20 L47 36 M41 20 L41 36" fill="none" stroke={K} strokeWidth="1.6" opacity="0.45" strokeLinecap="round" />
    </svg>
  );
}

function Eyes() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="18" cy="32" rx="14" ry="18" fill={W} className="s-line" />
      <ellipse cx="46" cy="32" rx="14" ry="18" fill={W} className="s-line" />
      <circle cx="23" cy="34" r="6" fill={K} />
      <circle cx="51" cy="34" r="6" fill={K} />
      <circle cx="25" cy="32" r="2" fill={W} />
      <circle cx="53" cy="32" r="2" fill={W} />
    </svg>
  );
}

function Thumbsup() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 30 L8 56 L18 56 L18 30 Z" fill="#4fb0ff" className="s-line" />
      <path d="M18 32 L28 10 Q34 6 36 12 L34 26 L52 26 Q58 26 57 32 L53 52 Q52 56 46 56 L18 56 Z" fill="#f6cfa6" className="s-line" />
      <path d="M36 36 L54 36 M36 46 L52 46" fill="none" stroke={K} strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function Hundred() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <text x="32" y="38" textAnchor="middle" fontFamily="Arial Black, Helvetica, Arial, sans-serif" fontWeight="900" fontSize="30" fill="#e8463a" stroke={K} strokeWidth="1.6" paintOrder="stroke">100</text>
      <path d="M8 46 L56 46 M8 54 L56 54" fill="none" stroke="#e8463a" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

function Clock() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 6 L58 12 M14 6 L6 12" fill="none" stroke={K} strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="34" r="24" fill={W} className="s-line" />
      <path d="M32 18 L32 34 L44 40" fill="none" stroke={K} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="34" r="3" fill="#e8463a" />
      <path d="M32 14 L32 17 M52 34 L49 34 M32 54 L32 51 M12 34 L15 34" fill="none" stroke={K} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Rocket() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 60 Q28 52 32 52 Q36 52 42 60 Q32 56 22 60 Z" fill="#ff7a2f" className="s-line" />
      <path d="M26 56 Q32 50 38 56 Q32 54 26 56 Z" fill={Y} />
      <path d="M20 46 L12 50 L16 36 L22 32 Z" fill="#e8463a" className="s-line" />
      <path d="M44 46 L52 50 L48 36 L42 32 Z" fill="#e8463a" className="s-line" />
      <path d="M32 4 Q46 16 42 46 L22 46 Q18 16 32 4 Z" fill={W} className="s-line" />
      <circle cx="32" cy="24" r="5" fill="#4fb0ff" className="s-line" />
    </svg>
  );
}

function Trophy() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 14 L8 14 Q6 30 18 32 M50 14 L56 14 Q58 30 46 32" fill="none" stroke={YD} strokeWidth="4" strokeLinecap="round" />
      <path d="M14 8 L50 8 L48 30 Q46 40 32 42 Q18 40 16 30 Z" fill={Y} className="s-line" />
      <path d="M28 42 L28 50 L36 50 L36 42 Z" fill={YD} className="s-line" />
      <rect x="18" y="50" width="28" height="8" rx="2" fill="#a8713a" className="s-line" />
      <path d="M32 16 L34.5 22 L41 22.5 L36 26.5 L37.5 33 L32 29.5 L26.5 33 L28 26.5 L23 22.5 L29.5 22 Z" fill={W} />
    </svg>
  );
}

function Brain() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M31 10 Q20 6 16 16 Q6 18 8 30 Q4 42 16 46 Q18 56 30 54 L31 54 Z" fill="#ff8fb4" className="s-line" />
      <path d="M33 10 Q44 6 48 16 Q58 18 56 30 Q60 42 48 46 Q46 56 34 54 L33 54 Z" fill="#ff8fb4" className="s-line" />
      <path d="M32 10 L32 54" fill="none" className="s-line" />
      <path d="M14 26 Q20 24 24 30 M12 38 Q20 34 24 42 M50 26 Q44 24 40 30 M52 38 Q44 34 40 42" fill="none" stroke="#c8405f" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Pencil() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(45 32 32)">
        <rect x="24" y="4" width="16" height="8" rx="2" fill="#ff8fb4" className="s-line" />
        <rect x="24" y="12" width="16" height="4" fill="#9aa3ad" className="s-line" />
        <rect x="24" y="16" width="16" height="30" fill={Y} className="s-line" />
        <path d="M29 16 L29 46 M35 16 L35 46" fill="none" stroke={YD} strokeWidth="2" />
        <path d="M24 46 L40 46 L32 60 Z" fill="#f6cfa6" className="s-line" />
        <path d="M29 54 L35 54 L32 60 Z" fill={K} />
      </g>
    </svg>
  );
}

function Zzz() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="38" r="20" fill={Y} className="s-line" />
      <path d="M14 36 Q19 32 24 36 M30 36 Q35 32 40 36" fill="none" stroke={K} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="26" cy="48" rx="4" ry="2.5" fill={K} />
      <text x="40" y="26" fontFamily="Arial Black, Helvetica, Arial, sans-serif" fontWeight="900" fontSize="13" fill="#4fb0ff" stroke={K} strokeWidth="1" paintOrder="stroke">z</text>
      <text x="47" y="17" fontFamily="Arial Black, Helvetica, Arial, sans-serif" fontWeight="900" fontSize="17" fill="#4fb0ff" stroke={K} strokeWidth="1.2" paintOrder="stroke">Z</text>
      <text x="56" y="8" fontFamily="Arial Black, Helvetica, Arial, sans-serif" fontWeight="900" fontSize="9" fill="#4fb0ff" stroke={K} strokeWidth="0.8" paintOrder="stroke">z</text>
    </svg>
  );
}

function Exclaim() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 6 L42 6 L38 40 L26 40 Z" fill="#e8463a" className="s-line" />
      <circle cx="32" cy="52" r="7" fill="#e8463a" className="s-line" />
    </svg>
  );
}

function Target() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="34" r="25" fill="#e8463a" className="s-line" />
      <circle cx="30" cy="34" r="17" fill={W} />
      <circle cx="30" cy="34" r="10" fill="#e8463a" />
      <circle cx="30" cy="34" r="3.5" fill={W} />
      <path d="M30 34 L54 10" stroke={K} strokeWidth="4" strokeLinecap="round" />
      <path d="M54 10 L58 4 M54 10 L60 6 M54 10 L48 12 M54 10 L50 16" fill="none" stroke="#4fb0ff" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** The art by kind name — swap one entry for a LottieFiles / Tenor asset later; nothing else changes. */
export const STICKER_ART: Record<StickerKind, () => React.JSX.Element> = {
  facepalm: Facepalm, lightbulb: Lightbulb, confetti: Confetti, magnifier: Magnifier, warning: Warning, check: Check,
  question: Question, fire: Fire, sweat: Sweat, star: Star, clap: Clap, eyes: Eyes,
  thumbsup: Thumbsup, hundred: Hundred, clock: Clock, rocket: Rocket, trophy: Trophy, brain: Brain,
  pencil: Pencil, zzz: Zzz, exclaim: Exclaim, target: Target,
};

/** One sticker's picture, no placement — the gallery and the board layer both use it. */
export function StickerArt({ kind }: { kind: StickerKind }) {
  const Art = STICKER_ART[kind];
  return <Art />;
}

// ── On the board ─────────────────────────────────────────────────────────────

/** The character's corner (lesson-character.tsx: bottom-right, ≤ 120 × 140 px) — a near placement never reaches into it. */
const CHAR_W = 124, CHAR_H = 144;
/** Gap between a token's box and its sticker. */
const GAP = 8;

export interface LessonStickerProps {
  kind: StickerKind;
  /** The token id it sits beside, or null for the corner. */
  near: string | null;
  /** The board's zoom wrapper (the measuring frame the marks use). */
  zoomRef: RefObject<HTMLDivElement | null>;
}

/**
 * A sticker on the board. Keyed by the board's `seq` from the caller, so a new
 * action re-pops it. Measures its token in a layout effect (the token is laid out
 * from mount even while hidden), re-measures on resize, and falls back to the
 * top-right corner when the token is missing, there is no room right of it, or
 * that spot would overlap the character's corner.
 */
export default function LessonSticker({ kind, near, zoomRef }: LessonStickerProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useIsoLayoutEffect(() => {
    const zoom = zoomRef.current;
    if (!zoom || !near) { setPos(null); return; }
    const measure = () => {
      const el = zoom.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(near)}"]`);
      if (!el) { setPos(null); return; }
      const r = offsetRect(el, zoom);
      if (r.width === 0) { setPos(null); return; }
      // The sticker's own size, as the CSS clamp resolves on this board.
      const size = Math.max(64, Math.min(96, zoom.clientWidth * 0.22));
      const left = r.left + r.width + GAP;
      const top = r.top + r.height / 2 - size / 2;
      const fits = left + size <= zoom.clientWidth - 2;
      const onCharacter = left + size > zoom.clientWidth - CHAR_W && top + size > zoom.clientHeight - CHAR_H;
      setPos(fits && !onCharacter ? { left, top: Math.max(0, top) } : null);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(zoom);
    return () => ro?.disconnect();
  }, [near, zoomRef]);

  const style: CSSProperties | undefined = pos ? { left: pos.left, top: pos.top } : undefined;
  return (
    <div className="lsn-sticker" data-lsn-sticker={kind} data-place={pos ? 'near' : 'corner'} style={style} aria-hidden>
      <style>{STICKER_CSS}</style>
      <StickerArt kind={kind} />
    </div>
  );
}

// ── The gallery (/app/lesson/stickers) ───────────────────────────────────────

/** Every kind on a slate swatch with a "pop again" button — Adrian's look at the set. */
export function StickerGallery({ board, ink }: { board: string; ink: string }) {
  const [pops, setPops] = useState<Record<string, number>>({});
  const popAll = () => setPops(prev => Object.fromEntries(STICKER_KINDS.map(k => [k, (prev[k] ?? 0) + 1])));
  return (
    <div>
      <style>{STICKER_CSS}</style>
      <style>{`.lsn-sticker-swatch { position: relative; aspect-ratio: 1 / 1; border-radius: 14px; background: ${board}; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 28px rgba(0,0,0,0.2); overflow: hidden; }
.lsn-sticker-swatch .lsn-sticker { position: absolute; left: 50%; top: 46%; translate: -50% -50%; --lsn-sticker-size: 56%; }
.lsn-sticker-swatch .lsn-sticker-ghost { position: absolute; left: 10px; right: 10px; top: 12px; height: 7px; border-radius: 4px; background: ${ink}; opacity: 0.12; }
.lsn-sticker-swatch .lsn-sticker-ghost + .lsn-sticker-ghost { top: 26px; width: 60%; }`}</style>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-600">Twenty-two kinds. One per beat, two or three per clip, gone on the next beat. Tap a card to pop it again.</p>
        <button type="button" onClick={popAll} className="shrink-0 ml-3 rounded-full bg-slate-900 text-white text-xs font-semibold px-3 py-1.5">Pop all</button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {STICKER_KINDS.map(kind => (
          <button key={kind} type="button" onClick={() => setPops(prev => ({ ...prev, [kind]: (prev[kind] ?? 0) + 1 }))}
            className="text-left rounded-2xl p-2 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] active:scale-[0.98] transition-transform">
            <div className="lsn-sticker-swatch">
              <span className="lsn-sticker-ghost" /><span className="lsn-sticker-ghost" />
              <div key={pops[kind] ?? 0} className="lsn-sticker" data-lsn-sticker={kind} data-place="swatch" aria-hidden>
                <StickerArt kind={kind} />
              </div>
            </div>
            <div className="mt-2 px-1 leading-tight">
              <span className="block text-sm font-semibold text-slate-800">{kind}</span>
              <span className="block text-[11px] text-slate-400">pop again ↻</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
