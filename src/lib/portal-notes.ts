// "Save to My Notebook" — students clip regions of their released marked papers
// into a personal gallery (Adrian, 2026-08-27: "on the output marked pdf ->
// able for students to save parts of it as notes -> for reference later"),
// and since 2026-09-02 also photograph work they do OUTSIDE the app (school
// worksheets, tuition homework, textbook working) straight into the same
// gallery — the notebook as the one place they keep everything.
//
// Pure logic for /api/portal/my-notes + /app/my-notes (repo policy: logic in
// lib with tests, never inline in a route or component). This module is
// imported by BOTH the route (node) and client components (the gallery
// grouping) — keep it dependency-free and Buffer-free.
//
// Photos vs clippings share one table and one API. There is deliberately NO
// `kind` column: the discriminator is the Blob filename the route writes —
// photos upload as `portal-notes/<sid>/photo-<uuid>.<ext>`, clippings keep
// `portal-notes/<sid>/<uuid>.png` — and `noteKind()` reads it back off
// image_url. Both writers live in this repo, so the name IS the schema.
//
// Access model mirrors the notebook: `portal_notes` has RLS enabled with no
// policies — every query goes through the service client scoped by the
// session's airtable_student_id. The ownership filter IS the access control
// and must never come from the client.

/** One `portal_notes` row, as the gallery and the API read it. */
export interface MyNoteRow {
  id: string;
  run_id: string | null;
  source_label: string;
  topic: string | null;
  image_url: string;
  note: string | null;
  created_at: string;
}

// Caps. The image cap exists because Vercel hard-limits request bodies at
// 4.5MB at the platform level — the client downsizes to stay under it, and the
// route rejects anything that still busts it rather than letting the platform
// 413 with an opaque error.
export const MAX_IMAGE_B64 = 4_000_000; // chars of base64 ≈ 3MB decoded
export const MIN_IMAGE_B64 = 200; // anything smaller is not a real clipping
export const MAX_SOURCE_LABEL = 120;
export const MAX_TOPIC = 80;
export const MAX_NOTE = 2000;
/** Per-student row cap — a brake, not a quota (500 clippings is years of use). */
export const MAX_NOTES_PER_STUDENT = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** What a gallery item is: a ✂️ crop from a marked paper, or a 📷 photo of outside work. */
export type NoteKind = 'clip' | 'photo';

/** source_label the route stamps on photo rows (the client sends no label for photos). */
export const PHOTO_SOURCE_LABEL = 'My photo';
/**
 * Blob-filename prefix that marks a row as a photo — the kind discriminator
 * (see module header). Vercel Blob may append its own random suffix before
 * the extension, so `noteKind` checks the START of the last path segment.
 */
export const PHOTO_BLOB_PREFIX = 'photo-';

