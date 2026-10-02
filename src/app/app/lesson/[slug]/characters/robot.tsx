'use client';

// Candidate 4 — the ROBOT: a small round robot whose face is a SCREEN. Nothing on
// the face is anatomy — the eyes are two glowing pixel squares, the mouth a
// pixel line — so a feeling is a change of what the screen shows: `think` swaps
// the eyes for a row of three loading dots, `cheer` shows two star eyes over a
// wide grin, `oops` flashes the screen red under two angled brow-bars and a
// zigzag mouth while the antenna wobbles hard. Stubby claw arms, two wheels.

import type { CandidateProps } from './base';
import { CHARACTER_SHELL_CSS } from './base';

export const ROBOT_CSS = `
.lsn-char[data-look="robot"] svg { --shell: var(--lsn-char-shell, #e6ebf2); --shell-dark: var(--lsn-char-shell-dark, #b8c2cf); --screen: var(--lsn-char-screen, #1b2733); --glow: var(--lsn-char-accent, #6ff2e0); }
.lsn-char[data-look="robot"] .rb-line { stroke: var(--line); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lsn-char[data-look="robot"] .rb-px { fill: var(--glow); }
.lsn-char[data-look="robot"] .rb-arm, .lsn-char[data-look="robot"] .rb-body, .lsn-char[data-look="robot"] .rb-eye, .lsn-char[data-look="robot"] .rb-brow, .lsn-char[data-look="robot"] .rb-mouth,
.lsn-char[data-look="robot"] .rb-extra, .lsn-char[data-look="robot"] .rb-eyes, .lsn-char[data-look="robot"] .rb-dots, .lsn-char[data-look="robot"] .rb-stars, .lsn-char[data-look="robot"] .rb-tint, .lsn-char[data-look="robot"] .rb-antenna {
  transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease; }
.lsn-char[data-look="robot"] .rb-body { transform-origin: 60px 118px; animation: lsnCBob 3.2s ease-in-out infinite; }
.lsn-char[data-look="robot"] .rb-antenna { transform-origin: 60px 32px; animation: lsnCWobble 2.4s ease-in-out infinite; }
.lsn-char[data-look="robot"] .rb-glow { animation: lsnRbGlow 2.4s ease-in-out infinite; }
.lsn-char[data-look="robot"] .rb-blink { transform-box: fill-box; transform-origin: center; animation: lsnCBlink 4s steps(1, end) infinite; }
.lsn-char[data-look="robot"] .rb-eye { transform-box: fill-box; transform-origin: center; }
.lsn-char[data-look="robot"] .rb-brow-l { transform-origin: 49px 52px; }
.lsn-char[data-look="robot"] .rb-brow-r { transform-origin: 71px 52px; }
.lsn-char[data-look="robot"] .rb-arm-l { transform-origin: 30px 86px; }
.lsn-char[data-look="robot"] .rb-arm-r { transform-origin: 90px 86px; }
.lsn-char[data-look="robot"] .rb-mouth, .lsn-char[data-look="robot"] .rb-extra, .lsn-char[data-look="robot"] .rb-brow, .lsn-char[data-look="robot"] .rb-dots, .lsn-char[data-look="robot"] .rb-stars, .lsn-char[data-look="robot"] .rb-tint { opacity: 0; }
.lsn-char[data-look="robot"] .rb-mouth-smile { opacity: 1; }
.lsn-char[data-look="robot"] .rb-dot { animation: lsnCDots 1s ease-in-out infinite; }
.lsn-char[data-look="robot"] .rb-dot-2 { animation-delay: 160ms; }
.lsn-char[data-look="robot"] .rb-dot-3 { animation-delay: 320ms; }
/* point — the near claw up to the working, the pixel eyes slide that way. */
.lsn-char[data-look="robot"][data-pose="point"] .rb-arm-l { transform: rotate(90deg); }
.lsn-char[data-look="robot"][data-pose="point"] .rb-eye { transform: translate(-3px, -2px); }
/* think — the eyes become a row of loading dots, a claw taps the chin, a "?" */
.lsn-char[data-look="robot"][data-pose="think"] .rb-eyes { opacity: 0; }
.lsn-char[data-look="robot"][data-pose="think"] .rb-dots { opacity: 1; }
.lsn-char[data-look="robot"][data-pose="think"] .rb-mouth-smile { opacity: 0; }
.lsn-char[data-look="robot"][data-pose="think"] .rb-mouth-flat { opacity: 1; }
.lsn-char[data-look="robot"][data-pose="think"] .rb-arm-r { transform: translate(2px, 2px) rotate(-140deg); }
.lsn-char[data-look="robot"][data-pose="think"] .rb-bubble { opacity: 1; }
.lsn-char[data-look="robot"][data-pose="think"] .rb-antenna { animation-duration: 1s; }
/* oops — the screen flashes red, brow-bars angle down, the eyes go big, a zigzag mouth, arms out, the antenna wobbles hard. */
.lsn-char[data-look="robot"][data-pose="oops"] .rb-tint { opacity: 0.32; }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-eye { transform: scale(1.5); }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-brow { opacity: 1; }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-brow-l { transform: rotate(20deg) translateY(1px); }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-brow-r { transform: rotate(-20deg) translateY(1px); }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-mouth-smile { opacity: 0; }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-mouth-zig { opacity: 1; }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-arm-l { transform: rotate(-45deg); }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-arm-r { transform: rotate(45deg); }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-antenna { animation: lsnCWobble 220ms ease-in-out infinite; }
.lsn-char[data-look="robot"][data-pose="oops"] .rb-bang { opacity: 1; }
/* nod — the whole body rocks forward twice, the mouth widens. */
.lsn-char[data-look="robot"][data-pose="nod"] .rb-body { animation: lsnCNod 640ms cubic-bezier(0.22, 1, 0.36, 1) 2; transform-origin: 60px 100px; }
.lsn-char[data-look="robot"][data-pose="nod"] .rb-mouth-smile { opacity: 0; }
.lsn-char[data-look="robot"][data-pose="nod"] .rb-mouth-grin { opacity: 1; }
/* cheer — two star eyes, a wide grin, both claws up, sparkles, a bounce. */
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-eyes { opacity: 0; }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-stars { opacity: 1; }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-star-eye { animation: lsnCTwinkle 700ms ease-in-out infinite alternate; }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-mouth-smile { opacity: 0; }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-mouth-grin { opacity: 1; }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-arm-l { transform: rotate(100deg); }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-arm-r { transform: rotate(-100deg); }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-body { animation: lsnCBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-star { opacity: 1; animation: lsnCTwinkle 900ms ease-in-out infinite alternate; }
.lsn-char[data-look="robot"][data-pose="cheer"] .rb-star-2 { animation-delay: 300ms; }
@keyframes lsnRbGlow { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
`;

