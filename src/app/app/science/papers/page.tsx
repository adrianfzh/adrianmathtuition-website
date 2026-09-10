// /app/science/papers — every science paper the student has had marked.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { scienceMarkingOpen } from '@/lib/portal-beta';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { loadSciencePapers, SciencePaperCard, SciencePendingList, ScienceEstimateNote } from '../science-papers';

export const dynamic = 'force-dynamic';

const M = SURFACES.marking;

export default async function SciencePapersPage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const { papers, pending } = await loadSciencePapers(sid, account?.display_name ?? null);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${M.tile}`}>
          <PortalIcon name={M.icon} className="w-5 h-5" />
        </span>
        <h1 className="text-xl font-bold text-navy">Science papers</h1>
      </div>
      <SciencePendingList pending={pending} />
      {papers.length === 0 ? (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
          <p className="text-sm text-gray-600">
            Nothing marked yet. <Link href="/app/science/submit" className="font-semibold text-navy hover:underline">Hand in a science paper</Link> and it comes back here.
          </p>
        </div>
      ) : (
        <>
          {papers.map(p => <SciencePaperCard key={p.id} paper={p} />)}
          <ScienceEstimateNote />
        </>
      )}
    </div>
  );
}
