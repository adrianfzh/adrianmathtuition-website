'use client';

// The character (1 Oct 2026, Adrian: "there should be an animated person so it's
// more engaging") — a cartoon student at the board's corner who reacts to the
// beats, the way 洋葱学园 and videotutor.io keep a face on the slate.
//
// Inline SVG, no image file, no Rive/Lottie, no dependency: a round head, a
// simple body, a pencil in the writing hand, big readable expressions. The six
// poses of lib/lesson-script CHARACTER_POSES are six states of the SAME drawing
// switched by `data-pose` — arms rotate at the shoulder, the brows tilt, one of
// four mouths shows, the "?" bubble / sweat drop / sparkles fade in — so a pose
// change is a 250 ms CSS transition, never a swap of pictures. A gentle idle
// loop (breathing + a blink every few seconds) keeps it alive between beats;
// prefers-reduced-motion stops every loop and transition (the pose still shows).
//
// It sits INSIDE the board's zoom wrapper, absolutely positioned bottom-right,
// pointer-events none, under the marks and the pen — it never moves a glyph.
// `--lsn-char-side: left` (a CSS variable the stage may set) puts it bottom-left
// and mirrors it so it still faces the working. Colours: fills are its own
// (skin / hair / shirt tokens with defaults); OUTLINES take the theme's ink
// (`--lsn-ink`), so on the slate it reads as a chalk-outlined figure and on
// paper as an inked one. The look is Adrian's to change (docs/LESSONS.md § The
// character) — every colour is a `--lsn-char-*` token.

import type { CharacterPose } from '@/lib/lesson-script';

export interface LessonCharacterProps {
  pose: CharacterPose;
  /** Which corner (default right). `--lsn-char-side` on an ancestor overrides it. */
  side?: 'right' | 'left';
}

