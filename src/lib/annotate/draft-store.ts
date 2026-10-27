// Draft persistence for in-progress ink (the tab-eviction insurance Adrian asked
// for, 1 Aug 2026): strokes serialize to compact JSON keyed by run id, so Safari
// reloading the tab mid-annotation costs nothing. After Done the draft is KEPT
// (stamped doneAt) — re-opening Annotate offers "edit your previous ink" instead
// of a blank restart. Pure serialize/parse; localStorage I/O stays in the overlay.
//
// v2 (27 Oct 2026, Adrian: "sometimes page refreshes, but the changes does not
// appear on screen … And also allow changes made and saved even when offline"):
// the draft also carries, per page, the marker-layer edits (moved / deleted /
// retyped / flipped / added ticks, crosses, notes, score chips — before this only
// the pen strokes were kept, so a reload lost every mark change), which saved
// layer file those edits sit on (`base`), the layer file our own last Done wrote
// (`savedAs`), whether the page has changes the server has not got (`pending`),
// and whether Done was pressed while offline (`uploadQueued` → it uploads by
// itself when the connection comes back). The storage key stays `…:v1:` so the
// inline student pen's clean-up keeps finding it; v1 bodies still parse.

import type { Stroke } from './types';
import type { LayerEdit } from './offline-sync';

export type DraftPageMeta = {
  /** The layer file the edits below are relative to (a /api/files path or URL). */
  base?: string | null;
  /** The layer file the last successful compose of THIS page wrote. */
  savedAs?: string | null;
  /** Marker-layer edits against `base`, by object id. */
  edits?: LayerEdit[];
  /** The page has changes the server has not got. */
  pending?: boolean;
};

export type AnnotateDraft = {
  v: 2;
  runId: string;
  savedAt: number;
  /** Set once a Done succeeded with these strokes — the draft is then a re-edit base. */
  doneAt: number | null;
  /** photo_index → strokes. */
  pages: Record<number, Stroke[]>;
  /** photo_index → layer edits + where they stand against the server. */
  meta: Record<number, DraftPageMeta>;
  /** Done was pressed but could not reach the server — send it when back online. */
  uploadQueued: boolean;
};

export function draftKey(runId: string): string {
  return `annotate-draft:v1:${runId}`;
}

export function makeDraft(
  runId: string, pages: Record<number, Stroke[]>, savedAt: number, doneAt: number | null = null,
  meta: Record<number, DraftPageMeta> = {}, uploadQueued = false,
): AnnotateDraft {
  return { v: 2, runId, savedAt, doneAt, pages: prunePages(pages), meta: pruneMeta(meta), uploadQueued };
}

/** Nothing worth keeping: no strokes, no layer edits, nothing waiting to upload. */
export function draftIsEmpty(d: AnnotateDraft): boolean {
  return Object.values(d.pages).every((s) => s.length === 0)
    && Object.values(d.meta || {}).every((m) => !m.edits?.length && !m.pending)
    && !d.uploadQueued;
}

/** Any page with changes the server has not got. */
export function draftHasPending(d: AnnotateDraft | null): boolean {
  return !!d && Object.values(d.meta || {}).some((m) => m.pending);
}

/** Compact: drop empty pages, round coords to 0.1px and pressure to 0.01. */
function prunePages(pages: Record<number, Stroke[]>): Record<number, Stroke[]> {
  const out: Record<number, Stroke[]> = {};
  for (const [k, strokes] of Object.entries(pages)) {
    if (!strokes || !strokes.length) continue;
    out[Number(k)] = strokes.map((s) => ({
      tool: s.tool,
      color: s.color,
      width: round1(s.width),
      ...(s.snapped ? { snapped: s.snapped } : {}),
      // A typed note keeps its words (they were dropped before 27 Oct 2026).
      ...(typeof s.text === 'string' ? { text: s.text } : {}),
      ...(typeof s.fontSize === 'number' ? { fontSize: s.fontSize } : {}),
      points: s.points.map((p) => ({ x: round1(p.x), y: round1(p.y), p: round2(p.p) })),
    }));
  }
  return out;
}

function pruneMeta(meta: Record<number, DraftPageMeta>): Record<number, DraftPageMeta> {
  const out: Record<number, DraftPageMeta> = {};
  for (const [k, m] of Object.entries(meta || {})) {
    if (!m) continue;
    const keep: DraftPageMeta = {};
    if (m.base) keep.base = m.base;
    if (m.savedAs) keep.savedAs = m.savedAs;
    if (m.edits && m.edits.length) keep.edits = m.edits;
    if (m.pending) keep.pending = true;
    if (Object.keys(keep).length) out[Number(k)] = keep;
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function serializeDraft(d: AnnotateDraft): string {
  return JSON.stringify({ ...d, v: 2, pages: prunePages(d.pages), meta: pruneMeta(d.meta || {}) });
}

function parseEdits(v: unknown): LayerEdit[] | null {
  if (v == null) return [];
  if (!Array.isArray(v)) return null;
  const out: LayerEdit[] = [];
  for (const e of v) {
    if (!e || typeof e !== 'object' || typeof (e as LayerEdit).id !== 'string') return null;
    out.push(e as LayerEdit);
  }
  return out;
}

/** null on anything unusable: bad JSON, wrong version, wrong shape. */
export function parseDraft(raw: string | null | undefined): AnnotateDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || (d.v !== 1 && d.v !== 2) || typeof d.runId !== 'string' || typeof d.pages !== 'object' || d.pages === null) return null;
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
          ...(typeof st.text === 'string' ? { text: st.text } : {}),
          ...(typeof st.fontSize === 'number' ? { fontSize: st.fontSize } : {}),
        });
      }
      pages[idx] = strokes;
    }
    const doneAt = typeof d.doneAt === 'number' ? d.doneAt : null;
    const meta: Record<number, DraftPageMeta> = {};
    if (d.v === 2 && d.meta && typeof d.meta === 'object') {
      for (const [k, m] of Object.entries(d.meta as Record<string, DraftPageMeta>)) {
        const idx = Number(k);
        if (!Number.isInteger(idx) || !m || typeof m !== 'object') return null;
        const edits = parseEdits(m.edits);
        if (!edits) return null;
        meta[idx] = {
          ...(typeof m.base === 'string' ? { base: m.base } : {}),
          ...(typeof m.savedAs === 'string' ? { savedAs: m.savedAs } : {}),
          ...(edits.length ? { edits } : {}),
          ...(m.pending === true ? { pending: true } : {}),
        };
      }
    } else if (d.v === 1 && doneAt === null) {
      // A v1 draft never Done'd: every inked page is unsaved work.
      for (const [k, s] of Object.entries(pages)) if (s.length) meta[Number(k)] = { pending: true };
    }
    return {
      v: 2, runId: d.runId, pages, meta,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
      doneAt,
      uploadQueued: d.uploadQueued === true,
    };
  } catch {
    return null;
  }
}
