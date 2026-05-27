// Offline-aware lesson store.
//
// The editor calls these functions; they update IndexedDB optimistically and enqueue a
// mutation. The sync engine drains the queue to the server when online.
//
// Reads (loadLesson) prefer the network when online — they refresh the local mirror and
// return fresh data — and fall back to the local copy when offline.
//
// Cards created offline use crypto.randomUUID() for the id so the server can accept
// the row verbatim once we're back online (the cards POST route allows client-supplied id).

import {
  getLesson, listCardsForLesson, putLesson, putCard, deleteCardLocal,
  replaceCardsForLesson, enqueueMutation,
  type LocalLesson, type LocalCard, type ContentKind,
} from './db';
import { kickSync } from './sync';

function nowISO(): string { return new Date().toISOString(); }

function getAuth(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)(admin_pw|schedule_pw)=([^;]*)/);
  return m ? decodeURIComponent(m[2]) : '';
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${getAuth()}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers });
}

// ── Load (network-first when online, local fallback offline) ────────────────

export interface LoadResult {
  lesson: LocalLesson;
  cards: LocalCard[];
  source: 'network' | 'cache';
}

export async function loadLesson(lessonId: string): Promise<LoadResult | null> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (online) {
    try {
      const res = await apiFetch(`/api/admin/lessons/${lessonId}`);
      if (res.ok) {
        const json = await res.json() as { lesson: LocalLesson; cards: LocalCard[] };
        const lesson = { ...json.lesson, updated_at: json.lesson.updated_at ?? nowISO(), _dirty: false };
        const cards = (json.cards ?? []).map((c) => ({
          ...c,
          lesson_id: lessonId,
          updated_at: c.updated_at ?? nowISO(),
          _dirty: false,
        }));
        await putLesson(lesson);
        await replaceCardsForLesson(lessonId, cards);
        return { lesson, cards, source: 'network' };
      }
      if (res.status === 404) return null;
    } catch { /* fall through to cache */ }
  }
  const lesson = await getLesson(lessonId);
  if (!lesson) return null;
  const cards = await listCardsForLesson(lessonId);
  return { lesson, cards, source: 'cache' };
}

// ── Lesson metadata ─────────────────────────────────────────────────────────

export async function saveLessonMeta(lessonId: string, patch: Partial<LocalLesson>): Promise<LocalLesson | null> {
  const cur = await getLesson(lessonId);
  if (!cur) return null;
  const next: LocalLesson = { ...cur, ...patch, updated_at: nowISO(), _dirty: true };
  await putLesson(next);
  await enqueueMutation({
    kind: 'lesson_patch',
    payload: { lessonId, patch },
    status: 'pending',
    attempts: 0,
    created_at: nowISO(),
  });
  void kickSync();
  return next;
}

// ── Cards ───────────────────────────────────────────────────────────────────

export interface NewCardInput {
  lesson_id: string;
  content_kind: ContentKind;
  section_name: string;
  card_title?: string | null;
  content?: string | null;
  marks?: number | null;
  source_question_id?: string | null;
  source_card_id?: string | null;
}

function genId(): string {
  // crypto.randomUUID is widely supported; small fallback for very old browsers.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC4122 v4 fallback
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
    else s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

export async function addCard(input: NewCardInput): Promise<LocalCard> {
  const id = genId();
  const existing = await listCardsForLesson(input.lesson_id);
  const peers = existing.filter((c) => c.content_kind === input.content_kind && c.section_name === input.section_name);
  const order_index = peers.length === 0 ? 0 : Math.max(...peers.map((c) => c.order_index)) + 1;
  const card: LocalCard = {
    id,
    lesson_id: input.lesson_id,
    source_card_id: input.source_card_id ?? null,
    source_question_id: input.source_question_id ?? null,
    content_kind: input.content_kind,
    section_name: input.section_name,
    card_title: input.card_title ?? '',
    content: input.content ?? '',
    marks: input.marks ?? null,
    order_index,
    updated_at: nowISO(),
    _dirty: true,
  };
  await putCard(card);
  await enqueueMutation({
    kind: 'card_add',
    payload: {
      lessonId: input.lesson_id,
      card: {
        id, content_kind: card.content_kind, section_name: card.section_name,
        card_title: card.card_title ?? '', content: card.content ?? '',
        marks: card.marks, source_question_id: card.source_question_id,
        source_card_id: card.source_card_id,
      },
    },
    status: 'pending', attempts: 0, created_at: nowISO(),
  });
  void kickSync();
  return card;
}

export async function patchCard(cardId: string, patch: Partial<LocalCard>): Promise<LocalCard | null> {
  const cur = await listCardForId(cardId);
  if (!cur) return null;
  const next: LocalCard = { ...cur, ...patch, updated_at: nowISO(), _dirty: true };
  await putCard(next);
  // Strip local-only fields before queuing
  const serverPatch: Record<string, unknown> = { ...patch };
  delete serverPatch.updated_at; delete serverPatch._dirty; delete serverPatch.lesson_id;
  await enqueueMutation({
    kind: 'card_patch',
    payload: { cardId, patch: serverPatch },
    status: 'pending', attempts: 0, created_at: nowISO(),
  });
  void kickSync();
  return next;
}

export async function deleteCard(cardId: string): Promise<void> {
  await deleteCardLocal(cardId);
  await enqueueMutation({
    kind: 'card_delete',
    payload: { cardId },
    status: 'pending', attempts: 0, created_at: nowISO(),
  });
  void kickSync();
}

export async function reorderCards(orderedIds: string[]): Promise<void> {
  // Optimistic local order_index update for the affected ids
  await Promise.all(orderedIds.map(async (id, idx) => {
    const c = await listCardForId(id);
    if (c) await putCard({ ...c, order_index: idx, updated_at: nowISO(), _dirty: true });
  }));
  await enqueueMutation({
    kind: 'cards_reorder',
    payload: { orderedIds },
    status: 'pending', attempts: 0, created_at: nowISO(),
  });
  void kickSync();
}

// Helper — IndexedDB doesn't have a "get by id across all" without going through the store,
// and listCardsForLesson needs a lesson_id. So we get-by-pk directly.
import { getCard as _getCard } from './db';
async function listCardForId(id: string): Promise<LocalCard | null> {
  return _getCard(id);
}
