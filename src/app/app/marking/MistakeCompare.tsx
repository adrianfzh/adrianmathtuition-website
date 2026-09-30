// One lost-marks question, the way My Notebook shows it (1 Oct 2026, Adrian:
// "left panel shows their mistake and right panel shows their correct steps …
// without clicking the review button"; "shouldn't it just be your working on
// the left and the right steps on the right?"; "won't you be able to show the
// snippet of their mistake?"): the printed question folded, then ONE comparison
// — LEFT, the window of the student's own page where the question sits, the
// pen's marks and all (lib/mistake-snippet; the typed lines one tap away under
// "as text", and on their own when the run has no boxes); RIGHT, the ✓ fix for
// each ✗ line, the red pen's steps from there with a reason under each, and
// the bold Answer, aligned at the equals sign (AlignedMath) — the marker's
// verdict as one quiet line under it, the full solution folded, and the two
// doors. Server component: KaTeX runs here, the client list only places cards.
//
// It was the Review card (17–30 Sep 2026, /app/marking/review, a swipe deck
// behind a "Review this paper" button) with three headed sections.
//
// Phone upright: the mistake ABOVE the fix (Adrian picked it over two forced
// columns — long equations get squeezed at 390 px). Sideways, a tablet or a
// laptop: side by side.
import Link from 'next/link';
import { promptLines, type StudentQuestion } from '@/lib/portal-marking';
import { jumpHref } from '@/lib/review-cards';
import { canExplain, explainHref } from '@/lib/explain-clip';
import { mathHtml } from '@/lib/math-inline';
import { fileHref } from '@/lib/student-files-url';
import { snippetStyle } from '@/lib/mistake-snippet';
import AlignedMath, { type AlignedLine } from './AlignedMath';
import AnnotatedSolution from './AnnotatedSolution';

const COMPARE = 'grid grid-cols-1 gap-2 landscape:grid-cols-2 md:grid-cols-2';
const YOURS_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-400';
const RIGHT_HEAD = 'text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700';
/** The part a window or a group of steps belongs to — "(b)(i)". */
const PART_HEAD = 'text-[11px] font-semibold text-gray-500 pt-1';

/** The window onto the student's page: the image scaled and shifted inside a box the window's shape. */
function SnippetWindow({ s }: { s: NonNullable<StudentQuestion['snippets']>[number] }) {
  const css = snippetStyle(s);
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-black/10 bg-white" style={css.box} data-snippet={s.photoIndex}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fileHref(s.url)} alt="Your working, from your page" className="absolute max-w-none" style={css.img} loading="lazy" />
    </div>
  );
}

