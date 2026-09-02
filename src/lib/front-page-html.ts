// Page 1 of a marked paper: the student's own analysis, as printable HTML.
//
// Adrian, 1 Sep 2026 — "need to be a pdf page attached right in front".
//
// WRITTEN TO THE STUDENT. Not to Adrian, not to a parent: second person, the
// topic names off their own syllabus contents page ("mensuration", not "shape &
// space" — his correction), and the marker's own note as the evidence for every
// claim. A page a sixteen-year-old will not read is a page that does not exist,
// whatever it contains.
//
// THIS PAPER ONLY (Adrian, 2 Sep 2026: "we should just analyze that particular
// exam paper, not across 5 papers"). The first version read the student's last
// few scripts and printed "fixed" rows and "over 4 papers" tallies. Gone: every
// number on this page comes from the script it is stapled to, and no wording
// assumes the student has a history here.
//
// LOOK. 2 Sep: "it looks professional for adults, but we are with young students
// here, make it fun" → coral / teal / sunny-yellow, rounded cards, a tilted round
// score badge, Quicksand. 3 Sep, seeing it stapled to a marked paper: "bring back
// the original one (the one in brown) — the colour scheme does not match, but
// change the marks so it is not tilted." So: the 1 Sep scheme again — cream,
// brown teaching ink, one red for the verdict, Source Serif + Plex Mono, the
// marked pages' own palette — on TODAY's markup (sheet-driven themes, the
// marks-lost row, one A4), and nothing rotated. The coral version is kept for
// iterating at f85af8c6 (git show f85af8c6:src/lib/front-page-html.ts). No emoji
// — the Chromium on Vercel has no emoji font and prints tofu — and no images:
// every shape here is CSS.
//
// Pure: analysis in, HTML out, no I/O. The route renders it with the shared
// Puppeteer browser and prepends the image to the assembled PDF.
import type { Theme } from './paper-analysis';
import { mathHtml } from './math-inline';
import {
  CARELESS_KINDS, CONCEPT_KINDS, ERROR_KIND_LABEL, hasLabelledLoss,
  type ErrorKind, type ErrorKindTotals,
} from './error-kinds';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A quoted marker note, at most `max` characters, as rendered math.
 *
 * The marker writes its notes in TeX, because everywhere else they pass through
 * KaTeX. The first live render put `$\frac{1}{2}\pi r^2 h$` in front of a
 * student — so this page renders them the same way the rest of the system does,
 * via the shared `mathHtml` (which also escapes, and knows the difference
 * between `$96` the price and `$x$` the variable).
 *
 * Cutting is done on a WORD boundary, and never inside a `$…$` span: a note
 * chopped mid-formula leaves an unclosed `$`, which swallows the rest of the
 * sentence into a garbled equation. An odd count means the cut landed inside
 * one, so back up to where that span opened.
 */
function quote(text: string, max = 150): string {
  let s = String(text || '').trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
  }
  if ((s.match(/\$/g) || []).length % 2 === 1) {
    s = s.slice(0, s.lastIndexOf('$')).replace(/[,;:.\s]+$/, '') + '…';
  }
  return mathHtml(s);
}

export type FrontPageInput = {
  studentName: string | null;
  paperName: string | null;
  markedOn?: string | null;
  awarded: number;
  max: number;
  /** Kept for callers that still send it; the page no longer reads it. */
  papersRead?: number;
  themes: Theme[];
  worstQuestions: { question: string; lost: number; max: number }[];
  /**
   * Where the themes came from. `sheet` = the self-study sheet's own diagnosis,
   * written back onto the run (lib/sheet-diagnosis.ts), in the sheet's section
   * order — so the page says the sheet works through them in that order.
   * Absent or `marker` = the keyword classifier over the marker's notes, the
   * fallback for a paper with no sheet yet. Changes two sentences, not the layout.
   */
  themesSource?: 'sheet' | 'marker';
  /**
   * Marks lost by error kind (lib/error-kinds.ts `errorKindTotals`), from the
   * marker's `parts[].error_kind` labels. Absent, or with nothing labelled →
   * no row at all, and the page is byte-identical to one without it: older
   * runs never had the labels and must not gain a line saying so.
   */
  errorKinds?: ErrorKindTotals | null;
};

// ONE A4 SHEET. Adrian asked for "a pdf page attached right in front" —
// singular, and a cover that runs to two pages stops being a cover. The first
// live render came out at 1603px against A4's 1123 because every theme printed
// three joined examples. One example per theme, cut to a phrase, fits.
const MAX_THEMES = 3;
const MAX_QUESTIONS = 5;

/**
 * The themes to print: the biggest few from this paper.
 *
 * Only LIVE themes — ones that cost marks on the paper in the student's hands.
 * The analysis is now built from that paper alone, so everything it returns is
 * live; the filter is there so a stale theme can never be printed if a caller
 * ever hands this page more history than it should have.
 */
