// GET /api/admin/lessons/[id]/pdf → returns PDF
// Renders an HTML template via Puppeteer with explicit KaTeX-rendered signal.
// Layout: cover → refreshers → worked examples → practice questions → answers → solutions
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBrowser } from '@/lib/generate-pdf';

export const maxDuration = 60;

interface Card {
  id: string;
  content_kind: 'refresher' | 'worked_example' | 'practice';
  section_name: string;
  card_title: string | null;
  content: string | null;
  marks: number | null;
  order_index: number;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const supa = getSupabaseAdmin();

  const [{ data: lesson }, { data: cards }] = await Promise.all([
    supa.from('lessons').select('*').eq('id', id).maybeSingle(),
    supa
      .from('lesson_cards')
      .select('id, content_kind, section_name, card_title, content, marks, order_index')
      .eq('lesson_id', id)
      .order('content_kind').order('section_name').order('order_index'),
  ]);
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  const html = renderLessonHTML(lesson as { name: string; level: string; topics: string[]; description: string | null }, (cards ?? []) as Card[]);

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Wait for KaTeX render signal — set by inline script after rendering completes
    await page.waitForFunction('window.__rendered === true', { timeout: 30_000 });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '20mm', bottom: '18mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });
    await page.close();
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${(lesson as { name: string }).name.replace(/[^a-z0-9-]+/gi, '_')}.pdf"`,
      },
    });
  } catch (e) {
    console.error('[lesson-pdf] generation failed:', e);
    return NextResponse.json({ error: 'PDF generation failed: ' + (e as Error).message }, { status: 500 });
  }
}

// ── HTML template ──

