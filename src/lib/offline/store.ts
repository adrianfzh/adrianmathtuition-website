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
  replaceCardsForLesson, enqueueMutation, listLessons,
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

// ── Lesson list (network-first, local fallback) ─────────────────────────────

export interface LessonListResult {
  lessons: LocalLesson[];
  source: 'network' | 'cache';
}

export async function loadLessons(): Promise<LessonListResult> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (online) {
    try {
      const res = await apiFetch('/api/admin/lessons');
      if (res.ok) {
        const json = await res.json() as { lessons: LocalLesson[] };
        // Mirror to IndexedDB so the list is available offline.
        for (const l of json.lessons) {
          await putLesson({ ...l, updated_at: l.updated_at ?? nowISO(), _dirty: false });
        }
        // Also surface any locally-created lessons whose lesson_add mutation hasn't
        // landed yet (they'll be missing from the server response).
        const local = await listLessons();
        const seen = new Set(json.lessons.map((l) => l.id));
        const pending = local.filter((l) => !seen.has(l.id) && l._dirty);
        return { lessons: [...pending, ...json.lessons], source: 'network' };
      }
    } catch { /* fall through */ }
  }
  const local = await listLessons();
  // Sort newest first to match server's order
  local.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return { lessons: local, source: 'cache' };
}

// ── Lesson create (offline-capable) ─────────────────────────────────────────

export interface NewLessonInput {
  name: string;
  level: string;
  topics?: string[];
  description?: string | null;
}

export async function addLesson(input: NewLessonInput): Promise<LocalLesson> {
  const id = genId();
  const lesson: LocalLesson = {
    id,
    name: input.name,
    level: input.level,
    topics: input.topics ?? [],
    description: input.description ?? null,
    is_archived: false,
    updated_at: nowISO(),
    _dirty: true,
  };
  await putLesson(lesson);
  await enqueueMutation({
    kind: 'lesson_add',
    payload: {
      lesson: {
        id,
        name: lesson.name,
        level: lesson.level,
        topics: lesson.topics,
        description: lesson.description,
      },
    },
    status: 'pending', attempts: 0, created_at: nowISO(),
  });
  void kickSync();
  return lesson;
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
  id?: string; // optional client id — used to restore a deleted card with its original id (undo)
  lesson_id: string;
  content_kind: ContentKind;
  section_name: string;
  card_title?: string | null;
  content?: string | null;
  marks?: number | null;
  is_advanced?: boolean;
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
  const id = input.id ?? genId();
  const existing = await listCardsForLesson(input.lesson_id);
  // Section-first model: order_index is per-SECTION across all kinds, so a new card lands at the
  // end of its section regardless of kind (R/E/P).
  const peers = existing.filter((c) => c.section_name === input.section_name);
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
    is_advanced: input.is_advanced ?? false,
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
        marks: card.marks, is_advanced: card.is_advanced, source_question_id: card.source_question_id,
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
