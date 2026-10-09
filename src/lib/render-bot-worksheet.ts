/**
 * src/lib/render-bot-worksheet.ts
 *
 * The house-style practice sheet as an A4 PDF — ONE renderer and ONE
 * stylesheet for every door that makes a questions-only sheet (9 Oct 2026,
 * Adrian: one kitchen per job): the worksheet picker's PDF (POST
 * /api/admin/questions {action:'worksheet', style:'plain'}) and the Telegram
 * /ws kind-3 sheet (POST /api/bot/worksheet). The layout is measured against
 * the create-worksheet skill's Word file (worksheet_lib.py) and matches the
 * picker's own Word builder (lib/pick-worksheet-docx.ts) number for number:
 * Times New Roman 9.5 pt at 1.5 lines, A4 with 2 / 1 / 2.5 / 2.5 cm margins,
 * a 12 pt navy centred title over a 10 pt italic subtitle, "1." at the margin
 * with its text at 1.0 cm, parts "(a)" at 1.0 cm with their text at 2.0 cm,
 * marks "[n]" right-aligned at 15.5 cm, blank working space of 4 lines a mark
 * (5 for a [1]), figures at most 10.5 x 8 cm, and ONE orange right-aligned
 * [Ans: …] line at the end of each question when answers are inline.
 *
 * Until 9 Oct 2026 this file carried the kiosk's branded masthead (navy caps
 * brand over an orange rule, name bar, footer) at 11 pt — the "new format"
 * Adrian turned down on 4 Oct 2026 ("just give me a regular format
 * worksheet"); the picker's plain style is now the only style, and the
 * `plain` option just supplies the subtitle.
 *
 * The bank-made sheet (kind 3) keeps its contract: answers never inline, on a
 * final Answers page (answers=true). Markdown → HTML reuses mdToHtml from
 * lib/render-worksheet; the fragments flattenParts emits that a generic
 * markdown pass would destroy (marks span, working-space div, inline figures)
 * are stashed/restored by lib/bot-worksheet. Math is typeset by KaTeX
 * auto-render inside Puppeteer, same as lib/render-worksheet and
 * lib/render-revise.
 */

import fs from 'fs';
import path from 'path';
import { getBrowser } from '@/lib/generate-pdf';
import { katexInlineHead, katexAutoRenderScript, waitForPageReady } from '@/lib/katex-inline';
import { mdToHtml } from '@/lib/render-worksheet';
import { protectWorksheetHtml, restoreWorksheetHtml } from '@/lib/bot-worksheet';
import { workingLines } from '@/lib/pick-worksheet';
import { brandLevelInfo, MONO_DRAIN, type BrandPrint } from '@/lib/worksheet-brand';
import { brandMastheadHtml, brandFontFaces, brandFooterTemplate, brandHeaderTemplate, EMPTY_TEMPLATE } from '@/lib/render-brand-masthead';

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
  /**
   * The picker's own subtitle line. Since 9 Oct 2026 every sheet prints the
   * regular format (navy title, italic subtitle — Adrian, 4 Oct 2026: "just
   * give me a regular format worksheet"); without this the subtitle is built
   * from level · topic · tier · date · marks (sheetSubtitle).
   */
  plain?: { subtitle: string };
  /**
   * One orange right-aligned `[Ans: …]` line at the END of each question —
   * the house sheet (worksheet_lib.py); never per part. `answers` (the
   * separate Answers page) is ignored when this is set.
   */
  answersInline?: boolean;
  /**
   * The brand header switch (OFF unless set — Adrian, 9 Oct 2026: "default
   * should not be in"): the series masthead of ADRIAN-STYLE.md §9 for `level`
   * (a questions.level / /ws token) in colour or black and white, in place of
   * the title + subtitle, with the footer "AdrianMath Tuition · … | Page x of
   * y" and a running header from page 2. A level with no design prints the
   * regular format. lib/render-brand-masthead.ts draws it.
   */
  brand?: { mode: BrandPrint; level: string };
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One body line: 9.5 pt on 1.5 spacing (worksheet_lib Worksheet.LINE_PT). */
const LINE_PT = 9.5 * 1.5;

/** Blank writing space in pt: 4 lines a mark, one more for a [1] — the
 *  create-worksheet house rule (lib/pick-worksheet workingLines). */
function spacePt(marks: number | null): number {
  return workingLines(marks) * LINE_PT;
}

