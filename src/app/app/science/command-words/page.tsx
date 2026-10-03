// /app/science/command-words — what each command word asks for, and how to
// describe a graph (3 Oct 2026). For every science; the door is a row on
// Science Home. Server-rendered. Adrian's cookie only until
// COMMAND_WORDS_OPEN_TO_STUDENTS flips. Data: lib/command-words.ts.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { COMMAND_WORDS_OPEN_TO_STUDENTS, scienceMarkingOpen, viewingAsStudent } from '@/lib/portal-beta';
import { COMMAND_WORDS, DESCRIBE_VS_EXPLAIN, GRAPH_EXAMPLE, GRAPH_STEPS } from '@/lib/command-words';
import { Marked, STUDY_CARD, StudyHeader } from '../study-bits';

export const dynamic = 'force-dynamic';

const HEAD = 'text-[12px] font-bold uppercase tracking-wide text-slate-600';

export default async function CommandWordsPage() {
  if (!(await scienceMarkingOpen())) redirect('/app');
  const isAdmin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value) && !(await viewingAsStudent());
  if (!COMMAND_WORDS_OPEN_TO_STUDENTS && !isAdmin) redirect('/app/science');
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <StudyHeader tile="bg-slate-700" icon="book" title="Command words" sub="The first word of the question tells you what to write" />

      <section className={`${STUDY_CARD} px-4 py-4 space-y-2`} aria-label="Describe or explain">
        <h2 className={HEAD}>Describe or explain?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-3 py-2.5">
            <p className="text-[15px] font-bold text-navy">Describe</p>
            <p className="text-[15px] leading-snug text-gray-700"><Marked text={DESCRIBE_VS_EXPLAIN.describe} /></p>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
            <p className="text-[15px] font-bold text-navy">Explain</p>
            <p className="text-[15px] leading-snug text-gray-700"><Marked text={DESCRIBE_VS_EXPLAIN.explain} /></p>
          </div>
        </div>
      </section>

      <section className={`${STUDY_CARD} px-4 py-3`} aria-label="The command words">
        <h2 className={HEAD}>The words</h2>
        <dl className="divide-y divide-gray-100">
          {COMMAND_WORDS.map(c => (
            <div key={c.word} className="py-3">
              <dt className="text-[16px] font-bold text-navy">{c.word}</dt>
              <dd className="mt-0.5 text-[15px] leading-snug text-gray-700"><Marked text={c.needs} /></dd>
              <dd className="mt-1.5 text-[13px] leading-snug text-gray-500">{c.question}</dd>
              <dd className="text-[14px] leading-snug text-gray-700"><span className="font-bold text-emerald-700">✓ </span>{c.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${STUDY_CARD} px-4 py-4 space-y-3`} aria-label="Describing a graph">
        <h2 className={HEAD}>Describing a graph</h2>
        <ol className="space-y-1.5">
          {GRAPH_STEPS.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-snug text-gray-700">
              <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-slate-700 text-white text-[11px] font-bold flex items-center justify-center" aria-hidden>{i + 1}</span>
              <span><Marked text={s} /></span>
            </li>
          ))}
        </ol>
        <div className="rounded-2xl border border-red-200 bg-red-50/60 px-3 py-2.5 text-[15px] leading-snug text-gray-700">
          <span className="font-bold text-red-700">✗ No values: </span>{GRAPH_EXAMPLE.weak}
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-[15px] leading-snug text-gray-700">
          <span className="font-bold text-emerald-700">✓ Scores: </span>{GRAPH_EXAMPLE.strong}
        </div>
      </section>

      <p className="text-[12px] text-gray-400">
        For O-Level Physics, Chemistry and Biology. <Link href="/app/science" className="underline underline-offset-2">Back to Science</Link>
      </p>
    </div>
  );
}
