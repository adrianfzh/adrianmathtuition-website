// Offline-first IndexedDB layer for the lesson editor.
//
// Stores:
//   - lessons          { id (PK), name, level, topics[], description, is_archived, updated_at, _dirty }
//   - lesson_cards     { id (PK), lesson_id (idx), content_kind, section_name, card_title,
//                        content, marks, order_index, source_card_id, source_question_id,
//                        updated_at, _dirty }
//   - mutations        { id (auto), kind, payload, status, attempts, created_at, last_error? }
//   - meta             { key (PK), value } — small key/value bag for sync state
//
// `_dirty` on lessons/lesson_cards marks rows that have a pending mutation in flight; the sync
// engine clears it once the mutation lands. The UI uses it to render the queued state.
//
// The mutations table is the durable, ordered log of "things that need to hit the server"
// — see lib/offline/sync.ts.

const DB_NAME = 'adrianmath_lessons_offline';
const DB_VERSION = 1;

export type ContentKind = 'refresher' | 'worked_example' | 'practice';

export interface LocalLesson {
  id: string;
  name: string;
  level: string;
  topics: string[];
  description: string | null;
  is_archived?: boolean;
  updated_at: string;
  _dirty?: boolean;
}

export interface LocalCard {
  id: string;
  lesson_id: string;
  source_card_id: string | null;
  source_question_id: string | null;
  content_kind: ContentKind;
  section_name: string;
  card_title: string | null;
  content: string | null;
  marks: number | null;
  order_index: number;
  updated_at: string;
  _dirty?: boolean;
}

export type MutationKind =
  | 'lesson_patch'
  | 'card_add'
  | 'card_patch'
  | 'card_delete'
  | 'cards_reorder';

export type MutationStatus = 'pending' | 'syncing' | 'failed';

