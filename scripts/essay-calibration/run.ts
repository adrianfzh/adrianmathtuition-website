#!/usr/bin/env node
// The essay calibration harness (SPEC-ESSAY-MARKING.md §Calibration, 12 Sep 2026).
//
//   npx tsx scripts/essay-calibration/run.ts <set-dir> [--base https://www.adrianmathtuition.com] [--reads 2] [--report-only]
//
// <set-dir> holds set.json and the essays as .txt files:
//   {
//     "name": "sec4-2026-t3-class-a",          // the calibration set — one teacher, one prompt
//     "kind": "continuous_writing",
//     "question": "Write about a time when you were wrong about someone.",
//     "level": "Sec 4",
//     "essays": [
//       { "file": "e01.txt", "label": "A", "teacher_mark": { "total": 21, "content": 7, "language": 14 } },
//       { "file": "e02.txt", "label": "B", "anchor": { "content": 4, "language": 4 } }
//     ]
//   }
// Every essay is handed in `--reads` times (default 2) through POST /api/admin/essays
// (each hand-in is itself two or three model reads), the rows are polled until
// marked, and the three tests run: consistency (the same essay's bands across
// hand-ins), ranking (teacher_mark.total vs the app's range midpoint, needs ≥ 8),
// anchor fit (anchor bands vs the app's). The verdict is printed and written to
// <set-dir>/results.json. --report-only recomputes from the ids in results.json.
//
// Auth: ADMIN_PASSWORD from .env.local (Bearer). Cost: about 35 cents per hand-in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consistency, ranking, anchorFit, midpoint } from '../../src/lib/essay-calibration';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function env(name: string): string {
  if (process.env[name]) return process.env[name];
  const f = path.join(root, '.env.local');
  if (!fs.existsSync(f)) return '';
  const m = fs.readFileSync(f, 'utf8').split('\n').find(l => l.startsWith(name + '='));
  return m ? m.slice(name.length + 1).trim().replace(/^"|"$/g, '') : '';
}

const args = process.argv.slice(2);
const setDirArg = args.find(a => !a.startsWith('--'));
if (!setDirArg) { console.error('usage: npx tsx scripts/essay-calibration/run.ts <set-dir> [--base URL] [--reads N] [--report-only]'); process.exit(2); }
const setDir: string = setDirArg;
const opt = (k: string, d: string): string => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const base = opt('--base', 'https://www.adrianmathtuition.com').replace(/\/$/, '');
const reads = Number(opt('--reads', '2')) || 2;
const reportOnly = args.includes('--report-only');
const pw = env('ADMIN_PASSWORD');
if (!pw) { console.error('ADMIN_PASSWORD missing'); process.exit(2); }
const H = { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' };

const set = JSON.parse(fs.readFileSync(path.join(setDir, 'set.json'), 'utf8'));
const resultsPath = path.join(setDir, 'results.json');
const results: { set: string; handins: HandIn[]; verdict?: unknown } = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : { set: set.name, handins: [] };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type EssaySpec = { file: string; label?: string; teacher_mark?: Record<string, number> | null; anchor?: Record<string, number> | null };
type HandIn = { file: string; label: string; pass: number; id: string; status?: string; bands?: any; held_reason?: string | null; code_counts?: Record<string, number> | null };
async function handIn(essay: EssaySpec, pass: number): Promise<string> {
  const text = fs.readFileSync(path.join(setDir, essay.file), 'utf8');
  const r = await fetch(`${base}/api/admin/essays`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ kind: set.kind, question: set.question, level: set.level, text, calibrationSet: set.name, label: `${essay.label || essay.file} #${pass}`, teacherMark: essay.teacher_mark || null }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${essay.file}: ${r.status} ${j.error || ''}`);
  return j.id;
}

async function fetchRow(id: string): Promise<any> {
  const r = await fetch(`${base}/api/admin/essays?id=${id}`, { headers: H });
  const j = await r.json().catch(() => ({}));
  return j.essay || null;
}

if (!reportOnly) {
  for (const essay of set.essays as EssaySpec[]) {
    for (let pass = 1; pass <= reads; pass++) {
      const already = results.handins.find(h => h.file === essay.file && h.pass === pass);
      if (already) continue;
      const id = await handIn(essay, pass);
      results.handins.push({ file: essay.file, label: essay.label || essay.file, pass, id });
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 1));
      console.log(`handed in ${essay.file} #${pass} → ${id}`);
      await sleep(1500);
    }
  }
  // Wait for the marker.
  const pending = () => results.handins.filter(h => !h.status || h.status === 'queued' || h.status === 'marking');
  for (let i = 0; i < 120 && pending().length; i++) {
    await sleep(10000);
    for (const h of pending()) {
      const row = await fetchRow(h.id);
      if (!row) continue;
      h.status = row.status; h.bands = row.bands; h.held_reason = row.held_reason; h.code_counts = row.code_counts;
    }
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 1));
    process.stdout.write(`\r${results.handins.length - pending().length}/${results.handins.length} marked`);
  }
  console.log('');
} else {
  for (const h of results.handins) {
    const row = await fetchRow(h.id);
    if (row) { h.status = row.status; h.bands = row.bands; h.held_reason = row.held_reason; h.code_counts = row.code_counts; }
  }
}

