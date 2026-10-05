// Builds our own printable PDFs of the A-Level formula lists from the SAME data the
// /formulas/mf27 and /formulas/mf26 pages render (src/lib/mf-lists.ts):
//   public/formulas/mf27.pdf   (the bot and the chat menu link this file)
//   public/formulas/mf26.pdf
// Run after editing mf-lists.ts:  npx tsx scripts/formulas/build-mf-pdf.ts
import fs from 'fs';
import path from 'path';
import katex from 'katex';
import { katexInlineHead } from '../../src/lib/katex-inline';
import { closeBrowser, getBrowser } from '../../src/lib/generate-pdf';
import { MF26, MF27, notOnEitherList, type MfItem, type MfList, type MfSection, type MfTable } from '../../src/lib/mf-lists';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tex = (s: string, display = true) => katex.renderToString(s, { displayMode: display, throwOnError: true });
const cell = (v: string, tag: 'td' | 'th') => `<${tag}>${v.startsWith('$') ? tex(v.slice(1), false) : esc(v)}</${tag}>`;

function item(it: MfItem): string {
  return `<div class="f">${it.label ? `<div class="lab">${esc(it.label)}</div>` : ''}<div class="eq">${tex(it.tex)}</div>${
    it.cond ? `<div class="cond">valid for ${tex(it.cond, false)}</div>` : ''
  }</div>`;
}

function table(t: MfTable, caption?: string): string {
  return `${caption ? `<div class="cap">${esc(caption)}</div>` : ''}<table class="${t.dense ? 'dense' : ''}"><thead><tr>${t.head
    .map(h => cell(h, 'th'))
    .join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(c => cell(c, 'td')).join('')}</tr>`).join('')}</tbody></table>`;
}

function section(s: MfSection, code: string): string {
  const chunks = s.blocks.flatMap(b =>
    b.kind === 'formulas' ? b.items.map(item) : b.kind === 'table' ? [table(b.table, b.caption)] : [b.text.split('\n').map(l => `<p class="txt">${esc(l)}</p>`).join('')],
  );
  const mem = s.memorise?.length
    ? `<div class="mem"><div class="memh">Not on ${code} — memorise</div>${s.memorise.map(item).join('')}</div>`
    : '';
  // The heading travels with its first formula: a title alone at a page foot is no use.
  const head = `<div class="sh"><h2>${esc(s.title)}</h2><span class="tag">${esc(s.audience)}</span></div><p class="use">${esc(s.use)}</p>${
    s.change ? `<p class="chg">${esc(s.change)}</p>` : ''
  }`;
  return `<section><div class="keep">${head}${chunks[0] ?? ''}</div>${chunks.slice(1).join('')}${mem}</section>`;
}

function html(list: MfList): string {
  const sections = list.code === 'MF27' ? [...list.sections, notOnEitherList] : list.sections;
  return `<!doctype html><html><head><meta charset="utf-8">${katexInlineHead()}<style>
  @page { size: A4; margin: 16mm 15mm 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a2440; font-size: 10.5pt; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 2mm; color: #142a5c; }
  .sub { color: #555; font-size: 10pt; margin: 0 0 1mm; }
  .rule { border: 0; border-top: 2.5px solid #f0c22e; margin: 3mm 0 5mm; }
  section { margin: 0 0 6mm; }
  .keep { break-inside: avoid; }
  .sh { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1.5px solid #f0c22e; padding-bottom: 1mm; margin-bottom: 1.5mm; break-after: avoid; }
  h2 { font-size: 13.5pt; margin: 0; color: #142a5c; }
  .tag { font-family: Arial, sans-serif; font-size: 7.5pt; font-weight: bold; color: #142a5c; border: 1px solid #b9c4dd; border-radius: 10px; padding: 0.4mm 2.2mm; }
  .use { font-family: Arial, sans-serif; font-size: 8.8pt; color: #666; margin: 0 0 1.5mm; }
  .chg { font-family: Arial, sans-serif; font-size: 8.8pt; color: #a07a10; font-weight: bold; margin: 0 0 1.5mm; }
  .txt { font-family: Arial, sans-serif; font-size: 9pt; margin: 0.6mm 0; }
  .f { break-inside: avoid; padding: 0.6mm 0; }
  .lab { font-family: Arial, sans-serif; font-size: 8.5pt; color: #666; }
  .eq .katex-display { margin: 0.8mm 0; }
  .eq .katex { font-size: 1.08em; }
  .cond { font-family: Arial, sans-serif; font-size: 8pt; color: #777; text-align: center; margin-top: -0.6mm; }
  .cap { font-family: Arial, sans-serif; font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: #777; margin: 2mm 0 1mm; }
  table { border-collapse: collapse; margin: 1mm auto 2mm; break-inside: avoid; }
  th, td { border: 1px solid #c9cfdc; padding: 1.4mm 3mm; text-align: center; font-size: 9.5pt; }
  th { background: #eef2fa; font-family: Arial, sans-serif; font-size: 8.5pt; }
  table.dense th, table.dense td { padding: 0.6mm 2.2mm; font-size: 8pt; }
  .mem { break-inside: avoid; border: 1.3px solid #f0c22e; background: #fdf6dc; border-radius: 2mm; padding: 1.5mm 3mm; margin-top: 2mm; }
  .memh { font-family: Arial, sans-serif; font-size: 7.8pt; font-weight: bold; letter-spacing: 0.06em; text-transform: uppercase; color: #a07a10; }
  .note { font-family: Arial, sans-serif; font-size: 8pt; color: #777; margin-top: 4mm; }
  </style></head><body>
  <h1>${list.code} Formula List</h1>
  <p class="sub">${esc(list.name)} · Singapore-Cambridge A-Level · used ${esc(list.years)}</p>
  <p class="sub">${esc(list.syllabuses)}</p>
  <hr class="rule">
  ${sections.map(s => section(s, list.code)).join('')}
  <p class="note">Typeset by Adrian's Math Tuition from the list SEAB publishes. The yellow boxes are formulas the list does NOT give. In the exam, the official booklet is the one handed out. Online: adrianmathtuition.com/formulas/${list.code.toLowerCase()}</p>
  </body></html>`;
}

async function main() {
  const browser = await getBrowser();
  try {
    for (const list of [MF27, MF26]) {
      const page = await browser.newPage();
      await page.setContent(html(list), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const out = path.join(process.cwd(), 'public', 'formulas', `${list.code.toLowerCase()}.pdf`);
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:7.5px;color:#888;padding:0 15mm;display:flex;justify-content:space-between"><span>${list.code} formula list · adrianmathtuition.com/formulas/${list.code.toLowerCase()}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
      });
      fs.writeFileSync(out, pdf);
      console.log(`${out}  ${(pdf.length / 1024).toFixed(0)} KB`);
      await page.close();
    }
  } finally {
    await closeBrowser();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
