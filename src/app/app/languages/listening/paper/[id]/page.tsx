// /app/languages/listening/paper/<lp001> — one whole paper: its four parts in order, each with the
// student's marks once done. A part opens /app/languages/listening/<lp001-1>.
// SPEC-ENGLISH-ORAL-LISTENING.md §More papers.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { englishListeningOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { listeningMarks, playsAllowed } from '@/lib/english-listening';
import { LISTENING_LEVELS } from '@/lib/english-listening-papers';
import { loadPaperRow, partsDone } from '@/lib/english-listening-store';
import { STUDY_CARD } from '../../../../science/study-bits';

export const dynamic = 'force-dynamic';
const KIND: Record<string, string> = { recount: 'A talk', conversation: 'A conversation', explanation: 'An explanation', information: 'A talk' };

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await englishListeningOpen())) redirect('/app/languages');
  const { id } = await params;
  const admin = !(await viewingAsStudent()) && (await isNotesAuthed());
  const row = await loadPaperRow(id).catch(() => null);
  if (!row || !(row.status === 'ready' || (admin && row.status !== 'rejected'))) redirect('/app/languages/listening');
  const account = await sessionAccount().catch(() => null);
  const done = await partsDone(account ? portalIdentity(account) : 'admin').catch(() => ({} as Record<string, { right: number; total: number }>));
  const level = LISTENING_LEVELS.find(l => l.level === row.level)!;
  const got = row.paper.parts.filter(s => done[s.id]);
  const nextUp = row.paper.parts.find(s => !done[s.id]);
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/languages/listening" className="text-xs text-gray-500">‹ Listening</Link>
        <h1 className="text-xl font-bold text-navy mt-1 leading-tight">{level.name} paper</h1>
        <p className="text-[12px] text-gray-500">{level.sub} · 4 parts · 30 marks{row.status !== 'ready' ? ` · ${row.status} (only you see this)` : ''}</p>
      </div>
      {got.length > 0 && (
        <div className={`${STUDY_CARD} p-4`}>
          <p className="text-[18px] font-bold text-navy">{got.reduce((n, s) => n + done[s.id].right, 0)} of {got.reduce((n, s) => n + done[s.id].total, 0)} marks</p>
          <p className="text-[13px] text-gray-600 mt-0.5">{got.length === 4 ? 'The whole paper is done.' : `${got.length} of 4 parts done.`}</p>
        </div>
      )}
      <section className={`${STUDY_CARD} px-4 py-2`} aria-label="The parts">
        <div className="divide-y divide-gray-100">
          {row.paper.parts.map((s, i) => {
            const d = done[s.id];
            return (
              <Link key={s.id} href={`/app/languages/listening/${s.id}`} className="flex items-center gap-3 py-3 active:bg-violet-50/60">
                <span className={`shrink-0 w-8 h-8 rounded-full text-[14px] font-bold flex items-center justify-center ${d ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'}`} aria-hidden>{d ? '✓' : i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-navy leading-snug truncate">{s.title}</span>
                  <span className="block text-[12px] text-gray-500">{KIND[s.textType]} · Section {s.section} · heard {playsAllowed(s) === 2 ? 'twice' : 'once'} · {d ? `${d.right} of ${d.total}` : `${listeningMarks(s)} marks`}</span>
                </span>
                <span className="shrink-0 text-gray-300 text-lg">›</span>
              </Link>
            );
          })}
        </div>
      </section>
      {nextUp && <Link href={`/app/languages/listening/${nextUp.id}`} className="block text-center w-full rounded-xl bg-violet-600 text-white text-sm font-semibold px-4 py-3">{got.length ? 'Carry on' : 'Start part 1'}</Link>}
      {!nextUp && <Link href={`/app/languages/listening/new?level=${row.level}`} className="block text-center w-full rounded-xl bg-violet-600 text-white text-sm font-semibold px-4 py-3">New {level.name} paper</Link>}
    </div>
  );
}