export default function MistakeCompare({ q, runId, paperName = null, explain = false }: {
  q: StudentQuestion;
  runId: string;
  /** Printed above the question number when the card stands outside its paper's group. */
  paperName?: string | null;
  /** The ▶ one-minute explanation door (lib/explain-clip) — the caller decides who may see it. */
  explain?: boolean;
}) {
  const fixes = q.fixes ?? [];
  const corrections = q.corrections ?? [];
  const snippets = q.snippets ?? [];
  // Typed lines: every line the marker read, ✗ where it went wrong; when the lines were not
  // kept as a whole (an older run), the red pen's own "your lines up to the wrong one".
  const typed: AlignedLine[] = ((q.working ?? []).length
    ? (q.working ?? [])
    : fixes.flatMap(f => f.yours.map((text, k) => ({ text, wrong: k === f.yours.length - 1 })))
  ).map(l => ({ text: l.text, tone: l.wrong ? 'wrong' : 'plain' }));
  // ONE ROW PER PART (Adrian, 1 Oct 2026: "the right steps doesn't say it's for
  // which part?" then "preferably the right steps is level with their working?"):
  // left, that part's window of the page (or its typed lines when the run has no
  // boxes); right, that part's ✓ fixes, the pen's steps from the wrong line on,
  // then its Answer. A window that holds two parts ("(b)(i), (b)(ii)") is one row
  // with both parts' steps under it. A one-part question is one unlabelled row.
  type Row = { label: string; parts: string[]; windows: typeof snippets; left: AlignedLine[]; right: AlignedLine[] };
  const rows: Row[] = [];
  const rowFor = (label: string): Row => {
    let r = rows.find(x => x.parts.includes(label) || x.label === label);
    if (!r) { r = { label, parts: label ? label.split(', ') : [''], windows: [], left: [], right: [] }; rows.push(r); }
    return r;
  };
  for (const s of snippets) rowFor(s.label).windows.push(s);
  for (const k of corrections) {
    const r = rowFor(k.label ?? '');
    r.right.push({ text: k.fix, tone: 'fix' });
    if (!r.windows.length) r.left.push({ text: k.yours, tone: 'wrong' });
  }
  for (const f of fixes) {
    const r = rowFor(f.label ?? '');
    if (!r.windows.length) r.left.push(...f.yours.map((text, k) => ({ text, tone: (k === f.yours.length - 1 ? 'wrong' : 'plain') as AlignedLine['tone'] })));
    for (const st of f.steps) r.right.push({ text: st.latex, why: st.why || undefined, tone: 'step' });
    if (f.final) r.right.push({ text: f.final, tone: 'answer' });
  }
  // No fix and no corrected line at all: the worked solution stands on the right of one row.
  const compareAll = rows.every(r => !r.right.length) && (typed.length > 0 || snippets.length > 0) && !!q.solution;
  if (compareAll) {
    const r = rowFor('');
    if (!r.windows.length && !r.left.length) r.left.push(...typed);
    r.right.push(...String(q.solution).split('\n').map(l => l.trim()).filter(Boolean).map(line => ({ text: line, tone: 'plain' as const })));
  }
  // A run with no boxes and one row: the whole typed working stands on the left, ✗ lines marked.
  if (!snippets.length && rows.length === 1 && typed.length) rows[0].left = typed;
  // A window with nothing to say on the right still shows (the part lost marks; the pen wrote no fix).
  const shownRows = rows.filter(r => r.windows.length || r.left.length || r.right.length)
    // The paper's order: the label sorts ((a) before (b)(i) before (c)(iii)); a row the boxes
    // could not place (no label) goes LAST — it is usually the final answer line.
    .sort((a, b) => (a.label === '' ? 1 : b.label === '' ? -1 : a.label.localeCompare(b.label)));
  const shown = shownRows.some(r => r.right.length > 0);
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
      {shown && (
        <div className="space-y-3" data-review-compare>
          {/* Side by side: the two column heads once, above every row. Stacked (a phone upright):
              each row heads its own halves, and only the halves it has. */}
          <div className={`${COMPARE} hidden landscape:grid md:grid`}>
            <p className={YOURS_HEAD}>Your working</p>
            <p className={RIGHT_HEAD}>The right steps</p>
          </div>
          {shownRows.map((r, i) => (
            <div key={r.label || i} className="space-y-1" data-part={r.label || undefined}>
              {r.label && <p className={PART_HEAD}>{r.label}</p>}
              <div className={COMPARE}>
                <div className="min-w-0 space-y-1">
                  {(r.windows.length > 0 || r.left.length > 0) && <p className={`${YOURS_HEAD} landscape:hidden md:hidden`}>Your working</p>}
                  {r.windows.map((s, k) => <SnippetWindow key={`${s.photoIndex}:${k}`} s={s} />)}
                  {!r.windows.length && r.left.length > 0 && <AlignedMath lines={r.left} />}
                </div>
                <div className="min-w-0 space-y-1">
                  {r.right.length > 0 && <p className={`${RIGHT_HEAD} landscape:hidden md:hidden`}>The right steps</p>}
                  {r.right.length > 0 && <AlignedMath lines={r.right} />}
                </div>
              </div>
            </div>
          ))}
          {snippets.length > 0 && typed.length > 0 && (
            <details className="group/typed">
              <summary className="cursor-pointer list-none text-[11px] font-semibold text-gray-400 flex items-center gap-1">
                <span className="group-open/typed:rotate-90 transition-transform inline-block">›</span>as text
              </summary>
              <div className="mt-1"><AlignedMath lines={typed} /></div>
            </details>
          )}
        </div>
      )}
      {/* The marker's verdict, one quiet line a part. */}
      {q.slips.length > 0 ? (
        <ul className="space-y-0.5" data-review-why>
          {q.slips.map((s, j) => <li key={j} className={`leading-snug ${shown ? 'text-[12px] text-gray-500' : 'text-[13px] text-gray-800'}`} dangerouslySetInnerHTML={{ __html: mathHtml(s) }} />)}
        </ul>
      ) : q.comment ? <p className="text-[12px] text-gray-500 leading-snug">{q.comment}</p> : null}
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
        {explain && canExplain(q) && (
          <Link href={explainHref(runId, q.questionNumber)} className="text-[12px] font-semibold bg-navy text-white rounded-full px-3 py-1.5" data-explain-door>▶ Explain it · 1 min</Link>
        )}
        {q.revise && <Link href={q.revise.href} className="text-[12px] font-semibold bg-[hsl(45,80%,94%)] text-navy rounded-full px-3 py-1.5">✏️ Practise: {q.revise.name}</Link>}
        <Link href={jumpHref(card)} className="text-[12px] font-semibold text-gray-500 underline underline-offset-2">See it on my paper</Link>
      </div>
    </div>
  );
}
