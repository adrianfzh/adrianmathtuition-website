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
import { overCount } from './paper-total-text';

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
  /** `topic` = the marker's topic for the question, already cut to size by
   *  paper-analysis `topicLabel`; absent on runs from before the field. */
  worstQuestions: { question: string; lost: number; max: number; topic?: string }[];
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
  /** The paper was re-marked (10 Sep 2026): which pages (1-based; null = the whole
   *  paper) and when. The cover wears a REMARKED badge and says the changed parts
   *  are in purple — the pen inks them so (bot annotate.js REMARK_INK). */
  remarked?: { pages: number[] | null; at: string | null } | null;
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
    <span class="tally"><b>&minus;${t.marks}</b> mark${t.marks === 1 ? '' : 's'}</span>
    <p class="theme-note">${note}</p>${t.gap ? `
    <p class="theme-gap">Gap: ${quote(t.gap)}</p>` : ''}
  </div>`;
}

// Adrian, 3 Sep 2026: "it will be useful to say what topic Q9 is on the cover
// page". The topic sits in its own column between the label and the bar, one
// line, clipped with an ellipsis — the row never grows taller, so the one-A4
// rule holds. The column exists only when at least one row has a topic:
// older runs render exactly as they did.
// The bar is MARKS LOST, absolute — the longest bar is the question that cost
// the most, at a glance (Adrian, 5 Sep 2026: "it is showing a percentage, should
// show absolute marks lost"). Scaled to the worst question on the page, so the
// top row is always full width; the label says the loss first and the question's
// worth second.
function questionRow(q: { question: string; lost: number; max: number; topic?: string }, withTopics: boolean, maxLost: number): string {
  const pct = maxLost > 0 ? Math.round((q.lost / maxLost) * 100) : 0;
  const topic = withTopics ? `<span class="q-topic">${esc(q.topic || '')}</span>` : '';
  return `<div class="q">
    <span class="q-label">${esc(q.question)}</span>${topic}
    <span class="bar"><span style="width:${pct}%"></span></span>
    <span class="q-marks"><b>&minus;${q.lost}</b> mark${q.lost === 1 ? '' : 's'} <span class="q-of">of ${q.max}</span></span>
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
/** "10 Sep 2026" from an ISO stamp, Singapore's day; '' when unreadable. */
function remarkDate(at: string | null | undefined): string {
  if (!at) return '';
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  // Month names by hand: ICU's en-GB says "Sept", and the page should read the same on every machine.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find(x => x.type === type)?.value);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = get('day'), m = get('month'), y = get('year');
  return Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y) ? `${d} ${M[m - 1]} ${y}` : '';
}

/** The rounded REMARKED badge beside the title (Adrian, 10 Sep 2026: "REMARKED in a rectangular rounded box or something so it is clear to the student"). */
export function remarkBadge(r: FrontPageInput['remarked']): string {
  if (!r) return '';
  return `<style>.remark-badge{display:inline-block;margin-left:.6rem;vertical-align:middle;font-family:"IBM Plex Mono",monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#fff;background:#7c3aed;border-radius:999px;padding:.22rem .65rem .2rem}</style><span class="remark-badge">Remarked</span>`;
}

/** One line under the title: which pages, when, and that the changes are in purple. */
export function remarkLine(r: FrontPageInput['remarked']): string {
  if (!r) return '';
  const pages = Array.isArray(r.pages) ? r.pages.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b) : [];
  const where = pages.length ? `page${pages.length === 1 ? '' : 's'} ${pages.join(', ')}` : 'the whole paper';
  const when = remarkDate(r.at);
  return `<style>.remark-line{margin:-.25rem 0 .7rem;font-size:.85rem;color:#5b21b6}.remark-line b{font-weight:700}</style>`
    + `<p class="remark-line">Re-marked${when ? ` on ${when}` : ''}: ${where}. What changed since the last marking is in <b>purple</b>.</p>`;
}

/** O-Level grade band for a percentage — the bands every Sec 4 student knows. */
export function oLevelGrade(pct: number): string {
  if (pct >= 75) return 'A1';
  if (pct >= 70) return 'A2';
  if (pct >= 65) return 'B3';
  if (pct >= 60) return 'B4';
  if (pct >= 55) return 'C5';
  if (pct >= 50) return 'C6';
  if (pct >= 45) return 'D7';
  if (pct >= 40) return 'E8';
  return 'F9';
}

