// Marking-only beta (Adrian, 2026-08-21: "the only function that students can
// see now should be just uploading papers to mark and viewing their marked
// papers"). While MARKING_ONLY_BETA is on, a STUDENT session sees exactly two
// surfaces inside the portal — /app/submit (hand a paper in) and /app/marking
// (released marked papers) — plus the dashboard shell and Settings. Practice,
// Learn, Notes and Reference are hidden from the nav/dashboard AND their routes
// redirect back to /app, so no link inside the portal leads anywhere else.
//
// Escape hatch, same as learn-gate: Adrian's signed admin cookie in the same
// browser passes everything — that is how he previews the full portal through
// his test student account. Flip MARKING_ONLY_BETA to false to reopen the
// whole portal to students in one place.
//
// Server-only module (next/headers via notes-auth) — never import from client
// components; gate client pages through a sibling `layout.tsx` instead.
import { redirect } from 'next/navigation';
import { isNotesAuthed } from './notes-auth';

export const MARKING_ONLY_BETA = true;

/** True when the caller may see the full portal (flag off, or Adrian's admin cookie). */
export async function fullPortalVisible(): Promise<boolean> {
  if (!MARKING_ONLY_BETA) return true;
  return isNotesAuthed();
}

/**
 * Call at the top of any server component (page or layout) that is NOT part of
 * the marking-only surface. Students land back on the dashboard; Adrian passes.
 */
export async function requireFullPortal(): Promise<void> {
  if (!(await fullPortalVisible())) redirect('/app');
}
