import { describe, it, expect } from 'vitest';
import {
  parseEraseVerdict, inkComponents, snapToComponents, hintToPixels, boxesAsFractions, padBox,
  MAX_COMPONENT_SHARE, BY_EYE, mergeBoxes, judgePrompt, verifyPrompt, parseVerifyVerdict, type Component,
} from './figure-blemish';

/** A w×h white canvas with the given pixels inked. */
function canvas(w: number, h: number, ink: Array<[number, number]>): Uint8Array {
  const g = new Uint8Array(w * h).fill(255);
  for (const [x, y] of ink) g[y * w + x] = 0;
  return g;
}

describe('parseEraseVerdict — the judge answers in JSON, and anything else is a refusal', () => {
  it('reads a plain answer and a fenced one', () => {
    const v = parseEraseVerdict('{"blemishes":[{"what":"stray d","box":[0,780,12,830],"sure":true}],"unsure":[],"refuse":null}');
    expect(v.refuse).toBeNull();
    expect(v.blemishes).toEqual([{ what: 'stray d', box: { x0: 0, y0: 780, x1: 12, y1: 830 }, sure: true }]);
    const f = parseEraseVerdict('Here you go:\n```json\n{"blemishes":[],"unsure":["small mark near y = x — could be a tick"],"refuse":null}\n```');
    expect(f.blemishes).toEqual([]);
    expect(f.unsure).toEqual(['small mark near y = x — could be a tick']);
  });
  it('drops a malformed box rather than guessing, and treats no JSON as a refusal', () => {
    const v = parseEraseVerdict('{"blemishes":[{"what":"x","box":[50,50,10,10]},{"what":"y","box":[0,0,1200,10]},{"what":"ok","box":[1,2,3,4]}]}');
    expect(v.blemishes.map((b) => b.what)).toEqual(['ok']);
    expect(parseEraseVerdict('I cannot see the image').refuse).toMatch(/no JSON/);
    expect(parseEraseVerdict('{"refuse":"image is blank"}').refuse).toBe('image is blank');
  });
});

describe('inkComponents — 8-connected ink blobs with their boxes', () => {
  it('finds two separate blobs and one diagonal chain', () => {
    // blob A: 2x2 at (1,1); blob B: single pixel at (6,1); chain C: diagonal (1,5)-(3,7)
    const g = canvas(8, 9, [[1, 1], [2, 1], [1, 2], [2, 2], [6, 1], [1, 5], [2, 6], [3, 7]]);
    const cs = inkComponents(g, 8, 9).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    expect(cs).toEqual([
      { x0: 1, y0: 1, x1: 2, y1: 2, pixels: 4 },
      { x0: 6, y0: 1, x1: 6, y1: 1, pixels: 1 },
      { x0: 1, y0: 5, x1: 3, y1: 7, pixels: 3 },
    ]);
  });
  it('returns nothing for a blank canvas', () => {
    expect(inkComponents(canvas(4, 4, []), 4, 4)).toEqual([]);
  });
});

describe('snapToComponents — the judge points, the ink decides', () => {
  const w = 1000, h = 1000;
  const glyph: Component = { x0: 2, y0: 780, x1: 9, y1: 800, pixels: 60 };          // the stray "d"
  const label: Component = { x0: 0, y0: 100, x1: 60, y1: 130, pixels: 700 };        // "y = f⁻¹(x)" at the left edge
  const curve: Component = { x0: 100, y0: 50, x1: 900, y1: 950, pixels: 40000 };    // the sketch itself

  it('takes the small component inside the box and nothing else', () => {
    const s = snapToComponents([glyph, label, curve], [{ what: 'stray d', box: { x0: 0, y0: 770, x1: 15, y1: 810 }, sure: true }], w, h);
    expect(s.erase).toEqual([glyph]);
    expect(s.skipped).toEqual([]);
  });
  it('refuses a box drawn over the curve — too large to be a blemish — and says so', () => {
    const s = snapToComponents([glyph, label, curve], [{ what: 'line', box: { x0: 90, y0: 40, x1: 910, y1: 960 }, sure: true }], w, h);
    expect(s.erase).toEqual([]);
    expect(s.skipped[0]).toMatch(/too large/);
    expect(((curve.x1 - curve.x0 + 1) * (curve.y1 - curve.y0 + 1)) / (w * h)).toBeGreaterThan(MAX_COMPONENT_SHARE);
  });
  it('leaves the label alone when the box only clips its corner', () => {
    const s = snapToComponents([glyph, label, curve], [{ what: 'mark', box: { x0: 0, y0: 120, x1: 10, y1: 140 }, sure: true }], w, h);
    expect(s.erase).toEqual([]);
    expect(s.skipped[0]).toMatch(/no ink inside/);
  });
  it('refuses a big box whose dark ink is only a speck — the judge pointed at something paler', () => {
    // a box over a pale show-through line that happens to contain the "+" of the equation
    const plus: Component = { x0: 400, y0: 100, x1: 412, y1: 112, pixels: 40 };
    const s = snapToComponents([plus, curve], [{ what: 'show-through text', box: { x0: 300, y0: 60, x1: 700, y1: 150 }, sure: true }], w, h);
    expect(s.erase).toEqual([]);
    expect(s.skipped[0]).toMatch(/fills only \d+%/);
  });
  it('never lists the same component twice when two boxes overlap it', () => {
    const s = snapToComponents([glyph], [
      { what: 'a', box: { x0: 0, y0: 770, x1: 15, y1: 810 }, sure: true },
      { what: 'b', box: { x0: 0, y0: 775, x1: 20, y1: 805 }, sure: true },
    ], w, h);
    expect(s.erase).toEqual([glyph]);
  });
});

