// ─── Worked-solutions booklet for the 🖼 photos PDF ─────────────────────────────
//
// The 🖼 images-only PDF used to carry each worked solution in the footer strip of
// the annotated photo itself (the `-sol` twin). That put the solution nearest the
// mistake, but a footer has no page break: Eva's Sep 2026 paper had 11 of 17 pages
// taller than A4, the worst 1.97× — "fit to page" printed it at half scale
// (Adrian, 1 Sep 2026: "having solutions at the footer may make for a very long
// page pdf — when printed out may be hard to read").
//
// So the photos PDF now works like a marked script from a professional service:
// the marked pages use the CLEAN twins (ticks, scores, marker's notes — no
// solution block), and every worked solution moves to a typeset booklet at the
// back, one A4-width flowing document sliced into page-height chunks. The rule
// that the solution appears EXACTLY ONCE per document (Adrian, 29 Jul 2026) is
// preserved — it appears here instead of the footer.
//
// This module is the pure half: which questions belong in the booklet, and the
// HTML for it. The headless-browser half is lib/render-solutions-booklet.ts.
// KaTeX renders in the page (same CDN + __katexRendered contract as
// public/marking-template.html); the maths pipeline is the transcript's own —
// repairMarkingLatex first, THEN alignMarkingSolutions (alignment decides on
// top-level `=` that repair may have un-mangled), split on SOLUTION_STEP_RE.

import { repairMarkingLatex, SOLUTION_STEP_RE } from './latex-repair';
import { alignMarkingSolutions } from './solution-align';

/** The slice of a marking_output this booklet reads. Structurally compatible
 *  with render-marking's MarkingOutput (every field optional), plus the
 *  solution_branches the marker emits but that interface never declared. */
export type BookletMarking = {
  question?: { number?: string; max_marks?: number } | null;
  correct?: {
    final_answer?: string;
    full_solution_latex?: string;
    full_solution_plain?: string;
    solution_branches?: {
      before_latex?: string | null;
      after_latex?: string | null;
      cases?: Array<{ case?: string | null; steps_latex?: string | null } | null> | null;
    } | null;
  } | null;
  marks?: { awarded?: number; max?: number } | null;
  // value_latex is unused here but load-bearing: without a property in common
  // with latex-repair's Repairable.student_final_answer, TS's weak-type check
  // rejects the repairMarkingLatex(mo) call and the whole generic collapses.
  student_final_answer?: { matches_correct?: boolean; value_latex?: string } | null;
};

export type BookletItem = {
  /** Question key as the paper printed it, leading `Q` stripped — `5(a)`, `13(d)(i)`. */
  qNum: string;
  awarded: number | null;
  max: number | null;
  /** Linear steps, post repair + align. Empty when the solution is branched. */
  steps: string[];
  /** Side-by-side case columns (trig case splits, ± roots) — ≥2 usable cases or null. */
  branches: {
    before: string[];
    cases: { head: string; steps: string[] }[];
    after: string[];
  } | null;
};

export type BookletInput = {
  paperName?: string | null;
  studentName?: string | null;
  items: BookletItem[];
};

const splitSteps = (src: string | null | undefined): string[] =>
  String(src || '').split(SOLUTION_STEP_RE).map((s) => s.trim()).filter(Boolean);

/**
 * Which questions get a worked solution in the booklet.
 *
 * The gate is WIDER than the transcript's (`matches_correct === false` only):
 * any question that lost marks belongs here too, because a method mark dropped
 * on the way to a right answer still deserves the model working. That is safe
 * precisely because the clean twins carry no solution anywhere — there is no
 * second surface left to duplicate. Questions with nothing lost and no wrong
 * answer stay out: a booklet restating what the student already did correctly
 * is noise. And with no solution text at all there is nothing to print.
 */
export function bookletItems(
  results: Array<{ question_number?: string | null; marking_output?: BookletMarking | null }>,
): BookletItem[] {
  const out: BookletItem[] = [];
  for (const r of results || []) {
    const mo = r?.marking_output;
    if (!mo) continue;

    const awarded = Number(mo.marks?.awarded);
    const max = Number(mo.marks?.max);
    const lostMarks = Number.isFinite(awarded) && Number.isFinite(max) && awarded < max;
    const wrongAnswer = mo.student_final_answer?.matches_correct === false;
    if (!lostMarks && !wrongAnswer) continue;

    // Same pipeline, same order, as buildMarkingHTML in lib/render-marking.ts.
    const repaired = alignMarkingSolutions(repairMarkingLatex(mo));
    const correct = repaired.correct || {};
    const solSrc = correct.full_solution_latex || correct.full_solution_plain || '';

    // Branch gate mirrors the transcript: at least TWO usable cases (one case is
    // not a split), capped at three; anything less falls back to the linear
    // steps, which full_solution_latex is spec'd to keep complete on its own.
    const b = correct.solution_branches;
    const cases = (b && typeof b === 'object' && Array.isArray(b.cases))
      ? b.cases
          .filter((c): c is { case?: string | null; steps_latex?: string | null } =>
            !!c && typeof c.steps_latex === 'string' && !!c.steps_latex.trim())
          .slice(0, 3)
      : [];

    const steps = splitSteps(solSrc);
    if (!steps.length && cases.length < 2) continue;   // nothing to print

    out.push({
      qNum: String(r.question_number ?? mo.question?.number ?? '?').trim().replace(/^Q\s*/i, ''),
      awarded: Number.isFinite(awarded) ? awarded : null,
      max: Number.isFinite(max) ? max : null,
      steps: cases.length >= 2 ? [] : steps,
      branches: cases.length >= 2
        ? {
            before: splitSteps(b?.before_latex),
            cases: cases.map((c) => ({
              head: (typeof c.case === 'string' && c.case.trim()) ? c.case.trim() : 'Case',
              steps: splitSteps(c.steps_latex),
            })),
            after: splitSteps(b?.after_latex),
          }
        : null,
    });
  }
  return out;
}

