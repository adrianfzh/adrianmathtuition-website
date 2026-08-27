// /app/notes — sends students to the Fumadocs notes reader at /notes.
// History: originally the raw-KB study view (retired 2026-07-09, "too much,
// unorganized"), then a redirect into /app/learn. Since 2026-08-14 the /notes
// reader is the released student surface and Learn units stay admin-only, so
// the dashboard button and old links land there instead.
// Marking-only beta (2026-08-21): students were sent back to /app —
// re-opened 2026-08-27 via the NOTES_OPEN_TO_STUDENTS carve-out
// (lib/portal-beta.ts); the /notes reader itself already accepts a portal
// student session (notes-auth isNotesViewer), so lifting the bounce is enough.
import { redirect } from 'next/navigation';
import { NOTES_OPEN_TO_STUDENTS, requireFullPortal } from '@/lib/portal-beta';

export default async function NotesRedirect() {
  if (!NOTES_OPEN_TO_STUDENTS) await requireFullPortal();
  redirect('/notes');
}
