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

const KEY = 'lesson_staging_v1';
type Listener = () => void;
const listeners = new Set<Listener>();

let cache: StagedItem[] | null = null;

function load(): StagedItem[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as StagedItem[]) : [];
  } catch { cache = []; }
  return cache!;
}

function save(items: StagedItem[]) {
  cache = items;
  try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota — non-fatal */ }
  listeners.forEach(l => { try { l(); } catch { /* ignore */ } });
}

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
  const maxOrder = items.filter(i => i.pane === 'pool').reduce((m, i) => Math.max(m, i.order), -1);
  save([...items, { q, pane: 'pool', rejected: false, order: maxOrder + 1 }]);
}

export function removeStaged(id: string): void {
  save(load().filter(i => i.q.id !== id));
}

export function setPane(id: string, pane: StagePane): void {
  const items = load();
  const maxOrder = items.filter(i => i.pane === pane).reduce((m, i) => Math.max(m, i.order), -1);
  save(items.map(i => i.q.id === id ? { ...i, pane, order: maxOrder + 1 } : i));
}

export function toggleReject(id: string): void {
  save(load().map(i => i.q.id === id ? { ...i, rejected: !i.rejected } : i));
}

// Rewrite order within a pane from an ordered id list.
export function reorderPane(pane: StagePane, orderedIds: string[]): void {
  const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
  save(load().map(i => (i.pane === pane && rank.has(i.q.id)) ? { ...i, order: rank.get(i.q.id)! } : i));
}

export function setKind(id: string, kind: StageKind): void {
  save(load().map(i => i.q.id === id ? { ...i, kind } : i));
}

export function setSection(id: string, section: string): void {
  save(load().map(i => i.q.id === id ? { ...i, section } : i));
}

export function getKeep(): StagedItem[] {
  return load().filter(i => i.pane === 'keep' && !i.rejected).sort((a, b) => a.order - b.order);
}

export function clearKeep(): void {
  save(load().filter(i => i.pane !== 'keep'));
}

export function clearStaging(): void { save([]); }
export function clearRejected(): void { save(load().filter(i => !i.rejected)); }
