// /app/science — the Science tab's Home (SPEC-SCIENCE-MARKING.md §Decision
// 10 Sep 2026: "two tabs (math, then science) at the top … for the science
// tab, just put marking functionality first"). Hand in first, then what is
// being marked, then the latest marked papers. Students only see their own
// runs; the flag in lib/portal-beta shuts the whole tab.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { scienceMarkingOpen } from '@/lib/portal-beta';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { loadSciencePapers, SciencePaperCard, SciencePendingList, ScienceEstimateNote } from './science-papers';

export const dynamic = 'force-dynamic';

const S = SURFACES.submit;
const SC = SURFACES.science;
const HOME_LIMIT = 3;

export default async function SciencePage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const { papers, pending } = await loadSciencePapers(sid, account?.display_name ?? null);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${SC.tile}`}>
          <PortalIcon name={SC.icon} className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">Science</h1>
          <p className="text-[12px] text-gray-500">Physics · Chemistry · Biology — marking, free while it&apos;s new</p>
        </div>
      </div>

      <Link
        href="/app/science/submit"
        className="flex items-center gap-3 bg-teal-500 text-white rounded-3xl px-4 py-3.5 font-semibold shadow-[0_8px_24px_-10px_rgba(20,184,166,0.8)] hover:brightness-105 active:scale-[0.98] transition"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-2xl bg-white/25 shrink-0" aria-hidden>
          <PortalIcon name={S.icon} className="w-5 h-5" />
        </span>
        <span className="flex-1">Hand in a science paper</span>
        <span className="shrink-0 text-white/80 text-lg">›</span>
      </Link>

      <SciencePendingList pending={pending} />

      {papers.length === 0 && pending.length === 0 ? (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-2">
          <p className="text-sm text-gray-700">
            Finished a physics, chemistry or biology paper? <b>Photograph it and hand it in</b> — it comes back
            marked here, with the red pen on your pages and where each mark went.
          </p>
          <p className="text-[13px] text-gray-500">
            Science marking is new and free. Calculations are checked properly; explain answers are marked against
            standard syllabus points unless you attach your school&apos;s mark scheme. Treat the marks as an estimate and
            compare with your teacher&apos;s when you get the paper back.
          </p>
        </div>
      ) : (
        <>
          {papers.length > 0 && (
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Marked papers</h2>
              {papers.length > HOME_LIMIT && (
                <Link href="/app/science/papers" className="text-[12px] font-semibold text-navy hover:underline">All {papers.length} ›</Link>
              )}
            </div>
          )}
          {papers.slice(0, HOME_LIMIT).map(p => <SciencePaperCard key={p.id} paper={p} />)}
          {papers.length > 0 && <ScienceEstimateNote />}
        </>
      )}
    </div>
  );
}
