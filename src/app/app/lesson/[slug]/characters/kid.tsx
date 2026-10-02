'use client';

// Candidate 2 — the KID (洋葱学园's 狗蛋): a big-headed, round, slightly goofy
// pupil — the head is half the figure, so the face is the whole show. Dot eyes
// most of the time, which is exactly why they balloon so well on `oops` (two
// huge white eyes, a wide open "wah" mouth, the arms flung out, a sweat drop).
// A cowlick on top, a white school polo over dark shorts, a chalk stick in the
// near hand that points at the working. `cheer` flings both arms up — a kid may.

import type { CandidateProps } from './base';
import { CHARACTER_SHELL_CSS } from './base';

export const KID_CSS = `
.lsn-char[data-look="kid"] svg { --skin: var(--lsn-char-skin, #f6cfa6); --hair: var(--lsn-char-hair, #2a1f1a); --shorts: var(--lsn-char-accent, #3c5a9a); }
.lsn-char[data-look="kid"] .kd-line { stroke: var(--line); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lsn-char[data-look="kid"] .kd-dark { fill: var(--dark); }
.lsn-char[data-look="kid"] .kd-arm, .lsn-char[data-look="kid"] .kd-head, .lsn-char[data-look="kid"] .kd-brow, .lsn-char[data-look="kid"] .kd-dot, .lsn-char[data-look="kid"] .kd-big,
.lsn-char[data-look="kid"] .kd-body, .lsn-char[data-look="kid"] .kd-mouth, .lsn-char[data-look="kid"] .kd-extra, .lsn-char[data-look="kid"] .kd-happy, .lsn-char[data-look="kid"] .kd-cowlick {
  transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease; }
.lsn-char[data-look="kid"] .kd-body { transform-origin: 60px 110px; animation: lsnCBreathe 3.4s ease-in-out infinite; }
.lsn-char[data-look="kid"] .kd-head { transform-origin: 60px 74px; animation: lsnCBob 3.4s ease-in-out infinite; }
.lsn-char[data-look="kid"] .kd-blink { transform-box: fill-box; transform-origin: center; animation: lsnCBlink 4.6s ease-in-out infinite; }
.lsn-char[data-look="kid"] .kd-cowlick { transform-origin: 60px 12px; animation: lsnCSway 2.6s ease-in-out infinite; }
.lsn-char[data-look="kid"] .kd-arm-l { transform-origin: 44px 80px; transform: rotate(4deg); }
.lsn-char[data-look="kid"] .kd-arm-r { transform-origin: 76px 80px; transform: rotate(-4deg); }
.lsn-char[data-look="kid"] .kd-brow-l { transform-origin: 48px 38px; }
.lsn-char[data-look="kid"] .kd-brow-r { transform-origin: 72px 38px; }
.lsn-char[data-look="kid"] .kd-big { transform-box: fill-box; transform-origin: center; transform: scale(0.3); }
.lsn-char[data-look="kid"] .kd-mouth, .lsn-char[data-look="kid"] .kd-extra, .lsn-char[data-look="kid"] .kd-happy, .lsn-char[data-look="kid"] .kd-big { opacity: 0; }
.lsn-char[data-look="kid"] .kd-mouth-smile { opacity: 1; }
/* point — the chalk goes up to the working, the dots look that way. */
.lsn-char[data-look="kid"][data-pose="point"] .kd-arm-l { transform: rotate(100deg); }
.lsn-char[data-look="kid"][data-pose="point"] .kd-dot { transform: translate(-2.5px, -1.5px); }
.lsn-char[data-look="kid"][data-pose="point"] .kd-brow { transform: translateY(-2px); }
/* think — the far hand to the chin, eyes up, a "?" */
.lsn-char[data-look="kid"][data-pose="think"] .kd-arm-r { transform: translate(6px, 14px) rotate(-160deg); }
.lsn-char[data-look="kid"][data-pose="think"] .kd-dot { transform: translate(2px, -3px); }
.lsn-char[data-look="kid"][data-pose="think"] .kd-brow-l { transform: rotate(-10deg) translateY(-2px); }
.lsn-char[data-look="kid"][data-pose="think"] .kd-brow-r { transform: rotate(8deg) translateY(1px); }
.lsn-char[data-look="kid"][data-pose="think"] .kd-mouth-smile { opacity: 0; }
.lsn-char[data-look="kid"][data-pose="think"] .kd-mouth-flat { opacity: 1; }
.lsn-char[data-look="kid"][data-pose="think"] .kd-bubble { opacity: 1; }
/* oops — the dots become two HUGE eyes, a wide open mouth, arms out, a sweat drop, the head tips. */
.lsn-char[data-look="kid"][data-pose="oops"] .kd-head { transform: rotate(-6deg); animation: none; }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-dot { opacity: 0; }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-big { opacity: 1; transform: scale(1); }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-brow { transform: translateY(-7px); }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-mouth-smile { opacity: 0; }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-mouth-wah { opacity: 1; }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-drop { opacity: 1; }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-arm-l { transform: rotate(-50deg); }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-arm-r { transform: rotate(50deg); }
.lsn-char[data-look="kid"][data-pose="oops"] .kd-cowlick { animation: lsnCWobble 300ms ease-in-out infinite; }
/* nod — a nod, the smile widens. */
.lsn-char[data-look="kid"][data-pose="nod"] .kd-head { animation: lsnCNod 640ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-look="kid"][data-pose="nod"] .kd-mouth-smile { opacity: 0; }
.lsn-char[data-look="kid"][data-pose="nod"] .kd-mouth-grin { opacity: 1; }
.lsn-char[data-look="kid"][data-pose="nod"] .kd-brow { transform: translateY(-1.5px); }
/* cheer — both arms up, happy-arc eyes, a big grin, sparkles, a bounce. */
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-arm-l { transform: rotate(80deg); }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-arm-r { transform: rotate(-80deg); }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-dot { opacity: 0; }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-happy { opacity: 1; }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-brow { transform: translateY(-4px); }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-mouth-smile { opacity: 0; }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-mouth-grin { opacity: 1; }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-body, .lsn-char[data-look="kid"][data-pose="cheer"] .kd-head { animation: lsnCBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-star { opacity: 1; animation: lsnCTwinkle 900ms ease-in-out infinite alternate; }
.lsn-char[data-look="kid"][data-pose="cheer"] .kd-star-2 { animation-delay: 300ms; }
`;

