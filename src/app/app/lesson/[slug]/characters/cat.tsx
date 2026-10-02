'use client';

// Candidate 3 — the CAT: a chubby orange tabby mascot with a red bandana, the
// kind of local-flavoured mascot a kopitiam would print on a cup. The head is
// most of the figure: two big almond eyes with slit pupils, a tiny nose, a "w"
// mouth, whiskers. The fun is in the cat parts — the ears FLATTEN and the pupils
// shrink to slits on `oops`, the tail swings straight up on `cheer`, the whiskers
// droop on `think`, the tail sways lazily while it idles.

import type { CandidateProps } from './base';
import { CHARACTER_SHELL_CSS } from './base';

export const CAT_CSS = `
.lsn-char[data-look="cat"] svg { --fur: var(--lsn-char-accent, #f2a65a); --fur-dark: var(--lsn-char-accent-dark, #c97a2e); --belly: var(--lsn-char-belly, #fbe8cf); --band: var(--lsn-char-band, #d63b3b); --iris: var(--lsn-char-iris, #4f9a5c); }
.lsn-char[data-look="cat"] .ct-line { stroke: var(--line); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lsn-char[data-look="cat"] .ct-dark { fill: var(--dark); }
.lsn-char[data-look="cat"] .ct-paw, .lsn-char[data-look="cat"] .ct-head, .lsn-char[data-look="cat"] .ct-ear, .lsn-char[data-look="cat"] .ct-eye, .lsn-char[data-look="cat"] .ct-pupil, .lsn-char[data-look="cat"] .ct-tail,
.lsn-char[data-look="cat"] .ct-body, .lsn-char[data-look="cat"] .ct-mouth, .lsn-char[data-look="cat"] .ct-extra, .lsn-char[data-look="cat"] .ct-happy, .lsn-char[data-look="cat"] .ct-whisk, .lsn-char[data-look="cat"] .ct-brow {
  transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease; }
.lsn-char[data-look="cat"] .ct-body { transform-origin: 60px 130px; animation: lsnCBreathe 3.4s ease-in-out infinite; }
.lsn-char[data-look="cat"] .ct-head { transform-origin: 60px 80px; animation: lsnCBob 3.4s ease-in-out infinite; }
.lsn-char[data-look="cat"] .ct-blink { transform-box: fill-box; transform-origin: center; animation: lsnCBlink 4.4s ease-in-out infinite; }
.lsn-char[data-look="cat"] .ct-eye { transform-box: fill-box; transform-origin: center; }
.lsn-char[data-look="cat"] .ct-tail { transform-origin: 88px 118px; animation: lsnCSway 2.8s ease-in-out infinite; }
.lsn-char[data-look="cat"] .ct-ear-l { transform-origin: 42px 32px; }
.lsn-char[data-look="cat"] .ct-ear-r { transform-origin: 78px 32px; }
.lsn-char[data-look="cat"] .ct-whisk-l { transform-origin: 40px 62px; }
.lsn-char[data-look="cat"] .ct-whisk-r { transform-origin: 80px 62px; }
.lsn-char[data-look="cat"] .ct-brow-l { transform-origin: 48px 36px; }
.lsn-char[data-look="cat"] .ct-brow-r { transform-origin: 72px 36px; }
.lsn-char[data-look="cat"] .ct-paw-l { transform-origin: 38px 98px; }
.lsn-char[data-look="cat"] .ct-paw-r { transform-origin: 82px 98px; }
.lsn-char[data-look="cat"] .ct-mouth, .lsn-char[data-look="cat"] .ct-extra, .lsn-char[data-look="cat"] .ct-happy, .lsn-char[data-look="cat"] .ct-brow { opacity: 0; }
.lsn-char[data-look="cat"] .ct-mouth-w { opacity: 1; }
/* point — the near paw up to the working, ears prick, the pupils follow. */
.lsn-char[data-look="cat"][data-pose="point"] .ct-paw-l { transform: rotate(90deg); }
.lsn-char[data-look="cat"][data-pose="point"] .ct-pupil { transform: translate(-2.5px, -1.5px); }
.lsn-char[data-look="cat"][data-pose="point"] .ct-ear-l { transform: rotate(8deg); }
.lsn-char[data-look="cat"][data-pose="point"] .ct-ear-r { transform: rotate(-8deg); }
/* think — a paw to the chin, eyes up, the whiskers droop, one ear turns, a "?" */
.lsn-char[data-look="cat"][data-pose="think"] .ct-paw-r { transform: translate(4px, 4px) rotate(-150deg); }
.lsn-char[data-look="cat"][data-pose="think"] .ct-pupil { transform: translate(2px, -3px); }
.lsn-char[data-look="cat"][data-pose="think"] .ct-whisk-l { transform: rotate(12deg); }
.lsn-char[data-look="cat"][data-pose="think"] .ct-whisk-r { transform: rotate(-12deg); }
.lsn-char[data-look="cat"][data-pose="think"] .ct-ear-r { transform: rotate(-25deg); }
.lsn-char[data-look="cat"][data-pose="think"] .ct-mouth-w { opacity: 0; }
.lsn-char[data-look="cat"][data-pose="think"] .ct-mouth-flat { opacity: 1; }
.lsn-char[data-look="cat"][data-pose="think"] .ct-bubble { opacity: 1; }
/* oops — ears FLAT, eyes wide with slit pupils, a small "o" mouth, a sweat drop, the paws up. */
.lsn-char[data-look="cat"][data-pose="oops"] .ct-ear-l { transform: rotate(-75deg); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-ear-r { transform: rotate(75deg); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-eye { transform: scale(1.28); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-pupil { transform: scale(0.45, 1.1); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-brow { opacity: 1; transform: translateY(-4px); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-mouth-w { opacity: 0; }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-mouth-o { opacity: 1; }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-drop { opacity: 1; }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-paw-l { transform: rotate(-40deg); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-paw-r { transform: rotate(40deg); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-whisk-l { transform: rotate(-10deg); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-whisk-r { transform: rotate(10deg); }
.lsn-char[data-look="cat"][data-pose="oops"] .ct-tail { animation: lsnCWobble 260ms ease-in-out infinite; }
/* nod — a nod, the "w" widens into a grin. */
.lsn-char[data-look="cat"][data-pose="nod"] .ct-head { animation: lsnCNod 640ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-look="cat"][data-pose="nod"] .ct-mouth-w { opacity: 0; }
.lsn-char[data-look="cat"][data-pose="nod"] .ct-mouth-grin { opacity: 1; }
/* cheer — tail straight up, happy-arc eyes, a grin, both paws up, sparkles, a bounce. */
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-tail { transform: rotate(-55deg); animation: none; }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-eye { opacity: 0; }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-happy { opacity: 1; }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-mouth-w { opacity: 0; }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-mouth-grin { opacity: 1; }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-paw-l { transform: rotate(100deg); }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-paw-r { transform: rotate(-100deg); }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-body, .lsn-char[data-look="cat"][data-pose="cheer"] .ct-head { animation: lsnCBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-star { opacity: 1; animation: lsnCTwinkle 900ms ease-in-out infinite alternate; }
.lsn-char[data-look="cat"][data-pose="cheer"] .ct-star-2 { animation-delay: 300ms; }
`;

