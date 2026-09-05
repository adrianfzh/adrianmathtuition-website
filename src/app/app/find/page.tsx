// /app/find — "Find a question" (SPEC-PORTAL-V2 §4, Adrian 6 Sep 2026).
// Photograph or type a question → a genuinely similar bank question (same
// topic AND sub-skill, marks within one — lib/portal-find's tier rule) or,
// when the bank has nothing that close, a made-for-you one written by the
// bot's four-gate worker. Either lands straight on the student's Practice
// list; the card says which tier it is. Replaced the students' "Request
// materials" door on Home (the request flow stays reachable for Adrian).
//
// Server half: the session, the level options the student may search (their
// own subjects only — lib/portal-find.findLevelOptions over the subject gate)
// and the FIND_OPEN_TO_STUDENTS flag. The flow is find-client.tsx.
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/portal-auth';
import { FIND_OPEN_TO_STUDENTS, fullPortalVisible } from '@/lib/portal-beta';
import { findLevelOptions } from '@/lib/portal-find';
import FindClient from './find-client';

export const dynamic = 'force-dynamic';

export default async function FindPage() {
  if (!FIND_OPEN_TO_STUDENTS && !(await fullPortalVisible())) redirect('/app');
  const account = await currentAccount();
  const levels = findLevelOptions(account);
  return <FindClient levels={levels} />;
}
