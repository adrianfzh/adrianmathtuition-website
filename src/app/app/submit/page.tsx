// /app/submit — hand in a photographed paper for marking.
// Server component gates the session; the phone-first UI is the client half.
// The submission becomes a ⏳ pending run in Adrian's /admin/mark-paper history,
// auto-queued and auto-released (see /api/portal/submit).
// ?assignment=<id> — a "From Adrian" worksheet hand-in (SPEC-ASSIGN.md): the
// assignment is ownership-checked here and the client locks the paper name.
import { redirect } from 'next/navigation';
import { currentStudent } from '@/lib/portal-auth';
import { getStudentAssignment } from '@/lib/portal-assignments';
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
  return <SubmitClient assignment={assignment} />;
}
