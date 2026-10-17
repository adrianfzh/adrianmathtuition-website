// /app/humanities/own — mark a question from school (15 Oct 2026, lib/humanities-own.ts). The student
// gives the question, its sources if it has any, and their answer — each typed or by photo — and gets the
// same feedback as on our own questions. ?s=<subject> picks the tab; ?again=<run id> refills an earlier one.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen, humanitiesOwnOpen } from '@/lib/portal-beta';
import { studentHumanities } from '@/lib/portal-prefs';
import { loadHumanitiesRun } from '@/lib/humanities-runs';
import { OWN_SKILLS, type OwnQuestion } from '@/lib/humanities-own';
import type { HumanitiesSubject } from '@/lib/humanities-questions';
import { MAX_WORDS } from '@/lib/humanities-submit';
import OwnForm from './own-form';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export default async function OwnQuestionPage({ searchParams }: { searchParams: Promise<{ s?: string; again?: string }> }) {
  if (!(await humanitiesOwnOpen())) redirect('/app');
  const { s, again } = await searchParams;
  const account = await currentAccount();
  const full = await humanitiesOpen();
  let prefill: OwnQuestion | null = null;
  if (again && UUID.test(again)) {
    const run = await loadHumanitiesRun(again, portalIdentity(account));
    prefill = run?.own_question ?? null;
  }
  const choices = studentHumanities(account?.prefs);
  const asked = prefill?.subject ?? (s === 'history' ? 'history' : s === 'geography' ? 'geography' : 'social-studies');
  const askedPure = prefill?.pure ?? false;
  // Only Social Studies and the subjects the student ticked (a refill keeps its own).
  const ticked = asked === 'social-studies' || choices.includes(`${asked}_${askedPure ? 'p' : 'e'}` as never)
    || choices.some(c => c.startsWith(`${asked}_`));
  const subject: HumanitiesSubject = ticked || prefill ? asked : 'social-studies';
  const pure = subject === 'social-studies' ? false : prefill ? askedPure : choices.includes(`${subject}_p` as never) && !choices.includes(`${subject}_e` as never);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {full && <Link href={subject === 'social-studies' ? '/app/humanities' : `/app/humanities?s=${subject}`} className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>}
      <div>
        <h1 className="text-xl font-bold text-navy leading-snug">Check my answer</h1>
        <p className="text-sm text-gray-600 mt-1">Send a question you did and your answer. Type them, or send photos.</p>
        <p className="text-[12px] text-gray-500">Social Studies, your elective, and Pure Geography or History if you take them.</p>
      </div>
      <OwnForm initialSubject={subject} initialPure={pure} choices={choices} prefill={prefill} skills={OWN_SKILLS} maxWords={MAX_WORDS} />
    </div>
  );
}
