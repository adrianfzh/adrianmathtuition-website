// Marking-only beta (Adrian, 2026-08-21: "the only function that students can
// see now should be just uploading papers to mark and viewing their marked
// papers"). While MARKING_ONLY_BETA is on, a STUDENT session sees four
// surfaces inside the portal — /app/practice (added the same day at Adrian's
// request: topic → Standard/Advanced → question, marked line by line),
// /app/submit (hand a paper in), /app/marking (released marked papers) and
// /app/plan (SPEC-REVISION-PLAN.md, added 2026-08-26 — marking-derived and
// released-only, so it belongs in this beta) — plus the dashboard shell and
// Settings. Learn, Notes and Reference are hidden from the nav/dashboard AND
// their routes redirect back to /app, so no link inside the portal leads
// anywhere else. The allowlist is enforced by construction: an allowed page
// simply never calls requireFullPortal().
//
// Escape hatch, same as learn-gate: Adrian's signed admin cookie in the same
// browser passes everything — that is how he previews the full portal through
// his test student account. Flip MARKING_ONLY_BETA to false to reopen the
// whole portal to students in one place.
//
// Server-only module (next/headers via notes-auth) — never import from client
// components; gate client pages through a sibling `layout.tsx` instead.
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { isNotesAuthed } from './notes-auth';

export const MARKING_ONLY_BETA = true;

// Notes carve-out (Adrian, 2026-08-27: "add the notes back to the student
// portal now"). The /notes Fumadocs reader re-opens to students while the rest
// of the marking-only beta stays shut — Learn / Notebook / Reference are still
// bounced. Flip to false to hide notes again in one place; when
// MARKING_ONLY_BETA itself goes false this flag is moot (full portal already
// includes notes).
export const NOTES_OPEN_TO_STUDENTS = true;

// "View as student" — Adrian's admin cookie normally unlocks the full portal,
// which means his own phone can never show him what a student actually sees
// (bit on 2026-08-21: his Home showed Practice/Learn while students got the
// trimmed beta). Setting this cookie (toggle in the app shell) makes every
// gate treat him as a plain student until he switches back. Client-set, not
// signed — it only ever REMOVES access, so it needs no integrity.
export const VIEW_AS_STUDENT_COOKIE = 'portal_view_as_student';

export async function viewingAsStudent(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(VIEW_AS_STUDENT_COOKIE)?.value === '1';
}

/** True when the caller may see the full portal (flag off, or Adrian's admin cookie — unless he is viewing as a student). */
export async function fullPortalVisible(): Promise<boolean> {
  if (!MARKING_ONLY_BETA) return true;
  if (await viewingAsStudent()) return false;
  return isNotesAuthed();
}

/**
 * Call at the top of any server component (page or layout) that is NOT part of
 * the marking-only surface. Students land back on the dashboard; Adrian passes.
 */
export async function requireFullPortal(): Promise<void> {
  if (!(await fullPortalVisible())) redirect('/app');
}