export interface CreateNotePayload {
  kind: NoteKind;
  /**
   * Verified against the run's student_id in the route; null when absent.
   * Always null for photos — outside work has no marking run to link.
   */
  runId: string | null;
  sourceLabel: string;
  topic: string | null;
  note: string;
  /** Raw base64 (any data-url prefix stripped), PNG or JPEG bytes. */
  imageBase64: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Validate a POST body for a new gallery item. Pure — the route decodes and
 * signature-checks the bytes afterwards (`sniffImageType`).
 *
 * `kind` defaults to 'clip' (the ✂️ clipper predates the field and never
 * sends one). A 'photo' needs no sourceLabel (defaults PHOTO_SOURCE_LABEL)
 * and can never carry a runId — outside work has no marking run.
 */
export function parseCreatePayload(body: unknown): Parsed<CreateNotePayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Bad body' };
  }
  const b = body as Record<string, unknown>;

  const rawKind = b.kind ?? 'clip';
  if (rawKind !== 'clip' && rawKind !== 'photo') {
    return { ok: false, error: 'unknown kind' };
  }
  const kind: NoteKind = rawKind;

  let sourceLabel = asStr(b.sourceLabel).slice(0, MAX_SOURCE_LABEL);
  if (!sourceLabel) {
    if (kind !== 'photo') return { ok: false, error: 'sourceLabel required' };
    sourceLabel = PHOTO_SOURCE_LABEL;
  }

  const rawImage = typeof b.image === 'string' ? b.image : '';
  // Accept a full data URL or bare base64 — the client sends canvas.toDataURL()
  // (PNG from the clipper's crop, JPEG from the photo downscaler).
  // ([\s\S]*, not the `s` flag — tsconfig targets pre-es2018 regexes.)
  const m = /^data:image\/(?:png|jpe?g);base64,([\s\S]*)$/.exec(rawImage);
  const imageBase64 = (m ? m[1] : rawImage).trim();
  if (!imageBase64) return { ok: false, error: 'image required' };
  if (imageBase64.length < MIN_IMAGE_B64) return { ok: false, error: 'image too small' };
  if (imageBase64.length > MAX_IMAGE_B64) {
    return { ok: false, error: 'image too large — select a smaller region' };
  }
  if (!B64_RE.test(imageBase64)) return { ok: false, error: 'image is not valid base64' };

  let runId: string | null = null;
  if (kind !== 'photo') {
    const rawRun = b.runId ?? null;
    if (rawRun !== null && rawRun !== undefined && rawRun !== '') {
      if (typeof rawRun !== 'string' || !UUID_RE.test(rawRun)) {
        return { ok: false, error: 'runId must be a UUID' };
      }
      runId = rawRun;
    }
  }

  const topic = asStr(b.topic).slice(0, MAX_TOPIC) || null;
  const note = asStr(b.note).slice(0, MAX_NOTE);

  return { ok: true, value: { kind, runId, sourceLabel, topic, note, imageBase64 } };
}

/** Validate a PATCH body — the typed note on an existing clipping. */
export function parseUpdatePayload(body: unknown): Parsed<{ id: string; note: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Bad body' };
  }
  const b = body as Record<string, unknown>;
  const id = asStr(b.id);
  if (!UUID_RE.test(id)) return { ok: false, error: 'id must be a UUID' };
  if (typeof b.note !== 'string') return { ok: false, error: 'note (string) required' };
  return { ok: true, value: { id, note: b.note.trim().slice(0, MAX_NOTE) } };
}

/** True when `id` looks like a UUID — used on DELETE ?id= before querying. */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * PNG signature check on the decoded bytes — a clip must be the PNG the client
 * says it is, not an arbitrary file wearing image/png. Uint8Array (not Buffer)
 * so tests and any future client use stay platform-free.
 */
export function isPngBytes(bytes: Uint8Array): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < sig.length) return false;
  return sig.every((v, i) => bytes[i] === v);
}

/**
 * What the decoded bytes actually are — PNG (clipper crops) or JPEG (camera
 * photos re-encoded by the downscaler). Anything else is rejected upstream;
 * the sniff, not the data-url label, decides the Blob extension/contentType.
 */
