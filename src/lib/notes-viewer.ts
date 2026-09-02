// Who is reading /notes, for the sub-group AUDIENCE gate (server components
// only — next/headers via notes-auth / portal-beta).
//
//   admin — Adrian's admin cookie AND not "viewing as a student": sees every
//           sub-group (hidden / IP-only rows carry a badge).
//   isIp  — the portal account's is_ip flag (lib/portal-ip.ts); unlocks
//           'ip' sub-groups and rows lent to the level via ip_extra_level.
//
// Adrian previewing through his demo-student login gets THAT account's view
// (admin cookie + view-as-student cookie → admin false), the same rule the
// practice routes apply.
import { cache } from 'react';
import { isNotesAuthed } from './notes-auth';
import { viewingAsStudent } from './portal-beta';
import { sessionAccount } from './portal-auth';
import type { NotesViewer } from './notes-data';

export const notesViewer = cache(async (): Promise<NotesViewer> => {
  const [authed, asStudent, account] = await Promise.all([
    isNotesAuthed(),
    viewingAsStudent(),
    sessionAccount().catch(() => null),
  ]);
  const admin = authed && !asStudent;
  return { admin, isIp: admin || Boolean(account?.is_ip) };
});
