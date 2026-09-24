// The Science tab's Home (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026),
// shaped like the maths Papers tab (Adrian, 24 Sep 2026: "just follow the
// math interface"): the header, the "Hand in a science paper" card into
// /app/science/submit, then one tab per science — Physics | Chemistry |
// Biology — each with its pending hand-ins and its three newest marked papers.
// A student who has not yet said which sciences they take sees the picker
// first (science-picker.tsx); "Change" (?choose=1) brings it back.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { scienceMarkingOpen } from '@/lib/portal-beta';
import { scienceChoiceLabel, studentSciences } from '@/lib/portal-prefs';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { loadSciencePapers, QaDoor, ScienceTabs } from './science-papers';
import SciencePicker from './science-picker';

export const dynamic = 'force-dynamic';

const S = SURFACES.submit;
const SC = SURFACES.science;
const HOME_LIMIT = 3;

export default async function ScienceHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const choice = studentSciences(account?.prefs);
  const sp = await searchParams;
  const choosing = !choice || sp?.choose === '1';
  const { papers, pending } = choosing ? { papers: [], pending: [] } : await loadSciencePapers(sid, account?.display_name ?? null);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${SC.tile}`}>
          <PortalIcon name={SC.icon} className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-navy leading-tight">Science</h1>
          {choice && !choosing ? (
            <p className="text-[12px] text-gray-500">
              {scienceChoiceLabel(choice)}
              <Link href="/app/science?choose=1" className="ml-2 font-semibold text-navy hover:underline">Change</Link>
            </p>
          ) : (
            <p className="text-[12px] text-gray-500">Physics · Chemistry · Biology — marking, free while it&apos;s new</p>
          )}
        </div>
      </div>

      {choosing ? (
        <SciencePicker initial={choice} firstTime={!choice} />
      ) : (
        <>
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

          <ScienceTabs papers={papers} pending={pending} subjects={choice!.subjects} limit={HOME_LIMIT} panelExtras={{ chemistry: <QaDoor /> }} />
        </>
      )}
    </div>
  );
}
