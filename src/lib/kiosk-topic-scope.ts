// src/lib/kiosk-topic-scope.ts — hide topics a student hasn't been taught yet.
//
// One kiosk level (`am`) serves both Sec 3 and Sec 4 students, but they are not
// at the same point in the syllabus. The Dropbox filenames carry Adrian's
// canonical topic number (`04 Nature of Roots Practice.pdf`, matching
// `Notes/AM/04 Nature of Roots.docx`), so the number is the only thing needed to
// decide whether a sheet is in scope.
//
// It is a SUPERSET, not a partition: a Sec 4 student sits the O-Level on the
// whole syllabus and still needs the early topics — including sheets built from
// S4 prelim questions on an S3 topic, which is exactly why the year must not be
// baked into the filename. Only Sec 3 is narrowed.

/**
 * Last topic number a Sec 3 student has been taught, per kiosk level slug.
 *
 * AM (Adrian, 2026-08-12): Sec 3 runs 01 Quadratic Functions → 20 Applications
 * of Trigonometry; Sec 4 picks up at 21 Differentiation and runs to 31 Plane
 * Geometry. This is his teaching order, not something derivable from the data,
 * so it lives here as one named constant rather than scattered through the route.
 *
 * A level absent from this map is never narrowed — EM's boundary differs and is
 * not yet established, and s1/s2/jc have no Sec 3/4 split at all.
 */
export const SEC3_LAST_TOPIC: Record<string, number> = {
  am: 20,
};

/** Leading topic number of a sheet title, or null when it carries none. */
export function topicNumber(title: string): number | null {
  const m = /^\s*(\d{1,2})(?=\D|$)/.exec(title || '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Sec year from an Airtable Level string (`'Sec 3'` → 3), else null. */
export function secYear(level: string | undefined | null): number | null {
  const m = /^Sec (\d)$/.exec((level || '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * Is this sheet in scope for the student?
 *
 * Fails OPEN on purpose. An untitled-by-number sheet, an unmapped level, or a
 * student whose Level doesn't parse all return true — hiding a worksheet a
 * student needs is a worse failure than showing one they haven't reached, and
 * most folders (EM, S1, S2) don't use the numbering yet.
 */
export function inScope(title: string, levelSlug: string, studentLevel?: string | null): boolean {
  const cap = SEC3_LAST_TOPIC[levelSlug];
  if (cap === undefined) return true;
  if (secYear(studentLevel) !== 3) return true; // Sec 4+ get everything
  const n = topicNumber(title);
  if (n === null) return true;
  return n <= cap;
}

/** Filter a listing to what the student should see. Admin passes `undefined`. */
export function scopeToStudent<T extends { title: string }>(
  entries: T[],
  levelSlug: string,
  studentLevel?: string | null,
): T[] {
  if (studentLevel == null) return entries; // admin / no student context
  return entries.filter((e) => inScope(e.title, levelSlug, studentLevel));
}