export function chooseThemes(themes: Theme[]): Theme[] {
  const live = (themes || []).filter(t => t.live && t.marks > 0);
  // A sheet's `show` skills are the slips it points at in one line and does not
  // drill (its triage ②). They cost marks, so they are real themes, but they
  // never take one of the three slots from something the student has to LEARN.
  // Only when the sheet has nothing else does a slip make the cover.
  const core = live.filter(t => t.tier !== 'show');
  return (core.length ? core : live).slice(0, MAX_THEMES);
}

function themeRow(t: Theme, i: number): string {
  // The evidence, in the marker's own sentence — a claim a student cannot trace
  // back to their own script is a claim they will argue with. ONE note: three
  // joined notes read as a wall and pushed the page onto a second sheet.
  const note = t.examples.length
    ? `<span class="where">${esc(t.examples[0].question)}</span> ${quote(t.examples[0].why)}`
    : '';
  return `<div class="theme">
    <span class="num">${i + 1}</span>
    <span class="theme-title">${esc(t.title)}</span>
    <span class="tally"><b>&minus;${t.marks}</b> mark${t.marks === 1 ? '' : 's'} &middot; this paper</span>
    <p class="theme-note">${note}</p>
  </div>`;
}

function questionRow(q: { question: string; lost: number; max: number }): string {
  const pct = q.max > 0 ? Math.round((q.lost / q.max) * 100) : 0;
  return `<div class="q">
    <span class="q-label">${esc(q.question)}</span>
    <span class="bar"><span style="width:${pct}%"></span></span>
    <span class="q-marks">&minus;${q.lost} of ${q.max}</span>
  </div>`;
}

/**
 * ONE compact row under the score: where the marks went by KIND of error —
 * "Marks lost · concept 9 · careless 7 (arithmetic 4, sign 3) · incomplete 3".
 *
 * Adrian, 3 Sep 2026: label the errors "like arithmetic errors … beside the
 * crosses". The bot draws the word beside each cross; this line adds them up
 * so the student sees the SHAPE of the paper before the detail — and the
 * careless bucket is said the encouraging way, because a slip inside a right
 * method is the cheapest mark there is to win back.
 *
 * Hidden entirely when nothing is labelled, and the row's own styles ride
 * inside it, so a run from before the labels renders exactly as it did.
 * One line plus at most one short sub-line: the page is one A4 sheet.
 */
function kindsRow(t: ErrorKindTotals | null | undefined): string {
  if (!hasLabelledLoss(t)) return '';
  const n = (k: ErrorKind) => t!.byKind[k];
  const detail = (kinds: readonly ErrorKind[]) =>
    kinds.filter(k => n(k) > 0).map(k => `${ERROR_KIND_LABEL[k]} ${n(k)}`).join(', ');
  const cells: string[] = [];
  if (t!.concept > 0) {
    // "concept" already reads as the bucket; only spell it out when a misread is inside it.
    cells.push(`<b>concept</b> ${t!.concept}${n('misread') > 0 ? ` <i>(${detail(CONCEPT_KINDS)})</i>` : ''}`);
  }
  if (t!.careless > 0) cells.push(`<b>careless</b> ${t!.careless} <i>(${detail(CARELESS_KINDS)})</i>`);
  if (t!.incomplete > 0) cells.push(`<b>incomplete</b> ${t!.incomplete}`);
  // A part the marker left untagged still cost marks; "other" keeps the row honest
  // about the total without pretending to know why.
  if (t!.unlabelled > 0) cells.push(`<b>other</b> ${t!.unlabelled}`);
  const c = t!.careless;
  const sub = c > 0
    ? `<p class="kinds-sub">${c} mark${c === 1 ? ' was a' : 's were'} careless slip${c === 1 ? '' : 's'} &mdash; the method was right.</p>`
    : '';
  return `<style>
.kinds{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .5rem;margin:-.3rem 0 ${sub ? '.3rem' : '1.1rem'};
       padding:.45rem .85rem;background:var(--shade);border:1px solid var(--rule);font-size:.8rem;color:var(--ink-soft)}
.kinds-tag{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:.6rem;letter-spacing:.16em;
           text-transform:uppercase;color:var(--ink-faint);margin-right:.3rem}
.kinds b{color:var(--ink);font-weight:600}
.kinds i{font-style:normal;color:var(--ink-faint)}
.kinds .dot{color:var(--ink-faint)}
.kinds-sub{margin:0 0 1.1rem .85rem;font-size:.8rem;font-style:italic;color:var(--teach)}
</style>
<div class="kinds"><span class="kinds-tag">Marks lost</span> ${cells.join(' <span class="dot">&middot;</span> ')}</div>
${sub}`;
}

