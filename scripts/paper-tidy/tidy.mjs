#!/usr/bin/env node
// Paper tidy-up: take a school paper PDF, remove the header, footer and every
// trace of the source, and put an answer page after each paper.
// Adrian, 3 Oct 2026: "make it a script so any model can run it". README.md beside
// this file is the runbook; docs/FANOUT.md §9 says it runs on Haiku, low effort.
//
//   node scripts/paper-tidy/tidy.mjs answers --school "Nan Hua" --year 2025 --level AM --out key.json
//   node scripts/paper-tidy/tidy.mjs build --src in.pdf --answers key.json \
//        --title "Sec 4 A Math Prelims Practice Set 5" --ban "Nan Hua,Kiasu" --out out.pdf
//
// Every page becomes a picture, so text hidden under white boxes (school name,
// site footer, worked solutions) is really gone, not just covered.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const katex = require('katex');
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DPI = 220;
const BAND = 0.09;           // top and bottom 9% of a page = header / footer zone
const REPEAT = 0.3;          // a band line on ≥30% of pages is a header or footer
const INK = 245;             // a pixel darker than this is ink

function args() {
  const a = process.argv.slice(2), o = { _: a[0] };
  for (let i = 1; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1]?.startsWith('--') || a[i + 1] === undefined ? true : a[++i];
  return o;
}
const die = (m) => { console.error('✗ ' + m); process.exit(1); };

