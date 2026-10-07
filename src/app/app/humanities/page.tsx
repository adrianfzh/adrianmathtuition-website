// /app/humanities — the Humanities family's Home (SPEC-HUMANITIES.md, H1, 2 Oct
// 2026; H2, 3 Oct 2026: a tab per subject — Social Studies (source-based +
// structured response) and History (source-based)). Our own questions: pick
// one, type the answer, get a level range and the one lift. The door is
// humanitiesOpen(): the demo student and Adrian while the switch is closed.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { setsFor, isCaseStudy, questionsBySkill, SS_THEMES, SS_THEME_NAME, GEO_CLUSTERS, type HumanitiesSet, type HumanitiesSubject } from '@/lib/humanities-questions';
import { skillPicture, skillLineText } from '@/lib/humanities-skills';
import { loadHumanitiesFor } from '@/lib/humanities-runs';
import { AnswerCard } from './answer-cards';
import { skillLabel } from './skills';

export const dynamic = 'force-dynamic';

const H = SURFACES.humanities;
const HOME_LIMIT = 3;

const TABS: { key: HumanitiesSubject; label: string }[] = [
  { key: 'social-studies', label: 'Social Studies' },
  { key: 'history', label: 'History' },
  { key: 'geography', label: 'Geography' },
];

