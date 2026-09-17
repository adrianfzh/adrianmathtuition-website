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
