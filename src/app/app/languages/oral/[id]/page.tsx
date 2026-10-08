// /app/languages/oral/<id>?part=planned|interaction[&attempt=<id>] — one oral practice
// (SPEC-ENGLISH-ORAL-LISTENING.md): the picture and the prompt, the timer, the recording, the
// words we heard, then the feedback. With ?attempt= it opens that attempt's feedback.
import { redirect } from 'next/navigation';
import { englishOralInteractionOpen, englishOralOpen } from '@/lib/portal-beta';
import { INTERACTION_MAX_SECONDS, PLANNED_MAX_SECONDS, PREP_SECONDS, promptAudio, publicOral, type OralPart } from '@/lib/english-oral';
import { oralById } from '@/lib/english-speaking-data';
import OralSession from '../oral-session';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OralPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ part?: string; attempt?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const part: OralPart = sp.part === 'interaction' ? 'interaction' : 'planned';
  if (!(await (part === 'planned' ? englishOralOpen() : englishOralInteractionOpen()))) redirect('/app/languages');
  const set = oralById(id);
  if (!set) redirect('/app/languages/oral');
  const pub = publicOral(set);
  return (
    <OralSession
      set={pub} part={part} attempt={sp.attempt && UUID.test(sp.attempt) ? sp.attempt : null}
      prompts={part === 'planned' ? [pub.planned] : pub.interaction}
      promptAudio={part === 'planned' ? [] : pub.interaction.map((_, i) => promptAudio(set.id, i + 1))}
      maxSeconds={part === 'planned' ? PLANNED_MAX_SECONDS : INTERACTION_MAX_SECONDS}
      prepSeconds={PREP_SECONDS}
    />
  );
}
