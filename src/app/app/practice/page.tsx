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
//
// ?qid=<questions.id> — fixed-question mode: EXACTLY that bank question in the
// graded flow. This is the landing pad for /app/marking's "Try it now" twins,
// the 📷/🔍 finder's matches, and freshly generated questions (`?from=` names
// the door for the context header). Resolved here with the service client and
// gated by lib/portal-find.practiceEligibility — the same bars practice_next
// applies (not deleted / flag-buried / unverified-AI, has content, has an
// answer to mark against) — so a deep link can never open a question the
// normal flow would refuse; an ineligible id degrades to a friendly notice
// over the ordinary picker, never a broken screen.
import { notFound, redirect } from 'next/navigation';
import PracticeFlow, { type FixedQuestion, type InitialAssignment } from './practice-flow';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { qbLevelsFor } from '@/lib/practice';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { dueLabel } from '@/lib/assignments';
import { practiceEligibility } from '@/lib/portal-find';
import { questionMarkdown, questionStructured, totalMarksOf } from '@/lib/bank-question-markdown';

export const dynamic = 'force-dynamic';

const QID_FROM = ['marked', 'photo', 'search', 'generated', 'notebook'] as const;

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ assignment?: string; level?: string; topic?: string; qid?: string; from?: string }> }) {
  const { assignment: assignmentId, level: targetLevel, topic: targetTopic, qid, from } = await searchParams;
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
  let account: { id: string; airtable_student_id: string; level: string | null; subjects: string[] | null } | null = null;
  try {
    // Per-request cached (lib/portal-auth.ts) — shared with the layout's
    // lookups in the same render pass instead of a second getUser round-trip.
    const data = await sessionAccount();
    if (data) { account = data; initialLevels = qbLevelsFor(data.level, data.subjects); }
  } catch { /* fall back to client-side detection */ }

  let initialAssignment: InitialAssignment | null = null;
  if (assignmentId) {
    if (!account) redirect('/login');
    const a = await getStudentAssignment(assignmentId, portalIdentity(account));
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
        marks: q.total_marks ?? totalMarksOf(parts),
        figureUrl: q.figure_url ?? null,
        source: null,
        hasSolution: !!(q.solution && q.solution.trim()),
      },
    };
  }
  // ?qid= fixed-question mode. Student session required (the links that carry
  // qid all live behind a login); the eligibility gate turns a bad/ineligible
  // id into a notice rather than a 404 — the student still lands on a working
  // practice page.
  let initialQuestion: FixedQuestion | null = null;
  let qidBlocked = false;
  if (qid && !assignmentId) {
    if (!account) redirect('/login');
    const { data: q } = await getSupabaseAdmin()
      .from('questions')
      .select('id, question_text, parts, total_marks, has_image, image_url, images, figure_url, solution, answer, topics, deleted_at, flagged_count, ai_generated, verified')
      .eq('id', qid)
      .maybeSingle();
    if (q && practiceEligibility(q).ok) {
      const { stem, parts } = questionStructured(q);
      const fromParam = QID_FROM.find(f => f === from) ?? null;
      const topics = Array.isArray(q.topics) ? q.topics.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [];
      initialQuestion = {
        from: fromParam,
        topic: topics[0] ?? null,
        question: {
          id: q.id,
          markdown: questionMarkdown(q),
          stem,
          parts,
          marks: q.total_marks ?? totalMarksOf(parts),
          figureUrl: q.figure_url ?? null,
          source: null,
          hasSolution: !!(q.solution && q.solution.trim()),
        },
      };
    } else {
      qidBlocked = true;
    }
  }

  // "Print a paper" entry (SPEC-PRINT-PAPER.md) — full-portal only used to
  // gate this; Print opened to all students 2026-08-28, so the only remaining
  // condition is deep-linked assignment/fixed-question mode. Rendered inside
  // PracticeFlow now (Adrian, phone review round 5: it was a fat card sitting
  // above everything, even a live question — demoted to a slim row below the
  // topic list that hides the moment a topic is chosen).
  return (
    <>
      {qidBlocked && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          That one can&apos;t be practised here — it doesn&apos;t have a marked answer on file yet.
          Pick a topic below instead, or snap the question to find one like it.
        </div>
      )}
      <PracticeFlow initialLevels={initialLevels} initialAssignment={initialAssignment} initialTarget={initialTarget} initialQuestion={initialQuestion} />
    </>
  );
}
