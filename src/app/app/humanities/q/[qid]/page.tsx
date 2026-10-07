// /app/humanities/q/<question id> — one question: its sources, the question, the answer box.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { humanitiesOpen } from '@/lib/portal-beta';
import { questionById, isCaseStudy } from '@/lib/humanities-questions';
import { MAX_WORDS } from '@/lib/humanities-submit';
import { SourceCards, BackgroundCard, DataTableCard, DiagramCard } from '../../sources';
import { skillLabel } from '../../skills';
import AnswerForm from './answer-form';

export const dynamic = 'force-dynamic';

export default async function HumanitiesQuestionPage({ params }: { params: Promise<{ qid: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const { qid } = await params;
  const ctx = questionById(qid);
  if (!ctx) notFound();
  const caseStudy = isCaseStudy(ctx.set);
  const nth = ctx.set.questions.findIndex(q => q.id === ctx.question.id) + 1;
  const others = ctx.inView.filter(s => !ctx.sources.includes(s));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href={ctx.set.subject === 'social-studies' ? '/app/humanities' : `/app/humanities?s=${ctx.set.subject}`} className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>
      <div>
        <p className="text-[12px] font-semibold text-amber-800">
          {caseStudy && `Question ${nth} of ${ctx.set.questions.length} · `}{skillLabel(ctx.question.skill)}
        </p>
        <h1 className="text-xl font-bold text-navy leading-snug">{ctx.set.title}</h1>
        <p className="text-sm text-gray-600 mt-1">{ctx.set.issue}</p>
      </div>
      {ctx.set.background && <BackgroundCard text={ctx.set.background} open={nth === 1} />}
      {ctx.sources.length > 0 && <SourceCards sources={ctx.sources} />}
      {ctx.question.table && <DataTableCard table={ctx.question.table} />}
      {ctx.question.diagram && <DiagramCard diagram={ctx.question.diagram} />}
      {others.length > 0 && (
        <details className="group bg-white/60 rounded-3xl p-4 border border-black/5">
          <summary className="flex items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-navy">The other sources</span>
              <span className="block text-[12px] text-gray-500">Use them to check what a source says.</span>
            </span>
            <span className="shrink-0 text-gray-400 transition group-open:rotate-90">›</span>
          </summary>
          <div className="mt-3"><SourceCards sources={others} /></div>
        </details>
      )}
      {((ctx.set.subject === 'history' && ctx.set.kind === 'source') || caseStudy) && (
        <p className="text-[12px] text-gray-500 px-1">These sources are written for practice. They are not real documents.</p>
      )}
      {ctx.set.kind === 'structured' && (
        <p className="text-[12px] text-gray-500 px-1">Answer from what you have learnt. Do not copy the extract.</p>
      )}
      <div className="bg-amber-50 border border-amber-100 rounded-3xl p-4">
        <p className="text-[12px] font-semibold text-amber-800">Question</p>
        <p className="text-[16px] font-semibold text-navy leading-snug mt-0.5">
          {ctx.question.question}
          {ctx.question.marks ? <span className="text-gray-500 font-normal"> [{ctx.question.marks}]</span> : null}
        </p>
      </div>
      <AnswerForm questionId={ctx.question.id} maxWords={MAX_WORDS} />
    </div>
  );
}
