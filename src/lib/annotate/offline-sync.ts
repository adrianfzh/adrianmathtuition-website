// lib/annotate/offline-sync.ts — keeping ✏️ Annotate work safe across reloads and
// offline spells (27 Oct 2026, Adrian: "sometimes page refreshes, but the changes
// does not appear on screen, but if I save and open again, the changes are there
// … And also allow changes made and saved even when offline"). Pure; tested.
//
// The three ideas:
//  1. The marker-layer edits (moves, deletions, retyped notes and score chips,
//     ✓⇄✗ flips, stamped marks, typed text) are kept on the device as a list of
//     edits BY OBJECT ID against the layer file they were made on (`layerEdits`
//     → `applyLayerEdits`). Saved layer files are never overwritten (every compose
//     writes a new stamped file), so that base can always be fetched again.
//  2. On open, each page picks its source (`planRestore`): the server copy when
//     everything on the device was already saved; the device copy when it has
//     unsaved work and the server has not moved on; BOTH when the server changed
//     elsewhere meanwhile — the server's page plus the device's pen ink on top
//     (strokes merged, duplicates dropped) and its safe layer edits, and a note
//     to check the page. Nothing is silently thrown away on either side.
//  3. A Done that cannot reach the server is a network failure (`isNetworkFailure`),
//     not an error: the work stays on the device and uploads when back online.
import type { Stroke } from './types';
import type { LayerObj, ParsedLayer } from './layer';

/** One object's change against the stored layer. `open`/`inner` ride along only
 *  when the markup itself changed (a ✓⇄✗ flip) or the object is new (`added`). */
export type LayerEdit = {
  id: string;
  dx?: number; dy?: number;
  deleted?: true;
  textOverride?: string;
  swapped?: true;
  scale?: number;
  anchor?: { x: number; y: number };
  added?: true;
  kind?: string;
  text?: string;
  open?: string;
  inner?: string;
};

/** The edits that turn the stored layer into `parsed` as it stands. */
export function layerEdits(parsed: ParsedLayer | null | undefined): LayerEdit[] {
  if (!parsed) return [];
  const out: LayerEdit[] = [];
  for (const o of parsed.objects) {
    const scaled = Math.abs((o.scale ?? 1) - 1) > 0.001;
    if (!(o.deleted || o.dx || o.dy || o.textOverride != null || o.swapped || o.added || scaled)) continue;
    const e: LayerEdit = { id: o.id };
    if (o.dx) e.dx = o.dx;
    if (o.dy) e.dy = o.dy;
    if (o.deleted) e.deleted = true;
    if (o.textOverride != null) e.textOverride = o.textOverride;
    if (scaled) { e.scale = o.scale; if (o.anchor) e.anchor = { ...o.anchor }; }
    if (o.swapped) { e.swapped = true; e.open = o.open; e.inner = o.inner; }
    if (o.added) { e.added = true; e.kind = o.kind; e.text = o.text; e.open = o.open; e.inner = o.inner; }
    out.push(e);
  }
  return out;
}

/**
 * Put edits back on a freshly parsed layer (mutates it). `safeOnly` = the layer is
 * NOT the one the edits were made on (it changed elsewhere): moves and resizes are
 * skipped there — the new file may already carry them, and applying a move twice
 * would put the mark in the wrong place — while deletions, retyped words, flips and
 * the objects Adrian added still apply. Returns what applied and what did not.
 */
export function applyLayerEdits(parsed: ParsedLayer, edits: LayerEdit[], safeOnly = false): { applied: number; skipped: number } {
  let applied = 0, skipped = 0;
  for (const e of edits) {
    const o = parsed.objects.find((q) => q.id === e.id);
    if (e.added) {
      if (o) { skipped += 1; continue; }   // already there (the server has it)
      if (!e.open || !e.inner) { skipped += 1; continue; }
      const obj: LayerObj = {
        id: e.id, kind: e.kind || 'obj', q: null, part: null, text: e.text || '', open: e.open, inner: e.inner,
        dx: safeOnly ? 0 : e.dx || 0, dy: safeOnly ? 0 : e.dy || 0, deleted: !!e.deleted,
        textOverride: e.textOverride ?? null, swapped: false, added: true,
        ...(!safeOnly && e.scale ? { scale: e.scale, anchor: e.anchor } : {}),
      };
      parsed.items.push({ type: 'obj', obj });
      parsed.objects.push(obj);
      applied += 1;
      continue;
    }
    if (!o) { skipped += 1; continue; }
    if (!safeOnly) {
      o.dx = e.dx || 0;
      o.dy = e.dy || 0;
      if (e.scale) { o.scale = e.scale; o.anchor = e.anchor; }
    }
    if (e.deleted) o.deleted = true;
    if (e.textOverride != null) o.textOverride = e.textOverride;
    if (e.swapped && e.open && e.inner) { o.open = e.open; o.inner = e.inner; o.swapped = true; }
    applied += 1;
  }
  return { applied, skipped };
}

