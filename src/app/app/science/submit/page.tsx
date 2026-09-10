// /app/science/submit — hand in a physics / chemistry / biology paper
// (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026). The same phone-first form
// as the maths hand-in, in its science shape: the subject is required, the
// disclaimer sits above the photos, the school's mark scheme may ride along,
// and the science slot (one a day) is checked here before any photographing.
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scienceMarkingOpen } from '@/lib/portal-beta';
import { DAILY_SCIENCE_SUBMIT_CAP, countHandinsToday } from '@/lib/portal-submit-limit';
import type { HandinCountingClient } from '@/lib/portal-submit-limit';
import { SCIENCE_MARK_SUBJECTS } from '@/lib/mark-subject-for-student';
import SubmitClient from '../../submit/submit-client';

export const dynamic = 'force-dynamic';

export default async function ScienceSubmitPage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  // Preflight of the science slot — the POST re-checks it.
  let slotUsed = false;
  try {
    const count = await countHandinsToday(getSupabaseAdmin() as unknown as HandinCountingClient, sid, new Date(), 'science');
    slotUsed = count >= DAILY_SCIENCE_SUBMIT_CAP;
  } catch { /* degrade to the POST-time check */ }
  return <SubmitClient family="science" slotUsed={slotUsed} subjectChoices={[...SCIENCE_MARK_SUBJECTS]} />;
}