/** The closing line: two questions to start on, tied to the ranking above. */
function closingLine(input: FrontPageInput): string {
  const top = chooseThemes(input.themes || [])[0];
  const qs = input.worstQuestions.slice(0, 2).map(q => `<b>${esc(q.question)}</b>`);
  if (!qs.length) return '';
  const which = qs.length === 2 ? `${qs[0]} and ${qs[1]}` : qs[0];
  // Only claim a question "sits under" the top theme when the theme's own
  // evidence names it. Sophie's Q26 (draw a line on the printed curve) was
  // being filed under "giving a reason" because the sentence was unconditional.
  // A sheet-built theme names every question the skill came from in
  // `questions`; the printed example only shows the first.
  const names = (t: Theme) => [...t.examples.map(e => e.question), ...(t.questions || [])];
  const under = (q: string) => !!top && names(top).some(n => n === q || n.startsWith(q + '('));
  const named = input.worstQuestions.slice(0, 2).filter(q => under(q.question));
  const topName = top ? `<b>${esc(top.title.split('—')[0].trim().toLowerCase())}</b>` : '';
  const tie = !top || !named.length ? ''
    : named.length === qs.length
      ? ` ${qs.length === 2 ? 'Both' : 'It'} sit${qs.length === 2 ? '' : 's'} under ${topName} above.`
      : ` <b>${esc(named[0].question)}</b> sits under ${topName} above.`;
  // When the themes ARE the sheet's sections, say so: page 1 and the practice
  // sheet behind it are one document, in one order.
  const sheet = input.themesSource === 'sheet'
    ? 'The practice sheet with this paper works through these in the same order.'
    : 'The practice sheet that came with this paper drills exactly that.';
  return `<div class="close"><span class="close-tag">Your next move</span>
    <p>Start with ${which}.${tie} ${sheet}</p></div>`;
}