export interface MutationRow {
  id?: number; // autoincrement
  kind: MutationKind;
  payload: Record<string, unknown>;
  created_at: string;
  status: MutationStatus;
  attempts: number;
  last_error?: string;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

/** Open (or upgrade) the offline database. Cached after first call. */
export function openDB(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lessons')) {
        db.createObjectStore('lessons', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('lesson_cards')) {
        const cards = db.createObjectStore('lesson_cards', { keyPath: 'id' });
        cards.createIndex('lesson_id', 'lesson_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('mutations')) {
        const m = db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
        m.createIndex('status', 'status', { unique: false });
        m.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
  return _dbPromise;
}

// ── Generic helpers ─────────────────────────────────────────────────────────

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => T | Promise<T>,
): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(name, mode);
  const store = tx.objectStore(name);
  const out = await Promise.resolve(fn(store));
  return new Promise<T>((resolve, reject) => {
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

// ── Lessons ─────────────────────────────────────────────────────────────────

export async function putLesson(lesson: LocalLesson): Promise<void> {
  await withStore('lessons', 'readwrite', (s) => reqAsPromise(s.put(lesson)));
}

export async function getLesson(id: string): Promise<LocalLesson | null> {
  return withStore('lessons', 'readonly', async (s) => (await reqAsPromise(s.get(id))) ?? null);
}

export async function deleteLessonLocal(id: string): Promise<void> {
  await withStore('lessons', 'readwrite', (s) => reqAsPromise(s.delete(id)));
  // Also clear any cards belonging to that lesson
  await withStore('lesson_cards', 'readwrite', (s) => {
    return new Promise<void>((resolve, reject) => {
      const idx = s.index('lesson_id');
      const req = idx.openCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else resolve();
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function listLessons(): Promise<LocalLesson[]> {
  return withStore('lessons', 'readonly', (s) => reqAsPromise(s.getAll() as IDBRequest<LocalLesson[]>));
}

// ── Cards ───────────────────────────────────────────────────────────────────

export async function putCard(card: LocalCard): Promise<void> {
  await withStore('lesson_cards', 'readwrite', (s) => reqAsPromise(s.put(card)));
}

export async function putCards(cards: LocalCard[]): Promise<void> {
  if (cards.length === 0) return;
  await withStore('lesson_cards', 'readwrite', (s) => {
    return Promise.all(cards.map((c) => reqAsPromise(s.put(c))));
  });
}

export async function getCard(id: string): Promise<LocalCard | null> {
  return withStore('lesson_cards', 'readonly', async (s) => (await reqAsPromise(s.get(id))) ?? null);
}

export async function listCardsForLesson(lessonId: string): Promise<LocalCard[]> {
  return withStore('lesson_cards', 'readonly', (s) => {
    return new Promise<LocalCard[]>((resolve, reject) => {
      const idx = s.index('lesson_id');
      const req = idx.getAll(IDBKeyRange.only(lessonId));
      req.onsuccess = () => resolve(req.result as LocalCard[]);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function deleteCardLocal(id: string): Promise<void> {
  await withStore('lesson_cards', 'readwrite', (s) => reqAsPromise(s.delete(id)));
}

// Bulk-replace cards for a lesson — used by load-from-server to mirror the truth.
// Preserves any locally-dirty rows (in-flight mutations) by skipping them.
export async function replaceCardsForLesson(
  lessonId: string,
  freshCards: LocalCard[],
): Promise<void> {
  const local = await listCardsForLesson(lessonId);
  const localDirtyIds = new Set(local.filter((c) => c._dirty).map((c) => c.id));
  await withStore('lesson_cards', 'readwrite', async (s) => {
    // Delete server-side cards that are absent in fresh data AND not dirty locally
    const freshIds = new Set(freshCards.map((c) => c.id));
    for (const c of local) {
      if (!freshIds.has(c.id) && !localDirtyIds.has(c.id)) {
        await reqAsPromise(s.delete(c.id));
      }
    }
    // Upsert fresh, but never overwrite a dirty local row
    for (const c of freshCards) {
      if (!localDirtyIds.has(c.id)) await reqAsPromise(s.put(c));
    }
  });
}

// ── Mutation log ────────────────────────────────────────────────────────────

export async function enqueueMutation(m: Omit<MutationRow, 'id'>): Promise<number> {
  return withStore('mutations', 'readwrite', async (s) => {
    const key = await reqAsPromise(s.add(m));
    return key as number;
  });
}

export async function listPendingMutations(): Promise<MutationRow[]> {
  return withStore('mutations', 'readonly', (s) => {
    return new Promise<MutationRow[]>((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => {
        const all = req.result as MutationRow[];
        // Order by id (insertion order)
        all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        resolve(all.filter((m) => m.status !== 'failed'));
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function listAllMutations(): Promise<MutationRow[]> {
  return withStore('mutations', 'readonly', (s) => {
    return new Promise<MutationRow[]>((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => {
        const all = req.result as MutationRow[];
        all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        resolve(all);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function updateMutation(id: number, patch: Partial<MutationRow>): Promise<void> {
  await withStore('mutations', 'readwrite', async (s) => {
    const cur = await reqAsPromise(s.get(id)) as MutationRow | undefined;
    if (!cur) return;
    await reqAsPromise(s.put({ ...cur, ...patch }));
  });
}

export async function deleteMutation(id: number): Promise<void> {
  await withStore('mutations', 'readwrite', (s) => reqAsPromise(s.delete(id)));
}

export async function countMutations(predicate: (m: MutationRow) => boolean): Promise<number> {
  const all = await listAllMutations();
  return all.filter(predicate).length;
}

// ── Meta (key/value) ────────────────────────────────────────────────────────

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return withStore('meta', 'readonly', async (s) => {
    const v = await reqAsPromise(s.get(key)) as { key: string; value: T } | undefined;
    return v?.value;
  });
}

export async function setMeta<T = unknown>(key: string, value: T): Promise<void> {
  await withStore('meta', 'readwrite', (s) => reqAsPromise(s.put({ key, value })));
}
