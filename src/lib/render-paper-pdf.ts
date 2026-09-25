/**
 * src/lib/render-paper-pdf.ts
 *
 * Reconstructed exam paper for the Question Bank browser (/admin/questions
 * Papers view): every bank question of one (school, year, exam_type, paper,
 * level) in reading order, printed as a sit-able paper. Same house typography
 * as render-bot-worksheet / render-solutions-pdf (Times 9.5pt, explicit margin
 * numbers, KaTeX auto-render inside Puppeteer) — but NO tuition-centre brand
 * line and NO "reconstructed from" footer: these are other schools' (or GCE)
 * papers, so the page identifies the paper, not Adrian (Adrian, 2026-08-28).
 *
 * Exam-paper conventions (mirroring the create-exam-paper skill): no topic or
 * source labels on questions, marks right-aligned at the margin, optional
 * working space after each marked part sized by its mark allocation
 * (lib/paper-reconstruction.workingSpaceMm — generous 4 lines per mark),
 * and an optional ANSWER KEY on a final page of its own.
 *
 * Honesty rule: a paper the bank only partially covers says so — the coverage
 * warning prints under the header, so a photocopied sheet can't masquerade as
 * the full paper. Same for questions whose figure is
 * flagged (has_image) but missing from the bank: a placeholder box marks the
 * hole instead of silently printing a figureless stem.
 *
 * ADMIN ONLY by construction: school papers for Adrian's own teaching use —
 * only the admin-authed questions route calls this, output goes to a Blob URL
 * handed back to the admin page, never to the portal.
 */

import { getBrowser } from '@/lib/generate-pdf';
import { workingSpaceMm } from '@/lib/paper-reconstruction';
import type { Part } from '@/lib/kiosk-worksheet-images';
import { splitPipeTables } from '@/lib/pipe-tables';
import { katexInlineHead, katexAutoRenderScript, waitForPageReady } from '@/lib/katex-inline';

const NAVY = '#1c3a5e';
const ANSWER_ORANGE = '#843C0C';

/** Bump on ANY visual change to this renderer — it keys the paper_pdf_cache,
 * so stale-looking cached PDFs after a layout tweak mean this wasn't bumped. */
// v2 (2026-08-29): richText pipe tables — bump on ANY visual change or the
// blob cache keeps serving PDFs rendered by the old code.
// v3 (2026-08-31): "End of Paper" after the last question.
// v4 (2026-09-05): KaTeX inlined (was jsDelivr CDN 0.16.9, now the installed
// 0.16.45 package) — cached PDFs must rebuild once to pick up the version bump.
export const PAPER_PDF_RENDER_VERSION = 7;   // 7: figure caps 80/100 mm wide, 80 mm tall (21 Sep 2026, second pass); 6: figures shrink in proportion and cap at 110/130 mm (21 Sep 2026); 5: marks beside the last line, no parent total over marked sub-parts (13 Sep 2026)

export interface PaperPdfQuestion {
  /** Printed question number (original or resequenced by the caller). */
  qnum: string;
  marks: number | null;
  /** The stem, plain text with $…$ TeX (rendered pre-wrap, not markdown). */
  stem: string;
  /** Stem-level figure URLs, already absolute. */
  images: string[];
  /** has_image was set but no figure resolved — print an honest hole. */
  missingFigure: boolean;
  /** questions.parts with image paths already resolved to absolute URLs. */
  parts: Part[];
  /** Answer-key lines (lib/paper-reconstruction.answerKeyLines). */
  answerLines: string[];
  /**
   * The stem figures are vector drawings whose author already fixed their
   * printed size (a graph-paper grid the candidate draws on, sized so one
   * square prints at 1 cm): print them at that size with no 300pt height cap.
   * Off (the default) for the bank's scanned crops, which the cap protects.
   */
  uncappedFigures?: boolean;
}

