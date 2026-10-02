'use client';

// The PICTURE look (1 Oct 2026, Adrian approved a generated tutor): six PNG
// cut-outs with transparent backgrounds, one per pose, under
// `public/lessons/characters/<set>/<pose>.png` (512×512, bottom-aligned, ~90 KB
// each). The same six-pose contract as the drawn characters — the `.lsn-char`
// wrapper, `data-lsn-char` / `data-pose` / `data-side`, the corner, the side
// flip, reduced motion — plus `data-look="picture"` and `data-set`.
//
// How a pose changes: all six images are in the DOM from the first paint
// (stacked, eager, decoded async — that IS the preload, so a switch never flashes
// a missing picture), and the one for the current pose is opaque; the others sit
// at opacity 0. A pose change is a 220 ms crossfade between two pictures plus the
// shared squash from characters/base.ts (the `.lsn-root` keyframes restart on
// every `data-pose`). Between beats the figure breathes — a slow 2.5 % scale
// loop from its feet. `prefers-reduced-motion` stops the lot; the pose still
// shows. No box, no border: a transparent PNG over the slate.
//
// Facing: the tutor set points to the viewer's right, so at the right corner the
// picture is mirrored to face the working; `data-side="left"` un-mirrors it.
//
// Size: a photo-style cut-out reads smaller than a drawn figure at the same
// width, so the clamp tops out at 150 px (the drawn ones stop at 120). It stays
// inside the board, bottom-right, pointer-events none, under the marks and the pen.
//
// A new set = six PNGs in `public/lessons/characters/<name>/` (idle · point ·
// think · oops · nod · cheer) + one `set` name; nothing else to draw.

import { CHARACTER_POSES, type CharacterPose } from '@/lib/lesson-script';
import type { CandidateProps } from './base';
import { CHARACTER_SHELL_CSS } from './base';

export interface PictureCharacterProps extends CandidateProps {
  /** The folder under `public/lessons/characters/` holding the six PNGs. */
  set: string;
}

/** Where a set's pose picture lives (served from `public/`). */
export function picturePoseSrc(set: string, pose: CharacterPose): string {
  return `/lessons/characters/${encodeURIComponent(set)}/${pose}.png`;
}

export const PICTURE_CSS = `
.lsn-char[data-look="picture"] { width: clamp(96px, 32%, 150px); aspect-ratio: 1 / 1;
  /* The tutor set was drawn pointing to the viewer's RIGHT; at the right corner he must face the working on his left, so the
     picture is mirrored by default and the shell's side flip (--lsn-char-flip: -1 at data-side="left") un-mirrors it. */
  transform: scaleX(calc(-1 * var(--lsn-char-flip, 1))); }
.lsn-char[data-look="picture"] .lsn-root { position: relative; width: 100%; height: 100%; transform-origin: 50% 100%; }
.lsn-char[data-look="picture"] .pic-breathe { position: absolute; inset: 0; transform-origin: 50% 100%;
  animation: lsnPicBreathe 3.6s ease-in-out infinite; }
.lsn-char[data-look="picture"] .pic-pose { position: absolute; inset: 0; width: 100%; height: 100%; display: block;
  object-fit: contain; object-position: center bottom; opacity: 0; transition: opacity 220ms ease; user-select: none; }
.lsn-char[data-look="picture"] .pic-pose[data-on="1"] { opacity: 1; }
@keyframes lsnPicBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025); } }
`;

export default function PictureCharacter({ pose, side = 'right', set }: PictureCharacterProps) {
  return (
    <div className="lsn-char" data-lsn-char="" data-look="picture" data-set={set} data-pose={pose} data-side={side} aria-hidden>
      <style>{CHARACTER_SHELL_CSS + PICTURE_CSS}</style>
      <div className="lsn-root">
        <div className="pic-breathe">
          {/* A plain <img>: six transparent cut-outs stacked and crossfaded — next/image's wrapper would fight the stack. */}
          {CHARACTER_POSES.map(p => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p} className="pic-pose" data-pose-img={p} data-on={p === pose ? '1' : undefined}
              src={picturePoseSrc(set, p)} alt="" loading="eager" decoding="async" draggable={false} />
          ))}
        </div>
      </div>
    </div>
  );
}
