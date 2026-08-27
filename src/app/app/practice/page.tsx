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
import Link from 'next/link';
import PracticeFlow, { type InitialAssignment } from './practice-flow';
import { sessionAccount } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { qbLevelsFor } from '@/lib/practice';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { dueLabel } from '@/lib/assignments';
import { questionMarkdown, questionStructured } from '@/lib/bank-question-markdown';

export const dynamic = 'force-dynamic';

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ assignment?: string; level?: string; topic?: string }> }) {
  const { assignment: assignmentId, level: targetLevel, topic: targetTopic } = await searchParams;
  // "Practise this topic" deep link from /notes: preselect the level and open
  // that topic's sheet once the overview loads. Ignored when an assignment is
  // being opened (the assignment fixes the question).
  const initialTarget =
    !assignmentId && targetTopic
      ? { level: (targetLevel || '').toUpperCase() || null, topic: targetTopic }
      : null;
  let initialLevels: { key: string; label: string }[] | null = null;
  // `account` is non-null only for a logged-in student (the admin-password
  // testing mode renders a login card instead). No "you are here" flow strip
  // on this tab — Adrian 2026-08-23: the Practise → Hand in → Marked strip
  // was just taking space above the topic list; it stays on /app/marking.
  let account: { airtable_student_id: string; level: string | null; subjects: string[] | null } | null = null;
  try {
    // Per-request cached (lib/portal-auth.ts) — shared with the layout's
    // lookups in the same render pass instead of a second getUser round-trip.
    const data = await sessionAccount();
    if (data) { account = data; initialLevels = qbLevelsFor(data.level, data.subjects); }
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
  // "Print a paper" entry card (SPEC-PRINT-PAPER.md) — full-portal only, so
  // Print opened to all students 2026-08-28; the door only hides while a
  // deep-linked assignment should keep the student's focus.
  const printEntry = !initialAssignment;

  return (
    <>
      {printEntry && (
        <Link
          href="/app/print"
          className="mb-4 flex items-center gap-3 bg-white rounded-2xl border border-black/5 shadow-sm p-4 hover:border-black/10"
        >
          <span className="text-2xl" aria-hidden>🖨️</span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-navy">Print a paper</span>
            <span className="block text-[12px] text-gray-500">A mock exam or topic sheet on real paper — then hand it back in for marking.</span>
          </span>
        </Link>
      )}
      <PracticeFlow initialLevels={initialLevels} initialAssignment={initialAssignment} initialTarget={initialTarget} />
    </>
  );
}
