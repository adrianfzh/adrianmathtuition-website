import { describe, expect, it } from 'vitest';
import { CONTEXT_LINES, GAP_SPLIT, SNIPPET_PAD, partOfLine, regionAt, snippetStyle, snippetsFor, windowsFor } from './mistake-snippet';

// The A Math page of 1 Oct 2026: layer 960 × 1280, strip 250, no panel; the
// saved image is 1210 × 1280 at 2.03×. Q3's one part sits at x 292–637, y 205–535.
const photos = [
  { photo_index: 2, url: 'https://www.adrianmathtuition.com/api/files/runs/r/annotated/p2.jpg', layer: { width: 960, height: 1280, canvasW: 1210, totalH: 1280, stripW: 250, panelH: 0 } },
  { photo_index: 3, url: 'https://www.adrianmathtuition.com/api/files/runs/r/annotated/p3.jpg', layer: { width: 960, height: 1280, canvasW: 1210, totalH: 1394, stripW: 250, panelH: 114 } },
];
const debug = {
  '2': { rot: 0, photo_index: 2, grounding: { space: { w: 960, h: 1280 }, partRegions: [
    { question: '3', bbox: { x1: 292, y1: 205, x2: 637, y2: 535 } },
    { question: '4', bbox: { x1: 292, y1: 600, x2: 637, y2: 900 } },
  ] } },
  '3': { rot: 0, photo_index: 3, grounding: { space: { w: 960, h: 1280 }, partRegions: [
    { question: '4', bbox: { x1: 300, y1: 100, x2: 600, y2: 300 } },
    { question: '5', bbox: { x1: 300, y1: 400, x2: 600, y2: 500 }, not_attempted: true },
  ] } },
};

describe('snippetsFor — the window of the student\'s page a card shows (1 Oct 2026)', () => {
  it('is the part\'s box, padded, run to the canvas\'s right edge, as fractions of the image', () => {
    const [s] = snippetsFor(debug, photos, '3');
    expect(s.photoIndex).toBe(2);
    expect(s.url).toContain('/p2.jpg');
    expect(s.x).toBeCloseTo((292 - SNIPPET_PAD) / 1210);
    expect(s.y).toBeCloseTo((205 - SNIPPET_PAD) / 1280);
    expect(s.w).toBeCloseTo((1210 - (292 - SNIPPET_PAD)) / 1210);
    expect(s.h).toBeCloseTo((535 - 205 + 2 * SNIPPET_PAD) / 1280);
  });
  it('gives one window per page the question sits on, page order, against each page\'s own height', () => {
    const s = snippetsFor(debug, photos, '4');
    expect(s.map(x => x.photoIndex)).toEqual([2, 3]);
    expect(s[1].y).toBeCloseTo((100 - SNIPPET_PAD) / 1394);
  });
  it('skips a part not attempted, a rotated page, and a run with no layer', () => {
    expect(snippetsFor(debug, photos, '5')).toEqual([]);
    expect(snippetsFor({ '2': { ...debug['2'], rot: 90 } }, photos, '3')).toEqual([]);
    expect(snippetsFor(debug, [{ photo_index: 2, url: photos[0].url, layer: {} }], '3')).toEqual([]);
    expect(snippetsFor(undefined, photos, '3')).toEqual([]);
  });
  it('covers only the parts that lost marks; a full-mark part beside them stays out (1 Oct 2026)', () => {
    const dbg = { '2': { rot: 0, photo_index: 2, grounding: { space: { w: 960, h: 1280 }, partRegions: [
      { question: '7', bbox: { x1: 100, y1: 100, x2: 600, y2: 300 }, awarded: 2, max: 2 },
      { question: '7', bbox: { x1: 100, y1: 400, x2: 600, y2: 500 }, awarded: 0, max: 3 },
      { question: '7', bbox: { x1: 100, y1: 600, x2: 600, y2: 700 }, awarded: 1, max: 1 },
    ] } } };
    const [s] = snippetsFor(dbg, photos, '7');
    expect(s.y).toBeCloseTo((400 - SNIPPET_PAD) / 1280);
    expect(s.h).toBeCloseTo((100 + 2 * SNIPPET_PAD) / 1280);
    expect(snippetsFor({ '2': { ...dbg['2'], grounding: { ...dbg['2'].grounding, partRegions: dbg['2'].grounding.partRegions.filter(r => r.max === 2) } } }, photos, '7')).toEqual([]);
  });
  it('snippetStyle: the box keeps the window\'s true shape and the image is shifted by the page\'s aspect', () => {
    // A 1202 × 1394 page: a window at y 0.5 with h 0.25, full width.
    const css = snippetStyle({ photoIndex: 0, url: 'u', x: 0, y: 0.5, w: 1, h: 0.25, pageAspect: 1394 / 1202, label: '' });
    expect(css.box.aspectRatio).toBe(`1 / ${0.25 * 1394 / 1202}`);
    expect(css.img.width).toBe('100.000%');
    expect(Number.parseFloat(css.img.left)).toBe(0);
    // The image is 1394/1202 box-widths tall; half of it up = 0.5 × 1394/1202 box-widths = 2 box-heights (the box is 0.25 × 1394/1202 tall).
    expect(css.img.top).toBe('-200.000%');
  });
  it('reads the array shape too (most runs store one entry per photo)', () => {
    const arr = [null, null, debug['2'], debug['3']];
    expect(snippetsFor(arr, photos, '4').map(x => x.photoIndex)).toEqual([2, 3]);
  });
  it('regionAt: the question\'s centre and height down its page, for the jump', () => {
    const r = regionAt(debug, photos, '3', 2)!;
    expect(r.span).toBeCloseTo((535 - 205 + 2 * SNIPPET_PAD) / 1280);
    expect(r.at).toBeCloseTo((205 - SNIPPET_PAD) / 1280 + r.span / 2);
    expect(regionAt(debug, photos, '3', 3)).toBeNull();
  });
});

