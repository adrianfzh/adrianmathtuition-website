// "Where you lost marks" — every question that dropped marks, with the printed
// question, the SEAB shorthand, the comment, the annotated worked solution and
// the Practise chip. Lived on the Papers LIST until 17 Sep 2026; the list is
// now one compact row per paper (Adrian: "make the whole interface simpler"),
// so this block moved to the paper's own page, where the marked pages are.
// Server component — no client JS for a list of text.
import Link from 'next/link';
import { promptLines, type StudentPaper } from '@/lib/portal-marking';
import { mathHtml } from '@/lib/math-inline';
import AnnotatedSolution from './AnnotatedSolution';
// Questions carry inline $…$ TeX — mathHtml KaTeXes only the math spans, and
// this stylesheet is what makes the output render as maths.
import 'katex/dist/katex.min.css';

export default function LostMarks({ paper }: { paper: StudentPaper }) {
  if (paper.dropped.length === 0) {
    return paper.questions.length > 0
      ? <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">✅ Full marks on every question marked.</p>
      : null;
  }
  return (
    <section aria-label="Where you lost marks" className="bg-white rounded-3xl border border-black/5 shadow-sm p-4">
      <h2 className="text-sm font-bold text-navy">
        Where you lost marks <span className="font-medium text-gray-400">({paper.dropped.length} question{paper.dropped.length === 1 ? '' : 's'})</span>
      </h2>
      <ul className="mt-2 space-y-2.5">
        {paper.dropped.map((q, i) => (
          <li key={`${q.questionNumber}-${i}`} className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold text-navy">
                Q{q.questionNumber}
                {q.topic && <span className="ml-2 font-medium text-gray-400">{q.topic}</span>}
              </p>
              <span className="shrink-0 text-xs font-semibold text-gray-600">{q.awarded}/{q.max}</span>
            </div>
            {/* The printed question, so the feedback below has something to
                refer to (Adrian's phone review: "students can't tell what
                the comment refers to"). */}
            {q.prompt && (
              <div className="mt-1.5 space-y-0.5 border-l-2 border-gray-200 pl-2">
                {promptLines(q.prompt).map((line, j) => (
                  <MathText key={j} text={line} className="text-[12.5px] text-gray-600 leading-snug" />
                ))}
              </div>
            )}
            {q.schemes.length > 0 && (
              // SEAB teacher-margin shorthand, per part — the same codes a
              // school marker writes ("M1 A0" = method earned, accuracy lost).
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {q.schemes.map((s, j) => (
                  <span key={j} className="text-[11px] font-mono bg-gray-100 text-gray-700 rounded px-1.5 py-0.5">
                    {s.label ? `${s.label} ` : ''}{s.scheme}
                  </span>
                ))}
              </div>
            )}
            {q.comment && <p className="text-[13px] text-gray-700 mt-1 leading-snug">{q.comment}</p>}
            {q.solution && (
              <details className="mt-2 group/sol">
                <summary className="cursor-pointer text-[13px] font-semibold text-navy list-none flex items-center gap-1.5">
                  <span className="text-gray-400 group-open/sol:rotate-90 transition-transform inline-block">›</span>
                  📖 The worked solution, annotated
                </summary>
                <AnnotatedSolution solution={q.solution} schemes={q.schemes} />
              </details>
            )}
            {q.slips.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {q.slips.map((s, j) => (
                  <li key={j} className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <MathText text={s} />
                  </li>
                ))}
              </ul>
            )}
            {q.revise && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Link href={q.revise.href}
                  className="inline-block text-[12px] font-semibold bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1.5 hover:bg-[hsl(45,80%,88%)] transition-colors">
                  ✏️ Practise: {q.revise.name} <span className="text-gray-400">›</span>
                </Link>
                <a href={q.revise.examplesHref} className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-navy">
                  worked examples ›
                </a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Server-side KaTeX over inline $…$ spans (lib/math-inline decides what is
// maths and what is a dollar sign).
function MathText({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}
