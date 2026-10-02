#!/usr/bin/env node
// The humanities bench (SPEC-HUMANITIES.md §4, 2 Oct 2026) — truth by
// construction, no marked scripts.
//
//   npx tsx scripts/humanities-bench/run.ts [--name h1-YYYY-MM-DD] [--base URL] [--report-only] [--limit N] [--hard]
//
// --hard reads scripts/humanities-bench/hard-answers.json instead: answers written the way a
// student writes (slips, drift, copied source text, a right idea with no evidence), several
// at one level on one question, each tagged with its `flaw`.
//
// Three checks, all through the admin door (POST /api/admin/humanities):
//   1. SEEDED — every seeded answer in data/humanities (written AT a known level) is read once.
//   2. CONSISTENCY — every fourth one is handed in a second time (same day; "days apart" is a later run).
//   3. TRUTH-FREE — padding (level must not move), evidence removed (must not go up),
//      a top answer added to a weak one (must not go down).
// The verdicts come from src/lib/humanities-bench.ts, the functions the unit tests pin.
// Writes scripts/humanities-bench/results/<name>.json as it goes; run again to resume.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededAnswers, questionById } from '../../src/lib/humanities-questions';
import { seededVerdict, consistencyVerdict, truthFreeVerdict, padAnswer, stripEvidence, addSupported, type VariantKind } from '../../src/lib/humanities-bench';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
function env(name: string): string {
  if (process.env[name]) return process.env[name]!.trim();
  try {
    const line = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').find(l => l.startsWith(name + '='));
    return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '').replace(/\\n$/, '') : '';
  } catch { return ''; }
}
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const base = opt('--base', 'https://www.adrianmathtuition.com').replace(/\/$/, '');
const name = opt('--name', `h1-${new Date().toISOString().slice(0, 10)}`);
const limit = Number(opt('--limit', '0'));
const reportOnly = args.includes('--report-only');
const hard = args.includes('--hard');
const BATCH = 6;
const pw = env('ADMIN_PASSWORD');
if (!pw) { console.error('ADMIN_PASSWORD missing'); process.exit(2); }
const H = { Authorization: `Bearer ${pw}`, 'Content-Type': 'application/json' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Kind = 'seeded' | 'repeat' | VariantKind;
interface Row {
  key: string; kind: Kind; questionId: string; skill: string; text: string;
  truth?: number; baseKey?: string;
  id?: string; status?: string; level?: number | null; lo?: number | null; hi?: number | null; cost?: number | null; held_reason?: string | null;
}

function plan(): Row[] {
  let seeds: { questionId: string; skill: string; level: number; text: string; flaw?: string }[] = hard
    ? (JSON.parse(fs.readFileSync(path.join(HERE, 'hard-answers.json'), 'utf8')).answers as { questionId: string; level: number; flaw: string; text: string }[])
        .map(a => ({ ...a, skill: questionById(a.questionId)?.question.skill ?? 'unknown' }))
    : seededAnswers();
  if (limit) seeds = seeds.slice(0, limit);
  const rows: Row[] = seeds.map(s => ({ key: `seed:${s.questionId}:L${s.level}${s.flaw ? ':' + s.flaw : ''}`, kind: 'seeded', questionId: s.questionId, skill: s.skill, text: s.text, truth: s.level }));
  const seedRows = [...rows];
  seedRows.forEach((r, i) => {
    if (i % 4 === 0) rows.push({ ...r, key: `repeat:${r.key}`, kind: 'repeat', baseKey: r.key });
    if (i % 6 === 1) rows.push({ ...r, key: `pad:${r.key}`, kind: 'padding', baseKey: r.key, text: padAnswer(r.text) });
  });
  let stripped = 0;
  for (const r of seedRows) {
    if (stripped >= 8 || (r.truth ?? 0) < 2) continue;
    const t = stripEvidence(r.text);
    if (!t) continue;
    rows.push({ ...r, key: `strip:${r.key}`, kind: 'evidence_removed', baseKey: r.key, text: t });
    stripped++;
  }
  const byQ = new Map<string, Row[]>();
  for (const r of seedRows) byQ.set(r.questionId, [...(byQ.get(r.questionId) ?? []), r]);
  let added = 0;
  for (const list of byQ.values()) {
    if (added >= 8) break;
    const sorted = [...list].sort((a, b) => (a.truth ?? 0) - (b.truth ?? 0));
    const weak = sorted[0], top = sorted[sorted.length - 1];
    if (!weak || weak === top) continue;
    rows.push({ ...weak, key: `add:${weak.key}`, kind: 'supported_added', baseKey: weak.key, text: addSupported(weak.text, top.text) });
    added++;
  }
  return rows;
}

const resultsDir = path.join(HERE, 'results');
fs.mkdirSync(resultsDir, { recursive: true });
const resultsPath = path.join(resultsDir, `${name}.json`);
const results: { name: string; base: string; rows: Row[]; verdict?: unknown } =
  fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : { name, base, rows: plan() };
const save = () => fs.writeFileSync(resultsPath, JSON.stringify(results, null, 1));
const done = (r: Row) => r.status === 'marked' || r.status === 'held' || r.status === 'failed';

async function handIn(r: Row) {
  const res = await fetch(`${base}/api/admin/humanities`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ questionId: r.questionId, answer: r.text, calibrationSet: name, label: r.key, truthLevel: r.kind === 'seeded' || r.kind === 'repeat' ? r.truth : null }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { r.status = 'failed'; r.held_reason = `hand-in ${res.status} ${j.error || ''}`; return; }
  r.id = j.id; r.status = 'queued';
}
async function refresh(r: Row) {
  if (!r.id) return;
  const res = await fetch(`${base}/api/admin/humanities?id=${r.id}`, { headers: H });
  const e = (await res.json().catch(() => ({}))).run;
  if (!e) return;
  r.status = e.status; r.level = e.level; r.lo = e.level_lo; r.hi = e.level_hi; r.cost = e.cost_usd; r.held_reason = e.held_reason || e.error || null;
}

async function main() {
  if (!reportOnly) {
    for (;;) {
      const batch = results.rows.filter(r => !r.id && !done(r)).slice(0, BATCH);
      const flying = results.rows.filter(r => r.id && !done(r));
      if (!batch.length && !flying.length) break;
      if (flying.length < BATCH) { await Promise.all(batch.slice(0, BATCH - flying.length).map(handIn)); save(); }
      for (let i = 0; i < 60; i++) {
        await sleep(5000);
        const open = results.rows.filter(r => r.id && !done(r));
        await Promise.all(open.map(refresh)); save();
        if (results.rows.filter(r => r.id && !done(r)).length <= BATCH / 2) break;
      }
      const n = results.rows.filter(done).length;
      console.log(`${n}/${results.rows.length} read`);
    }
  } else {
    await Promise.all(results.rows.map(refresh)); save();
  }

  const by = new Map(results.rows.map(r => [r.key, r]));
  const lvl = (r?: Row) => (r && r.status === 'marked' ? r.level ?? null : null);
  const seeded = results.rows.filter(r => r.kind === 'seeded');
  const sv = seededVerdict(seeded.map(r => ({ truth: r.truth!, level: lvl(r) })));
  const cv = consistencyVerdict(results.rows.filter(r => r.kind === 'repeat').map(r => ({ first: lvl(by.get(r.baseKey!)), second: lvl(r) })));
  const variants = results.rows.filter(r => r.kind === 'padding' || r.kind === 'evidence_removed' || r.kind === 'supported_added');
  const tv = truthFreeVerdict(variants.map(r => ({ kind: r.kind as VariantKind, base: lvl(by.get(r.baseKey!)), variant: lvl(r) })));
  const cost = results.rows.reduce((s, r) => s + Number(r.cost || 0), 0);
  const held = results.rows.filter(r => r.status === 'held').length;
  const failed = results.rows.filter(r => r.status === 'failed').length;
  const bySkill: Record<string, { n: number; right: number }> = {};
  for (const r of seeded) { const k = (bySkill[r.skill] ??= { n: 0, right: 0 }); k.n++; if (lvl(r) === r.truth) k.right++; }
  results.verdict = { seeded: sv, bySkill, consistency: cv, truthFree: tv, held, failed, cost_usd: Number(cost.toFixed(2)) };
  save();

  console.log(`\nHumanities bench · ${name} · ${results.rows.length} answers · US$${cost.toFixed(2)}`);
  console.log(`Seeded:      ${sv.right}/${sv.n} at the written level (${Math.round(sv.rate * 100)}% of those read) · one off ${sv.oneOff} · two off ${sv.twoOff} · not settled ${sv.unread} → ${sv.pass ? 'PASS' : 'FAIL'}`);
  for (const [k, v] of Object.entries(bySkill)) console.log(`   ${k.padEnd(12)} ${v.right}/${v.n}`);
  console.log(`Consistency: ${cv.same}/${cv.n} the same level twice · two apart ${cv.twoApart} · not settled ${cv.unread} → ${cv.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Truth-free:  ${tv.held}/${tv.n} held · broke ${tv.broke} · not settled ${tv.unread} → ${tv.pass ? 'PASS' : 'FAIL'}`);
  for (const [k, v] of Object.entries(tv.byKind)) console.log(`   ${k.padEnd(18)} ${v.held}/${v.n}`);
  console.log(`Held ${held} · failed ${failed}`);
  const wrong = seeded.filter(r => lvl(r) !== r.truth);
  if (wrong.length) { console.log('\nSeeded answers not at their level:'); for (const r of wrong) console.log(`   ${r.key}  → ${r.status} ${r.lo ?? '–'}${r.hi !== r.lo ? '–' + r.hi : ''} ${r.held_reason || ''}`); }
}
main().catch(e => { console.error(e); process.exit(1); });
