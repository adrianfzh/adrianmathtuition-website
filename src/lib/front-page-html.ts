// Page 1 of a marked paper: the student's own analysis, as printable HTML.
//
// Adrian, 1 Sep 2026 — "need to be a pdf page attached right in front".
//
// WRITTEN TO THE STUDENT. Not to Adrian, not to a parent: second person, the
// topic names off their own syllabus contents page ("mensuration", not "shape &
// space" — his correction), and one genuine piece of credit where the data
// supports it. A page a sixteen-year-old will not read is a page that does not
// exist, whatever it contains.
//
// Pure: analysis in, HTML out, no I/O. The route renders it with the shared
// Puppeteer browser and prepends the image to the assembled PDF.
import type { Theme } from './paper-analysis';
import { mathHtml } from './math-inline';

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
  papersRead: number;
  themes: Theme[];
  worstQuestions: { question: string; lost: number; max: number }[];
};

// ONE A4 SHEET. Adrian asked for "a pdf page attached right in front" —
// singular, and a cover that runs to two pages stops being a cover. The first
// live render came out at 1603px against A4's 1123 because every theme printed
// three joined examples. One example per theme, cut to a phrase, fits.
const MAX_LIVE = 3;
const MAX_QUESTIONS = 5;

/**
 * The themes to print: the top live ones, plus a RESERVED slot for the best
 * thing they have fixed.
 *
 * A plain `slice` cost Eva the only good news on her page. Fixed themes sort
 * last (they can never outrank a gap the student still has), so any cut takes
 * them first — and the fixed row is the whole reason the analysis reads five
 * papers instead of one. Her blanks ran 6, 8, 15, 8, then zero: told she has
 * stopped, that is worth more than a fourth thing to worry about.
 */
export function chooseThemes(themes: Theme[]): Theme[] {
  const all = themes || [];
  const live = all.filter(t => t.live).slice(0, MAX_LIVE);
  const fixed = all.filter(t => !t.live && t.marks > 0)[0];
  return fixed ? [...live, fixed] : all.slice(0, MAX_LIVE + 1);
}

/**
 * The note explaining why the page judges more than the paper in their hands.
 * A student being told about work handed in three weeks ago is owed the reason,
 * and it is also the single idea that makes the ranking make sense.
 */
function whyNote(papersRead: number): string {
  if (papersRead < 2) return '';
  return `<div class="why"><span class="n">${papersRead}</span><p>This page looks at your last
    <b>${papersRead === 2 ? 'two' : papersRead === 3 ? 'three' : papersRead === 4 ? 'four' : papersRead}</b>
    marked papers, not just this one. One paper cannot tell a topic you have not learnt from one hard
    question on a bad day — but a mistake you make in three papers running is a gap you will carry into
    the exam. It also shows what you have <em>fixed</em>.</p></div>`;
}

