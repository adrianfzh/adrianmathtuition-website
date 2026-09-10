// Personal notes in My Notebook (SPEC-NOTEBOOK-V2 §8, Adrian 11 Sep 2026:
// "Notes is good … enforce highest privacy"). The pure half: payload parsing
// and the one-line title the stream shows. The route
// (/api/portal/notebook/private-notes) and the stream (my-notes/stream.tsx)
// are the only readers; nothing else — no admin page, no AI feature, no digest
// — ever touches `notebook_private_notes`.

export interface PrivateNoteRow {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** Characters per note. Long enough for a page of working, short enough to stay a note. */
export const MAX_PRIVATE_NOTE = 4000;
/** Notes per student — a brake, not a quota. */
export const MAX_PRIVATE_NOTES = 500;
/** The stream's title line: the first line of the note, trimmed to this. */
export const PRIVATE_TITLE_MAX = 64;

export const PRIVATE_NOTE_COLUMNS = 'id, body, created_at, updated_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Normalise a note body: CRLF → LF, trailing whitespace off each line, trimmed, capped. Empty → error. */
export function parsePrivateNoteBody(raw: unknown): Parsed<string> {
  if (typeof raw !== 'string') return { ok: false, error: 'body (string) required' };
  const body = raw.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trim();
  if (!body) return { ok: false, error: 'Write something first' };
  return { ok: true, value: body.slice(0, MAX_PRIVATE_NOTE) };
}

/** {id, body} for PATCH. */
export function parsePrivateNoteUpdate(body: unknown): Parsed<{ id: string; body: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Bad body' };
  const b = body as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id : '';
  if (!UUID_RE.test(id)) return { ok: false, error: 'id must be a UUID' };
  const parsed = parsePrivateNoteBody(b.body);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { id, body: parsed.value } };
}

export function isPrivateNoteId(id: string): boolean {
  return UUID_RE.test(id);
}

/** The first non-empty line, trimmed to PRIVATE_TITLE_MAX with an ellipsis. */
export function privateNoteTitle(body: string): string {
  const line = (body || '').split('\n').map(l => l.trim()).find(Boolean) ?? '';
  if (line.length <= PRIVATE_TITLE_MAX) return line || 'Note';
  const cut = line.slice(0, PRIVATE_TITLE_MAX);
  const atSpace = cut.lastIndexOf(' ');
  return `${(atSpace > PRIVATE_TITLE_MAX / 2 ? cut.slice(0, atSpace) : cut).trimEnd()}…`;
}
