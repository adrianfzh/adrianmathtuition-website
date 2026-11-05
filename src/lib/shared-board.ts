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

// ── Earlier versions (Adrian, 5 Nov 2026: "Go back to an earlier version … let's do this") ──
// A version is a snapshot of BOTH layers as they were just BEFORE a save. One is kept every
// 10 minutes of writing, before a big rub-out (half or more of someone's writing gone at once,
// e.g. "Clear my notes"), and before every restore — so bringing a version back can itself be undone.
export type VersionReason = 'every-10-min' | 'big-erase' | 'before-restore';
export const VERSION_EVERY_MS = 10 * 60_000;
export const MAX_VERSIONS = 60;

export function strokeCount(layer: InkPages | null | undefined): number {
  let n = 0;
  for (const v of Object.values(layer ?? {})) n += v?.strokes?.length ?? 0;
  return n;
}

/** Keep a version of the layer as it was before this save? Returns why, or null. */
export function versionReason(o: { before: InkPages; after: InkPages; lastVersionAt: number | null; now: number }): VersionReason | null {
  const b = strokeCount(o.before), a = strokeCount(o.after);
  if (b >= 3 && b - a >= 3 && a <= b / 2) return 'big-erase';
  if (b > 0 && (o.lastVersionAt == null || o.now - o.lastVersionAt >= VERSION_EVERY_MS)) return 'every-10-min';
  return null;
}

/** How a version reads in the list: "Today 3:42 pm · before a big rub-out". */
export function versionWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' });
  const time = d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' }).replace(/\s/g, ' ').toLowerCase();
  const y = new Date(now.getTime() - 86_400_000);
  const label = day(d) === day(now) ? 'Today' : day(d) === day(y) ? 'Yesterday'
    : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
  return `${label} ${time}`;
}
export const VERSION_WHY: Record<VersionReason, string> = {
  'every-10-min': '',
  'big-erase': 'just before a big rub-out',
  'before-restore': 'just before an earlier version was brought back',
};

// ── Page templates (Adrian, 5 Nov 2026: "do the 4 different kinds of templates you suggested + the
// paper types and the math pages") — drawn once by scripts/board-paper.mjs into public/board/<key>.png.
export type PaperGroup = 'Paper' | 'Maths' | 'Organise';
export const BOARD_PAPERS: readonly { key: string; label: string; group: PaperGroup }[] = [
  { key: 'squared', label: 'Squared', group: 'Paper' },
  { key: 'lined', label: 'Lined', group: 'Paper' },
  { key: 'dotted', label: 'Dotted', group: 'Paper' },
  { key: 'blank', label: 'Blank', group: 'Paper' },
  { key: 'axes', label: 'Graph axes', group: 'Maths' },
  { key: 'coordinate', label: 'Coordinate grid', group: 'Maths' },
  { key: 'numberline', label: 'Number lines', group: 'Maths' },
  { key: 'geometry', label: 'Triangle & circle', group: 'Maths' },
  { key: 'table', label: 'Table', group: 'Maths' },
  { key: 'cornell', label: 'Cornell notes', group: 'Organise' },
  { key: 'planner', label: 'Week planner', group: 'Organise' },
  { key: 'checklist', label: 'Checklist', group: 'Organise' },
];
export const paperUrl = (key: string) => `/board/${key}.png`;
/** A stored page that is one of our templates (served from the site itself, not the private store). */
export function isPaperUrl(u: string | null | undefined): boolean {
  const m = /^\/board\/([a-z]+)\.png$/.exec(u ?? '');
  return !!m && BOARD_PAPERS.some(p => p.key === m[1]);
}

// ── Photo stickers (Adrian, 5 Nov 2026: "place a photo onto a page (stuck onto a PDF page like a
// sticker, which you can move and resize - like how notability does it)"). One list per board; the
// box is in that page's image pixels, so it sits in the same place on every screen and in the PDF.
// Stickers lie UNDER the writing, so either person can write on top of one.
export type Sticker = { id: string; page: number; url: string; x: number; y: number; w: number; h: number };
export const MAX_STICKERS = 100;
export const MIN_STICKER = 40;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Where a new sticker goes on a page of size `box`: centred, 60% of the page wide (never taller than 60%). */
export function placeSticker(box: { w: number; h: number }, img: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const ratio = img.h / Math.max(1, img.w);
  let w = box.w * 0.6, h = w * ratio;
  if (h > box.h * 0.6) { h = box.h * 0.6; w = h / ratio; }
  return { x: Math.round((box.w - w) / 2), y: Math.round((box.h - h) / 3), w: Math.round(w), h: Math.round(h) };
}

/** Keep a box on its page and at least MIN_STICKER big (a drag never loses a sticker off the edge). */
export function clampBox(b: { x: number; y: number; w: number; h: number }, box: { w: number; h: number }) {
  const w = Math.min(box.w, Math.max(MIN_STICKER, b.w)), h = Math.min(box.h * 2, Math.max(MIN_STICKER, b.h));
  const x = Math.min(box.w - MIN_STICKER, Math.max(MIN_STICKER - w, b.x));
  const y = Math.min(box.h - MIN_STICKER, Math.max(MIN_STICKER - h, b.y));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Resize from the bottom-right corner keeping the photo's shape: the new width follows the drag. */
export function resizeKeepShape(s: { x: number; y: number; w: number; h: number }, dx: number) {
  const ratio = s.h / Math.max(1, s.w);
  const w = Math.max(MIN_STICKER, s.w + dx);
  return { ...s, w: Math.round(w), h: Math.round(w * ratio) };
}

export type StickerOp =
  | { op: 'add'; sticker: Sticker }
  | { op: 'update'; id: string; x: number; y: number; w: number; h: number }
  | { op: 'delete'; id: string };

/** Check what a screen sent. The url itself is checked by the route (it must be this board's own file). */
export function parseStickerOp(raw: unknown): StickerOp | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const id = typeof o.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(o.id) ? o.id : null;
  if (o.op === 'delete') return id ? { op: 'delete', id } : null;
  if (o.op === 'update') {
    if (!id || ![o.x, o.y, o.w, o.h].every(finite)) return null;
    return { op: 'update', id, x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number };
  }
  if (o.op === 'add') {
    const s = o.sticker as Record<string, unknown> | null;
    if (!s || typeof s !== 'object') return null;
    const sid = typeof s.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(s.id) ? s.id : null;
    if (!sid || typeof s.url !== 'string' || !Number.isInteger(s.page) || (s.page as number) < 0 || (s.page as number) >= MAX_BOARD_PAGES) return null;
    if (![s.x, s.y, s.w, s.h].every(finite) || (s.w as number) <= 0 || (s.h as number) <= 0) return null;
    return { op: 'add', sticker: { id: sid, page: s.page as number, url: s.url, x: s.x as number, y: s.y as number, w: s.w as number, h: s.h as number } };
  }
  return null;
}

/** Apply one change to the list (pure). null = refused (too many, or an unknown sticker). */
export function applyStickerOp(list: readonly Sticker[], op: StickerOp): Sticker[] | null {
  if (op.op === 'add') {
    if (list.length >= MAX_STICKERS) return null;
    return [...list.filter(s => s.id !== op.sticker.id), op.sticker];
  }
  if (!list.some(s => s.id === op.id)) return null;
  if (op.op === 'delete') return list.filter(s => s.id !== op.id);
  return list.map(s => (s.id === op.id ? { ...s, x: Math.round(op.x), y: Math.round(op.y), w: Math.round(op.w), h: Math.round(op.h) } : s));
}
