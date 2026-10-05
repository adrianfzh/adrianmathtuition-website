// What "Delete my account" erases and what it keeps — ONE list, tested (5 Oct 2026).
//
// Adrian, 5 Oct 2026: "delete them, except what's on marked papers". Settings says
// "all stored data", so erasure covers everything the app keeps about the student
// EXCEPT the marked papers and what sits on them, which are Adrian's teaching record
// (privacy page: "Marked papers are Adrian's teaching record").
//
// The route (/api/portal/delete-account) and the export (/api/portal/export) both
// read these lists, so a new table is added in one place.

/** Tables keyed by the portal identity (rec… / acct:<uuid>), erased whole. `column` = the identity column. */
export const ERASE_BY_IDENTITY: readonly { table: string; column: string }[] = [
  { table: 'portal_notes', column: 'airtable_student_id' },
  { table: 'notebook_entries', column: 'airtable_student_id' },
  { table: 'notebook_private_notes', column: 'airtable_student_id' },
  { table: 'notebook_saves', column: 'airtable_student_id' },
  { table: 'notebook_mistakes', column: 'airtable_student_id' },
  { table: 'ask_skills', column: 'airtable_student_id' },
  { table: 'portal_requests', column: 'airtable_student_id' },
  { table: 'portal_generated_papers', column: 'airtable_student_id' },
  { table: 'portal_generation_log', column: 'airtable_student_id' },
  // 5 Oct 2026 (Adrian: "delete them, except what's on marked papers"):
  { table: 'essay_runs', column: 'airtable_student_id' }, // essays + their feedback
  { table: 'humanities_runs', column: 'airtable_student_id' }, // humanities answers + feedback
  { table: 'student_work_ink', column: 'identity' }, // their pen marks on worksheets / practice
  { table: 'portal_event_log', column: 'identity' }, // the app-use log
  { table: 'portal_suggestions', column: 'airtable_student_id' }, // 💡 their named suggestions (anonymous ones hold no identity)
];

/**
 * Deliberately KEPT: the marked papers and everything on them. `student_ink` is
 * the student's own writing ON a marked paper — it stays with the paper.
 */
export const KEPT_WITH_MARKED_PAPERS: readonly string[] = ['paper_marking_runs', 'student_ink'];

/** The photo-sheet jobs ("Write my sheet") are erased with the photos they hold. */
export const PHOTO_SHEET_KIND = 'photo-sheet';

/**
 * The stored-file keys of the photos a student sent for practice sheets. Only keys
 * listed on their photo-sheet jobs — never a prefix: the same `handins/<identity>/`
 * folder also holds the photos of their MARKED papers, which stay.
 */
export function photoSheetKeys(jobs: { kind?: string | null; photos?: unknown }[]): string[] {
  const keys = new Set<string>();
  for (const j of jobs) {
    if (j.kind !== PHOTO_SHEET_KIND || !Array.isArray(j.photos)) continue;
    for (const p of j.photos as { key?: unknown }[]) {
      if (p && typeof p.key === 'string' && /^handins\/[^/]+\/[^/]+$/.test(p.key)) keys.add(p.key);
    }
  }
  return [...keys];
}
