// A student's own ink on their marked pages (17 Sep 2026, SPEC-STUDENT-FIRST
// §12): the shape the route accepts and the page reads. Pure; tested.
//
//   pages: { "<photo_index>": { strokes: Stroke[], w: <image px>, h: <image px> } }
//
// Strokes are in page-image pixel coordinates (lib/annotate/types), so a page
// draws them with an SVG whose viewBox is "0 0 w h" laid over the image.
import type { Stroke } from './annotate/types';

export type InkPage = { strokes: Stroke[]; w: number; h: number };
export type InkPages = Record<number, InkPage>;

/** A generous ceiling: a whole paper of dense notes is a few hundred KB. */
/** Adrian's own layer on a student's paper lives in the same table under this identity (18 Sep 2026). */
export const TEACHER_INK_IDENTITY = 'adrian';
export const MAX_INK_BYTES = 3_000_000;
export const MAX_INK_PAGES = 60;
export const MAX_STROKES_PER_PAGE = 5000;

export type InkResult = { ok: true; pages: InkPages } | { ok: false; error: string };

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Validate and tidy what the overlay posts. Unknown keys are dropped; an empty page is dropped. */
export function validateInkPages(input: unknown): InkResult {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'pages must be an object' };
  const out: InkPages = {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_INK_PAGES) return { ok: false, error: 'too many pages' };
  for (const [k, v] of entries) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0) return { ok: false, error: `bad page index ${k}` };
    if (!v || typeof v !== 'object') return { ok: false, error: `page ${k} is not an object` };
    const pg = v as Record<string, unknown>;
    if (!num(pg.w) || !num(pg.h) || (pg.w as number) <= 0 || (pg.h as number) <= 0) return { ok: false, error: `page ${k} has no size` };
    if (!Array.isArray(pg.strokes)) return { ok: false, error: `page ${k} has no strokes` };
    if (pg.strokes.length > MAX_STROKES_PER_PAGE) return { ok: false, error: `page ${k} has too many strokes` };
    const strokes: Stroke[] = [];
    for (const raw of pg.strokes) {
      const st = raw as Record<string, unknown>;
      if (!st || typeof st !== 'object') return { ok: false, error: `page ${k}: a stroke is not an object` };
      const tool = st.tool === 'highlighter' ? 'highlighter' : 'pen';
      const color = typeof st.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(st.color) ? st.color : '#2563eb';
      const width = num(st.width) ? Math.min(200, Math.max(0.5, st.width as number)) : 3;
      if (!Array.isArray(st.points)) return { ok: false, error: `page ${k}: a stroke has no points` };
      const points = (st.points as unknown[]).map(pt => {
        const q = pt as Record<string, unknown>;
        return { x: q?.x, y: q?.y, p: num(q?.p) ? (q.p as number) : 0.5 };
      });
      if (points.some(pt => !num(pt.x) || !num(pt.y))) return { ok: false, error: `page ${k}: a point is not a number` };
      if (!points.length) continue;
      const text = typeof st.text === 'string' && st.text.trim() ? st.text.slice(0, 500) : undefined;
      const fontSize = num(st.fontSize) ? Math.min(200, Math.max(8, st.fontSize as number)) : undefined;
      strokes.push({ tool, color, width, points: points as Stroke['points'], ...(text ? { text, fontSize: fontSize ?? 28 } : {}) } as Stroke);
    }
    if (strokes.length) out[idx] = { strokes, w: pg.w as number, h: pg.h as number };
  }
  const bytes = JSON.stringify(out).length;
  if (bytes > MAX_INK_BYTES) return { ok: false, error: 'the notes are too large to save' };
  return { ok: true, pages: out };
}

export function inkIsEmpty(pages: InkPages | null | undefined): boolean {
  return !pages || Object.values(pages).every(p => !p || !p.strokes.length);
}

/** Only the strokes, by photo index — what the overlay seeds itself from. */
export function inkStrokes(pages: InkPages | null | undefined): Record<number, Stroke[]> {
  const out: Record<number, Stroke[]> = {};
  for (const [k, v] of Object.entries(pages ?? {})) if (v?.strokes?.length) out[Number(k)] = v.strokes;
  return out;
}