export function sniffImageType(bytes: Uint8Array): 'png' | 'jpeg' | null {
  if (isPngBytes(bytes)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  return null;
}

/**
 * Photo or clipping? Read off the Blob filename the route wrote (see module
 * header) — the last path segment of image_url starts with PHOTO_BLOB_PREFIX
 * for photos. Robust to Blob's own random `-suffix` (appended before the
 * extension, never prepended) and to query strings. Every row from before the
 * photo feature is, correctly, a clipping.
 */
export function noteKind(imageUrl: string): NoteKind {
  const path = imageUrl.split('?')[0].split('#')[0];
  const last = path.split('/').pop() ?? '';
  return last.startsWith(PHOTO_BLOB_PREFIX) ? 'photo' : 'clip';
}

export interface NoteGroup<T> {
  label: string;
  notes: T[];
}

/**
 * Group clippings by the paper they came from (source_label), preserving the
 * newest-first input order — so the group whose latest clip is newest comes
 * first, and notes inside a group stay newest-first.
 */
export function groupNotes<T extends { source_label: string }>(rows: T[]): NoteGroup<T>[] {
  const groups: NoteGroup<T>[] = [];
  const byLabel = new Map<string, NoteGroup<T>>();
  for (const row of rows) {
    const label = row.source_label.trim() || 'Clippings';
    let g = byLabel.get(label);
    if (!g) {
      g = { label, notes: [] };
      byLabel.set(label, g);
      groups.push(g);
    }
    g.notes.push(row);
  }
  return groups;
}

/** Heading the gallery groups all 📷 photos under. */
export const PHOTO_GROUP_LABEL = '📷 My photos';

export interface GalleryGroup<T> {
  label: string;
  kind: NoteKind;
  notes: T[];
}

/**
 * Kind-aware gallery grouping: clippings group by the paper they were cut
 * from (groupNotes semantics), photos all fold into one PHOTO_GROUP_LABEL
 * group. Order preserved from the newest-first input at both levels, exactly
 * like groupNotes — so whichever group's latest item is newest comes first.
 */
export function groupGallery<T extends { source_label: string | null; image_url: string }>(
  rows: T[],
): GalleryGroup<T>[] {
  const groups: GalleryGroup<T>[] = [];
  const byKey = new Map<string, GalleryGroup<T>>();
  for (const row of rows) {
    const kind = noteKind(row.image_url);
    const label =
      kind === 'photo' ? PHOTO_GROUP_LABEL : (row.source_label ?? '').trim() || 'Clippings';
    const key = `${kind}|${label}`;
    let g = byKey.get(key);
    if (!g) {
      g = { label, kind, notes: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.notes.push(row);
  }
  return groups;
}

/**
 * Once the collection grows past this, the gallery shows a slim filter-chip
 * row (All · topics present · 📷 Photos · ✂️ Clippings) — organisation for
 * growth, pure client-side filtering.
 */
export const GALLERY_CHIP_THRESHOLD = 12;

export interface GalleryChip {
  /** 'all' | 'kind:photo' | 'kind:clip' | 'topic:<topic>' — feed to applyGalleryChip. */
  key: string;
  label: string;
}

/**
 * The filter chips for a collection — [] when the collection is small enough
 * not to need them, or when filtering couldn't change anything (no topics
 * tagged and only one kind present).
 */
export function galleryChips<T extends { topic: string | null; image_url: string }>(
  rows: T[],
): GalleryChip[] {
  if (rows.length <= GALLERY_CHIP_THRESHOLD) return [];

  const topics = [...new Set(rows.map(r => (r.topic ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const kinds = new Set(rows.map(r => noteKind(r.image_url)));
  if (topics.length === 0 && kinds.size < 2) return [];

  const chips: GalleryChip[] = [{ key: 'all', label: 'All' }];
  for (const t of topics) chips.push({ key: `topic:${t}`, label: t });
  if (kinds.has('photo')) chips.push({ key: 'kind:photo', label: '📷 Photos' });
  if (kinds.has('clip')) chips.push({ key: 'kind:clip', label: '✂️ Clippings' });
  return chips;
}

/** Filter rows by a chip key from galleryChips. Unknown keys (and 'all') pass everything. */
export function applyGalleryChip<T extends { topic: string | null; image_url: string }>(
  rows: T[],
  key: string,
): T[] {
  if (key === 'kind:photo') return rows.filter(r => noteKind(r.image_url) === 'photo');
  if (key === 'kind:clip') return rows.filter(r => noteKind(r.image_url) === 'clip');
  if (key.startsWith('topic:')) {
    const t = key.slice('topic:'.length);
    return rows.filter(r => (r.topic ?? '').trim() === t);
  }
  return rows;
}

/**
 * Topic options for the photo tagger — the canonical topic list for the
 * student's level, grouped by category. Built server-side (the page knows the
 * level) and handed to the client; structurally identical to
 * canonical-topics' TopicCategory so no mapping is needed.
 */
export interface TopicOptionGroup {
  label: string;
  topics: string[];
}
