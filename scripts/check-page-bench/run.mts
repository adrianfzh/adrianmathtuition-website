// Check this page — the seeded-page bench (SPEC-STUDENT-APP.md §0c, Adrian 1 Nov 2026: "yes"
// to measuring it before trusting it). Each test page is a real bank question with student
// working written by us, some all right and some with ONE planted slip, so the right mark of
// every line is known before marking. The page is drawn the way the app draws the picture it
// sends (printed question, handwriting, a red circled number per line) and goes through the
// SAME code the app's request does (lib/app-check-page-server checkPage), three ways:
//   A  today: the main marker alone, no answer key
//   B  the main marker with the answer key
//   C  B plus the second small look ("?" where they disagree) — what students get now
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-page-bench/run.mts <pages.json> <out-dir>
// pages.json: [{ page, questionId, printed, lines: [..], slip: null | { line }, answer }]
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getBrowser, closeBrowser } from '../../src/lib/generate-pdf';
import { checkPage, findPrintedQuestions } from '../../src/lib/app-check-page-server';
import { mergeLooks, type CheckPageResult, type PageLine } from '../../src/lib/app-check-page';

interface Page { page: string; questionId: string; printed: string; lines: string[]; slip: null | { line: number }; answer: string }

const [pagesFile, outDir] = process.argv.slice(2);
const pages: Page[] = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const db = createClient(process.env.SUPABASE_URL!.trim(), (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!.trim());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
async function draw(p: Page): Promise<{ image: string; lines: PageLine[] }> {
  const browser = await getBrowser();
  const tab = await browser.newPage();
  await tab.setViewport({ width: 820, height: 1160, deviceScaleFactor: 1.5 });
  await tab.setContent(`<html><body style="margin:0;width:820px;height:1160px;background:#fff;position:relative">
    <div style="position:absolute;left:70px;top:70px;width:680px;font:17px/1.45 'Times New Roman',serif;color:#111"><b>1</b>&nbsp;&nbsp;${esc(p.printed)}</div>
    <div id="w" style="position:absolute;left:110px;font:30px 'Noteworthy',cursive;font-weight:bold;color:#1d2a6b">
      ${p.lines.map(l => `<div style="height:66px;white-space:nowrap"><span>${esc(l)}</span></div>`).join('')}
    </div></body></html>`);
  const lines: PageLine[] = await tab.evaluate(() => {
    const q = document.querySelector('div') as HTMLElement;
    const w = document.getElementById('w') as HTMLElement;
    w.style.top = `${q.getBoundingClientRect().bottom + 40}px`;
    return [...w.querySelectorAll('span')].map((s, i) => {
      const r = s.getBoundingClientRect();
      const c = document.createElement('div');
      c.textContent = String(i + 1);
      c.style.cssText = `position:absolute;left:${r.left - 21}px;top:${r.top + r.height / 2 - 8.5}px;width:17px;height:17px;border-radius:50%;background:#d91f1a;color:#fff;font:bold 11px -apple-system,sans-serif;text-align:center;line-height:17px`;
      document.body.appendChild(c);
      return { n: i + 1, box: [r.left, r.top, r.width, r.height] as [number, number, number, number] };
    });
  });
  const buf = await tab.screenshot({ type: 'jpeg', quality: 72 });
  fs.writeFileSync(path.join(outDir, `${p.page}.jpg`), buf);
  await tab.close();
  return { image: Buffer.from(buf).toString('base64'), lines };
}

/** How one way of marking did on one page, against the truth by construction. */
function score(p: Page, r: CheckPageResult) {
  const mark = (n: number) => r.lines.find(l => l.n === n)?.mark ?? 'none';
  const before = p.slip ? p.slip.line - 1 : p.lines.length;
  const falseCrosses = Array.from({ length: before }, (_, i) => i + 1).filter(n => mark(n) === 'cross').length;
  const unsure = r.lines.filter(l => l.mark === 'unsure').length;
  if (!p.slip) return { right: r.verdict === 'correct' && falseCrosses === 0, falseCrosses, unsure, slipFound: null as boolean | null };
  const slipFound = mark(p.slip.line) === 'cross';
  const flagged = slipFound || mark(p.slip.line) === 'unsure';
  return { right: slipFound && falseCrosses === 0 && r.verdict !== 'correct', falseCrosses, unsure, slipFound, flagged };
}

const rows: Record<string, unknown>[] = [];
for (const p of pages) {
  const { image, lines } = await draw(p);
  const req = { image, lines, printed: p.printed };
  const found = await findPrintedQuestions(db, p.printed);
  const [a, withKey] = await Promise.all([
    checkPage(db, req, { anthropic, useKey: false, useSecond: false }).then(x => x.main).catch(() => null),
    checkPage(db, req, { anthropic }).catch(() => null),
  ]);
  const b = withKey?.main ?? null;
  const c = withKey ? mergeLooks(withKey.main, withKey.second) : null;
  const row = {
    page: p.page, slip: p.slip?.line ?? null, keyFound: found.ids.includes(p.questionId), keyRows: found.ids.length,
    A: a && score(p, a), B: b && score(p, b), C: c && score(p, c),
    secondOnly: withKey?.second ? score(p, withKey.second) : null,
  };
  rows.push(row);
  fs.writeFileSync(path.join(outDir, `${p.page}.json`), JSON.stringify({ page: p, A: a, withKey }, null, 1));
  console.log(p.page, JSON.stringify(row));
}
await closeBrowser();

const sum = (k: 'A' | 'B' | 'C' | 'secondOnly') => {
  const got = rows.map(r => r[k] as ReturnType<typeof score> | null);
  const ok = got.filter(Boolean) as ReturnType<typeof score>[];
  const slipPages = rows.map((r, i) => [r, got[i]] as const).filter(([r, g]) => r.slip && g);
  const cleanPages = rows.map((r, i) => [r, got[i]] as const).filter(([r, g]) => !r.slip && g);
  return {
    pagesRight: `${ok.filter(x => x.right).length}/${rows.length}`,
    slipsFound: `${slipPages.filter(([, g]) => g!.slipFound).length}/${slipPages.length}`,
    correctPagesLeftAlone: `${cleanPages.filter(([, g]) => g!.right).length}/${cleanPages.length}`,
    wrongCrosses: ok.reduce((n, x) => n + x.falseCrosses, 0),
    questionMarks: ok.reduce((n, x) => n + x.unsure, 0),
    failed: rows.length - ok.length,
  };
};
const summary = { A_today: sum('A'), B_withKey: sum('B'), C_withKeyAndSecondLook: sum('C'), smallMarkerAlone: sum('secondOnly'),
  keyFound: `${rows.filter(r => r.keyFound).length}/${rows.length}` };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
