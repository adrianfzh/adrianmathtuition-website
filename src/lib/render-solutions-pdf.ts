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
import { katexInlineHead, katexAutoRenderScript, waitForPageReady } from '@/lib/katex-inline';

const NAVY = '#1c3a5e';
const ANSWER_ORANGE = '#843C0C';

export interface SolutionsPart {
  label?: string | null;
  /** The part's own question text (shown small and grey above its solution). */
  text?: string | null;
  answer?: string | null;
  /** The part's worked solution, when the row keeps its solutions per part. */
  solution?: string | null;
  subparts?: SolutionsPart[] | null;
}

export interface SolutionsItem {
  /** Printed question number on the paper ("7", "12a"); falls back to order. */
  qnum: string | null;
  questionText: string;
  /** The worked solution (plain text with $…$ TeX). Empty = none on file. */
  solution: string;
  /** true = the row has no top-level solution and `solution` is only the
   *  roll-up of parts[].solution — so the parts are laid out one by one. */
  solutionFromParts?: boolean;
  /** Final answer fallback when there is no worked solution. */
  answer: string;
  parts: SolutionsPart[] | null;
  /** Absolute/proxied image URLs of solution scans, already vetted. */
  solutionImages: string[];
}

export interface SolutionsInput {
  /** e.g. "Cedar Girls 2023 · P2" or "Custom selection". */
  title: string;
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

/** "a" + "ii" → "(a)(ii)"; an already-bracketed label is kept. */
export function partLabel(labels: string[]): string {
  return labels
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^\(.*\)$/.test(l) ? l : `(${l.replace(/[().]/g, '')})`))
    .join('');
}

/** Full-size fractions in the working and the answers: an inline \frac
 *  prints at ~70% and is the hardest thing on the page to read. The grey
 *  question text keeps its compact fractions. */
export function displayFractions(tex: string): string {
  return tex.replace(/\\frac(?![a-zA-Z])/g, '\\dfrac');
}

/** A self-check line ("Check: …", "Check in (2): …") — printed grey, since it
 *  is the solver verifying, not part of the answer a student writes. */
