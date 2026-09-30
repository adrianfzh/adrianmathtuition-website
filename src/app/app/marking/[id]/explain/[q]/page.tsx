// /app/marking/[id]/explain/[q] — ▶ the one-minute explanation (1 Oct 2026,
// Adrian: "students … want to know immediately what they need to know").
// ONE lost-marks question of the student's own released paper, replayed on the
// chalk board by the lesson player: their lines up to the ✗ one, the marker's
// verdict, the red pen's steps from there with the reason under each, the
// Answer. The script is built here from the stored marking (lib/explain-clip,
// pure) — no model call, nothing rendered, nothing to approve; the page IS the
// video. Same access rule as the paper page: the logged-in student's own
// released run, or Adrian's admin cookie. Admin-only until
// EXPLAIN_CLIP_OPEN_TO_STUDENTS flips (lib/portal-beta) — a student who lands
// here early is sent back to the paper, never a broken page.
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { explainClipVisible, viewingAsStudent } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { buildExplainScript, canExplain } from '@/lib/explain-clip';
import { buildPlayScenes } from '@/lib/lesson-load';
import LessonPlayer from '../../../../lesson/[slug]/lesson-player';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, student_label, student_starred_at, student_archived_at, student_note, paper_subject, superseded_by, subject, student_id';

export default async function ExplainPage({ params, under = 'math' }: { params: Promise<{ id: string; q: string }>; under?: 'math' | 'science' }) {
  const { id, q: rawQ } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const qn = decodeURIComponent(rawQ ?? '').trim();
  if (!qn || qn.length > 24) notFound();

  const isAdmin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value) && !(await viewingAsStudent());
  const account: Awaited<ReturnType<typeof currentAccount>> | null = isAdmin ? null : await currentAccount();
  const sb = getSupabaseAdmin();
  let query = sb.from('paper_marking_runs').select(COLUMNS).eq('id', id).not('released_at', 'is', null);
  if (!isAdmin) query = query.eq('student_id', portalIdentity(account!));
  const { data: row } = await query.maybeSingle();
  if (!row) notFound();
  const sid: string = isAdmin ? String((row as { student_id?: string | null }).student_id ?? '') : portalIdentity(account!);
  if (!sid) notFound();

  const lane = String((row as { subject?: string | null }).subject ?? 'math');
  const paperHref = lane !== 'math' ? `/app/science/marking/${id}` : `/app/marking/${id}`;
  const family: 'math' | 'science' = lane !== 'math' ? 'science' : 'math';
  if (family !== under) redirect(`${paperHref}/explain/${encodeURIComponent(qn)}`);
  if (!(await explainClipVisible(sid))) redirect(paperHref);

  const { papers } = buildStudentMarking([row as unknown as MarkingRunRow]);
  const paper = papers[0];
  // A science run can list one number twice (a part per entry): take the entry with something to replay.
  const question = paper?.questions.filter(x => x.questionNumber === qn).find(canExplain) ?? null;
  const script = question ? buildExplainScript(question, id) : null;
  if (!paper || !question || !script) redirect(paperHref);

  return (
    <LessonPlayer
      slug={script.slug}
      title={script.title}
      topic={script.topic}
      minutes={script.minutes}
      theme={script.theme ?? 'chalk'}
      scenes={buildPlayScenes(script, new Map())}
      backHref={paperHref}
      kicker="Explain"
      practiceHref={question.revise?.href ?? paperHref}
      practiceLabel={question.revise ? `✏️ Practise: ${question.revise.name} →` : '‹ Back to my paper'}
      doneTitle="That's the fix"
      doneText="Your line, the slip, the steps from there. Try one like it while it's fresh."
      startAuto
    />
  );
}
