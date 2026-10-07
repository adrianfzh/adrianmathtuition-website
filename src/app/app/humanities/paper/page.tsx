// /app/humanities/paper — the timed paper's front page (SPEC-HUMANITIES.md §A4,
// 7 Oct 2026): what it is, and Start. The paper offered is the case study and
// the structured-response set the student has done least of.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import { loadHumanitiesFor } from '@/lib/humanities-runs';
import { nextPaper, paperFor, minutesLabel, PAPER_MINUTES } from '@/lib/humanities-paper';

export const dynamic = 'force-dynamic';

export default async function HumanitiesPaperPage() {
  if (!(await humanitiesOpen())) redirect('/app');
  const account = await currentAccount();
  const runs = await loadHumanitiesFor(portalIdentity(account), 500);
  const pick = nextPaper(new Set(runs.map(r => r.question_id)));
  const paper = pick ? paperFor(pick.caseStudyId, pick.structuredId) : null;
  // Papers already handed in, newest first.
  const past = [...new Map(runs.filter(r => r.paper_id).map(r => [r.paper_id as string, r])).values()];

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href="/app/humanities" className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>
      <div>
        <h1 className="text-xl font-bold text-navy leading-tight">Timed paper</h1>
        <p className="text-sm text-gray-600 mt-1">Social Studies · {minutesLabel(PAPER_MINUTES)}</p>
      </div>

      <div className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <ul className="space-y-1.5 text-[15px] text-gray-800">
          <li><b>Section A</b> — one case study, five questions [35]</li>
          <li><b>Section B</b> — structured response, two parts [15]</li>
          <li>The clock starts when you open the paper.</li>
          <li>Your answers are kept on this device until you hand in.</li>
          <li>You get a level for each answer, and what would lift it.</li>
        </ul>
      </div>

      {paper && pick ? (
        <Link href={`/app/humanities/paper/sit?cs=${pick.caseStudyId}&sr=${pick.structuredId}`}
          className="block bg-amber-600 text-white rounded-3xl px-4 py-3.5 text-center font-semibold hover:brightness-105 active:scale-[0.98] transition">
          Start the paper
          <span className="block text-[12px] font-normal opacity-90">{paper.caseStudy.title} · {paper.structured.title}</span>
        </Link>
      ) : <p className="text-sm text-gray-600">No paper is ready yet.</p>}

      {past.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Papers you handed in</h2>
          {past.map(r => (
            <Link key={r.paper_id} href={`/app/humanities/paper/${r.paper_id}`}
              className="flex items-center gap-3 bg-white rounded-3xl px-4 py-3 border border-black/5 shadow-sm hover:border-amber-300 transition">
              <span className="flex-1 text-sm font-semibold text-navy">
                {new Date(r.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}
                {r.paper_minutes ? <span className="font-normal text-gray-500"> · {minutesLabel(r.paper_minutes)}</span> : null}
              </span>
              <span className="shrink-0 text-gray-400">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
