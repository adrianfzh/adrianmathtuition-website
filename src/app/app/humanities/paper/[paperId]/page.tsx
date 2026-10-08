// /app/humanities/paper/<paper id> — a handed-in timed paper: each part with its
// level and a way into its feedback (SPEC-HUMANITIES.md §A4). A level per answer,
// never a mark out of 50. A student sees only their own paper.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { loadHumanitiesPaper } from '@/lib/humanities-runs';
import { questionById, caseStudies, isStructured } from '@/lib/humanities-questions';
import { paperFor, minutesLabel } from '@/lib/humanities-paper';
import { levelLabel } from '@/lib/humanities-report';
import RunPoll from '../../[id]/run-poll';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export default async function HumanitiesPaperResultPage({ params }: { params: Promise<{ paperId: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const { paperId } = await params;
  if (!UUID.test(paperId)) notFound();
  const admin = (await isNotesAuthed()) && !(await viewingAsStudent());
  const account = await currentAccount();
  const runs = await loadHumanitiesPaper(paperId, admin ? { admin: true } : portalIdentity(account));
  if (!runs.length) notFound();

  // Which paper it was: read off the questions handed in.
  const sets = runs.map(r => questionById(r.question_id)?.set).filter(Boolean);
  const cs = sets.find(s => s!.kind === 'source') ?? caseStudies()[0];
  const sr = sets.find(s => s!.kind === 'structured');
  const paper = paperFor(cs!.id, sr?.id ?? 'r01');
  if (!paper) notFound();
  const byQ = new Map(runs.map(r => [r.question_id, r]));
  const inFlight = runs.some(r => r.status === 'queued' || r.status === 'marking');
  const minutes = runs[0].paper_minutes;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <RunPoll active={inFlight} />
      <Link href="/app/humanities/paper" className="text-[12px] text-gray-500 hover:text-navy">‹ Timed paper</Link>
      <div>
        <p className="text-[12px] font-semibold text-amber-800">Timed paper{minutes ? ` · ${minutesLabel(minutes)}` : ''}</p>
        <h1 className="text-xl font-bold text-navy leading-snug">{paper.caseStudy.title}</h1>
      </div>
      {inFlight && <p className="text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">Your answers are being read. They fill in here over the next few minutes.</p>}

      {(['A', 'B'] as const).map(sec => (
        <div key={sec} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{sec === 'A' ? 'Section A · Case study' : 'Section B · Structured response'}</h2>
          {paper.parts.filter(p => p.section === sec && (sec === 'A' || sr)).map(p => {
            const r = byQ.get(p.question.id);
            const read = r && (r.status === 'marked' || r.status === 'held') && r.level_lo && r.level_hi && r.levels_max;
            const state = !r ? 'Not answered'
              : read ? levelLabel(r.level_lo!, r.level_hi!, r.levels_max!)
              : r.status === 'failed' ? 'Not read — hand it in again' : 'Being read…';
            const body = (
              <>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-navy"><b className="text-amber-800">{p.label}</b> {p.question.question} <span className="text-gray-500">[{p.marks}]</span></span>
                  <span className={`block text-[13px] font-semibold mt-1 ${read ? 'text-amber-800' : 'text-gray-500'}`}>{state}</span>
                </span>
                {r && <span className="shrink-0 text-gray-400">›</span>}
              </>
            );
            return r
              ? <Link key={p.question.id} href={`/app/humanities/${r.id}`} className="flex items-center gap-3 bg-white rounded-3xl px-4 py-3 border border-black/5 shadow-sm hover:border-amber-300 transition">{body}</Link>
              : <div key={p.question.id} className="flex items-center gap-3 bg-white/60 rounded-3xl px-4 py-3 border border-black/5">{body}</div>;
          })}
          {sec === 'B' && !sr && <p className="text-[13px] text-gray-500 px-1">Not answered</p>}
        </div>
      ))}
      {!inFlight && <p className="text-[12px] text-gray-500 px-1">Tap a question to see what would lift that answer.</p>}
    </div>
  );
}