/** One question's body: figures, then the markdown, then the marks tag. */
function questionHtml(q: BotWorksheetQuestion, index: number, workspace = true, answersInline = false): string {
  const figures = [
    ...(q.figureUrl ? [q.figureUrl] : []),
    ...(q.figureUrl ? [] : q.imageUrls),
  ]
    .map((u) => `<img class="ws-figure" src="${esc(u)}" alt="question figure">`)
    .join('');

  const { src, stash } = protectWorksheetHtml(q.markdown);
  let body = restoreWorksheetHtml(mdToHtml(src), stash);

  // Parts under the question's TEXT, as the Word file prints them: "(a)" at
  // 1.0 cm with its text at 2.0 cm, a sub-part "(b)(i)" one tab further
  // showing only "(i)". The bank's label arrives bold ("**(a)**", the picker
  // and the kiosk flattening) or bare ("(a)").
  body = body.replace(
    /<p>(?:<strong>)?((?:\((?:[a-h]|[ivx]{1,4})\))+)(?:<\/strong>)?\s*/g,
    (_m, label: string) => {
      const groups = label.match(/\([^)]*\)/g) ?? [label];
      const depth = Math.min(groups.length - 1, 2);
      return `<p class="ws-part ws-d${depth}"><span class="ws-pnum">${groups[groups.length - 1]}</span>`;
    },
  );

  // Part marks: a bare "[3]" that CLOSES a paragraph (the picker's markdown)
  // or the kiosk's <span class="ws-mk">[3]</span>; each marked part then gets
  // its own blank writing space. [x+2] mid-sentence maths never matches.
  // The kiosk flattening's own mm spacer (one per marked part) goes: the
  // marked part gets the house space instead.
  body = body.replace(/<p>\s*<div class="ws-sp"[^>]*><\/div>\s*<\/p>|<div class="ws-sp"[^>]*><\/div>/g, '');
  let partMarks = 0;
  body = body.replace(/(?:\[(\d{1,2})\]|<span class="ws-mk">\[(\d{1,2})\]<\/span>)\s*(<\/p>)/g, (_m, a: string | undefined, b: string | undefined, close: string) => {
    partMarks += 1;
    const n = parseInt(a ?? b ?? '0', 10);
    const perPart = workspace ? `<div class="ws-answer-space" style="height:${spacePt(n)}pt"></div>` : '';
    return `<span class="ws-mk">[${n}]</span>${close}${perPart}`;
  });

  // A stem-only question gets the total marks tag and one block of space.
  const hasOwnMarks = partMarks > 0;
  const marksTag = !hasOwnMarks && q.marks != null ? `<span class="ws-mk">[${q.marks}]</span>` : '';
  const space = hasOwnMarks || !workspace ? '' : `<div class="ws-answer-space" style="height:${spacePt(q.marks)}pt"></div>`;

  // The marks tag belongs INSIDE the last paragraph — a float that trails a
  // closed <p> drops to a line of its own.
  const withMarks = marksTag
    ? (/<\/p>\s*$/.test(body) ? body.replace(/<\/p>(\s*)$/, `${marksTag}</p>$1`) : body + marksTag)
    : body;

  // The inline answer line: markdown through the same stash/restore as the
  // question so its maths typesets; an empty answer (a proof) prints nothing.
  let ansLine = '';
  if (answersInline && q.answer.trim() && q.answer.trim() !== '—') {
    const a = protectWorksheetHtml(q.answer.trim());
    const inner = restoreWorksheetHtml(mdToHtml(a.src), a.stash).replace(/^<p>|<\/p>$/g, '');
    ansLine = `<div class="ws-ans">[Ans: ${inner}]</div>`;
  }

  // "1." sits INSIDE the first paragraph as a hanging inline-block, so it
  // shares that line's baseline (an absolutely placed number floated above
  // a line that opens with a column vector or a fraction). A question that
  // opens with a figure gets a bare number line above it, like the Word file.
  const num = `<span class="ws-qnum">${index + 1}.</span>`;
  let numbered = !figures && /^\s*<p\b/.test(withMarks)
    ? withMarks.replace(/^(\s*<p(?: [^>]*)?>)/, `$1${num}`)
    : `<p class="ws-qline">${num}</p>${figures}${withMarks}`;

  // A part's text travels with its working space, and the answer line with the
  // last of them — a question taller than a page breaks BETWEEN parts, never
  // between a part and its space, and the orange [Ans:] line never lands alone
  // on a page of its own (e4a43f26, Adrian's H2 vectors sheet, 9 Oct 2026: two
  // pages held nothing but the answer line). The Word file does the same with
  // keepNext on every blank line but a part's last, and on the last part's last.
  numbered = numbered.replace(/(<p class="ws-part[^"]*">(?:(?!<\/p>)[\s\S])*<\/p>)(\s*<div class="ws-answer-space"[^>]*><\/div>)/g, '<div class="ws-keep">$1$2</div><!--keep-->');
  let tail = `${space}${ansLine}`;
  if (ansLine && !space) {
    const i = numbered.lastIndexOf('</div><!--keep-->');
    if (i >= 0) { numbered = numbered.slice(0, i) + ansLine + numbered.slice(i); tail = ''; }
  } else if (ansLine && space) {
    tail = `<div class="ws-keep">${space}${ansLine}</div>`;
  }
  return `
    <li class="ws-q">
      <div class="ws-q-body">${numbered}</div>
      ${tail}
    </li>`;
}

