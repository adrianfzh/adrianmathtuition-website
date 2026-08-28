#!/usr/bin/env node
// Render an answer-key page in the house style of "2026 JC Promo Practice Set 1".
//
//   node build_key.js answers.json /tmp/key4.pdf A4      (or Letter)
//
// answers.json: [{ "n": "1", "parts": [["(a)", "text with $latex$"], ...] }, ...]
// An empty label ("") prints the answer with no part letter.
const fs = require('fs');
const path = require('path');

const REPO = '/Users/adrianfong/Desktop/adrianmathtuition-website';
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

const data = JSON.parse(fs.readFileSync(ansPath, 'utf8'));

const md = s => s.split(/(\$[^$]*\$)/g).map(c =>
  (c.startsWith('$') && c.endsWith('$') && c.length > 2)
    ? katex.renderToString(c.slice(1, -1), { throwOnError: true, displayMode: false, output: 'html' })
    : c.replace(/&/g, '&amp;').replace(/</g, '&lt;')
).join('');

const rows = data.map(q =>
  `<p class="ans"><b class="qn">${q.n}.</b>` +
  q.parts.map(([lab, txt]) => (lab ? `<b>${lab}</b> ` : '') + md(txt)).join('<span class="sep"></span>') +
  `</p>`).join('\n');

const katexCss = fs.readFileSync(path.join(REPO, 'node_modules/katex/dist/katex.min.css'), 'utf8')
  .replace(/url\(fonts\//g, `url(file://${path.join(REPO, 'node_modules/katex/dist/fonts')}/`);

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${katexCss}</style>
<style>
  @page { size: ${fmt}; margin: 55pt 69.36pt 54pt 69.36pt; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Times New Roman", Times, serif; font-size: 9.6pt; color: #000; }
  h1 { font-size: 12pt; font-weight: bold; color: #1F4E79; text-align: center; margin: 0; }
  h2 { font-size: 10.1pt; font-style: italic; font-weight: normal; text-align: center; margin: 14pt 0 0 0; }
  hr { border: none; border-top: 0.72pt solid #000; margin: 24pt 0 13pt 0; }
  p.ans { margin: 0 0 8.5pt 0; padding-left: 24pt; text-indent: -24pt; line-height: 1.62; }
  b.qn { display: inline-block; width: 24pt; text-indent: 0; }
  span.sep { display: inline-block; width: 12pt; }
  .katex { font-size: 1.13em; }
</style></head><body>
<h1>H2 Mathematics</h1>
<h2>Promotional Examination &nbsp;&mdash;&nbsp; Answer Key</h2>
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
