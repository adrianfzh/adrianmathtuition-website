// Cleaning a blemish OUT of a bank figure — as a candidate, never in place.
//
// Adrian, 9 Sep 2026, on PJC 2015 P2 Q1(b) (a whole, legible sketch with one
// stray "d" from the adjacent prose in its left margin): "instead of trim > how
// about clean as a candidate? … there are just faint blemishes in the diagram,
// would just need a simple cleaning job instead of a full redraw". And before
// that: "should not be a mechanical thing".
//
// So the job is split the way his figure rules already say — JUDGE BY LOOKING,
// then act exactly:
//   1. a judge (a vision model, or a session with eyes) looks at the image and
//      names what is foreign and roughly where (a box on a 0–1000 grid);
//   2. this file snaps each named box to the actual ink components inside it,
//      refuses anything that looks like part of the figure (too big, or most
//      of it outside the box), whitens only those components, and reports
//      what it removed;
//   3. the result is stored as a CANDIDATE beside the original, with the
//      erased boxes recorded, and goes live only when Adrian approves it.
//
// Nothing here crops. The canvas keeps its size; pixels inside the chosen
// components go white. A label the judge mistakes for a blemish is caught two
// ways: the size guards below, and Adrian's eye on the red outlines.
import sharp from 'sharp';

/** Ink threshold on the 0–255 grey scale (same as figure-checks). */
export const INK = 160;
/** A component larger than this share of the image is never a blemish — it is
 *  the curve, the axes, a table. Refused even when the judge boxed it. */
export const MAX_COMPONENT_SHARE = 0.02;
/** At least this much of a component's box must sit inside the judge's box. */
export const MIN_INSIDE = 0.7;
/** The judge's box is grown by this much on every side before snapping — the
 *  model's coordinates are approximate, the ink is exact. */
export const HINT_PAD = 0.015;
/** Erasing more than this share of the figure's ink is not a blemish job. */
export const MAX_REMOVED_SHARE = 0.08;
/** Second look around a judge box that held no ink at all. */
export const LOOSE_PAD = 0.05;

// ── the pale half of the same button (9 Sep 2026) ────────────────────────────
// Adrian, on CJC 2022 P1 Q4(a) — a whole, legible curve with a KIASU vendor
// stamp sitting in the empty lower-left: "so clean does not work on such
// images?" It did not, and the measurement says why: in that corner exactly 2
// pixels are dark enough to count as ink, while 20,090 sit in a pale band the
// component eraser cannot see. The figure's own ink is 0–140 and the stamp is
// 160–235, so the two are separable by TONE even though they are not separable
// by shape. So the same box now also whitens pale pixels — with everything as
// dark as the figure, plus a halo around it, protected, so a curve running
// through the box keeps its soft edges. He asked for one button, not two:
// "can we group this functionality together with clean?"
/** The figure's own ink. Anything this dark is never washed. */
export const DARK = 120;
/** Above this is the page itself; washing it would change nothing. */
// 12 Sep 2026 (Adrian, on a candidate that still showed the ghost of a logo:
// "cleaning still have leftover marks, not complete, marks/watermarks/blemishes
// should be completely gone - cleaned"): the band stopped at 250 and left the
// stamp's faintest tail on the page. Anything short of page white goes.
export const WASH_HI = 254;
/** Pixels this close to the figure's ink are protected — the anti-aliased edge
 *  of a stroke is mid-tone, and washing it would fray every line it touches. */
export const PROTECT_PX = 2;
/** A scan with no clearly dark ink gives no safe floor for the wash: on such an
 *  image the FIGURE may itself be pale, so the wash refuses rather than guess. */
export const MIN_DARK_SHARE = 0.0015;
/** Washing more of the canvas than this is not a blemish job. */
export const MAX_WASH_SHARE = 0.35;
/** White margin painted around each erased component, in pixels. */
export const ERASE_PAD = 2;
/** The ink taken from a box must fill at least this share of the box (sum of
 *  the components' own boxes over the judge's box). Measured on the first
 *  batch, 9 Sep 2026: a judge box around a PALE show-through line (below the
 *  ink threshold) held only a "+" and a "4" of the equation beside it, and the
 *  snap took those; a box around a hand-written label took three fragments of
 *  the tangent line and the "10" tick instead. In every such case the dark ink
 *  inside filled under 3% of the box; a real stray glyph or text line fills
 *  10–50% of a "little generous" box. */
export const MIN_COVERAGE = 0.08;

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Component = Box & { pixels: number };

/** The judge's answer. Boxes are on a 0–1000 grid in both axes. */
/** `clear`: the judge says NOTHING of the figure lies inside this box — only
 *  the foreign mark and blank page — so the box is emptied entirely: every
 *  non-white pixel in it goes, no tone band, no halo. That is what "completely
 *  gone" needs for a logo whose darkest strokes fall below the ink line and
 *  would otherwise be kept as if they were the figure's own ink. */
export type Blemish = { what: string; box: Box; sure: boolean; clear?: boolean };
export type EraseVerdict = { blemishes: Blemish[]; unsure: string[]; refuse: string | null };

/**
 * Parse the judge's JSON. Tolerates prose around the JSON and a fenced block.
 * Anything malformed becomes a refusal — a candidate is never built on a guess
 * about what the judge meant.
 */
