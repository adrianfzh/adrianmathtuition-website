// The snippet of the student's own page a Notebook card shows on its left
// (1 Oct 2026, Adrian: "won't you be able to show the snippet of their mistake?
// instead of something rendered for the app?"). PURE, tested.
//
// The marker already stores, per page, where every part sits:
//   result_json.annotation_debug[<photo_index>].grounding
//     .space        { w, h }        the page in the layer's frame (960 × 1280)
//     .partRegions  [{ question, bbox: { x1, y1, x2, y2 }, … }]
// and the saved page image IS the layer's canvas — `annotated_photos[].layer`
// { canvasW, totalH } (the page plus the side strip and the solutions panel) at
// some scale. So a part's window on the page is its bbox as FRACTIONS of
// canvasW × totalH, and the card can show it with nothing more than the page
// image it already has (a div the window's shape, overflow hidden, the image
// scaled and shifted inside). No crop is written anywhere.
//
// The strip to the right of the page holds the pen's notes; the window keeps
// it (Adrian, 1 Oct 2026: the cut edge looked abrupt without them).
//
// Only the parts that lost marks count; a part with no marks recorded is treated
// as lost. Which of them share a window is `windowsFor` (below).
//
// Rules: a page the marker rotated (rot ≠ 0) gets no snippet — the boxes are
// in the rotated frame and the image is not; a run before the boxes existed
// (the Aug 2026 test papers) gets none; then the card shows the typed lines.

export interface Snippet {
  photoIndex: number;
  /** The page image the window shows (the pen's copy, not the one with solutions drawn on). */
  url: string;
  /** The window as fractions of the page image: left, top, width, height. */
  x: number; y: number; w: number; h: number;
  /** The page image's height ÷ width — the box's `top` offset needs it (the window's own aspect is h/w × this). */
  pageAspect: number;
}

/** Padding around a part's box, in layer units (the page is 960 wide). */
export const SNIPPET_PAD = 24;

type Json = Record<string, unknown>;
const rec = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

interface Frame { canvasW: number; totalH: number; pageW: number; url: string }

/** The page's frame from its annotated_photos entry, or null when the run has no layer. */
function frameOf(photo: unknown): Frame | null {
  const p = rec(photo);
  const layer = rec(p?.layer);
  const canvasW = num(layer?.canvasW), totalH = num(layer?.totalH), pageW = num(layer?.width);
  const url = str(p?.url);
  if (!(canvasW > 0) || !(totalH > 0) || !(pageW > 0) || !/^https:\/\//.test(url)) return null;
  return { canvasW, totalH, pageW, url };
}

const sameQuestion = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

interface Box { x1: number; y1: number; x2: number; y2: number }

/**
 * A stretch of full-mark parts between two lost ones longer than this (a
 * fraction of the page's height, about four to five written lines) splits the
 * window in two; shorter, the one window keeps the run of the page.
 */
export const GAP_SPLIT = 0.15;
/** How many of the student's lines above a window's first lost part ride along — a ✗ line reads with the lines before it. */
export const CONTEXT_LINES = 2;
/** The context never reaches further up than this fraction of the page. */
const CONTEXT_MAX = 0.12;

/**
 * The windows for one page's lost parts (Adrian, 1 Oct 2026: "whether to do
 * option 1, 2 and 3 really depends on the question and the mistakes"):
 *   • lost parts next to each other, or with a short run of right parts between
 *     them, share one window;
 *   • a long run of right parts between two lost ones splits the window there;
 *   • every window is extended upward over the CONTEXT_LINES nearest lines that
 *     end above its first lost part (the marker's per-line boxes), so a ✗ line
 *     is read with what came before it.
 * Pure; layer units in, layer units out.
 */
export function windowsFor(lost: readonly Box[], lines: readonly { y1: number; y2: number }[], pageH: number): Box[] {
  const parts = [...lost].filter(b => [b.x1, b.y1, b.x2, b.y2].every(Number.isFinite)).sort((a, b) => a.y1 - b.y1);
  const out: Box[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && p.y1 - last.y2 <= GAP_SPLIT * pageH) {
      last.x1 = Math.min(last.x1, p.x1); last.x2 = Math.max(last.x2, p.x2); last.y2 = Math.max(last.y2, p.y2);
    } else {
      out.push({ ...p });
    }
  }
  for (const w of out) {
    const above = lines.filter(l => l.y2 <= w.y1 + 1).sort((a, b) => b.y2 - a.y2).slice(0, CONTEXT_LINES);
    if (!above.length) continue;
    const top = Math.min(...above.map(l => l.y1));
    w.y1 = Math.max(top, w.y1 - CONTEXT_MAX * pageH);
  }
  return out;
}

/**
 * Every window for a question, page order — one per page the question's parts
 * sit on. Empty when the run has no boxes for it.
 */
