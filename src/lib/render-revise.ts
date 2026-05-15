/**
 * src/lib/render-revise.ts
 *
 * Puppeteer-based renderer for /revise practice question images.
 * Three image types: question | question_with_answer | solution
 * Each rendered as a 800px-wide PNG at 2× DPR with KaTeX math typesetting.
 */

import puppeteer from 'puppeteer-core';

export type RenderType = 'question' | 'question_with_answer' | 'solution';

export interface ReviseRenderInput {
  topic: string;
  subgroup_name: string;
  question_text: string;
  marks: number | null;
  answer: string;
  solution: string;
}

// ── Browser singleton ─────────────────────────────────────────────────────────

let _browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (_browser) {
    try { await _browser.version(); return _browser; } catch { _browser = null; }
  }
  const isProd = process.env.VERCEL === '1';
  if (isProd) {
    const chromium = await import('@sparticuz/chromium-min');
    const executablePath = await chromium.default.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'
    );
    _browser = await puppeteer.launch({
      args: chromium.default.args,
      executablePath,
      headless: true,
    });
  } else {
    _browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return _browser;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert plain text (with newlines and LaTeX $...$) to HTML paragraphs. */
function textToHtml(s: string): string {
  return esc(s)
    .split('\n\n')
    .filter(p => p.trim())
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildHTML(input: ReviseRenderInput, type: RenderType): string {
  const { topic, subgroup_name, question_text, marks, answer, solution } = input;
  const subheading = `${esc(topic)} — ${esc(subgroup_name)}`;
  const marksHtml  = marks ? `<div class="total-marks">[${marks} marks]</div>` : '';

  let h1: string;
  let bodyContent: string;

  if (type === 'question') {
    h1 = 'Practice Question';
    bodyContent = `
      <div class="question">${textToHtml(question_text)}</div>
      ${marksHtml}`;

  } else if (type === 'question_with_answer') {
    h1 = 'Practice Question';
    bodyContent = `
      <div class="question">${textToHtml(question_text)}</div>
      ${marksHtml}
      <div class="label">Answer</div>
      <div class="answer-block answer-text">${textToHtml(answer)}</div>`;

  } else {
    // solution
    h1 = 'Solution';
    bodyContent = `
      <div class="question">${textToHtml(question_text)}</div>
      ${marksHtml}
      <div class="label">Solution</div>
      <div class="solution-block">${textToHtml(solution)}</div>
      <div class="total-marks">Answer: ${esc(answer)}</div>`;
  }

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
    throwOnError:false
  });window.__katexDone=true;"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:Georgia,'Times New Roman',Times,serif;
    background:#fff;color:#111;
    padding:32px;line-height:1.65;font-size:17px;
    max-width:720px;
  }
  p{margin:0 0 10px}
  p:last-child{margin-bottom:0}
  h1{font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.6px;margin:0 0 6px}
  h2{font-size:13px;font-weight:400;color:#888;font-style:italic;margin:0 0 22px}
  .question{margin-bottom:4px}
  .total-marks{color:#444;font-size:14px;font-weight:600;margin-top:14px;padding-top:12px;border-top:1px solid #ddd}
  .label{font-weight:700;color:#1a365d;font-size:13px;text-transform:uppercase;letter-spacing:.5px;margin:22px 0 8px}
  .answer-block{background:#f7f9fc;padding:12px 16px;border-left:3px solid #1a365d;border-radius:2px}
  .solution-block{margin-bottom:4px}
  .katex{font-size:1.06em}
  .katex-display{margin:14px 0;overflow-x:auto}
</style>
</head>
<body>
<h1>${esc(h1)}</h1>
<h2>${subheading}</h2>
${bodyContent}
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function renderRevisePNG(
  input: ReviseRenderInput,
  type: RenderType,
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });

    const html = buildHTML(input, type);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });

    // Wait for KaTeX auto-render (set by the onload handler above)
    await page.evaluate(() =>
      new Promise<void>(resolve => {
        if ((window as unknown as Record<string, boolean>).__katexDone) return resolve();
        const t0 = Date.now();
        const iv = setInterval(() => {
          if ((window as unknown as Record<string, boolean>).__katexDone || Date.now() - t0 > 5000) {
            clearInterval(iv);
            resolve();
          }
        }, 50);
      })
    );

    // Short settle for any layout reflow after KaTeX
    await new Promise(r => setTimeout(r, 250));

    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

    const shot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 800, height: Math.min(bodyHeight + 16, 4800) },
    });

    return Buffer.from(shot);
  } finally {
    await page.close();
  }
}