export function parseEraseVerdict(text: string): EraseVerdict {
  const refuse = (why: string): EraseVerdict => ({ blemishes: [], unsure: [], refuse: why });
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return refuse('judge returned no JSON');
  let obj: unknown;
  try { obj = JSON.parse(m[0]); } catch { return refuse('judge JSON did not parse'); }
  if (!obj || typeof obj !== 'object') return refuse('judge JSON was not an object');
  const o = obj as Record<string, unknown>;
  if (typeof o.refuse === 'string' && o.refuse.trim()) return refuse(o.refuse.trim());
  const out: Blemish[] = [];
  for (const b of Array.isArray(o.blemishes) ? o.blemishes : []) {
    if (!b || typeof b !== 'object') continue;
    const r = b as Record<string, unknown>;
    const box = Array.isArray(r.box) ? r.box.map(Number) : null;
    if (!box || box.length !== 4 || box.some((n) => !Number.isFinite(n))) continue;
    const [x0, y0, x1, y1] = box;
    if (x1 <= x0 || y1 <= y0 || x0 < 0 || y0 < 0 || x1 > 1000 || y1 > 1000) continue;
    out.push({ what: typeof r.what === 'string' ? r.what.trim() : '', box: { x0, y0, x1, y1 }, sure: r.sure !== false, clear: r.clear === true });
  }
  const unsure = (Array.isArray(o.unsure) ? o.unsure : []).filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  return { blemishes: out, unsure, refuse: null };
}

/**
 * 8-connected components of an ink mask. Plain BFS on a byte mask — figures are
 * a few hundred thousand pixels, and clarity beats a union-find here.
 */
export function inkComponents(grey: Uint8Array | Buffer, w: number, h: number, ink = INK): Component[] {
  const seen = new Uint8Array(w * h);
  const out: Component[] = [];
  const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
    const si = sy * w + sx;
    if (seen[si] || grey[si] >= ink) continue;
    let head = 0, tail = 0; qx[tail] = sx; qy[tail] = sy; tail++; seen[si] = 1;
    let x0 = sx, y0 = sy, x1 = sx, y1 = sy, n = 0;
    while (head < tail) {
      const x = qx[head], y = qy[head]; head++; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (seen[ni] || grey[ni] >= ink) continue;
        seen[ni] = 1; qx[tail] = nx; qy[tail] = ny; tail++;
      }
    }
    out.push({ x0, y0, x1, y1, pixels: n });
  }
  return out;
}

/** Like inkComponents, but also says which component every pixel belongs to
 *  (label 0 = not ink). Needed to keep ONE stroke and clear around it. */
export function labelComponents(grey: Uint8Array | Buffer, w: number, h: number, ink = INK): { labels: Int32Array; comps: Component[] } {
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
    const si = sy * w + sx;
    if (labels[si] || grey[si] >= ink) continue;
    const id = comps.length + 1;
    let head = 0, tail = 0; qx[tail] = sx; qy[tail] = sy; tail++; labels[si] = id;
    let x0 = sx, y0 = sy, x1 = sx, y1 = sy, n = 0;
    while (head < tail) {
      const x = qx[head], y = qy[head]; head++; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (labels[ni] || grey[ni] >= ink) continue;
        labels[ni] = id; qx[tail] = nx; qy[tail] = ny; tail++;
      }
    }
    comps.push({ x0, y0, x1, y1, pixels: n });
  }
  return { labels, comps };
}

/** A judge box (0–1000 grid) as pixels, grown by HINT_PAD on every side. */
export function hintToPixels(b: Box, w: number, h: number, pad = HINT_PAD): Box {
  const px = pad * w, py = pad * h;
  return {
    x0: Math.max(0, Math.floor((b.x0 / 1000) * w - px)), y0: Math.max(0, Math.floor((b.y0 / 1000) * h - py)),
    x1: Math.min(w - 1, Math.ceil((b.x1 / 1000) * w + px)), y1: Math.min(h - 1, Math.ceil((b.y1 / 1000) * h + py)),
  };
}

function overlapShare(c: Box, hint: Box): number {
  const ix = Math.max(0, Math.min(c.x1, hint.x1) - Math.max(c.x0, hint.x0) + 1);
  const iy = Math.max(0, Math.min(c.y1, hint.y1) - Math.max(c.y0, hint.y0) + 1);
  const area = (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1);
  return area ? (ix * iy) / area : 0;
}

/** The guards, as one object so a session WITH EYES can relax them for boxes it
 *  drew itself (a whole sliced line of the neighbouring question is foreign and
 *  large; the automatic path must refuse it, a person who looked need not). */
export type EraseOptions = {
  maxComponentShare?: number;
  minInside?: number;
  minCoverage?: number;
  maxRemovedShare?: number;
  /** Also whiten PALE pixels inside each box (a vendor watermark, a scan
   *  shadow) — the figure's own ink and a halo round it are protected. */
  wash?: boolean;
  maxWashShare?: number;
};
export const AUTO: Required<EraseOptions> = { maxComponentShare: MAX_COMPONENT_SHARE, minInside: MIN_INSIDE, minCoverage: MIN_COVERAGE, maxRemovedShare: MAX_REMOVED_SHARE, wash: true, maxWashShare: MAX_WASH_SHARE };
/** Hand-drawn boxes: bigger glyphs allowed, no coverage test, up to 70% of the
 *  ink — but a component must sit almost WHOLLY inside the box, so an axis or
 *  a curve that runs through a text band is never taken with it. */
export const BY_EYE: Required<EraseOptions> = { maxComponentShare: 0.05, minInside: 0.95, minCoverage: 0, maxRemovedShare: 0.7, wash: true, maxWashShare: 0.5 };

export type Snap = {
  /** Components to erase, one list per accepted hint. */
  erase: Component[];
  /** Why a hint produced nothing — surfaced on the card, never silent. */
  skipped: string[];
};

/**
 * Which ink components a set of judge boxes actually selects. A component is
 * taken when most of its box lies inside the (padded) hint AND it is small
 * enough to be a blemish. The curve, the axes, a paragraph of text — anything
 * big — is refused however it was boxed.
 */
