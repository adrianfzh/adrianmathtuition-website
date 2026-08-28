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
//
// House-style brand header (Adrian, phone review #8, 2026-08-29): the same
// navy letterspaced "ADRIAN'S MATH TUITION" over an orange rule as his other
// worksheets (reference: .ws-brand in lib/render-bot-worksheet.ts) sits above
// the paper title. Bank-pick items also print their marks, exam-style and
// right-aligned; StudentPracticeItem carries no marks itself, so the route
// resolves them in one Supabase query and hands them in as `marksById` —
// generated items (id null) and ids with no mapped/positive total_marks just
// print with no bracket. And every question block (head + stem + note + its
// working space) is now break-inside: avoid — a question must never be split
// from its own working space across a page, so the space is bigger too.

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
 * One question block: number, "For Q… · topic" caption, marks (bank picks
 * only — generated items carry none), the stem, the picked note (why this
 * question) and a fixed band of working space. The whole block is kept
 * together — head, stem, note and its working space never straddle a page
 * break, so a question is never separated from the space to answer it in.
 */
function questionHtml(it: StudentPaper['practice'][number], n: number, marks: number | null): string {
  const caption = [`For Q${escapeHtml(it.for)}`, it.topic ? escapeHtml(it.topic) : '']
    .filter(Boolean)
    .join(' · ');
  const marksTag = marks ? `<span class="q-mk">[${marks}]</span>` : '';
  return `
  <div class="q">
    <div class="q-head">
      <span class="q-num">${n}.</span>
      <span class="q-for">${caption}</span>
      ${marksTag}
    </div>
    <div class="q-stem">${mathHtml(it.question)}</div>
    ${it.note ? `<div class="q-note">${mathHtml(it.note)}</div>` : ''}
    <div class="space"></div>
  </div>`;
}

/** Bank-pick marks for one item, or null when generated / unmapped / zero. */
function marksFor(id: string | null, marksById?: Record<string, number>): number | null {
  if (!id || !marksById) return null;
  const m = marksById[id];
  return typeof m === 'number' && m > 0 ? m : null;
}

export function buildPracticePdfHtml(
  paper: PracticePaper,
  studentName?: string | null,
  marksById?: Record<string, number>,
): string {
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
  .brand {
    text-align: center; color: #1c3a5e; font-weight: 700; font-size: 11.5pt;
    letter-spacing: .3em; border-bottom: 1.1pt solid #843C0C; padding-bottom: 2.5pt;
    margin-bottom: 4mm;
  }
  .title { text-align: center; margin-bottom: 4mm; }
  .title h1 { font-size: 13pt; margin: 0 0 1mm; }
  .title .sub { font-size: 11pt; margin: 0; }
  .title .who { font-size: 9.5pt; color: #555; margin: 1.5mm 0 0; }
  hr { border: none; border-top: 1px solid #999; margin: 3mm 0 5mm; }
  .q { margin-bottom: 2mm; break-inside: avoid; page-break-inside: avoid; }
  .q-head { margin-bottom: 1mm; overflow: hidden; }
  .q-num { font-weight: bold; }
  .q-for { font-size: 9pt; color: #666; margin-left: 2mm; }
  .q-mk { float: right; font-weight: 400; }
  .q-stem { white-space: pre-wrap; line-height: 1.45; }
  .q-note { font-style: italic; font-size: 9.5pt; color: #555; margin-top: 1mm; }
  .space { height: 68mm; }
  .answers { break-before: page; }
  .answers h2 { font-size: 12pt; margin: 0 0 1mm; }
  .a-hint { font-size: 9pt; color: #666; margin: 0 0 3mm; }
  .a-row { margin: 0 0 2mm; white-space: pre-wrap; line-height: 1.45; }
  .a-for { font-size: 9pt; color: #666; }
</style>
</head>
<body>
  <div class="brand">ADRIAN&rsquo;S MATH TUITION</div>
  <div class="title">
    <h1>${escapeHtml(paper.name)}</h1>
    <p class="sub">Follow-up practice · ${niceDate(paper.date)}</p>
    ${studentName ? `<p class="who">For ${escapeHtml(studentName)}</p>` : ''}
  </div>
  <hr>
  ${items.map((it, i) => questionHtml(it, i + 1, marksFor(it.id, marksById))).join('\n')}
  ${answersHtml}
</body>
</html>`;
}
