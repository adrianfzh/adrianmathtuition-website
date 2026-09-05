import { describe, it, expect } from 'vitest';
import {
  FIT_MIN_PX, STAGE_MAX_PX, STAGE_MIN_PX, TAP_GLYPH_MS, TAP_INTERACTIVE_SELECTOR,
  boardTapAction, fitDone, fitFontPx, stageMinHeightPx, tapGlyph,
} from './lesson-stage';

describe('tap the board', () => {
  it('a timed pacing toggles pause, exactly where it was', () => {
    expect(boardTapAction({ canPause: true, paused: false })).toBe('pause');
    expect(boardTapAction({ canPause: true, paused: true })).toBe('resume');
  });

  it('manual pacing still taps to advance', () => {
    // canPause is false in Manual (no timed pacing) and while Voice is still
    // locked (the poster owns that tap).
    expect(boardTapAction({ canPause: false, paused: false })).toBe('advance');
    expect(boardTapAction({})).toBe('advance');
  });

  it('a tap on a control belongs to the control — the check gate is untouched', () => {
    // The answer input, the Check button, Continue, ‹, a link.
    expect(boardTapAction({ interactive: true, canPause: true })).toBe('ignore');
    expect(boardTapAction({ interactive: true, canPause: true, paused: true })).toBe('ignore');
    expect(boardTapAction({ interactive: true, canPause: false })).toBe('ignore');
    // And mid-check the board is not a play surface at all.
    expect(boardTapAction({ gated: true, canPause: true })).toBe('ignore');
    expect(boardTapAction({ gated: true, canPause: false })).toBe('ignore');
  });

  it('the selector names every control that owns its own taps', () => {
    for (const sel of ['input', 'textarea', 'select', 'button', 'a', 'label', '[role="button"]', '[contenteditable="true"]']) {
      expect(TAP_INTERACTIVE_SELECTOR).toContain(sel);
    }
  });

  it('only a state change flashes a glyph, and it is gone in half a second', () => {
    expect(tapGlyph('pause')).toBe('⏸');
    expect(tapGlyph('resume')).toBe('▶');
    expect(tapGlyph('advance')).toBeNull();
    expect(tapGlyph('ignore')).toBeNull();
    expect(TAP_GLYPH_MS).toBeGreaterThanOrEqual(400);
    expect(TAP_GLYPH_MS).toBeLessThanOrEqual(700);
  });
});

describe('nothing overflows the board', () => {
  it('a row that already fits is left alone', () => {
    expect(fitFontPx(20, 300, 318)).toBe(20);
    expect(fitDone(300, 318, 20)).toBe(true);
  });

  it('an over-wide row comes down by the width ratio, and always by at least a step', () => {
    // 400 px of glyphs in a 318 px box at 20 px → 15.9 px, floored to the 0.25 step.
    expect(fitFontPx(20, 400, 318)).toBe(15.75);
    // A hair over: the linear guess rounds back to `current`, so the step forces progress.
    expect(fitFontPx(20, 319, 318)).toBe(19.75);
    expect(fitFontPx(20, 319, 318)).toBeLessThan(20);
  });

  it('never below the floor, and the loop terminates there', () => {
    expect(fitFontPx(13, 4000, 100)).toBe(FIT_MIN_PX);
    expect(fitDone(4000, 100, FIT_MIN_PX)).toBe(true);
    // Degenerate measurements (a hidden row) change nothing.
    expect(fitFontPx(20, 0, 318)).toBe(20);
    expect(fitFontPx(20, 400, 0)).toBe(20);
  });

  it('converges: every step is strictly smaller, and it lands inside the box', () => {
    // A worked line 420 px wide at 24 px, on a 318 px phone board.
    const natural = (size: number) => 420 * (size / 24);
    let px = 24;
    let steps = 0;
    while (!fitDone(natural(px), 318, px) && steps < 40) {
      const next = fitFontPx(px, natural(px), 318);
      expect(next).toBeLessThan(px);
      px = next;
      steps++;
    }
    expect(steps).toBeLessThan(4);
    expect(px).toBeGreaterThan(FIT_MIN_PX);
    expect(natural(px)).toBeLessThanOrEqual(318.5);
  });

  it('a hopeless row stops at the floor rather than vanishing', () => {
    // Nothing can make 900 px of unbreakable glyphs fit 318 px above 12 px —
    // the loop lands on the floor in one step and stops there.
    const px = fitFontPx(24, 900, 318);
    expect(px).toBe(FIT_MIN_PX);
    expect(fitDone(900 * (px / 24), 318, px)).toBe(true);
  });
});

describe('the board stands as tall as its content', () => {
  it('a share of the viewport, between a floor and a ceiling', () => {
    expect(stageMinHeightPx(844)).toBe(388);           // a 390 × 844 phone
    expect(stageMinHeightPx(900)).toBe(414);           // a 1280 × 900 desk
    expect(stageMinHeightPx(1400)).toBe(STAGE_MAX_PX); // a tall window: capped
    expect(stageMinHeightPx(500)).toBe(STAGE_MIN_PX);  // a short one: floored
    expect(stageMinHeightPx(844)).toBeLessThan(440);   // the flat height it replaces
  });
});
