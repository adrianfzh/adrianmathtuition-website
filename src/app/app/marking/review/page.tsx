// /app/marking/review?papers=a,b,c — Review my mistakes (17 Sep 2026,
// SPEC-STUDENT-FIRST §7): one card per question that lost marks across the
// ticked papers, newest paper first, scrolled one at a time; each card can jump
// to the mistake on the marked page. Same access rule as the list: the
// logged-in student's own released papers, subject-gated.
import Link from 'next/link';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, promptLines, type MarkingRunRow } from '@/lib/portal-marking';
import { subjectAllowed } from '@/lib/portal-subjects';
import { buildReviewCards, jumpHref } from '@/lib/review-cards';
import { mathHtml } from '@/lib/math-inline';
import AnnotatedSolution from '../AnnotatedSolution';
import ReviewDeck, { type DeckItem } from './ReviewDeck';
import 'katex/dist/katex.min.css';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, student_label, student_starred_at, student_archived_at, student_note, paper_subject';

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ papers?: string }> }) {
  const { papers: raw } = await searchParams;
  const ids = String(raw ?? '').split(',').map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 12);
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const sb = getSupabaseAdmin();
  const { data } = ids.length
    ? await sb.from('paper_marking_runs').select(COLUMNS).eq('student_id', sid).not('released_at', 'is', null).in('id', ids)
    : { data: [] };
  const rows = ((data ?? []) as MarkingRunRow[]).filter(r => subjectAllowed(account, r.paper_subject));
  const { papers } = buildStudentMarking(rows, { studentName: account?.display_name ?? null });
  const cards = buildReviewCards(papers);

  const items: DeckItem[] = cards.map(c => {
    const q = c.question;
    return {
      key: c.key,
      node: (
        <article className="bg-white rounded-3xl border border-black/5 shadow-sm p-4 space-y-2.5 h-full overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{c.paperName}</p>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-base font-bold text-navy">Q{q.questionNumber}{q.topic && <span className="ml-2 text-sm font-medium text-gray-400">{q.topic}</span>}</p>
            <span className={`shrink-0 text-sm font-bold rounded-full px-2.5 py-0.5 ${q.awarded === 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{q.awarded}/{q.max}</span>
          </div>
          {q.prompt && (
            <div className="space-y-0.5 border-l-2 border-gray-200 pl-2">
              {promptLines(q.prompt).map((line, j) => <div key={j} className="text-[12.5px] text-gray-600 leading-snug" dangerouslySetInnerHTML={{ __html: mathHtml(line) }} />)}
            </div>
          )}
          {q.schemes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {q.schemes.map((s, j) => <span key={j} className="text-[11px] font-mono bg-gray-100 text-gray-700 rounded px-1.5 py-0.5">{s.label ? `${s.label} ` : ''}{s.scheme}</span>)}
            </div>
          )}
          {q.comment && <p className="text-[13px] text-gray-800 leading-snug">{q.comment}</p>}
          {q.slips.length > 0 && (
            <ul className="space-y-1">
              {q.slips.map((s, j) => <li key={j} className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5" dangerouslySetInnerHTML={{ __html: mathHtml(s) }} />)}
            </ul>
          )}
          {q.solution && (
            <details className="group/sol">
              <summary className="cursor-pointer text-[13px] font-semibold text-navy list-none flex items-center gap-1.5">
                <span className="text-gray-400 group-open/sol:rotate-90 transition-transform inline-block">›</span>📖 The worked solution, annotated
              </summary>
              <AnnotatedSolution solution={q.solution} schemes={q.schemes} />
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link href={jumpHref(c)} className="text-[12px] font-bold text-white bg-navy rounded-xl px-3 py-1.5">See it on my paper ›</Link>
            {q.revise && <Link href={q.revise.href} className="text-[12px] font-semibold bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1.5">✏️ Practise: {q.revise.name}</Link>}
          </div>
        </article>
      ),
    };
  });

  return (
    <div className="space-y-3 pb-24 sm:pb-6">
      <Link href="/app/marking" className="inline-block text-sm font-semibold text-navy hover:underline">← Papers</Link>
      <h1 className="text-xl font-bold text-navy">Review my mistakes</h1>
      {papers.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white rounded-3xl p-5 border border-black/5">Pick one or more papers on the Papers tab first.</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 rounded-3xl p-5 border border-emerald-100">✅ Full marks on every marked question in {papers.length === 1 ? 'this paper' : 'these papers'} — nothing to review.</p>
      ) : (
        <>
          <p className="text-[12px] text-gray-500">{cards.length} question{cards.length === 1 ? '' : 's'} across {papers.length} paper{papers.length === 1 ? '' : 's'}. Swipe or tap to move on.</p>
          <ReviewDeck items={items} />
        </>
      )}
    </div>
  );
}