// ── the three tests — the SAME functions the unit tests pin (src/lib/essay-calibration.ts) ──
const criteria: string[] = Object.keys((results.handins.find(h => h.bands) || {}).bands || {}).filter(k => k !== 'total');
const byFile = new Map<string, HandIn[]>();
for (const h of results.handins) byFile.set(h.file, [...(byFile.get(h.file) || []), h]);

const pairs: { essay: string; criterion: string; a: number | null; b: number | null }[] = [];
for (const [file, hs] of byFile) {
  for (let i = 0; i + 1 < hs.length; i++) for (const c of criteria) {
    pairs.push({ essay: file, criterion: c, a: hs[i].bands?.[c]?.band ?? null, b: hs[i + 1].bands?.[c]?.band ?? null });
  }
}
const cons = consistency(pairs);

const rankRows: { essay: string; teacher: number; app: number }[] = [];
for (const essay of set.essays as EssaySpec[]) {
  const t = essay.teacher_mark ? Number(essay.teacher_mark.total) : NaN;
  const first = (byFile.get(essay.file) || []).find(h => h.bands?.total);
  const app = midpoint(first?.bands?.total);
  if (Number.isFinite(t) && app != null) rankRows.push({ essay: essay.file, teacher: t, app });
}
const rank = ranking(rankRows);

const anchorRows: { essay: string; criterion: string; known: number; app: number | null }[] = [];
for (const essay of set.essays as EssaySpec[]) {
  if (!essay.anchor) continue;
  const first = (byFile.get(essay.file) || []).find(h => h.bands);
  for (const c of criteria) if (essay.anchor[c] != null) anchorRows.push({ essay: essay.file, criterion: c, known: Number(essay.anchor[c]), app: first?.bands?.[c]?.band ?? null });
}
const anchors = anchorFit(anchorRows);

const held = results.handins.filter(h => h.status === 'held').length;
const failed = results.handins.filter(h => h.status === 'failed').length;
results.verdict = { criteria, consistency: cons, ranking: rank, anchors, held, failed, at: new Date().toISOString() };
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 1));

console.log(`\n=== ${set.name} — ${results.handins.length} hand-ins, ${held} held, ${failed} failed`);
console.log(`consistency: ${cons.agree}/${cons.pairs} agree, ${cons.offByOne} one band apart, ${cons.offByMore} further → ${cons.pass ? 'PASS' : 'FAIL'}`);
console.log(`ranking:     n=${rank.n} rho=${Number.isNaN(rank.rho) ? '—' : rank.rho.toFixed(2)} → ${rank.pass ? 'PASS' : 'FAIL'}${rank.reason ? ` (${rank.reason})` : ''}`);
console.log(`anchors:     ${anchors.exact} exact, ${anchors.offByOne} one away, ${anchors.offByMore} further of ${anchors.n} → ${anchors.n ? (anchors.pass ? 'PASS' : 'FAIL') : 'none in this set'}`);
for (const [file, hs] of byFile) {
  console.log(`  ${file}: ${hs.map(h => h.bands?.total ? `${h.bands.total.min}–${h.bands.total.max} (${criteria.map(c => `${c[0]}${h.bands[c]?.band ?? '?'}`).join(' ')})` : h.status).join(' | ')}`);
}
