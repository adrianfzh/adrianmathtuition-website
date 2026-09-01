// /app/lesson/[slug] — the animated lesson player (scene-scripted, no AI at
// runtime). Server component: loads the committed script (data/lessons/), and
// resolves every `check` scene's bank question HERE through the SAME
// eligibility gate the practice ?qid= deep link uses (lib/portal-find via
// lib/lesson-load.resolveCheckScene) — an ineligible or vanished question
// renders that check as skipped, never a broken lesson.
//
// ADMIN-ONLY PREVIEW for now (Adrian, 2026-09-02: "do not put animated lesson
// as student facing yet") — requireFullPortal bounces students to /app while
// the marking-only beta is on; Adrian's admin cookie previews it. Remove the
// gate (and the matching `lessonsVisible` prop on the practice page) to
// release. The /app layout still gates anonymous visitors to /login.
import { notFound } from 'next/navigation';
import { requireFullPortal } from '@/lib/portal-beta';
import { lessonBySlug } from '@/lib/lesson-catalog';
import {
  buildPlayScenes, loadLessonScript,
  CHECK_QUESTION_COLUMNS, type CheckQuestionRow,
} from '@/lib/lesson-load';
import { checkQids } from '@/lib/lesson-script';
import { getSupabaseAdmin } from '@/lib/supabase';
import LessonPlayer from './lesson-player';

export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireFullPortal();
  const { slug } = await params;
  const entry = lessonBySlug(slug);
  const script = entry ? loadLessonScript(slug) : null;
  if (!entry || !script) notFound();

  // One batched fetch for every check question. The official answers ride into
  // the player for instant local grading + the reveal — the same exposure
  // class as /api/portal/practice/solution (any signed-in session can fetch a
  // full worked solution for an eligible question), so nothing new leaks.
  // A Supabase hiccup degrades every check to "skipped"; the lesson plays on.
  const qids = checkQids(script);
  const rows = new Map<string, CheckQuestionRow>();
  if (qids.length > 0) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('questions')
        .select(CHECK_QUESTION_COLUMNS)
        .in('id', qids);
      for (const q of (data || []) as CheckQuestionRow[]) rows.set(q.id, q);
    } catch { /* checks degrade to skipped */ }
  }

  return (
    <LessonPlayer
      slug={script.slug}
      title={script.title}
      topic={script.topic}
      minutes={script.minutes}
      scenes={buildPlayScenes(script, rows)}
    />
  );
}
