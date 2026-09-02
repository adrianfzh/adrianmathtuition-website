// /app/practice/timed — a timed set: a few real bank questions against an
// exam-pace clock, no solutions and no marking until the clock stops
// (2026-09-02). Student-only (the grader is), reached from the slim row on
// /app/practice and from Home's "Next exam" card, which prefills the exam's
// level + tested topics via ?level=&topics=a,b,c. Open during the marking-only
// beta by construction — it never calls requireFullPortal (lib/portal-beta).
//
// The level list is resolved here, server-side, exactly as /app/practice
// does, so the level control is right on first paint.
import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/portal-auth';
import { qbLevelsFor } from '@/lib/practice';
import { examPrepVisible } from '@/lib/portal-beta';
import { MAX_TOPICS_PER_SET } from '@/lib/timed-set';
import TimedFlow from './timed-flow';

export const dynamic = 'force-dynamic';

export default async function TimedSetPage({ searchParams }: {
  searchParams: Promise<{ level?: string; topics?: string }>;
}) {
  const { level, topics } = await searchParams;
  const account = await currentAccount(); // redirects to /login when signed out
  // In prod but not student-facing yet (EXAM_PREP_OPEN_TO_STUDENTS, lib/portal-beta):
  // a student with the URL lands back on the picker; Adrian's admin cookie passes.
  if (!(await examPrepVisible())) redirect('/app/practice');
  const levels = qbLevelsFor(account.level, account.subjects);
  if (!levels.length) redirect('/app/practice');
  const wanted = (level || '').toUpperCase();
  const initialLevel = levels.find(l => l.key === wanted)?.key ?? levels[0].key;
  const initialTopics = (topics || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_TOPICS_PER_SET);
  return <TimedFlow levels={levels} initialLevel={initialLevel} initialTopics={initialTopics} />;
}
