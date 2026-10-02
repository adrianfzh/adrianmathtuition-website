// Lines of working aligned at the relation sign (1 Oct 2026, Adrian's standing
// readability rule: "aligned at equal sign etc"). The PDF transcript has had
// this since August (lib/solution-align); the app's line-by-line view and the
// Notebook card's "right steps" never did.
//
// Every line that is exactly one `$…$` run with a top-level `=`, `≈`, `≤`, `≥`,
// `<` or `>` (lib/solution-align splitAtRelation — the bot's rule, verbatim)
// is set as two cells, the left-hand side right-aligned and the relation with
// the right-hand side left-aligned, so the signs stack in one column. A line
// that is not (prose, a part label, a long chain) spans the row. A line
// starting "Answer" is bold. Server component; KaTeX via mathLineHtml.
import { mathHtml, mathLineHtml } from '@/lib/math-inline';
import { oneMathRun, splitAtRelation } from '@/lib/solution-align';

export interface AlignedLine {
  text: string;
  /** A short grey reason under the line (the red pen's "why"). */
  why?: string;
  /** Tone of the row: plain, the student's ✗ line, the pen's ✓ fix, a step, the Answer. */
  tone?: 'plain' | 'wrong' | 'fix' | 'step' | 'answer';
  /** A row number in the margin ("01"), the solution view's habit. */
  n?: string;
}

/** Past this many TeX characters on the left the split drags the column too far right (lib/solution-align's rule). */
const LHS_MAX = 40;

const ROW: Record<NonNullable<AlignedLine['tone']>, string> = {
  plain: 'text-gray-800',
  wrong: 'bg-rose-50 text-rose-900',
  fix: 'bg-emerald-50/60 text-navy',
  step: 'bg-emerald-50/60 text-navy',
  answer: 'text-navy font-bold',
};
const MARK: Partial<Record<NonNullable<AlignedLine['tone']>, string>> = { wrong: '✗', fix: '✓' };
const GUTTER: Record<NonNullable<AlignedLine['tone']>, string> = {
  plain: 'text-gray-300', wrong: 'text-rose-600', fix: 'text-emerald-600', step: 'text-emerald-600', answer: 'text-gray-300',
};

function isAnswer(text: string): boolean {
  return /^\s*\$?\\?(text\{)?\s*Ans(wer)?\b/i.test(text) || /^\s*\*\*Answer/i.test(text);
}

/** `$lhs = rhs$` → the two cells; anything else → null (the row spans). */
function cells(text: string): { lhs: string; rel: string; rhs: string } | null {
  const inner = oneMathRun(text);
  if (!inner || /\\text\{/.test(inner.split(/=|\\approx|\\le|\\ge|<|>/)[0] ?? '')) return null;
  const sp = splitAtRelation(inner);
  if (!sp || sp.lhs.length > LHS_MAX) return null;
  return { lhs: sp.lhs, rel: sp.rel, rhs: sp.rhs };
}

export default function AlignedMath({ lines, size = 'text-[12.5px]' }: { lines: AlignedLine[]; size?: string }) {
  return (
    <div className="grid gap-y-1 items-baseline" style={{ gridTemplateColumns: 'auto max-content minmax(0, 1fr)' }} data-aligned-math>
      {lines.map((l, i) => {
        const tone = l.tone ?? (isAnswer(l.text) ? 'answer' : 'plain');
        const c = tone === 'answer' ? null : cells(l.text);
        const rowCls = `${ROW[tone]} ${size} leading-snug py-1`;
        const gutter = (
          <span className={`${rowCls} ${GUTTER[tone]} rounded-l-lg pl-1.5 pr-1.5 text-[11px] font-bold tabular-nums self-stretch`}>
            {MARK[tone] ?? l.n ?? ''}
          </span>
        );
        const why = l.why ? <span className="block text-[11px] font-normal leading-snug text-gray-500">{l.why}</span> : null;
        if (c) {
          // `{}` before the relation keeps KaTeX's relation spacing when the sign opens the cell.
          return (
            <div key={i} className="contents">
              {gutter}
              <span className={`${rowCls} text-right overflow-x-auto`} dangerouslySetInnerHTML={{ __html: mathHtml(`$${c.lhs}{}$`) }} />
              <span className={`${rowCls} rounded-r-lg pl-1 pr-1.5 min-w-0 overflow-x-auto`}>
                <span dangerouslySetInnerHTML={{ __html: mathHtml(`${'$'}{}${c.rel} ${c.rhs}$`) }} />
                {why}
              </span>
            </div>
          );
        }
        return (
          <div key={i} className="contents">
            {gutter}
            <span className={`${rowCls} col-span-2 rounded-r-lg pr-1.5 min-w-0 overflow-x-auto`}>
              {tone === 'answer' && !/answer/i.test(l.text) && <span className="mr-1">Answer:</span>}
              <span dangerouslySetInnerHTML={{ __html: mathLineHtml(l.text) }} />
              {why}
            </span>
          </div>
        );
      })}
    </div>
  );
}
