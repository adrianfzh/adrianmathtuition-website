// Marking-only beta (Adrian, 2026-08-21: "the only function that students can
// see now should be just uploading papers to mark and viewing their marked
// papers"). While MARKING_ONLY_BETA is on, a STUDENT session sees four
// surfaces inside the portal — /app/practice (added the same day at Adrian's
// request: topic → Standard/Advanced → question, marked line by line),
// /app/submit (hand a paper in), /app/marking (released marked papers) and
// /app/my-notes ("My Notebook" — the focus/retry/clippings page; it absorbed
// /app/plan on 2026-08-28, which now redirects there — marking-derived and
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
import type { ScienceAccess } from './science-levels';

export const MARKING_ONLY_BETA = true;

// Notes carve-out (Adrian, 2026-08-27: "add the notes back to the student
// portal now"). The /notes Fumadocs reader re-opens to students while the rest
// of the marking-only beta stays shut — Learn / Notebook / Reference are still
// bounced. Flip to false to hide notes again in one place; when
// MARKING_ONLY_BETA itself goes false this flag is moot (full portal already
// includes notes).
//
// CLOSED again 2026-08-29 (Adrian, phone review round 5: "let's hide it from
// students first") while the notes content is vetted — the sub-group names
// read as internal cluster jargon and descriptions carry raw ASCII math.
// Reopen by flipping back to true once the vetting layers land. The /notes
// layout ALSO consults this flag (a student session with the direct URL must
// see the closed card, not the reader) — the nav/Home gates alone don't cover
// a bookmark.
export const NOTES_OPEN_TO_STUDENTS = false;

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

// 📝 Practice is the student's TO-DO LIST (SPEC-PORTAL-V2 §3, Adrian 6 Sep
// 2026): work he assigned, Practice Again questions handed back from their own
// marked papers, questions they found. The open topic picker, the topic deep
// links and the timed set stay behind his admin cookie. This is its own flag,
// not a fullPortalVisible() delegate, for the same reason as the timed set
// below: ending the marking-only beta must not reopen the picker to students
// as a side effect. Flip to true to give students the picker back.
export const PRACTICE_PICKER_OPEN_TO_STUDENTS = false;

/** 'full' = the whole practice page (picker, topics, timed set — Adrian's admin
 *  cookie, or the flag); 'list' = the to-do list only, plus opening one of its
 *  items (`?assignment=`). */
export async function practiceAccess(): Promise<'full' | 'list'> {
  if (PRACTICE_PICKER_OPEN_TO_STUDENTS) return 'full';
  if (await viewingAsStudent()) return 'list';
  return (await isNotesAuthed()) ? 'full' : 'list';
}

// ⏱ Exam-prep timed sets (2026-09-02): /app/practice shows a timed-set entry
// alongside the Home "Next exam" countdown, but the row stays admin-preview
// until Adrian has run one himself. Deliberately its own flag, not a
// fullPortalVisible() delegate: ending the marking-only beta must not open
// timed sets to students as a side effect. Flip to true to release the row.
export const EXAM_PREP_OPEN_TO_STUDENTS = false;

/** True when the caller may see the timed-set entry (flag on, or Adrian's admin preview — unless viewing as a student). */
export async function examPrepVisible(): Promise<boolean> {
  if (EXAM_PREP_OPEN_TO_STUDENTS) return true;
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

// Home "Last lesson" card (topics covered + homework from the Airtable
// Lessons log). Adrian, 2026-09-02: "gate keep last lesson topics first — the
// students won't have any last lessons" — the beta cohort's lessons aren't
// logged with topics yet, so the card would only ever be empty or wrong.
// Admin cookie sees it; flip to true to open it.
export const LAST_LESSON_OPEN_TO_STUDENTS = false;

// Science practice (2026-09-02, Adrian: "can we have physics questions
// practice too? … gatekeep from students first"): the physics bank in the
// separate science project reaches the practice picker as a 'PHY' level
// (lib/science-levels + lib/science-bank). Closed to students until this
// flips; once open, a student needs 'Physics' in Airtable Students.Subjects
// (the option doesn't exist yet — add it via typecast when opening). Adrian's
// admin cookie previews every science level.
export const SCIENCE_PRACTICE_OPEN_TO_STUDENTS = false;

/** 'preview' = Adrian's admin cookie (every science level), 'open' = flag on (by subject), else 'closed'. */
export async function sciencePracticeAccess(): Promise<ScienceAccess> {
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return 'preview';
  return SCIENCE_PRACTICE_OPEN_TO_STUDENTS ? 'open' : 'closed';
}

// Science MARKING for students (2026-09-02, Adrian: "build 1 and 2 now" — know
// the subject, and a flag, off). A student's hand-in is marked with the subject
// brain ONLY when this is on AND the student is enrolled in that subject
// (lib/mark-subject-for-student resolveHandinSubject is the gate). Off = every
// student hand-in is marked as math, exactly as before this shipped. Flip only
// once the calibration board shows the ±2 gate met for the subject. Adrian's
// admin cookie previews it regardless.
export const MARK_SUBJECT_OPEN_TO_STUDENTS = false;
export async function markSubjectAccess(): Promise<import('./mark-subject-for-student').MarkSubjectAccess> {
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return 'preview';
  return MARK_SUBJECT_OPEN_TO_STUDENTS ? 'open' : 'closed';
}

// 🔍 Find a question (/app/find, SPEC-PORTAL-V2 §4, 6 Sep 2026): photo or typed
// question → a genuinely similar bank question or a made-for-you one, straight
// into Practice. It replaced the students' "Request materials" door on Home, so
// it is part of the marking-only surface. Flip to false to hide the page from
// students in one place; Adrian's admin cookie still sees it.
export const FIND_OPEN_TO_STUDENTS = true;
