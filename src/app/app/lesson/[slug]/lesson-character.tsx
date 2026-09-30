'use client';

// The character (1 Oct 2026, Adrian: "there should be an animated person so it's
// more engaging") — a cartoon TEACHER at the board's corner who reacts to the
// beats, the way 洋葱学园 and videotutor.io keep a face on the slate. Adrian's
// decision later that day: a teacher figure, not a student — a friendly young
// tutor at the board, clean flat shapes, a big readable face, a rounded body,
// adult proportions; a cardigan over a collared shirt, round glasses, a pointer
// stick in the near hand.
//
// Inline SVG, no image file, no Rive/Lottie, no dependency. The six poses of
// lib/lesson-script CHARACTER_POSES are six states of the SAME drawing switched
// by `data-pose` — arms rotate at the shoulder, the brows tilt, one of four
// mouths shows, the "?" bubble / thumb / sparkles fade in — so a pose change is
// a 250 ms CSS transition, never a swap of pictures. As a teacher reacting:
// `point` raises the pointer toward the working, `think` is chin on hand with a
// "?", `oops` is a gentle "hmm, careful" (one brow up, the far hand raised), `nod`
// a small nod, `cheer` a thumbs-up with a smile and two sparkles. A gentle idle
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
  --skin: var(--lsn-char-skin, #f6cfa6); --hair: var(--lsn-char-hair, #3b2a20); --shirt: var(--lsn-char-shirt, #4f86c6);
  --line: var(--lsn-char-line, var(--lsn-ink, #f8fafc)); --dark: var(--lsn-char-dark, #2b2320); --cheek: var(--lsn-char-cheek, rgba(240, 120, 110, 0.55));
  --collar: var(--lsn-char-collar, #fbfbf7); --pointer: var(--lsn-char-pointer, #d9b27c); }
.lsn-char .c-line { stroke: var(--line); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lsn-char .c-fill-skin { fill: var(--skin); }
.lsn-char .c-fill-hair { fill: var(--hair); }
.lsn-char .c-fill-shirt { fill: var(--shirt); }
.lsn-char .c-fill-collar { fill: var(--collar); }
.lsn-char .c-dark { fill: var(--dark); }
/* Every moving part eases 250 ms — a pose is a transition, not a cut. */
.lsn-char .c-arm, .lsn-char .c-head, .lsn-char .c-brow, .lsn-char .c-eye, .lsn-char .c-body, .lsn-char .c-mouth, .lsn-char .c-extra {
  transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease; }
.lsn-char .c-body { transform-origin: 60px 112px; animation: lsnCharBreathe 3.4s ease-in-out infinite; }
.lsn-char .c-head { transform-origin: 60px 52px; animation: lsnCharBob 3.4s ease-in-out infinite; }
.lsn-char .c-eye { transform-origin: center; transform-box: fill-box; animation: lsnCharBlink 4.6s ease-in-out infinite; }
.lsn-char .c-arm-l { transform-origin: 50px 68px; transform: rotate(6deg); }
.lsn-char .c-arm-r { transform-origin: 70px 68px; transform: rotate(-6deg); }
.lsn-char .c-brow-l { transform-origin: 51px 27px; }
.lsn-char .c-brow-r { transform-origin: 69px 27px; }
.lsn-char .c-mouth, .lsn-char .c-extra { opacity: 0; }
.lsn-char .c-mouth-smile { opacity: 1; }
/* point — the near arm (viewer's left) lifts the pointer toward the working. */
.lsn-char[data-pose="point"] .c-arm-l { transform: rotate(124deg); }
.lsn-char[data-pose="point"] .c-brow-l, .lsn-char[data-pose="point"] .c-brow-r { transform: translateY(-1.5px); }
/* think — the far hand comes to the chin, a "?" above, eyes up. */
.lsn-char[data-pose="think"] .c-arm-r { transform: translate(12px, 10px) rotate(-178deg); }
.lsn-char[data-pose="think"] .c-eye { transform: translate(1px, -1.5px); }
.lsn-char[data-pose="think"] .c-brow-l { transform: rotate(-8deg) translateY(-1px); }
.lsn-char[data-pose="think"] .c-brow-r { transform: rotate(6deg) translateY(1px); }
.lsn-char[data-pose="think"] .c-mouth-smile { opacity: 0; }
.lsn-char[data-pose="think"] .c-mouth-flat { opacity: 1; }
.lsn-char[data-pose="think"] .c-bubble { opacity: 1; }
/* oops — "hmm, careful": one brow up, the far hand raised palm-out, a small hmm. */
.lsn-char[data-pose="oops"] .c-head { transform: rotate(-4deg); animation: none; }
.lsn-char[data-pose="oops"] .c-brow-l { transform: rotate(6deg) translateY(0.5px); }
.lsn-char[data-pose="oops"] .c-brow-r { transform: rotate(-8deg) translateY(-3px); }
.lsn-char[data-pose="oops"] .c-mouth-smile { opacity: 0; }
.lsn-char[data-pose="oops"] .c-mouth-hmm { opacity: 1; }
.lsn-char[data-pose="oops"] .c-arm-r { transform: rotate(-108deg); }
.lsn-char[data-pose="oops"] .c-palm { opacity: 1; }
/* nod — a small nod, a slight smile widening. */
.lsn-char[data-pose="nod"] .c-head { animation: lsnCharNod 640ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-pose="nod"] .c-mouth-smile { transform: scale(1.12); transform-origin: 60px 47px; }
.lsn-char[data-pose="nod"] .c-brow-l, .lsn-char[data-pose="nod"] .c-brow-r { transform: translateY(-1px); }
/* cheer — a thumbs-up beside the face, a small smile, two sparkles. */
.lsn-char[data-pose="cheer"] .c-arm-r { transform: rotate(-100deg); }
.lsn-char[data-pose="cheer"] .c-thumb { opacity: 1; }
.lsn-char[data-pose="cheer"] .c-mouth-smile { opacity: 0; }
.lsn-char[data-pose="cheer"] .c-mouth-grin { opacity: 1; }
.lsn-char[data-pose="cheer"] .c-brow-l, .lsn-char[data-pose="cheer"] .c-brow-r { transform: translateY(-2px); }
.lsn-char[data-pose="cheer"] .c-body { animation: lsnCharBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-pose="cheer"] .c-head { animation: lsnCharBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-pose="cheer"] .c-star { opacity: 1; animation: lsnCharTwinkle 900ms ease-in-out infinite alternate; }
.lsn-char[data-pose="cheer"] .c-star-2 { animation-delay: 300ms; }
@keyframes lsnCharBreathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.02); } }
@keyframes lsnCharBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.2px); } }
@keyframes lsnCharBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
@keyframes lsnCharNod { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(3px) rotate(3deg); } }
@keyframes lsnCharBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes lsnCharTwinkle { from { transform: scale(0.7) rotate(-10deg); opacity: 0.5; } to { transform: scale(1.15) rotate(10deg); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .lsn-char *, .lsn-char [data-pose] * { animation: none !important; transition: none !important; }
}
`;

/** The cartoon teacher. Pure presentation: a `data-pose` switch and one style block. */
export default function LessonCharacter({ pose, side = 'right' }: LessonCharacterProps) {
  return (
    <div className="lsn-char" data-lsn-char="" data-pose={pose} data-side={side} aria-hidden>
      <style>{CHARACTER_CSS}</style>
      <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
        {/* Trousers + shoes */}
        <g className="c-legs">
          <rect x="45" y="106" width="12" height="27" rx="5" className="c-dark c-line" />
          <rect x="63" y="106" width="12" height="27" rx="5" className="c-dark c-line" />
          <ellipse cx="50" cy="134" rx="9.5" ry="3.5" className="c-line" fill="var(--hair)" />
          <ellipse cx="70" cy="134" rx="9.5" ry="3.5" className="c-line" fill="var(--hair)" />
        </g>
        {/* Neck */}
        <rect x="55" y="46" width="10" height="14" rx="3" className="c-fill-skin" />
        {/* Body — a cardigan over a white collared shirt */}
        <g className="c-body">
          <path d="M40 108 L40 70 Q40 57 52 56 L68 56 Q80 57 80 70 L80 108 Z" className="c-fill-shirt c-line" />
          <path d="M52 56 L60 76 L68 56 Z" className="c-fill-collar" />
          <path d="M52 56 L60 76 L68 56" className="c-line" fill="none" />
          <path d="M52 56 L57.5 63 L60 59.5 L62.5 63 L68 56" className="c-line" fill="none" strokeWidth="1.6" />
          <path d="M60 76 L60 108" className="c-line" fill="none" strokeWidth="1.4" />
          <circle cx="63.5" cy="86" r="1.5" className="c-dark" />
          <circle cx="63.5" cy="96" r="1.5" className="c-dark" />
        </g>
        {/* Far arm (viewer's right), over the body and under the head — the hand that goes to the chin, palm-out, thumbs-up */}
        <g className="c-arm c-arm-r">
          <path d="M70 68 L88 88" stroke="var(--shirt)" strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d="M70 68 L88 88" className="c-line" fill="none" />
          {/* cheer: the thumb (drawn along local +x, which the -100° turn points upward) */}
          <rect x="91" y="86.5" width="10" height="5.2" rx="2.6" className="c-fill-skin c-line c-extra c-thumb" strokeWidth="1.4" />
          <circle cx="89" cy="89" r="5.5" className="c-fill-skin c-line" />
          {/* oops: the open palm's finger lines */}
          <path d="M87 85 L86 82 M90 85 L90.5 81.5 M92.5 86.5 L94.5 84" className="c-line c-extra c-palm" strokeWidth="1.3" fill="none" />
        </g>
        {/* Near arm (viewer's left) — holds the pointer, lifts it to the board */}
        <g className="c-arm c-arm-l">
          <path d="M34 96 L21.5 118.5" stroke="var(--pointer)" strokeWidth="3" strokeLinecap="round" fill="none" />
          <circle cx="21.5" cy="118.5" r="2" fill="#e05a4e" />
          <path d="M50 68 L34 96" stroke="var(--shirt)" strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d="M50 68 L34 96" className="c-line" fill="none" />
          <circle cx="33" cy="97" r="5.5" className="c-fill-skin c-line" />
        </g>
        {/* Head */}
        <g className="c-head">
          <circle cx="60" cy="34" r="20" className="c-fill-skin c-line" />
          <path d="M40 33 Q40 13 60 13 Q80 13 80 33 Q76 24 65 25 Q55 21 49 27 Q44 29 40 33 Z" className="c-fill-hair c-line" />
          <circle cx="46" cy="42" r="3.2" fill="var(--cheek)" />
          <circle cx="74" cy="42" r="3.2" fill="var(--cheek)" />
          <path d="M45.5 28 L56 26.5" className="c-line c-brow c-brow-l" fill="none" />
          <path d="M64 26.5 L74.5 28" className="c-line c-brow c-brow-r" fill="none" />
          <g className="c-eye">
            <circle cx="52" cy="36" r="2.8" className="c-dark" />
            <circle cx="53" cy="35" r="0.9" fill="#fff" />
          </g>
          <g className="c-eye">
            <circle cx="68" cy="36" r="2.8" className="c-dark" />
            <circle cx="69" cy="35" r="0.9" fill="#fff" />
          </g>
          {/* Round glasses */}
          <g className="c-glasses" fill="none">
            <circle cx="52" cy="36" r="6.5" className="c-line" strokeWidth="1.5" />
            <circle cx="68" cy="36" r="6.5" className="c-line" strokeWidth="1.5" />
            <path d="M58.5 35.5 L61.5 35.5" className="c-line" strokeWidth="1.5" />
          </g>
          {/* Four mouths — one shows */}
          <path d="M53 46 Q60 52 67 46" className="c-line c-mouth c-mouth-smile" fill="none" />
          <path d="M54 48 L66 48" className="c-line c-mouth c-mouth-flat" fill="none" />
          <path d="M56 48.5 Q60 46.5 64 48.5" className="c-line c-mouth c-mouth-hmm" fill="none" />
          <path d="M52 45.5 Q60 55 68 45.5 Z" className="c-line c-mouth c-mouth-grin" fill="var(--dark)" />
        </g>
        {/* think: the "?" bubble */}
        <g className="c-extra c-bubble">
          <ellipse cx="98" cy="14" rx="12" ry="10" fill="#fff" className="c-line" />
          <circle cx="87" cy="25" r="2.2" fill="#fff" className="c-line" strokeWidth="1.2" />
          <text x="98" y="19" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#2b2320">?</text>
        </g>
        {/* cheer: two sparkles */}
        <g className="c-extra c-star c-star-1" style={{ transformOrigin: '104px 28px' }}>
          <path d="M104 20 L106 26 L112 28 L106 30 L104 36 L102 30 L96 28 L102 26 Z" fill="#ffe27a" className="c-line" strokeWidth="1.2" />
        </g>
        <g className="c-extra c-star c-star-2" style={{ transformOrigin: '18px 60px' }}>
          <path d="M18 53 L19.6 58.4 L25 60 L19.6 61.6 L18 67 L16.4 61.6 L11 60 L16.4 58.4 Z" fill="#ffe27a" className="c-line" strokeWidth="1.2" />
        </g>
      </svg>
    </div>
  );
}
