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
import { notFound, redirect } from 'next/navigation';
import { clipAskVisible, fullPortalVisible, learnStepVisible, lessonVideoExtrasVisible } from '@/lib/portal-beta';
import { parseResumeStop } from '@/lib/clip-ask';
import { currentAccount, portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { lessonExtras } from '@/lib/lesson-extras';
import { learnStepForClip } from '@/lib/learn-steps';
import { lessonBySlug } from '@/lib/lesson-catalog';
import {
  buildPlayScenes, loadLessonScript,
  CHECK_QUESTION_COLUMNS, type CheckQuestionRow,
} from '@/lib/lesson-load';
import { checkQids } from '@/lib/lesson-script';
import { getSupabaseAdmin } from '@/lib/supabase';
import LessonPlayer from './lesson-player';
import LessonWithIntro from './lesson-intro';

export const dynamic = 'force-dynamic';

export default async function LessonPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // 🎬 A lesson with video extras (lib/lesson-extras) also opens for the preview
  // student while its switch is off; every other lesson keeps the admin-only gate.
  const extras = lessonExtras(slug);
  let extrasOn = false;
  if (await fullPortalVisible()) {
    extrasOn = !!extras && (await lessonVideoExtrasVisible());
  } else {
    if (!extras) redirect('/app');
    extrasOn = await lessonVideoExtrasVisible(portalIdentity(await currentAccount()));
    if (!extrasOn) redirect('/app');
  }
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

  // A clip that belongs to a LEARN step (SPEC-SELF-LEARNING.md §4) hands the
  // student on to that step — and back to it — while the step is visible to them.
  const step = script.kind === 'clip' && (await learnStepVisible()) ? learnStepForClip(slug) : null;
  const toStep = step ? { backHref: `/app/learn-step/${step.slug}?seen=clip`, practiceHref: `/app/learn-step/${step.slug}?seen=clip`, practiceLabel: 'See an example' } : {};

  // 💬 "Ask about this step" (lib/clip-ask): a clip shows the button while its switch allows,
  // and ?at=<stop> (the way back from Ask) resumes the clip at that step.
  // sessionAccount (never currentAccount): Adrian's admin cookie has no student account, and
  // currentAccount would bounce it to /login.
  const askAccount = script.kind === 'clip' ? await sessionAccount() : null;
  const askAbout = script.kind === 'clip' && (await clipAskVisible(askAccount ? portalIdentity(askAccount) : null));
  const startAt = script.kind === 'clip' ? parseResumeStop(sp.at) : 0;

  const player = {
    slug: script.slug,
    title: script.title,
    topic: script.topic,
    minutes: script.minutes,
    theme: script.theme ?? 'slide',
    scenes: buildPlayScenes(script, rows),
    // A clip is one concept in a minute: it opens playing, like a video.
    ...(script.kind === 'clip' ? { clip: true, kicker: 'Clip', startAuto: true, startVoice: true, doneTitle: 'Now try one', doneText: 'Use it on a real question while it is fresh.', askAbout, startAt, askIntro: clipIntro(script.scenes), askLevel: ['EM', 'AM', 'JC', 'S1', 'S2'].includes(script.level) ? script.level : null } : {}),
    ...toStep,
  };
  return extras && extrasOn
    ? <LessonWithIntro intro={extras.intro} cheer={extras.cheer} {...player} />
    : <LessonPlayer {...player} />;
}

/** The clip's question as written above the working (its first scene's intro), for Ask. */
function clipIntro(scenes: { type: string; intro?: string }[]): string | null {
  const s = scenes.find(sc => sc.type === 'equation-steps' && sc.intro);
  return s?.intro ?? null;
}