/** A JC / H2 paper is not graded on the O-Level bands; the band line is left off it. */
function looksLikeJc(paperName: string | null | undefined): boolean {
  return /\b(H[12]|JC[12]?|A[- ]?Level)\b/i.test(String(paperName || ''));
}

/**
 * The careless slips, said with the score they cost (Adrian, 10 Sep 2026: "put on
 * the analysis page if there are a lot of marks lost through arithmetic slips,
 * careless mistakes, transfer errors … especially if that takes up a large chunk of
 * marks lost — just avoiding those errors will lead to improvement in grades").
 * Always: the score without them. When they are a third or more of the marks lost
 * (and at least 3), the line becomes a highlighted box that also names the grade
 * band the paper would move to. Pure.
 */
export function carelessCallout(
  t: ErrorKindTotals,
  score: { awarded: number; max: number } | null,
  paperName?: string | null,
): { big: boolean; html: string } {
  const c = t.careless;
  if (c <= 0) return { big: false, html: '' };
  const lost = Math.max(t.lostTotal || 0, t.concept + t.careless + t.incomplete + t.unlabelled);
  const big = c >= 3 && c * 3 >= lost;
  const n = (k: ErrorKind) => t.byKind[k];
  const detail = CARELESS_KINDS.filter(k => n(k) > 0).map(k => `${ERROR_KIND_LABEL[k]} ${n(k)}`).join(', ');
  const first = `${c} mark${c === 1 ? ' was a' : 's were'} careless slip${c === 1 ? '' : 's'} &mdash; the method was right.`;
  let tail = '';
  if (score && score.max > 0 && score.awarded >= 0) {
    const would = Math.min(score.max, score.awarded + c);
    const pctNow = Math.round((score.awarded / score.max) * 100);
    const pctWould = Math.round((would / score.max) * 100);
    tail = ` Without them: <b>${would}/${score.max}</b> (${pctWould}%)`;
    if (big && !looksLikeJc(paperName)) {
      const g0 = oLevelGrade(pctNow), g1 = oLevelGrade(pctWould);
      tail += g1 !== g0 ? ` &mdash; from ${g0} to <b>${g1}</b>.` : ` &mdash; still ${g0}, but every one of those marks is yours to keep.`;
    } else tail += '.';
  }
  if (!big) return { big: false, html: `<p class="kinds-sub">${first}${tail}</p>` };
  const share = lost > 0 ? Math.round((c / lost) * 100) : 0;
  return {
    big: true,
    html: `<p class="kinds-big kinds-sub"><span class="kinds-big-tag">Careless slips</span>${first} That is ${c} of the ${lost} marks you lost (${share}%)${detail ? ` &mdash; ${detail}` : ''}.${tail} Avoiding those alone lifts the grade.</p>`,
  };
}

function kindsRow(t: ErrorKindTotals | null | undefined, score: { awarded: number; max: number } | null = null, paperName?: string | null): string {
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
  const callout = carelessCallout(t!, score, paperName);
  const sub = callout.html;
  return `<style>
.kinds{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .5rem;margin:-.3rem 0 ${sub ? '.3rem' : '1.1rem'};
       padding:.45rem .85rem;background:var(--shade);border:1px solid var(--rule);font-size:.8rem;color:var(--ink-soft)}
.kinds-tag{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:.6rem;letter-spacing:.16em;
           text-transform:uppercase;color:var(--ink-faint);margin-right:.3rem}
.kinds b{color:var(--ink);font-weight:600}
.kinds i{font-style:normal;color:var(--ink-faint)}
.kinds .dot{color:var(--ink-faint)}
.kinds-sub{margin:0 0 1.1rem .85rem;font-size:.8rem;font-style:italic;color:var(--teach)}
.kinds-big{margin:.1rem 0 1.1rem;padding:.55rem .85rem;font-style:normal;color:var(--ink);background:#fff7ed;border:1px solid #fdba74;border-left:4px solid #ea580c;line-height:1.45}
.kinds-big b{font-weight:700}
.kinds-big-tag{display:block;font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:#c2410c;margin-bottom:.15rem}
</style>
<div class="kinds"><span class="kinds-tag">Marks lost</span> ${cells.join(' <span class="dot">&middot;</span> ')}</div>
${sub}`;
}

/**
 * The score tile. Normally `60/90` over `67%`.
 *
 * When the marks add up to MORE than the paper holds (Adrian, 3 Sep 2026, on
 * Kassandra's 92/90: "92 out of 90 is not possible … build it"), the page must
 * never print a clean score: `92 of 90` — "of", not a slash — no percentage, and
 * a small red `needs a check` tag where the percentage was. The tag's style rides
 * inside this branch (as the kinds row's does) so every normal cover is
 * byte-identical to the one it printed yesterday. The rule itself is
 * `overCount` in lib/paper-total-text.ts, shared with the PAPER TOTAL strip.
 */
