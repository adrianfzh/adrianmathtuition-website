#!/usr/bin/env node
// Clip pipeline — does every board of a question clip fit on a phone screen? Run on the PLAN,
// before any narration or voice is paid for (SPEC-CLIP-PIPELINE.md §9; Adrian's rule: the
// whole board on one phone screen — look.mjs checks the same thing again on the finished clip).
//
//   node scripts/clips/fit.mjs <slug> --path '/app/clip/q/<id>?check=1' [--base http://localhost:3211]
//
// The caller has stored a stand-in script (one silent beat per board line) in question_clips;
// this opens the page at the first stop of each board (`&at=N`) at 390 × 844 and measures the
// board's bottom against the top of the bottom bar, as look.mjs does. The board's height is
// laid out for all its lines from the first stop. Writes data/clip-runs/<slug>/fit.json
// { pass, boards: [{ board, bottom, fold, over }] }. Exit 1 = a board is too tall.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, parseArgs } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const slug = args._[0];
const BASE = String(args.base || 'http://localhost:3211').replace(/\/$/, '');
if (!slug || !args.path) { console.error('usage: node scripts/clips/fit.mjs <slug> --path <page path> [--base URL]'); process.exit(2); }

function env() {
  const out = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n$/, '').trim();
  }
  return { ...out, ...process.env };
}
const e = env();
const secret = e.ADMIN_SESSION_SECRET || e.SIGNUP_SECRET;
const expires = Date.now() + 3600_000;
const token = `${expires}.${crypto.createHmac('sha256', secret).update(`admin.${expires}`).digest('base64url')}`;

const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/clip-plans', `${slug}.json`), 'utf8'));
const nBoards = Math.max(1, plan.boards?.length ?? 1);
// One stand-in beat per line, so board k's LAST stop = every line of boards ≤ k, minus one: the
// board at its fullest (every line and its rule note shown). The stand-in beats are long (≈ 8 s
// on the auto timer) so the board is measured before it moves on.
const lastStop = [];
for (let k = 0, n = 0; k < nBoards; k++) { n += plan.lines.filter(l => (l.board ?? 0) === k).length; lastStop.push(n - 1); }

const puppeteer = await import('puppeteer-core');
const browser = await puppeteer.default.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--mute-audio'] });
const boards = [];
for (let k = 0; k < nBoards; k++) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setCookie({ name: 'admin_session', value: token, url: BASE });
  const sep = String(args.path).includes('?') ? '&' : '?';
  await page.goto(`${BASE}${args.path}${sep}at=${lastStop[k]}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await new Promise(r => setTimeout(r, 2000));
  const m = await page.evaluate(() => {
    const stage = document.querySelector('.lsn-stage');
    if (!stage) return null;
    let fold = window.innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top > window.innerHeight * 0.6 && r.top < fold) fold = r.top;
    }
    const r = stage.getBoundingClientRect();
    const cut = [];
    for (const el of stage.querySelectorAll('.lsn-el.on')) {
      const e = el.getBoundingClientRect();
      if (e.width && (e.left < r.left - 1 || e.right > r.right + 1)) cut.push((el.textContent || '').trim().slice(0, 30));
    }
    return { bottom: Math.round(r.bottom + window.scrollY), fold: Math.round(fold), cut };
  });
  await page.close();
  // 16 px spare: the finished clip's own notes and marks wrap a little differently from the stand-in's.
  boards.push(m ? { board: k, ...m, over: Math.max(0, m.bottom - (m.fold - 16)) + (m.cut.length ? 1 : 0) } : { board: k, error: 'no board on the page', over: 999 });
}
await browser.close();
const pass = boards.every(b => b.over === 0);
fs.mkdirSync(path.join(ROOT, 'data/clip-runs', slug), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/clip-runs', slug, 'fit.json'), JSON.stringify({ slug, pass, boards }, null, 1) + '\n');
console.log(`${pass ? '✓' : '✗'} ${slug}: ${boards.map(b => b.error ? `board ${b.board + 1}: ${b.error}` : `board ${b.board + 1} ${b.bottom}/${b.fold} px${b.cut?.length ? ` · cut off at the side: ${b.cut.join(', ')}` : ''}`).join(' · ')}`);
process.exit(pass ? 0 : 1);
