// /app/learn-step/[step] — 📗 one LEARN step (SPEC-SELF-LEARNING.md §4, §4a): the
// idea taught from the start, in the order and the way of Adrian's notes — a
// worked example one line a tap → try one with the next step on tap → five on
// your own, typed and checked at once, pass 4 of 5. Everything is worked out on
// the device from the question (lib/learn-step) — no model, no database.
// ADMIN ONLY behind LEARN_STEP_OPEN_TO_STUDENTS (lib/portal-beta): a student who
// types the address lands back on Home. Linked from nowhere yet.
// The JC H2 P&C steps (slugs pc-…, §4c) live here too, behind their own switch
// PC_COACH_OPEN_TO_STUDENTS: pictures from the bot's figure library, the hints and
// watch-out from teaching_knowledge(), numbers marked with lib/pc-learn.
// (Not REVISE — revising starts from exam questions and is a separate build.)
import { notFound, redirect } from 'next/navigation';
import { learnStepVisible, pcCoachVisible } from '@/lib/portal-beta';
import { learnStepBySlug } from '@/lib/learn-steps';
import { pcStepBySlug } from '@/lib/pc-steps';
import LearnFlow from './learn-flow';
import PcFlow from './pc-flow';
import { loadPcStep } from './pc-load';

export const dynamic = 'force-dynamic';

export default async function LearnStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ seen?: string }> }) {
  const { step: slug } = await params;
  const pc = pcStepBySlug(slug);
  if (pc) {
    if (!(await pcCoachVisible())) redirect('/app');
    return <PcFlow data={await loadPcStep(pc)} />;
  }
  if (!(await learnStepVisible())) redirect('/app');
  const step = learnStepBySlug(slug);
  if (!step) notFound();
  // The step opens on its clip when it has one; ?seen=clip is the way back from it.
  const seenClip = (await searchParams).seen === 'clip';
  return <LearnFlow step={step} seenClip={seenClip} />;
}
