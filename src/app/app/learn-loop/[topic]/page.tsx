// 🔁 The learning loop (SPEC-LEARN-LOOP.md, 31 Oct 2026): one topic, question type by
// question type — the clip, a question, write it on the iPad or send a photo, marked at
// once; wrong → why, and another one; right → the next type. Behind LEARN_LOOP_OPEN_TO_STUDENTS.
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { learnLoopOpenFor } from '@/lib/portal-beta';
import { loopTopic, showClipFirst, LOOP_MISSES_BEFORE_HELP } from '@/lib/learn-loop';
import { loopState, studentLoopLevel } from '@/lib/learn-loop-store';
import LoopFlow from './loop-flow';

export const dynamic = 'force-dynamic';

export default async function LearnLoopPage({ params, searchParams }: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { topic: key } = await params;
  const sp = await searchParams;
  const topic = loopTopic(key);
  if (!topic) notFound();
  const account = await currentAccount();
  if (!learnLoopOpenFor(portalIdentity(account))) redirect('/app');
  const level = studentLoopLevel(topic, account);
  if (!level) redirect('/app');
  const types = await loopState(topic, level, account);

  return (
    <LoopFlow
      topicKey={topic.key}
      title={topic.title}
      clipHref={topic.clipSlug ? `/app/lesson/${topic.clipSlug}?loop=${topic.key}` : null}
      clipFirst={showClipFirst(types) && sp.watched !== '1'}
      initialTypes={types}
      missesBeforeHelp={LOOP_MISSES_BEFORE_HELP}
    />
  );
}
