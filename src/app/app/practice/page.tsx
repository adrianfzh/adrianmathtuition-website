// /app/practice — the practice flow (topic → Standard/Advanced → question →
// marked working). Open to students during the marking-only beta; Home links
// here. The flow itself lives in practice-flow.tsx (client).
//
// The student's level list is resolved HERE, server-side, and handed to the
// client as the initial state. Before 2026-08-21 the client booted with the
// full nine-level admin list and narrowed it after the overview fetch, so a
// student saw "Sec 1 … JC2" flash for a beat before "E Math / A Math"
// (Adrian spotted it on his phone). Admin (no student session) still resolves
// client-side: the page passes null and the flow falls back to its own check.
//
// ?assignment=<id> — "From Adrian" mode (SPEC-ASSIGN.md): the assigned bank
// question is resolved here (service role, ownership-checked against the
// student's Airtable id) and handed to the flow as `initialAssignment`.
import { notFound, redirect } from 'next/navigation';
import PracticeFlow, { type InitialAssignment } from './practice-flow';
import PortalFlowStrip from '@/components/PortalFlowStrip';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { portalSurfaces } from '@/lib/portal-surfaces';
import { qbLevelsFor } from '@/lib/practice';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { dueLabel } from '@/lib/assignments';
import { questionMarkdown, questionStructured } from '@/lib/bank-question-markdown';

export const dynamic = 'force-dynamic';

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ assignment?: string }> }) {
  const { assignment: assignmentId } = await searchParams;
  let initialLevels: { key: string; label: string }[] | null = null;
  // `account` is non-null only for a logged-in student — the admin-password
  // testing mode renders a login card, not the journey, so the "you are here"
  // strip keys off it too.
  let account: { airtable_student_id: string; level: string | null; subjects: string[] | null } | null = null;
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('portal_accounts')
        .select('airtable_student_id, level, subjects')
        .eq('id', user.id)
        .maybeSingle<{ airtable_student_id: string; level: string | null; subjects: string[] | null }>();
      if (data) { account = data; initialLevels = qbLevelsFor(data.level, data.subjects); }
    }
  } catch { /* fall back to client-side detection */ }

  let initialAssignment: InitialAssignment | null = null;
  if (assignmentId) {
    if (!account) redirect('/login');
    const a = await getStudentAssignment(assignmentId, account.airtable_student_id);
    if (!a) notFound();
    if (a.kind !== 'question' || !a.question_id) redirect(`/app/assignments/${a.id}`);
    const { data: q } = await getSupabaseAdmin()
      .from('questions')
      .select('id, question_text, parts, total_marks, has_image, image_url, images, figure_url, solution, answer')
      .eq('id', a.question_id).maybeSingle();
    if (!q) notFound();
    const { stem, parts } = questionStructured(q);
    initialAssignment = {
      id: a.id,
      title: a.title,
      note: a.note,
      dueLabel: dueLabel(a.due_on),
      topic: a.topic,
      tier: a.tier === 'Advanced' || a.tier === 'Standard' ? a.tier : null,
      status: a.status === 'marked' ? 'marked' : a.status === 'submitted' ? 'submitted' : 'assigned',
      score: a.score,
      outOf: a.out_of,
      question: {
        id: q.id,
        markdown: questionMarkdown(q),
        stem,
        parts,
        marks: q.total_marks ?? null,
        figureUrl: q.figure_url ?? null,
        source: null,
        hasSolution: !!(q.solution && q.solution.trim()),
      },
    };
  }
  const surfaces = await portalSurfaces();
  return (
    <>
      {account && <PortalFlowStrip current="practice" surfaces={surfaces} />}
      <PracticeFlow initialLevels={initialLevels} initialAssignment={initialAssignment} />
    </>
  );
}
