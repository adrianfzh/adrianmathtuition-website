// 🧪 /app/science/practice/run?level=PHY&topic=…&mode=mcq — one science topic's
// practice run, mounted UNDER the Science family so the bottom bar stays Science
// (1 Oct 2026). It is the same PracticeFlow the maths page uses, told the one
// science level and the topic; ?mode= is read by the flow and sent to
// /api/portal/practice/next as `kind` (lib/science-bank scienceNext). The maths
// /app/practice page shows a student the to-do list for any deep link
// (marking-only beta), which is why a science run cannot live there.
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { scienceMarkingOpen, sciencePracticeAccess, scienceStructuredPracticeOpen, viewingAsStudent } from '@/lib/portal-beta';
import { sessionAccount } from '@/lib/portal-auth';
import { studentSciences } from '@/lib/portal-prefs';
import { scienceLevel } from '@/lib/science-levels';
import { parsePracticeKind } from '@/lib/science-practice';
import PracticeFlow from '../../../practice/practice-flow';

export const dynamic = 'force-dynamic';

export default async function SciencePracticeRun({ searchParams }: { searchParams: Promise<{ level?: string; topic?: string; mode?: string }> }) {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const sp = await searchParams;
  const jar = await cookies();
  const isAdmin = !(await viewingAsStudent()) && verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value ?? '');
  if ((await sciencePracticeAccess()) === 'closed') redirect('/app/science');
  const account = await sessionAccount();
  if (!account && !isAdmin) redirect('/login');
  const lvl = scienceLevel((sp.level || '').toUpperCase());
  const topic = (sp.topic || '').trim();
  if (!lvl || !topic) redirect('/app/science/practice');
  // The student's own science choice is the gate (the same rule as the API's practiceLevelAllowed).
  const choice = studentSciences(account?.prefs);
  if (!isAdmin && !(choice?.subjects ?? []).includes(lvl.subject)) redirect('/app/science/practice');
  // Structured runs stay Adrian's until the grader is checked; a student's ?mode=structured falls back to MCQ.
  const kind = (await scienceStructuredPracticeOpen()) ? parsePracticeKind(sp.mode) : 'mcq';
  if (kind !== parsePracticeKind(sp.mode)) redirect(`/app/science/practice/run?level=${lvl.key}&topic=${encodeURIComponent(topic)}&mode=mcq`);
  return <PracticeFlow initialLevels={[{ key: lvl.key, label: lvl.label }]} initialTarget={{ level: lvl.key, topic }} lockedLevels />;
}
