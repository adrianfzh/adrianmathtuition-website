/**
 * src/lib/render-prelim.ts
 *
 * Renders a prelim-builder draft as a mock-exam PDF: numbered questions with
 * marks brackets and marks-scaled working space, figures, and a consolidated
 * ANSWER KEY on its own final page (no inline answers — that's the difference
 * from render-worksheet's worksheet layout). Shares the Puppeteer singleton +
 * KaTeX auto-render pattern with render-worksheet.
 *
 * Two layouts:
 *  - worksheet-style (no `cover`): the original header + instructions block
 *    above the questions, answer key appended in the same document. This is
 *    what /api/admin/prelim-builder/export and the topics/weak-spots student
 *    sheets get — unchanged.
 *  - exam-format (`cover` present — the student mock): a proper page-1 cover
 *    (centre name, candidate name/class/index boxes, subject code, duration,
 *    materials, instructions, total marks, "Do not turn over…"), questions
 *    from page 2, "END OF PAPER" after the last question, "Page N of M"
 *    footers, and "[Turn over" on non-final question pages. The answer key is
 *    rendered as a SEPARATE document and appended with pdf-lib, so it stays
 *    outside the exam page numbering. Chromium's print pipeline supports
 *    neither CSS counter(pages) nor per-page footer variation, so footers and
 *    "[Turn over" are stamped onto the finished pages with pdf-lib instead of
 *    fighting Puppeteer's displayHeaderFooter quirks.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getBrowser } from '@/lib/generate-pdf';
import { mdToHtml } from '@/lib/render-worksheet';
import type { PrelimCover, SectionHeading } from '@/lib/print-paper';

export interface PrelimQuestion {
  pos: number;
  marks: number;
  text: string; // markdown with $…$ math (stem + flattened parts)
  imageUrl?: string | null;
  answer: string; // key text (markdown/math ok)
}

export interface PrelimInput {
  title: string;
  subtitle: string;
  instructions?: string[];
  questions: PrelimQuestion[];
  workingSpace?: boolean; // marks-scaled blank space after each question
  /** Present → exam-format render (page-1 cover, footers, END OF PAPER,
   * answer key outside the page numbering). Absent → worksheet-style. */
  cover?: PrelimCover;
  /** Sectioned papers (H2 P2): a bold centred heading is drawn immediately
   * before the question whose pos matches each entry's beforePos. */
  sections?: SectionHeading[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DEFAULT_INSTRUCTIONS = [
  'Answer all the questions. Write your answers and working on the spaces provided or on separate writing paper.',
  'Give non-exact numerical answers correct to 3 significant figures, or 1 decimal place in the case of angles in degrees, unless a different level of accuracy is specified in the question.',
  'The number of marks is given in brackets [ ] at the end of each question or part question.',
];

const STYLES = `
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:16mm 15mm 18mm}
  body{font-family:Georgia,'Times New Roman',Times,serif;color:#111;background:#fff;font-size:12pt;line-height:1.6}
  p{margin:0 0 8px}
  ul{margin:0 0 8px 20px}
  hr{border:none;border-top:1px solid #ddd;margin:12px 0}

  .header{border-bottom:2.5px solid #1a365d;padding-bottom:10px;margin-bottom:8px}
  .header h1{font-size:17pt;color:#1a365d;font-weight:700;margin:0 0 3px}
  .header .sub{display:flex;justify-content:space-between;align-items:baseline;color:#555;font-size:10.5pt}
  .header .sub .tm{font-weight:700;color:#1a365d}
  .instructions{font-size:9.5pt;color:#444;margin:0 0 16px;padding:8px 10px;background:#f6f7f9;border-radius:3px}
  .instructions p{margin:0 0 3px}
  .instructions .ihead{font-weight:700;color:#1a365d}

  .section-h{text-align:center;font-weight:700;font-size:12.5pt;letter-spacing:.5px;margin:16px 0 12px}
  .q{margin-bottom:14px}
  .q-row{display:flex;gap:10px}
  .q-num{font-weight:700;min-width:24px;font-size:12.5pt}
  .q-body{flex:1}
  .q-marks{text-align:right;font-weight:600;color:#333;margin-top:2px}
  .q-img{max-width:72%;display:block;margin:10px auto}
  .q-space{border-bottom:1px dashed #e2e8f0;margin:6px 0 2px}

  .keypage{page-break-before:always}
  .key-h{font-size:13pt;font-weight:700;color:#1a365d;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px;padding-bottom:5px;border-bottom:2px solid #1a365d}
  .key-sub{font-size:9.5pt;color:#666;margin:-10px 0 14px}
  .key-row{display:flex;gap:10px;margin-bottom:10px}
  .key-num{font-weight:700;min-width:24px}
  .key-body{flex:1}

  .cover{display:flex;flex-direction:column;min-height:255mm;page-break-after:always}
  .cv-centre{text-align:center;font-size:16pt;font-weight:700;letter-spacing:2.5px;color:#1a365d}
  .cv-exam{text-align:center;font-size:10.5pt;letter-spacing:4px;color:#444;text-transform:uppercase;margin:5px 0 20px}
  .cv-cand{width:100%;border-collapse:collapse;margin-bottom:-1px}
  .cv-cand td{border:1px solid #333;padding:8px 10px;font-size:9.5pt;height:34px;vertical-align:top}
  .cv-lbl{width:27%;font-weight:700;letter-spacing:.5px}
  .cv-subject{margin:24px 0 0;border-top:2.5px solid #1a365d;padding-top:12px}
  .cv-row{display:flex;justify-content:space-between;align-items:baseline}
  .cv-subj{font-size:14.5pt;font-weight:700;letter-spacing:.5px}
  .cv-code{font-size:13pt;font-weight:700}
  .cv-paper{font-size:12pt;margin-top:2px}
  .cv-dur{font-size:12pt;font-weight:700}
  .cv-materials{font-size:9.5pt;color:#333;margin:14px 0 0;border-bottom:2.5px solid #1a365d;padding-bottom:12px}
  .cv-materials p{margin:0 0 2px}
  .cv-instructions{margin-top:18px;font-size:10pt;color:#222}
  .cv-instructions .ihead{font-weight:700;letter-spacing:.5px;margin-bottom:6px}
  .cv-instructions p{margin:0 0 4px}
  .cv-total{font-weight:700;margin-top:10px}
  .cv-warn{margin-top:auto;text-align:center;font-weight:700;font-size:11pt;padding:10px 0 4px;border-top:1px solid #ccc}
  .cv-meta{text-align:center;font-size:8.5pt;color:#999;margin-top:4px}

  .endpaper{text-align:center;font-weight:700;letter-spacing:3px;color:#1a365d;margin-top:26px}

  .katex{font-size:1.03em}
  .katex-display{margin:10px 0;overflow-x:auto}
`;

function htmlShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body,{
    delimiters:[
      {left:'$$',right:'$$',display:true},
      {left:'$',right:'$',display:false},
      {left:'\\\\(',right:'\\\\)',display:false},
      {left:'\\\\[',right:'\\\\]',display:true}
    ],
    throwOnError:false,
    strict:false,
    trust:true
  });window.__katexDone=true;"></script>
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function questionsHtml(input: PrelimInput): string {
  const sectionAt = new Map((input.sections ?? []).map((s) => [s.beforePos, s.label]));
  return input.questions
    .map((q) => {
      const label = sectionAt.get(q.pos);
      const heading = label ? `<div class="section-h">${esc(label)}</div>\n    ` : '';
      // ~9mm of working space per mark, capped at 130mm, only when requested.
      const space = input.workingSpace
        ? `<div class="q-space" style="min-height:${Math.min(130, q.marks * 9)}mm"></div>`
        : '';
      return `
    ${heading}<div class="q">
      <div class="q-row">
        <div class="q-num">${q.pos}</div>
        <div class="q-body">
          ${mdToHtml(q.text)}
          ${q.imageUrl ? `<img class="q-img" src="${esc(q.imageUrl)}" alt="figure for question ${q.pos}">` : ''}
          <div class="q-marks">[${q.marks}]</div>
        </div>
      </div>
      ${space}
    </div>`;
    })
    .join('\n');
}

