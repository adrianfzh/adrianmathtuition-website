// /app/humanities — the Humanities family's Home (SPEC-HUMANITIES.md, H1, 2 Oct
// 2026). Social Studies source-based questions, our own: pick a skill's
// question, type the answer, get a level range and the one lift. The door is
// humanitiesOpen(): the demo student and Adrian while the switch is closed.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen } from '@/lib/portal-beta';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { allSets } from '@/lib/humanities-questions';
import { loadHumanitiesFor } from '@/lib/humanities-runs';
import { AnswerCard } from './answer-cards';
import { skillLabel } from './skills';

export const dynamic = 'force-dynamic';

const H = SURFACES.humanities;
const HOME_LIMIT = 3;

export default async function HumanitiesPage() {
  if (!(await humanitiesOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const runs = await loadHumanitiesFor(sid);
  const answered = new Set(runs.map(r => r.question_id));
  const sets = allSets();

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${H.tile}`}>
          <PortalIcon name={H.icon} className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">Humanities</h1>
          <p className="text-[12px] text-gray-500">Social Studies · source-based questions</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-3xl px-4 py-3 text-sm text-gray-700 space-y-1">
        <p>Pick a question. Read the sources. Type your answer.</p>
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

      {sets.map(set => (
        <div key={set.id} className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <h2 className="text-[15px] font-bold text-navy leading-snug">{set.title}</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">{set.sources.length} sources · {set.questions.length} questions</p>
          <ul className="mt-2 divide-y divide-black/5">
            {set.questions.map(q => (
              <li key={q.id}>
                <Link href={`/app/humanities/q/${q.id}`} className="flex items-center gap-3 py-2.5 hover:bg-amber-50/60 -mx-2 px-2 rounded-xl transition">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-semibold text-amber-800">{skillLabel(q.skill)}</span>
                    <span className="block text-sm text-navy">{q.question}</span>
                  </span>
                  {answered.has(q.id) && <span className="shrink-0 text-[11px] text-emerald-700 font-semibold">Done</span>}
                  <span className="shrink-0 text-gray-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
