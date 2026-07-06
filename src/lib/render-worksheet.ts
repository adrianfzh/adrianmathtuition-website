/**
 * src/lib/render-worksheet.ts
 *
 * Builds the house-styled worksheet HTML (Worked Examples + Practice) and
 * renders it to an A4 PDF via the shared Puppeteer browser singleton
 * (getBrowser from lib/generate-pdf — same @sparticuz/chromium-min setup).
 * KaTeX math is typeset client-side inside Puppeteer via auto-render,
 * mirroring lib/render-revise.ts.
 */

import { getBrowser } from '@/lib/generate-pdf';

export interface WorksheetItem {
  id: string;
  role: 'we' | 'practice';
  text: string;
  marks: number | null;
  answer: string;
  annotated?: string;
  imageUrl?: string | null;
}

export interface WorksheetInput {
  title: string;
  subtitle: string;
  level: string;
  items: WorksheetItem[];
}

// ── Minimal markdown+LaTeX → HTML ────────────────────────────────────────────
// The annotated solutions are markdown with $...$/$$...$$ math and optional
// ```svg fenced diagrams. Math segments are protected as escaped literals so
// KaTeX auto-render (running in the Puppeteer page) picks them up from the DOM.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mdToHtml(src: string): string {
  if (!src) return '';
  const stash: string[] = [];
  const keep = (html: string) => {
    stash.push(html);
    return `\x00${stash.length - 1}\x00`;
  };

  let text = src.replace(/\r\n/g, '\n');

  // 1. ```svg fenced blocks → raw inline SVG (trusted admin/AI content, local render)
  text = text.replace(/```svg\s*\n([\s\S]*?)```/g, (_, svg: string) =>
    keep(`<div class="ws-svg">${svg.trim()}</div>`)
  );
  // Other fenced blocks → <pre>
  text = text.replace(/```[a-z]*\s*\n([\s\S]*?)```/g, (_, code: string) =>
    keep(`<pre class="ws-pre">${esc(code.replace(/\s+$/, ''))}</pre>`)
  );

  // 2. Protect math so markdown transforms can't mangle it ($$ first, then $)
  text = text.replace(/\$\$[\s\S]+?\$\$/g, m => keep(esc(m)));
  text = text.replace(/\$[^$\n]+\$/g, m => keep(esc(m)));

  // 3. Escape the remaining plain text
  text = esc(text);

  // 4. Inline markdown: bold then italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');

  // 5. Block structure: headings, lists, hr, paragraphs
  const lines = text.split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let inList = false;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join('<br>')}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (!trimmed) {
      flushPara();
      closeList();
    } else if (heading) {
      flushPara();
      closeList();
      const depth = Math.min(heading[1].length + 3, 6);
      out.push(`<h${depth}>${heading[2]}</h${depth}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushPara();
      closeList();
      out.push('<hr>');
    } else if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${trimmed.replace(/^[-*]\s+/, '')}</li>`);
    } else if (/^\x00\d+\x00$/.test(trimmed) && stash[Number(trimmed.slice(1, -1))]?.startsWith('<')) {
      // A stashed block-level element (svg/pre) alone on its line — emit directly
      flushPara();
      closeList();
      out.push(trimmed);
    } else {
      closeList();
      para.push(trimmed);
    }
  }
  flushPara();
  closeList();

  // 6. Restore stashed math / svg / pre
  return out.join('\n').replace(/\x00(\d+)\x00/g, (_, i: string) => stash[Number(i)]);
}

// ── HTML builder ─────────────────────────────────────────────────────────────

function imageHtml(url?: string | null): string {
  return url ? `<img class="ws-img" src="${esc(url)}" alt="question diagram">` : '';
}