/** Two references to the same stored file? `/api/files/runs/x/a.svg` and
 *  `https://www.…/api/files/runs/x/a.svg` are the same file. */
export function sameStoredFile(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const key = (u: string) => {
    let path = u;
    try { path = new URL(u, 'https://x.invalid').pathname; } catch { /* keep as is */ }
    const i = path.indexOf('/api/files/');
    return decodeURIComponent(i >= 0 ? path.slice(i + '/api/files/'.length) : path.replace(/^\/+/, ''));
  };
  return key(a) === key(b);
}

export type RestoreInput = {
  /** The page has an editable marker layer. */
  layered: boolean;
  /** The layer + ink files the server holds now. */
  serverLayer: string | null;
  serverInk: string | null;
  /** The device's record for this page (undefined = none). */
  draft?: { pending?: boolean; base?: string | null; savedAs?: string | null; hasEdits?: boolean; hasStrokes?: boolean };
};

export type RestorePlan = {
  /** 'server' = the saved page; 'device' = this device's unsaved work, on its own base;
   *  'both' = the server changed elsewhere: its page, with the device's work on top. */
  source: 'server' | 'device' | 'both';
  /** The layer file to load (layered pages). */
  layerUrl: string | null;
  /** Which layer edits to put back. */
  edits: 'none' | 'all' | 'safe';
  /** Where the pen strokes come from: the server's ink file, the device, or both merged. */
  strokes: 'server' | 'device' | 'merge';
};

/** What a page should open with — see the module header. */
export function planRestore(r: RestoreInput): RestorePlan {
  const d = r.draft;
  if (!r.layered) {
    // A flat page keeps no ink on the server (it is baked into the annotated PDF):
    // the device's strokes are the only re-edit base, saved or not.
    return { source: d?.hasStrokes ? 'device' : 'server', layerUrl: null, edits: 'none', strokes: 'device' };
  }
  if (!d || !d.pending) {
    // Everything on this device was saved — the server copy is the truth (it may be
    // newer: another device, the student-page door, a re-mark).
    return { source: 'server', layerUrl: r.serverLayer, edits: 'none', strokes: 'server' };
  }
  const serverUnmoved = !!d.base && (sameStoredFile(r.serverLayer, d.base) || (!!d.savedAs && sameStoredFile(r.serverLayer, d.savedAs)));
  if (serverUnmoved) {
    // Unsaved work, and the server holds the file it was made on (or our own save of
    // it): restore it exactly, on the file the edits belong to.
    return { source: 'device', layerUrl: d.base!, edits: 'all', strokes: 'device' };
  }
  return { source: 'both', layerUrl: r.serverLayer, edits: d.hasEdits ? 'safe' : 'none', strokes: 'merge' };
}

/** A stroke's identity for merging: tool, colour and its rounded points. */
export function strokeKey(s: Stroke): string {
  const r = (n: number) => Math.round(n);
  return `${s.tool}|${s.color.toLowerCase()}|${s.text ?? ''}|${s.points.map((p) => `${r(p.x)},${r(p.y)}`).join(';')}`;
}

/** The server's strokes, then the device's that the server does not already have. */
export function mergeStrokes(server: Stroke[], device: Stroke[]): Stroke[] {
  const seen = new Set(server.map(strokeKey));
  const out = server.slice();
  for (const s of device) {
    const k = strokeKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** A short stable fingerprint of a page's state (FNV-1a over its JSON). */
export function pageFingerprint(edits: LayerEdit[], strokes: Stroke[]): string {
  const s = JSON.stringify([edits, strokes.map(strokeKey)]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** The server could not be reached — keep the work and try again later.
 *  A fetch that throws (TypeError "Load failed" on iPad Safari), the device saying it is
 *  offline, or a gateway status (the connection dropped between us and the server). */
export function isNetworkFailure(e: unknown, online: boolean): boolean {
  if (!online) return true;
  if (e && typeof e === 'object' && (e as { network?: boolean }).network === true) return true;
  if (e instanceof TypeError) return /load failed|failed to fetch|network|internet|offline|connection/i.test(e.message);
  return false;
}

export const isGatewayStatus = (status: number): boolean => status === 0 || status === 502 || status === 503 || status === 504;

/** An Error marked as "could not reach the server". */
export function networkError(message: string): Error & { network: true } {
  return Object.assign(new Error(message), { network: true as const });
}