export const CHARACTER_CSS = `
.lsn-char { position: absolute; bottom: 2px; right: var(--lsn-char-right, 4px); left: var(--lsn-char-left, auto);
  width: clamp(84px, 27%, 120px); aspect-ratio: 120 / 140; pointer-events: none; z-index: 4;
  transform: scaleX(var(--lsn-char-flip, 1)); transform-origin: 50% 100%; }
.lsn-char[data-side="left"] { --lsn-char-right: auto; --lsn-char-left: 4px; --lsn-char-flip: -1; }
.lsn-char svg { width: 100%; height: 100%; overflow: visible; display: block;
  --skin: var(--lsn-char-skin, #f6cfa6); --hair: var(--lsn-char-hair, #3b2a20); --shirt: var(--lsn-char-shirt, #f2b33d);
  --line: var(--lsn-char-line, var(--lsn-ink, #f8fafc)); --dark: var(--lsn-char-dark, #2b2320); --cheek: var(--lsn-char-cheek, rgba(240, 120, 110, 0.55)); }
.lsn-char .c-line { stroke: var(--line); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lsn-char .c-fill-skin { fill: var(--skin); }
.lsn-char .c-fill-hair { fill: var(--hair); }
.lsn-char .c-fill-shirt { fill: var(--shirt); }
.lsn-char .c-dark { fill: var(--dark); }
/* Every moving part eases 250 ms — a pose is a transition, not a cut. */
.lsn-char .c-arm, .lsn-char .c-head, .lsn-char .c-brow, .lsn-char .c-eye, .lsn-char .c-body, .lsn-char .c-mouth, .lsn-char .c-extra {
  transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease; }
.lsn-char .c-body { transform-origin: 60px 120px; animation: lsnCharBreathe 3.4s ease-in-out infinite; }
.lsn-char .c-head { transform-origin: 60px 72px; animation: lsnCharBob 3.4s ease-in-out infinite; }
.lsn-char .c-eye { transform-origin: center; transform-box: fill-box; animation: lsnCharBlink 4.6s ease-in-out infinite; }
.lsn-char .c-arm-l { transform-origin: 44px 82px; transform: rotate(8deg); }
.lsn-char .c-arm-r { transform-origin: 76px 82px; transform: rotate(-8deg); }
.lsn-char .c-brow-l { transform-origin: 50px 36px; }
.lsn-char .c-brow-r { transform-origin: 70px 36px; }
.lsn-char .c-mouth, .lsn-char .c-extra { opacity: 0; }
.lsn-char .c-mouth-smile { opacity: 1; }
/* point — the near arm (viewer's left, toward the working) goes up to the board. */
.lsn-char[data-pose="point"] .c-arm-l { transform: rotate(118deg); }
.lsn-char[data-pose="point"] .c-brow-l, .lsn-char[data-pose="point"] .c-brow-r { transform: translateY(-1.5px); }
/* think — hand on chin, a "?" above, eyes up. */
.lsn-char[data-pose="think"] .c-arm-l { transform: rotate(150deg) translate(2px, 0); }
.lsn-char[data-pose="think"] .c-eye { transform: translate(1px, -2px); }
.lsn-char[data-pose="think"] .c-brow-l { transform: rotate(-8deg) translateY(-1px); }
.lsn-char[data-pose="think"] .c-brow-r { transform: rotate(6deg) translateY(1px); }
.lsn-char[data-pose="think"] .c-mouth-smile { opacity: 0; }
.lsn-char[data-pose="think"] .c-mouth-flat { opacity: 1; }
.lsn-char[data-pose="think"] .c-bubble { opacity: 1; }
/* oops — a wince, the brows pinched, a sweat drop, the head tips. */
.lsn-char[data-pose="oops"] .c-head { transform: rotate(7deg); animation: none; }
.lsn-char[data-pose="oops"] .c-brow-l { transform: rotate(14deg) translateY(-2px); }
.lsn-char[data-pose="oops"] .c-brow-r { transform: rotate(-14deg) translateY(-2px); }
.lsn-char[data-pose="oops"] .c-eye { transform: scaleY(0.75); animation: none; }
.lsn-char[data-pose="oops"] .c-mouth-smile { opacity: 0; }
.lsn-char[data-pose="oops"] .c-mouth-wince { opacity: 1; }
.lsn-char[data-pose="oops"] .c-sweat { opacity: 1; animation: lsnCharSweat 1.4s ease-in-out infinite; }
.lsn-char[data-pose="oops"] .c-arm-l { transform: rotate(-4deg); }
.lsn-char[data-pose="oops"] .c-arm-r { transform: rotate(40deg); }
/* nod — a small nod, a slight smile widening. */
.lsn-char[data-pose="nod"] .c-head { animation: lsnCharNod 640ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-pose="nod"] .c-mouth-smile { transform: scale(1.12); transform-origin: 60px 56px; }
.lsn-char[data-pose="nod"] .c-brow-l, .lsn-char[data-pose="nod"] .c-brow-r { transform: translateY(-1px); }
/* cheer — arms up, a grin, two sparkles. */
.lsn-char[data-pose="cheer"] .c-arm-l { transform: rotate(158deg); }
.lsn-char[data-pose="cheer"] .c-arm-r { transform: rotate(-158deg); }
.lsn-char[data-pose="cheer"] .c-mouth-smile { opacity: 0; }
.lsn-char[data-pose="cheer"] .c-mouth-grin { opacity: 1; }
.lsn-char[data-pose="cheer"] .c-brow-l, .lsn-char[data-pose="cheer"] .c-brow-r { transform: translateY(-2.5px); }
.lsn-char[data-pose="cheer"] .c-body { animation: lsnCharBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-pose="cheer"] .c-head { animation: lsnCharBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-pose="cheer"] .c-star { opacity: 1; animation: lsnCharTwinkle 900ms ease-in-out infinite alternate; }
.lsn-char[data-pose="cheer"] .c-star-2 { animation-delay: 300ms; }
@keyframes lsnCharBreathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.025); } }
@keyframes lsnCharBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.4px); } }
@keyframes lsnCharBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
@keyframes lsnCharNod { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(3.5px) rotate(3deg); } }
@keyframes lsnCharBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes lsnCharTwinkle { from { transform: scale(0.7) rotate(-10deg); opacity: 0.5; } to { transform: scale(1.15) rotate(10deg); opacity: 1; } }
@keyframes lsnCharSweat { 0% { transform: translateY(0); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(7px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .lsn-char *, .lsn-char [data-pose] * { animation: none !important; transition: none !important; }
}
`;

