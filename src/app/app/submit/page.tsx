// /app/submit — hand in a photographed paper for marking.
// Server component gates the session; the phone-first UI is the client half.
// The submission becomes a ⏳ pending run in Adrian's /admin/mark-paper history,
// auto-queued and auto-released (see /api/portal/submit).
// ?assignment=<id> — a "From Adrian" worksheet hand-in (SPEC-ASSIGN.md): the
// assignment is ownership-checked here and the client locks the paper name.
import { redirect } from 'next/navigation';
import { currentStudent } from '@/lib/portal-auth';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { getSupabaseAdmin } from '@/lib/supabase';
import { DAILY_SUBMIT_CAP, countHandinsToday } from '@/lib/portal-submit-limit';
import type { HandinCountingClient } from '@/lib/portal-submit-limit';
import SubmitClient from './submit-client';

export const dynamic = 'force-dynamic';

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ assignment?: string }> }) {
  const { account } = await currentStudent();
  const { assignment: assignmentId } = await searchParams;
  let assignment: { id: string; title: string } | null = null;
  if (assignmentId) {
    const a = await getStudentAssignment(assignmentId, account.airtable_student_id);
    if (!a || a.kind !== 'worksheet') redirect('/app/assignments');
    if (a.status !== 'assigned') redirect(`/app/assignments/${a.id}`);
    assignment = { id: a.id, title: a.title };
  }

  // Allowance framing: the daily slot is shown BEFORE the student photographs
  // twenty pages, not sprung on them at POST time. Assignments are cap-exempt
  // (route D3), so their flow never checks. Best-effort — a count failure just
  // means the server-side cap catches it at submit instead.
  let slotUsed = false;
  if (!assignment) {
    try {
      const count = await countHandinsToday(getSupabaseAdmin() as unknown as HandinCountingClient, account.airtable_student_id);
      slotUsed = count >= DAILY_SUBMIT_CAP;
    } catch { /* degrade to the POST-time check */ }
  }
  return <SubmitClient assignment={assignment} slotUsed={slotUsed} />;
}
