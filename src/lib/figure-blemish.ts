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
export type Blemish = { what: string; box: Box; sure: boolean };
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
    out.push({ what: typeof r.what === 'string' ? r.what.trim() : '', box: { x0, y0, x1, y1 }, sure: r.sure !== false });
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
};
export const AUTO: Required<EraseOptions> = { maxComponentShare: MAX_COMPONENT_SHARE, minInside: MIN_INSIDE, minCoverage: MIN_COVERAGE, maxRemovedShare: MAX_REMOVED_SHARE };
/** Hand-drawn boxes: bigger glyphs allowed, no coverage test, up to 70% of the
 *  ink — but a component must sit almost WHOLLY inside the box, so an axis or
 *  a curve that runs through a text band is never taken with it. */
export const BY_EYE: Required<EraseOptions> = { maxComponentShare: 0.05, minInside: 0.95, minCoverage: 0, maxRemovedShare: 0.7 };

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
      inside = comps.filter((c) => overlapShare(c, wide) >= o.minInside);
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
  | { ok: true; png: Buffer; erased: Box[]; removedInk: number; totalInk: number; skipped: string[]; width: number; height: number }
  | { ok: false; reason: string; skipped: string[] };

/**
 * The exact half: given the judge's boxes, whiten the ink components they
 * select. Refuses (no candidate) when nothing safe is selected or when the
 * selection removes more ink than a blemish job should.
 */
export async function eraseBlemishes(src: Buffer, hints: Blemish[], opt: EraseOptions = {}): Promise<EraseResult> {
  const o = { ...AUTO, ...opt };
  const { data, info } = await sharp(src).flatten({ background: '#fff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  if (w * h > 6_000_000) return { ok: false, reason: 'image too large to component-label', skipped: [] };
  const comps = inkComponents(data, w, h);
  const totalInk = comps.reduce((a, c) => a + c.pixels, 0);
  const snap = snapToComponents(comps, hints, w, h, o);
  if (!snap.erase.length) return { ok: false, reason: 'nothing safe to erase', skipped: snap.skipped };
  const removedInk = snap.erase.reduce((a, c) => a + c.pixels, 0);
  if (totalInk && removedInk / totalInk > o.maxRemovedShare) {
    return { ok: false, reason: `would remove ${Math.round((removedInk / totalInk) * 100)}% of the ink — not a blemish job`, skipped: snap.skipped };
  }
  const erased = snap.erase.map((c) => padBox(c, w, h));
  const overlays = erased.map((b) => ({
    input: { create: { width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1, channels: 3 as const, background: '#fff' } },
    left: b.x0, top: b.y0,
  }));
  const png = await sharp(src).flatten({ background: '#fff' }).composite(overlays).png().toBuffer();
  return { ok: true, png, erased, removedInk, totalInk, skipped: snap.skipped, width: w, height: h };
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

/** What the judge is asked. The fitness note names the blemish already; the
 *  judge's job is to point at it, and to say when a mark might be a label. */
export function judgePrompt(note: string | null | undefined): string {
  return [
    'You are looking at a figure cropped from a Singapore exam paper, to be shown to students.',
    'Find every mark that is NOT part of the figure: a stray letter or word from the prose beside the crop,',
    'a fragment of a neighbouring question or its line, page furniture (page numbers, headers, "Turn over"),',
    'a smudge or scanner speck. Do NOT include anything that belongs to the figure itself: axis names, curve',
    'labels, coordinates, dimension text, letters naming points, arrows, ticks, hatching, shading.',
    note ? `The review note for this figure says: "${note}"` : '',
    'Answer with JSON only, no prose:',
    '{"blemishes":[{"what":"<short description>","box":[x0,y0,x1,y1],"sure":true}],"unsure":["<a mark you could not classify, and where>"],"refuse":null}',
    'Boxes are on a 0-1000 grid: x from the left edge, y from the top. Faint blue grid lines labelled x100…x900 and',
    'y100…y900 are drawn on the image at every 100 to help you read positions — they are not part of the figure.',
    'Make each box a little generous around the mark, but only around that mark.',
    'If you are not certain a mark is foreign, put it in "unsure" instead of "blemishes". If the figure has no',
    'foreign mark, return an empty "blemishes" list. If the image cannot be judged, set "refuse" to why.',
  ].filter(Boolean).join('\n');
}
