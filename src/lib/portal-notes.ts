// "Save to My Notebook" — students clip regions of their released marked papers
// into a personal gallery (Adrian, 2026-08-27: "on the output marked pdf ->
// able for students to save parts of it as notes -> for reference later").
//
// Pure logic for /api/portal/my-notes + /app/my-notes (repo policy: logic in
// lib with tests, never inline in a route or component). This module is
// imported by BOTH the route (node) and client components (the gallery
// grouping) — keep it dependency-free and Buffer-free.
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

export interface CreateNotePayload {
  /** Verified against the run's student_id in the route; null when absent. */
  runId: string | null;
  sourceLabel: string;
  topic: string | null;
  note: string;
  /** Raw base64 (any data-url prefix stripped), PNG bytes. */
  imageBase64: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Validate a POST body for a new clipping. Pure — the route decodes and
 * signature-checks the bytes afterwards (`isPngBytes`).
 */
export function parseCreatePayload(body: unknown): Parsed<CreateNotePayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Bad body' };
  }
  const b = body as Record<string, unknown>;

  const sourceLabel = asStr(b.sourceLabel).slice(0, MAX_SOURCE_LABEL);
  if (!sourceLabel) return { ok: false, error: 'sourceLabel required' };

  const rawImage = typeof b.image === 'string' ? b.image : '';
  // Accept a full data URL or bare base64 — the client sends canvas.toDataURL().
  // ([\s\S]*, not the `s` flag — tsconfig targets pre-es2018 regexes.)
  const m = /^data:image\/png;base64,([\s\S]*)$/.exec(rawImage);
  const imageBase64 = (m ? m[1] : rawImage).trim();
  if (!imageBase64) return { ok: false, error: 'image required' };
  if (imageBase64.length < MIN_IMAGE_B64) return { ok: false, error: 'image too small' };
  if (imageBase64.length > MAX_IMAGE_B64) {
    return { ok: false, error: 'image too large — select a smaller region' };
  }
  if (!B64_RE.test(imageBase64)) return { ok: false, error: 'image is not valid base64' };

  const rawRun = b.runId ?? null;
  let runId: string | null = null;
  if (rawRun !== null && rawRun !== undefined && rawRun !== '') {
    if (typeof rawRun !== 'string' || !UUID_RE.test(rawRun)) {
      return { ok: false, error: 'runId must be a UUID' };
    }
    runId = rawRun;
  }

  const topic = asStr(b.topic).slice(0, MAX_TOPIC) || null;
  const note = asStr(b.note).slice(0, MAX_NOTE);

  return { ok: true, value: { runId, sourceLabel, topic, note, imageBase64 } };
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
