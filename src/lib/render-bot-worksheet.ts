/**
 * src/lib/render-bot-worksheet.ts
 *
 * Adrian's house-style practice sheet, rendered to an A4 PDF for the bot's
 * worksheet-on-demand flow (POST /api/bot/worksheet). This lands in a parent's
 * WhatsApp/Telegram, so the typography is a straight port of what the iPad
 * kiosk prints (src/app/kiosk/KioskClient.tsx PRINT_CSS, itself calibrated on
 * paper with Adrian): Times New Roman at 9.5pt, navy caps brand over an orange
 * rule, centred uppercase topic, explicit question numbers in the left margin,
 * marks right-aligned at the margin, and blank marks-proportional working space
 * (no ruled lines — this is maths).
 *
 * Differences from the kiosk sheet, both required by the endpoint contract:
 *  - answers are NEVER inline; they go on a final Answers page (answers=true).
 *  - the stem-level marks read "[3 marks]" rather than the kiosk's bare "[3]".
 *
 * Markdown → HTML reuses mdToHtml from lib/render-worksheet; the fragments
 * flattenParts emits that a generic markdown pass would destroy (marks span,
 * working-space div, inline figures) are stashed/restored by lib/bot-worksheet.
 * Math is typeset by KaTeX auto-render inside Puppeteer, same as
 * lib/render-worksheet and lib/render-revise.
 */

import fs from 'fs';
import path from 'path';
import { getBrowser } from '@/lib/generate-pdf';
import { katexInlineHead, katexAutoRenderScript, waitForPageReady } from '@/lib/katex-inline';
import { mdToHtml } from '@/lib/render-worksheet';
import { protectWorksheetHtml, restoreWorksheetHtml } from '@/lib/bot-worksheet';

// Tinos = metric-compatible Times New Roman. The Vercel render lambda has no
// system TNR, which silently fell back to a sans (Adrian caught it, 2026-08-29).
// Until 7 Sep 2026 the sheet pulled Tinos from Google Fonts on every render —
// two CDN round trips (CSS, then woff2) on a cold Chromium, plus KaTeX from
// jsDelivr and a `networkidle0` wait with a 500 ms idle floor: ~3 s warm, 7 s
// cold for a 70 KB PDF. The four latin faces are 80 KB in @fontsource/tinos,
// so they are inlined as data URIs exactly like the KaTeX fonts, and nothing
// on the page touches the network any more.
let cachedTinos: string | null = null;
const TINOS_FACES: Array<[style: string, weight: number, file: string]> = [
  ['normal', 400, 'tinos-latin-400-normal.woff2'],
  ['italic', 400, 'tinos-latin-400-italic.woff2'],
  ['normal', 700, 'tinos-latin-700-normal.woff2'],
  ['italic', 700, 'tinos-latin-700-italic.woff2'],
];
/** `<style>` with the four Tinos faces embedded; '' if the package is missing
 * (the head then falls back to the Google Fonts link so a sheet still renders). */