export function snapToComponents(comps: Component[], hints: Blemish[], w: number, h: number, opt: EraseOptions = {}): Snap {
  const o = { ...AUTO, ...opt };
  const erase: Component[] = [];
  const skipped: string[] = [];
  const taken = new Set<Component>();
  for (const hnt of hints) {
    const hint = hintToPixels(hnt.box, w, h);
    let inside = comps.filter((c) => overlapShare(c, hint) >= o.minInside);
    // The judge's coordinates are approximate: when its box holds no ink at
    // all, look once more in a wider ring around it. The size and coverage
    // guards below still apply, so a nearby label is not taken by this.
    if (!inside.length) {
      const wide = hintToPixels(hnt.box, w, h, LOOSE_PAD);
      const tight = hintToPixels(hnt.box, w, h, 0);
      const boxArea = (tight.x1 - tight.x0 + 1) * (tight.y1 - tight.y0 + 1);
      // …but only for ink no bigger than the box the judge drew: it pointed at
      // something about that size, and a label next door is not it.
      inside = comps.filter((c) => overlapShare(c, wide) >= o.minInside && (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1) <= boxArea * 1.5);
    }
    if (!inside.length) { skipped.push(`"${hnt.what || 'blemish'}": no ink inside the box`); continue; }
    const small = inside.filter((c) => ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) / (w * h) <= o.maxComponentShare);
    if (!small.length) { skipped.push(`"${hnt.what || 'blemish'}": the ink there is too large to be a blemish — left alone`); continue; }
    // The box must be ABOUT this ink: a box around a pale mark (below the ink
    // threshold) or a hand-drawn label holds only stray dark specks of the
    // figure itself, and those must never be what gets erased.
    const tight = hintToPixels(hnt.box, w, h, 0);
    const hintArea = (tight.x1 - tight.x0 + 1) * (tight.y1 - tight.y0 + 1);
    const inkArea = small.reduce((a, c) => a + (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1), 0);
    if (hintArea && inkArea / hintArea < o.minCoverage) {
      skipped.push(`"${hnt.what || 'blemish'}": the dark ink inside the box fills only ${Math.round((inkArea / hintArea) * 100)}% of it — the mark named is paler than what this erases, or the box is far too big; left alone`);
      continue;
    }
    for (const c of small) if (!taken.has(c)) { taken.add(c); erase.push(c); }
  }
  return { erase, skipped };
}

/** Pixels as dark as the figure's own ink, grown by `pad` — never washed. */
export function protectedMask(grey: Uint8Array | Buffer, w: number, h: number, dark = DARK, pad = PROTECT_PX): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (grey[i] < dark) m[i] = 1;
  if (pad <= 0) return m;
  // Two 1-D passes: a square dilation, which is what a halo needs to be.
  const rowGrow = (src: Uint8Array) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const off = y * w;
      for (let x = 0; x < w; x++) {
        if (!src[off + x]) continue;
        for (let d = -pad; d <= pad; d++) { const nx = x + d; if (nx >= 0 && nx < w) out[off + nx] = 1; }
      }
    }
    return out;
  };
  const colGrow = (src: Uint8Array) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      for (let d = -pad; d <= pad; d++) { const ny = y + d; if (ny >= 0 && ny < h) out[ny * w + x] = 1; }
    }
    return out;
  };
  return colGrow(rowGrow(m));
}

export type WashResult = { mask: Uint8Array; count: number; boxes: Box[]; skipped: string[] };

/** Pad for a clear box: a little beyond what the judge drew, so the faint
 *  outer edge of a mark it boxed "a little generously" still goes. */
export const CLEAR_PAD = 0.012;

export type ClearResult = { mask: Uint8Array; count: number; boxes: Box[]; skipped: string[]; rest: Blemish[]; kept: string[] };
/** A box that holds more than this share of the figure's DARK ink is not a
 *  blemish box — the judge drew it over the working. Refused unless a person
 *  drew the box. */
export const MAX_DARK_IN_BOX = 0.15;
/** The tail is followed only through pixels clearly darker than page haze. A
 *  scanned JPEG's page sits at 245–254, and a flood that counted that as
 *  "pale mark" walked across the whole page to the figure's thin grey strokes
 *  (12 Sep 2026: YIJC 2022 P1 Q7 lost the radius line of a circle 200px from
 *  the stamp; Q6 lost the "2" of an asymptote label). */
export const SPILL_MAX = 240;
/** How far past its box a mark's pale tail is followed, as a share of the shorter side. */
export const SPILL_REACH = 0.3;

/**
 * The whole-box half (12 Sep 2026). A box the judge marked `clear` is emptied
 * completely — every pixel short of page white goes, with no tone band and no
 * halo, because the judge has said nothing of the figure is inside it. ONE
 * guard, on the judge's word: if a dark component reaching into the box also
 * reaches well outside it, the figure crosses this box (a curve, an axis, a
 * label the judge missed) — so the box is NOT cleared and falls back to the
 * protected mechanisms; that is reported, never silent.
 */
