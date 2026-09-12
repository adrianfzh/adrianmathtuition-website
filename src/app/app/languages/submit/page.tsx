// /app/languages/submit — hand in an essay (SPEC-ESSAY-MARKING.md, E1: typed text).
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { essayMarkingOpen } from '@/lib/portal-beta';
import { ESSAY_KINDS } from '@/lib/essay-rubric';
import { countEssaysToday } from '@/lib/essay-runs';
import { sgtDayStartISO } from '@/lib/sgt';
import { DAILY_ESSAY_CAP } from '@/lib/essay-submit';
import EssayForm from './essay-form';
import { EssayDisclaimer } from '../essay-cards';

export const dynamic = 'force-dynamic';

export default async function EssaySubmitPage() {
  if (!(await essayMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  let slotUsed = false;
  try { slotUsed = (await countEssaysToday(sid, sgtDayStartISO())) >= DAILY_ESSAY_CAP; } catch { /* the POST re-checks */ }
  const kinds = Object.entries(ESSAY_KINDS).map(([key, v]) => ({ key, ...v }));
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy leading-tight">Hand in an essay</h1>
        <p className="text-[12px] text-gray-500">English · O-Level Paper 1 writing</p>
      </div>
      <EssayForm kinds={kinds} slotUsed={slotUsed} />
      <EssayDisclaimer />
    </div>
  );
}
