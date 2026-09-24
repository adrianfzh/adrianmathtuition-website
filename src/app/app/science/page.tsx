// 🧪 The Science tab's Home (SPEC-SCIENCE-MARKING.md, Decision 10 Sep 2026).
// 24 Sep 2026 (Adrian: "just allow the upload at this page will do. Simple …
// no need for another page"): the hand-in form sits right here under the
// title — no separate /app/science/submit, no notice box, one line of
// disclaimer. Under the form: the papers still waiting or being marked, then
// the last few marked ones.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scienceMarkingOpen } from '@/lib/portal-beta';
import { DAILY_SCIENCE_SUBMIT_CAP } from '@/lib/portal-submit-limit';
import { scienceQueuePlacement } from '@/lib/science-queue-store';
import { dayWord } from '@/lib/daily-queue';
import { sgtTodayISO } from '@/lib/sgt';
import { SCIENCE_MARK_SUBJECTS } from '@/lib/mark-subject-for-student';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { loadSciencePapers, SciencePaperCard, SciencePendingList, ScienceEstimateNote } from './science-papers';
import SubmitClient from '../submit/submit-client';

export const dynamic = 'force-dynamic';

const SC = SURFACES.science;
const HOME_LIMIT = 3;

export default async function SciencePage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const { papers, pending } = await loadSciencePapers(sid, account?.display_name ?? null);

  // The waiting list (SPEC-PRACTICE-PHOTO §14): past today's allowance the
  // form still opens — one line says which day the paper is queued for; only
  // a full horizon (three days) replaces the form. The route decides again.
  let queueNotice: { blocking: boolean; text: string } | null = null;
  if (DAILY_SCIENCE_SUBMIT_CAP !== null) {
    try {
      const place = await scienceQueuePlacement(getSupabaseAdmin(), sid, DAILY_SCIENCE_SUBMIT_CAP, new Date());
      if (!place.ok) queueNotice = { blocking: true, text: place.message };
      else if (place.waits) queueNotice = { blocking: false, text: `Today’s two science papers are used — this one is queued for ${dayWord(place.day, sgtTodayISO())} and goes for marking at midnight.` };
    } catch { /* never block the page on a read — the route checks again */ }
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${SC.tile}`}>
          <PortalIcon name={SC.icon} className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">Science</h1>
          {/* The whole disclaimer, in one line (Adrian, 24 Sep 2026: "so many words it's scary"). */}
          <p className="text-[12px] text-gray-500">Physics · Chemistry · Biology — free while it&apos;s new. Two papers a day; the marks are an estimate.</p>
        </div>
      </div>

      <SubmitClient family="science" embedded queueNotice={queueNotice} subjectChoices={[...SCIENCE_MARK_SUBJECTS]} />

      <SciencePendingList pending={pending} />

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
    </div>
  );
}
