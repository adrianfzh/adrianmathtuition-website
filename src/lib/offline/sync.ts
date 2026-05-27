// Sync engine — drains the mutation log to the server.
//
// Triggers a drain on:
//   - explicit kick() calls (after every save)
//   - window 'online' event
//   - tab visibility change (focus returns)
//   - 30-second periodic timer while online
//
// Per-mutation flow:
//   pending → syncing → (on success: deleted from log + _dirty cleared on owner row)
//                     → (on failure: pending + backoff + attempts++; → failed after 5)
//
// Single-author so last-write-wins is fine; we don't try to merge concurrent edits.
//
// All replay calls go through the same fetch helper that prepends the admin Bearer token.

import {
  listPendingMutations, updateMutation, deleteMutation, getCard, putCard,
  getLesson, putLesson, listAllMutations,
  type MutationRow,
} from './db';
import { requestPersistentStorage } from './persistStorage';

type Listener = (state: SyncState) => void;

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let listeners: Listener[] = [];
let _running = false;
let _kickedAgain = false;
let _periodicTimer: ReturnType<typeof setInterval> | null = null;
let _lastState: SyncState = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  lastError: null,
};

function emit(patch: Partial<SyncState>) {
  _lastState = { ..._lastState, ...patch };
  for (const l of listeners) l(_lastState);
}

export function getSyncState(): SyncState {
  return _lastState;
}

export function subscribeSync(l: Listener): () => void {
  listeners.push(l);
  l(_lastState);
  return () => { listeners = listeners.filter((x) => x !== l); };
}

async function refreshCounts() {
  const all = await listAllMutations();
  const pendingCount = all.filter((m) => m.status !== 'failed').length;
  const failedCount = all.filter((m) => m.status === 'failed').length;
  emit({ pendingCount, failedCount });
}

function getAuth(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)(admin_pw|schedule_pw)=([^;]*)/);
  return m ? decodeURIComponent(m[2]) : '';
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${getAuth()}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers });
}

async function clearDirty(kind: 'card' | 'lesson', id: string) {
  if (kind === 'card') {
    const c = await getCard(id);
    if (c) await putCard({ ...c, _dirty: false });
  } else {
    const l = await getLesson(id);
    if (l) await putLesson({ ...l, _dirty: false });
  }
}

async function replay(m: MutationRow): Promise<void> {
  switch (m.kind) {
    case 'lesson_add': {
      const { lesson } = m.payload as {
        lesson: { id: string; name: string; level: string; topics: string[]; description: string | null };
      };
      const res = await apiFetch('/api/admin/lessons', {
        method: 'POST', body: JSON.stringify(lesson),
      });
      if (!res.ok) throw new Error(`POST lesson ${lesson.id}: ${res.status} ${await res.text()}`);
      await clearDirty('lesson', lesson.id);
      return;
    }
    case 'lesson_patch': {
      const { lessonId, patch } = m.payload as { lessonId: string; patch: Record<string, unknown> };
      const res = await apiFetch(`/api/admin/lessons/${lessonId}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`PATCH lesson ${lessonId}: ${res.status} ${await res.text()}`);
      await clearDirty('lesson', lessonId);
      return;
    }
    case 'card_add': {
      const { lessonId, card } = m.payload as {
        lessonId: string;
        card: { id: string; content_kind: string; section_name: string; card_title: string; content: string; marks: number | null; source_question_id: string | null; source_card_id: string | null };
      };
      const res = await apiFetch(`/api/admin/lessons/${lessonId}/cards`, {
        method: 'POST', body: JSON.stringify(card),
      });
      if (!res.ok) throw new Error(`POST card ${card.id}: ${res.status} ${await res.text()}`);
      await clearDirty('card', card.id);
      return;
    }
    case 'card_patch': {
      const { cardId, patch } = m.payload as { cardId: string; patch: Record<string, unknown> };
      const res = await apiFetch(`/api/admin/lessons/cards/${cardId}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`PATCH card ${cardId}: ${res.status} ${await res.text()}`);
      await clearDirty('card', cardId);
      return;
    }
    case 'card_delete': {
      const { cardId } = m.payload as { cardId: string };
      const res = await apiFetch(`/api/admin/lessons/cards/${cardId}`, { method: 'DELETE' });
      // Treat 404 as already-gone (idempotent)
      if (!res.ok && res.status !== 404) throw new Error(`DELETE card ${cardId}: ${res.status} ${await res.text()}`);
      return;
    }
    case 'cards_reorder': {
      const { orderedIds } = m.payload as { orderedIds: string[] };
      const res = await apiFetch('/api/admin/lessons/cards/reorder', {
        method: 'POST', body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error(`reorder: ${res.status} ${await res.text()}`);
      // Clear dirty on every card we just reordered
      for (const cid of orderedIds) await clearDirty('card', cid);
      return;
    }
    default:
      throw new Error(`Unknown mutation kind: ${(m as MutationRow).kind}`);
  }
}

const MAX_ATTEMPTS = 5;

/** Drain the queue if online. Coalesces concurrent kicks via _kickedAgain. */
export async function kickSync(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) {
    await refreshCounts();
    return;
  }
  if (_running) { _kickedAgain = true; return; }
  _running = true;
  emit({ syncing: true });
  try {
    do {
      _kickedAgain = false;
      const pending = await listPendingMutations();
      for (const m of pending) {
        if (!navigator.onLine) break;
        if (m.id == null) continue;
        try {
          await updateMutation(m.id, { status: 'syncing', attempts: m.attempts + 1, last_error: undefined });
          await replay(m);
          await deleteMutation(m.id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const newStatus: MutationRow['status'] =
            (m.attempts + 1) >= MAX_ATTEMPTS ? 'failed' : 'pending';
          await updateMutation(m.id, { status: newStatus, last_error: msg });
          emit({ lastError: msg });
          // Backoff before continuing
          const ms = Math.min(30_000, 1000 * Math.pow(2, m.attempts));
          await new Promise((r) => setTimeout(r, ms));
        }
      }
    } while (_kickedAgain && navigator.onLine);
    emit({ lastSyncedAt: new Date().toISOString(), lastError: null });
  } finally {
    _running = false;
    await refreshCounts();
    emit({ syncing: false });
  }
}

let _initialised = false;
/** Wire up online / visibility / periodic triggers. Safe to call multiple times. */
export function initSyncEngine(): void {
  if (_initialised || typeof window === 'undefined') return;
  _initialised = true;
  emit({ online: navigator.onLine });
  refreshCounts();
  // Ask the browser to mark our storage as persistent so the cache isn't evicted
  // under disk pressure. Auto-granted in Chrome for engaged origins; Safari/FF prompt.
  void requestPersistentStorage();
  window.addEventListener('online', () => { emit({ online: true }); void kickSync(); });
  window.addEventListener('offline', () => emit({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) void kickSync();
  });
  _periodicTimer = setInterval(() => {
    if (navigator.onLine) void kickSync();
  }, 30_000);
  // Drain anything queued from a previous session
  void kickSync();
}

export function teardownSyncEngine(): void {
  if (_periodicTimer) { clearInterval(_periodicTimer); _periodicTimer = null; }
  _initialised = false;
}

/** Reset a single failed mutation back to pending — used by the UI retry button. */
export async function retryFailed(id: number): Promise<void> {
  await updateMutation(id, { status: 'pending', attempts: 0, last_error: undefined });
  await refreshCounts();
  void kickSync();
}