export default function CatCharacter({ pose, side = 'right' }: CandidateProps) {
  return (
    <div className="lsn-char" data-lsn-char="" data-look="cat" data-pose={pose} data-side={side} aria-hidden>
      <style>{CHARACTER_SHELL_CSS + CAT_CSS}</style>
      <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
        <g className="lsn-root">
          <g className="ct-tail">
            <path d="M88 118 Q112 120 108 96" stroke="var(--fur)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M88 118 Q112 120 108 96" className="ct-line" fill="none" />
            <path d="M107 100 L112 102 M105 106 L111 108" stroke="var(--fur-dark)" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="ct-body">
            <ellipse cx="60" cy="106" rx="32" ry="27" fill="var(--fur)" className="ct-line" />
            <ellipse cx="60" cy="110" rx="18" ry="18" fill="var(--belly)" />
            <ellipse cx="46" cy="130" rx="9" ry="4.5" fill="var(--fur)" className="ct-line" />
            <ellipse cx="74" cy="130" rx="9" ry="4.5" fill="var(--fur)" className="ct-line" />
            <path d="M43 130 L43 127 M46 130 L46 127 M49 130 L49 127 M71 130 L71 127 M74 130 L74 127 M77 130 L77 127" stroke="var(--fur-dark)" strokeWidth="1.2" strokeLinecap="round" />
          </g>
          <g className="ct-paw ct-paw-r">
            <path d="M82 98 L94 112" stroke="var(--fur)" strokeWidth="9" strokeLinecap="round" fill="none" />
            <path d="M82 98 L94 112" className="ct-line" fill="none" />
            <circle cx="95" cy="113" r="5.5" fill="var(--fur)" className="ct-line" />
          </g>
          <g className="ct-paw ct-paw-l">
            <path d="M38 98 L26 112" stroke="var(--fur)" strokeWidth="9" strokeLinecap="round" fill="none" />
            <path d="M38 98 L26 112" className="ct-line" fill="none" />
            <circle cx="25" cy="113" r="5.5" fill="var(--fur)" className="ct-line" />
          </g>
          <g className="ct-head">
            <path d="M42 32 L30 6 L52 20 Z" className="ct-ear ct-ear-l" fill="var(--fur)" stroke="var(--line)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M78 32 L90 6 L68 20 Z" className="ct-ear ct-ear-r" fill="var(--fur)" stroke="var(--line)" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="60" cy="50" r="31" fill="var(--fur)" className="ct-line" />
            <path d="M50 24 L52 34 M60 21 L60 32 M70 24 L68 34" stroke="var(--fur-dark)" strokeWidth="3" strokeLinecap="round" />
            <path d="M32 77 L88 77 Q76 92 60 94 Q44 92 32 77 Z" fill="var(--band)" className="ct-line" />
            <path d="M86 78 L98 70 L96 84 Z" fill="var(--band)" className="ct-line" strokeWidth="1.5" />
            <circle cx="38" cy="62" r="4.5" fill="var(--cheek)" />
            <circle cx="82" cy="62" r="4.5" fill="var(--cheek)" />
            <g className="ct-whisk ct-whisk-l" stroke="var(--dark)" strokeWidth="1.4" strokeLinecap="round">
              <path d="M40 58 L24 54 M40 62 L22 62 M40 66 L24 70" />
            </g>
            <g className="ct-whisk ct-whisk-r" stroke="var(--dark)" strokeWidth="1.4" strokeLinecap="round">
              <path d="M80 58 L96 54 M80 62 L98 62 M80 66 L96 70" />
            </g>
            <path d="M40 38 L54 36" className="ct-brow ct-brow-l" stroke="var(--dark)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M66 36 L80 38" className="ct-brow ct-brow-r" stroke="var(--dark)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <g className="ct-eye">
              <g className="ct-blink">
                <ellipse cx="48" cy="52" rx="8.5" ry="10.5" fill="#fff" className="ct-line" />
                <g className="ct-pupil" style={{ transformOrigin: '48px 52px' }}>
                  <ellipse cx="48" cy="52" rx="6" ry="8" fill="var(--iris)" />
                  <ellipse cx="48" cy="53" rx="3.2" ry="6.5" className="ct-dark" />
                  <circle cx="50" cy="49" r="1.8" fill="#fff" />
                </g>
              </g>
            </g>
            <g className="ct-eye">
              <g className="ct-blink">
                <ellipse cx="72" cy="52" rx="8.5" ry="10.5" fill="#fff" className="ct-line" />
                <g className="ct-pupil" style={{ transformOrigin: '72px 52px' }}>
                  <ellipse cx="72" cy="52" rx="6" ry="8" fill="var(--iris)" />
                  <ellipse cx="72" cy="53" rx="3.2" ry="6.5" className="ct-dark" />
                  <circle cx="74" cy="49" r="1.8" fill="#fff" />
                </g>
              </g>
            </g>
            <path d="M40 55 Q48 44 56 55" className="ct-happy" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M64 55 Q72 44 80 55" className="ct-happy" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M56 64 L64 64 L60 68 Z" fill="#e0788a" className="ct-line" strokeWidth="1.2" />
            <path d="M52 69 Q56 74 60 69 Q64 74 68 69" className="ct-mouth ct-mouth-w" stroke="var(--dark)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <path d="M54 71 L66 71" className="ct-mouth ct-mouth-flat" stroke="var(--dark)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <ellipse cx="60" cy="72" rx="4" ry="4.5" className="ct-mouth ct-mouth-o ct-dark" />
            <g className="ct-mouth ct-mouth-grin">
              <path d="M50 68 Q60 82 70 68 Z" className="ct-dark" />
              <path d="M55 73 Q60 78 65 73 Q60 75 55 73 Z" fill="#ff8fb0" />
            </g>
          </g>
          <g className="ct-extra ct-drop">
            <path d="M100 40 Q106 50 100 54 Q94 50 100 40 Z" fill="#8fd3ff" className="ct-line" strokeWidth="1.2" />
          </g>
          <g className="ct-extra ct-bubble">
            <ellipse cx="104" cy="16" rx="12" ry="10" fill="#fff" className="ct-line" />
            <circle cx="94" cy="28" r="2.2" fill="#fff" className="ct-line" strokeWidth="1.2" />
            <text x="104" y="21" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#2b2320">?</text>
          </g>
          <g className="ct-extra ct-star ct-star-1" style={{ transformOrigin: '106px 26px' }}>
            <path d="M106 18 L108 24 L114 26 L108 28 L106 34 L104 28 L98 26 L104 24 Z" fill="#ffe27a" className="ct-line" strokeWidth="1.2" />
          </g>
          <g className="ct-extra ct-star ct-star-2" style={{ transformOrigin: '12px 40px' }}>
            <path d="M12 33 L13.6 38.4 L19 40 L13.6 41.6 L12 47 L10.4 41.6 L5 40 L10.4 38.4 Z" fill="#ffe27a" className="ct-line" strokeWidth="1.2" />
          </g>
        </g>
      </svg>
    </div>
  );
}
