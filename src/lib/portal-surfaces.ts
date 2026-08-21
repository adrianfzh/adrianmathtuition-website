// Which portal surfaces THIS viewer can actually reach — the single place the
// onboarding tour and the "you are here" flow strip ask, so neither can point
// a student at a page the marking-only beta bounces them off.
//
// Mirrors the gates the app shell already applies (src/app/app/layout.tsx):
//   practice — open to students during the beta and on the full portal
//   learn    — nav item only for Adrian while LEARN_OPEN_TO_STUDENTS is false
//   notes    — /app/notes → the notes reader; full portal only
//
// Server-only (next/headers via notes-auth / portal-beta) — call it from a
// server component and pass the plain object down to the client components.
import { isNotesAuthed } from './notes-auth';
import { LEARN_OPEN_TO_STUDENTS } from './learn-gate';
import { MARKING_ONLY_BETA, viewingAsStudent } from './portal-beta';
import type { PortalSurfaces } from './portal-tour';

export async function portalSurfaces(): Promise<PortalSurfaces> {
  const adminPowers = (await isNotesAuthed()) && !(await viewingAsStudent());
  const fullPortal = adminPowers || !MARKING_ONLY_BETA;
  return {
    practice: true,
    learn: adminPowers || LEARN_OPEN_TO_STUDENTS,
    notes: fullPortal,
  };
}
