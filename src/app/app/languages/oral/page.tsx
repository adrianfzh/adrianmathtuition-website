// /app/languages/oral — oral practice, Paper 4 (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026):
// a picture and a prompt to speak on (Part 1), then prompts to discuss aloud (Part 2). A list,
// and the student's latest feedback. Closed: englishOralOpen() / englishOralInteractionOpen().
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { englishOralInteractionOpen, englishOralOpen } from '@/lib/portal-beta';
import { bandShown, partLabel } from '@/lib/english-oral';
import { ORAL_SETS, oralById } from '@/lib/english-speaking-data';
import { latestAttempts, settle } from '@/lib/english-oral-store';
import { STUDY_CARD, StudyHeader } from '../../science/study-bits';

export const dynamic = 'force-dynamic';
const HEAD = 'text-[12px] font-bold uppercase tracking-wide text-violet-700';
const day = (iso: string): string => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
const BTN = 'flex-1 text-center rounded-xl border border-violet-600 text-violet-700 text-[13px] font-semibold px-3 py-2 active:bg-violet-50';

export default async function OralListPage() {
  const [planned, interaction] = await Promise.all([englishOralOpen(), englishOralInteractionOpen()]);
  if (!planned && !interaction) redirect('/app/languages');
  const account = await sessionAccount().catch(() => null);
  const identity = account ? portalIdentity(account) : 'admin';
  const past = await Promise.all((await latestAttempts(identity, 8).catch(() => [])).map(a => settle(a).catch(() => a)));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <StudyHeader tile="bg-violet-600" icon="book" title="Oral" sub="Paper 4 · find a quiet place to speak" />

      {ORAL_SETS.map(s => (
        <section key={s.id} className={`${STUDY_CARD} overflow-hidden`} aria-label={s.title}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.picture} alt={s.scene} className="w-full h-36 object-cover" />
          <div className="px-4 py-3 space-y-2.5">
            <h2 className="text-[16px] font-bold text-navy leading-tight">{s.title}</h2>
            <div className="flex gap-2">
              {planned && <Link href={`/app/languages/oral/${s.id}?part=planned`} className={BTN}>Part 1 · Planned response</Link>}
              {interaction && <Link href={`/app/languages/oral/${s.id}?part=interaction`} className={BTN}>Part 2 · Spoken interaction</Link>}
            </div>
          </div>
        </section>
      ))}

      {past.length > 0 && (
        <section className={`${STUDY_CARD} px-4 py-3`} aria-label="Your feedback">
          <h2 className={HEAD}>Your feedback</h2>
          <div className="divide-y divide-gray-100 mt-1">
            {past.map(a => {
              const band = a.status === 'done' && a.report ? bandShown(a.part, a.report.band) : null;
              return (
                <Link key={a.id} href={`/app/languages/oral/${a.set_id}?part=${a.part}&attempt=${a.id}`} className="flex items-center gap-3 py-2.5 active:bg-violet-50/60">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-navy leading-snug truncate">{oralById(a.set_id)?.title ?? 'Oral practice'}</span>
                    <span className="block text-[12px] text-gray-500">{partLabel(a.part)} · {day(a.created_at)}</span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-violet-700">{band ? band.line.replace('Response: ', '') : a.status === 'failed' ? 'Could not be read' : 'Being read…'}</span>
                  <span className="shrink-0 text-gray-300 text-lg">›</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      <p className="text-[12px] text-gray-400"><Link href="/app/languages" className="underline underline-offset-2">Back to Languages</Link></p>
    </div>
  );
}
