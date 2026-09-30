'use client';

// Candidate 1 — the BLOB (videotutor.io's pink monster): a rounded shape with a
// face and nothing else — no neck, no arms to speak of, two stubby nubs and a
// tiny pair of feet. The whole figure is a face, so every feeling is huge: the
// brows are thick bars that snap into an angry V on `oops` while the eyes
// balloon, `cheer` shuts the eyes into two happy arcs over an open grin, `think`
// slides the pupils to the corner and taps a nub on the cheek. One accent colour
// (`--lsn-char-accent`, default pink); outlines take the theme's ink.

import type { CandidateProps } from './base';
import { CHARACTER_SHELL_CSS } from './base';

export const BLOB_CSS = `
.lsn-char[data-look="blob"] svg { --accent: var(--lsn-char-accent, #f272a0); --accent-dark: var(--lsn-char-accent-dark, #c94a7a); }
.lsn-char[data-look="blob"] .bl-line { stroke: var(--line); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lsn-char[data-look="blob"] .bl-dark { fill: var(--dark); }
.lsn-char[data-look="blob"] .bl-nub, .lsn-char[data-look="blob"] .bl-brow, .lsn-char[data-look="blob"] .bl-eye, .lsn-char[data-look="blob"] .bl-pupil,
.lsn-char[data-look="blob"] .bl-body, .lsn-char[data-look="blob"] .bl-mouth, .lsn-char[data-look="blob"] .bl-extra, .lsn-char[data-look="blob"] .bl-happy {
  transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease; }
.lsn-char[data-look="blob"] .bl-body { transform-origin: 60px 128px; animation: lsnCBreathe 3.2s ease-in-out infinite; }
.lsn-char[data-look="blob"] .bl-eye { transform-box: fill-box; transform-origin: center; }
.lsn-char[data-look="blob"] .bl-blink { transform-box: fill-box; transform-origin: center; animation: lsnCBlink 4.2s ease-in-out infinite; }
.lsn-char[data-look="blob"] .bl-brow { stroke: var(--dark); stroke-width: 5; stroke-linecap: round; fill: none; }
.lsn-char[data-look="blob"] .bl-brow-l { transform-origin: 45px 50px; }
.lsn-char[data-look="blob"] .bl-brow-r { transform-origin: 75px 50px; }
.lsn-char[data-look="blob"] .bl-nub-l { transform-origin: 30px 90px; }
.lsn-char[data-look="blob"] .bl-nub-r { transform-origin: 90px 90px; }
.lsn-char[data-look="blob"] .bl-mouth, .lsn-char[data-look="blob"] .bl-extra, .lsn-char[data-look="blob"] .bl-happy { opacity: 0; }
.lsn-char[data-look="blob"] .bl-mouth-smile { opacity: 1; }
/* point — the near nub swings up toward the working, the eyes follow it. */
.lsn-char[data-look="blob"][data-pose="point"] .bl-nub-l { transform: rotate(80deg); }
.lsn-char[data-look="blob"][data-pose="point"] .bl-pupil { transform: translate(-3px, -2px); }
.lsn-char[data-look="blob"][data-pose="point"] .bl-brow { transform: translateY(-3px); }
/* think — pupils to the corner, one brow up, a nub on the cheek, the "?" */
.lsn-char[data-look="blob"][data-pose="think"] .bl-pupil { transform: translate(3px, -4px); }
.lsn-char[data-look="blob"][data-pose="think"] .bl-brow-l { transform: rotate(-12deg) translateY(-3px); }
.lsn-char[data-look="blob"][data-pose="think"] .bl-brow-r { transform: rotate(10deg) translateY(2px); }
.lsn-char[data-look="blob"][data-pose="think"] .bl-nub-r { transform: rotate(105deg); }
.lsn-char[data-look="blob"][data-pose="think"] .bl-mouth-smile { opacity: 0; }
.lsn-char[data-look="blob"][data-pose="think"] .bl-mouth-flat { opacity: 1; }
.lsn-char[data-look="blob"][data-pose="think"] .bl-bubble { opacity: 1; }
/* oops — the angry V brows, eyes balloon, a wobbly mouth, a sweat drop. */
.lsn-char[data-look="blob"][data-pose="oops"] .bl-brow-l { transform: rotate(22deg) translateY(4px); }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-brow-r { transform: rotate(-22deg) translateY(4px); }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-eye { transform: scale(1.3); }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-pupil { transform: scale(0.7); }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-mouth-smile { opacity: 0; }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-mouth-wave { opacity: 1; }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-drop { opacity: 1; }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-nub-l { transform: rotate(-30deg); }
.lsn-char[data-look="blob"][data-pose="oops"] .bl-nub-r { transform: rotate(30deg); }
/* nod — the whole blob rocks forward twice, the smile widens. */
.lsn-char[data-look="blob"][data-pose="nod"] .bl-body { animation: lsnCNod 640ms cubic-bezier(0.22, 1, 0.36, 1) 2; transform-origin: 60px 100px; }
.lsn-char[data-look="blob"][data-pose="nod"] .bl-mouth-smile { opacity: 0; }
.lsn-char[data-look="blob"][data-pose="nod"] .bl-mouth-grin { opacity: 1; }
.lsn-char[data-look="blob"][data-pose="nod"] .bl-brow { transform: translateY(-2px); }
/* cheer — eyes shut into happy arcs, an open grin, both nubs up, sparkles, a bounce. */
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-eye { opacity: 0; }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-happy { opacity: 1; }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-brow { transform: translateY(-7px); }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-mouth-smile { opacity: 0; }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-mouth-grin { opacity: 1; }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-nub-l { transform: rotate(90deg); }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-nub-r { transform: rotate(-90deg); }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-body { animation: lsnCBounce 520ms cubic-bezier(0.22, 1, 0.36, 1) 2; }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-star { opacity: 1; animation: lsnCTwinkle 900ms ease-in-out infinite alternate; }
.lsn-char[data-look="blob"][data-pose="cheer"] .bl-star-2 { animation-delay: 300ms; }
`;