export function frontPageHtml(input: FrontPageInput): string {
  const pct = input.max > 0 ? Math.round((input.awarded / input.max) * 100) : 0;
  const themes = chooseThemes(input.themes || []);
  const top = themes[0];
  const lead = top
    ? `The one thing worth your time is <strong>${esc(top.title.split('—')[0].trim().toLowerCase())}</strong>.
       It cost you ${top.marks} mark${top.marks === 1 ? '' : 's'} on this paper.`
    : 'Your losses on this paper are scattered rather than concentrated — work through the marked script itself.';
  const sub = input.themesSource === 'sheet'
    ? 'In the order your practice sheet takes them — with a note on each.'
    : 'Ordered by what cost you most on this paper — with the marker\'s own note on each.';

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<!-- Same KaTeX the marking PNGs use (lib/marking-pipeline.ts). Stylesheet only:
     mathHtml() has already typeset the notes server-side, so there is no script
     to run and nothing to wait for beyond the fonts. -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>
/* Single-theme on purpose: this is printed onto paper, so it commits to the
   marked pages' own palette — cream, brown teaching ink, one red for the verdict —
   and never asks what the viewer's device prefers. (A dark-mode query here would
   produce a black A4 page.) The 1 Sep 2026 scheme, brought back on 3 Sep at
   Adrian's request over the coral/teal/yellow one (kept at f85af8c6 to iterate on);
   nothing on this page is rotated. */
:root{--sheet:#fff;--ink:#1F1D1A;--ink-soft:#6B6257;--ink-faint:#98907F;
      --teach:#5B4636;--verdict:#C4342C;--earned:#1A7F37;--rule:#E7E1D5;
      --rail:#F1EBDE;--shade:#FDFBF6;}
*{box-sizing:border-box}
body{margin:0;background:var(--sheet);color:var(--ink);width:210mm;min-height:297mm;
     font-family:"Source Serif 4",Georgia,serif;font-size:14.5px;line-height:1.5;
     -webkit-font-smoothing:antialiased;padding:15mm 17mm 13mm;position:relative;overflow:hidden;
     display:flex;flex-direction:column}
.blobs{display:none}
.page{position:relative;flex:1;display:flex;flex-direction:column}
.masthead{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;
          padding-bottom:.55rem;border-bottom:1.5px solid var(--ink)}
.brand{font-family:"IBM Plex Mono",monospace;font-size:.64rem;font-weight:600;
       letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint)}
.paper-name{font-size:.78rem;color:var(--ink-soft);font-style:italic}
.hero{display:grid;grid-template-columns:auto 1fr;gap:0 1.4rem;align-items:center;margin:1.1rem 0 1.15rem}
/* The score: a cream tile with the red verdict rule — upright. */
.badge{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;
       background:var(--shade);border:1px solid var(--rule);border-left:4px solid var(--verdict);
       padding:.85rem 1.15rem .8rem;min-width:9rem}
.score{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
       font-size:2.2rem;font-weight:600;line-height:1;white-space:nowrap}
.score .of{font-size:1.1rem;color:var(--ink-faint);font-weight:400}
.pct{font-family:"IBM Plex Mono",monospace;font-size:.7rem;color:var(--ink-faint);
     letter-spacing:.08em;margin-top:.32rem}
.student{font-size:.92rem;color:var(--ink-soft);margin:0}
h1{font-size:2.05rem;font-weight:700;line-height:1.1;margin:.15rem 0 .45rem;letter-spacing:-.015em}
.verdict{margin:0;font-size:.95rem;color:var(--ink);background:var(--rail);
         border:1px dashed var(--rule);padding:.55rem .85rem}
.verdict strong{color:var(--teach);font-weight:600}
h2{display:block;font-family:"IBM Plex Mono",monospace;font-size:.64rem;font-weight:600;letter-spacing:.16em;
   text-transform:uppercase;color:var(--ink-faint);margin:0 0 .28rem;padding-bottom:.42rem;
   border-bottom:1px solid var(--rule)}
h2::before{content:none}
.sec-work h2,.sec-where h2{color:var(--ink-faint)}
.sub{font-size:.79rem;color:var(--ink-soft);margin:.38rem 0 .68rem;font-style:italic}
.themes{display:flex;flex-direction:column;margin-bottom:1.15rem}
.theme{display:grid;grid-template-columns:1.25rem 1fr auto;gap:0 .75rem;align-items:baseline;
       padding:.52rem 0 .52rem .45rem;border-bottom:1px solid var(--rule);border-left:3px solid var(--verdict)}
.num{font-family:"IBM Plex Mono",monospace;font-size:.78rem;font-weight:600;color:var(--verdict)}
.theme-title{font-size:.96rem;font-weight:600;line-height:1.3}
.tally{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
       font-size:.73rem;color:var(--ink-soft);white-space:nowrap}
.tally b{color:var(--ink);font-weight:600}
.theme-note{grid-column:2/4;font-size:.81rem;color:var(--ink-soft);margin:.22rem 0 0}
.where{font-family:"IBM Plex Mono",monospace;font-size:.7rem;font-weight:600;color:var(--ink);
       letter-spacing:.02em;margin-right:.25rem}
/* KaTeX sets its own size; hold it to the sentence it sits in. */
.theme-note .katex{font-size:1em}
.questions{display:flex;flex-direction:column;gap:.32rem;margin-bottom:1.1rem}
.q{display:grid;grid-template-columns:2.7rem 1fr 4.4rem;gap:.75rem;align-items:center}
.q-label{font-family:"IBM Plex Mono",monospace;font-size:.83rem;font-weight:600;
         font-variant-numeric:tabular-nums}
.bar{height:.52rem;background:var(--rail);position:relative;overflow:hidden}
.bar span{position:absolute;inset:0 auto 0 0;background:var(--verdict);opacity:.8}
.q-marks{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
         font-size:.73rem;color:var(--ink-soft);text-align:right}
.close{margin-top:auto;border-top:1.5px solid var(--ink);padding-top:.8rem;
       font-size:.89rem;color:var(--teach)}
.close-tag{display:block;font-family:"IBM Plex Mono",monospace;font-size:.6rem;font-weight:600;
           letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:.3rem}
.close p{margin:0}
.close b{color:var(--ink);font-weight:600}
</style></head><body>
<div class="blobs"><span class="blob a"></span><span class="blob b"></span><span class="blob c"></span></div>
<div class="page">
<div class="masthead">
  <span class="brand">Adrian's Math Tuition</span>
  <span class="paper-name">${esc(input.paperName || 'Marked paper')}${
    input.markedOn ? ` &middot; marked ${esc(input.markedOn)}` : ''}</span>
</div>
<div class="hero">
  <div class="badge"><div class="score">${input.awarded}<span class="of">/${input.max}</span></div>
       <div class="pct">${pct}%</div></div>
  <div>
    <p class="student">${esc(input.studentName || '')}</p>
    <h1>Where your marks went</h1>
    <p class="verdict">${lead}</p>
  </div>
</div>
${kindsRow(input.errorKinds)}<div class="sec-work">
<h2>What to work on</h2>
<p class="sub">${sub}</p>
<div class="themes">${themes.map(themeRow).join('')}</div>
</div>
<div class="sec-where">
<h2>Where the marks went</h2>
<p class="sub">The questions that cost you most on this paper.</p>
<div class="questions">${(input.worstQuestions || []).slice(0, MAX_QUESTIONS).map(questionRow).join('')}</div>
</div>
${closingLine(input)}
</div>
</body></html>`;
}