describe('BY_EYE — boxes a person drew after looking', () => {
  const w = 1000, h = 1000;
  it('takes a whole sliced text line but never the axis that runs through the band', () => {
    const glyphs: Component[] = Array.from({ length: 12 }, (_, i) => ({ x0: 20 + i * 60, y0: 960, x1: 60 + i * 60, y1: 995, pixels: 300 }));
    const axis: Component = { x0: 498, y0: 100, x1: 502, y1: 999, pixels: 4500 };   // crosses the band
    const s = snapToComponents([...glyphs, axis], [{ what: 'bottom line', box: { x0: 0, y0: 950, x1: 1000, y1: 1000 }, sure: true }], w, h, BY_EYE);
    expect(s.erase).toHaveLength(12);
    expect(s.erase).not.toContain(axis);
  });
  it('still refuses under the automatic guards for the same box', () => {
    const glyphs: Component[] = Array.from({ length: 12 }, (_, i) => ({ x0: 20 + i * 60, y0: 960, x1: 60 + i * 60, y1: 995, pixels: 300 }));
    const s = snapToComponents(glyphs, [{ what: 'bottom line', box: { x0: 0, y0: 950, x1: 1000, y1: 1000 }, sure: true }], w, h);
    // coverage: 12 glyph boxes of 41x36 over a 1000x51 strip ≈ 35% → passes; the AUTO size guard passes too;
    // what AUTO cannot do is the removal cap, which eraseBlemishes applies on real ink — so here they agree.
    expect(s.erase).toHaveLength(12);
  });
});

describe('a judge box that missed the mark by a little', () => {
  it('finds the glyph in a wider ring around an empty box, still under the guards', () => {
    const glyph: Component = { x0: 2, y0: 780, x1: 9, y1: 800, pixels: 60 };
    const curve: Component = { x0: 100, y0: 50, x1: 900, y1: 950, pixels: 40000 };
    // the box sits 30 units below the glyph (judge coordinates are approximate)
    const s = snapToComponents([glyph, curve], [{ what: 'stray d', box: { x0: 0, y0: 830, x1: 20, y1: 870 }, sure: true }], 1000, 1000);
    expect(s.erase).toEqual([glyph]);
  });
});

describe('mergeBoxes', () => {
  it('joins touching and overlapping boxes, leaves distant ones apart', () => {
    expect(mergeBoxes([{ x0: 0, y0: 0, x1: 5, y1: 5 }, { x0: 6, y0: 2, x1: 9, y1: 8 }, { x0: 50, y0: 50, x1: 52, y1: 52 }]))
      .toEqual([{ x0: 0, y0: 0, x1: 9, y1: 8 }, { x0: 50, y0: 50, x1: 52, y1: 52 }]);
  });
  it('chains: a merges b, the merged box then merges c', () => {
    expect(mergeBoxes([{ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 8, y0: 0, x1: 10, y1: 2 }, { x0: 4, y0: 0, x1: 6, y1: 2 }])).toEqual([{ x0: 0, y0: 0, x1: 10, y1: 2 }]);
  });
});

describe('box arithmetic', () => {
  it('converts a 0–1000 hint to padded pixels, clamped to the canvas', () => {
    expect(hintToPixels({ x0: 0, y0: 500, x1: 100, y1: 600 }, 200, 100, 0.01)).toEqual({ x0: 0, y0: 49, x1: 22, y1: 61 });
  });
  it('pads and clamps an erase box, and reports fractions the page can draw', () => {
    expect(padBox({ x0: 0, y0: 5, x1: 7, y1: 9 }, 100, 50, 2)).toEqual({ x0: 0, y0: 3, x1: 9, y1: 11 });
    expect(boxesAsFractions([{ x0: 0, y0: 0, x1: 49, y1: 24 }], 100, 50)).toEqual([[0, 0, 0.5, 0.5]]);
  });
});

describe('judgePrompt', () => {
  it('carries the review note and asks for JSON only', () => {
    const p = judgePrompt('stray "d" in the left margin');
    expect(p).toContain('stray "d" in the left margin');
    expect(p).toMatch(/JSON only/);
    expect(judgePrompt(null)).not.toContain('review note');
  });
});

describe('the second look — nothing washed is offered without it', () => {
  it('passes only a clean that lost nothing of the figure', () => {
    expect(parseVerifyVerdict('{"ok":true,"lost":[]}')).toMatchObject({ ok: true, lost: [] });
    const bad = parseVerifyVerdict('{"ok":false,"lost":["the minus sign in (-2a,1) is gone","the green curve is gone"]}');
    expect(bad.ok).toBe(false);
    expect(bad.note).toMatch(/minus sign/);
  });
  it('treats "ok" with a loss list, and anything unparseable, as a refusal', () => {
    expect(parseVerifyVerdict('{"ok":true,"lost":["the grey curve is fainter"]}').ok).toBe(false);
    expect(parseVerifyVerdict('looks fine to me').ok).toBe(false);
    expect(parseVerifyVerdict('').ok).toBe(false);
  });
  it('asks about the things a tone wash actually destroys', () => {
    const p = verifyPrompt();
    for (const s of ['MINUS SIGNS', 'dashed', 'gridlines', 'JSON only']) expect(p).toContain(s);
  });
});
