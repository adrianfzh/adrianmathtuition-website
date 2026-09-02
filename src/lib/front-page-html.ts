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
// FOR TEENAGERS (same day: "it looks professional for adults, but we are with
// young students here, make it fun"). Coral / teal / sunny-yellow on white, one
// accent per section, rounded cards, a big round score badge, Quicksand for the
// headings. No emoji — the Chromium on Vercel has no emoji font and prints tofu
// — and no images: every shape here is CSS.
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
.kinds{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .5rem;margin:-.55rem 0 ${sub ? '.3rem' : '1.1rem'};
       padding:.45rem .9rem;background:var(--teal-tint);border-radius:12px;font-size:.8rem;color:var(--ink-soft)}
.kinds-tag{font-family:"Quicksand","Nunito",sans-serif;font-weight:700;font-size:.66rem;letter-spacing:.1em;
           text-transform:uppercase;color:var(--teal-deep);margin-right:.25rem}
.kinds b{color:var(--ink);font-weight:800}
.kinds i{font-style:normal;color:var(--ink-faint)}
.kinds .dot{color:var(--ink-faint)}
.kinds-sub{margin:0 0 1.1rem .9rem;font-size:.8rem;font-weight:700;color:var(--teal-deep)}
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap">
<!-- Same KaTeX the marking PNGs use (lib/marking-pipeline.ts). Stylesheet only:
     mathHtml() has already typeset the notes server-side, so there is no script
     to run and nothing to wait for beyond the fonts. -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>
/* Single-theme on purpose: this is printed onto paper, so it commits to one
   light palette and never asks what the viewer's device prefers. (A dark-mode
   query here would produce a black A4 page.) */
