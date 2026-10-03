// /app/humanities/q/<question id> — one question: its sources, the question, the answer box.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { humanitiesOpen } from '@/lib/portal-beta';
import { questionById } from '@/lib/humanities-questions';
import { MAX_WORDS } from '@/lib/humanities-submit';
import { SourceCards } from '../../sources';
import { skillLabel } from '../../skills';
import AnswerForm from './answer-form';

export const dynamic = 'force-dynamic';

export default async function HumanitiesQuestionPage({ params }: { params: Promise<{ qid: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const { qid } = await params;
  const ctx = questionById(qid);
  if (!ctx) notFound();

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <Link href="/app/humanities" className="text-[12px] text-gray-500 hover:text-navy">‹ Humanities</Link>
      <div>
        <p className="text-[12px] font-semibold text-amber-800">{skillLabel(ctx.question.skill)}</p>
        <h1 className="text-xl font-bold text-navy leading-snug">{ctx.set.title}</h1>
        <p className="text-sm text-gray-600 mt-1">{ctx.set.issue}</p>
      </div>
      <SourceCards sources={ctx.sources} />
      {ctx.set.subject === 'history' && (
        <p className="text-[12px] text-gray-500 px-1">These sources are written for practice. They are not real documents.</p>
      )}
      {ctx.set.kind === 'structured' && (
        <p className="text-[12px] text-gray-500 px-1">Answer from what you have learnt. Do not copy the extract.</p>
      )}
      <div className="bg-amber-50 border border-amber-100 rounded-3xl p-4">
        <p className="text-[12px] font-semibold text-amber-800">Question</p>
        <p className="text-[16px] font-semibold text-navy leading-snug mt-0.5">{ctx.question.question}</p>
      </div>
      <AnswerForm questionId={ctx.question.id} maxWords={MAX_WORDS} />
    </div>
  );
}
