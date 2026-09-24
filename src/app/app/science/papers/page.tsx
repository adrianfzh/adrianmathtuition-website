// /app/science/papers — every science paper the student has had marked, one
// tab per science (24 Sep 2026), like the maths Papers tab.
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { scienceMarkingOpen } from '@/lib/portal-beta';
import { studentSciences } from '@/lib/portal-prefs';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { loadSciencePapers, ScienceTabs } from '../science-papers';

export const dynamic = 'force-dynamic';

const M = SURFACES.marking;

export default async function SciencePapersPage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const choice = studentSciences(account?.prefs);
  if (!choice) redirect('/app/science');
  const { papers, pending } = await loadSciencePapers(sid, account?.display_name ?? null);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${M.tile}`}>
          <PortalIcon name={M.icon} className="w-5 h-5" />
        </span>
        <h1 className="text-xl font-bold text-navy">Science papers</h1>
      </div>
      <ScienceTabs papers={papers} pending={pending} subjects={choice.subjects} />
    </div>
  );
}
