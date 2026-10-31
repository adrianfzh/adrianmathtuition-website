// /app/clip/q/[id] — 🎬 the one-minute solution clip for ONE bank question
// (SPEC-CLIP-PIPELINE.md §9, 15 Oct 2026). The clip was made once by
// scripts/clips/question-clip.mjs through every check and kept in `question_clips`;
// this page only plays it — no model call, nothing made here.
//
// Who sees it: questionClipsVisible() — Adrian's admin cookie and the preview student
// until QUESTION_CLIPS_OPEN_TO_STUDENTS flips. A student only ever sees a READY clip;
// Adrian sees every state with its reason, a "Make this clip" button, and his
// 👍 / 👎 under a ready one (the first 20 are watched before students get any).
// `?check=1` (admin) plays a clip still being made — the pipeline's look step uses it;
// `?at=N` opens at stop N (the slider's numbering) — the fit check measures each board that way.
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { questionClipsAdmin, questionClipsVisible } from '@/lib/portal-beta';
import { getQuestionClip } from '@/lib/question-clip-store';
import { getSupabaseAdmin } from '@/lib/supabase';
import { clipStatusLine } from '@/lib/question-clip';
import { buildPlayScenes } from '@/lib/lesson-load';
import LessonPlayer from '../../../lesson/[slug]/lesson-player';
import ClipDoor from './clip-door';

export const dynamic = 'force-dynamic';

export default async function QuestionClipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ check?: string; back?: string; at?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const isAdmin = await questionClipsAdmin();
  const identity = isAdmin ? null : portalIdentity(await currentAccount());
  if (!isAdmin && !(await questionClipsVisible(identity))) redirect('/app');

  const row = await getQuestionClip(id);
  const back = sp.back && /^\/(app|admin)\//.test(sp.back) ? sp.back : `/app/practice?qid=${id}`;
  const playable = row?.script && (row.status === 'ready' || (isAdmin && sp.check === '1'));
  if (!playable) {
    if (!isAdmin) redirect(back);
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <a href={back} className="text-sm text-slate-500">‹ Back</a>
        <h1 className="mt-4 text-xl font-semibold">🎬 Solution clip</h1>
        <p className="mt-2 text-slate-700">{clipStatusLine(row?.status ?? null, row?.refuse_reason)}</p>
        {row?.status === 'failed' && row.fail_reason && <p className="mt-2 text-sm text-slate-500">Failed check: {row.fail_reason}</p>}
        <div className="mt-6"><ClipDoor questionId={id} from="admin" initial={row?.status ?? null} /></div>
        <p className="mt-6 text-sm"><a className="underline" href="/admin/question-clips">All question clips</a></p>
      </main>
    );
  }
  const script = row!.script!;
  // The whole question beside the clip: a photo clip keeps the reading it was made from; a bank
  // clip reads its bank row.
  const question = row!.question_text ?? (row!.source === 'photo' ? null
    : (await getSupabaseAdmin().from('questions').select('question_text').eq('id', id).maybeSingle()).data?.question_text ?? null);
  return (
    <>
      <LessonPlayer
        slug={script.slug}
        title={script.title}
        topic={script.topic}
        minutes={script.minutes}
        theme={script.theme ?? 'chalk'}
        scenes={buildPlayScenes(script, new Map())}
        clip
        kicker="Clip"
        startAuto
        startVoice
        question={question}
        backHref={back}
        startAt={Math.max(0, Number.parseInt(sp.at ?? '0', 10) || 0)}
        // Opened from the learning loop (SPEC-LEARN-LOOP.md): "Now try one" goes back to its question.
        practiceHref={back.startsWith('/app/learn-loop/') ? back : `/app/practice?qid=${id}`}
        practiceLabel={back.startsWith('/app/learn-loop/') ? 'Now try one →' : 'Try it yourself →'}
        doneTitle="Now try one"
        doneText="Do this question on your own while it is fresh."
      />
      {isAdmin && row!.status === 'ready' && (
        <div className="mx-auto max-w-lg px-4 pb-10"><ClipDoor questionId={id} from="admin" initial="ready" verdict={row!.verdict} watchOnly /></div>
      )}
    </>
  );
}