function keyRowsHtml(questions: PrelimQuestion[]): string {
  return questions
    .map(
      (q) => `
    <div class="key-row">
      <div class="key-num">${q.pos}.</div>
      <div class="key-body">${mdToHtml(q.answer || '—')}</div>
    </div>`
    )
    .join('\n');
}

function coverHtml(input: PrelimInput): string {
  const cover = input.cover!;
  const total = input.questions.reduce((s, q) => s + q.marks, 0);
  const instructions = input.instructions ?? DEFAULT_INSTRUCTIONS;
  return `
  <div class="cover">
    <div class="cv-centre">${esc(cover.centre)}</div>
    <div class="cv-exam">${esc(cover.examLabel)}</div>
    <table class="cv-cand">
      <tr><td class="cv-lbl">CANDIDATE<br>NAME</td><td></td></tr>
    </table>
    <table class="cv-cand">
      <tr><td class="cv-lbl">CLASS</td><td style="width:23%"></td><td class="cv-lbl" style="width:27%">INDEX<br>NUMBER</td><td></td></tr>
    </table>
    <div class="cv-subject">
      <div class="cv-row"><span class="cv-subj">${esc(cover.subjectName)}</span><span class="cv-code">${esc(cover.subjectCode)}</span></div>
      <div class="cv-row"><span class="cv-paper">${esc(cover.paperLabel)}</span><span class="cv-dur">${esc(cover.duration)}</span></div>
    </div>
    <div class="cv-materials">
      ${cover.materials.map((m) => `<p>${esc(m)}</p>`).join('\n      ')}
    </div>
    <div class="cv-instructions">
      <p class="ihead">READ THESE INSTRUCTIONS FIRST</p>
      ${instructions.map((l) => `<p>${esc(l)}</p>`).join('\n      ')}
      <p class="cv-total">The total of the marks for this paper is ${total}.</p>
    </div>
    <div class="cv-warn">Do not turn over this page until you are told to do so.</div>
    ${cover.candidateLine ? `<div class="cv-meta">${esc(cover.candidateLine)}</div>` : ''}
  </div>`;
}