// ── answers: the bank's key → an editable JSON the model tidies ─────────────
async function answers(o) {
  if (!o.school || !o.year || !o.level || !o.out) die('answers needs --school --year --level --out');
  const env = require('dotenv').parse(fs.readFileSync(path.join(ROOT, '.env.local')));
  const v = (k) => (env[k] || '').trim().replace(/^"|"$/g, '');
  const url = v('SUPABASE_URL'), key = v('SUPABASE_SECRET_KEY') || v('SUPABASE_SERVICE_ROLE_KEY');
  const q = new URLSearchParams({
    school: `ilike.*${o.school.trim().replace(/\s+/g, '*')}*`, year: `eq.${o.year}`, level: `eq.${o.level}`,
    deleted_at: 'is.null', select: 'paper,question_number,answer,parts,exam_type,school', order: 'paper,question_number',
  });
  if (o.exam) q.set('exam_type', `eq.${o.exam}`);
  const r = await fetch(`${url}/rest/v1/questions?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) die('no bank rows for that paper: ' + JSON.stringify(rows).slice(0, 200));
  const schools = [...new Set(rows.map((x) => x.school))];
  const out = {};
  const flat = (qn, parts, pre = '') => (parts || []).flatMap((p) => {
    const lab = pre + (p.label ? `(${p.label})` : '');
    const kids = flat(qn, p.parts, lab);
    return kids.length ? kids : [[qn + lab, p.answer || 'TODO']];
  });
  for (const x of rows.sort((a, b) => (a.paper || '').localeCompare(b.paper || '') || parseFloat(a.question_number) - parseFloat(b.question_number))) {
    const paper = 'Paper ' + (x.paper || '1');
    const lines = x.parts?.length ? flat(x.question_number, x.parts) : [[x.question_number, x.answer || 'TODO']];
    (out[paper] ||= []).push(...lines);
  }
  fs.writeFileSync(o.out, '{\n' + Object.entries(out).map(([k, l]) => ` ${JSON.stringify(k)}: [\n` + l.map((x) => '  ' + JSON.stringify(x)).join(',\n') + '\n ]').join(',\n') + '\n}\n');   // one line per answer, easy to edit
  const all = Object.values(out).flat();
  console.log(`✓ ${o.out}: ${Object.entries(out).map(([k, l]) => `${k} ${l.length} lines`).join(', ')} (school matched: ${schools.join(' | ')})`);
  const todo = all.filter(([, t]) => t === 'TODO').map(([q]) => q);
  const long = all.filter(([, t]) => t.length > 140).map(([q]) => q);
  if (todo.length) console.log('  ⚠ no answer in the bank for: ' + todo.join(', ') + ' — fill these in (or "Shown" for a proof)');
  if (long.length) console.log('  ⚠ long answers (cut to the final answer only): ' + long.join(', '));
  console.log('  Next: read the JSON, keep only final answers ($…$ = maths), then run build.');
}

// ── build helpers ───────────────────────────────────────────────────────────
function words(src) {   // [{page, x0,y0,x1,y1, t}] in PDF points, plus page sizes
  const html = execFileSync('pdftotext', ['-bbox', src, '-'], { maxBuffer: 1 << 28 }).toString();
  const pages = [];
  for (const pm of html.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const w = [];
    for (const m of pm[3].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g))
      w.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5].replace(/&amp;/g, '&') });
    pages.push({ W: +pm[1], H: +pm[2], words: w });
  }
  return pages;
}
function lines(ws) {    // group words into lines by their top edge
  const L = [];
  for (const w of [...ws].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const l = L.find((l) => Math.abs(l.y0 - w.y0) < 3);
    if (l) { l.words.push(w); l.y1 = Math.max(l.y1, w.y1); } else L.push({ y0: w.y0, y1: w.y1, words: [w] });
  }
  for (const l of L) l.text = l.words.sort((a, b) => a.x0 - b.x0).map((w) => w.t).join(' ');
  return L;
}
const norm = (s) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

async function inkFrac(png, s, w) {  // share of a word's box that is ink
  const x = Math.max(0, Math.floor(w.x0 * s)), y = Math.max(0, Math.floor(w.y0 * s));
  const wd = Math.max(1, Math.ceil((w.x1 - w.x0) * s)), ht = Math.max(1, Math.ceil((w.y1 - w.y0) * s));
  const { data } = await sharp(png).extract({ left: x, top: y, width: wd, height: ht }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let ink = 0; for (const p of data) if (p < INK) ink++;
  return ink / data.length;
}

async function keyPage(title, paper, lines, tmp) {  // one answer page per paper, shrinking to fit
  const m = (s) => s.replace(/\$([^$]+)\$/g, (_, t) => katex.renderToString(t, { throwOnError: false }));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const kd = path.join(ROOT, 'node_modules/katex/dist');
  const css = fs.readFileSync(path.join(kd, 'katex.min.css'), 'utf8').replace(/url\(fonts\//g, `url(file://${kd}/fonts/`);
  const rows = lines.map(([q, t]) => `<tr><td class=q>${esc(q)}</td><td>${m(esc(t))}</td></tr>`).join('');
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    for (const pt of [11, 10.5, 10, 9.5, 9]) {
      const html = `<html><head><meta charset=utf8><style>${css}
@page{size:A4;margin:13mm 30mm}body{font-family:"Times New Roman",Times,serif;font-size:${pt}pt;color:#000}
h1{text-align:center;font-size:17pt;margin:0}h2{text-align:center;font-size:15pt;margin:2pt 0 12pt}
table{border-collapse:collapse;width:100%}td{padding:1.4pt 0;vertical-align:middle;line-height:1.3}
td.q{font-weight:bold;width:22mm;vertical-align:top;padding-top:4pt}tr{break-inside:avoid}
</style></head><body><h1>${esc(title)}</h1><h2>${esc(paper)} Answers</h2><table>${rows}</table></body></html>`;
      const f = path.join(tmp, `key-${paper.replace(/\W/g, '')}.html`);
      fs.writeFileSync(f, html);
      const p = await b.newPage();
      await p.goto('file://' + f, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      const pdf = await p.pdf({ format: 'A4', preferCSSPageSize: true });
      await p.close();
      const n = (await PDFDocument.load(pdf)).getPageCount();
      if (n === 1 || pt === 9) return { pdf, pages: n, pt };
    }
  } finally { await b.close(); }
}

// ── build: picture pages, white out header/footer/source, add answer pages ──
async function build(o) {
  for (const k of ['src', 'answers', 'title', 'out']) if (!o[k]) die(`build needs --${k}`);
  const key = JSON.parse(fs.readFileSync(o.answers, 'utf8'));
  const papers = Object.keys(key);
  const ban = String(o.ban || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const banRe = [...ban.map((b) => new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i')), /www\.|\.com\b|\.sg\b/i];
  const leftTodo = Object.values(key).flat().filter(([, t]) => /TODO/.test(t));
  if (leftTodo.length) die('answers still has TODO: ' + leftTodo.map(([q]) => q).join(', '));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tidy-'));
  const pages = words(o.src);
  const N = pages.length;
  console.log(`· ${N} pages; rendering at ${DPI} dpi…`);
  execFileSync('pdftoppm', ['-r', String(DPI), '-png', o.src, path.join(tmp, 'r')]);
  const pngAt = (i) => [1, 2, 3, 4].map((d) => path.join(tmp, `r-${String(i + 1).padStart(d, '0')}.png`)).find(fs.existsSync);

  // header / footer = band lines repeated across pages, or page numbers
  const count = new Map();
  const L = pages.map((p) => lines(p.words));
  L.forEach((ls, i) => new Set(ls.filter((l) => l.y0 < pages[i].H * BAND || l.y1 > pages[i].H * (1 - BAND)).map((l) => norm(l.text))).forEach((t) => count.set(t, (count.get(t) || 0) + 1)));

  // where Paper 2 starts: --split = last page of Paper 1, else the first page after 1 saying "Paper 2"
  let splits = [];
  if (papers.length > 1) {
    if (o.split) splits = String(o.split).split(',').map(Number);
    else {
      for (let n = 2; n <= papers.length; n++) {
        const i = L.findIndex((ls, j) => j > (splits.at(-1) ?? 0) && ls.some((l) => new RegExp(`paper\\s*${n}\\b`, 'i').test(l.text)));
        if (i < 0) die(`could not find where Paper ${n} starts — pass --split <last page of Paper ${n - 1}>`);
        splits.push(i);   // index of Paper n's first page = page number of Paper n-1's last
      }
    }
  }

  const removed = [], strays = [];
  const out = await PDFDocument.create();
  out.setTitle(o.title); out.setAuthor('AdrianMath'); out.setCreator('AdrianMath'); out.setProducer('AdrianMath'); out.setSubject(''); out.setKeywords([]);
  const addKey = async (pi) => {
    const k = await keyPage(o.title, papers[pi], key[papers[pi]], tmp);
    if (k.pages > 1) console.log(`  ⚠ ${papers[pi]} answers run to ${k.pages} pages even at 9 pt — shorten some answers`);
    const kd = await PDFDocument.load(k.pdf);
    (await out.copyPages(kd, kd.getPageIndices())).forEach((p) => out.addPage(p));
    console.log(`· ${papers[pi]} answers: ${k.pages} page at ${k.pt} pt, after page ${out.getPageCount() - k.pages}`);
  };
  let pi = 0;
  for (let i = 0; i < N; i++) {
    const { W, H } = pages[i], f = pngAt(i), s = DPI / 72;
    const boxes = [];
    for (const l of L[i]) {
      const band = l.y0 < H * BAND || l.y1 > H * (1 - BAND);
      const t = norm(l.text);
      const hit = banRe.some((r) => r.test(l.text)) ||
        (band && ((count.get(t) || 0) >= Math.max(2, N * REPEAT) || /^(page )?#( of #)?$|^- ?# ?-$|^\[?turn over\]?$/.test(t)));
      if (hit) { boxes.push(l); removed.push(`p${i + 1}: ${l.text.slice(0, 70)}`); continue; }
      // a line mostly hidden under white boxes is covered working; its visible bits are strays
      const fr = await Promise.all(l.words.map((w) => inkFrac(f, s, w)));
      const hidden = fr.filter((x) => x < 0.004).length;
      if (l.words.length >= 2 && hidden / l.words.length >= 0.5) l.words.forEach((w, j) => { if (fr[j] >= 0.004) { boxes.push(w); strays.push(`p${i + 1}: "${w.t}"`); } });
    }
    // --white "35:517,533,556,543;…" = extra boxes in PDF points (page = source page) for marks that are not text
    for (const spec of String(o.white || '').split(';').filter(Boolean)) {
      const [pg, b] = spec.split(':'); const [x0, y0, x1, y1] = b.split(',').map(Number);
      if (+pg === i + 1) boxes.push({ x0, y0, x1, y1 });
    }
    const img = sharp(f);
    const { width, height } = await img.metadata();
    const rects = boxes.map((b) => {
      const x = Math.max(0, Math.floor((('x0' in b ? b.x0 : Math.min(...b.words.map((w) => w.x0))) - 3) * s));
      const x1 = Math.min(width, Math.ceil((('x1' in b ? b.x1 : Math.max(...b.words.map((w) => w.x1))) + 3) * s));
      const y = Math.max(0, Math.floor((b.y0 - 2) * s)), y1 = Math.min(height, Math.ceil((b.y1 + 2) * s));
      return { input: { create: { width: Math.max(1, x1 - x), height: Math.max(1, y1 - y), channels: 3, background: '#fff' } }, left: x, top: y };
    });
    const buf = await sharp(f).flatten({ background: '#fff' }).composite(rects).png({ palette: true, colors: 32, dither: 0 }).toBuffer();
    const page = out.addPage([W, H]);
    page.drawImage(await out.embedPng(buf), { x: 0, y: 0, width: W, height: H });
    if (pi < splits.length && i === splits[pi] - 1) await addKey(pi++);
  }
  while (pi < papers.length) await addKey(pi++);
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  fs.writeFileSync(o.out, await out.save());

  // checks
  const txt = execFileSync('pdftotext', [o.out, '-']).toString();
  const meta = execFileSync('pdfinfo', [o.out]).toString();
  const leaks = banRe.filter((r) => r.test(txt) || r.test(meta)).map(String);
  const prev = o.out.replace(/\.pdf$/i, '') + '.preview';
  fs.mkdirSync(prev, { recursive: true });
  execFileSync('pdftoppm', ['-r', '60', '-png', o.out, path.join(prev, 'p')]);
  const mb = (fs.statSync(o.out).size / 1e6).toFixed(1);
  console.log(`\n✓ ${o.out}: ${out.getPageCount()} pages, ${mb} MB`);
  console.log(`  removed ${removed.length} header/footer/source lines` + (removed.length ? ':\n    ' + [...new Map(removed.map((r) => r.replace(/^p\d+: /, '')).map((t) => [norm(t), t])).values()].slice(0, 12).join('\n    ') : ''));
  if (strays.length) console.log(`  whited out ${strays.length} stray bits of covered working: ${strays.slice(0, 15).join(', ')}`);
  console.log(leaks.length ? `  ✗ SOURCE STILL IN THE FILE: ${leaks.join(', ')}` : '  ✓ no source name or web address left in the text or the file info');
  console.log(`  LOOK at the previews before sending: ${prev}/ — the answer pages, page 1, and two question pages`);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (leaks.length) process.exit(2);
}

const o = args();
if (o._ === 'answers') await answers(o);
else if (o._ === 'build') await build(o);
else die('usage: tidy.mjs answers|build … (see scripts/paper-tidy/README.md)');
