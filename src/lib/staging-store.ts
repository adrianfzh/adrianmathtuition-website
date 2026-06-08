// Staging workspace store — a localStorage-backed "tray" of candidate bank questions the user is
// sifting before committing them into a lesson. Client-only, this-computer-only, survives reloads.
// No DB, no network. Two panes ("pool" = all candidates, "keep" = shortlist) + reject flag.
'use client';

import type { BankQuestion } from '@/app/admin/lessons/[id]/LessonBankPanel';

export type StagePane = 'pool' | 'keep';
export type StageKind = 'refresher' | 'worked_example' | 'practice';
export interface StagedItem {
  q: BankQuestion;
  pane: StagePane;
  rejected: boolean;
  order: number; // sort order within its pane
  kind?: StageKind; // chosen R/E/P for a Keep card ('Add all' uses this; defaults to worked_example)
  section?: string; // chosen target lesson section for a Keep card
}

const KEY_BASE = 'lesson_staging_v1';
type Listener = () => void;
const listeners = new Set<Listener>();

// The tray is scoped PER LESSON: each lesson id gets its own localStorage key. The editor calls
// setStagingScope(lessonId) before any store reads. The pre-scoping global tray (plain KEY_BASE)
// is adopted once into the first lesson opened after this upgrade, so nothing shortlisted is lost.
let scopeKey = KEY_BASE;
let cache: StagedItem[] | null = null;

export function setStagingScope(lessonId: string | null): void {
  const next = lessonId ? `${KEY_BASE}:${lessonId}` : KEY_BASE;
  if (next === scopeKey) return;
  scopeKey = next;
  cache = null;
  undoStack = [];
  redoStack = [];
  if (typeof window !== 'undefined' && lessonId) {
    try {
      const scoped = window.localStorage.getItem(scopeKey);
      const legacy = window.localStorage.getItem(KEY_BASE);
      if ((!scoped || scoped === '[]') && legacy && legacy !== '[]') {
        window.localStorage.setItem(scopeKey, legacy);   // adopt the old global tray
        window.localStorage.removeItem(KEY_BASE);
      }
    } catch { /* ignore */ }
  }
  listeners.forEach(l => { try { l(); } catch { /* ignore */ } });
}

function load(): StagedItem[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(scopeKey);
    cache = raw ? (JSON.parse(raw) as StagedItem[]) : [];
  } catch { cache = []; }
  return cache!;
}

function save(items: StagedItem[]) {
  cache = items;
  try { window.localStorage.setItem(scopeKey, JSON.stringify(items)); } catch { /* quota — non-fatal */ }
  listeners.forEach(l => { try { l(); } catch { /* ignore */ } });
}

// ── Undo / redo (session-only, per scope) ── snapshot the tray before each mutation. A shared
// monotonic counter lets the staging UI dispatch to whichever stack (tray vs lesson) was most
// recent, so a single Undo button reverses the latest action wherever it happened.
let actionSeq = 0;
export function nextActionSeq(): number { return ++actionSeq; }
type TraySnap = { items: StagedItem[]; seq: number };
let undoStack: TraySnap[] = [];
let redoStack: TraySnap[] = [];
function snap() {
  undoStack.push({ items: load().map(i => ({ ...i })), seq: nextActionSeq() });
  if (undoStack.length > 30) undoStack.shift();
  redoStack = []; // a fresh action invalidates redo
}
export function undoStaging(): boolean {
  const prev = undoStack.pop();
  if (!prev) return false;
  redoStack.push({ items: load().map(i => ({ ...i })), seq: nextActionSeq() });
  save(prev.items);
  return true;
}
export function redoStaging(): boolean {
  const next = redoStack.pop();
  if (!next) return false;
  undoStack.push({ items: load().map(i => ({ ...i })), seq: nextActionSeq() });
  save(next.items);
  return true;
}
export function stagingUndoTopSeq(): number { return undoStack.length ? undoStack[undoStack.length - 1].seq : -1; }
export function stagingRedoTopSeq(): number { return redoStack.length ? redoStack[redoStack.length - 1].seq : -1; }

// Replace the whole tray wholesale, no snapshot — used by the editor's undo/redo to restore the exact
// pre-/post-"Add all" tray (both Pool and Keep), since that snapshot rides on the LESSON undo entry.
export function replaceStaging(items: StagedItem[]): void { save(items.map(i => ({ ...i }))); }
// Clear the tray WITHOUT a tray-undo snapshot — used by "Add all" (the lesson undo carries the tray).
export function clearStagingNoSnap(): void { save([]); }
export function clearKeepNoSnap(): void { save(load().filter(i => i.pane !== 'keep')); }

