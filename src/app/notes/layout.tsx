import type { Metadata } from 'next';
import { isNotesViewer, hasPortalSession } from '@/lib/notes-auth';
import { getNotesTree } from '@/lib/notes-data';
import NotesLogin from './NotesLogin';
import NotesShell from './NotesShell';
// Scoped fumadocs styles — see the header comment in notes.css for why these
// must never move into globals.css.
import './notes.css';

export const metadata: Metadata = {
  title: 'Notes',
  description: 'Revision notes portal.',
  // Admin + portal students only, and not for public indexing even after that.
  robots: { index: false, follow: false },
};

/** Phase 1 ships Additional Maths only; Phase 2 adds the remaining levels. */
const PHASE_1_LEVEL = 'AM';

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

  const [tree, portalHome] = await Promise.all([
    getNotesTree(PHASE_1_LEVEL),
    hasPortalSession(),
  ]);

  return (
    <div className="notes-shell">
      <NotesShell tree={tree} portalHome={portalHome}>{children}</NotesShell>
    </div>
  );
}
