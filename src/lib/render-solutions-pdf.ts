/**
 * src/lib/render-solutions-pdf.ts
 *
 * Worked-solutions document for the Question Bank browser (/admin/questions):
 * a whole paper's solutions in reading order, or the basket's selection.
 * Same house typography as render-bot-worksheet (Times 9.5pt, navy caps brand
 * over an orange rule, explicit question numbers in the left margin, KaTeX
 * auto-render inside Puppeteer) — but this is a TEACHER document: no name bar,
 * no working space, the question stem in small grey for context and the
 * solution in full ink under it.
 *
 * ADMIN ONLY by construction: only the admin-authed questions route calls this,
 * and the output goes to a Blob URL handed back to the admin page.
 */

import { getBrowser } from '@/lib/generate-pdf';

const NAVY = '#1c3a5e';
const ANSWER_ORANGE = '#843C0C';

export interface SolutionsPart {
  label?: string | null;
  answer?: string | null;
  subparts?: SolutionsPart[] | null;
}

export interface SolutionsItem {
  /** Printed question number on the paper ("7", "12a"); falls back to order. */
  qnum: string | null;
  questionText: string;
  /** The worked solution (plain text with $…$ TeX). Empty = none on file. */
  solution: string;
  /** Final answer fallback when there is no worked solution. */
  answer: string;
  parts: SolutionsPart[] | null;
  /** Absolute/proxied image URLs of solution scans, already vetted. */
  solutionImages: string[];
}

export interface SolutionsInput {
  /** e.g. "Cedar Girls 2023 · P2" or "Custom selection". */
  title: string;
  dateLabel: string;
  items: SolutionsItem[];
  /** false = solutions only (no grey question stems). Default true. */
  includeStems?: boolean;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Per-part answers as a stacked fallback when the row has no worked solution. */
function partsAnswerLines(parts: SolutionsPart[] | null, prefix = ''): string[] {
  const out: string[] = [];
  for (const p of parts ?? []) {
    const label = [prefix, p.label ?? ''].filter(Boolean).join('');
    if (p.answer) out.push(`${label ? `${label} ` : ''}${p.answer}`);
    if (p.subparts?.length) out.push(...partsAnswerLines(p.subparts, label));
  }
  return out;
}

function itemHtml(it: SolutionsItem, index: number, includeStems: boolean): string {
  const num = it.qnum || String(index + 1);
  const images = it.solutionImages
    .map((u) => `<img class="sol-img" src="${esc(u)}" alt="solution">`)
    .join('');

  let body: string;
  if (it.solution.trim()) {
    body = `<div class="sol-body">${esc(it.solution.trim())}</div>`;
  } else {
    const lines = partsAnswerLines(it.parts);
    if (!lines.length && it.answer.trim()) lines.push(it.answer.trim());
    body = lines.length
      ? `<div class="sol-ans">${lines.map((l) => `<div>[Ans: ${esc(l)}]</div>`).join('')}</div>`
      : images
        ? '' // a scanned solution IS the solution
        : '<div class="sol-none">No worked solution on file.</div>';
  }

  const stem = includeStems && it.questionText
    ? `<div class="sol-stem">${esc(it.questionText)}</div>`
    : '';
  return `
    <li class="sol-q">
      <span class="sol-qnum">${esc(num)}.</span>
      ${stem}${body}${images}
    </li>`;
}

export function buildSolutionsHTML(input: SolutionsInput): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(input.title)} — Solutions</title>
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
  body{color:#111;font-family:"Times New Roman",Georgia,serif;font-size:9.5pt;line-height:1.55}
  .katex{font-size:1em}

  .sol-header{margin-bottom:9pt}
  .sol-brand{text-align:center;color:${NAVY};font-weight:700;font-size:11.5pt;letter-spacing:.3em;border-bottom:1.1pt solid ${ANSWER_ORANGE};padding-bottom:2.5pt}
  .sol-line2{text-align:center;margin-top:3pt}
  .sol-type{color:${NAVY};font-weight:700;font-size:9.5pt;letter-spacing:.26em}
  .sol-title{text-align:center;font-size:13pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:6pt 0 2pt}
  .sol-meta{text-align:center;color:#6E6E6E;font-size:8.5pt}

  .sol-list{list-style:none;padding-left:20pt;margin:0}
  .sol-q{margin-bottom:9pt;break-inside:avoid;position:relative;border-bottom:0.5pt solid #e3e3e3;padding-bottom:7pt}
  .sol-qnum{position:absolute;left:-20pt;top:0;font-weight:700}
  .sol-stem{color:#6E6E6E;font-size:8.5pt;white-space:pre-wrap;margin-bottom:3.5pt}
  .sol-body{white-space:pre-wrap}
  .sol-ans{color:${ANSWER_ORANGE}}
  .sol-ans .katex{color:${ANSWER_ORANGE}}
  .sol-none{color:#999;font-style:italic}
  .sol-img{display:block;max-width:100%;max-height:340pt;margin:4pt 0}

  .sol-footer{margin-top:10pt;padding-top:4pt;border-top:0.75pt solid #999;display:flex;justify-content:space-between;font-size:8pt}
  .sol-foot-brand{color:${NAVY};font-weight:700;letter-spacing:.12em}
  .sol-foot-url{color:#6E6E6E}
</style>
</head>
<body>
  <div class="sol-header">
    <div class="sol-brand">ADRIAN&rsquo;S MATH TUITION</div>
    <div class="sol-line2"><span class="sol-type">WORKED SOLUTIONS</span></div>
    <div class="sol-title">${esc(input.title)}</div>
    <div class="sol-meta">${esc(input.dateLabel)} · ${input.items.length} question${input.items.length === 1 ? '' : 's'}</div>
  </div>

  <ol class="sol-list">
${input.items.map((it, i) => itemHtml(it, i, input.includeStems !== false)).join('\n')}
  </ol>

  <div class="sol-footer">
    <span class="sol-foot-brand">Adrian&rsquo;s Math Tuition</span>
    <span class="sol-foot-url">adrianmathtuition.com</span>
  </div>
</body>
</html>`;
}

export async function renderSolutionsPDF(input: SolutionsInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildSolutionsHTML(input), { waitUntil: 'networkidle0', timeout: 30000 });
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
