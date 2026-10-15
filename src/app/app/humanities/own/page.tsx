// /app/humanities/own — mark a question from school (15 Oct 2026, lib/humanities-own.ts). The student
// gives the question, its sources if it has any, and their answer — each typed or by photo — and gets the
// same feedback as on our own questions. ?s=<subject> picks the tab; ?again=<run id> refills an earlier one.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen, humanitiesOwnOpen } from '@/lib/portal-beta';
import { studentElective } from '@/lib/portal-prefs';
import { loadHumanitiesRun } from '@/lib/humanities-runs';
import { OWN_SKILLS, type OwnQuestion } from '@/lib/humanities-own';
import type { HumanitiesSubject } from '@/lib/humanities-questions';
import { MAX_WORDS } from '@/lib/humanities-submit';
import { skillLabel } from '../skills';
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
  const elective = studentElective(account?.prefs);
  const asked = prefill?.subject ?? (s === 'history' ? 'history' : s === 'geography' ? 'geography' : 'social-studies');
  // Only Social Studies and the student's own elective.
  const subject: HumanitiesSubject = asked === 'social-studies' || asked === elective || prefill ? asked : 'social-studies';
  const labels = Object.fromEntries(Object.values(OWN_SKILLS).flat().map(k => [k, skillLabel(k)]));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {full && <Link href={subject === 'social-studies' ? '/app/humanities' : `/app/humanities?s=${subject}`} className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>}
      <div>
        <h1 className="text-xl font-bold text-navy leading-snug">Mark a question</h1>
        <p className="text-sm text-gray-600 mt-1">Send a question you did and your answer. Type them, or send photos.</p>
        <p className="text-[12px] text-gray-500">Combined Humanities: Social Studies and your elective.</p>
      </div>
      <OwnForm initialSubject={subject} elective={prefill && prefill.subject !== 'social-studies' ? prefill.subject as 'geography' | 'history' : elective} prefill={prefill} skills={OWN_SKILLS} labels={labels} maxWords={MAX_WORDS} />
    </div>
  );
}
