// /app/humanities/group/<id> — a question from school with parts, marked part by part (17 Oct 2026,
// lib/humanities-parts.ts): the total first, then each part's card (its mark; tap for its full feedback and sample
// answer), and the parts the student did not answer. Their own answers only.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOwnOpen } from '@/lib/portal-beta';
import { loadHumanitiesFor } from '@/lib/humanities-runs';
import { groupTotal } from '@/lib/humanities-parts';
import { partScore } from '@/lib/humanities-group';
import { AnswerCard } from '../../answer-cards';
import RunPoll from '../../[id]/run-poll';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export default async function HumanitiesGroupPage({ params }: { params: Promise<{ gid: string }> }) {
  if (!(await humanitiesOwnOpen())) redirect('/app');
  const { gid } = await params;
  if (!UUID.test(gid)) notFound();
  const sid = portalIdentity(await currentAccount());
  // Loading the list also settles answers in flight and their exact marks.
  const rows = (await loadHumanitiesFor(sid, 200)).filter(r => r.group_id === gid);
  if (!rows.length) notFound();
  const parts = [...rows].sort((a, b) => (a.own_part?.of.indexOf(a.own_part.label) ?? 0) - (b.own_part?.of.indexOf(b.own_part.label) ?? 0));
  const scores = parts.map(partScore);
  const total = groupTotal(scores);
  const unanswered = parts[0].own_part?.unanswered ?? [];
  const busy = parts.some(r => r.status === 'queued' || r.status === 'marking') || parts.some((r, i) => r.status === 'marked' && scores[i].got == null);

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <RunPoll active={busy} />
      <Link href="/app/humanities/answers" className="text-[12px] text-gray-500 hover:text-navy">‹ Your answers</Link>
      <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">This question, all parts</p>
        <p className="text-2xl font-bold text-navy">{total ? `${total[0]} out of ${total[1]} marks` : busy ? 'Being marked…' : 'See each part below'}</p>
        <p className="text-[13px] text-gray-500">{parts.length} {parts.length === 1 ? 'part' : 'parts'} marked. Tap a part for its feedback and sample answer.</p>
      </div>
      {parts.map(r => (
        <div key={r.id} className="space-y-1">
          <p className="text-[13px] font-semibold text-navy px-1">Part ({r.own_part?.label ?? '?'})</p>
          <AnswerCard row={r} />
        </div>
      ))}
      {unanswered.length > 0 && (
        <p className="text-[13px] text-gray-500 px-1">Not answered: {unanswered.map(l => `(${l})`).join(', ')}.</p>
      )}
    </div>
  );
}
