// /app/notes — sends students to the Fumadocs notes reader at /notes.
// History: originally the raw-KB study view (retired 2026-07-09, "too much,
// unorganized"), then a redirect into /app/learn. Since 2026-08-14 the /notes
// reader is the released student surface and Learn units stay admin-only, so
// the dashboard button and old links land there instead.
// Marking-only beta (2026-08-21): students are sent back to /app instead —
// the notes reader is not a portal surface during the beta (lib/portal-beta.ts).
import { redirect } from 'next/navigation';
import { requireFullPortal } from '@/lib/portal-beta';

export default async function NotesRedirect() {
  await requireFullPortal();
  redirect('/notes');
}
