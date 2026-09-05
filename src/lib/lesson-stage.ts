// The lesson stage — the rules the board obeys as a SURFACE, as pure functions
// (2026-09-06, from Adrian's phone review of the chalk theme).
//
// Two things live here, both pulled out of the player so they can be tested
// without a browser:
//
//   · TAP-TO-PAUSE. "can i click/tap at the video itself and it pauses /
//     unpauses?" — yes. In a timed pacing (▶ Auto, 🔊 Voice) a tap anywhere on
//     the board toggles pause, the way it does on a video; in Manual it still
//     advances a beat. A tap that landed on a control (the check's input, the
//     Check button, a link) belongs to that control and does nothing here.
//   · FITTING. Nothing may ever be clipped or overflow the board. Prose wraps
//     and equation rows wrap, but a single KaTeX island cannot break, so the
//     last resort is to take the size down until it fits — the sizes here are
//     what the DOM pass in the player aims at.
//
// Pure module (repo testing policy): no I/O, no React, no DOM.

// ── Tap-to-pause ─────────────────────────────────────────────────────────────

/**
 * Elements that own their own taps. A pointer that landed on (or inside) one of
 * these never toggles pause — the check's answer gate is untouched, and so are
 * the Continue button and ‹ in the control row.
 */
export const TAP_INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, label, [role="button"], [role="link"], [contenteditable="true"]';

export type TapAction = 'ignore' | 'pause' | 'resume' | 'advance';

export interface TapContext {
  /** The tap landed on a control (TAP_INTERACTIVE_SELECTOR) — it owns it. */
  interactive?: boolean;
  /** A check is waiting for its answer: the board is not a play surface at all. */
  gated?: boolean;
  /** A timed pacing is running AND pause is available (audio already unlocked). */
  canPause?: boolean;
  /** The lesson is paused right now. */
  paused?: boolean;
}

/**
 * What a tap on the board means.
 *
 *   controls first   — a tap inside a control is that control's
 *   gate next        — mid-check the board does nothing (the answer gate stands)
 *   timed pacing     — pause ⇄ resume, exactly where it was
 *   manual pacing    — advance one beat, as it always did
 */
export function boardTapAction(ctx: TapContext): TapAction {
  if (ctx.interactive) return 'ignore';
  if (ctx.gated) return 'ignore';
  if (ctx.canPause) return ctx.paused ? 'resume' : 'pause';
  return 'advance';
}

/** The glyph the board flashes for a tap that changed the play state (YouTube's gesture). */
export function tapGlyph(action: TapAction): '⏸' | '▶' | null {
  if (action === 'pause') return '⏸';
  if (action === 'resume') return '▶';
  return null;
}

/** How long the tap glyph lives, ms — it fades as it grows and is gone by then. */
export const TAP_GLYPH_MS = 520;

// ── Fitting: nothing overflows the board ─────────────────────────────────────

/** Never shrink text below this — past it, the line is unreadable and the script is wrong. */
export const FIT_MIN_PX = 12;

/**
 * The size to try next when a row is `naturalPx` wide in an `availablePx` box.
 * Glyph advance is very nearly linear in font-size, so the ratio is a good
 * first guess; the DOM pass re-measures and steps down again if a wrap moved.
 * Rounded DOWN to a 0.25 px step so the loop always makes progress.
 */
export function fitFontPx(currentPx: number, naturalPx: number, availablePx: number, minPx = FIT_MIN_PX): number {
  if (!(currentPx > 0) || !(naturalPx > 0) || !(availablePx > 0)) return currentPx;
  if (naturalPx <= availablePx) return currentPx;
  const guess = currentPx * (availablePx / naturalPx);
  const stepped = Math.floor(guess * 4) / 4;
  return Math.max(minPx, Math.min(currentPx - 0.25, stepped));
}

/** Has the fit loop converged (fits, or nothing left to give)? */
export function fitDone(naturalPx: number, availablePx: number, currentPx: number, minPx = FIT_MIN_PX): boolean {
  return naturalPx <= availablePx + 0.5 || currentPx <= minPx + 1e-9;
}

// ── The board's resting height ───────────────────────────────────────────────

/** The board's min-height, as a share of the viewport, between a floor and a ceiling. */
export const STAGE_MIN_PX = 280;
export const STAGE_MAX_PX = 420;
export const STAGE_VH = 0.46;

/**
 * How tall an EMPTY board stands (content grows it from there). The old card
 * was a flat 440 px, which left a short scene floating in a tall empty slate on
 * a desk and pushed Continue below the fold on a phone.
 */
export function stageMinHeightPx(viewportH: number): number {
  return Math.min(STAGE_MAX_PX, Math.max(STAGE_MIN_PX, Math.round(viewportH * STAGE_VH)));
}
