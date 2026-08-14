// The printable follow-up-practice worksheet — HTML for the PDF the student
// downloads from /app/marking (rendered by /api/portal/practice-pdf).
//
// Replaces the bot's Word download (Adrian, 2026-08-14: "should just be a pdf
// that they can download"). Print-first layout: questions up front with real
// working space, answers gathered on their own page at the back so the front
// pages stay a clean working sheet. Math uses the same $…$ → KaTeX treatment
// as the page itself (lib/math-inline), so what prints matches what they saw.
//
// Pure string builder — no I/O — so the layout rules live under test.

import { mathHtml, escapeHtml } from '@/lib/math-inline';
import type { StudentPaper } from '@/lib/portal-marking';

// KaTeX class names need KaTeX's stylesheet + fonts. The CDN copy is pinned to
// the installed package's version (package.json "katex") — a drifting major
// would silently change glyph metrics on the printed sheet.
export const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css';

export type PracticePaper = Pick<StudentPaper, 'name' | 'date' | 'practice'>;

/** "Practice - Xinmin 2021 Prelim P2.pdf", with anything filename-hostile dropped. */
export function practicePdfFilename(paperName: string): string {
  const safe = paperName.replace(/[^\w\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `Practice - ${safe || 'worksheet'}.pdf`;
}

function niceDate(d: string): string {
  const t = new Date(d + 'T00:00:00Z');
  return Number.isNaN(t.getTime())
    ? escapeHtml(d)
    : t.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * One question block: number, "For Q… · topic" caption, the stem, the picked
 * note (why this question) and a fixed band of working space. The stem block
 * keeps together; the working space may fall across a page break — that's how
 * Adrian's own sheets behave too.
 */
function questionHtml(it: StudentPaper['practice'][number], n: number): string {
  const caption = [`For Q${escapeHtml(it.for)}`, it.topic ? escapeHtml(it.topic) : '']
    .filter(Boolean)
    .join(' · ');
  return `
  <div class="q">
    <div class="q-head">
      <span class="q-num">${n}.</span>
      <span class="q-for">${caption}</span>
    </div>
    <div class="q-stem">${mathHtml(it.question)}</div>
    ${it.note ? `<div class="q-note">${mathHtml(it.note)}</div>` : ''}
    <div class="space"></div>
  </div>`;
}

export function buildPracticePdfHtml(paper: PracticePaper, studentName?: string | null): string {
  const items = paper.practice;
  const answers = items
    .map((it, i) => ({ n: i + 1, for: it.for, answer: it.answer }))
    .filter(a => a.answer);

  const answersHtml = answers.length
    ? `
  <div class="answers">
    <h2>Answers</h2>
    <p class="a-hint">Check only after a full attempt — the working is the practice, not the number.</p>
    ${answers
      .map(a => `<p class="a-row"><b>${a.n}.</b> <span class="a-for">(for Q${escapeHtml(a.for)})</span> ${mathHtml(a.answer)}</p>`)
      .join('\n    ')}
  </div>`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${KATEX_CSS_URL}">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 11.5pt; color: #111; margin: 0;
  }
  .title { text-align: center; margin-bottom: 4mm; }
  .title h1 { font-size: 13pt; margin: 0 0 1mm; }
  .title .sub { font-size: 11pt; margin: 0; }
  .title .who { font-size: 9.5pt; color: #555; margin: 1.5mm 0 0; }
  hr { border: none; border-top: 1px solid #999; margin: 3mm 0 5mm; }
  .q { margin-bottom: 2mm; }
  .q-head, .q-stem, .q-note { break-inside: avoid; }
  .q-head { margin-bottom: 1mm; }
  .q-num { font-weight: bold; }
  .q-for { font-size: 9pt; color: #666; margin-left: 2mm; }
  .q-stem { white-space: pre-wrap; line-height: 1.45; }
  .q-note { font-style: italic; font-size: 9.5pt; color: #555; margin-top: 1mm; }
  .space { height: 48mm; }
  .answers { break-before: page; }
  .answers h2 { font-size: 12pt; margin: 0 0 1mm; }
  .a-hint { font-size: 9pt; color: #666; margin: 0 0 3mm; }
  .a-row { margin: 0 0 2mm; white-space: pre-wrap; line-height: 1.45; }
  .a-for { font-size: 9pt; color: #666; }
</style>
</head>
<body>
  <div class="title">
    <h1>${escapeHtml(paper.name)}</h1>
    <p class="sub">Follow-up practice · ${niceDate(paper.date)}</p>
    ${studentName ? `<p class="who">For ${escapeHtml(studentName)}</p>` : ''}
  </div>
  <hr>
  ${items.map((it, i) => questionHtml(it, i + 1)).join('\n')}
  ${answersHtml}
</body>
</html>`;
}
