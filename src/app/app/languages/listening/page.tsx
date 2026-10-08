// /app/languages/listening — listening practice on our OWN recordings
// (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026): Paper 3, Section A and Section B. A list only.
// Closed: englishListeningOpen() = Adrian's cookie and the preview student.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { englishListeningOpen } from '@/lib/portal-beta';
import { listeningLine } from '@/lib/english-listening';
import { LISTENING_SETS } from '@/lib/english-speaking-data';
import { STUDY_CARD, StudyHeader } from '../../science/study-bits';

export const dynamic = 'force-dynamic';
const HEAD = 'text-[12px] font-bold uppercase tracking-wide text-violet-700';
const KIND: Record<string, string> = { recount: 'A talk', conversation: 'A conversation', explanation: 'An explanation', information: 'A talk' };

export default async function ListeningListPage() {
  if (!(await englishListeningOpen())) redirect('/app/languages');
  const sections = [
    { key: 'A', title: 'Section A · heard twice', sub: 'Multiple choice, matching and filling in a chart.' },
    { key: 'B', title: 'Section B · heard once', sub: 'Take notes while you listen.' },
  ] as const;
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <StudyHeader tile="bg-violet-600" icon="book" title="Listening" sub="Paper 3 · use earphones if you can" />
      {sections.map(sec => {
        const rows = LISTENING_SETS.filter(s => s.section === sec.key);
        return (
          <section key={sec.key} className={`${STUDY_CARD} px-4 py-3`} aria-label={sec.title}>
            <h2 className={HEAD}>{sec.title}</h2>
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
