// /app/notes — superseded by the interactive Learn units view (2026-07-09).
// The raw-KB study view overwhelmed students ("too much, unorganized"); notes
// are now consumed a topic at a time via learning_units in /app/learn. This
// redirect keeps old links, the dashboard button, and muscle memory working.
// (The old KB reader lives in git history; /app/notes-preview remains the
// unlinked lesson_cards demo.)
import { redirect } from 'next/navigation';

export default function NotesRedirect() {
  redirect('/app/learn');
}
