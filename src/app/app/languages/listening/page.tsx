// /app/languages/listening — listening practice on our OWN recordings
// (SPEC-ENGLISH-ORAL-LISTENING.md). Top: "New paper" at three levels (whole Paper 3s made ahead and
// checked — lib/english-listening-papers.ts); then the papers this student has begun; then the
// first paper (the pilot, four recordings).
// Closed: englishListeningOpen() = Adrian's cookie and the preview student.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { englishListeningOpen } from '@/lib/portal-beta';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { listeningLine } from '@/lib/english-listening';
import { LISTENING_LEVELS, paperOfPart } from '@/lib/english-listening-papers';
import { partsDone, papersStarted, readyPapers } from '@/lib/english-listening-store';
import { LISTENING_SETS } from '@/lib/english-speaking-data';
import { STUDY_CARD, StudyHeader } from '../../science/study-bits';

export const dynamic = 'force-dynamic';
const HEAD = 'text-[12px] font-bold uppercase tracking-wide text-violet-700';
const KIND: Record<string, string> = { recount: 'A talk', conversation: 'A conversation', explanation: 'An explanation', information: 'A talk' };

export default async function ListeningListPage() {
  if (!(await englishListeningOpen())) redirect('/app/languages');
  const account = await sessionAccount().catch(() => null);
  const identity = account ? portalIdentity(account) : 'admin';
  const [ready, done] = await Promise.all([readyPapers().catch(() => []), partsDone(identity).catch(() => ({}))]);
  const started = papersStarted(done);
  const levelOf = new Map(ready.map(p => [p.id, p.level]));
  const left = (level: string) => ready.filter(p => p.level === level && !started.has(p.id)).length;
  const mine = [...started].filter(id => levelOf.has(id)).sort().reverse().map(id => {
    const parts = Object.entries(done).filter(([pid]) => paperOfPart(pid) === id);
    return { id, level: LISTENING_LEVELS.find(l => l.level === levelOf.get(id))?.name ?? '', parts: parts.length, right: parts.reduce((n, [, r]) => n + r.right, 0), total: parts.reduce((n, [, r]) => n + r.total, 0) };
  });
  const sections = [
    { key: 'A', title: 'Section A · heard twice', sub: 'Multiple choice, matching and filling in a chart.' },
    { key: 'B', title: 'Section B · heard once', sub: 'Take notes while you listen.' },
  ] as const;
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <StudyHeader tile="bg-violet-600" icon="book" title="Listening" sub="Paper 3 · use earphones if you can" />

      <section className={`${STUDY_CARD} px-4 py-3`} aria-label="New paper">
        <h2 className={HEAD}>New paper</h2>
        <p className="text-[13px] text-gray-500 mt-0.5">A whole Paper 3: three recordings heard twice, one heard once. 30 marks.</p>
        <div className="mt-2 space-y-2">
          {LISTENING_LEVELS.map(l => {
            const n = left(l.level);
            return (
              <Link key={l.level} href={`/app/languages/listening/new?level=${l.level}`} className="flex items-center gap-3 rounded-2xl border border-violet-200 px-3 py-2.5 active:bg-violet-50">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-navy">{l.name}</span>
                  <span className="block text-[12px] text-gray-500">{l.sub}</span>
                </span>
                <span className="shrink-0 text-[12px] text-violet-700 font-semibold">{n > 0 ? `${n} new` : 'Being made'}</span>
                <span className="shrink-0 text-gray-300 text-lg">›</span>
              </Link>
            );
          })}
        </div>
      </section>

      {mine.length > 0 && (
        <section className={`${STUDY_CARD} px-4 py-3`} aria-label="Your papers">
          <h2 className={HEAD}>Your papers</h2>
          <div className="divide-y divide-gray-100 mt-1">
            {mine.map(p => (
              <Link key={p.id} href={`/app/languages/listening/paper/${p.id}`} className="flex items-center gap-3 py-2.5 active:bg-violet-50/60">
                <span className="shrink-0 w-8 h-8 rounded-full bg-violet-100 text-violet-800 text-[15px] flex items-center justify-center" aria-hidden>🎧</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-navy leading-snug">{p.level} paper</span>
                  <span className="block text-[12px] text-gray-500">{p.parts === 4 ? `Done · ${p.right} of ${p.total}` : `${p.parts} of 4 parts done · ${p.right} of ${p.total} so far`}</span>
                </span>
                <span className="shrink-0 text-gray-300 text-lg">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <h2 className={`${HEAD} pt-1`}>The first paper</h2>
      {sections.map(sec => {
        const rows = LISTENING_SETS.filter(s => s.section === sec.key);
        return (
          <section key={sec.key} className={`${STUDY_CARD} px-4 py-3`} aria-label={sec.title}>
            <h3 className={HEAD}>{sec.title}</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">{sec.sub}</p>
            <div className="divide-y divide-gray-100 mt-1">
              {rows.map(s => (
                <Link key={s.id} href={`/app/languages/listening/${s.id}`} className="flex items-center gap-3 py-2.5 active:bg-violet-50/60">
                  <span className="shrink-0 w-8 h-8 rounded-full bg-violet-100 text-violet-800 text-[15px] flex items-center justify-center" aria-hidden>🎧</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-navy leading-snug truncate">{s.title}</span>
                    <span className="block text-[12px] text-gray-500">{KIND[s.textType]} · {listeningLine(s).split(' · ').slice(2).join('')}</span>
                  </span>
                  <span className="shrink-0 text-gray-300 text-lg">›</span>
                </Link>
              ))}
              {rows.length === 0 && <p className="py-3 text-[14px] text-gray-500">Nothing here yet.</p>}
            </div>
          </section>
        );
      })}
      <p className="text-[12px] text-gray-400"><Link href="/app/languages" className="underline underline-offset-2">Back to Languages</Link></p>
    </div>
  );
}
