// /app/humanities/paper/sit?cs=<case study>&sr=<structured set> — the paper itself.
import { notFound, redirect } from 'next/navigation';
import { humanitiesOpen } from '@/lib/portal-beta';
import { paperFor, PAPER_MINUTES } from '@/lib/humanities-paper';
import { MAX_WORDS } from '@/lib/humanities-submit';
import PaperForm from './paper-form';

export const dynamic = 'force-dynamic';

export default async function HumanitiesPaperSitPage({ searchParams }: { searchParams: Promise<{ cs?: string; sr?: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const { cs, sr } = await searchParams;
  const paper = paperFor(cs ?? '', sr ?? '');
  if (!paper) notFound();
  return (
    <PaperForm
      caseStudyId={paper.caseStudy.id}
      structuredId={paper.structured.id}
      title={paper.caseStudy.title}
      issue={paper.caseStudy.issue}
      background={paper.caseStudy.background ?? ''}
      sources={paper.caseStudy.sources}
      extract={paper.structured.sources[0]?.text ?? ''}
      extractTitle={paper.structured.title}
      parts={paper.parts.map(p => ({ id: p.question.id, label: p.label, section: p.section, question: p.question.question, marks: p.marks }))}
      minutes={PAPER_MINUTES}
      maxWords={MAX_WORDS}
    />
  );
}
