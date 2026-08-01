// Draft persistence for in-progress ink (the tab-eviction insurance Adrian asked
// for, 1 Aug 2026): strokes serialize to compact JSON keyed by run id, so Safari
// reloading the tab mid-annotation costs nothing. After Done the draft is KEPT
// (stamped doneAt) — re-opening Annotate offers "edit your previous ink" instead
// of a blank restart. Pure serialize/parse; localStorage I/O stays in the overlay.

import type { Stroke } from './types';

export type AnnotateDraft = {
  v: 1;
  runId: string;
  savedAt: number;
  /** Set once a Done succeeded with these strokes — the draft is then a re-edit base. */
  doneAt: number | null;
  /** photo_index → strokes. */
  pages: Record<number, Stroke[]>;
};

export function draftKey(runId: string): string {
  return `annotate-draft:v1:${runId}`;
}

export function makeDraft(runId: string, pages: Record<number, Stroke[]>, savedAt: number, doneAt: number | null = null): AnnotateDraft {
  return { v: 1, runId, savedAt, doneAt, pages: prunePages(pages) };
}

export function draftIsEmpty(d: AnnotateDraft): boolean {
  return Object.values(d.pages).every((s) => s.length === 0);
}

/** Compact: drop empty pages, round coords to 0.1px and pressure to 0.01. */
function prunePages(pages: Record<number, Stroke[]>): Record<number, Stroke[]> {
  const out: Record<number, Stroke[]> = {};
  for (const [k, strokes] of Object.entries(pages)) {
    if (!strokes.length) continue;
    out[Number(k)] = strokes.map((s) => ({
      tool: s.tool,
      color: s.color,
      width: round1(s.width),
      ...(s.snapped ? { snapped: s.snapped } : {}),
      points: s.points.map((p) => ({ x: round1(p.x), y: round1(p.y), p: round2(p.p) })),
    }));
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function serializeDraft(d: AnnotateDraft): string {
  return JSON.stringify({ ...d, pages: prunePages(d.pages) });
}

/** null on anything unusable: bad JSON, wrong version, wrong shape. */
export function parseDraft(raw: string | null | undefined): AnnotateDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || typeof d.runId !== 'string' || typeof d.pages !== 'object' || d.pages === null) return null;
    const pages: Record<number, Stroke[]> = {};
    for (const [k, v] of Object.entries(d.pages)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || !Array.isArray(v)) return null;
      const strokes: Stroke[] = [];
      for (const s of v as unknown[]) {
        const st = s as Partial<Stroke>;
        if (!st || (st.tool !== 'pen' && st.tool !== 'highlighter')) return null;
        if (typeof st.color !== 'string' || typeof st.width !== 'number' || !Array.isArray(st.points)) return null;
        if (!st.points.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.p === 'number')) return null;
        strokes.push({
          tool: st.tool, color: st.color, width: st.width, points: st.points,
          ...(st.snapped ? { snapped: st.snapped } : {}),
        });
      }
      pages[idx] = strokes;
    }
    return {
      v: 1, runId: d.runId, pages,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
      doneAt: typeof d.doneAt === 'number' ? d.doneAt : null,
    };
  } catch {
    return null;
  }
}
