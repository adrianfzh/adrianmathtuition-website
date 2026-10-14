// /app/languages/listening/new?level=easier|standard|harder — "New paper": the oldest ready paper at
// the level this student has not started (lib/english-listening-store nextPaperFor). Papers are made
// ahead, never here; when the student is the keenest at the level, the worker's one-minute look
// sees the pile is low and makes the next one (listeningStock). SPEC-ENGLISH-ORAL-LISTENING.md §More papers.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { englishListeningOpen } from '@/lib/portal-beta';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { isListeningLevel, LISTENING_LEVELS } from '@/lib/english-listening-papers';
import { nextPaperFor } from '@/lib/english-listening-store';
import { STUDY_CARD } from '../../../science/study-bits';

export const dynamic = 'force-dynamic';

export default async function NewPaperPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  if (!(await englishListeningOpen())) redirect('/app/languages');
  const { level } = await searchParams;
  if (!isListeningLevel(level)) redirect('/app/languages/listening');
  const account = await sessionAccount().catch(() => null);
  const next = await nextPaperFor(account ? portalIdentity(account) : 'admin', level).catch(() => ({ id: null, left: 0, total: 0 }));
  if (next.id) redirect(`/app/languages/listening/paper/${next.id}`);
  const name = LISTENING_LEVELS.find(l => l.level === level)!.name;
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/languages/listening" className="text-xs text-gray-500">‹ Listening</Link>
        <h1 className="text-xl font-bold text-navy mt-1 leading-tight">{name} papers</h1>
      </div>
      <div className={`${STUDY_CARD} p-4 space-y-1`}>
        <p className="text-[15px] font-semibold text-navy">{next.total ? `You have done every ${name} paper.` : `The first ${name} papers are being made.`}</p>
        <p className="text-[14px] text-gray-600">A new one is being made now. Come back later today, or try another level.</p>
      </div>
      <Link href="/app/languages/listening" className="block text-center w-full rounded-xl border border-violet-600 text-violet-700 text-sm font-semibold px-4 py-3">Back to Listening</Link>
    </div>
  );
}
