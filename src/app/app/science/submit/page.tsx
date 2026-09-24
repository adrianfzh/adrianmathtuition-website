// /app/science/submit — hand in a physics / chemistry / biology paper
// (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026). The same phone-first form
// as the maths hand-in, in its science shape: the subject is required, the
// disclaimer sits above the photos, the answers or mark scheme may ride along
// (the maths form has the same slot since 24 Sep 2026; a student's attachment
// grounds that run only), and the science slot (two a day) is checked here
// before any photographing.
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scienceMarkingOpen } from '@/lib/portal-beta';
import { DAILY_SCIENCE_SUBMIT_CAP } from '@/lib/portal-submit-limit';
import { scienceQueuePlacement } from '@/lib/science-queue-store';
import { dayWord } from '@/lib/daily-queue';
import { sgtTodayISO } from '@/lib/sgt';
import { SCIENCE_MARK_SUBJECTS } from '@/lib/mark-subject-for-student';
import { studentSciences } from '@/lib/portal-prefs';
import SubmitClient from '../../submit/submit-client';

export const dynamic = 'force-dynamic';

export default async function ScienceSubmitPage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  // The subject list is the sciences this student takes (24 Sep 2026); all
  // three until they have chosen. The route accepts any of the three.
  const choice = studentSciences(account?.prefs);
  // Preflight of the science slot — the POST re-checks it.
  // The waiting list (SPEC-PRACTICE-PHOTO §14): past today's allowance the
  // form still opens — the notice says which day the paper is queued for;
  // only a full horizon (three days) blocks it. The route decides again.
  let queueNotice: { blocking: boolean; text: string } | null = null;
  if (DAILY_SCIENCE_SUBMIT_CAP !== null) {
    try {
      const place = await scienceQueuePlacement(getSupabaseAdmin(), sid, DAILY_SCIENCE_SUBMIT_CAP, new Date());
      if (!place.ok) queueNotice = { blocking: true, text: place.message };
      else if (place.waits) queueNotice = { blocking: false, text: `Today’s science hand-ins are used — this paper will be queued for ${dayWord(place.day, sgtTodayISO())} and go for marking at midnight. You can remove it from Science › Papers until then.` };
    } catch { /* never block the page on a read — the route checks again */ }
  }
  return <SubmitClient family="science" queueNotice={queueNotice} subjectChoices={choice ? [...choice.subjects] : [...SCIENCE_MARK_SUBJECTS]} />;
}