export function tinosInlineStyle(): string {
  if (cachedTinos !== null) return cachedTinos;
  try {
    // Same guard as lib/katex-inline: inside a webpack bundle require.resolve
    // returns a module id, not a path; the real Node require on Vercel returns
    // the path (the package is in serverExternalPackages + traced into /api).
    // fontsource packages ship an `exports` map without `./package.json`, so
    // resolve one of the font files themselves; if that fails (webpack module
    // id, or exports blocking it) fall back to the traced node_modules path.
    let filesDir = path.join(process.cwd(), 'node_modules', '@fontsource', 'tinos', 'files');
    try {
      const resolved: unknown = require.resolve('@fontsource/tinos/files/tinos-latin-400-normal.woff2');
      if (typeof resolved === 'string') filesDir = path.dirname(resolved);
    } catch { /* keep the cwd fallback */ }
    const faces = TINOS_FACES.map(([style, weight, file]) => {
      const b64 = fs.readFileSync(path.join(filesDir, file)).toString('base64');
      return `@font-face{font-family:Tinos;font-style:${style};font-weight:${weight};font-display:block;` +
        `src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
    });
    cachedTinos = `<style>${faces.join('\n')}</style>`;
  } catch (e) {
    console.warn('[render-bot-worksheet] Tinos not inlined, falling back to Google Fonts:', (e as Error).message);
    cachedTinos = '';
  }
  return cachedTinos;
}

const NAVY = '#1c3a5e';
const ANSWER_ORANGE = '#843C0C'; // STYLE.md practice-answer colour

export interface BotWorksheetQuestion {
  id: string;
  markdown: string;
  marks: number | null;
  figureUrl: string | null;
  imageUrls: string[];
  answer: string;
}

export interface BotWorksheetInput {
  title: string;
  /** Human level label, e.g. 'A Math'. */
  levelLabel: string;
  topic: string;
  /** 'basic' | 'standard' | 'advanced' | null (= Mixed). */
  tier: string | null;
  /** Printed on the header line, e.g. '22 Aug 2026'. */
  dateLabel: string;
  questions: BotWorksheetQuestion[];
  /** Append the Answers page. */
  answers: boolean;
  /** Marks-proportional working space under each question (default). False = compact question list. */
  workspace?: boolean;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Working space apportioned to the marks — same calibration as the kiosk
 * (lib/kiosk-worksheet-images spaceMm): 17mm/mark, floor 36mm, cap 100mm.
 */
function spaceMm(marks: number | null): number {
  return Math.min(190, Math.max(44, (marks ?? 2) * 22));
}

/** Working space for ONE part — same 22mm/mark, smaller floor, so (a)(b)(c)
 *  each get room under them instead of one lump after the question.
 *  (Adrian, 2026-08-29, twice: "be more generous with the space".) */
function partSpaceMm(marks: number): number {
  return Math.min(150, Math.max(40, marks * 22));
}

/** One question's body: figures, then the markdown, then the marks tag. */
function questionHtml(q: BotWorksheetQuestion, index: number, workspace = true): string {
  const figures = [
    ...(q.figureUrl ? [q.figureUrl] : []),
    ...(q.figureUrl ? [] : q.imageUrls),
  ]
    .map((u) => `<img class="ws-figure" src="${esc(u)}" alt="question figure">`)
    .join('');

  const { src, stash } = protectWorksheetHtml(q.markdown);
  let body = restoreWorksheetHtml(mdToHtml(src), stash);

  // Word-style hanging indent for parts (Adrian, 2026-08-29): "(a) …" gets
  // its marker in a gutter and every wrapped line aligned with the text.
  body = body.replace(
    /<p>\((([a-h])|([ivx]{1,4}))\)\s*/g,
    (_m, label: string) => `<p class="ws-part"><span class="ws-pnum">(${label})</span>`,
  );

  // Part marks arrive as plain "[3]" at the end of each part's paragraph —
  // float them to the right margin like a real paper (Adrian, 2026-08-29:
  // "marks are not right-aligned"), and give EACH part its own
  // marks-proportional working space ("be more generous with the space").
  // Only a bracketed number that CLOSES a paragraph is a mark tag; [x+2]
  // mid-sentence maths never matches.
  let partMarks = 0;
  body = body.replace(/\[(\d{1,2})\]\s*(<\/p>)/g, (_m, n: string, close: string) => {
    partMarks += 1;
    const perPart = workspace
      ? `<div class="ws-answer-space" style="height:${partSpaceMm(parseInt(n, 10))}mm"></div>`
      : '';
    return `<span class="ws-mk">[${n}]</span>${close}${perPart}`;
  });

  // Parts carry their own [n] and their own spacer; a stem-only question gets
  // the total marks tag plus one marks-proportional block of working space.
  // When the parts just got their floated tags, the per-question total is
  // noise (the header already totals the sheet) — skip it.
  const hasOwnMarks = q.markdown.includes('ws-mk') || partMarks > 0;
  // Parts that just received their own spacers don't ALSO get the end lump.
  const hasOwnSpace = q.markdown.includes('ws-sp') || partMarks > 0;
  const marksTag = !hasOwnMarks && q.marks != null
    ? `<span class="ws-mk">[${q.marks} mark${q.marks === 1 ? '' : 's'}]</span>`
    : '';
  const space = hasOwnSpace || !workspace
    ? ''
    : `<div class="ws-answer-space" style="height:${spaceMm(q.marks)}mm"></div>`;

  // The marks tag belongs INSIDE the last paragraph — a float that trails a
  // closed <p> drops to a line of its own, which reads as a stray annotation
  // rather than an exam paper's right-margin mark allocation.
  const withMarks = marksTag
    ? (/<\/p>\s*$/.test(body) ? body.replace(/<\/p>(\s*)$/, `${marksTag}</p>$1`) : body + marksTag)
    : body;

  return `
    <li class="ws-q">
      <span class="ws-qnum">${index + 1}.</span>
      <div class="ws-q-body">${figures}${withMarks}</div>
      ${space}
    </li>`;
}

function answersHtml(questions: BotWorksheetQuestion[]): string {
  const rows = questions
    .map((q, i) => {
      // Bare answers — the page is already headed ANSWERS, so the inline
      // "[Ans: …]" wrapper is noise here (Adrian, 2026-08-29).
      const { src, stash } = protectWorksheetHtml(q.answer);
      return `<li class="ws-a"><span class="ws-anum">${i + 1}.</span><div class="ws-a-body">${restoreWorksheetHtml(mdToHtml(src), stash)}</div></li>`;
    })
    .join('\n');
  return `
  <section class="ws-answers">
    <div class="ws-answers-h">Answers</div>
    <ol class="ws-answer-list">${rows}</ol>
  </section>`;
}

export function buildBotWorksheetHTML(input: BotWorksheetInput): string {
  const { levelLabel, topic, tier, dateLabel, questions, answers, workspace = true } = input;
  const tierBit = tier && tier !== 'mixed' ? `${tier} · ` : '';
  const totalMarks = questions.reduce((s, q) => s + (q.marks ?? 0), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(input.title)}</title>
${tinosInlineStyle() || '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap">'}
${katexInlineHead()}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:15mm 22mm 13mm}
  html,body{background:#fff}
  body{
    color:#111;font-family:Tinos,"Times New Roman",Georgia,serif;
    font-size:11pt;line-height:1.5;
  }
  /* KaTeX defaults to 1.21em — maths printed ~11.5pt against 9.5pt prose and
     the whole sheet read oversized. Pin maths to the body size. */
  .katex{font-size:1em}
  p{margin:0 0 1.5pt}
  ul,ol{margin:2pt 0 3pt 0;padding-left:13pt}
  li{margin-bottom:1.5pt}
  hr{border:none;border-top:0.75pt solid #ccc;margin:4pt 0}
  table{border-collapse:collapse;margin:3pt 0}
  th,td{border:0.75pt solid #999;padding:2pt 6pt}

  /* Branded header (STYLE.md): navy caps brand + orange rule, grey level token,
     navy bold TYPE, big centred topic title. */
  .ws-header{margin-bottom:8pt}
  .ws-brand{text-align:center;color:${NAVY};font-weight:700;font-size:11.5pt;letter-spacing:.3em;border-bottom:1.1pt solid ${ANSWER_ORANGE};padding-bottom:2.5pt}
  .ws-line2{text-align:center;margin-top:3pt}
  .ws-lvl{color:#6E6E6E;font-size:8pt;letter-spacing:.2em}
  .ws-type{color:${NAVY};font-weight:700;font-size:9.5pt;letter-spacing:.26em;margin-left:9pt}
  .ws-topic{text-align:center;font-size:13.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:7pt 0 3pt}
  /* Clear air above the name row so a student's handwriting doesn't collide
     with the divider (Adrian, 2026-08-29: "give more space above name too"). */
  .ws-namebar{display:flex;justify-content:space-between;align-items:flex-end;gap:10pt;font-size:10.5pt;margin-top:9pt;padding-top:18pt;border-top:0.5pt solid #ccc}
  .ws-nameline{flex:1;display:flex;align-items:flex-end;gap:4pt}
  .ws-nameblank{flex:1;max-width:220pt;border-bottom:0.75pt solid #111;height:18pt}
  .ws-datemeta{color:#6E6E6E;text-transform:capitalize}

  /* Explicit numbering (::marker misplaces itself on tall/figure-first questions). */
  .ws-questions{list-style:none;padding-left:18pt;margin:0}
  .ws-q{margin-bottom:5pt;break-inside:avoid;position:relative}
  .ws-qnum{position:absolute;left:-18pt;top:0;font-weight:700}
  .ws-q-body{display:block}
  .ws-q-body p{display:block;margin:0 0 1.5pt}
  /* Figures print generously — grids especially must be big enough to plot on. */
  .ws-figure,.ws-q-body img{display:block;max-width:100%;max-height:300pt;margin:5pt 0}

  /* Marks right-aligned at the margin, exam style. */
  .ws-mk{float:right;font-weight:400}
  /* Word-style hanging indent for parts: marker in a gutter, wrapped lines
     aligned with the part's own text. */
  .ws-part{position:relative;padding-left:17pt;margin-top:3pt}
  .ws-pnum{position:absolute;left:0}
  /* Working space: blank, no lines; heights set inline (∝ marks). */
  .ws-sp,.ws-answer-space{display:block;clear:both}
  /* Compact list mode: part-level spacers flatten too; questions breathe a little. */
  .ws-compact .ws-sp{display:none}
  .ws-compact .ws-q{margin-bottom:9pt}

  /* Answers — always a page of their own, never inline next to the question. */
  .ws-answers{break-before:page;page-break-before:always;padding-top:2pt}
  .ws-answers-h{color:${NAVY};font-weight:700;font-size:11pt;letter-spacing:.24em;text-transform:uppercase;border-bottom:0.9pt solid ${ANSWER_ORANGE};padding-bottom:2.5pt;margin-bottom:7pt}
  .ws-answer-list{list-style:none;padding-left:18pt;margin:0}
  .ws-a{position:relative;margin-bottom:4pt;break-inside:avoid;color:${ANSWER_ORANGE}}
  .ws-a .katex{color:${ANSWER_ORANGE}}
  .ws-anum{position:absolute;left:-18pt;top:0;font-weight:700;color:#111}
  .ws-a-body p{margin:0}

  .ws-footer{margin-top:10pt;padding-top:4pt;border-top:0.75pt solid #999;display:flex;justify-content:space-between;font-size:8pt}
  .ws-foot-brand{color:${NAVY};font-weight:700;letter-spacing:.12em}
  .ws-foot-url{color:#6E6E6E}
</style>
</head>
<body class="${workspace ? '' : 'ws-compact'}">
  <div class="ws-header">
    <div class="ws-brand">ADRIAN&rsquo;S MATH TUITION</div>
    <div class="ws-line2">
      <span class="ws-lvl">${esc(levelLabel.toUpperCase())}</span>
      <span class="ws-type">PRACTICE WORKSHEET</span>
    </div>
    <div class="ws-topic">${esc(topic)}</div>
    <div class="ws-namebar">
      <span class="ws-nameline">Name:<span class="ws-nameblank"></span></span>
      <span class="ws-datemeta">${esc(tierBit)}${esc(dateLabel)}${totalMarks > 0 ? ` · ${totalMarks} marks` : ''}</span>
      <span>Date: ______________</span>
    </div>
  </div>

  <ol class="ws-questions">
${questions.map((q, i) => questionHtml(q, i, workspace)).join('\n')}
  </ol>

  <div class="ws-footer">
    <span class="ws-foot-brand">Adrian&rsquo;s Math Tuition</span>
    <span class="ws-foot-url">adrianmathtuition.com</span>
  </div>
${answers ? answersHtml(questions) : ''}
${katexAutoRenderScript()}
</body>
</html>`;
}

export async function renderBotWorksheetPDF(
  input: BotWorksheetInput,
  timings?: Record<string, number>,
): Promise<Buffer> {
  let tLast = Date.now();
  const lap = (k: string) => { if (!timings) return; const now = Date.now(); timings[k] = now - tLast; tLast = now; };
  const html = buildBotWorksheetHTML(input);
  lap('html');
  const browser = await getBrowser();
  lap('browser');
  const page = await browser.newPage();
  lap('newPage');
  try {
    // Nothing on the page loads from the network (fonts + KaTeX are inlined),
    // so 'load' fires as soon as the DOM is parsed; waitForPageReady then waits
    // for the auto-render flag, document.fonts and any bank figures.
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    lap('setContent');
    await waitForPageReady(page);
    lap('ready');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    lap('pdf');
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