:root{--sheet:#fff;--ink:#27293D;--ink-soft:#5D6072;--ink-faint:#9A9DAD;
      --coral:#FF6F61;--coral-deep:#E4503F;--coral-tint:#FFEFEB;
      --teal:#20A99F;--teal-deep:#178A82;--teal-tint:#E3F6F3;
      --sun:#FFCB47;--sun-deep:#C98F00;--sun-tint:#FFF6D9;}
*{box-sizing:border-box}
body{margin:0;background:var(--sheet);color:var(--ink);width:210mm;min-height:297mm;
     font-family:"Nunito","Trebuchet MS","Segoe UI",Arial,sans-serif;font-size:15px;line-height:1.48;
     -webkit-font-smoothing:antialiased;padding:12mm 15mm 11mm;position:relative;overflow:hidden;
     display:flex;flex-direction:column}
/* Soft colour blobs behind the corners — CSS only, no images. They live in their
   own overflow-hidden layer: a blob hanging off the bottom edge still counts
   toward body.scrollHeight, and a full-page screenshot would grow past A4. */
.blobs{position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none}
.blob{position:absolute;border-radius:50%}
.blob.a{width:230px;height:230px;right:-90px;top:-100px;background:var(--sun-tint)}
.blob.b{width:150px;height:150px;left:-70px;top:250px;background:var(--coral-tint)}
.blob.c{width:190px;height:190px;right:-70px;bottom:-80px;background:var(--teal-tint)}
.page{position:relative;z-index:1;flex:1;display:flex;flex-direction:column}
.masthead{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.brand{font-family:"Quicksand","Nunito",sans-serif;font-weight:700;font-size:.72rem;letter-spacing:.08em;
       text-transform:uppercase;color:#fff;background:var(--teal);padding:.3rem .8rem;border-radius:999px}
.paper-name{font-size:.8rem;font-weight:700;color:var(--ink-soft)}
.hero{display:grid;grid-template-columns:auto 1fr;gap:0 1.5rem;align-items:center;margin:1.4rem 0 1.35rem}
.badge{width:132px;height:132px;border-radius:50%;background:var(--sun);display:flex;flex-direction:column;
       align-items:center;justify-content:center;box-shadow:0 0 0 8px var(--sun-tint);transform:rotate(-6deg)}
.score{font-family:"Quicksand","Nunito",sans-serif;font-size:2.5rem;font-weight:700;line-height:1;
       font-variant-numeric:tabular-nums;white-space:nowrap}
.score .of{font-size:1.15rem;font-weight:700;color:var(--sun-deep)}
.pct{font-size:.74rem;font-weight:800;letter-spacing:.08em;color:var(--sun-deep);margin-top:.3rem}
.student{font-weight:800;font-size:.84rem;letter-spacing:.06em;text-transform:uppercase;color:var(--coral-deep);margin:0}
h1{font-family:"Quicksand","Nunito",sans-serif;font-size:2.05rem;font-weight:700;line-height:1.08;margin:.15rem 0 .55rem;
   letter-spacing:-.01em}
.verdict{margin:0;background:var(--sun-tint);border-radius:14px;padding:.62rem .9rem;font-size:.93rem}
.verdict strong{color:var(--coral-deep);font-weight:800}
h2{display:flex;align-items:center;gap:.5rem;font-family:"Quicksand","Nunito",sans-serif;font-size:1.08rem;
   font-weight:700;margin:0 0 .1rem}
h2::before{content:"";width:.72rem;height:.72rem;border-radius:4px;background:currentColor;transform:rotate(12deg)}
.sec-work h2{color:var(--coral-deep)}
.sec-where h2{color:var(--teal-deep)}
.sub{font-size:.8rem;color:var(--ink-soft);margin:0 0 .7rem}
.themes{display:flex;flex-direction:column;gap:.55rem;margin-bottom:1.3rem}
.theme{display:grid;grid-template-columns:1.75rem 1fr auto;gap:.1rem .7rem;align-items:center;
       background:var(--coral-tint);border-radius:14px;padding:.65rem .9rem .65rem .7rem}
.num{width:1.75rem;height:1.75rem;border-radius:50%;background:var(--coral);color:#fff;
     font-family:"Quicksand","Nunito",sans-serif;font-weight:700;font-size:.95rem;
     display:flex;align-items:center;justify-content:center}
.theme-title{font-weight:800;font-size:.97rem;line-height:1.3}
.tally{background:#fff;color:var(--coral-deep);border-radius:999px;padding:.18rem .62rem;
       font-size:.74rem;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.tally b{font-weight:800}
.theme-note{grid-column:2/4;font-size:.82rem;color:var(--ink-soft);margin:.12rem 0 0}
.where{display:inline-block;background:#fff;border:1.5px solid var(--coral);color:var(--coral-deep);
       border-radius:6px;padding:0 .38rem;font-size:.7rem;font-weight:800;margin-right:.3rem;line-height:1.5}
/* KaTeX sets its own size; hold it to the sentence it sits in. */
.theme-note .katex{font-size:1em}
.questions{display:flex;flex-direction:column;gap:.55rem;margin-bottom:1.3rem}
.q{display:grid;grid-template-columns:3rem 1fr 4.4rem;gap:.7rem;align-items:center}
.q-label{font-family:"Quicksand","Nunito",sans-serif;font-weight:700;font-size:.92rem;color:var(--teal-deep);
         font-variant-numeric:tabular-nums}
.bar{height:.8rem;border-radius:999px;background:var(--teal-tint);position:relative;overflow:hidden}
.bar span{position:absolute;inset:0 auto 0 0;background:var(--teal);border-radius:999px}
.q-marks{font-size:.76rem;font-weight:700;color:var(--ink-soft);text-align:right;font-variant-numeric:tabular-nums}
.close{margin-top:auto;background:var(--teal);color:#fff;border-radius:16px;padding:.8rem 1.1rem .85rem}
.close-tag{display:inline-block;font-family:"Quicksand","Nunito",sans-serif;font-weight:700;font-size:.68rem;
           letter-spacing:.1em;text-transform:uppercase;background:rgba(255,255,255,.22);
           padding:.14rem .55rem;border-radius:999px;margin-bottom:.32rem}
.close p{margin:0;font-size:.93rem;font-weight:600}
.close b{color:var(--sun);font-weight:800}
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
