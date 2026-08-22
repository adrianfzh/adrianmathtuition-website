/**
 * src/lib/render-practice-pdf.ts
 *
 * "Practice Again" — the post-marking follow-up sheet, rendered to A4 PDF for
 * the bot's 📝 button on a returned marked paper. One practice question per
 * dropped-marks question, assembled by the bot's enrichment pass; this file only
 * typesets. Same house typography as render-bot-worksheet (itself a port of the
 * kiosk print CSS): TNR 9.5pt, navy caps brand over the orange rule, working
 * space, orange right-aligned [Ans: …].
 *
 * Student-facing spec (Adrian, 22 Aug 2026, from the printed sample):
 *  - Title: "Practice Again for {student}" — brand block + PRACTICE AGAIN type
 *    line + the student's name as the big centred line. No subtitle, no paper
 *    name anywhere.
 *  - No "Skill:" notes — the tag line ("Question 1 (for Q(d))") stays, the
 *    skill sentence goes.
 *  - Answers inline after each question's working space (this is a self-study
 *    sheet, not a test), orange, [Ans: …].
 */

import { getBrowser } from '@/lib/generate-pdf';
import { mdToHtml } from '@/lib/render-worksheet';

const NAVY = '#1c3a5e';
const ANSWER_ORANGE = '#843C0C'; // STYLE.md practice-answer colour

export interface PracticeItem {
  /** e.g. "Question 1 (for Q(d) · Topic)" — built by the bot, printed verbatim. */
  heading: string;
  /** Markdown with $…$ math. */
  question: string;
  /** Markdown with $…$ math; rendered as the orange [Ans: …] block. */
  answer: string;
}

export interface PracticePdfInput {
  /** Big centred line under the brand, e.g. "for Denise". */
  forLine: string;
  /** e.g. '22 Aug 2026'. */
  dateLabel: string;
  items: PracticeItem[];
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const WORKING_MM = 55; // generous fixed block — marks aren't known per practice item

function itemHtml(it: PracticeItem): string {
  const ans = `[Ans: ${String(it.answer || '—').replace(/\n+/g, '  ')} ]`;
  return `
    <section class="pa-q">
      <div class="pa-qhead">${esc(it.heading)}</div>
      <div class="pa-body">${mdToHtml(it.question)}</div>
      <div class="pa-space" style="height:${WORKING_MM}mm"></div>
      <div class="pa-ans">${mdToHtml(ans)}</div>
    </section>`;
}

export function buildPracticePdfHTML(input: PracticePdfInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Practice Again</title>
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
  @page{size:A4;margin:15mm 22mm 13mm}
  html,body{background:#fff}
  body{color:#111;font-family:"Times New Roman",Georgia,serif;font-size:9.5pt;line-height:1.5}
  .katex{font-size:1em}
  p{margin:0 0 1.5pt}
  ul,ol{margin:2pt 0 3pt 0;padding-left:13pt}
  li{margin-bottom:1.5pt}
  table{border-collapse:collapse;margin:3pt 0}
  th,td{border:0.75pt solid #999;padding:2pt 6pt}

  .pa-header{margin-bottom:10pt}
  .pa-brand{text-align:center;color:${NAVY};font-weight:700;font-size:11.5pt;letter-spacing:.3em;border-bottom:1.1pt solid ${ANSWER_ORANGE};padding-bottom:2.5pt}
  .pa-type{text-align:center;color:${NAVY};font-weight:700;font-size:9.5pt;letter-spacing:.26em;margin-top:3pt}
  .pa-for{text-align:center;font-size:13.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:7pt 0 3pt}
  .pa-datebar{text-align:right;color:#6E6E6E;font-size:9pt;padding-top:4pt;border-top:0.5pt solid #ccc}

  .pa-q{margin-bottom:8pt;break-inside:avoid}
  .pa-qhead{font-weight:700;margin-bottom:3pt}
  .pa-space{display:block;clear:both}
  .pa-ans{color:${ANSWER_ORANGE};text-align:right;margin-top:2pt}
  .pa-ans .katex{color:${ANSWER_ORANGE}}
  .pa-ans p{margin:0}

  .pa-footer{margin-top:10pt;padding-top:4pt;border-top:0.75pt solid #999;display:flex;justify-content:space-between;font-size:8pt}
  .pa-foot-brand{color:${NAVY};font-weight:700;letter-spacing:.12em}
  .pa-foot-url{color:#6E6E6E}
</style>
</head>
<body>
  <div class="pa-header">
    <div class="pa-brand">ADRIAN&rsquo;S MATH TUITION</div>
    <div class="pa-type">PRACTICE AGAIN</div>
    <div class="pa-for">${esc(input.forLine)}</div>
    <div class="pa-datebar">${esc(input.dateLabel)}</div>
  </div>
${input.items.map(itemHtml).join('\n')}
  <div class="pa-footer">
    <span class="pa-foot-brand">Adrian&rsquo;s Math Tuition</span>
    <span class="pa-foot-url">adrianmathtuition.com</span>
  </div>
</body>
</html>`;
}

export async function renderPracticePDF(input: PracticePdfInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildPracticePdfHTML(input), { waitUntil: 'networkidle0', timeout: 30000 });
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
        }),
    );
    await page.evaluate(() => document.fonts?.ready);
    await new Promise((r) => setTimeout(r, 250));

    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