export default function BlobCharacter({ pose, side = 'right' }: CandidateProps) {
  return (
    <div className="lsn-char" data-lsn-char="" data-look="blob" data-pose={pose} data-side={side} aria-hidden>
      <style>{CHARACTER_SHELL_CSS + BLOB_CSS}</style>
      <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
        <g className="lsn-root">
          <ellipse cx="46" cy="132" rx="10" ry="4.5" className="bl-dark bl-line" />
          <ellipse cx="74" cy="132" rx="10" ry="4.5" className="bl-dark bl-line" />
          <g className="bl-body">
            <path d="M60 30 C90 30 97 60 95 90 C93 116 80 129 60 129 C40 129 27 116 25 90 C23 60 30 30 60 30 Z" fill="var(--accent)" className="bl-line" />
            <path d="M40 46 Q60 38 80 46" stroke="var(--accent-dark)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" />
            <g className="bl-nub bl-nub-r">
              <path d="M90 90 L106 100" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round" fill="none" />
              <path d="M90 90 L106 100" className="bl-line" fill="none" />
            </g>
            <g className="bl-nub bl-nub-l">
              <path d="M30 90 L14 100" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round" fill="none" />
              <path d="M30 90 L14 100" className="bl-line" fill="none" />
            </g>
            <circle cx="34" cy="86" r="4.5" fill="var(--cheek)" />
            <circle cx="86" cy="86" r="4.5" fill="var(--cheek)" />
            <g className="bl-eye">
              <g className="bl-blink">
                <ellipse cx="46" cy="70" rx="10" ry="12" fill="#fff" className="bl-line" />
                <g className="bl-pupil" style={{ transformOrigin: '46px 70px' }}>
                  <circle cx="46" cy="71" r="5.2" className="bl-dark" />
                  <circle cx="48" cy="68.5" r="1.8" fill="#fff" />
                </g>
              </g>
            </g>
            <g className="bl-eye">
              <g className="bl-blink">
                <ellipse cx="74" cy="70" rx="10" ry="12" fill="#fff" className="bl-line" />
                <g className="bl-pupil" style={{ transformOrigin: '74px 70px' }}>
                  <circle cx="74" cy="71" r="5.2" className="bl-dark" />
                  <circle cx="76" cy="68.5" r="1.8" fill="#fff" />
                </g>
              </g>
            </g>
            <path d="M36 74 Q46 62 56 74" className="bl-happy" stroke="var(--dark)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <path d="M64 74 Q74 62 84 74" className="bl-happy" stroke="var(--dark)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <path d="M35 51 L55 49" className="bl-brow bl-brow-l" />
            <path d="M65 49 L85 51" className="bl-brow bl-brow-r" />
            <path d="M50 92 Q60 103 70 92" className="bl-mouth bl-mouth-smile" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M52 96 L68 96" className="bl-mouth bl-mouth-flat" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M47 100 Q54 92 60 100 Q66 108 73 100" className="bl-mouth bl-mouth-wave" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <g className="bl-mouth bl-mouth-grin">
              <path d="M46 90 Q60 114 74 90 Z" className="bl-dark" />
              <path d="M52 100 Q60 108 68 100 Q60 104 52 100 Z" fill="#ff8fb0" />
            </g>
          </g>
          <g className="bl-extra bl-drop">
            <path d="M100 44 Q106 54 100 58 Q94 54 100 44 Z" fill="#8fd3ff" className="bl-line" strokeWidth="1.2" />
          </g>
          <g className="bl-extra bl-bubble">
            <ellipse cx="102" cy="22" rx="12" ry="10" fill="#fff" className="bl-line" />
            <circle cx="92" cy="34" r="2.2" fill="#fff" className="bl-line" strokeWidth="1.2" />
            <text x="102" y="27" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#2b2320">?</text>
          </g>
          <g className="bl-extra bl-star bl-star-1" style={{ transformOrigin: '106px 30px' }}>
            <path d="M106 22 L108 28 L114 30 L108 32 L106 38 L104 32 L98 30 L104 28 Z" fill="#ffe27a" className="bl-line" strokeWidth="1.2" />
          </g>
          <g className="bl-extra bl-star bl-star-2" style={{ transformOrigin: '14px 40px' }}>
            <path d="M14 33 L15.6 38.4 L21 40 L15.6 41.6 L14 47 L12.4 41.6 L7 40 L12.4 38.4 Z" fill="#ffe27a" className="bl-line" strokeWidth="1.2" />
          </g>
        </g>
      </svg>
    </div>
  );
}
