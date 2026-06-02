// Shared June 2026 Revision Sprint session schedule + subject derivation.
// Revision lessons (Type='Revision Sprint') store only {Student, Date} — no
// subject/time — so the session (EM 10am–12pm / AM 1–3pm / H2 2–5pm) is derived
// from the student's signed-up subjects + this fixed date schedule. EM dates are
// a subset of AM dates, so EM+AM students have two records on shared dates.

export const REVISION_SUBJECT_DATES: Record<string, string[]> = {
  EM: ['2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16', '2026-06-19'],
  AM: ['2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16', '2026-06-19', '2026-06-23', '2026-06-26'],
  JC: ['2026-06-01', '2026-06-04', '2026-06-08', '2026-06-11', '2026-06-15', '2026-06-18', '2026-06-22', '2026-06-25'],
};

export const REVISION_SUBJECT_META: Record<string, { label: string; time: string }> = {
  EM: { label: 'E Math', time: '10am–12pm' },
  AM: { label: 'A Math', time: '1–3pm' },
  JC: { label: 'H2 Math', time: '2–5pm' },
};

export const REVISION_SUBJECT_ORDER = ['EM', 'AM', 'JC'];

/** Parse a Revision Sprint invoice's Line Items JSON into EM/AM/JC subjects. */
export function subjectsFromRevisionLineItems(raw: string): string[] {
  let items: { description?: string }[] = [];
  try { items = JSON.parse(raw || '[]'); } catch { /* ignore */ }
  const subs = new Set<string>();
  for (const it of items) {
    const d = (it.description || '').toLowerCase();
    if (d.includes('e math') || /\bem\b/.test(d)) subs.add('EM');
    else if (d.includes('a math') || /\bam\b/.test(d)) subs.add('AM');
    else if (d.includes('h2') || d.includes('jc')) subs.add('JC');
  }
  return REVISION_SUBJECT_ORDER.filter(s => subs.has(s));
}

/**
 * Given a student's subjects and their revision lessons (each {id, date}),
 * return a map of lessonId → { subject, subjectLabel, time }. Assigns one
 * lesson per (subject, expected date); shared dates split deterministically by
 * the order the lessons are passed in (caller should sort by id for stability).
 */
export function assignRevisionSessions(
  subjects: string[],
  lessons: { id: string; date: string }[],
): Record<string, { subject: string; subjectLabel: string; time: string }> {
  const out: Record<string, { subject: string; subjectLabel: string; time: string }> = {};
  const claimed = new Set<string>();
  for (const subj of REVISION_SUBJECT_ORDER.filter(s => subjects.includes(s))) {
    for (const date of REVISION_SUBJECT_DATES[subj] || []) {
      const lesson = lessons.find(l => l.date === date && !claimed.has(l.id));
      if (!lesson) continue;
      claimed.add(lesson.id);
      const meta = REVISION_SUBJECT_META[subj];
      out[lesson.id] = { subject: subj, subjectLabel: meta?.label || subj, time: meta?.time || '' };
    }
  }
  return out;
}
