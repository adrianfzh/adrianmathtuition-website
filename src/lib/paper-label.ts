// A student's own name for a paper (17 Sep 2026 — a student asked to rename
// papers in the app, Adrian: "a good idea, let's do it").
//
// The label is the student's, shown to them and on Adrian's "Their app, as
// they see it" mirror. `paper_name` stays Adrian's name — files, Dropbox
// folders, the desk, every receipt. Pure: the route and the page share the
// one rule for what a label may be.

export const MAX_LABEL_LENGTH = 60;

export type LabelResult =
  | { ok: true; label: string | null }
  | { ok: false; error: string };

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/** Trim, collapse inner whitespace, cap the length; empty clears the label (back to the app's name). */
export function normalizeStudentLabel(input: unknown): LabelResult {
  if (input == null) return { ok: true, label: null };
  if (typeof input !== 'string') return { ok: false, error: 'The name must be text.' };
  const label = input.replace(/\s+/g, ' ').trim();
  if (!label) return { ok: true, label: null };
  if (label.length > MAX_LABEL_LENGTH) return { ok: false, error: `Keep the name under ${MAX_LABEL_LENGTH} characters.` };
  // Control characters have no place in a name a page prints.
  if (CONTROL_CHARS.test(label)) return { ok: false, error: 'That name has characters the app cannot show.' };
  return { ok: true, label };
}

/** The name the student sees: their label when they set one, else the app's display name. */
export function studentPaperName(label: string | null | undefined, displayName: string): string {
  const l = typeof label === 'string' ? label.trim() : '';
  return l || displayName;
}

// ── The student's own remark on a paper (17 Sep 2026) ──────────────────────
export const MAX_NOTE_LENGTH = 600;

export type NoteResult =
  | { ok: true; note: string | null }
  | { ok: false; error: string };

/** Trim, keep line breaks, cap the length; empty clears the note. */
export function normalizeStudentNote(input: unknown): NoteResult {
  if (input == null) return { ok: true, note: null };
  if (typeof input !== 'string') return { ok: false, error: 'The note must be text.' };
  const note = input.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!note) return { ok: true, note: null };
  if (note.length > MAX_NOTE_LENGTH) return { ok: false, error: `Keep the note under ${MAX_NOTE_LENGTH} characters.` };
  if (CONTROL_CHARS_NO_NL.test(note)) return { ok: false, error: 'That note has characters the app cannot show.' };
  return { ok: true, note };
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_NO_NL = /[\x00-\x09\x0b-\x1f\x7f]/;

/** The first line of a note, shortened — what the Papers row shows under the date. */
export function noteFirstLine(note: string | null | undefined, max = 90): string | null {
  const line = (note ?? '').split('\n').map(l => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > max ? line.slice(0, max - 1).trimEnd() + '…' : line;
}
