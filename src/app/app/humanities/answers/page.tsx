// /app/humanities/answers — every answer the student has handed in, newest first.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import { loadHumanitiesFor } from '@/lib/humanities-runs';
import { AnswerCard } from '../answer-cards';

export const dynamic = 'force-dynamic';

export default async function HumanitiesAnswersPage() {
  if (!(await humanitiesOpen())) redirect('/app');
  const account = await currentAccount();
  const runs = await loadHumanitiesFor(portalIdentity(account), 100);
  return (
    <div className="space-y-3 pb-24 sm:pb-4">
      <h1 className="text-xl font-bold text-navy pt-1">Your answers</h1>
      {runs.length === 0 ? (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm text-sm text-gray-700">
          <p>Nothing handed in yet.</p>
          <Link href="/app/humanities" className="inline-block mt-2 font-semibold text-amber-800">Pick a question ›</Link>
        </div>
      ) : runs.map(r => <AnswerCard key={r.id} row={r} />)}
    </div>
  );
}
