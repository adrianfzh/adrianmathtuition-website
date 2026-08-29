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

const NAVY = '#1c3a5e';
const ANSWER_ORANGE = '#843C0C';

/** Bump on ANY visual change to this renderer — it keys the paper_pdf_cache,
 * so stale-looking cached PDFs after a layout tweak mean this wasn't bumped. */
export const PAPER_PDF_RENDER_VERSION = 1;

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
 */
export function richText(s: string): string {
  const lines = String(s).split('\n');
  const out: string[] = [];
  let buf: string[] = [];
  let table: string[][] | null = null;
  const flushBuf = () => {
    if (buf.length) {
      out.push(esc(buf.join('\n')));
      buf = [];
    }
  };
  const flushTable = () => {
    if (table && table.length) {
      const [head, ...rest] = table;
      out.push(
        '<table class="pp-table"><thead><tr>' + head.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead>' +
          (rest.length
            ? '<tbody>' + rest.map((r) => '<tr>' + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody>'
            : '') +
          '</table>',
      );
    }
    table = null;
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (/^\|.*\|?$/.test(t) && t.includes('|', 1)) {
      flushBuf();
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) (table ??= []).push(cells);
      continue;
    }
    flushTable();
    buf.push(raw);
  }
  flushBuf();
  flushTable();
  return out.join('\n');
}

function img(u: string): string {
  return `<img class="pp-figure" src="${esc(u)}" alt="figure">`;
}

function spacer(marks: number | null | undefined): string {
  return `<div class="pp-space" style="height:${workingSpaceMm(marks)}mm"></div>`;
}

function partHtml(p: Part, workingSpace: boolean): string {
  const label = p.label ? `<strong>(${esc(String(p.label).replace(/^\(|\)$/g, ''))})</strong> ` : '';
  const marks = p.marks ? `<span class="pp-mk">[${p.marks}]</span>` : '';
  const before = p.image_url ? img(p.image_url) : '';
  const after = p.image_url_after ? img(p.image_url_after) : '';
  const text = p.text ? `<div class="pp-part-text">${label}${richText(p.text)}${marks}</div>` : (label || marks ? `<div class="pp-part-text">${label}${marks}</div>` : '');
  const subs = (p.subparts ?? []).map((sp) => partHtml(sp, workingSpace)).join('');
  // Working space belongs to the part that asks for the work: a part with its
  // own marks and no marked subparts gets the skill-rule space after it.
  const subsCarryMarks = (p.subparts ?? []).some(function carry(sp): boolean {
    return !!sp.marks || (sp.subparts ?? []).some(carry);
  });
  const space = workingSpace && p.marks && !subsCarryMarks ? spacer(p.marks) : '';
  return `<div class="pp-part">${before}${text}${after}${space}${subs}</div>`;
}

function partsCarryMarks(parts: Part[]): boolean {
  return parts.some((p) => !!p.marks || partsCarryMarks(p.subparts ?? []));
}

function questionHtml(q: PaperPdfQuestion, workingSpace: boolean): string {
  const figures = q.images.map(img).join('');
  const hole = q.missingFigure
    ? '<div class="pp-missing-figure">[ figure referenced by this question is not in the bank ]</div>'
    : '';
  const inParts = partsCarryMarks(q.parts);
  const stemMarks = !inParts && q.marks != null ? `<span class="pp-mk">[${q.marks}]</span>` : '';
  const stem = q.stem.trim()
    ? `<div class="pp-stem">${richText(q.stem.trim())}${stemMarks}</div>`
    : (stemMarks ? `<div class="pp-stem">${stemMarks}</div>` : '');
  const parts = q.parts.map((p) => partHtml(p, workingSpace)).join('');
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

function answerKeyHtml(questions: PaperPdfQuestion[]): string {
  const rows = questions
    .map((q) => {
      const body = q.answerLines.length
        ? q.answerLines.map((l) => `<div>${esc(l)}</div>`).join('')
        : '<div class="pp-a-none">—</div>';
      return `<li class="pp-a"><span class="pp-anum">${esc(q.qnum)}</span><div class="pp-a-body">${body}</div></li>`;
    })
    .join('\n');
  return `
  <section class="pp-answers">
    <div class="pp-answers-h">Answer Key</div>
    <ol class="pp-answer-list">${rows}</ol>
  </section>`;
}

export function buildPaperHTML(input: PaperPdfInput): string {
  const { title, metaLine, questions, workingSpace, answerKey } = input;
  const warning = (input.coverageWarning ?? '').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
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
  .pp-stem{white-space:pre-wrap;break-inside:avoid}
  /* Data tables from stems/parts (richText) — exam-style bordered grid. The
     pre-wrap ancestors would render the table's own newlines; normal it. */
  .pp-table{white-space:normal;border-collapse:collapse;margin:4pt 0;break-inside:avoid}
  .pp-table th,.pp-table td{border:0.75pt solid #444;padding:2pt 8pt;text-align:center}
  .pp-table th{font-weight:700}
  .pp-part{margin-top:4pt}
  .pp-part .pp-part{margin-left:15pt}
  .pp-part-text{white-space:pre-wrap;break-inside:avoid}
  .pp-figure{display:block;max-width:100%;max-height:300pt;margin:6pt 0}
  .pp-missing-figure{border:0.75pt dashed #999;color:#999;font-style:italic;text-align:center;padding:14pt 8pt;margin:5pt 0}

  .pp-mk{float:right;font-weight:400}
  .pp-space{display:block;clear:both}
  .pp-keep{break-inside:avoid;page-break-inside:avoid}
  .pp-fresh{break-before:page;page-break-before:always}

  .pp-answers{break-before:page;page-break-before:always;padding-top:2pt}
  .pp-answers-h{color:${NAVY};font-weight:700;font-size:12pt;letter-spacing:.24em;text-transform:uppercase;border-bottom:0.9pt solid ${ANSWER_ORANGE};padding-bottom:2.5pt;margin-bottom:7pt}
  .pp-answer-list{list-style:none;padding-left:24pt;margin:0}
  .pp-a{position:relative;margin-bottom:5pt;break-inside:avoid;color:${ANSWER_ORANGE}}
  .pp-a .katex{color:${ANSWER_ORANGE}}
  .pp-anum{position:absolute;left:-24pt;top:0;font-weight:700;color:#111}
  .pp-a-none{color:#999}

</style>
</head>
<body>
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

${answerKey ? answerKeyHtml(questions) : ''}
</body>
</html>`;
}

export async function renderPaperPDF(input: PaperPdfInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildPaperHTML(input), { waitUntil: 'networkidle0', timeout: 30000 });
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
    // Figure-sharpness pass: the bank's crops are ~850–1000px scans, and
    // stretching one across the full 166mm text width prints at ~130 DPI —
    // visibly soft. Cap each figure's on-page size so it never renders below
    // ~200 DPI (CSS px = naturalWidth × 96/200); a figure only shrinks, never
    // grows, and stays within the column. Must run BEFORE the pagination
    // measurement since it changes heights.
    await page.evaluate(() => {
      const MAX_CSS_PER_NATURAL = 96 / 200;
      document.querySelectorAll('img.pp-figure').forEach((el) => {
        const img = el as HTMLImageElement;
        if (!img.naturalWidth) return;
        const sharpWidth = img.naturalWidth * MAX_CSS_PER_NATURAL;
        const colWidth = img.parentElement?.clientWidth ?? sharpWidth;
        img.style.width = `${Math.min(sharpWidth, colWidth)}px`;
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