export default async function HumanitiesPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const s = (await searchParams).s;
  const subject: HumanitiesSubject = s === 'history' ? 'history' : s === 'geography' ? 'geography' : 'social-studies';
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const runs = await loadHumanitiesFor(sid, 500);
  const answered = new Set(runs.map(r => r.question_id));
  const allSource = setsFor(subject, 'source');
  const caseStudies = allSource.filter(isCaseStudy);
  const sourceSets = allSource.filter(s => !isCaseStudy(s));
  // The skill picture (A2): this subject's read answers, weakest skill first.
  // Geography is point-marked, not levelled: its picture comes with practice by skill (D).
  const skills = subject === 'geography' ? [] : skillPicture(runs.filter(r => r.subject === subject));
  const pointSets = setsFor(subject, 'points');
  const nextOf = (skill: string) => questionsBySkill(skill).find(c => c.set.subject === subject && !answered.has(c.question.id))?.question.id;
  const structuredSets = setsFor(subject, 'structured');
  // One issue open at a time: the first with a question still to do. Ten open cards was a very long page.
  const sets = [...caseStudies, ...sourceSets, ...structuredSets, ...pointSets];
  const openId = (sets.find(set => set.questions.some(q => !answered.has(q.id))) ?? sets[0])?.id;

  const setCard = (set: HumanitiesSet) => (
    <details key={set.id} open={set.id === openId} className="group bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
      <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold text-navy leading-snug">{set.title}</span>
          <span className="block text-[12px] text-gray-500 mt-0.5">
            {set.questions.filter(q => answered.has(q.id)).length} of {set.questions.length} done
          </span>
        </span>
        <span className="shrink-0 text-gray-400 transition group-open:rotate-90">›</span>
      </summary>
      <ul className="mt-2 divide-y divide-black/5">
        {set.questions.map(q => (
          <li key={q.id}>
            <Link href={`/app/humanities/q/${q.id}`} className="flex items-center gap-3 py-2.5 hover:bg-amber-50/60 -mx-2 px-2 rounded-xl transition">
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-semibold text-amber-800">{skillLabel(q.skill)}</span>
                <span className="block text-sm text-navy">{q.question}{q.marks ? <span className="text-gray-500"> [{q.marks}]</span> : null}</span>
              </span>
              {answered.has(q.id) && <span className="shrink-0 text-[11px] text-emerald-700 font-semibold">Done</span>}
              <span className="shrink-0 text-gray-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${H.tile}`}>
          <PortalIcon name={H.icon} className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">Humanities</h1>
          <p className="text-[12px] text-gray-500">Social Studies · History · Geography</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-3xl px-4 py-3 text-sm text-gray-700 space-y-1">
        <p>Pick a question. Read what comes with it. Type your answer.</p>
        <p>In about a minute you get a level, and the one thing that would lift it.</p>
        <p className="text-[12px] text-gray-500">This is feedback, not a mark. Ask your teacher about any doubt.</p>
      </div>

      {runs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your latest answers</h2>
            {runs.length > HOME_LIMIT && <Link href="/app/humanities/answers" className="text-[12px] text-amber-800 font-semibold">See all</Link>}
          </div>
          {runs.slice(0, HOME_LIMIT).map(r => <AnswerCard key={r.id} row={r} />)}
        </div>
      )}

      <div role="tablist" className="flex gap-1 bg-black/5 rounded-2xl p-1">
        {TABS.map(t => (
          <Link key={t.key} role="tab" aria-selected={t.key === subject}
            href={t.key === 'social-studies' ? '/app/humanities' : `/app/humanities?s=${t.key}`}
            className={`flex-1 text-center text-sm font-semibold rounded-xl py-1.5 transition ${t.key === subject ? 'bg-white text-navy shadow-sm' : 'text-gray-500'}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {skills.length > 0 && (
        <div className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your skills</h2>
          <ul className="mt-1 divide-y divide-black/5">
            {skills.map(l => {
              const next = nextOf(l.skill);
              const row = (
                <>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-navy">{skillLabel(l.skill)}</span>
                    <span className={`block text-[13px] ${l.standing === 'practise' ? 'text-amber-800 font-semibold' : 'text-gray-600'}`}>{skillLineText(l)}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-gray-400">{l.answered} {l.answered === 1 ? 'answer' : 'answers'}</span>
                  {next && <span className="shrink-0 text-gray-400">›</span>}
                </>
              );
              return (
                <li key={l.skill}>
                  {next
                    ? <Link href={`/app/humanities/q/${next}`} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-amber-50/60 transition">{row}</Link>
                    : <div className="flex items-center gap-3 py-2.5">{row}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {caseStudies.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Case studies</h2>
          <p className="text-[12px] text-gray-500">Five questions on one set of sources, as in the exam. Do one, or all five.</p>
          <p className="text-[12px] text-gray-500">These sources are written for practice. They are not real documents.</p>
          <Link href="/app/humanities/paper" className="flex items-center gap-3 bg-white rounded-3xl px-4 py-3 border border-amber-200 shadow-sm hover:border-amber-300 active:scale-[0.99] transition">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-bold text-navy">Timed paper</span>
              <span className="block text-[12px] text-gray-500">1 h 45 min · one case study and one structured-response set</span>
            </span>
            <span className="shrink-0 text-gray-400">›</span>
          </Link>
          {SS_THEMES.map(theme => {
            const list = caseStudies.filter(s => s.theme === theme);
            return list.length > 0 && (
              <div key={theme} className="space-y-2">
                <h3 className="text-[13px] font-semibold text-navy pt-1">{SS_THEME_NAME[theme]}</h3>
                {list.map(setCard)}
              </div>
            );
          })}
        </div>
      )}

      {sourceSets.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{caseStudies.length > 0 ? 'Single questions' : 'Source-based questions'}</h2>
          {subject === 'history' && (
            <p className="text-[12px] text-gray-500">These sources are written for practice. They are not real documents.</p>
          )}
          {sourceSets.map(setCard)}
        </div>
      )}

      {pointSets.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Short questions</h2>
          <p className="text-[12px] text-gray-500">Answer from what you have learnt. One clear point a sentence.</p>
          {GEO_CLUSTERS.map(c => pointSets.filter(x => x.cluster === c)).flat().map(setCard)}
        </div>
      )}

      {structuredSets.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Structured response</h2>
          <p className="text-[12px] text-gray-500">No sources to read. Answer from what you have learnt.</p>
          <Link href="/app/humanities/examples" className="flex items-center gap-3 bg-white rounded-3xl px-4 py-3 border border-amber-200 shadow-sm hover:border-amber-300 active:scale-[0.99] transition">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-bold text-navy">Examples to use</span>
              <span className="block text-[12px] text-gray-500">Real examples for each issue, and what each one shows</span>
            </span>
            <span className="shrink-0 text-gray-400">›</span>
          </Link>
          {structuredSets.map(setCard)}
        </div>
      )}
    </div>
  );
}