/** Worksheet-style single document (header + instructions + questions + key).
 * The original layout — /api/admin/prelim-builder/export and the student
 * topics/weak-spots sheets render this. */
export function buildPrelimHTML(input: PrelimInput): string {
  const { title, subtitle, questions } = input;
  const total = questions.reduce((s, q) => s + q.marks, 0);
  const instructions = input.instructions ?? DEFAULT_INSTRUCTIONS;
  return htmlShell(`  <div class="header">
    <h1>${esc(title)}</h1>
    <div class="sub">
      <span>${esc(subtitle)}</span>
      <span class="tm">Total: ${total} marks</span>
    </div>
  </div>
  <div class="instructions">
    <p class="ihead">READ THESE INSTRUCTIONS FIRST</p>
    ${instructions.map((l) => `<p>${esc(l)}</p>`).join('\n    ')}
  </div>
  ${questionsHtml(input)}
  <div class="keypage">
    <div class="key-h">Answer Key</div>
    ${keyRowsHtml(questions)}
  </div>`);
}

/** Exam-format document: cover page, questions from page 2, END OF PAPER.
 * NO answer key — that renders separately (buildKeyHTML) so it can sit
 * outside the exam page numbering. */
export function buildExamHTML(input: PrelimInput): string {
  return htmlShell(`${coverHtml(input)}
  ${questionsHtml(input)}
  <div class="endpaper">END OF PAPER</div>`);
}

/** The answer key as its own document (appended after the exam pages). */
export function buildKeyHTML(input: PrelimInput): string {
  return htmlShell(`  <div>
    <div class="key-h">Answer Key</div>
    <p class="key-sub">${esc(input.title)}</p>
    ${keyRowsHtml(input.questions)}
  </div>`);
}

async function renderDoc(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const w = window as unknown as Record<string, boolean>;
          if (w.__katexDone) return resolve();
          const t0 = Date.now();
          const iv = setInterval(() => {
            if (w.__katexDone || Date.now() - t0 > 8000) {
              clearInterval(iv);
              resolve();
            }
          }, 50);
        })
    );
    await new Promise((r) => setTimeout(r, 250));
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// A4 in PDF points; the @page margins are 16mm top / 15mm sides / 18mm bottom,
// so a stamp at y=24pt (~8.5mm) sits inside the bottom margin, clear of content.
const PT_PER_MM = 72 / 25.4;
const FOOTER_Y = 24;
const SIDE_MARGIN_PT = 15 * PT_PER_MM;

/** Stamp "Page N of M" (+ "[Turn over" on non-final question pages) onto the
 * exam pages, then append the un-numbered answer-key pages. */
async function stampExamAndAppendKey(exam: Buffer, key: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(exam);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const pages = doc.getPages();
  const n = pages.length;
  pages.forEach((pg, i) => {
    const { width } = pg.getSize();
    const label = `Page ${i + 1} of ${n}`;
    const w = font.widthOfTextAtSize(label, 8);
    pg.drawText(label, { x: (width - w) / 2, y: FOOTER_Y, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
    // "[Turn over" bottom-right on every page except the cover (which says
    // "Do not turn over…") and the final question page.
    if (i > 0 && i < n - 1) {
      const t = '[Turn over';
      const tw = italic.widthOfTextAtSize(t, 9);
      pg.drawText(t, { x: width - SIDE_MARGIN_PT - tw, y: FOOTER_Y, size: 9, font: italic, color: rgb(0.1, 0.1, 0.1) });
    }
  });
  const keyDoc = await PDFDocument.load(key);
  const copied = await doc.copyPages(keyDoc, keyDoc.getPageIndices());
  for (const p of copied) doc.addPage(p);
  return Buffer.from(await doc.save());
}

export async function renderPrelimPDF(input: PrelimInput): Promise<Buffer> {
  if (!input.cover) return renderDoc(buildPrelimHTML(input));
  const examPdf = await renderDoc(buildExamHTML(input));
  const keyPdf = await renderDoc(buildKeyHTML(input));
  return stampExamAndAppendKey(examPdf, keyPdf);
}
