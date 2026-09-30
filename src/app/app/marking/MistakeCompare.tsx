// One lost-marks question, the way My Notebook shows it (1 Oct 2026, Adrian:
// "left panel shows their mistake and right panel shows their correct steps …
// without clicking the review button"): the printed question, why marks were
// lost (the verdict first), then the comparison — the student's own lines with
// the wrong one marked ✗ beside the red pen's steps from that line on, each
// with its reason — the full solution folded, and the two doors. Server
// component: KaTeX runs here, the client list only places the cards.
//
// It was the Review card (17–30 Sep 2026, /app/marking/review, a swipe deck
// behind a "Review this paper" button); the deck is gone, this is the body.
//
// Phone upright: the mistake ABOVE the fix (Adrian picked it over two forced
// columns, 1 Oct 2026 — long equations get squeezed at 390 px). Sideways, a
// tablet or a laptop: side by side.
import Link from 'next/link';
import { promptLines, type StudentQuestion } from '@/lib/portal-marking';
import { jumpHref } from '@/lib/review-cards';
import { mathHtml, mathLineHtml } from '@/lib/math-inline';
import AnnotatedSolution from './AnnotatedSolution';

const COMPARE = 'grid grid-cols-1 gap-2 landscape:grid-cols-2 md:grid-cols-2';
const YOURS_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-400';
const WRONG_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-rose-600';
const RIGHT_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700';

function WorkLine({ text, wrong, faint = false }: { text: string; wrong: boolean; faint?: boolean }) {
  return (
    <div className={`flex items-start gap-1 rounded-lg px-1.5 py-1 overflow-x-auto text-[12.5px] leading-snug ${wrong ? 'bg-rose-50 border border-rose-200 text-rose-900' : faint ? 'text-gray-500' : 'text-gray-700'}`}>
      {wrong && <span className="shrink-0 font-bold text-rose-600">✗</span>}
      <span dangerouslySetInnerHTML={{ __html: mathLineHtml(text) }} />
    </div>
  );
}

export default function MistakeCompare({ q, runId, paperName = null }: {
  q: StudentQuestion;
  runId: string;
  /** Printed above the question number when the card stands outside its paper's group. */
  paperName?: string | null;
}) {
  const fixes = q.fixes ?? [];
  const corrections = q.corrections ?? [];
  // No fix and no corrected line: compare the student's whole working with the worked solution instead.
  const compareAll = !fixes.length && !corrections.length && (q.working ?? []).length > 0 && !!q.solution;
  const solutionLines = compareAll ? String(q.solution).split('\n').map(l => l.trim()).filter(Boolean) : [];
  const shown = fixes.length > 0 || corrections.length > 0 || compareAll;
  const card = { runId, photoIndex: q.photoIndex ?? null, question: q };

  return (
    <div className="space-y-3" data-mistake-compare>
      <div>
        {paperName && <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{paperName}</p>}
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-bold text-navy">Q{q.questionNumber}{q.topic && <span className="ml-2 text-sm font-medium text-gray-400">{q.topic}</span>}</p>
          <span className={`shrink-0 text-sm font-bold rounded-full px-2.5 py-0.5 ${q.awarded === 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{q.awarded}/{q.max}</span>
        </div>
      </div>
      {q.prompt && (
        <details className="group/q">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-gray-500 flex items-center gap-1">
            <span className="text-gray-400 group-open/q:rotate-90 transition-transform inline-block">›</span>The question
          </summary>
          <div className="space-y-0.5 border-l-2 border-gray-200 pl-2 mt-1">
            {promptLines(q.prompt).map((line, j) => <div key={j} className="text-[12px] text-gray-500 leading-snug" dangerouslySetInnerHTML={{ __html: mathHtml(line) }} />)}
          </div>
        </details>
      )}
      {/* 1 — why marks were lost, one line a part (the verdict first). */}
      {q.slips.length > 0 ? (
        <section className="space-y-1">
          <p className={WRONG_HEAD}>Why you lost marks</p>
          <ul className="space-y-1">
            {q.slips.map((s, j) => <li key={j} className="text-[13px] text-gray-800 leading-snug" dangerouslySetInnerHTML={{ __html: mathHtml(s) }} />)}
          </ul>
        </section>
      ) : q.comment ? <p className="text-[13px] text-gray-800 leading-snug">{q.comment}</p> : null}
      {/* 2 — each line that went wrong, with the fix right under it. */}
      {corrections.length > 0 && (
        <section className="space-y-2" data-review-corrections>
          <p className={RIGHT_HEAD}>What you wrote → what to write</p>
          {corrections.map((k, j) => (
            <div key={j} className="rounded-xl border border-black/5 overflow-hidden">
              <div className="flex items-start gap-1.5 bg-rose-50 px-2.5 py-1.5 text-[12.5px] leading-snug text-rose-900 overflow-x-auto">
                <span className="shrink-0 font-bold text-rose-600">✗</span><span dangerouslySetInnerHTML={{ __html: mathLineHtml(k.yours) }} />
              </div>
              <div className="flex items-start gap-1.5 bg-emerald-50 px-2.5 py-1.5 text-[12.5px] leading-snug text-navy overflow-x-auto">
                <span className="shrink-0 font-bold text-emerald-600">✓</span><span dangerouslySetInnerHTML={{ __html: mathLineHtml(k.fix) }} />
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
                  <div className="text-[12.5px] leading-snug text-navy" dangerouslySetInnerHTML={{ __html: mathLineHtml(st.latex) }} />
                  {st.why && <p className="text-[11px] leading-snug text-gray-500">{st.why}</p>}
                </div>
              ))}
              {f.final && <div className="px-1.5 overflow-x-auto text-[12.5px] font-bold text-navy"><span className="mr-1">Answer:</span><span dangerouslySetInnerHTML={{ __html: mathLineHtml(f.final) }} /></div>}
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
      <div className="flex flex-wrap items-center gap-3">
        {q.revise && <Link href={q.revise.href} className="text-[12px] font-semibold bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1.5">✏️ Practise: {q.revise.name}</Link>}
        <Link href={jumpHref(card)} className="text-[12px] font-semibold text-gray-500 underline underline-offset-2">See it on my paper</Link>
      </div>
    </div>
  );
}