export function isCheckLine(line: string): boolean {
  return /^\(?\s*check\b/i.test(line.trim());
}

/**
 * Solution text → one <div> per line so check lines can be greyed. A display-
 * maths block ($$…$$, \[…\], \begin{…}) may span lines and KaTeX needs its
 * delimiters in ONE element, so such a text stays a single pre-wrap block.
 */
export function solutionLinesHtml(text: string): string {
  const t = text.trim();
  if (!t) return '';
  if (/\$\$|\\\[|\\begin\{/.test(t)) return `<div class="sol-body">${esc(t)}</div>`;
  return `<div class="sol-lines">${t
    .split('\n')
    .map((l) => (l.trim()
      ? `<div class="${isCheckLine(l) ? 'sol-check' : 'sol-line'}">${esc(displayFractions(l))}</div>`
      : '<div class="sol-gap"></div>'))
    .join('')}</div>`;
}

/** The parts flattened in reading order, each with its full label. */
function flattenParts(parts: SolutionsPart[] | null, prefix: string[] = []): { label: string; part: SolutionsPart; depth: number }[] {
  const out: { label: string; part: SolutionsPart; depth: number }[] = [];
  for (const p of parts ?? []) {
    const labels = [...prefix, p.label ?? ''].filter(Boolean);
    out.push({ label: partLabel(labels), part: p, depth: prefix.length });
    if (p.subparts?.length) out.push(...flattenParts(p.subparts, labels));
  }
  return out;
}

/** Question text for the grey context line: the bank's inline figure markers
 *  ({{IMG:…}}) are for the question page, not a solutions handout. */
export function stemText(text: string | null | undefined): string {
  return (text ?? '').replace(/\{\{IMG:[^}]*\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function partsHtml(parts: SolutionsPart[] | null, includeStems: boolean): string {
  return flattenParts(parts)
    .map(({ label, part }) => {
      const sol = (part.solution ?? '').trim();
      const ans = (part.answer ?? '').trim();
      const text = includeStems ? stemText(part.text) : '';
      // A parent with only an intro ("(a) A website records…") and sub-parts
      // below: its text still sits under its label, with nothing else.
      if (!sol && !ans && !text) return '';
      return `
      <div class="sol-part">
        <span class="sol-plabel">${esc(label)}</span>
        ${text ? `<div class="sol-pstem">${esc(text)}</div>` : ''}
        ${solutionLinesHtml(sol)}
        ${ans ? `<div class="sol-final"><span class="sol-final-k">Answer:</span> ${esc(displayFractions(ans))}</div>` : ''}
      </div>`;
    })
    .join('');
}

function itemHtml(it: SolutionsItem, index: number, includeStems: boolean): string {
  const num = it.qnum || String(index + 1);
  const images = it.solutionImages
    .map((u) => `<img class="sol-img" src="${esc(u)}" alt="solution">`)
    .join('');

  let body: string;
  if (it.solutionFromParts && it.parts?.length) {
    body = partsHtml(it.parts, includeStems);
  } else if (it.solution.trim()) {
    body = solutionLinesHtml(it.solution);
  } else {
    const lines = partsAnswerLines(it.parts);
    if (!lines.length && it.answer.trim()) lines.push(it.answer.trim());
    body = lines.length
      ? `<div class="sol-ans">${lines.map((l) => `<div>Answer: ${esc(l)}</div>`).join('')}</div>`
      : images
        ? '' // a scanned solution IS the solution
        : '<div class="sol-none">No worked solution on file.</div>';
  }

  const stem = includeStems && stemText(it.questionText)
    ? `<div class="sol-stem">${esc(stemText(it.questionText))}</div>`
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
${katexInlineHead()}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:15mm 22mm 13mm}
  html,body{background:#fff}
  body{color:#111;font-family:"Times New Roman",Georgia,serif;font-size:10.5pt;line-height:1.6}
  .katex{font-size:1em}

  .sol-header{margin-bottom:9pt}
  .sol-type{display:block;text-align:center;color:${NAVY};font-weight:700;font-size:9.5pt;letter-spacing:.26em;border-bottom:1.1pt solid ${ANSWER_ORANGE};padding-bottom:2.5pt}
  .sol-title{text-align:center;font-size:13pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:6pt 0 2pt}
  .sol-meta{text-align:center;color:#6E6E6E;font-size:8.5pt}

  .sol-list{list-style:none;padding-left:20pt;margin:0}
  .sol-q{margin-bottom:10pt;position:relative;border-bottom:0.5pt solid #e3e3e3;padding-bottom:7pt}
  .sol-qnum{position:absolute;left:-20pt;top:0;font-weight:700;color:${NAVY}}
  .sol-stem{color:#6E6E6E;font-size:9pt;white-space:pre-wrap;margin-bottom:3.5pt}
  .sol-body{white-space:pre-wrap}
  .sol-line{white-space:pre-wrap;margin:1pt 0}
  .sol-gap{height:5pt}
  .sol-check{white-space:pre-wrap;color:#8a8a8a;font-size:9.5pt}
  .sol-check .katex{color:#8a8a8a}
  .sol-part{position:relative;padding-left:34pt;margin-top:7pt;break-inside:avoid}
  .sol-part:first-child{margin-top:0}
  .sol-plabel{position:absolute;left:0;top:0;font-weight:700;color:${NAVY}}
  .sol-pstem{color:#6E6E6E;font-size:9pt;white-space:pre-wrap;margin-bottom:2.5pt}
  .sol-final{margin-top:2.5pt;font-weight:700;color:${ANSWER_ORANGE}}
  .sol-final .katex{color:${ANSWER_ORANGE};font-weight:700}
  .sol-final .katex *{font-weight:inherit}
  .sol-final-k{font-weight:700}
  .sol-ans{color:${ANSWER_ORANGE};font-weight:700}
  .sol-ans .katex{color:${ANSWER_ORANGE}}
  .sol-none{color:#999;font-style:italic}
  .sol-img{display:block;max-width:100%;max-height:340pt;margin:4pt 0}

</style>
</head>
<body>
  <div class="sol-header">
    <span class="sol-type">WORKED SOLUTIONS</span>
    <div class="sol-title">${esc(input.title)}</div>
    <div class="sol-meta">${input.items.length} question${input.items.length === 1 ? '' : 's'}</div>
  </div>

  <ol class="sol-list">
${input.items.map((it, i) => itemHtml(it, i, input.includeStems !== false)).join('\n')}
  </ol>

${katexAutoRenderScript()}
</body>
</html>`;
}

export async function renderSolutionsPDF(input: SolutionsInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildSolutionsHTML(input), { waitUntil: 'load', timeout: 30000 });
    await waitForPageReady(page);
    await new Promise((r) => setTimeout(r, 250));
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