export function clearBoxes(grey: Uint8Array | Buffer, w: number, h: number, _comps: Component[], hints: Blemish[], byEye = false): ClearResult {
  const mask = new Uint8Array(w * h);
  const boxes: Box[] = [];
  const skipped: string[] = [];
  const kept: string[] = [];
  const rest: Blemish[] = [];
  let count = 0;
  // 12 Sep 2026, second pass: EVERY box now works this way, not only the
  // ones the judge called clear. A box the figure passes through used to
  // fall back to the halo wash, which protects every dark pixel in it — and
  // a stamp's solid letters are dark, so they stayed. Now the only thing kept
  // in any box is a dark stroke that enters and leaves it; a dark stamp letter
  // sitting wholly inside goes. The second look and the judge's retry catch a
  // label boxed by mistake; a box over the working is refused outright.
  // The figure's ink is DARK; a stamp's is pale. So the figure is looked for
  // among DARK components only (measured 12 Sep 2026: testing all ink blocked
  // every clear box, because a watermark's own tagline ran out of the box;
  // testing the border ring blocked a box whose edge merely sat on the x-axis).
  // A dark stroke that reaches INTO the box's interior and continues OUTSIDE it
  // is the figure running through. It is KEPT, with a halo — and everything
  // else in the box still goes, dark cores of the stamp included. "Marks,
  // watermarks, blemishes should be completely gone."
  const { labels, comps: darkComps } = labelComponents(grey, w, h, DARK);
  const reach = Math.max(4, Math.round(Math.min(w, h) * 0.01));
  const spill = Math.max(20, Math.round(Math.min(w, h) * SPILL_REACH));
  const totalDark = darkComps.reduce((a, c) => a + c.pixels, 0);
  for (const hnt of hints) {
    const b = hintToPixels(hnt.box, w, h, CLEAR_PAD);
    const inner = { x0: b.x0 + reach, y0: b.y0 + reach, x1: b.x1 - reach, y1: b.y1 - reach };
    const crossing = new Set<number>();
    darkComps.forEach((c, k) => {
      if (c.pixels >= 30
        && c.x0 <= inner.x1 && c.x1 >= inner.x0 && c.y0 <= inner.y1 && c.y1 >= inner.y0
        && (c.x0 < b.x0 - reach || c.x1 > b.x1 + reach || c.y0 < b.y0 - reach || c.y1 > b.y1 + reach)) crossing.add(k + 1);
    });
    // A box over the working: refuse it, do not "clean" it.
    if (!byEye && totalDark >= 200) {   // a real figure has thousands of dark pixels; a tiny canvas has none to guard
      let darkInside = 0;
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { const id = labels[y * w + x]; if (id && !crossing.has(id)) darkInside++; }
      if (darkInside / totalDark > MAX_DARK_IN_BOX) {
        skipped.push(`"${hnt.what || 'mark'}": ${Math.round((darkInside / totalDark) * 100)}% of the figure's ink sits inside this box — that is the working, not a blemish; left alone`);
        continue;
      }
    }
    // Protect the crossing strokes with a halo; clear every other non-white pixel in the box.
    const keep = new Uint8Array(w * h);
    if (crossing.size) {
      for (let y = Math.max(0, b.y0 - PROTECT_PX); y <= Math.min(h - 1, b.y1 + PROTECT_PX); y++)
        for (let x = Math.max(0, b.x0 - PROTECT_PX); x <= Math.min(w - 1, b.x1 + PROTECT_PX); x++) {
          if (!crossing.has(labels[y * w + x])) continue;
          for (let dy = -PROTECT_PX; dy <= PROTECT_PX; dy++) for (let dx = -PROTECT_PX; dx <= PROTECT_PX; dx++) {
            const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) keep[ny * w + nx] = 1;
          }
        }
      kept.push(`"${hnt.what || 'mark'}": a stroke of the figure runs through this box and was kept; the rest of the box was emptied`);
    }
    let n = 0;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const i = y * w + x;
      if (mask[i] || keep[i] || grey[i] >= 255) continue;
      mask[i] = 1; n++;
    }
    // Follow the mark's own pale tail OUTWARD past the box: flood from the
    // box's border through pale pixels (never a dark one, never a kept one),
    // up to SPILL_REACH, so a box the judge drew a little short still leaves
    // nothing behind.
    let sx0 = b.x0, sy0 = b.y0, sx1 = b.x1, sy1 = b.y1;
    if (n) {
      const lim = { x0: Math.max(0, b.x0 - spill), y0: Math.max(0, b.y0 - spill), x1: Math.min(w - 1, b.x1 + spill), y1: Math.min(h - 1, b.y1 + spill) };
      const qx: number[] = [], qy: number[] = [];
      const seed = (x: number, y: number) => { const i = y * w + x; if (mask[i]) { qx.push(x); qy.push(y); } };
      for (let x = b.x0; x <= b.x1; x++) { seed(x, b.y0); seed(x, b.y1); }
      for (let y = b.y0; y <= b.y1; y++) { seed(b.x0, y); seed(b.x1, y); }
      let head = 0;
      while (head < qx.length) {
        const x = qx[head], y = qy[head]; head++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < lim.x0 || ny < lim.y0 || nx > lim.x1 || ny > lim.y1) continue;
          if (nx >= b.x0 && nx <= b.x1 && ny >= b.y0 && ny <= b.y1) continue;   // inside the box: already handled
          const i = ny * w + nx;
          if (mask[i] || keep[i] || grey[i] >= SPILL_MAX || grey[i] < DARK) continue;
          mask[i] = 1; n++; qx.push(nx); qy.push(ny);
          if (nx < sx0) sx0 = nx; if (nx > sx1) sx1 = nx; if (ny < sy0) sy0 = ny; if (ny > sy1) sy1 = ny;
        }
      }
    }
    if (n) { boxes.push({ x0: sx0, y0: sy0, x1: sx1, y1: sy1 }); count += n; }
  }
  return { mask, count, boxes, skipped, rest, kept };
}

/**
 * The pale half: inside each box, whiten every pixel that is paler than the
 * figure's ink but darker than the page, unless it is protected. Returns the
 * mask, how many pixels it covers, and one bounding box per hint that washed
 * something (what the card outlines in red).
 */