/** The cartoon student. Pure presentation: a `data-pose` switch and one style block. */
export default function LessonCharacter({ pose, side = 'right' }: LessonCharacterProps) {
  return (
    <div className="lsn-char" data-lsn-char="" data-pose={pose} data-side={side} aria-hidden>
      <style>{CHARACTER_CSS}</style>
      <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
        {/* Legs + shoes */}
        <g className="c-legs">
          <rect x="46" y="112" width="11" height="22" rx="5" className="c-dark c-line" />
          <rect x="63" y="112" width="11" height="22" rx="5" className="c-dark c-line" />
          <ellipse cx="50" cy="135" rx="9" ry="3.5" className="c-line" fill="var(--hair)" />
          <ellipse cx="70" cy="135" rx="9" ry="3.5" className="c-line" fill="var(--hair)" />
        </g>
        {/* Far arm (viewer's right) holds the pencil */}
        <g className="c-arm c-arm-r">
          <path d="M76 82 L92 106" stroke="var(--shirt)" strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d="M76 82 L92 106" className="c-line" fill="none" />
          <circle cx="93" cy="108" r="5.5" className="c-fill-skin c-line" />
          <g transform="rotate(-35 93 108)">
            <rect x="90.5" y="94" width="5" height="22" rx="1.2" fill="#f5c542" className="c-line" strokeWidth="1.2" />
            <path d="M90.5 116 L93 121 L95.5 116 Z" fill="var(--skin)" className="c-line" strokeWidth="1.2" />
            <rect x="90.5" y="94" width="5" height="3" fill="#e57373" />
          </g>
        </g>
        {/* Body */}
        <g className="c-body">
          <path d="M40 120 L40 92 Q40 76 56 74 L64 74 Q80 76 80 92 L80 120 Z" className="c-fill-shirt c-line" />
          <path d="M55 74 L60 84 L65 74" className="c-line" fill="none" />
        </g>
        {/* Near arm (viewer's left) — the one that points */}
        <g className="c-arm c-arm-l">
          <path d="M44 82 L30 106" stroke="var(--shirt)" strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d="M44 82 L30 106" className="c-line" fill="none" />
          <circle cx="28.5" cy="108.5" r="5.5" className="c-fill-skin c-line" />
        </g>
        {/* Head */}
        <g className="c-head">
          <circle cx="60" cy="46" r="26" className="c-fill-skin c-line" />
          <path d="M34 44 Q36 16 60 18 Q84 16 86 44 Q80 30 66 34 Q54 26 46 34 Q38 36 34 44 Z" className="c-fill-hair c-line" />
          <circle cx="47" cy="54" r="4" fill="var(--cheek)" />
          <circle cx="73" cy="54" r="4" fill="var(--cheek)" />
          <path d="M44 37 L55 35" className="c-line c-brow c-brow-l" fill="none" />
          <path d="M65 35 L76 37" className="c-line c-brow c-brow-r" fill="none" />
          <g className="c-eye">
            <circle cx="50" cy="45" r="3.2" className="c-dark" />
            <circle cx="51.2" cy="43.8" r="1" fill="#fff" />
          </g>
          <g className="c-eye">
            <circle cx="70" cy="45" r="3.2" className="c-dark" />
            <circle cx="71.2" cy="43.8" r="1" fill="#fff" />
          </g>
          {/* Four mouths — one shows */}
          <path d="M52 56 Q60 63 68 56" className="c-line c-mouth c-mouth-smile" fill="none" />
          <path d="M53 58 L67 58" className="c-line c-mouth c-mouth-flat" fill="none" />
          <path d="M53 60 Q60 54 67 60" className="c-line c-mouth c-mouth-wince" fill="none" />
          <path d="M50 55 Q60 68 70 55 Z" className="c-line c-mouth c-mouth-grin" fill="var(--dark)" />
          {/* oops: the sweat drop */}
          <path d="M88 30 Q92 36 88 39 Q84 36 88 30 Z" className="c-extra c-sweat" fill="#9fd3ff" stroke="var(--line)" strokeWidth="1.2" />
        </g>
        {/* think: the "?" bubble */}
        <g className="c-extra c-bubble">
          <ellipse cx="96" cy="16" rx="12" ry="10" fill="#fff" className="c-line" />
          <circle cx="85" cy="27" r="2.2" fill="#fff" className="c-line" strokeWidth="1.2" />
          <text x="96" y="21" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#2b2320">?</text>
        </g>
        {/* cheer: two sparkles */}
        <g className="c-extra c-star c-star-1" style={{ transformOrigin: '20px 62px' }}>
          <path d="M20 54 L22 60 L28 62 L22 64 L20 70 L18 64 L12 62 L18 60 Z" fill="#ffe27a" className="c-line" strokeWidth="1.2" />
        </g>
        <g className="c-extra c-star c-star-2" style={{ transformOrigin: '104px 74px' }}>
          <path d="M104 67 L105.6 72.4 L111 74 L105.6 75.6 L104 81 L102.4 75.6 L97 74 L102.4 72.4 Z" fill="#ffe27a" className="c-line" strokeWidth="1.2" />
        </g>
      </svg>
    </div>
  );
}
