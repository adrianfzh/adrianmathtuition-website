/**
 * src/lib/render-prelim.ts
 *
 * Renders a prelim-builder draft as a mock-exam PDF: exam header, numbered
 * questions with marks brackets and marks-scaled working space, figures, and
 * a consolidated ANSWER KEY on its own final page (no inline answers — that's
 * the difference from render-worksheet's worksheet layout). Shares the
 * Puppeteer singleton + KaTeX auto-render pattern with render-worksheet.
 */

import { getBrowser } from '@/lib/generate-pdf';
import { mdToHtml } from '@/lib/render-worksheet';

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
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPrelimHTML(input: PrelimInput): string {
  const { title, subtitle, questions } = input;
  const total = questions.reduce((s, q) => s + q.marks, 0);
  const instructions = input.instructions ?? [
    'Answer all the questions. Write your answers and working on the spaces provided or on separate writing paper.',
    'Give non-exact numerical answers correct to 3 significant figures, or 1 decimal place in the case of angles in degrees, unless a different level of accuracy is specified in the question.',
    'The number of marks is given in brackets [ ] at the end of each question or part question.',
  ];

  const qHtml = questions
    .map((q) => {
      // ~9mm of working space per mark, capped at 130mm, only when requested.
      const space = input.workingSpace
        ? `<div class="q-space" style="min-height:${Math.min(130, q.marks * 9)}mm"></div>`
        : '';
      return `
    <div class="q">
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

  const keyHtml = questions
    .map(
      (q) => `
    <div class="key-row">
      <div class="key-num">${q.pos}.</div>
      <div class="key-body">${mdToHtml(q.answer || '—')}</div>
    </div>`
    )
    .join('\n');

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
<style>
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

  .q{margin-bottom:14px}
  .q-row{display:flex;gap:10px}
  .q-num{font-weight:700;min-width:24px;font-size:12.5pt}
  .q-body{flex:1}
  .q-marks{text-align:right;font-weight:600;color:#333;margin-top:2px}
  .q-img{max-width:72%;display:block;margin:10px auto}
  .q-space{border-bottom:1px dashed #e2e8f0;margin:6px 0 2px}

  .keypage{page-break-before:always}
  .key-h{font-size:13pt;font-weight:700;color:#1a365d;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px;padding-bottom:5px;border-bottom:2px solid #1a365d}
  .key-row{display:flex;gap:10px;margin-bottom:10px}
  .key-num{font-weight:700;min-width:24px}
  .key-body{flex:1}

  .katex{font-size:1.03em}
  .katex-display{margin:10px 0;overflow-x:auto}
</style>
</head>
<body>
  <div class="header">
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
  ${qHtml}
  <div class="keypage">
    <div class="key-h">Answer Key</div>
    ${keyHtml}
  </div>
</body>
</html>`;
}

export async function renderPrelimPDF(input: PrelimInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildPrelimHTML(input), { waitUntil: 'networkidle0', timeout: 30000 });
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
