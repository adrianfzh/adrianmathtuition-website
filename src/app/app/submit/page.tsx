// /app/submit — hand in a photographed paper for marking.
// Server component gates the session; the phone-first UI is the client half.
// The submission becomes a ⏳ pending run in Adrian's /admin/mark-paper history,
// auto-queued and auto-released (see /api/portal/submit).
// ?assignment=<id> — a "From Adrian" worksheet hand-in (SPEC-ASSIGN.md): the
// assignment is ownership-checked here and the client locks the paper name.
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  dailyHandinCapForTier,
  getCurrentPass,
  handinsRemaining,
  isTuitionAccount,
} from '@/lib/portal-passes';
import { DAILY_SUBMIT_CAP, countHandinsToday } from '@/lib/portal-submit-limit';
import type { HandinCountingClient } from '@/lib/portal-submit-limit';
import SubmitClient from './submit-client';
import { markSubjectAccess } from '@/lib/portal-beta';
import { enrolledMarkSubjects } from '@/lib/student-mark-subjects';
import { pickableSubjects } from '@/lib/mark-subject-for-student';

export const dynamic = 'force-dynamic';

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ assignment?: string; paper?: string }> }) {
  const account = await currentAccount();
  // rec… for tuition, acct:<uuid> for strangers — the same identity the submit
  // route stamps on runs and counts the daily cap by.
  const sid = portalIdentity(account);
  const { assignment: assignmentId, paper: paperId } = await searchParams;
  let assignment: { id: string; title: string } | null = null;
  if (assignmentId) {
    const a = await getStudentAssignment(assignmentId, sid);
    if (!a || a.kind !== 'worksheet') redirect('/app/assignments');
    if (a.status !== 'assigned') redirect(`/app/assignments/${a.id}`);
    assignment = { id: a.id, title: a.title };
  }

  // ?paper=<id> — a self-generated printed paper (SPEC-PRINT-PAPER.md): lock
  // the name to its title so marking links back to the pre-registered
  // questions. Ownership-checked here; unlike assignments it SPENDS the daily
  // slot (spec D5 — self-initiated work keeps the cost brake).
  let paper: { id: string; title: string } | null = null;
  if (!assignment && paperId) {
    const { data } = await getSupabaseAdmin()
      .from('portal_generated_papers')
      .select('id, title, status')
      .eq('id', paperId)
      .eq('airtable_student_id', sid)
      .maybeSingle();
    if (!data) redirect('/app/print');
    if (data.status !== 'open') redirect('/app/print');
    paper = { id: data.id, title: data.title };
  }

  // Allowance framing: the daily slot is shown BEFORE the student photographs
  // twenty pages, not sprung on them at POST time. Assignments are cap-exempt
  // (route D3), so their flow never checks. Best-effort — a count failure just
  // means the server-side cap catches it at submit instead.
  let slotUsed = false;
  if (!assignment) {
    try {
      // Strangers: the ceiling comes from their pass tier (Standard 1/day,
      // Intensive 3/day) and an exhausted pass meter also greys the form —
      // both re-checked server-side at POST time; this is only the preflight.
      let cap = DAILY_SUBMIT_CAP;
      if (!isTuitionAccount(account)) {
        const pass = await getCurrentPass(account.id);
        cap = dailyHandinCapForTier(pass?.tier);
        if (handinsRemaining(pass) <= 0) slotUsed = true;
      }
      if (!slotUsed) {
        const count = await countHandinsToday(getSupabaseAdmin() as unknown as HandinCountingClient, sid);
        slotUsed = count >= cap;
      }
    } catch { /* degrade to the POST-time check */ }
  }
  // The subject the hand-in is marked as (SPEC-SCIENCE-MARKING). Off by default:
  // markSubjectAccess is 'closed' for students until the flag flips, so
  // pickableSubjects returns [] and the picker never shows — every hand-in is
  // math, unchanged. Adrian's admin cookie previews the full list; an enrolled
  // student sees a picker only once the flag is on. An assignment or a
  // pre-registered printed paper is math (its bank questions decide it), so no
  // picker there.
  const access = await markSubjectAccess();
  const subjectChoices = (assignment || paper)
    ? []
    : pickableSubjects({ enrolled: await enrolledMarkSubjects(account.airtable_student_id), access });

  return <SubmitClient assignment={assignment} paper={paper} slotUsed={slotUsed} subjectChoices={subjectChoices} />;
}