export function washPale(
  grey: Uint8Array | Buffer, w: number, h: number, hints: Blemish[], opt: EraseOptions = {},
): WashResult {
  const o = { ...AUTO, ...opt };
  const mask = new Uint8Array(w * h);
  const boxes: Box[] = [];
  const skipped: string[] = [];
  let count = 0;
  let dark = 0;
  for (let i = 0; i < w * h; i++) if (grey[i] < DARK) dark++;
  if (dark / (w * h) < MIN_DARK_SHARE) {
    return { mask, count: 0, boxes, skipped: ['the scan has no clearly dark ink, so a pale wash could take the figure itself — not attempted'] };
  }
  const prot = protectedMask(grey, w, h);
  for (const hnt of hints) {
    const b = hintToPixels(hnt.box, w, h, 0);
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const i = y * w + x;
      if (prot[i] || mask[i]) continue;
      const v = grey[i];
      if (v < DARK || v >= WASH_HI) continue;
      mask[i] = 1; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (n) { boxes.push({ x0, y0, x1, y1 }); count += n; }
  }
  if (count / (w * h) > o.maxWashShare) {
    return { mask: new Uint8Array(w * h), count: 0, boxes: [], skipped: [`a pale wash would whiten ${Math.round((count / (w * h)) * 100)}% of the canvas — refused`] };
  }
  return { mask, count, boxes, skipped };
}

/** Grow a pixel box by `pad` and clamp to the canvas. */
export function padBox(b: Box, w: number, h: number, pad = ERASE_PAD): Box {
  return { x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad), x1: Math.min(w - 1, b.x1 + pad), y1: Math.min(h - 1, b.y1 + pad) };
}

/** Boxes that touch or overlap (within `gap` px) become one, so a speckled band
 *  erased as 300 components is shown as a few red outlines, not 300. */
export function mergeBoxes(boxes: Box[], gap = 3): Box[] {
  let out = boxes.map((b) => ({ ...b }));
  let merged = true;
  while (merged) {
    merged = false;
    const next: Box[] = [];
    for (const b of out) {
      const i = next.findIndex((n) => b.x0 <= n.x1 + gap && b.x1 >= n.x0 - gap && b.y0 <= n.y1 + gap && b.y1 >= n.y0 - gap);
      if (i < 0) next.push(b);
      else { const n = next[i]; next[i] = { x0: Math.min(n.x0, b.x0), y0: Math.min(n.y0, b.y0), x1: Math.max(n.x1, b.x1), y1: Math.max(n.y1, b.y1) }; merged = true; }
    }
    out = next;
  }
  return out;
}

/** Boxes as fractions of the canvas — what the page draws in red over the original. */
export function boxesAsFractions(boxes: Box[], w: number, h: number): Array<[number, number, number, number]> {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return boxes.map((b) => [r(b.x0 / w), r(b.y0 / h), r((b.x1 + 1) / w), r((b.y1 + 1) / h)]);
}

export type EraseResult =
  | { ok: true; png: Buffer; erased: Box[]; removedInk: number; washedPale: number; totalInk: number; skipped: string[]; width: number; height: number }
  | { ok: false; reason: string; skipped: string[] };

/**
 * The exact half: given the judge's boxes, whiten the ink components they
 * select. Refuses (no candidate) when nothing safe is selected or when the
 * selection removes more ink than a blemish job should.
 */
export async function eraseBlemishes(src: Buffer, hints: Blemish[], opt: EraseOptions = {}): Promise<EraseResult> {
  const o = { ...AUTO, ...opt };
  const flat = sharp(src).flatten({ background: '#fff' });
  const { data, info } = await flat.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  if (w * h > 6_000_000) return { ok: false, reason: 'image too large to component-label', skipped: [] };

  const comps = inkComponents(data, w, h);
  const totalInk = comps.reduce((a, c) => a + c.pixels, 0);

  // Boxes the judge called empty of the figure are emptied whole — nothing
  // short of page white survives in them. The rest go through the two
  // protected mechanisms below.
  const cleared = clearBoxes(data, w, h, comps, hints, o.minInside === BY_EYE.minInside);
  const hintsLeft = cleared.rest;

  // Dark marks, by shape.
  const snap = snapToComponents(comps, hintsLeft, w, h, o);
  const removedInk = snap.erase.reduce((a, c) => a + c.pixels, 0);
  const tooMuchInk = !!totalInk && removedInk / totalInk > o.maxRemovedShare;

  // Pale marks, by tone — the same boxes, the figure's ink protected.
  const wash = o.wash && hintsLeft.length ? washPale(data, w, h, hintsLeft, o) : { mask: new Uint8Array(0), count: 0, boxes: [] as Box[], skipped: [] as string[] };
  const skipped = [...cleared.skipped, ...cleared.kept, ...(tooMuchInk ? [`the dark ink selected is ${Math.round((removedInk / totalInk) * 100)}% of the figure — left alone`] : []), ...snap.skipped, ...wash.skipped];

  const comp = tooMuchInk ? [] : snap.erase;
  if (!comp.length && !wash.count && !cleared.count) {
    return { ok: false, reason: tooMuchInk ? `would remove ${Math.round((removedInk / totalInk) * 100)}% of the ink — not a blemish job` : 'nothing safe to erase', skipped };
  }

  const erased = [...cleared.boxes, ...comp.map((c) => padBox(c, w, h)), ...wash.boxes];
  // One raw pass writes both: component rectangles and the washed pixels.
  const rgb = await flat.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = rgb.data, ch = rgb.info.channels;
  for (const b of comp.map((c) => padBox(c, w, h))) {
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const i = (y * w + x) * ch; for (let k = 0; k < ch; k++) px[i + k] = 255;
    }
  }
  if (wash.count) for (let i = 0; i < w * h; i++) if (wash.mask[i]) { const j = i * ch; for (let k = 0; k < ch; k++) px[j + k] = 255; }
  if (cleared.count) for (let i = 0; i < w * h; i++) if (cleared.mask[i]) { const j = i * ch; for (let k = 0; k < ch; k++) px[j + k] = 255; }
  const png = await sharp(px, { raw: { width: w, height: h, channels: ch as 1 | 2 | 3 | 4 } }).png().toBuffer();
  return { ok: true, png, erased, removedInk: tooMuchInk ? 0 : removedInk, washedPale: wash.count + cleared.count, totalInk, skipped, width: w, height: h };
}

