// /app/languages/essays — every essay the student handed in, newest first.
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { essayMarkingOpen } from '@/lib/portal-beta';
import { loadEssaysFor } from '@/lib/essay-runs';
import { EssayCard, EssayDisclaimer } from '../essay-cards';

export const dynamic = 'force-dynamic';

export default async function EssaysListPage() {
  if (!(await essayMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const essays = await loadEssaysFor(portalIdentity(account), 200);
  return (
    <div className="space-y-3 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy leading-tight">Your essays</h1>
        <p className="text-[12px] text-gray-500">{essays.length} handed in</p>
      </div>
      {essays.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white rounded-3xl p-5 border border-black/5 shadow-sm">Nothing yet — hand in your first essay from Home.</p>
      ) : essays.map(e => <EssayCard key={e.id} row={e} />)}
      {essays.length > 0 && <EssayDisclaimer />}
    </div>
  );
}