function badge(input: FrontPageInput): string {
  if (overCount(input)) {
    return `<style>
.check-tag{font-family:"IBM Plex Mono",monospace;font-size:.6rem;font-weight:600;letter-spacing:.16em;
           text-transform:uppercase;color:var(--verdict);margin-top:.32rem}
</style><div class="badge"><div class="score">${input.awarded}<span class="of"> of ${input.max}</span></div>
       <div class="check-tag">needs a check</div></div>`;
  }
  const pct = input.max > 0 ? Math.round((input.awarded / input.max) * 100) : 0;
  return `<div class="badge"><div class="score">${input.awarded}<span class="of">/${input.max}</span></div>
       <div class="pct">${pct}%</div></div>`;
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
  const themes = chooseThemes(input.themes || []);
  const worst = (input.worstQuestions || []).slice(0, MAX_QUESTIONS);
  const withTopics = worst.some(q => !!(q.topic || '').trim());
  const maxLost = worst.reduce((m, q) => Math.max(m, q.lost), 0);
  const top = themes[0];
  // A score above the total outranks the top theme: the student must read that the
  // number is being checked before they read anything built on it. Student words —
  // the pages they hold are right; only the total is not final.
  const lead = overCount(input)
    ? 'The marks add up to more than this paper holds, so this score is being checked — the marked pages are right; the total is not final.'
    // Only slips reached the cover (every teach skill was demoted, or the sheet
    // had none): the student's method was right wherever marks went, so there
    // is no "one thing to learn" — say that, and send them to the marked lines.
    // The MARKS LOST row still shows the size of it (Adrian, 10 Sep 2026).
    : top && top.tier === 'show'
    ? 'Your method was right on every question where you lost marks on this paper — the marks went to slips, not to anything you have to learn. Read the marked lines.'
    : top
    ? `The one thing worth your time is <strong>${esc(top.title.split('—')[0].trim().toLowerCase())}</strong>.
       It cost you ${top.marks} mark${top.marks === 1 ? '' : 's'} on this paper.`
    : 'Your losses on this paper are scattered rather than concentrated — work through the marked script itself.';
  const sub = input.themesSource === 'sheet'
    ? 'In the order your practice sheet takes them — with a note on each.'
    : 'Ordered by what cost you most, with the marker\'s own note on each.';

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
.theme-gap{grid-column:2/4;font-size:.8rem;font-weight:600;color:#9a3412;margin:.12rem 0 0}
.where{font-family:"IBM Plex Mono",monospace;font-size:.7rem;font-weight:600;color:var(--ink);
       letter-spacing:.02em;margin-right:.25rem}
/* KaTeX sets its own size; hold it to the sentence it sits in. */
.theme-note .katex{font-size:1em}
.questions{display:flex;flex-direction:column;gap:.32rem;margin-bottom:1.1rem}
.q{display:grid;grid-template-columns:2.7rem 1fr 6.2rem;gap:.75rem;align-items:center}
.questions.with-topics .q{grid-template-columns:2.7rem 11.5rem 1fr 6.2rem}
.q-marks b{color:var(--ink);font-weight:600}
.q-of{color:var(--ink-soft);opacity:.8}
.q-topic{font-size:.78rem;color:var(--ink-soft);white-space:nowrap;overflow:hidden;
         text-overflow:ellipsis;min-width:0}
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
  ${badge(input)}
  <div>
    <p class="student">${esc(input.studentName || '')}</p>
    <h1>Where your marks went${remarkBadge(input.remarked)}</h1>${remarkLine(input.remarked)}
    <p class="verdict">${lead}</p>
  </div>
</div>
${kindsRow(input.errorKinds, { awarded: input.awarded, max: input.max }, input.paperName)}<div class="sec-work">
<h2>What to work on</h2>
<p class="sub">${sub}</p>
<div class="themes">${themes.map(themeRow).join('')}</div>
</div>
<div class="sec-where">
<h2>Where the marks went</h2>
<p class="sub">The questions that cost you most.</p>
<div class="questions${withTopics ? ' with-topics' : ''}">${worst.map(q => questionRow(q, withTopics, maxLost)).join('')}</div>
</div>
${closingLine(input)}
</div>
</body></html>`;
}