export default function RobotCharacter({ pose, side = 'right' }: CandidateProps) {
  return (
    <div className="lsn-char" data-lsn-char="" data-look="robot" data-pose={pose} data-side={side} aria-hidden>
      <style>{CHARACTER_SHELL_CSS + ROBOT_CSS}</style>
      <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
        <g className="lsn-root">
          <g className="rb-arm rb-arm-r">
            <path d="M90 86 L104 100" stroke="var(--shell-dark)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M90 86 L104 100" className="rb-line" fill="none" />
            <path d="M104 100 L112 96 M104 100 L110 107" className="rb-line" fill="none" strokeWidth="4" />
          </g>
          <g className="rb-arm rb-arm-l">
            <path d="M30 86 L16 100" stroke="var(--shell-dark)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M30 86 L16 100" className="rb-line" fill="none" />
            <path d="M16 100 L8 96 M16 100 L10 107" className="rb-line" fill="none" strokeWidth="4" />
          </g>
          <g className="rb-body">
            <g className="rb-antenna">
              <path d="M60 32 L60 16" className="rb-line" fill="none" strokeWidth="3" />
              <circle cx="60" cy="13" r="5" fill="var(--glow)" className="rb-line rb-glow" />
            </g>
            <rect x="40" y="118" width="14" height="10" rx="4" fill="var(--shell-dark)" className="rb-line" />
            <rect x="66" y="118" width="14" height="10" rx="4" fill="var(--shell-dark)" className="rb-line" />
            <rect x="26" y="32" width="68" height="88" rx="30" fill="var(--shell)" className="rb-line" />
            <rect x="20" y="62" width="8" height="18" rx="4" fill="var(--shell-dark)" className="rb-line" />
            <rect x="92" y="62" width="8" height="18" rx="4" fill="var(--shell-dark)" className="rb-line" />
            <rect x="34" y="42" width="52" height="54" rx="12" fill="var(--screen)" className="rb-line" />
            <rect x="34" y="42" width="52" height="54" rx="12" fill="#ff4d4d" className="rb-tint" />
            <rect x="37" y="45" width="46" height="48" rx="10" fill="none" stroke="var(--glow)" strokeWidth="1" opacity="0.35" />
            <circle cx="52" cy="108" r="2.5" fill="var(--glow)" className="rb-glow" />
            <circle cx="60" cy="108" r="2.5" fill="var(--shell-dark)" />
            <circle cx="68" cy="108" r="2.5" fill="var(--shell-dark)" />
            <g className="rb-eyes">
              <g className="rb-blink">
                <g className="rb-eye"><rect x="43" y="57" width="11" height="11" rx="2" className="rb-px" /><rect x="50" y="57" width="4" height="4" fill="#fff" opacity="0.8" /></g>
                <g className="rb-eye"><rect x="66" y="57" width="11" height="11" rx="2" className="rb-px" /><rect x="73" y="57" width="4" height="4" fill="#fff" opacity="0.8" /></g>
              </g>
            </g>
            <rect x="42" y="50" width="14" height="3.5" rx="1" className="rb-px rb-brow rb-brow-l" />
            <rect x="64" y="50" width="14" height="3.5" rx="1" className="rb-px rb-brow rb-brow-r" />
            <g className="rb-dots">
              <circle cx="49" cy="64" r="3.5" className="rb-px rb-dot rb-dot-1" />
              <circle cx="60" cy="64" r="3.5" className="rb-px rb-dot rb-dot-2" />
              <circle cx="71" cy="64" r="3.5" className="rb-px rb-dot rb-dot-3" />
            </g>
            <g className="rb-stars">
              <path d="M48.5 53 L51 60 L58 61 L52.5 65.5 L54.5 72.5 L48.5 68.5 L42.5 72.5 L44.5 65.5 L39 61 L46 60 Z" fill="#ffe27a" className="rb-star-eye" style={{ transformOrigin: '48.5px 63px' }} />
              <path d="M71.5 53 L74 60 L81 61 L75.5 65.5 L77.5 72.5 L71.5 68.5 L65.5 72.5 L67.5 65.5 L62 61 L69 60 Z" fill="#ffe27a" className="rb-star-eye" style={{ transformOrigin: '71.5px 63px', animationDelay: '200ms' }} />
            </g>
            <path d="M50 79 L53 84 L67 84 L70 79" className="rb-mouth rb-mouth-smile" stroke="var(--glow)" strokeWidth="3.5" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
            <path d="M51 83 L69 83" className="rb-mouth rb-mouth-flat" stroke="var(--glow)" strokeWidth="3.5" strokeLinecap="square" fill="none" />
            <path d="M46 83 L50 77 L55 88 L60 77 L65 88 L70 77 L74 83" className="rb-mouth rb-mouth-zig" stroke="var(--glow)" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
            <g className="rb-mouth rb-mouth-grin">
              <rect x="46" y="76" width="28" height="13" rx="4" className="rb-px" />
              <path d="M52 76 L52 82 M60 76 L60 82 M68 76 L68 82 M46 82 L74 82" stroke="var(--screen)" strokeWidth="1.6" />
            </g>
          </g>
          <g className="rb-extra rb-bang">
            <text x="100" y="40" textAnchor="middle" fontSize="22" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#ff6b6b" stroke="var(--line)" strokeWidth="0.8">!</text>
          </g>
          <g className="rb-extra rb-bubble">
            <ellipse cx="104" cy="18" rx="12" ry="10" fill="#fff" className="rb-line" />
            <circle cx="94" cy="30" r="2.2" fill="#fff" className="rb-line" strokeWidth="1.2" />
            <text x="104" y="23" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#2b2320">?</text>
          </g>
          <g className="rb-extra rb-star rb-star-1" style={{ transformOrigin: '106px 30px' }}>
            <path d="M106 22 L108 28 L114 30 L108 32 L106 38 L104 32 L98 30 L104 28 Z" fill="#ffe27a" className="rb-line" strokeWidth="1.2" />
          </g>
          <g className="rb-extra rb-star rb-star-2" style={{ transformOrigin: '12px 44px' }}>
            <path d="M12 37 L13.6 42.4 L19 44 L13.6 45.6 L12 51 L10.4 45.6 L5 44 L10.4 42.4 Z" fill="#ffe27a" className="rb-line" strokeWidth="1.2" />
          </g>
        </g>
      </svg>
    </div>
  );
}
