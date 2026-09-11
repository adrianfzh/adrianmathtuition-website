import { describe, it, expect } from 'vitest';
import { spreadSplitPlan, SPREAD_RATIO, SPREAD_OVERLAP_FRAC, textAxis } from './spread-split';

describe('spreadSplitPlan', () => {
  it('leaves portrait pages alone', () => {
    expect(spreadSplitPlan(3024, 4032)).toBeNull();
  });

  it('leaves square-ish and mildly-landscape single pages alone', () => {
    expect(spreadSplitPlan(1000, 1000)).toBeNull();
    // exactly at the ratio is NOT a spread — the threshold is strict
    expect(spreadSplitPlan(1150, 1000)).toBeNull();
  });

  it('splits a clear two-page spread', () => {
    const plan = spreadSplitPlan(4000, 2800);
    expect(plan).not.toBeNull();
    expect(plan!.left.x).toBe(0);
    expect(plan!.left.width).toBe(Math.round(4000 * (0.5 + SPREAD_OVERLAP_FRAC)));
    // right crop ends flush with the image edge
    expect(plan!.right.x + plan!.right.width).toBe(4000);
    // both halves span the full height
    expect(plan!.left.height).toBe(2800);
    expect(plan!.right.height).toBe(2800);
  });

  it('halves overlap at the gutter so an off-centre cut cannot lose working', () => {
    const plan = spreadSplitPlan(4000, 2800)!;
    const overlap = plan.left.x + plan.left.width - plan.right.x;
    expect(overlap).toBe(Math.round(4000 * SPREAD_OVERLAP_FRAC * 2));
    expect(overlap).toBeGreaterThan(0);
  });

  it('splits just past the threshold', () => {
    expect(spreadSplitPlan(1000 * SPREAD_RATIO + 1, 1000)).not.toBeNull();
  });

  it('each half of a typical spread comes out portrait', () => {
    const plan = spreadSplitPlan(4000, 2800)!;
    expect(plan.left.width).toBeLessThan(plan.left.height);
  });

  it('rejects degenerate dimensions', () => {
    expect(spreadSplitPlan(0, 100)).toBeNull();
    expect(spreadSplitPlan(100, 0)).toBeNull();
    expect(spreadSplitPlan(NaN, 100)).toBeNull();
    expect(spreadSplitPlan(100, -5)).toBeNull();
  });
});

describe('textAxis — which way the writing runs (Gavin Woon, 11 Sep 2026)', () => {
  // A "page" of horizontal text lines: a dark band every 8 rows, spanning most of the width.
  const page = (w: number, h: number, sideways: boolean) => {
    const g = new Uint8Array(w * h).fill(255);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const along = sideways ? x : y, across = sideways ? y : x, span = sideways ? h : w;
      const inLine = along % 8 >= 2 && along % 8 <= 4;
      const inMargin = across < span * 0.08 || across > span * 0.92;
      if (inLine && !inMargin) g[y * w + x] = 40;
    }
    return g;
  };
  it('upright text on a wide image reads as upright — a spread, so the splitter may cut it', () => {
    const w = 320, h = 220;
    const r = textAxis(page(w, h, false), w, h);
    expect(r.kind).toBe('upright');
    expect(r.rows).toBeGreaterThan(r.cols * 1.25);
  });
  it('a single page lying sideways reads as sideways — left whole', () => {
    const w = 320, h = 220;
    const r = textAxis(page(w, h, true), w, h);
    expect(r.kind).toBe('sideways');
    expect(r.cols).toBeGreaterThan(r.rows * 1.25);
  });
  it('blank paper or a bad size is unsure, never a verdict', () => {
    expect(textAxis(new Uint8Array(320 * 220).fill(255), 320, 220).kind).toBe('unsure');
    expect(textAxis(new Uint8Array(10), 320, 220).kind).toBe('unsure');
  });
});
