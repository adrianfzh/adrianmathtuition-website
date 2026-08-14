// /app/notes — sends students to the Fumadocs notes reader at /notes.
// History: originally the raw-KB study view (retired 2026-07-09, "too much,
// unorganized"), then a redirect into /app/learn. Since 2026-08-14 the /notes
// reader is the released student surface and Learn units stay admin-only, so
// the dashboard button and old links land there instead.
import { redirect } from 'next/navigation';

export default function NotesRedirect() {
  redirect('/notes');
}
