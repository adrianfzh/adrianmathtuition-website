// /app/science/qa — qualitative analysis flashcards (24 Sep 2026, the chemistry
// study loop): the SEAB 6092 tests for cations, anions and gases, in the
// scheme's own words, as a tap-to-flip drill. Behind the Science tab's own gate
// (scienceMarkingOpen), no switch of its own; the door is a row on the
// Chemistry tab of Science Home. Data + deck rules: lib/qa-cards.ts.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { QA_FLASHCARDS_OPEN_TO_STUDENTS, scienceMarkingOpen, viewingAsStudent } from '@/lib/portal-beta';
import { QA_CARDS } from '@/lib/qa-cards';
import PortalIcon from '@/components/PortalIcon';
import QaDrill from './qa-drill';

export const dynamic = 'force-dynamic';

export default async function ScienceQaPage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  // Admin only until Adrian opens it (25 Sep 2026).
  const isAdmin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value) && !(await viewingAsStudent());
  if (!QA_FLASHCARDS_OPEN_TO_STUDENTS && !isAdmin) redirect('/app/science');
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className="flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 bg-purple-600 text-white">
          <PortalIcon name="flask" className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-navy leading-tight">Qualitative analysis</h1>
          <p className="text-[12px] text-gray-500">Cation, anion and gas tests — the words the scheme wants</p>
        </div>
      </div>
      <QaDrill cards={QA_CARDS} />
      <p className="text-[12px] text-gray-400">
        From the O-Level Chemistry (6092) notes for qualitative analysis. <Link href="/app/science" className="underline underline-offset-2">Back to Science</Link>
      </p>
    </div>
  );
}
