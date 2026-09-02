import type { Metadata } from 'next';
import Link from 'next/link';
import { isNotesAuthed, isNotesViewer, hasPortalSession } from '@/lib/notes-auth';
import { NOTES_OPEN_TO_STUDENTS, viewingAsStudent } from '@/lib/portal-beta';
import { getNotesTree, getSearchIndex } from '@/lib/notes-data';
import { notesViewer } from '@/lib/notes-viewer';
import { NOTES_LEVELS } from '@/lib/notes-tree';
import NotesLogin from './NotesLogin';
import NotesShell, { type ShellLevel } from './NotesShell';
// Scoped notes styles (portal-look chrome + content styling) — see the header
// comment in notes.css for why these must never move into globals.css.
import './notes.css';

export const metadata: Metadata = {
  title: 'Notes',
  description: 'Revision notes portal.',
  // Admin + portal students only, and not for public indexing even after that.
  robots: { index: false, follow: false },
};

/** Short chip per level for the shell brand + level switcher. */
const CHIP: Record<string, string> = { AM: 'A-Math', EM: 'E-Math' };

export default async function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side gate: without a valid session (admin cookie OR portal student)
  // no note content is ever rendered, so the markup can't leak to an
  // unauthenticated fetch.
  if (!(await isNotesViewer())) {
    return (
      <div className="notes-shell">
        <NotesLogin />
      </div>
    );
  }

  // Carve-out closed (2026-08-29, content vetting): a logged-in STUDENT gets a
  // friendly closed card — never the login form (they are signed in; a
  // password box here reads as "your account broke"). Adrian's admin cookie
  // keeps the full reader for the vetting work itself — unless he flips
  // "View as student", which must show him exactly this card.
  if (!NOTES_OPEN_TO_STUDENTS && !((await isNotesAuthed()) && !(await viewingAsStudent()))) {
    return (
      <div className="notes-shell">
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <p className="text-4xl" aria-hidden>📚</p>
          <h1 className="mt-4 text-xl font-bold text-navy">Notes are getting a polish</h1>
          <p className="mt-2 text-sm text-slate-600">
            Adrian is reviewing every page before this opens up. It&apos;ll be back soon —
            your practice, papers and notebook are all still here.
          </p>
          <Link
            href="/app"
            className="mt-6 inline-block rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-[hsl(45,100%,96%)] hover:opacity-90"
          >
            ‹ Back to the portal
          </Link>
        </div>
      </div>
    );
  }

  // One tree + search index per exposed level. Every loader is cache()d and
  // notesCache()d, so this is a handful of Supabase reads per revalidation
  // window, not per request.
  // The sub-group audience (lib/subgroup-visibility.ts) is per viewer: the
  // sidebar and its search index must show exactly what the pages do.
  const viewer = await notesViewer();
  const [portalHome, ...levelData] = await Promise.all([
    hasPortalSession(),
    ...NOTES_LEVELS.map(async l => ({
      code: l.code,
      chip: CHIP[l.code] ?? l.code,
      tree: await getNotesTree(l.code, viewer),
      search: await getSearchIndex(l.code, viewer),
    })),
  ]);
  const levels = levelData as ShellLevel[];

  return (
    <div className="notes-shell">
      <NotesShell levels={levels} portalHome={portalHome}>
        {children}
      </NotesShell>
    </div>
  );
}