export interface PaperPdfInput {
  /** e.g. "CJC 2025 · JC1 · Paper 1 · Promo". */
  title: string;
  /** e.g. "12 questions · 100 marks". */
  metaLine: string;
  questions: PaperPdfQuestion[];
  /** Insert marks-proportional working space after each marked part. */
  workingSpace: boolean;
  /** Append the ANSWER KEY page. */
  answerKey: boolean;
  /** Coverage warning ('' / null = paper looks complete). */
  coverageWarning?: string | null;
  /** Colour of the ANSWER KEY entries (default the house orange; a printed set uses '#111'). */
  answerKeyColor?: string;
  /** The answer key ALONE — no questions, name bar or End of Paper; the key
   *  starts on page 1 (Adrian, 25 Sep 2026: "a button for an Answers PDF"). */
  answersOnly?: boolean;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * esc() plus GFM pipe tables → real bordered tables (Adrian, 2026-08-29:
 * data tables in stems printed as raw "| t | 1 | 2 |" rows). Everything
 * that isn't a table line stays escaped pre-wrap plain text; cell contents
 * keep their $…$ TeX for the page's KaTeX pass. Exported for the unit test.
 *
 * The SPLITTING lives in @/lib/pipe-tables, shared with the on-screen question
 * view — the same stem has to become the same table in print and in a browser.
 */
export function richText(s: string): string {
  return splitPipeTables(s).map((b) => {
    if (b.kind === 'text') return esc(b.text);
    const [head, ...rest] = b.rows;
    return '<table class="pp-table"><thead><tr>' + head.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead>' +
      (rest.length
        ? '<tbody>' + rest.map((r) => '<tr>' + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody>'
        : '') +
      '</table>';
  }).join('\n');
}

function img(u: string, uncapped = false): string {
  return `<img class="pp-figure${uncapped ? ' pp-figure-tall' : ''}" src="${esc(u)}" alt="figure">`;
}

function spacer(marks: number | null | undefined): string {
  return `<div class="pp-space" style="height:${workingSpaceMm(marks)}mm"></div>`;
}

/** Text and its marks as one line-box: the text fills the left, the marks sit
 *  at the bottom-right beside the LAST line. A floated span used to drop onto
 *  the following block whenever the last line ran long, so (ii)'s [1] printed
 *  beside (iii) (JPJC 2025 P2 Q11, 13 Sep 2026). */
function lineWithMarks(cls: string, inner: string, marks: string): string {
  return `<div class="${cls}"><span class="pp-txt">${inner}</span>${marks}</div>`;
}

function partHtml(p: Part, workingSpace: boolean, uncapped = false): string {
  const label = p.label ? `<strong>(${esc(String(p.label).replace(/^\(|\)$/g, ''))})</strong> ` : '';
  // Working space belongs to the part that asks for the work: a part with its
  // own marks and no marked subparts gets the skill-rule space after it.
  const subsCarryMarks = (p.subparts ?? []).some(function carry(sp): boolean {
    return !!sp.marks || (sp.subparts ?? []).some(carry);
  });
  // A parent whose sub-parts carry their own marks prints no total of its own —
  // the paper says [2] beside (i), never [8] beside (b) as well.
  const marks = p.marks && !subsCarryMarks ? `<span class="pp-mk">[${p.marks}]</span>` : '';
  const before = p.image_url ? img(p.image_url, uncapped) : '';
  const after = p.image_url_after ? img(p.image_url_after, uncapped) : '';
  const text = p.text ? lineWithMarks('pp-part-text', label + richText(p.text), marks) : (label || marks ? lineWithMarks('pp-part-text', label, marks) : '');
  const subs = (p.subparts ?? []).map((sp) => partHtml(sp, workingSpace, uncapped)).join('');
  // A grid printed after the part IS its working space — no blank block under it.
  const space = workingSpace && p.marks && !subsCarryMarks && !(uncapped && p.image_url_after) ? spacer(p.marks) : '';
  return `<div class="pp-part">${before}${text}${after}${space}${subs}</div>`;
}

function partsCarryMarks(parts: Part[]): boolean {
  return parts.some((p) => !!p.marks || partsCarryMarks(p.subparts ?? []));
}

function questionHtml(q: PaperPdfQuestion, workingSpace: boolean): string {
  const figures = q.images.map((u) => img(u, q.uncappedFigures === true)).join('');
  const hole = q.missingFigure
    ? '<div class="pp-missing-figure">[ figure referenced by this question is not in the bank ]</div>'
    : '';
  const inParts = partsCarryMarks(q.parts);
  const stemMarks = !inParts && q.marks != null ? `<span class="pp-mk">[${q.marks}]</span>` : '';
  const stem = q.stem.trim()
    ? lineWithMarks('pp-stem', richText(q.stem.trim()), stemMarks)
    : (stemMarks ? lineWithMarks('pp-stem', '', stemMarks) : '');
  const parts = q.parts.map((p) => partHtml(p, workingSpace, q.uncappedFigures === true)).join('');
  const stemSpace = workingSpace && !inParts ? spacer(q.marks) : '';
  // Stem first, then figures: stems say "the diagram below shows…". The
  // stem + figures travel as one .pp-intro unit so a page break can never
  // strand a stem on the page before its diagram.
  return `
    <li class="pp-q">
      <span class="pp-qnum">${esc(q.qnum)}</span>
      <div class="pp-q-body"><div class="pp-intro">${stem}${figures}${hole}</div>${parts}${stemSpace}</div>
    </li>`;
}

function answerKeyHtml(questions: PaperPdfQuestion[], firstPage = false): string {
  const rows = questions
    .map((q) => {
      const body = q.answerLines.length
        ? q.answerLines.map((l) => `<div>${esc(l)}</div>`).join('')
        : '<div class="pp-a-none">—</div>';
      return `<li class="pp-a"><span class="pp-anum">${esc(q.qnum)}</span><div class="pp-a-body">${body}</div></li>`;
    })
    .join('\n');
  return `
  <section class="pp-answers${firstPage ? ' pp-answers-first' : ''}">
    <div class="pp-answers-h">Answer Key</div>
    <ol class="pp-answer-list">${rows}</ol>
  </section>`;
}

export function buildPaperHTML(input: PaperPdfInput): string {
  const { title, metaLine, questions, workingSpace, answerKey } = input;
  const warning = (input.coverageWarning ?? '').trim();
  const answerColor = (input.answerKeyColor ?? '').trim() || ANSWER_ORANGE;
  const answersOnly = input.answersOnly === true;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
${katexInlineHead()}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:15mm 22mm 13mm}
  html,body{background:#fff}
  body{color:#111;font-family:"Times New Roman",Georgia,serif;font-size:11pt;line-height:1.5}
  .katex{font-size:1em}

  .pp-header{margin-bottom:9pt}
  .pp-title{text-align:center;color:${NAVY};font-size:14pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-bottom:1.1pt solid ${ANSWER_ORANGE};padding-bottom:3pt;margin-bottom:3pt}
  .pp-meta{text-align:center;color:#6E6E6E;font-size:9.5pt}
  .pp-warning{margin-top:5pt;border:0.9pt solid #b45309;border-radius:3pt;color:#b45309;font-size:9.5pt;padding:3pt 6pt;text-align:center}
  .pp-namebar{display:flex;justify-content:space-between;gap:10pt;font-size:10pt;margin-top:6pt;padding-top:4pt;border-top:0.5pt solid #ccc}

  .pp-questions{list-style:none;padding-left:24pt;margin:0}
  .pp-q{margin-bottom:8pt;position:relative}
  .pp-qnum{position:absolute;left:-24pt;top:0;font-weight:700}
  .pp-stem{white-space:pre-wrap;break-inside:avoid;display:flex;justify-content:space-between;align-items:flex-end;gap:8pt}
  .pp-txt{flex:1 1 auto;min-width:0}
  /* Data tables from stems/parts (richText) — exam-style bordered grid. The
     pre-wrap ancestors would render the table's own newlines; normal it. */
  .pp-table{white-space:normal;border-collapse:collapse;margin:4pt 0;break-inside:avoid}
  .pp-table th,.pp-table td{border:0.75pt solid #444;padding:2pt 8pt;text-align:center}
  .pp-table th{font-weight:700}
  .pp-part{margin-top:4pt}
  .pp-part .pp-part{margin-left:15pt}
  .pp-part-text{white-space:pre-wrap;break-inside:avoid;display:flex;justify-content:space-between;align-items:flex-end;gap:8pt}
  .pp-figure{display:block;max-width:100%;max-height:300pt;height:auto;margin:6pt 0}
  .pp-figure-tall{max-height:none}
  .pp-missing-figure{border:0.75pt dashed #999;color:#999;font-style:italic;text-align:center;padding:14pt 8pt;margin:5pt 0}

  .pp-mk{flex:none;font-weight:400}
  .pp-space{display:block;clear:both}
  .pp-keep{break-inside:avoid;page-break-inside:avoid}
  .pp-fresh{break-before:page;page-break-before:always}

  .pp-end{text-align:center;font-weight:700;letter-spacing:.18em;text-transform:uppercase;
    font-size:9.5pt;color:${NAVY};margin:14pt 0 2pt;break-inside:avoid;page-break-inside:avoid}
  .pp-answers{break-before:page;page-break-before:always;padding-top:2pt}
  .pp-answers-first{break-before:auto;page-break-before:auto}
  .pp-answers-h{color:${NAVY};font-weight:700;font-size:12pt;letter-spacing:.24em;text-transform:uppercase;border-bottom:0.9pt solid ${ANSWER_ORANGE};padding-bottom:2.5pt;margin-bottom:7pt}
  .pp-answer-list{list-style:none;padding-left:24pt;margin:0}
  .pp-a{position:relative;margin-bottom:5pt;break-inside:avoid;color:${answerColor}}
  .pp-a .katex{color:${answerColor}}
  .pp-anum{position:absolute;left:-24pt;top:0;font-weight:700;color:#111}
  .pp-a-none{color:#999}

</style>
</head>
<body>
${answersOnly ? `  <div class="pp-header">
    <div class="pp-title">${esc(title)}</div>
    <div class="pp-meta">${esc(metaLine)}</div>
    ${warning ? `<div class="pp-warning">&#9888; ${esc(warning)}</div>` : ''}
  </div>
${answerKeyHtml(questions, true)}` : `
  <div class="pp-header">
    <div class="pp-title">${esc(title)}</div>
    <div class="pp-meta">${esc(metaLine)}${workingSpace ? ' &middot; Answer ALL questions in the spaces provided.' : ''}</div>
    ${warning ? `<div class="pp-warning">&#9888; ${esc(warning)}</div>` : ''}
    <div class="pp-namebar">
      <span>Name: ______________________________</span>
      <span>Date: ______________</span>
    </div>
  </div>

  <ol class="pp-questions">
${questions.map((q) => questionHtml(q, workingSpace)).join('\n')}
  </ol>

  <!-- After the last question's working space, before any key or solutions:
       a real paper says where it stops, so a candidate knows there is nothing
       overleaf (Adrian, 2026-08-31). -->
  <div class="pp-end">End of Paper</div>

${answerKey ? answerKeyHtml(questions) : ''}`}
${katexAutoRenderScript()}
</body>
</html>`;
}

export async function renderPaperPDF(input: PaperPdfInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildPaperHTML(input), { waitUntil: 'load', timeout: 30000 });
    await waitForPageReady(page);
    // Figure-sharpness pass: the bank's crops are ~850–1000px scans, and
    // stretching one across the full 166mm text width prints at ~130 DPI —
    // visibly soft. Cap each figure's on-page size so it never renders below
    // ~200 DPI (CSS px = naturalWidth × 96/200); a figure only shrinks, never
    // grows, and stays within the column. Must run BEFORE the pagination
    // measurement since it changes heights.
    await page.evaluate(() => {
      const MAX_CSS_PER_NATURAL = 96 / 200;
      // 80 mm tall at most (was the 300pt CSS cap): Adrian, 21 Sep 2026, after the
      // 110 mm pass on EM Set 1 Q9/Q18 — "images can be smaller for these two".
      const CAP_HEIGHT_PX = 80 * (96 / 25.4);
      document.querySelectorAll('img.pp-figure').forEach((el) => {
        const img = el as HTMLImageElement;
        if (!img.naturalWidth || !img.naturalHeight) return;
        const sharpWidth = img.naturalWidth * MAX_CSS_PER_NATURAL;
        const colWidth = img.parentElement?.clientWidth ?? sharpWidth;
        // A figure never needs the whole 166 mm column (Adrian, 21 Sep 2026, on
        // EM Set 1 Q18/Q20/Q22: "the diagram can be smaller", then smaller again
        // on Q9/Q18): 80 mm for an ordinary drawing, 100 mm for a wide one
        // (aspect >= 1.5) — the same defaults as generate.mjs / the Word export.
        // A graph-paper grid (.pp-figure-tall) keeps its author's true size.
        const aspect = img.naturalWidth / img.naturalHeight;
        const PX_PER_MM = 96 / 25.4;
        const tall = img.classList.contains('pp-figure-tall');
        const capWidth = tall ? Infinity : (aspect >= 1.5 ? 100 : 80) * PX_PER_MM;
        let width = Math.min(sharpWidth, colWidth, capWidth);
        if (tall) {
          // A grid keeps its 1 cm squares even when it is wider than the question's
          // text column (Adrian, 24 Sep 2026: "is the graph to scale?" — a 16-square
          // grid printed at 0.84 cm squares): it moves left into the question-number
          // gutter, and shrinks only when the whole printed page cannot hold it.
          // This pass runs on the screen layout (800 px wide), but the PDF prints
          // the page 166 mm wide (@page margin 22 mm a side), so the column is
          // worked out for PRINT: the insets beside it are fixed pt/px and carry over.
          const PRINT_WIDTH_PX = 166 * (96 / 25.4);
          const page = document.body.getBoundingClientRect();
          const col = img.parentElement?.getBoundingClientRect();
          const leftInset = col ? Math.max(0, col.left - page.left) : 0;
          const rightInset = col ? Math.max(0, page.right - col.right) : 0;
          const printCol = PRINT_WIDTH_PX - leftInset - rightInset;
          width = Math.min(sharpWidth, printCol + leftInset);
          img.style.marginLeft = `${-Math.max(0, width - printCol)}px`;
          img.style.maxWidth = 'none';
        }
        // Never let the height cap squash the drawing: an explicit width against
        // max-height distorts (a circle printed as an ellipse, GCE EM Set 1 Q9 /
        // Q26, Adrian 21 Sep 2026). Shrink the width so the capped height is met
        // in proportion instead.
        if (!img.classList.contains('pp-figure-tall')) {
          const widthAtCap = CAP_HEIGHT_PX * img.naturalWidth / img.naturalHeight;
          width = Math.min(width, widthAtCap);
        }
        img.style.width = `${width}px`;
        img.style.height = 'auto';
      });
    });
    // Pagination pass (after KaTeX + fonts + figure sizing, so heights are
    // final): a question and its working space stay on one page whenever they
    // fit. A question taller than that starts on a FRESH page so the read is
    // contiguous instead of straddling a break mid-thought — and within it,
    // the stem+figures unit and each part + its working space never split.
    await page.evaluate(() => {
      const PX_PER_MM = 96 / 25.4;
      const KEEP_MAX = 240 * PX_PER_MM; // printable A4 height ≈ 269mm; headroom for the page-1 header
      document.querySelectorAll('.pp-q').forEach((el, i) => {
        const q = el as HTMLElement;
        if (q.offsetHeight <= KEEP_MAX) {
          q.classList.add('pp-keep');
          return;
        }
        // Q1 oversized: don't push it off page 1 — that leaves a header-only page.
        if (i > 0) q.classList.add('pp-fresh');
        q.querySelectorAll('.pp-intro, .pp-part').forEach((p) => {
          if ((p as HTMLElement).offsetHeight <= KEEP_MAX) p.classList.add('pp-keep');
        });
      });
    });
    await new Promise((r) => setTimeout(r, 250));
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