export default function KidCharacter({ pose, side = 'right' }: CandidateProps) {
  return (
    <div className="lsn-char" data-lsn-char="" data-look="kid" data-pose={pose} data-side={side} aria-hidden>
      <style>{CHARACTER_SHELL_CSS + KID_CSS}</style>
      <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
        <g className="lsn-root">
          <g className="kd-legs">
            <rect x="47" y="110" width="9" height="20" rx="4" fill="var(--skin)" className="kd-line" />
            <rect x="64" y="110" width="9" height="20" rx="4" fill="var(--skin)" className="kd-line" />
            <ellipse cx="50" cy="132" rx="9" ry="4" className="kd-dark kd-line" />
            <ellipse cx="70" cy="132" rx="9" ry="4" className="kd-dark kd-line" />
          </g>
          <g className="kd-body">
            <rect x="43" y="98" width="34" height="16" rx="5" fill="var(--shorts)" className="kd-line" />
            <path d="M42 106 L42 84 Q42 74 52 74 L68 74 Q78 74 78 84 L78 106 Z" fill="var(--white)" className="kd-line" />
            <path d="M52 74 L60 84 L68 74" className="kd-line" fill="none" strokeWidth="1.5" />
            <circle cx="60" cy="90" r="1.4" className="kd-dark" />
            <circle cx="60" cy="97" r="1.4" className="kd-dark" />
          </g>
          <g className="kd-arm kd-arm-r">
            <path d="M76 80 L86 102" stroke="var(--white)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M76 80 L86 102" className="kd-line" fill="none" />
            <circle cx="87" cy="103" r="5" fill="var(--skin)" className="kd-line" />
          </g>
          <g className="kd-head">
            <circle cx="60" cy="44" r="33" fill="var(--skin)" className="kd-line" />
            <path d="M27 44 Q27 11 60 11 Q93 11 93 44 Q88 30 78 30 L74 36 L68 28 L60 34 L52 28 L46 36 L42 30 Q32 30 27 44 Z" fill="var(--hair)" className="kd-line" />
            <path d="M60 13 Q56 2 66 3 Q60 5 63 12" className="kd-cowlick" stroke="var(--hair)" strokeWidth="4" strokeLinecap="round" fill="none" />
            <circle cx="40" cy="56" r="4.5" fill="var(--cheek)" />
            <circle cx="80" cy="56" r="4.5" fill="var(--cheek)" />
            <path d="M42 38 L54 37" className="kd-line kd-brow kd-brow-l" fill="none" strokeWidth="2.2" />
            <path d="M66 37 L78 38" className="kd-line kd-brow kd-brow-r" fill="none" strokeWidth="2.2" />
            <g className="kd-blink">
              <circle cx="48" cy="48" r="3.4" className="kd-dark kd-dot" />
              <circle cx="72" cy="48" r="3.4" className="kd-dark kd-dot" />
            </g>
            <g className="kd-big">
              <ellipse cx="48" cy="49" rx="10" ry="11" fill="#fff" className="kd-line" />
              <circle cx="48" cy="50" r="3.4" className="kd-dark" />
              <circle cx="49.5" cy="48.5" r="1.2" fill="#fff" />
            </g>
            <g className="kd-big">
              <ellipse cx="72" cy="49" rx="10" ry="11" fill="#fff" className="kd-line" />
              <circle cx="72" cy="50" r="3.4" className="kd-dark" />
              <circle cx="73.5" cy="48.5" r="1.2" fill="#fff" />
            </g>
            <path d="M41 50 Q48 41 55 50" className="kd-happy" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M65 50 Q72 41 79 50" className="kd-happy" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M52 61 Q60 69 68 61" className="kd-mouth kd-mouth-smile" stroke="var(--dark)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M54 64 L66 64" className="kd-mouth kd-mouth-flat" stroke="var(--dark)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <g className="kd-mouth kd-mouth-wah">
              <path d="M48 59 Q54 57 60 59 Q66 57 72 59 Q70 76 60 77 Q50 76 48 59 Z" className="kd-dark" />
              <path d="M50 60 Q60 62 70 60 L69 63 Q60 65 51 63 Z" fill="#fff" />
            </g>
            <g className="kd-mouth kd-mouth-grin">
              <path d="M48 59 Q60 78 72 59 Z" className="kd-dark" />
              <path d="M53 66 Q60 73 67 66 Q60 70 53 66 Z" fill="#ff8fb0" />
            </g>
          </g>
          <g className="kd-arm kd-arm-l">
            <path d="M44 80 L34 102" stroke="var(--white)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M44 80 L34 102" className="kd-line" fill="none" />
            <circle cx="33" cy="103" r="5" fill="var(--skin)" className="kd-line" />
            <rect x="24" y="100" width="12" height="4" rx="1.5" fill="#fff" stroke="var(--dark)" strokeWidth="1" transform="rotate(-20 30 102)" />
          </g>
          <g className="kd-extra kd-drop">
            <path d="M98 34 Q104 44 98 48 Q92 44 98 34 Z" fill="#8fd3ff" className="kd-line" strokeWidth="1.2" />
          </g>
          <g className="kd-extra kd-bubble">
            <ellipse cx="104" cy="16" rx="12" ry="10" fill="#fff" className="kd-line" />
            <circle cx="94" cy="28" r="2.2" fill="#fff" className="kd-line" strokeWidth="1.2" />
            <text x="104" y="21" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#2b2320">?</text>
          </g>
          <g className="kd-extra kd-star kd-star-1" style={{ transformOrigin: '108px 40px' }}>
            <path d="M108 32 L110 38 L116 40 L110 42 L108 48 L106 42 L100 40 L106 38 Z" fill="#ffe27a" className="kd-line" strokeWidth="1.2" />
          </g>
          <g className="kd-extra kd-star kd-star-2" style={{ transformOrigin: '12px 44px' }}>
            <path d="M12 37 L13.6 42.4 L19 44 L13.6 45.6 L12 51 L10.4 45.6 L5 44 L10.4 42.4 Z" fill="#ffe27a" className="kd-line" strokeWidth="1.2" />
          </g>
        </g>
      </svg>
    </div>
  );
}