/** Escaped for HTML text position. KaTeX auto-render walks the DOM's TEXT — by the
 *  time it runs, `&lt;` is `<` again, so an ordinary `$\frac{dv}{dx}<0$` neither
 *  opens a tag here nor confuses the maths there. */
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const stepDivs = (steps: string[]): string =>
  steps.map((s) => `<div class="step">${esc(s)}</div>`).join('\n');

function itemHtml(item: BookletItem): string {
  const score = item.awarded != null && item.max != null
    ? `<span class="score">your score&ensp;<b>${item.awarded} / ${item.max}</b></span>`
    : '';
  let body: string;
  if (item.branches) {
    const cols = item.branches.cases.map((c) =>
      `<div class="branch"><div class="case-head">${esc(c.head)}</div>${stepDivs(c.steps)}</div>`).join('\n');
    body = [
      stepDivs(item.branches.before),
      `<div class="branches">${cols}</div>`,
      stepDivs(item.branches.after),
    ].filter(Boolean).join('\n');
  } else {
    body = stepDivs(item.steps);
  }
  return `<section class="sol">
  <div class="sol-head"><span class="sol-q">Q${esc(item.qNum)}</span>${score}</div>
  ${body}
</section>`;
}

export function solutionsBookletHtml(input: BookletInput): string {
  const items = input.items.map(itemHtml).join('\n');
  const who = [input.studentName, input.paperName].filter(Boolean).map(esc).join(' &middot; ');
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
  onload="if(window.__buildDone) window.__runKatex()"></script>
<style>
/* Single-theme on purpose — printed onto paper, same as the front page.
   Palette matches lib/front-page-html.ts so cover and booklet read as one
   document; the solution panel structure matches the transcript's (green left
   border = "the correct working", public/marking-template.html). */
:root{--sheet:#fff;--ink:#1F1D1A;--ink-soft:#6B6257;--ink-faint:#98907F;
      --earned:#1A7F37;--rule:#E7E1D5;--shade:#FDFBF6;}
*{box-sizing:border-box}
/* Pure-white body with white gaps between panels: sliceTallPng cuts this tall
   render into A4 chunks at the whitest rows, so every seam lands between
   questions, never through a line of working. */
html{font-size:60%}   /* rem-based sizes follow the body: 40% smaller (Adrian, 6 Sep 2026) */
body{margin:0;background:var(--sheet);color:var(--ink);width:210mm;
     font-family:"Source Serif 4",Georgia,serif;font-size:9px;line-height:1.65;
     -webkit-font-smoothing:antialiased;padding:13mm 17mm 15mm}
.masthead{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;
          padding-bottom:.55rem;border-bottom:1.5px solid var(--ink)}
.brand{font-family:"IBM Plex Mono",monospace;font-size:.64rem;font-weight:600;
       letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint)}
.who{font-size:.78rem;color:var(--ink-soft);font-style:italic}
h1{font-size:1.6rem;font-weight:700;line-height:1.1;margin:.8rem 0 .15rem;letter-spacing:-.015em}
.lede{font-size:.85rem;color:var(--ink-soft);font-style:italic;margin:0 0 1.05rem}
.sol{background:var(--shade);border:1px solid var(--rule);border-left:3px solid var(--earned);
     border-radius:10px;padding:10px 14px 12px;margin-bottom:22px}
.sol-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;
          margin-bottom:6px}
.sol-q{font-family:"IBM Plex Mono",monospace;font-size:.83rem;font-weight:600;
       letter-spacing:.06em;color:var(--earned)}
.score{font-family:"IBM Plex Mono",monospace;font-size:.68rem;color:var(--ink-faint);
       font-variant-numeric:tabular-nums}
.score b{color:var(--ink-soft);font-weight:600}
.step{overflow-wrap:break-word}
.step .katex{font-size:1.06em}
.branches{display:flex;gap:22px;align-items:flex-start;margin-top:4px}
.branch{flex:1 1 0;min-width:0;padding-left:14px;border-left:1.5px solid var(--rule)}
.case-head{font-weight:600;color:var(--earned);margin-bottom:2px}
.meta{margin:.4rem 0 0;font-family:"IBM Plex Mono",monospace;font-size:.6rem;
      letter-spacing:.06em;color:var(--ink-faint)}
</style></head><body>
<div class="masthead">
  <span class="brand">Adrian's Math Tuition</span>
  <span class="who">${who}</span>
</div>
<h1>Worked solutions</h1>
<p class="lede">Every question where marks were lost, worked in full. Redo your version first,
then compare it line by line with the working here.</p>
${items}
<p class="meta">Marked by AdrianMath</p>
<script>
window.__buildDone = true;
window.__runKatex = function () {
  try {
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
      ],
      throwOnError: false,
      errorColor: '#c8102e',
    });
  } catch (e) { console.warn('KaTeX render error:', e); }
  window.__katexRendered = true;
};
if (typeof renderMathInElement === 'function') window.__runKatex();
</script>
</body></html>`;
}
