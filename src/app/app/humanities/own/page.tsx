// /app/humanities/own — mark a question from school (15 Oct 2026, lib/humanities-own.ts). The student
// gives the question, its sources if it has any, and their answer — each typed or by photo — and gets the
// same feedback as on our own questions. ?s=<subject> picks the tab; ?again=<run id> refills an earlier one.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import { loadHumanitiesRun } from '@/lib/humanities-runs';
import { OWN_SKILLS, type OwnQuestion } from '@/lib/humanities-own';
import type { HumanitiesSubject } from '@/lib/humanities-questions';
import { MAX_WORDS } from '@/lib/humanities-submit';
import { skillLabel } from '../skills';
import OwnForm from './own-form';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export default async function OwnQuestionPage({ searchParams }: { searchParams: Promise<{ s?: string; again?: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const { s, again } = await searchParams;
  let prefill: OwnQuestion | null = null;
  if (again && UUID.test(again)) {
    const run = await loadHumanitiesRun(again, portalIdentity(await currentAccount()));
    prefill = run?.own_question ?? null;
  }
  const subject: HumanitiesSubject = prefill?.subject ?? (s === 'history' ? 'history' : s === 'geography' ? 'geography' : 'social-studies');
  const labels = Object.fromEntries(Object.values(OWN_SKILLS).flat().map(k => [k, skillLabel(k)]));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href={subject === 'social-studies' ? '/app/humanities' : `/app/humanities?s=${subject}`} className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>
      <div>
        <h1 className="text-xl font-bold text-navy leading-snug">A question from school</h1>
        <p className="text-sm text-gray-600 mt-1">Give us the question and your answer. Type them, or send photos.</p>
      </div>
      <OwnForm initialSubject={subject} prefill={prefill} skills={OWN_SKILLS} labels={labels} maxWords={MAX_WORDS} />
    </div>
  );
}
