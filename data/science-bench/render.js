// data/science-bench/render.js — seeded bench script → page PNGs (SPEC-SCIENCE-BENCH §1 Step 3).
// Usage: node data/science-bench/render.js <paper dir> <seed dir name>
// One page per question: the printed question in a print face, the student's answer in a
// handwriting face with a slight tilt, name line "BENCH SCRIPT" (never a real name). Clean
// pages on purpose — this is not a vision bench.
const fs = require('fs'), path = require('path');
const sharp = require('/Users/adrianfong/dev/adrianmathtuition-website/node_modules/sharp');
const [paperDir, seedName] = process.argv.slice(2);
const paper = JSON.parse(fs.readFileSync(path.join(paperDir, 'paper.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(paperDir, seedName, 'plan.json'), 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SUB = '₀₁₂₃₄₅₆₇₈₉', SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '+': '⁺', '-': '⁻' };
const plain = s => String(s)
  .replace(/\*\*/g, '').replace(/\$\$?/g, '')
  .replace(/\\\\/g, '\\')
  .replace(/\\rightleftharpoons/g, '⇌').replace(/\\(rightarrow|to)\b/g, '→').replace(/\\Delta\s*/g, 'Δ')
  .replace(/\^\{([^}]*)\}/g, (m, x) => [...x].map(c => SUP[c] || c).join('')).replace(/\^([0-9+-])/g, (m, c) => SUP[c] || c)
  .replace(/_\{([^}]*)\}/g, (m, x) => [...x].map(c => /\d/.test(c) ? SUB[c] : c).join('')).replace(/_(\d)/g, (m, d) => SUB[d])
  .replace(/\\times/g, '×').replace(/\\text\{([^}]*)\}/g, '$1').replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '');
const wrap = (t, w) => { const out = []; for (const para of String(t).split('\n')) { let l = ''; for (const x of para.split(/\s+/)) { if ((l + ' ' + x).trim().length > w) { out.push(l.trim()); l = x; } else l = l + ' ' + x; } out.push(l.trim()); } return out; };
async function page(q, parts, n, of) {
  let y = 60; const L = [];
  const add = (t, cls, size, x, w) => { for (const ln of wrap(t, w)) { if (ln) L.push(`<text x="${x}" y="${y}" class="${cls}">${esc(ln)}</text>`); y += size; } };
  L.push(`<text x="70" y="${y}" class="hand">Name: BENCH SCRIPT      Class: 4X      Index no: 00</text>`); y += 56;
  add(q.question, 'qn', 34, 70, 90); y += 4;
  if (q.stem) { add(plain(q.stem), 'print', 27, 70, 92); y += 14; }
  for (const p of q.parts) {
    if (p.header) { if (p.text) { add(`${p.label} ${plain(p.text)}`, 'print', 27, 70, 92); y += 8; } continue; }
    const mine = parts.find(x => x.label === p.label);
    if (p.text) add(`${p.label} ${plain(p.text)}`, 'print', 27, 70, 92);
    L.push(`<text x="1150" y="${y - 27}" class="print">[${p.max}]</text>`); y += 12;
    const a = mine.answer; const top = y;
    if (a) { L.push(`<g transform="rotate(-0.8 110 ${y})">`); add(a, 'hand', 36, 110, 58); L.push('</g>'); }
    y = Math.max(y, top + 90) + 26;   // an answer space even when blank
  }
  L.push(`<text x="580" y="${y + 30}" class="print">Page ${n} of ${of}</text>`);
  const H = Math.max(1754, y + 70);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="${H}"><rect width="100%" height="100%" fill="#fcfcfa"/><style>.print{font:22px "Times New Roman",serif;fill:#111}.qn{font:bold 28px "Times New Roman",serif;fill:#111}.hand{font:30px "Bradley Hand","Noteworthy","Comic Sans MS",cursive;fill:#1d2a7a}</style>${L.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
(async () => {
  const out = path.join(paperDir, seedName, 'pages'); fs.mkdirSync(out, { recursive: true });
  const qs = paper.questions;
  for (let i = 0; i < qs.length; i++) {
    const parts = plan.parts.filter(p => p.question === qs[i].question);
    fs.writeFileSync(path.join(out, `page-${i + 1}.png`), await page(qs[i], parts, i + 1, qs.length));
  }
  console.log(`${seedName}: ${qs.length} pages → ${out}`);
})();
