// Shared ground for the candidate characters (1 Oct 2026, Adrian: "tutor is not
// interest/cute/fun. something like bilibili? or may not even be a tutor/teacher.
// experiment and show me"). Every candidate in this folder keeps the teacher's
// contract — the same wrapper (`.lsn-char`, `data-lsn-char`, `data-pose`,
// `data-side`), the same six poses switched by `data-pose`, the same size clamp,
// side flip and reduced-motion rule — and adds `data-look` so its own CSS never
// leaks into another drawing. The face is ~60% of the figure in every one of them.
//
// What lives here: the shell (position / size / flip), the SQUASH on a pose
// change (six keyframe names with the same shape — a changed `animation-name`
// restarts, so the figure bounces on every pose switch, idle included), and the
// idle keyframes the candidates share (blink, breathe, bob, nod, bounce, twinkle,
// the antenna wobble, the thinking dots).

import type { CharacterPose } from '@/lib/lesson-script';

export interface CandidateProps {
  pose: CharacterPose;
  /** Which corner (default right). `--lsn-char-side` on an ancestor overrides it. */
  side?: 'right' | 'left';
}

const SQUASH = '0% { transform: scale(1, 1); } 35% { transform: scale(1.1, 0.86); } 70% { transform: scale(0.95, 1.07); } 100% { transform: scale(1, 1); }';

export const CHARACTER_SHELL_CSS = `
.lsn-char[data-look] { position: absolute; bottom: 2px; right: var(--lsn-char-right, 4px); left: var(--lsn-char-left, auto);
  width: clamp(84px, 27%, 120px); aspect-ratio: 120 / 140; pointer-events: none; z-index: 4;
  transform: scaleX(var(--lsn-char-flip, 1)); transform-origin: 50% 100%; }
.lsn-char[data-look][data-side="left"] { --lsn-char-right: auto; --lsn-char-left: 4px; --lsn-char-flip: -1; }
.lsn-char[data-look] svg { width: 100%; height: 100%; overflow: visible; display: block;
  --line: var(--lsn-char-line, var(--lsn-ink, #f8fafc)); --dark: var(--lsn-char-dark, #2b2320);
  --cheek: var(--lsn-char-cheek, rgba(240, 120, 110, 0.55)); --white: var(--lsn-char-white, #fbfbf7); }
/* The squash on a pose change: the root scales from its feet, 260 ms, once per switch. */
.lsn-char[data-look] .lsn-root { transform-origin: 60px 138px; }
.lsn-char[data-look][data-pose="idle"] .lsn-root { animation: lsnSqIdle 260ms cubic-bezier(0.22, 1, 0.36, 1) 1; }
.lsn-char[data-look][data-pose="point"] .lsn-root { animation: lsnSqPoint 260ms cubic-bezier(0.22, 1, 0.36, 1) 1; }
.lsn-char[data-look][data-pose="think"] .lsn-root { animation: lsnSqThink 260ms cubic-bezier(0.22, 1, 0.36, 1) 1; }
.lsn-char[data-look][data-pose="oops"] .lsn-root { animation: lsnSqOops 260ms cubic-bezier(0.22, 1, 0.36, 1) 1; }
.lsn-char[data-look][data-pose="nod"] .lsn-root { animation: lsnSqNod 260ms cubic-bezier(0.22, 1, 0.36, 1) 1; }
.lsn-char[data-look][data-pose="cheer"] .lsn-root { animation: lsnSqCheer 260ms cubic-bezier(0.22, 1, 0.36, 1) 1; }
@keyframes lsnSqIdle { ${SQUASH} }
@keyframes lsnSqPoint { ${SQUASH} }
@keyframes lsnSqThink { ${SQUASH} }
@keyframes lsnSqOops { ${SQUASH} }
@keyframes lsnSqNod { ${SQUASH} }
@keyframes lsnSqCheer { ${SQUASH} }
@keyframes lsnCBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
@keyframes lsnCBreathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.025); } }
@keyframes lsnCBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
@keyframes lsnCNod { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(4px) rotate(4deg); } }
@keyframes lsnCBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes lsnCTwinkle { from { transform: scale(0.7) rotate(-10deg); opacity: 0.5; } to { transform: scale(1.15) rotate(10deg); opacity: 1; } }
@keyframes lsnCWobble { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
@keyframes lsnCDots { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
@keyframes lsnCSway { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
@media (prefers-reduced-motion: reduce) {
  .lsn-char[data-look] *, .lsn-char[data-look][data-pose] * { animation: none !important; transition: none !important; }
}
`;
