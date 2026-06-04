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
  is_advanced?: boolean;
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
      .select('id, content_kind, section_name, card_title, content, marks, is_advanced, order_index')
      .eq('lesson_id', id)
      .order('content_kind').order('section_name').order('order_index'),
  ]);
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  const html = renderLessonHTML(lesson as { name: string; level: string; topics: string[]; description: string | null; section_order?: string[] }, (cards ?? []) as Card[]);

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

function renderLessonHTML(lesson: { name: string; level: string; topics: string[]; description: string | null; section_order?: string[] }, cards: Card[]): string {
  // Section-first: a lesson is an ordered list of named sections, each holding mixed-kind cards.
  const order = Array.isArray(lesson.section_order) ? lesson.section_order : [];
  const allSecs = [...new Set(cards.map(c => c.section_name || 'Default'))];
  const known = order.filter(s => allSecs.includes(s));
  const sections = [...known, ...allSecs.filter(s => !known.includes(s)).sort()];
  // Within a section: keep manual order, but advanced practice always sinks below non-advanced
  // (so the printed sheet reads "regular practice, then advanced practice").
  const advRank = (c: Card) => (c.content_kind === 'practice' && c.is_advanced ? 1 : 0);
  const cardsOf = (sec: string) => cards
    .filter(c => (c.section_name || 'Default') === sec)
    .sort((a, b) => (advRank(a) - advRank(b)) || (a.order_index - b.order_index));

  // Practice questions in lesson (section → order) sequence — numbered consistently across the
  // body and the Solutions list. (cardsOf already pushes advanced practice last per section.)
  const practiceOrdered = sections.flatMap(sec => cardsOf(sec).filter(c => c.content_kind === 'practice'));
  const practiceNum = new Map<string, number>();
  practiceOrdered.forEach((c, i) => practiceNum.set(c.id, i + 1));

  // Render one card by its kind (refresher = compact box, worked example = full, practice = question
  // + writing space). Answers/solutions for practice are collected at the back, not inline.
  const renderCard = (c: Card): string => {
    if (c.content_kind === 'refresher') {
      return `<div class="refresher-card">${c.card_title ? `<div class="title">${escapeHtml(c.card_title)}</div>` : ''}<div class="content">${mdToHtml(c.content ?? '')}</div></div>`;
    }
    if (c.content_kind === 'practice') {
      const n = practiceNum.get(c.id) ?? 0;
      return `<div class="practice-q"><div class="qnum">${n}. ${escapeHtml(c.card_title ?? '')}${c.marks ? `<span class="marks">[${c.marks}]</span>` : ''}</div><div class="content">${mdToHtml(c.content ?? '')}</div>${writingSpace(c.marks ?? 0)}</div>`;
    }
    return `<div class="we-card"><div class="header">${escapeHtml(c.card_title ?? 'Worked example')}</div><div class="body">${mdToHtml(c.content ?? '')}</div></div>`;
  };

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
  .adv-label { font-size: 11pt; color: #b45309; margin: 12pt 0 4pt; font-weight: 700; }
  .adv-tag { font-size: 8pt; color: #b45309; border: 0.5pt solid #f59e0b; border-radius: 3pt; padding: 0 3pt; vertical-align: middle; }

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

<!-- Lesson sections (in order; cards rendered by their kind) -->
${sections.map((sec, si) => {
  const list = cardsOf(sec);
  const firstAdvIdx = list.findIndex(c => c.content_kind === 'practice' && c.is_advanced);
  const inner = list.map((c, i) => {
    const label = (i === firstAdvIdx) ? '<h3 class="adv-label">Advanced practice</h3>' : '';
    return label + renderCard(c);
  }).join('');
  return `
<div class="section${si === 0 ? ' section-first' : ''}">
  <h2>${escapeHtml(sec)}</h2>
  ${inner}
</div>`;
}).join('')}

${practiceOrdered.length > 0 ? `
<!-- Practice — Solutions (collected at the back; refreshers & worked examples excluded) -->
<div class="solutions-section">
  <h2>Practice — Solutions</h2>
  ${practiceOrdered.map(c => `
    <div class="solution-block">
      <div class="qnum">${practiceNum.get(c.id)}. ${escapeHtml(c.card_title ?? '')}${c.is_advanced ? ' <span class="adv-tag">ADV</span>' : ''}</div>
      <div>${mdToHtml(c.content ?? '')}</div>
    </div>`).join('')}
</div>` : ''}

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

  // Protect raw <svg> blocks (AI-generated diagrams may span many lines / contain blank lines)
  // so the paragraph splitter + <br> insertion below don't mangle them.
  const blocks: string[] = [];
  const src = md.replace(/<svg[\s\S]*?<\/svg>/gi, (m) => {
    blocks.push(m);
    return `@@B${blocks.length - 1}@@`;
  });

  const html = src.split(/\n\n+/).map(p => p.trim()).filter(Boolean).map(p => {
    // A paragraph that is exactly a protected SVG block → emit it raw (no <p>, no <br>).
    const only = p.match(/^@@B(\d+)@@$/);
    if (only) return blocks[Number(only[1])];
    // A paragraph that is a single raw block element → pass through untouched.
    if (/^<(img|div|figure|table|svg)[\s>]/i.test(p)) return p;
    let h = p
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/\n/g, '<br>');
    return `<p>${h}</p>`;
  }).join('\n');

  // Restore any SVG that was inline within a paragraph (placeholder survived the <p> wrap).
  return html.replace(/@@B(\d+)@@/g, (_, i) => blocks[Number(i)]);
}