describe('windowsFor — one window or several, by the question and its mistakes (1 Oct 2026)', () => {
  const box = (y1: number, y2: number) => ({ x1: 100, y1, x2: 600, y2 });
  it('lost parts next to each other share one window', () => {
    expect(windowsFor([box(100, 200), box(210, 300)], [], 1280)).toEqual([{ x1: 100, y1: 100, x2: 600, y2: 300 }]);
  });
  it('a short run of right parts between two lost ones keeps one window; a long run splits it', () => {
    const short = GAP_SPLIT * 1280 - 10, long = GAP_SPLIT * 1280 + 10;
    expect(windowsFor([box(100, 200), box(200 + short, 500)], [], 1280)).toHaveLength(1);
    expect(windowsFor([box(100, 200), box(200 + long, 500)], [], 1280)).toHaveLength(2);
  });
  it('order does not matter; the windows come out top to bottom', () => {
    const w = windowsFor([box(900, 1000), box(100, 200)], [], 1280);
    expect(w.map(x => x.y1)).toEqual([100, 900]);
  });
  it('each window takes the nearest lines above its first lost part, up to CONTEXT_LINES, never more than 12% of the page', () => {
    const lines = [{ y1: 20, y2: 40 }, { y1: 50, y2: 70 }, { y1: 80, y2: 98 }, { y1: 300, y2: 320 }];
    const [w] = windowsFor([box(100, 200)], lines, 1280);
    expect(CONTEXT_LINES).toBe(2);
    expect(w.y1).toBe(50);
    const [far] = windowsFor([box(1000, 1100)], [{ y1: 10, y2: 30 }], 1280);
    expect(far.y1).toBeCloseTo(1000 - 0.12 * 1280);
  });
  it('snippetsFor: Q10-shaped parts — (b)(i), (b)(ii) lost, (c)(i), (c)(ii) full, (c)(iii) lost → two windows on the page', () => {
    const regions = [
      { question: '10', bbox: { x1: 100, y1: 100, x2: 600, y2: 200 }, awarded: 0, max: 1 },
      { question: '10', bbox: { x1: 100, y1: 210, x2: 600, y2: 300 }, awarded: 0, max: 2 },
      { question: '10', bbox: { x1: 100, y1: 310, x2: 600, y2: 500 }, awarded: 2, max: 2 },
      { question: '10', bbox: { x1: 100, y1: 510, x2: 600, y2: 700 }, awarded: 1, max: 1 },
      { question: '10', bbox: { x1: 100, y1: 710, x2: 600, y2: 900 }, awarded: 1, max: 3 },
    ];
    const dbg = { '2': { rot: 0, photo_index: 2, grounding: { space: { w: 960, h: 1280 }, partRegions: regions, boxes: [] } } };
    const s = snippetsFor(dbg, photos, '10');
    expect(s).toHaveLength(2);
    expect(s[0].y).toBeCloseTo((100 - SNIPPET_PAD) / 1280);
    expect(s[1].y).toBeCloseTo((710 - SNIPPET_PAD) / 1280);
    // The jump spans both windows.
    const r = regionAt(dbg, photos, '10', 2)!;
    expect(r.span).toBeCloseTo((900 + SNIPPET_PAD - (100 - SNIPPET_PAD)) / 1280);
  });
});

describe('part labels (1 Oct 2026, Adrian: "the right steps doesn\'t say it\'s for which part?")', () => {
  const dbg = [null, null, { rot: 0, photo_index: 2, grounding: { space: { w: 960, h: 1280 },
    partRegions: [
      { question: '10', label: '(b)(i)', bbox: { x1: 100, y1: 100, x2: 600, y2: 200 }, awarded: 0, max: 1 },
      { question: '10', label: '(b)(ii)', bbox: { x1: 100, y1: 210, x2: 600, y2: 300 }, awarded: 0, max: 2 },
      { question: '10', label: '(c)(iii)', bbox: { x1: 100, y1: 710, x2: 600, y2: 900 }, awarded: 1, max: 3 },
    ],
    boxes: [{ line_index: 4, box_2d: [120, 150, 140, 500] }, { line_index: 9, box_2d: [800, 150, 820, 500] }] } }];
  it('a window names the lost parts it holds', () => {
    const s = snippetsFor(dbg, photos, '10');
    expect(s.map(x => x.label)).toEqual(['(b)(i), (b)(ii)', '(c)(iii)']);
  });
  it('partOfLine: a transcribed line\'s part, by its box', () => {
    expect(partOfLine(dbg, 2, 4)).toBe('(b)(i)');
    expect(partOfLine(dbg, 2, 9)).toBe('(c)(iii)');
    expect(partOfLine(dbg, 2, 99)).toBe('');
    expect(partOfLine(undefined, 2, 4)).toBe('');
  });
});
