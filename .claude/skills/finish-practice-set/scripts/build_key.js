#!/usr/bin/env node
// Render an answer-key page in the house style of "2026 JC Promo Practice Set 1".
//
//   node build_key.js answers.json /tmp/key4.pdf A4      (or Letter)
//
// answers.json: [{ "n": "1", "parts": [["(a)", "text with $latex$"], ...] }, ...]
// An empty label ("") prints the answer with no part letter.
const fs = require('fs');
const path = require('path');

const REPO = '/Users/adrianfong/dev/adrianmathtuition-website';
const katex = require(path.join(REPO, 'node_modules/katex'));
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer-core'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let [ansPath, outPath, fmt = 'A4'] = process.argv.slice(2);
if (!ansPath || !outPath) {
  console.error('usage: node build_key.js <answers.json> <out.pdf> [A4|Letter]');
  process.exit(1);
}
ansPath = path.resolve(ansPath);
outPath = path.resolve(outPath);

// Either a bare array (legacy JC form) or { heading, subheading, style, answers }.
const raw = JSON.parse(fs.readFileSync(ansPath, 'utf8'));
const cfg = Array.isArray(raw) ? { answers: raw } : raw;
const data = cfg.answers;
// 'jc' = centred navy "H2 Mathematics" head, parts running on one line.
// 'em' = Adrian's EM prelim sheets: left-aligned Times-Bold head, one part per line.
const style = cfg.style || 'jc';
const em = style === 'em';
const heading = cfg.heading || (em ? 'Answers  -  Paper 1' : 'H2 Mathematics');
// "" suppresses the sub-heading entirely (an untitled set has nothing to put there).
const subheading = cfg.subheading === undefined
  ? (em ? 'Practice Set' : 'Promotional Examination &nbsp;&mdash;&nbsp; Answer Key')
  : cfg.subheading;

const md = s => s.split(/(\$[^$]*\$)/g).map(c =>
  (c.startsWith('$') && c.endsWith('$') && c.length > 2)
    ? katex.renderToString(c.slice(1, -1), { throwOnError: true, displayMode: false, output: 'html' })
    : c.replace(/&/g, '&amp;').replace(/</g, '&lt;')
).join('');

// A lone unlabelled answer sits on the number's own line ("21.  x = 231");
// anything with part letters stacks one per line under the number.
const rows = data.map(q => {
  const lone = q.parts.length === 1 && !q.parts[0][0];
  if (!em) {
    return `<p class="ans"><b class="qn">${q.n}.</b>` +
      q.parts.map(([lab, txt]) => (lab ? `<b>${lab}</b> ` : '') + md(txt))
        .join('<span class="sep"></span>') + `</p>`;
  }
  if (lone) return `<p class="ans"><b class="qn">${q.n}.</b>${md(q.parts[0][1])}</p>`;
  return `<div class="qblock"><p class="qnum"><b>${q.n}.</b></p>` +
    q.parts.map(([lab, txt]) =>
      `<p class="part">${lab ? `<b>${lab}</b> ` : ''}${md(txt)}</p>`).join('') +
    `</div>`;
}).join('\n');

const katexCss = fs.readFileSync(path.join(REPO, 'node_modules/katex/dist/katex.min.css'), 'utf8')
  .replace(/url\(fonts\//g, `url(file://${path.join(REPO, 'node_modules/katex/dist/fonts')}/`);

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${katexCss}</style>
<style>
  @page { size: ${fmt}; margin: ${em ? '48pt 70.6pt 54pt 70.6pt' : '55pt 69.36pt 54pt 69.36pt'}; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Times New Roman", Times, serif; font-size: ${em ? '9.12' : '9.6'}pt; color: #000; }
  h1 { font-size: ${em ? '15.5pt' : '12pt'}; font-weight: bold;
       color: ${em ? '#000' : '#1F4E79'}; text-align: ${em ? 'left' : 'center'}; margin: 0; }
  h2 { font-size: ${em ? '10pt' : '10.1pt'}; font-style: italic; font-weight: normal;
       text-align: ${em ? 'left' : 'center'}; margin: ${em ? '4pt' : '14pt'} 0 0 0; }
  hr { border: none; border-top: ${em ? '1.1' : '0.72'}pt solid #000;
       margin: ${em ? '9pt 0 12pt 0' : '24pt 0 13pt 0'}; }
  p.ans { margin: 0 0 8.5pt 0; padding-left: 24pt; text-indent: -24pt; line-height: 1.62; }
  b.qn { display: inline-block; width: 24pt; text-indent: 0; }
  span.sep { display: inline-block; width: 12pt; }
  div.qblock { margin: 0 0 5pt 0; }
  p.qnum { margin: 0; line-height: 1.5; }
  p.part { margin: 0; line-height: 1.62; }   /* level with the question number */
  .katex { font-size: 1.13em; }
</style></head><body>
<h1>${heading}</h1>
${subheading ? `<h2>${subheading}</h2>` : ''}
<hr>
${rows}
</body></html>`;

const htmlPath = outPath.replace(/\.pdf$/, '.html');
fs.writeFileSync(htmlPath, html);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');   // KaTeX webfonts must land first
  await page.pdf({ path: outPath, format: fmt, printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`key -> ${outPath} (${fmt})`);
})();