function answersHtml(questions: BotWorksheetQuestion[]): string {
  const rows = questions
    .map((q, i) => {
      // Bare answers — the page is already headed Answers, so the inline
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

/** The subtitle a bank-made sheet prints under its title when the caller
 *  gives none: level · topic · tier · date · marks. */
export function sheetSubtitle(input: Pick<BotWorksheetInput, 'title' | 'levelLabel' | 'topic' | 'tier' | 'dateLabel' | 'questions'>): string {
  const totalMarks = input.questions.reduce((s, q) => s + (q.marks ?? 0), 0);
  const tierBit = input.tier && input.tier !== 'mixed' ? input.tier.charAt(0).toUpperCase() + input.tier.slice(1) : null;
  const topic = input.topic && input.topic !== input.title ? input.topic : null;   // the admin route passes the title as the topic
  return [input.levelLabel, topic, tierBit, input.dateLabel, totalMarks > 0 ? `${totalMarks} marks` : null].filter(Boolean).join(' · ');
}

/** The brand design a sheet prints with, or null for the regular format. */
export function brandOf(input: Pick<BotWorksheetInput, 'brand'>) {
  const lv = input.brand ? brandLevelInfo(input.brand.level) : null;
  return input.brand && lv ? { mode: input.brand.mode, lv } : null;
}

export function buildBotWorksheetHTML(input: BotWorksheetInput): string {
  const { questions, workspace = true, plain, answersInline = false } = input;
  const answers = input.answers && !answersInline;
  const subtitle = plain ? plain.subtitle : sheetSubtitle(input);
  const brand = brandOf(input);
  const masthead = brand
    ? brandMastheadHtml({ mode: brand.mode, lv: brand.lv, topic: input.topic || input.title, subtitle, nQuestions: questions.length, marks: questions.reduce((s, q) => s + (q.marks ?? 0), 0) || null })
    : null;
  const ansColor = brand?.mode === 'mono' ? '#' + MONO_DRAIN : ANSWER_ORANGE;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(input.title)}</title>
${tinosInlineStyle() || '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap">'}
${katexInlineHead()}
<style>
  /* ONE stylesheet for every door (the picker's sheet and the /ws kind-3
     sheet), measured against the create-worksheet house file
     (worksheet_lib.py) — the same numbers as lib/pick-worksheet-docx.ts. */
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:20mm 25mm 10mm 25mm}
  html,body{background:#fff}
  body{
    color:#111;font-family:Tinos,"Times New Roman",Georgia,serif;
    font-size:9.5pt;line-height:1.5;
  }
  /* KaTeX defaults to 1.21em; pin maths to the body size. */
  .katex{font-size:1em}
  p{margin:0}
  ul,ol{margin:2pt 0 3pt 0;padding-left:13pt}
  li{margin-bottom:0}
  hr{border:none;border-top:0.75pt solid #ccc;margin:4pt 0}
  table{border-collapse:collapse;margin:2pt 0}
  th,td{border:0.75pt solid #999;padding:2pt 6pt}

  /* Title block: 12 pt bold navy, 6 pt after; 10 pt italic subtitle, 8 pt after. */
  .ws-title{text-align:center;color:${NAVY};font-weight:700;font-size:12pt;margin-bottom:6pt}
  .ws-sub{text-align:center;font-style:italic;font-size:10pt;margin-bottom:8pt}

  /* "1." at the margin, the text at 1.0 cm. The number is a hanging
     inline-block inside the first line (not ::marker, not absolute), so it
     sits on that line's baseline even when the line opens with a tall vector. */
  .ws-questions{list-style:none;padding-left:10mm;margin:0}
  .ws-q{break-inside:avoid}
  .ws-qnum{display:inline-block;width:10mm;margin-left:-10mm}
  .ws-q-body{display:block}
  .ws-q-body p{display:block;margin:0}
  /* A part: "(a)" at 1.0 cm, text at 2.0 cm; a sub-part one tab further. */
  .ws-part{padding-left:10mm}
  .ws-part.ws-d1{padding-left:20mm}
  .ws-part.ws-d2{padding-left:30mm}
  .ws-pnum{display:inline-block;width:10mm;margin-left:-10mm}
  /* a question with no stem: "1." then "(a)" on the one line */
  .ws-part .ws-qnum{margin-left:-20mm}
  .ws-part.ws-d1 .ws-qnum{margin-left:-30mm}
  .ws-qnum + .ws-pnum{margin-left:0}
  /* Marks "[n]" right-aligned at 15.5 cm — 5 mm short of the right margin —
     and the marked line stops 14 mm short of the edge so the tag never
     collides with the text (worksheet_lib right_indent 1.4 cm). */
  .ws-mk{float:right;font-weight:400;margin-right:-9mm}
  .ws-q-body p:has(> .ws-mk){padding-right:14mm}
  /* Figures: centred, at most 10.5 cm wide and 8 cm tall, never upscaled, 4 pt above and below. */
  .ws-figure,.ws-q-body img{display:block;max-width:105mm;max-height:80mm;margin:4pt auto}
  /* Working space: blank, no lines; heights set inline (4 lines a mark). */
  .ws-sp,.ws-answer-space{display:block;clear:both}
  .ws-keep{break-inside:avoid}
  .ws-compact .ws-sp{display:none}
  .ws-compact .ws-q{margin-bottom:0}
  /* With working space, every question after the first starts on a fresh
     page — the GCE paper's rule (Adrian, 9 Oct 2026: "the working spaces and
     questions don't straddle across pages"); a compact sheet flows on. The
     first question flows under the title (never a title-only page 1). */
  .ws-q:first-child{break-inside:auto}
  body:not(.ws-compact) .ws-q + .ws-q{break-before:page;page-break-before:always}
  /* On a page-per-question sheet the question block itself may break (between
     its glued .ws-keep parts): an unbreakable-but-too-tall outer block made the
     server's Chromium ignore the inner keep rules and cut anywhere — the preview
     printed the [Ans:] line alone on a page while local Chrome did not (9 Oct 2026). */
  body:not(.ws-compact) .ws-q{break-inside:auto}

  /* Inline answer line: ONE orange right-aligned [Ans: …] at the end of the question. */
  .ws-ans{text-align:right;color:${ansColor};clear:both}
  .ws-ans .katex{color:${ansColor}}

  /* Answers — a page of their own (the bank-made sheet; never inline there). */
  .ws-answers{break-before:page;page-break-before:always;padding-top:2pt}
  .ws-answers-h{color:${NAVY};font-weight:700;font-size:12pt;text-align:center;margin-bottom:6pt}
  .ws-answer-list{list-style:none;padding-left:10mm;margin:0}
  .ws-a{position:relative;margin-bottom:0;break-inside:avoid;color:${ansColor}}
  .ws-a .katex{color:${ansColor}}
  .ws-anum{position:absolute;left:-10mm;top:0;color:#111}
  .ws-a-body p{margin:0}
${masthead ? `
  /* Branded: room for the footer on every page and the running header from page 2
     (Puppeteer templates, drawn in the margins — lib/render-brand-masthead.ts). */
  @page{margin:24mm 25mm 17mm 25mm}
  @page :first{margin-top:20mm}
  ${masthead.css}` : ''}
</style>
${masthead ? `<style>${brandFontFaces()}</style>` : ''}
</head>
<body class="${workspace ? '' : 'ws-compact'}">
${masthead ? masthead.html : `  <div class="ws-title">${esc(input.title)}</div>
  ${subtitle ? `<div class="ws-sub">${esc(subtitle)}</div>` : ''}`}

  <ol class="ws-questions">
${questions.map((q, i) => questionHtml(q, i, workspace, answersInline)).join('\n')}
  </ol>
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

    const brand = brandOf(input);
    if (!brand) {
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      lap('pdf');
      return Buffer.from(pdf);
    }
    // Branded: the footer on every page, the running header from page 2 only
    // (Word's "different first page"). Puppeteer draws one header on every
    // page, so the sheet is printed twice from the one laid-out page — once
    // with a blank header, once with the running header — and page 1 of the
    // first is joined to pages 2+ of the second (pdf-lib). Same CSS both times,
    // so the pagination is identical.
    const margin = { top: '24mm', bottom: '17mm', left: '25mm', right: '25mm' };
    const common = { format: 'A4' as const, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, margin, footerTemplate: brandFooterTemplate(brand.mode, brand.lv) };
    const first = await page.pdf({ ...common, headerTemplate: EMPTY_TEMPLATE });
    lap('pdf');
    const { PDFDocument } = await import('pdf-lib');
    const a = await PDFDocument.load(first);
    if (a.getPageCount() <= 1) return Buffer.from(first);
    const rest = await page.pdf({ ...common, headerTemplate: brandHeaderTemplate(brand.mode, brand.lv, input.topic || input.title) });
    const b = await PDFDocument.load(rest);
    const out = await PDFDocument.create();
    for (const pg of await out.copyPages(a, [0])) out.addPage(pg);
    const tail = Array.from({ length: Math.max(0, b.getPageCount() - 1) }, (_, i) => i + 1);
    for (const pg of await out.copyPages(b, tail)) out.addPage(pg);
    lap('pdf-merge');
    return Buffer.from(await out.save());
  } finally {
    await page.close().catch(() => {});
  }
}