function themeRow(t: Theme): string {
  const cls = t.live ? 'live' : 'eased';
  const flag = t.live ? '' : '<span class="flag">fixed</span>';
  const where = t.papers === 1 ? 'this paper' : `${t.papers} papers`;
  // The evidence, in the marker's own sentence — a claim a student cannot trace
  // back to their own script is a claim they will argue with. The NEWEST one
  // only: three joined notes read as a wall and pushed the page onto a second
  // sheet, and the oldest of the three is the least like the work in their hand.
  const note = t.examples.length
    ? `<span class="where">${esc(t.examples[0].question)}</span> ${quote(t.examples[0].why)}`
    : '';
  const progress = !t.live && t.marks > 0
    ? ' <b>Not once on this paper.</b> Keep doing whatever changed.'
    : '';
  return `<div class="theme ${cls}">
    <span class="dot"></span>
    <span class="theme-title">${esc(t.title)}${flag}</span>
    <span class="tally"><b>${t.marks}</b> marks &middot; ${where}</span>
    <p class="theme-note">${note}${progress}</p>
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

/** The closing line: two questions to start on, tied to the ranking above. */
function closingLine(input: FrontPageInput): string {
  const top = input.themes.find(t => t.live);
  const qs = input.worstQuestions.slice(0, 2).map(q => `<b>${esc(q.question)}</b>`);
  if (!qs.length) return '';
  const which = qs.length === 2 ? `${qs[0]} and ${qs[1]}` : qs[0];
  const tie = top ? ` Both sit under <b>${esc(top.title.split('—')[0].trim().toLowerCase())}</b> above.` : '';
  return `<p class="close">Start with ${which}.${tie} The practice sheet that came with this paper
    drills exactly that.</p>`;
}

export function frontPageHtml(input: FrontPageInput): string {
  const pct = input.max > 0 ? Math.round((input.awarded / input.max) * 100) : 0;
  const themes = chooseThemes(input.themes || []);
  const top = themes.find(t => t.live);
  const lead = top
    ? `The one thing worth your time is <strong>${esc(top.title.split('—')[0].trim().toLowerCase())}</strong>.
       It has cost you ${top.marks} mark${top.marks === 1 ? '' : 's'}${
         top.papers > 1 ? ` over ${top.papers} papers` : ''}${
         top.latestMarks ? `, and ${top.latestMarks} on this one` : ''}.`
    : 'Your losses on this paper are scattered rather than concentrated — work through the marked script itself.';

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
   marked pages' own palette and never asks what the viewer's device prefers.
   (A dark-mode query here would produce a black A4 page.) */
:root{--sheet:#fff;--ink:#1F1D1A;--ink-soft:#6B6257;--ink-faint:#98907F;
      --teach:#5B4636;--verdict:#C4342C;--earned:#1A7F37;--rule:#E7E1D5;
      --rail:#F1EBDE;--shade:#FDFBF6;}
*{box-sizing:border-box}
body{margin:0;background:var(--sheet);color:var(--ink);width:210mm;
     font-family:"Source Serif 4",Georgia,serif;font-size:14.5px;line-height:1.5;
     -webkit-font-smoothing:antialiased;padding:15mm 17mm;display:flex;flex-direction:column;min-height:297mm}
.masthead{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;
          padding-bottom:.55rem;border-bottom:1.5px solid var(--ink)}
.brand{font-family:"IBM Plex Mono",monospace;font-size:.64rem;font-weight:600;
       letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint)}
.paper-name{font-size:.78rem;color:var(--ink-soft);font-style:italic}
h1{font-size:2.05rem;font-weight:700;line-height:1.1;margin:.85rem 0 .2rem;letter-spacing:-.015em}
.student{font-size:.92rem;color:var(--ink-soft);margin:0 0 1rem}
.verdict{display:grid;grid-template-columns:auto 1fr;gap:0 1.4rem;align-items:center;
         background:var(--shade);border:1px solid var(--rule);border-left:4px solid var(--verdict);
         padding:.85rem 1.2rem;margin-bottom:1rem}
.score{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
       font-size:2.2rem;font-weight:600;line-height:1;white-space:nowrap}
.score .of{color:var(--ink-faint);font-weight:400}
.pct{font-family:"IBM Plex Mono",monospace;font-size:.7rem;color:var(--ink-faint);
     letter-spacing:.08em;margin-top:.28rem}
.verdict p{margin:0;font-size:.95rem}
.verdict strong{color:var(--teach)}
.why{display:grid;grid-template-columns:auto 1fr;gap:.75rem;align-items:start;
     border:1px dashed var(--rule);background:var(--rail);padding:.75rem .95rem;
     margin-bottom:1.15rem;font-size:.79rem;color:var(--teach);line-height:1.45}
.why .n{font-family:"IBM Plex Mono",monospace;font-size:1.45rem;font-weight:600;line-height:1}
.why p{margin:0}
h2{font-family:"IBM Plex Mono",monospace;font-size:.64rem;font-weight:600;letter-spacing:.16em;
   text-transform:uppercase;color:var(--ink-faint);margin:0 0 .28rem;padding-bottom:.42rem;
   border-bottom:1px solid var(--rule)}
.sub{font-size:.79rem;color:var(--ink-soft);margin:.38rem 0 .68rem;font-style:italic}
.themes{display:flex;flex-direction:column;margin-bottom:1.15rem}
.theme{display:grid;grid-template-columns:1.25rem 1fr auto;gap:0 .75rem;align-items:baseline;
       padding:.52rem 0 .52rem .2rem;border-bottom:1px solid var(--rule)}
.dot{width:.52rem;height:.52rem;border-radius:50%;align-self:center;justify-self:center}
.live .dot{background:var(--verdict)}
.eased .dot{background:transparent;border:1.5px solid var(--earned)}
.live{border-left:3px solid var(--verdict)}
.eased{border-left:3px solid var(--earned);opacity:.84}
.theme-title{font-size:.96rem;font-weight:600;line-height:1.3}
.eased .theme-title{font-weight:400}
.theme-note{grid-column:2/4;font-size:.81rem;color:var(--ink-soft);margin-top:.22rem}
.where{font-family:"IBM Plex Mono",monospace;font-size:.7rem;font-weight:600;color:var(--ink);
       letter-spacing:.02em;margin-right:.25rem}
/* KaTeX sets its own size; hold it to the sentence it sits in. */
.theme-note .katex{font-size:1em}
.tally{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
       font-size:.73rem;color:var(--ink-soft);white-space:nowrap}
.tally b{color:var(--ink);font-weight:600}
.flag{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:.56rem;
      letter-spacing:.1em;text-transform:uppercase;padding:.06rem .32rem;margin-left:.4rem;
      vertical-align:.12em;border:1px solid currentColor;color:var(--earned);font-weight:600}
.questions{display:flex;flex-direction:column;gap:.32rem;margin-bottom:1.1rem}
.q{display:grid;grid-template-columns:2.7rem 1fr 4rem;gap:.75rem;align-items:center}
.q-label{font-family:"IBM Plex Mono",monospace;font-size:.83rem;font-weight:600;
         font-variant-numeric:tabular-nums}
.bar{height:.52rem;background:var(--rail);position:relative;overflow:hidden}
.bar span{position:absolute;inset:0 auto 0 0;background:var(--verdict);opacity:.8}
.q-marks{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;
         font-size:.73rem;color:var(--ink-soft);text-align:right}
.close{margin-top:auto;border-top:1.5px solid var(--ink);padding-top:.8rem;
       font-size:.89rem;color:var(--teach)}
.close b{color:var(--ink)}
.meta{margin:.9rem 0 0;font-family:"IBM Plex Mono",monospace;font-size:.6rem;
      letter-spacing:.06em;color:var(--ink-faint)}
</style></head><body>
<div class="masthead">
  <span class="brand">Adrian's Math Tuition</span>
  <span class="paper-name">${esc(input.paperName || 'Marked paper')}${
    input.markedOn ? ` &middot; marked ${esc(input.markedOn)}` : ''}</span>
</div>
<h1>Where your marks went</h1>
<p class="student">${esc(input.studentName || '')}</p>
<div class="verdict">
  <div><div class="score">${input.awarded}<span class="of">/${input.max}</span></div>
       <div class="pct">${pct}%</div></div>
  <p>${lead}</p>
</div>
${whyNote(input.papersRead)}
<h2>What to work on</h2>
<p class="sub">Ordered by what you are still doing — not by what has cost you most.</p>
<div class="themes">${themes.map(themeRow).join('')}</div>
<h2>Where the marks went on this paper</h2>
<p class="sub">The questions that cost you most.</p>
<div class="questions">${(input.worstQuestions || []).slice(0, MAX_QUESTIONS).map(questionRow).join('')}</div>
${closingLine(input)}${input.papersRead < 2
  ? '<p class="meta">Read against this paper alone — the first one you have had marked here.</p>' : ''}
</body></html>`;
}
