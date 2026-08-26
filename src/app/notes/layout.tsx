import type { Metadata } from 'next';
import { isNotesViewer, hasPortalSession } from '@/lib/notes-auth';
import { getNotesTree, getSearchIndex } from '@/lib/notes-data';
import { NOTES_LEVELS } from '@/lib/notes-tree';
import NotesLogin from './NotesLogin';
import NotesShell, { type ShellLevel } from './NotesShell';
// Scoped fumadocs styles — see the header comment in notes.css for why these
// must never move into globals.css.
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

  // One tree + search index per exposed level. Every loader is cache()d and
  // notesCache()d, so this is a handful of Supabase reads per revalidation
  // window, not per request.
  const [portalHome, ...levelData] = await Promise.all([
    hasPortalSession(),
    ...NOTES_LEVELS.map(async l => ({
      code: l.code,
      chip: CHIP[l.code] ?? l.code,
      tree: await getNotesTree(l.code),
      search: await getSearchIndex(l.code),
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