export function buildWorksheetHTML(input: WorksheetInput): string {
  const { title, subtitle, items } = input;
  const we = items.filter(i => i.role === 'we');
  const practice = items.filter(i => i.role === 'practice');
  const totalMarks = items.reduce((s, i) => s + (i.marks ?? 0), 0);

  const weHtml = we
    .map(
      (item, i) => `
    <div class="we">
      <div class="we-label">Example ${i + 1}${item.marks ? ` <span class="we-marks">[${item.marks}]</span>` : ''}</div>
      <div class="we-question">${mdToHtml(item.text)}${imageHtml(item.imageUrl)}</div>
      <div class="we-solution">${mdToHtml(item.annotated || item.answer || '')}</div>
    </div>`
    )
    .join('\n');

  const practiceHtml = practice
    .map(
      (item, i) => `
    <div class="pq">
      <div class="pq-row">
        <div class="pq-num">${i + 1}.</div>
        <div class="pq-body">
          ${mdToHtml(item.text)}${imageHtml(item.imageUrl)}
          ${item.marks ? `<div class="pq-marks">[${item.marks}]</div>` : ''}
          <div class="pq-ans">[Ans: ${esc(item.answer || '—')}]</div>
        </div>
      </div>
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
  body{
    font-family:Georgia,'Times New Roman',Times,serif;
    color:#111;background:#fff;
    font-size:12.5pt;line-height:1.62;
  }
  p{margin:0 0 8px}
  ul{margin:0 0 8px 20px}
  h4,h5,h6{margin:12px 0 6px;color:#1a365d}
  hr{border:none;border-top:1px solid #ddd;margin:12px 0}
  .ws-pre{font-family:ui-monospace,Menlo,monospace;font-size:10.5pt;background:#f6f7f9;padding:8px 10px;border-radius:3px;margin:0 0 8px;white-space:pre-wrap}
  .ws-svg{margin:10px 0;text-align:center}
  .ws-svg svg{max-width:340px;height:auto}
  .ws-img{max-width:78%;display:block;margin:10px auto}

  /* Header */
  .header{border-bottom:2.5px solid #1a365d;padding-bottom:10px;margin-bottom:18px}
  .header h1{font-size:19pt;color:#1a365d;font-weight:700;margin:0 0 3px}
  .header .sub{display:flex;justify-content:space-between;align-items:baseline;color:#555;font-size:10.5pt}
  .header .sub .tm{font-weight:700;color:#1a365d}

  /* Section headings */
  .section-h{
    font-size:12pt;font-weight:700;color:#1a365d;text-transform:uppercase;
    letter-spacing:1px;margin:20px 0 12px;padding-bottom:4px;border-bottom:1px solid #cbd5e1;
  }

  /* Worked examples */
  .we{margin-bottom:22px;break-inside:avoid-page}
  .we-label{font-weight:700;color:#1a365d;font-size:11pt;margin-bottom:5px}
  .we-marks{color:#666;font-weight:400}
  .we-question{padding:9px 13px;background:#f4f6fa;border-left:3px solid #1a365d;border-radius:2px;margin-bottom:9px}
  .we-solution{padding:0 2px}

  /* Practice */
  .pq{margin-bottom:26px}
  .pq-row{display:flex;gap:9px}
  .pq-num{font-weight:700;min-width:22px}
  .pq-body{flex:1}
  .pq-marks{text-align:right;font-weight:600;color:#333;margin-top:2px}
  .pq-ans{text-align:right;color:#E8710A;font-size:11pt;margin-top:2px}

  .katex{font-size:1.04em}
  .katex-display{margin:10px 0;overflow-x:auto}
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(title)}</h1>
    <div class="sub">
      <span>${esc(subtitle)}</span>
      <span class="tm">${totalMarks > 0 ? `Total: ${totalMarks} marks` : ''}</span>
    </div>
  </div>
  ${we.length ? `<div class="section-h">Worked Examples</div>\n${weHtml}` : ''}
  ${practice.length ? `<div class="section-h">Practice</div>\n${practiceHtml}` : ''}
</body>
</html>`;
}

// ── PDF renderer ─────────────────────────────────────────────────────────────

export async function renderWorksheetPDF(input: WorksheetInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const html = buildWorksheetHTML(input);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for KaTeX auto-render (flag set by the onload handler)
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
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
    await new Promise(r => setTimeout(r, 250)); // layout settle

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
