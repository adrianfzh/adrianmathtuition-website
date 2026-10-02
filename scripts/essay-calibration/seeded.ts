#!/usr/bin/env node
// The seeded essay bench (2 Oct 2026) — truth by construction, no marked scripts.
//
//   npx tsx scripts/essay-calibration/seeded.ts <set-dir> [--base https://www.adrianmathtuition.com] [--report-only] [--twice]
//
// --twice hands the seeded essay in a SECOND time: the consistency check (the same
// essay read twice should find the same slips and land on the same band range).
//
// <set-dir>/set.json: { name, kind, question, level, clean: "clean.txt",
//   plants: [{ find, replace, code }] }. The clean essay is handed in once (its
// marks are the noise floor) and the seeded essay once; the marker should find
// every planted slip, give it the planted code, and mark little else
// (src/lib/essay-seeding.ts — the same functions the unit tests pin).
// Writes <set-dir>/seeded-results.json. Cost: about 35 cents a hand-in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlants, scorePlants, seededVerdict, type Plant } from '../../src/lib/essay-seeding';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function env(name: string): string {
  if (process.env[name]) return process.env[name]!.trim();
  try {
    const line = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').find(l => l.startsWith(name + '='));
    return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '').replace(/\\n$/, '') : '';
  } catch { return ''; }
}
const args = process.argv.slice(2);
const setDir = args.find(a => !a.startsWith('--'));
if (!setDir) { console.error('usage: seeded.ts <set-dir> [--base URL] [--report-only]'); process.exit(2); }
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const base = opt('--base', 'https://www.adrianmathtuition.com').replace(/\/$/, '');
const reportOnly = args.includes('--report-only');
const twice = args.includes('--twice');
const pw = env('ADMIN_PASSWORD');
if (!pw) { console.error('ADMIN_PASSWORD missing'); process.exit(2); }
const H = { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const set = JSON.parse(fs.readFileSync(path.join(setDir, 'set.json'), 'utf8'));
const clean = fs.readFileSync(path.join(setDir, set.clean), 'utf8').trim();
const { text: seeded, spans } = applyPlants(clean, set.plants as Plant[]);   // throws on a bad set, before any money is spent

const resultsPath = path.join(setDir, 'seeded-results.json');
type Which = 'clean' | 'seeded' | 'seeded2';
type Row = { which: Which; id: string; status?: string; total?: { min: number; max: number } | null; marks?: { start: number; end: number; code: string | null; quote: string }[]; held_reason?: string | null };
const results: { set: string; rows: Row[]; verdict?: unknown } = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : { set: set.name, rows: [] };
const save = () => fs.writeFileSync(resultsPath, JSON.stringify(results, null, 1));

async function handIn(which: Which): Promise<string> {
  const r = await fetch(`${base}/api/admin/essays`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ kind: set.kind, question: set.question, level: set.level, text: which === 'clean' ? clean : seeded, calibrationSet: set.name, label: `seeded bench · ${which}` }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${which}: ${r.status} ${j.error || ''}`);
  return j.id;
}
async function refresh(row: Row) {
  const r = await fetch(`${base}/api/admin/essays?id=${row.id}`, { headers: H });
  const e = (await r.json().catch(() => ({}))).essay;
  if (!e) return;
  row.status = e.status; row.held_reason = e.held_reason;
  row.total = e.report?.total ? { min: e.report.total.min, max: e.report.total.max } : null;
  row.marks = (e.report?.marks || []).map((m: any) => ({ start: m.start, end: m.end, code: m.code, quote: m.quote }));
}

// Inside a function: tsx runs this file as CommonJS, which has no top-level await.
async function main() {
if (!reportOnly) {
  for (const which of (twice ? ['clean', 'seeded', 'seeded2'] : ['clean', 'seeded']) as Which[]) {
    if (results.rows.find(r => r.which === which)) continue;
    results.rows.push({ which, id: await handIn(which) }); save();
    console.log(`handed in the ${which} essay`);
    await sleep(1500);
  }
}
const pending = () => results.rows.filter(r => !r.status || r.status === 'queued' || r.status === 'marking');
for (let i = 0; i < (reportOnly ? 1 : 120) && (i === 0 || pending().length); i++) {
  if (i) await sleep(10000);
  for (const r of (i ? pending() : results.rows)) await refresh(r);
  save();
}

const cleanRow = results.rows.find(r => r.which === 'clean');
const seededRow = results.rows.find(r => r.which === 'seeded');
if (!seededRow?.marks || seededRow.status !== 'marked' || cleanRow?.status !== 'marked') {
  console.log(`Not marked yet: clean = ${cleanRow?.status || 'none'}, seeded = ${seededRow?.status || 'none'}. Run again with --report-only.`);
  process.exit(1);
}
const score = scorePlants(spans, seededRow.marks);
const cleanMarks = cleanRow.marks?.length ?? 0;
const verdict = seededVerdict(score, cleanMarks);
results.verdict = { ...verdict, planted: score.planted, found: score.found, rightCode: score.rightCode, extra: score.extra, cleanMarks };
save();

console.log(`\nSeeded bench · ${set.name}`);
console.log(`  Planted slips found:  ${score.found} of ${score.planted}`);
console.log(`  Right code:           ${score.rightCode} of ${score.found}`);
console.log(`  Marks on the clean essay (noise): ${cleanMarks}`);
console.log(`  Extra marks on the seeded essay:  ${score.extra}`);
for (const m of score.missed) console.log(`  MISSED  [${m.code}] "${m.replace}"`);
for (const w of score.wrongCode) console.log(`  CODE    "${w.plant.replace}" planted ${w.plant.code}, marked ${w.got ?? 'no code'}`);
const second = results.rows.find(r => r.which === 'seeded2');
if (second?.status === 'marked' && second.marks) {
  const s2 = scorePlants(spans, second.marks);
  const firstFound = new Set(spans.filter(s => !score.missed.includes(s)).map(s => s.find));
  const bothFound = spans.filter(s => firstFound.has(s.find) && !s2.missed.some(m => m.find === s.find)).length;
  const rng = (t?: { min: number; max: number } | null) => (t ? `${t.min}–${t.max}` : 'none');
  console.log(`  Second read: found ${s2.found} of ${s2.planted}, right code ${s2.rightCode}, extra ${s2.extra}`);
  console.log(`  Found on BOTH reads: ${bothFound} of ${score.planted} · mark range ${rng(seededRow.total)} then ${rng(second.total)}`);
  (results.verdict as any).second = { found: s2.found, rightCode: s2.rightCode, extra: s2.extra, bothFound, range1: seededRow.total, range2: second.total };
  save();
} else if (second) console.log(`  Second read: ${second.status}${second.held_reason ? ' — ' + second.held_reason : ''}`);
console.log(verdict.pass ? '\n  PASS' : `\n  FAIL\n   - ${verdict.reasons.join('\n   - ')}`);
process.exit(verdict.pass ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