export function snippetsFor(annotationDebug: unknown, annotatedPhotos: unknown, questionNumber: string): Snippet[] {
  // annotation_debug is one entry per photo — an array on most runs, an object keyed by photo index on some.
  const entries: [string, unknown][] = Array.isArray(annotationDebug)
    ? annotationDebug.map((d, i) => [String(i), d] as [string, unknown])
    : Object.entries(rec(annotationDebug) ?? {});
  if (!entries.length || !Array.isArray(annotatedPhotos) || !questionNumber) return [];
  const out: Snippet[] = [];
  const photos = annotatedPhotos.map(rec).filter((p): p is Json => !!p);
  for (const [key, raw] of entries.sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const d = rec(raw);
    const g = rec(d?.grounding);
    const space = rec(g?.space);
    if (!d || !g || !space) continue;
    if (num(d.rot) !== 0 && !Number.isNaN(num(d.rot))) continue;
    const photoIndex = Number.isInteger(num(d.photo_index)) ? num(d.photo_index) : Number(key);
    const frame = frameOf(photos.find(p => num(p.photo_index) === photoIndex));
    if (!frame) continue;
    const spaceW = num(space.w), spaceH = num(space.h);
    if (!(spaceW > 0) || !(spaceH > 0)) continue;
    // Only the parts that LOST marks (Adrian, 1 Oct 2026: the window covered the
    // full-mark parts around them); a part with no marks recorded counts as lost.
    const regions = (Array.isArray(g.partRegions) ? g.partRegions : []).map(rec).filter((r): r is Json => !!r)
      .filter(r => sameQuestion(str(r.question), questionNumber) && r.not_attempted !== true)
      .filter(r => !(num(r.max) > 0) || !(num(r.awarded) >= num(r.max)))
      .map(r => rec(r.bbox)).filter((b): b is Json => !!b);
    if (!regions.length) continue;
    // The per-line boxes on this page (box_2d = [y1, x1, y2, x2]) — the lines above a window's first lost part.
    const lines = (Array.isArray(g.boxes) ? g.boxes : []).map(rec).filter((b): b is Json => !!b)
      .map(b => (Array.isArray(b.box_2d) ? b.box_2d.map(num) : []))
      .filter(b => b.length === 4 && b.every(Number.isFinite))
      .map(([ly1, , ly2]) => ({ y1: ly1, y2: ly2 }));
    for (const win of windowsFor(regions.map(b => ({ x1: num(b.x1), y1: num(b.y1), x2: num(b.x2), y2: num(b.y2) })), lines, spaceH)) {
      const x1 = Math.max(0, win.x1 - SNIPPET_PAD);
      const y1 = Math.max(0, win.y1 - SNIPPET_PAD);
      const y2 = Math.min(spaceH, win.y2 + SNIPPET_PAD);
      // The strip beside the page rides along: the window runs to the canvas's right edge.
      const x2 = frame.canvasW;
      if (![x1, y1, y2].every(Number.isFinite) || y2 <= y1) continue;
      // Layer units → fractions of the image. The page's width in layer units is
      // space.w (the layer's own `width`); the canvas adds the strip at the same scale.
      const k = frame.pageW / spaceW;
      out.push({
        photoIndex, url: frame.url,
        x: (x1 * k) / frame.canvasW, y: (y1 * k) / frame.totalH,
        w: (x2 - x1 * k) / frame.canvasW, h: ((y2 - y1) * k) / frame.totalH,
        pageAspect: frame.totalH / frame.canvasW,
      });
    }
  }
  return out;
}

/**
 * The CSS that places the page image inside a box of the window's shape (the
 * box is `w/h × pageAspect` tall for its width): the image is 1/w of the box
 * wide, shifted left by x/w of the box, and up by y × pageAspect / h of the box.
 * The last one is where a first cut went wrong — the box's height is not the
 * image's, so `top` in box units carries the page's own aspect.
 */
export function snippetStyle(s: Snippet): { box: { aspectRatio: string }; img: { width: string; left: string; top: string } } {
  return {
    box: { aspectRatio: `${s.w} / ${s.h * s.pageAspect}` },
    img: {
      width: `${(100 / s.w).toFixed(3)}%`,
      left: `${(-100 * s.x / s.w).toFixed(3)}%`,
      top: `${(-100 * s.y * s.pageAspect / (s.h * s.pageAspect)).toFixed(3)}%`,
    },
  };
}

/**
 * Where the question sits down its page, for "See it on my paper" (fractions of
 * the page image's height): the centre and the height of its parts' boxes on
 * that page. Null when the run has no boxes for it there.
 */
export function regionAt(annotationDebug: unknown, annotatedPhotos: unknown, questionNumber: string, photoIndex: number): { at: number; span: number } | null {
  const on = snippetsFor(annotationDebug, annotatedPhotos, questionNumber).filter(x => x.photoIndex === photoIndex);
  if (!on.length) return null;
  const top = Math.min(...on.map(s => s.y)), bottom = Math.max(...on.map(s => s.y + s.h));
  return { at: (top + bottom) / 2, span: bottom - top };
}
