// 🧑‍🏫 The shared board — the pure rules (SPEC-TUTOR-TOOLS §8; Adrian, 5 Nov 2026: "yes, build it").
//
// A board is a stack of pages that never runs out: the background pages (a marked paper's
// pages, photos of questions; `null` = a blank page) and, below them, as many blank pages as
// the writing needs plus ONE empty one to keep going. Blank pages beyond the stored list are
// not stored — they exist because someone wrote on them, so two people never race to add one.
//
// Each side writes its OWN layer (tutor_ink / student_ink, the lib/student-ink shape:
// { "<page>": { w, h, strokes } }), so the two never overwrite each other; each side sees
// the other's layer live (a Supabase broadcast) and from the database (the slow poll).
import type { InkPages } from './student-ink';

export type BoardRole = 'tutor' | 'student';
/** One background page: a stored image reference, or null for a blank page. */
export type BoardPage = { url: string | null };

/** The white page every blank page draws (A4 at 1000 px wide, the ink's default box). */
export const BLANK_PAGE_URL = '/board-blank.png';
export const MAX_BOARD_PAGES = 60;
export const MAX_TITLE = 80;

/** The highest page index that carries writing in any of the layers, or -1. */
export function lastInkedPage(...layers: (InkPages | null | undefined)[]): number {
  let max = -1;
  for (const l of layers) {
    for (const [k, v] of Object.entries(l ?? {})) {
      const i = Number(k);
      if (Number.isInteger(i) && v && v.strokes?.length && i > max) max = i;
    }
  }
  return max;
}

/** How many pages the board shows: every stored page, every page written on, then one empty page. */
export function displayPageCount(stored: number, ...layers: (InkPages | null | undefined)[]): number {
  return Math.min(MAX_BOARD_PAGES, Math.max(stored, lastInkedPage(...layers) + 1) + 1);
}

/**
 * Where a new photo goes: the first page after everything stored or written on. The empty
 * pages between the stored list and that index become blank (null) entries, so indices
 * never move — a stroke on page 4 stays on page 4.
 */
export function withPhotoAppended(pages: readonly BoardPage[], url: string, ...layers: (InkPages | null | undefined)[]): BoardPage[] | null {
  const at = Math.max(pages.length, lastInkedPage(...layers) + 1);
  if (at >= MAX_BOARD_PAGES - 1) return null;
  const out: BoardPage[] = pages.map(p => ({ url: p.url }));
  while (out.length < at) out.push({ url: null });
  out.push({ url });
  return out;
}

/** The pages whose content changed between two versions of a layer (by reference — the ink helpers copy what they touch). */
export function changedPages(prev: InkPages, next: InkPages): InkPages {
  const out: InkPages = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const i = Number(k);
    if (prev[i] !== next[i]) out[i] = next[i] ?? { w: prev[i]?.w ?? 1000, h: prev[i]?.h ?? 1414, strokes: [] };
  }
  return out;
}

/** Lay a received patch over the other side's layer; a page with no strokes is dropped. */
export function applyPatch(layer: InkPages, patch: InkPages): InkPages {
  const out: InkPages = { ...layer };
  for (const [k, v] of Object.entries(patch)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= MAX_BOARD_PAGES) continue;
    if (v && Array.isArray(v.strokes) && v.strokes.length) out[i] = v;
    else delete out[i];
  }
  return out;
}

/** A board's name: what the tutor typed, else the paper it came from, else "Board · 5 Nov". */
export function boardTitle(typed: string | null | undefined, paperName: string | null | undefined, now = new Date()): string {
  const t = (typed ?? '').replace(/\s+/g, ' ').trim();
  if (t) return t.slice(0, MAX_TITLE);
  const p = (paperName ?? '').replace(/\s+/g, ' ').trim();
  if (p) return p.slice(0, MAX_TITLE);
  return `Board · ${now.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}`;
}

/** The text the tutor sends on WhatsApp with the link. */
export function shareText(studentName: string, link: string): string {
  const first = studentName.trim().split(/\s+/)[0] || 'there';
  return `Hi ${first}, here is our board. Open it on your phone or iPad and write with me: ${link}`;
}

/** The poll may replace the other side's layer only when the live channel has been quiet (it is newer than the database). */
export const LIVE_QUIET_MS = 10_000;
export function pollMayReplace(lastLiveAt: number, now: number): boolean {
  return now - lastLiveAt > LIVE_QUIET_MS;
}