/**
 * The copy the judge LOOKS at: the figure with a faint labelled grid (every 100
 * on the 0–1000 scale it answers in) drawn over it. Erasing always works on the
 * original bytes; the grid only exists so the judge can read positions off the
 * picture instead of guessing them — the first batch put a third of its boxes
 * beside the mark rather than on it.
 */
export async function judgeView(src: Buffer): Promise<Buffer> {
  const meta = await sharp(src).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return src;
  const fs = Math.max(9, Math.round(Math.min(w, h) / 60));
  const lines: string[] = [];
  for (let i = 1; i < 10; i++) {
    const x = (i * w) / 10, y = (i * h) / 10;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#2563eb" stroke-opacity="0.35" stroke-width="1"/>`);
    lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#2563eb" stroke-opacity="0.35" stroke-width="1"/>`);
    lines.push(`<text x="${x + 2}" y="${fs + 1}" font-size="${fs}" font-family="Helvetica,Arial" fill="#2563eb">x${i * 100}</text>`);
    lines.push(`<text x="2" y="${y - 2}" font-size="${fs}" font-family="Helvetica,Arial" fill="#2563eb">y${i * 100}</text>`);
  }
  const svg = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`);
  return sharp(src).flatten({ background: '#fff' }).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
}

// ── the second look (9 Sep 2026) ─────────────────────────────────────────────
// Measured on 26 stamped JC solution images: a pale wash removed the vendor
// stamp cleanly on 8 of them and took part of the MATHS on the other 18 — a
// grey curve, a green curve, a red curve, the gridlines of a scatter plot, and
// again and again the minus sign in front of a coordinate. Those figures are
// drawn in grey or coloured strokes that live in the same tone band as the
// stamp, so no tone rule can separate them. What CAN separate them is another
// look: the judge is shown the before and the after and asked what disappeared
// that belongs to the figure. A candidate that fails this is never offered.
export type VerifyVerdict = { ok: boolean; lost: string[]; note: string };

export function verifyPrompt(): string {
  return [
    'Two versions of the same exam figure: FIRST the original, SECOND after an automatic clean that was meant to',
    'remove only foreign marks (a vendor watermark, a stray letter, page furniture).',
    'Compare them carefully and answer this one question: did the clean remove or damage anything that BELONGS to',
    'the figure? Look especially at thin strokes, dashed lines, grey or coloured curves, gridlines, axis numbers,',
    'and MINUS SIGNS in front of coordinates — these are the things such a clean destroys most often.',
    'Answer with JSON only, no prose:',
    '{"ok":true,"lost":[]}  — the second image keeps every part of the figure, and the foreign marks are gone',
    '{"ok":false,"lost":["<what went missing or broke, and where>"]}  — anything of the figure is missing or broken',
    'Judge the FIGURE only. Foreign marks disappearing is the point and is never a loss.',
    'If any part of the maths is fainter, broken into dashes, or gone, answer false.',
  ].join('\n');
}

export function parseVerifyVerdict(text: string): VerifyVerdict {
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, lost: ['the second look returned no JSON'], note: 'unverified' };
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return { ok: false, lost: ['the second look\'s JSON did not parse'], note: 'unverified' }; }
  const lost = (Array.isArray(o.lost) ? o.lost : []).filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  const ok = o.ok === true && lost.length === 0;
  return { ok, lost, note: ok ? 'a second look confirms every part of the figure survived' : `a second look found: ${lost.join('; ') || 'the figure changed'}` };
}

/** What the judge is asked. The fitness note names the blemish already; the
 *  judge's job is to point at it, and to say when a mark might be a label. */
export function judgePrompt(note: string | null | undefined, avoid: string[] = []): string {
  return [
    'You are looking at a figure cropped from a Singapore exam paper, to be shown to students.',
    'Find every mark that is NOT part of the figure: a stray letter or word from the prose beside the crop,',
    'a fragment of a neighbouring question or its line, page furniture (page numbers, headers, "Turn over"),',
    'a smudge or scanner speck. Do NOT include anything that belongs to the figure itself: axis names, curve',
    'labels, coordinates, dimension text, letters naming points, arrows, ticks, hatching, shading.',
    note ? `The review note for this figure says: "${note}"` : '',
    avoid.length ? 'A previous attempt at this figure was REJECTED because its clean removed these parts of the figure: '
      + avoid.map((a) => `"${a}"`).join('; ') + '. Those belong to the figure. Do not box them, keep every box well clear of them,'
      + ' and set "clear": false on any box that comes near them.' : '',
    'Answer with JSON only, no prose:',
    '{"blemishes":[{"what":"<short description>","box":[x0,y0,x1,y1],"sure":true,"clear":true}],"unsure":["<a mark you could not classify, and where>"],"refuse":null}',
    'Boxes are on a 0-1000 grid: x from the left edge, y from the top. Faint blue grid lines labelled x100…x900 and',
    'y100…y900 are drawn on the image at every 100 to help you read positions — they are not part of the figure.',
    'A box must contain the WHOLE mark, out to its faintest edge — a vendor logo, wordmark, phone number or web',
    'address is one mark: box all of it, not a piece. The clean must leave nothing of the mark behind.',
    'Set "clear": true when NOTHING of the figure lies inside the box — only the foreign mark and blank page; that',
    'box will be emptied completely. Set "clear": false when any part of the figure (a curve, an axis, a label, a',
    'gridline, shading) passes through the box; then only the mark is taken and the figure is protected. When a',
    'mark crosses the figure, give TWO boxes: the part in empty space with clear:true, the crossing part with clear:false.',
    'If you are not certain a mark is foreign, put it in "unsure" instead of "blemishes". If the figure has no',
    'foreign mark, return an empty "blemishes" list. If the image cannot be judged, set "refuse" to why.',
  ].filter(Boolean).join('\n');
}

// ── 🚱 Remove watermark (9 Sep 2026) ─────────────────────────────────────────
// Adrian, after cleaning left most of a KIASU stamp behind: "cleaning isn't
// working that well - but there is potential to work well … or is there a
// remove watermark option? but these option should not be mechanical? should be
// read by a model".
//
// Clean asks the judge WHERE a foreign mark is and erases inside that box, so a
// stamp spread across the whole frame comes off in fragments. A watermark is a
// different question with a better answer: it is one THING, printed in its own
// COLOUR. So here the model is not asked to draw boxes. It is asked to point at
// a few places that are watermark and a few that are the figure, and the code
// samples the real pixels there. Every pixel is then classified by which of
// those colours it is nearer — counting the whole blend from that colour to
// white, because a watermark is anti-aliased and printed pale.
//
// This separates what tone alone could not: where a pale wash destroyed a grey
// curve, the curve is grey and the stamp is blue — far apart in colour, alike
// in tone. The figure survives.
//
// ⚠ MEASURED, AND NOT GOOD ENOUGH TO EXPOSE (9 Sep 2026). Run over ten stamped
// JC solution images, this protects the maths but does NOT remove the stamp
// well: it takes the flat interior of a logo and leaves its anti-aliased edge,
// so a solid running-figure becomes an OUTLINE — on VJC 2021 P1 Q8 and HCI 2020
// P1 Q6 the result looks worse than the original, and the second look passed
// both because it is only asked about losing figure content, not about the
// stamp being half-removed. Four more removed almost nothing. So there is no
// 'remove watermark' button on the lane: the machinery and its tests are kept
// here because the approach is right (a model points, the pixels decide) and the
// gap is measurable, but what it needs is the plate-subtraction route — estimate
// the watermark from a SISTER PAGE of the same paper that carries the same stamp,
// then subtract it with local gain — not another colour rule. Until then a stamp
// printed over the working is a redraw job.

/** A point the model puts on the picture, on the same 0–1000 grid it reads. */
export type Pt = { x: number; y: number; what?: string };
export type StampVerdict = { stamp: Pt[]; figure: Pt[]; refuse: string | null; overlaps: boolean };

/** How far a pixel may sit from a sampled colour's blend-to-white line. */
export const COLOUR_TOL = 46;
/** A watermark pixel must be at least this much nearer the stamp than the figure. */
export const COLOUR_MARGIN = 6;

export function stampPrompt(note: string | null | undefined): string {
  return [
    'This is a figure from an exam paper, overprinted with a VENDOR WATERMARK (a logo, a wordmark, a phone number,',
    'a web address, a diagonal band). Faint blue grid lines labelled x100…x900 and y100…y900 are drawn on the image',
    'at every 100 to help you read positions — they are NOT part of the figure and NOT the watermark.',
    note ? `The review note says: "${note}"` : '',
    'Do not describe boxes. Instead POINT at pixels, on the 0-1000 grid (x from the left, y from the top):',
    '  • "stamp": 4 to 10 points that sit squarely ON the watermark\'s own ink — on a thick stroke of the logo, inside',
    '    a letter of the wordmark, on the coloured band. Spread them over every distinct colour the watermark uses.',
    '    Never put one where the watermark crosses the figure.',
    '  • "figure": 4 to 10 points that sit squarely ON the maths — the curve, an axis, a label, a gridline the figure',
    '    itself draws, any shading that belongs to the answer. Include every colour the FIGURE uses.',
    'Answer with JSON only, no prose:',
    '{"stamp":[{"x":120,"y":800,"what":"grey logo leg"}],"figure":[{"x":400,"y":300,"what":"blue curve"}],"overlaps":true,"refuse":null}',
    '"overlaps" is true when the watermark crosses the maths anywhere. Set "refuse" to a reason if there is no',
    'watermark, or if the watermark is printed in the same colour as the figure so removing it must damage the maths.',
  ].filter(Boolean).join('\n');
}

export function parseStampVerdict(text: string): StampVerdict {
  const no = (why: string): StampVerdict => ({ stamp: [], figure: [], refuse: why, overlaps: false });
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return no('the watermark reader returned no JSON');
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return no('the watermark reader\'s JSON did not parse'); }
  if (typeof o.refuse === 'string' && o.refuse.trim()) return no(o.refuse.trim());
  const pts = (v: unknown): Pt[] => (Array.isArray(v) ? v : []).flatMap((p) => {
    if (!p || typeof p !== 'object') return [];
    const r = p as Record<string, unknown>;
    const x = Number(r.x), y = Number(r.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1000 || y > 1000) return [];
    return [{ x, y, what: typeof r.what === 'string' ? r.what : undefined }];
  });
  const stamp = pts(o.stamp), figure = pts(o.figure);
  if (!stamp.length) return no('the watermark reader pointed at no watermark pixel');
  return { stamp, figure, refuse: null, overlaps: o.overlaps === true };
}

export type RGB = [number, number, number];

/**
 * The colour of the INK NEAREST a point the model gave.
 *
 * Measured 9 Sep 2026 on CJC 2022 P1 Q8: of nine points the model put on the
 * watermark, eight sampled pure white — it points beside a thin stroke, not on
 * it, and a white "stamp colour" makes the classifier useless. So the point is
 * a hint, not a measurement: search outward for real ink and take the median of
 * the darkest of it. The model does the seeing; the pixels do the measuring.
 */
export function sampleInkNear(
  px: Uint8Array | Buffer, grey: Uint8Array | Buffer, w: number, h: number, ch: number,
  cx: number, cy: number, radius: number,
): RGB | null {
  const found: Array<{ v: number; c: RGB }> = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++)
    for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
      const i = y * w + x;
      if (grey[i] >= 250) continue;
      const j = i * ch;
      found.push({ v: grey[i], c: [px[j], px[j + Math.min(1, ch - 1)], px[j + Math.min(2, ch - 1)]] });
    }
  if (!found.length) return null;
  found.sort((a, b) => a.v - b.v);
  const core = found.slice(0, Math.max(1, Math.round(found.length * 0.3)));
  const med = (k: number) => { const v = core.map((f) => f.c[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  return [med(0), med(1), med(2)];
}

/** The median colour of a small patch, so one stray pixel cannot define a class. */
export function sampleColour(px: Uint8Array | Buffer, w: number, h: number, ch: number, cx: number, cy: number, r = 2): RGB {
  const out: RGB = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const vals: number[] = [];
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) vals.push(px[(y * w + x) * ch + Math.min(k, ch - 1)]);
    vals.sort((a, b) => a - b);
    out[k] = vals[vals.length >> 1] ?? 255;
  }
  return out;
}

/** Distance from a colour to the blend line running from white to `c`. A pale,
 *  anti-aliased print of `c` lies along that line, so this catches every tint of
 *  it without catching a different hue that happens to be equally pale. */
export function distToTintLine(p: RGB, c: RGB): number {
  const w: RGB = [255, 255, 255];
  const d: RGB = [c[0] - w[0], c[1] - w[1], c[2] - w[2]];
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (len2 === 0) return Math.hypot(p[0] - 255, p[1] - 255, p[2] - 255);
  let t = ((p[0] - w[0]) * d[0] + (p[1] - w[1]) * d[1] + (p[2] - w[2]) * d[2]) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (w[0] + t * d[0]), p[1] - (w[1] + t * d[1]), p[2] - (w[2] + t * d[2]));
}

const nearest = (p: RGB, cs: RGB[]) => cs.reduce((a, c) => Math.min(a, distToTintLine(p, c)), Infinity);

/** Which pixels belong to the watermark: nearer a stamp colour than any figure
 *  colour by a clear margin, within tolerance, and not part of the figure's dark ink. */
export function classifyStamp(
  px: Uint8Array | Buffer, w: number, h: number, ch: number, stampCols: RGB[], figCols: RGB[],
  protectedPx: Uint8Array, tol = COLOUR_TOL, margin = COLOUR_MARGIN,
): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (protectedPx[i]) continue;
    const j = i * ch;
    const p: RGB = [px[j], px[j + Math.min(1, ch - 1)], px[j + Math.min(2, ch - 1)]];
    if (p[0] > 250 && p[1] > 250 && p[2] > 250) continue;   // already page
    const ds = nearest(p, stampCols);
    if (ds > tol) continue;
    if (figCols.length && nearest(p, figCols) <= ds + margin) continue;
    mask[i] = 1; count++;
  }
  return { mask, count };
}

export type UnstampResult =
  | { ok: true; png: Buffer; removed: number; boxes: Box[]; width: number; height: number; stampCols: RGB[]; figCols: RGB[] }
  | { ok: false; reason: string };

/** The whole watermark removal: sample the colours the model pointed at,
 *  classify every pixel, whiten the watermark's own. The canvas is never
 *  cropped and the figure's dark ink is protected throughout. */
export async function removeWatermark(src: Buffer, v: StampVerdict, opt: { maxShare?: number } = {}): Promise<UnstampResult> {
  const flat = sharp(src).flatten({ background: '#fff' });
  const { data: grey, info } = await flat.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  if (w * h > 6_000_000) return { ok: false, reason: 'image too large' };
  const rgb = await flat.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = rgb.data, ch = rgb.info.channels;
  // A point is a hint; look outward for the ink it meant, and drop a point that
  // found none rather than letting white stand in for a colour.
  const r = Math.max(6, Math.round(Math.min(w, h) * 0.02));
  const at = (p: Pt) => sampleInkNear(px, grey, w, h, ch, Math.round((p.x / 1000) * (w - 1)), Math.round((p.y / 1000) * (h - 1)), r);
  const stampCols = v.stamp.map(at).filter((c): c is RGB => !!c);
  const figCols = v.figure.map(at).filter((c): c is RGB => !!c);
  if (!stampCols.length) return { ok: false, reason: 'none of the points the model gave sit near any watermark ink' };
  // The figure's own dark ink is protected outright, plus a halo, so a stroke
  // the watermark crosses keeps its soft edges.
  const prot = protectedMask(grey, w, h);
  const { mask, count } = classifyStamp(px, w, h, ch, stampCols, figCols, prot);
  if (!count) return { ok: false, reason: 'no pixel matched the watermark colours the model pointed at' };
  const share = count / (w * h);
  const maxShare = opt.maxShare ?? 0.6;
  if (share > maxShare) return { ok: false, reason: `that would whiten ${Math.round(share * 100)}% of the canvas — refused` };
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) if (mask[i]) {
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const j = i * ch; for (let k = 0; k < ch; k++) px[j + k] = 255;
  }
  const png = await sharp(px, { raw: { width: w, height: h, channels: ch as 1 | 2 | 3 | 4 } }).png().toBuffer();
  return { ok: true, png, removed: count, boxes: [{ x0, y0, x1, y1 }], width: w, height: h, stampCols, figCols };
}
