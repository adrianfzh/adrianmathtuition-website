// /app/humanities/practice?s=<subject>&skill=<skill> — practice by skill
// (SPEC-HUMANITIES.md §D, 7 Oct 2026): five questions of one skill, taken across
// sets, the ones not yet answered first. Behind humanitiesOpen().
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import { loadHumanitiesFor } from '@/lib/humanities-runs';
import { schemeFor, SUBJECT_NAME, type HumanitiesSubject } from '@/lib/humanities-questions';
import { practiceRun, questionsOf, skillsOf } from '@/lib/humanities-practice';
import { skillLabel } from '../skills';

export const dynamic = 'force-dynamic';

export default async function HumanitiesPracticePage({ searchParams }: { searchParams: Promise<{ s?: string; skill?: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const sp = await searchParams;
  const subject: HumanitiesSubject = sp.s === 'history' ? 'history' : sp.s === 'geography' ? 'geography' : 'social-studies';
  const skill = String(sp.skill ?? '');
  if (!skillsOf(subject).includes(skill)) notFound();
  const account = await currentAccount();
  const runs = await loadHumanitiesFor(portalIdentity(account), 500);
  const answered = new Set(runs.map(r => r.question_id));
  const run = practiceRun(subject, skill, answered);
  const all = questionsOf(subject, skill);
  const done = all.filter(c => answered.has(c.question.id)).length;
  const scheme = schemeFor(skill);
  const home = subject === 'social-studies' ? '/app/humanities' : `/app/humanities?s=${subject}`;
  const next = run.find(c => !answered.has(c.question.id));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href={home} className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>
      <div>
        <p className="text-[12px] font-semibold text-amber-800">{SUBJECT_NAME[subject]} · Practise a skill</p>
        <h1 className="text-xl font-bold text-navy leading-tight">{skillLabel(skill)}</h1>
        <p className="text-sm text-gray-600 mt-1">{done} of {all.length} done</p>
      </div>

      {scheme && scheme.levels.length > 0 && (
        <details className="group bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <summary className="flex items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="flex-1 text-sm font-bold text-navy">What each level does</span>
            <span className="shrink-0 text-gray-400 transition group-open:rotate-90">›</span>
          </summary>
          <ol className="mt-2 space-y-1.5">
            {scheme.levels.map(l => (
              <li key={l.level} className="flex gap-2.5 text-sm">
                <span className="shrink-0 font-bold text-amber-800">L{l.level}</span>
                <span className="text-gray-700">{l.does}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {next && (
        <Link href={`/app/humanities/q/${next.question.id}`} className="block bg-amber-600 text-white rounded-3xl px-4 py-3.5 text-center font-semibold hover:brightness-105 active:scale-[0.98] transition">
          Start the next one
        </Link>
      )}

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your next {run.length}</h2>
        {run.map((c, i) => (
          <Link key={c.question.id} href={`/app/humanities/q/${c.question.id}`}
            className="flex items-center gap-3 bg-white rounded-3xl px-4 py-3 border border-black/5 shadow-sm hover:border-amber-300 active:scale-[0.99] transition">
            <span className="shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-semibold text-amber-800">{c.set.title}</span>
              <span className="block text-sm text-navy line-clamp-3">{c.question.question}{c.question.marks ? <span className="text-gray-500"> [{c.question.marks}]</span> : null}</span>
            </span>
            {answered.has(c.question.id) && <span className="shrink-0 text-[11px] text-emerald-700 font-semibold">Done</span>}
            <span className="shrink-0 text-gray-400">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