export function subscribeStaging(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getStaged(): StagedItem[] {
  return [...load()].sort((a, b) => (a.pane === b.pane ? a.order - b.order : a.pane === 'pool' ? -1 : 1));
}

export function stagedCount(): number {
  return load().filter(i => !i.rejected).length;
}

export function isStaged(id: string): boolean {
  return load().some(i => i.q.id === id);
}

export function addToStaging(q: BankQuestion): void {
  const items = load();
  if (items.some(i => i.q.id === q.id)) return; // already staged
  snap();
  const maxOrder = items.filter(i => i.pane === 'pool').reduce((m, i) => Math.max(m, i.order), -1);
  save([...items, { q, pane: 'pool', rejected: false, order: maxOrder + 1 }]);
}

export function removeStaged(id: string): void {
  snap();
  save(load().filter(i => i.q.id !== id));
}

export function setPane(id: string, pane: StagePane): void {
  const items = load();
  snap();
  const maxOrder = items.filter(i => i.pane === pane).reduce((m, i) => Math.max(m, i.order), -1);
  save(items.map(i => i.q.id === id ? { ...i, pane, order: maxOrder + 1 } : i));
}

// Move an item into a pane AT a specific position: directly before `beforeId`, or appended when
// `beforeId` is null/not found. Rewrites the destination pane's order 0..N.
export function setPaneAt(id: string, pane: StagePane, beforeId: string | null): void {
  const items = load();
  if (!items.some(i => i.q.id === id)) return;
  snap();
  const destIds = items
    .filter(i => i.pane === pane && i.q.id !== id)
    .sort((a, b) => a.order - b.order)
    .map(i => i.q.id);
  let idx = beforeId ? destIds.indexOf(beforeId) : -1;
  if (idx === -1) idx = destIds.length;
  destIds.splice(idx, 0, id);
  const rank = new Map(destIds.map((qid, i) => [qid, i]));
  save(items.map(i => {
    if (i.q.id === id) return { ...i, pane, order: rank.get(id)! };
    if (i.pane === pane && rank.has(i.q.id)) return { ...i, order: rank.get(i.q.id)! };
    return i;
  }));
}

// Move EVERY item from one pane to the other, preserving their relative order, appended after the
// destination's existing items. Hidden (rejected) items move too.
export function moveAllToPane(from: StagePane, to: StagePane): void {
  const items = load();
  let next = items.filter(i => i.pane === to).reduce((m, i) => Math.max(m, i.order), -1) + 1;
  const order = new Map(items.filter(i => i.pane === from).sort((a, b) => a.order - b.order).map(i => [i.q.id, next++] as const));
  if (order.size === 0) return;
  snap();
  save(items.map(i => order.has(i.q.id) ? { ...i, pane: to, order: order.get(i.q.id)! } : i));
}

export function toggleReject(id: string): void {
  snap();
  save(load().map(i => i.q.id === id ? { ...i, rejected: !i.rejected } : i));
}

// Rewrite order within a pane from an ordered id list.
export function reorderPane(pane: StagePane, orderedIds: string[]): void {
  snap();
  const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
  save(load().map(i => (i.pane === pane && rank.has(i.q.id)) ? { ...i, order: rank.get(i.q.id)! } : i));
}

export function setKind(id: string, kind: StageKind): void {
  snap();
  save(load().map(i => i.q.id === id ? { ...i, kind } : i));
}

export function setSection(id: string, section: string): void {
  snap();
  save(load().map(i => i.q.id === id ? { ...i, section } : i));
}

// Bulk versions — set the kind/section for EVERY card in a pane in one go (single undo step).
export function setKindAll(pane: StagePane, kind: StageKind): void {
  snap();
  save(load().map(i => i.pane === pane ? { ...i, kind } : i));
}
export function setSectionAll(pane: StagePane, section: string): void {
  snap();
  save(load().map(i => i.pane === pane ? { ...i, section } : i));
}

export function getKeep(): StagedItem[] {
  return load().filter(i => i.pane === 'keep' && !i.rejected).sort((a, b) => a.order - b.order);
}

export function clearKeep(): void {
  snap();
  save(load().filter(i => i.pane !== 'keep'));
}

export function clearStaging(): void { snap();
  save([]); }
export function clearRejected(): void { snap();
  save(load().filter(i => !i.rejected)); }
