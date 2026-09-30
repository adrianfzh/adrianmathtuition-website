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
// Rules: a page the marker rotated (rot ≠ 0) gets no snippet — the boxes are
// in the rotated frame and the image is not; a run before the boxes existed
// (the Aug 2026 test papers) gets none; then the card shows the typed lines.

export interface Snippet {
  photoIndex: number;
  /** The page image the window shows (the pen's copy, not the one with solutions drawn on). */
  url: string;
  /** The window as fractions of the page image: left, top, width, height. */
  x: number; y: number; w: number; h: number;
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
    const regions = (Array.isArray(g.partRegions) ? g.partRegions : []).map(rec).filter((r): r is Json => !!r)
      .filter(r => sameQuestion(str(r.question), questionNumber) && r.not_attempted !== true)
      .map(r => rec(r.bbox)).filter((b): b is Json => !!b);
    if (!regions.length) continue;
    const x1 = Math.max(0, Math.min(...regions.map(b => num(b.x1))) - SNIPPET_PAD);
    const y1 = Math.max(0, Math.min(...regions.map(b => num(b.y1))) - SNIPPET_PAD);
    const y2 = Math.min(spaceH, Math.max(...regions.map(b => num(b.y2))) + SNIPPET_PAD);
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
    });
  }
  return out;
}

/**
 * Where the question sits down its page, for "See it on my paper" (fractions of
 * the page image's height): the centre and the height of its parts' boxes on
 * that page. Null when the run has no boxes for it there.
 */
export function regionAt(annotationDebug: unknown, annotatedPhotos: unknown, questionNumber: string, photoIndex: number): { at: number; span: number } | null {
  const s = snippetsFor(annotationDebug, annotatedPhotos, questionNumber).find(x => x.photoIndex === photoIndex);
  if (!s) return null;
  return { at: s.y + s.h / 2, span: s.h };
}
