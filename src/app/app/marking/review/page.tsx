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
import TurnHint from './TurnHint';
import 'katex/dist/katex.min.css';

export const dynamic = 'force-dynamic';

// The comparison (30 Sep 2026, Adrian): top and bottom on a phone held upright,
// side by side when it is turned sideways, and always on a tablet or laptop.
const COMPARE = 'grid grid-cols-1 gap-2 landscape:grid-cols-2 md:grid-cols-2';
const YOURS_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-400';
const WRONG_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-rose-600';
const RIGHT_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700';

function WorkLine({ text, wrong, faint = false }: { text: string; wrong: boolean; faint?: boolean }) {
  return (
    <div className={`flex items-start gap-1 rounded-lg px-1.5 py-1 overflow-x-auto text-[12.5px] leading-snug ${wrong ? 'bg-rose-50 border border-rose-200 text-rose-900' : faint ? 'text-gray-500' : 'text-gray-700'}`}>
      {wrong && <span className="shrink-0 font-bold text-rose-600">✗</span>}
      <span dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />
    </div>
  );
}

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
    const fixes = q.fixes ?? [];
    const corrections = q.corrections ?? [];
    // No fix and no corrected line: compare the student's whole working with the worked solution instead.
    const compareAll = !fixes.length && !corrections.length && (q.working ?? []).length > 0 && !!q.solution;
    const solutionLines = compareAll ? String(q.solution).split('\n').map(l => l.trim()).filter(Boolean) : [];
    const shown = fixes.length > 0 || corrections.length > 0 || compareAll;
    return {
      key: c.key,
      node: (
        <article className="bg-white rounded-3xl border border-black/5 shadow-sm p-4 space-y-3 h-full overflow-y-auto">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{c.paperName}</p>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-base font-bold text-navy">Q{q.questionNumber}{q.topic && <span className="ml-2 text-sm font-medium text-gray-400">{q.topic}</span>}</p>
              <span className={`shrink-0 text-sm font-bold rounded-full px-2.5 py-0.5 ${q.awarded === 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{q.awarded}/{q.max}</span>
            </div>
          </div>
          {q.prompt && (
            <div className="space-y-0.5 border-l-2 border-gray-200 pl-2">
              {promptLines(q.prompt).map((line, j) => <div key={j} className="text-[12px] text-gray-500 leading-snug" dangerouslySetInnerHTML={{ __html: mathHtml(line) }} />)}
            </div>
          )}
          {/* 1 — what went wrong, one line a part (the verdict first). */}
          {q.slips.length > 0 ? (
            <section className="space-y-1">
              <p className={WRONG_HEAD}>What went wrong</p>
              <ul className="space-y-1">
                {q.slips.map((s, j) => <li key={j} className="text-[13px] text-gray-800 leading-snug" dangerouslySetInnerHTML={{ __html: mathHtml(s) }} />)}
              </ul>
            </section>
          ) : q.comment ? <p className="text-[13px] text-gray-800 leading-snug">{q.comment}</p> : null}
          {/* 2 — each line that went wrong, with the fix right under it. */}
          {corrections.length > 0 && (
            <section className="space-y-2" data-review-corrections>
              <p className={RIGHT_HEAD}>Your line → the fix</p>
              {corrections.map((k, j) => (
                <div key={j} className="rounded-xl border border-black/5 overflow-hidden">
                  <div className="flex items-start gap-1.5 bg-rose-50 px-2.5 py-1.5 text-[12.5px] leading-snug text-rose-900 overflow-x-auto">
                    <span className="shrink-0 font-bold text-rose-600">✗</span><span dangerouslySetInnerHTML={{ __html: mathHtml(k.yours) }} />
                  </div>
                  <div className="flex items-start gap-1.5 bg-emerald-50 px-2.5 py-1.5 text-[12.5px] leading-snug text-navy overflow-x-auto">
                    <span className="shrink-0 font-bold text-emerald-600">✓</span><span dangerouslySetInnerHTML={{ __html: mathHtml(k.fix) }} />
                  </div>
                </div>
              ))}
            </section>
          )}
          {/* 3 — the red pen's steps from the line that went wrong. */}
          {fixes.map((f, j) => (
            <div key={j} className="space-y-1" data-review-fix>
              {f.label && <p className="text-[11px] font-semibold text-gray-500">{f.label}</p>}
              <div className={COMPARE}>
                <div className="min-w-0 space-y-1">
                  <p className={YOURS_HEAD}>Your working</p>
                  {f.yours.map((line, k) => <WorkLine key={k} text={line} wrong={k === f.yours.length - 1} faint />)}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className={RIGHT_HEAD}>The right steps</p>
                  {f.steps.map((st, k) => (
                    <div key={k} className="rounded-lg bg-emerald-50/60 px-1.5 py-1 overflow-x-auto">
                      <div className="text-[12.5px] leading-snug text-navy" dangerouslySetInnerHTML={{ __html: mathHtml(st.latex) }} />
                      {st.why && <p className="text-[11px] leading-snug text-gray-500">{st.why}</p>}
                    </div>
                  ))}
                  {f.final && <div className="px-1.5 overflow-x-auto text-[12.5px] font-bold text-navy" dangerouslySetInnerHTML={{ __html: mathHtml(f.final) }} />}
                </div>
              </div>
            </div>
          ))}
          {compareAll && (
            <div className={COMPARE} data-review-compare>
              <div className="min-w-0 space-y-1">
                <p className={YOURS_HEAD}>Your working</p>
                {(q.working ?? []).map((l, k) => <WorkLine key={k} text={l.text} wrong={l.wrong} />)}
              </div>
              <div className="min-w-0 space-y-1">
                <p className={RIGHT_HEAD}>The right working</p>
                {solutionLines.map((line, k) => (
                  <div key={k} className="rounded-lg bg-emerald-50/60 px-1.5 py-1 overflow-x-auto text-[12.5px] leading-snug text-navy" dangerouslySetInnerHTML={{ __html: mathHtml(line) }} />
                ))}
              </div>
            </div>
          )}
          {/* The full solution stays folded once the card already shows the fix. */}
          {q.solution && !compareAll && (
            <details open={!shown} className="group/sol">
              <summary className="cursor-pointer text-[13px] font-semibold text-navy list-none flex items-center gap-1.5">
                <span className="text-gray-400 group-open/sol:rotate-90 transition-transform inline-block">›</span>📖 The full worked solution
              </summary>
              <AnnotatedSolution solution={q.solution} schemes={q.schemes} />
            </details>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {q.revise && <Link href={q.revise.href} className="text-[12px] font-semibold bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1.5">✏️ Practise: {q.revise.name}</Link>}
            <Link href={jumpHref(c)} className="text-[12px] font-semibold text-gray-500 underline underline-offset-2">See it on my paper</Link>
          </div>
        </article>
      ),
    };
  });

  return (
    <div className="space-y-3 pb-24 sm:pb-6">
      <Link href="/app/my-notes" className="inline-block text-sm font-semibold text-navy hover:underline">← My Notebook</Link>
      <h1 className="text-xl font-bold text-navy">Review my mistakes</h1>
      {papers.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white rounded-3xl p-5 border border-black/5">Open it from My Notebook: tap Review beside a paper.</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 rounded-3xl p-5 border border-emerald-100">✅ Full marks on every marked question in {papers.length === 1 ? 'this paper' : 'these papers'} — nothing to review.</p>
      ) : (
        <>
          <p className="text-[12px] text-gray-500">{cards.length} question{cards.length === 1 ? '' : 's'} across {papers.length} paper{papers.length === 1 ? '' : 's'}. Swipe or tap to move on.</p>
          {items.length > 0 && <TurnHint />}
          <ReviewDeck items={items} />
        </>
      )}
    </div>
  );
}