function renderLessonHTML(lesson: { name: string; level: string; topics: string[]; description: string | null }, cards: Card[]): string {
  const refreshers = cards.filter(c => c.content_kind === 'refresher');
  const workedExamples = cards.filter(c => c.content_kind === 'worked_example');
  const practice = cards.filter(c => c.content_kind === 'practice');

  const groupBySection = (list: Card[]) => {
    const out: Record<string, Card[]> = {};
    for (const c of list) {
      const k = c.section_name || 'Default';
      if (!out[k]) out[k] = [];
      out[k].push(c);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.order_index - b.order_index);
    return out;
  };

  const refreshersBySection = groupBySection(refreshers);
  const wesBySection = groupBySection(workedExamples);
  const practiceBySection = groupBySection(practice);

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(lesson.name)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Source Serif Pro', Georgia, serif; font-size: 11pt; line-height: 1.4; color: #1f2937; margin: 0; padding: 0; }
  h1, h2, h3 { font-family: 'Source Sans Pro', system-ui, sans-serif; color: #111827; }
  h1 { font-size: 24pt; margin: 0 0 8pt; }
  h2 { font-size: 16pt; margin: 24pt 0 8pt; border-bottom: 2pt solid #1f2937; padding-bottom: 4pt; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; color: #374151; page-break-after: avoid; }

  /* Cover */
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
  .cover h1 { font-size: 32pt; margin-bottom: 16pt; }
  .cover .level { display: inline-block; padding: 4pt 16pt; background: #1e3a5f; color: white; border-radius: 4pt; font-size: 14pt; font-weight: 600; margin-bottom: 24pt; }
  .cover .topics { font-size: 11pt; color: #4b5563; max-width: 70%; }
  .cover .date { position: absolute; bottom: 30mm; font-size: 10pt; color: #6b7280; }

  /* Section dividers */
  .section { page-break-before: always; }
  .section-first { page-break-before: avoid; }

  /* Refreshers — compact 2-column */
  .refreshers-grid { column-count: 2; column-gap: 8mm; }
  .refresher-card { break-inside: avoid; page-break-inside: avoid; background: #f9fafb; border-left: 3pt solid #10b981; padding: 6pt 10pt; margin-bottom: 6pt; border-radius: 2pt; }
  .refresher-card .title { font-weight: 600; font-size: 10pt; margin-bottom: 3pt; color: #111827; }
  .refresher-card .content { font-size: 10pt; color: #374151; }

  /* Worked examples */
  .we-card { page-break-inside: avoid; margin-bottom: 18pt; border: 1pt solid #d1d5db; border-radius: 3pt; }
  .we-card .header { background: #eff6ff; padding: 5pt 10pt; font-weight: 600; font-size: 11pt; border-bottom: 1pt solid #d1d5db; }
  .we-card .body { padding: 8pt 10pt; font-size: 10.5pt; }

  /* Practice questions */
  .practice-q { page-break-inside: avoid; margin-bottom: 18pt; }
  .practice-q .qnum { font-weight: 700; font-size: 11pt; color: #111827; }
  .practice-q .marks { float: right; font-weight: 600; color: #6b7280; }
  .practice-q .content { font-size: 11pt; margin: 4pt 0 8pt; }
  .practice-q .writing-space { border-top: 0.5pt dashed #9ca3af; height: 1.4em; margin: 0 0 0.4em; }

  /* Answer/Solution sections — separate pages */
  .answers-section, .solutions-section { page-break-before: always; }
  .answer-row { margin-bottom: 6pt; font-size: 10.5pt; }
  .answer-row .qnum { display: inline-block; min-width: 30pt; font-weight: 600; }
  .solution-block { page-break-inside: avoid; margin-bottom: 14pt; padding-bottom: 8pt; border-bottom: 1pt dotted #d1d5db; }
  .solution-block .qnum { font-weight: 700; margin-bottom: 4pt; }

  /* KaTeX fixes */
  .katex { font-size: 1em !important; }
  .katex-display { margin: 4pt 0 !important; }
</style>
</head>
<body>

<!-- Cover -->
<div class="cover">
  <h1>${escapeHtml(lesson.name)}</h1>
  <div class="level">${escapeHtml(lesson.level)}</div>
  ${lesson.description ? `<div style="font-size:11pt;color:#4b5563;margin-bottom:16pt;max-width:70%;">${escapeHtml(lesson.description)}</div>` : ''}
  ${lesson.topics.length > 0 ? `<div class="topics"><strong>Topics covered:</strong> ${lesson.topics.map(escapeHtml).join(' · ')}</div>` : ''}
  <div class="date">Generated ${today}</div>
</div>

<!-- Refreshers -->
${refreshers.length > 0 ? `
<div class="section section-first">
  <h2>Refreshers</h2>
  ${Object.entries(refreshersBySection).map(([sec, list]) => `
    ${Object.keys(refreshersBySection).length > 1 ? `<h3>${escapeHtml(sec)}</h3>` : ''}
    <div class="refreshers-grid">
      ${list.map(c => `
        <div class="refresher-card">
          ${c.card_title ? `<div class="title">${escapeHtml(c.card_title)}</div>` : ''}
          <div class="content">${mdToHtml(c.content ?? '')}</div>
        </div>`).join('')}
    </div>`).join('')}
</div>` : ''}

<!-- Worked Examples -->
${workedExamples.length > 0 ? `
<div class="section">
  <h2>Worked Examples</h2>
  ${Object.entries(wesBySection).map(([sec, list]) => `
    ${Object.keys(wesBySection).length > 1 ? `<h3>${escapeHtml(sec)}</h3>` : ''}
    ${list.map((c, i) => `
      <div class="we-card">
        <div class="header">${i + 1}. ${escapeHtml(c.card_title ?? 'Worked example')}</div>
        <div class="body">${mdToHtml(c.content ?? '')}</div>
      </div>`).join('')}
  `).join('')}
</div>` : ''}

<!-- Practice Questions -->
${practice.length > 0 ? `
<div class="section">
  <h2>Practice Questions</h2>
  ${Object.entries(practiceBySection).map(([sec, list]) => `
    ${Object.keys(practiceBySection).length > 1 ? `<h3>${escapeHtml(sec)}</h3>` : ''}
    ${list.map((c, i) => `
      <div class="practice-q">
        <div class="qnum">${i + 1}. ${escapeHtml(c.card_title ?? '')}
          ${c.marks ? `<span class="marks">[${c.marks}]</span>` : ''}
        </div>
        <div class="content">${mdToHtml(c.content ?? '')}</div>
        ${writingSpace(c.marks ?? 0)}
      </div>`).join('')}
  `).join('')}
</div>

<!-- Answers -->
<div class="answers-section">
  <h2>Practice — Answers</h2>
  ${practice.map((c, i) => `
    <div class="answer-row">
      <span class="qnum">${i + 1}.</span>
      <em style="color:#9ca3af">[answer here — view full solution at the back]</em>
    </div>`).join('')}
</div>

<!-- Solutions -->
<div class="solutions-section">
  <h2>Practice — Solutions</h2>
  ${practice.map((c, i) => `
    <div class="solution-block">
      <div class="qnum">${i + 1}. ${escapeHtml(c.card_title ?? '')}</div>
      <div>${mdToHtml(c.content ?? '')}</div>
    </div>`).join('')}
</div>
` : ''}

<script>
// Render KaTeX in all elements, then signal we're ready for screenshot.
window.addEventListener('load', function() {
  try {
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\\\[', right: '\\\\]', display: true },
        { left: '\\\\(', right: '\\\\)', display: false },
      ],
      throwOnError: false,
      strict: false,
    });
  } catch (e) {
    console.warn('KaTeX render error', e);
  }
  // Tiny delay for layout to settle, then signal ready
  setTimeout(function() { window.__rendered = true; }, 200);
});
</script>
</body>
</html>`;
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

function writingSpace(marks: number): string {
  // 3 lines per mark, default to 3 lines for 0-mark questions
  const lines = Math.max(3, marks * 3);
  return Array.from({ length: lines }, () => `<div class="writing-space"></div>`).join('');
}

function mdToHtml(md: string): string {
  // Minimal Markdown — bold, italic, paragraphs. KaTeX delimiters are preserved.
  if (!md) return '';
  // Split on blank lines for paragraphs
  const paras = md.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  return paras.map(p => {
    // Bold + italic
    let html = p
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Preserve LaTeX delimiters as-is; replace remaining newlines with <br>
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }).join('\n');
}
