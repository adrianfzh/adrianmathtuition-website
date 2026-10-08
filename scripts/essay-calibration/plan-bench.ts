#!/usr/bin/env node
// The essay bench ON THE PLAN (8 Oct 2026; Adrian, 7 Oct 2026: "all on plan"). No paid key, and
// no deployed bot needed: this file writes the hand-ins as jobs, the bot repo's
// scripts/essay-bench-local.js marks each with the real marker on plan usage, and this file
// scores what came back with the same pure functions the unit tests pin
// (src/lib/essay-seeding.ts, src/lib/essay-calibration.ts).
//
//   npx tsx scripts/essay-calibration/plan-bench.ts export <jobs.json>
//   (in the bot repo)  node scripts/essay-bench-local.js <jobs.json> <marked.json>
//   npx tsx scripts/essay-calibration/plan-bench.ts score <marked.json> [results.json]
//
// Three checks, the spec's own gates (SPEC-ESSAY-MARKING.md §Calibration + §Five marker improvements):
//   seeded slips   every sets/seeded-*: clean once, seeded twice — ≥ 90 % of planted slips found,
//                  ≥ 80 % of those with the right code, few marks elsewhere
//   bands          every sets/bands-*: each essay lands in its known band, or one band away
//   twice          every essay handed in twice — the bands agree in ≥ 90 % of pairs, never two apart
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlants, scorePlants, seededVerdict, type Plant } from '../../src/lib/essay-seeding';
import { consistency, anchorFit, type BandPair, type AnchorRow } from '../../src/lib/essay-calibration';
import { essayRubricFor } from '../../src/lib/essay-rubric';
import { essayCodesFor } from '../../src/lib/essay-codes';
import { essayGuidanceFor } from '../../src/lib/essay-guidance';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = path.join(HERE, 'sets');
const [mode, fileArg, outArg] = process.argv.slice(2);
if (!['export', 'score'].includes(mode) || !fileArg) { console.error('usage: plan-bench.ts export <jobs.json> | score <marked.json> [results.json]'); process.exit(2); }

type SetFile = { name: string; kind: string; question: string; level: string; clean?: string; plants?: Plant[]; essays?: { file: string; label?: string; anchor?: Record<string, number> }[] };
const sets = fs.readdirSync(SETS).filter(d => fs.existsSync(path.join(SETS, d, 'set.json'))).sort()
  .map(d => ({ dir: path.join(SETS, d), set: JSON.parse(fs.readFileSync(path.join(SETS, d, 'set.json'), 'utf8')) as SetFile }));
const seededSets = sets.filter(s => s.set.plants && s.set.clean);
const bandSets = sets.filter(s => s.set.essays?.some(e => e.anchor));
const read = (dir: string, f: string) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trim();

/** The payload the website sends the bot for one hand-in (lib/essay-submit.ts), built the same way. */
function payloadFor(set: SetFile, text: string, n: number) {
  const rubric = essayRubricFor('english', set.kind)!;
  return {
    runId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, text, question: set.question, essayKind: set.kind,
    subject: 'english', syllabus: rubric.syllabus, level: set.level, rubric: { criteria: rubric.criteria },
    codes: essayCodesFor('english'), guidance: essayGuidanceFor('english', set.kind), wordCount: text.split(/\s+/).length,
  };
}

if (mode === 'export') {
  const jobs: { key: string; payload: unknown }[] = [];
  let n = 1;
  for (const { dir, set } of seededSets) {
    const clean = read(dir, set.clean!);
    const { text: seeded } = applyPlants(clean, set.plants!);
    jobs.push({ key: `${set.name}/clean`, payload: payloadFor(set, clean, n++) });
    jobs.push({ key: `${set.name}/seeded#1`, payload: payloadFor(set, seeded, n++) });
    jobs.push({ key: `${set.name}/seeded#2`, payload: payloadFor(set, seeded, n++) });
  }
  for (const { dir, set } of bandSets) for (const e of set.essays!) for (const pass of [1, 2]) {
    jobs.push({ key: `${set.name}/${e.file}#${pass}`, payload: payloadFor(set, read(dir, e.file), n++) });
  }
  fs.writeFileSync(fileArg, JSON.stringify(jobs));
  console.log(`${jobs.length} hand-ins written to ${fileArg} (${seededSets.length} seeded sets, ${bandSets.length} band sets)`);
  process.exit(0);
}

type Marked = { key: string; status: string; bands: Record<string, { band: number }> | null; total: { min: number; max: number } | null; marks: { start: number; end: number; code: string | null; quote: string }[] | null; held_reason?: string | null; error?: string | null; reads?: number; dropped?: number; secs?: number };
const marked: Marked[] = JSON.parse(fs.readFileSync(fileArg, 'utf8'));
const get = (key: string) => marked.find(m => m.key === key);
const rng = (t?: { min: number; max: number } | null) => (t ? `${t.min}–${t.max}` : '—');
const bandOf = (m: Marked | undefined, c: string) => (m?.bands?.[c]?.band ?? null);

const seededRows = seededSets.map(({ dir, set }) => {
  const { spans } = applyPlants(read(dir, set.clean!), set.plants!);
  const clean = get(`${set.name}/clean`), s1 = get(`${set.name}/seeded#1`), s2 = get(`${set.name}/seeded#2`);
  const cleanMarks = clean?.marks?.length ?? 0;
  const one = (m?: Marked) => {
    if (!m?.marks || m.status !== 'marked') return null;
    const score = scorePlants(spans, m.marks);
    return { found: score.found, planted: score.planted, rightCode: score.rightCode, extra: score.extra, missed: score.missed.map(x => x.replace), wrongCode: score.wrongCode.map(w => `${w.plant.replace}: planted ${w.plant.code}, marked ${w.got ?? 'no code'}`), range: m.total, ...seededVerdict(score, cleanMarks) };
  };
  const a = one(s1), b = one(s2);
  return { set: set.name, cleanStatus: clean?.status ?? 'none', cleanMarks, cleanRange: clean?.total ?? null, first: a, second: b, statuses: [s1?.status ?? 'none', s2?.status ?? 'none'], pass: Boolean(clean?.status === 'marked' && a?.pass && b?.pass) };
});

const anchorRows: AnchorRow[] = [];
const pairs: BandPair[] = [];
const bandLines: { essay: string; known: string; first: string; second: string }[] = [];
for (const { set } of bandSets) for (const e of set.essays!) {
  const a = get(`${set.name}/${e.file}#1`), b = get(`${set.name}/${e.file}#2`);
  const crit = Object.keys(e.anchor || {});
  for (const c of crit) {
    anchorRows.push({ essay: `${e.file}#1`, criterion: c, known: e.anchor![c], app: bandOf(a, c) });
    anchorRows.push({ essay: `${e.file}#2`, criterion: c, known: e.anchor![c], app: bandOf(b, c) });
    pairs.push({ essay: e.file, criterion: c, a: bandOf(a, c), b: bandOf(b, c) });
  }
  const show = (m?: Marked) => (m?.bands ? `${crit.map(c => `${c[0].toUpperCase()}${bandOf(m, c)}`).join(' ')} (${rng(m.total)})` : `${m?.status ?? 'none'}${m?.held_reason ? ': ' + m.held_reason : ''}`);
  bandLines.push({ essay: e.label || e.file, known: crit.map(c => `${c[0].toUpperCase()}${e.anchor![c]}`).join(' '), first: show(a), second: show(b) });
}
// The seeded essays were read twice too: their bands join the same-essay-twice check.
for (const { set } of seededSets) {
  const a = get(`${set.name}/seeded#1`), b = get(`${set.name}/seeded#2`);
  for (const c of Object.keys(a?.bands || b?.bands || {}).filter(k => k !== 'total')) pairs.push({ essay: `${set.name}/seeded`, criterion: c, a: bandOf(a, c), b: bandOf(b, c) });
}
const anchors = anchorFit(anchorRows);
const twice = consistency(pairs);
const held = marked.filter(m => m.status === 'held').length;
const failed = marked.filter(m => m.status === 'failed').length;
const seededPass = seededRows.length > 0 && seededRows.every(r => r.pass);
const results = {
  at: new Date().toISOString(), billing: 'plan', handins: marked.length, held, failed,
  reads: marked.reduce((n, m) => n + (m.reads || 0), 0), dropped: marked.reduce((n, m) => n + (m.dropped || 0), 0),
  seeded: { pass: seededPass, sets: seededRows }, bands: { ...anchors, essays: bandLines }, twice,
  pass: seededPass && anchors.pass && twice.pass && failed === 0,
  marked,
};
const outPath = outArg || path.join(HERE, 'results', `plan-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(results, null, 1));

console.log(`\nEssay bench on the plan — ${marked.length} hand-ins, ${results.reads} reads, ${held} held, ${failed} failed\n`);
console.log('Seeded slips');
for (const r of seededRows) {
  const one = (x: typeof r.first) => (x ? `found ${x.found}/${x.planted}, right code ${x.rightCode}/${x.found}, extra ${x.extra}, range ${rng(x.range)}` : 'not marked');
  console.log(`  ${r.set}: clean ${r.cleanMarks} marks (${rng(r.cleanRange)}) · 1st ${one(r.first)} · 2nd ${one(r.second)} → ${r.pass ? 'PASS' : 'FAIL'}`);
  for (const x of [r.first, r.second]) { for (const m of x?.missed || []) console.log(`      MISSED "${m}"`); for (const w of x?.wrongCode || []) console.log(`      CODE   ${w}`); }
}
console.log('Bands (known → first hand-in | second hand-in)');
for (const l of bandLines) console.log(`  ${l.essay}: ${l.known} → ${l.first} | ${l.second}`);
console.log(`  fit: ${anchors.exact} exact, ${anchors.offByOne} one band away, ${anchors.offByMore} further, of ${anchors.n} → ${anchors.pass ? 'PASS' : 'FAIL'}`);
console.log(`Same essay twice: ${twice.agree}/${twice.pairs} agree, ${twice.offByOne} one band apart, ${twice.offByMore} further → ${twice.pass ? 'PASS' : 'FAIL'}`);
console.log(`\n${results.pass ? 'PASS' : 'DOES NOT PASS'} — written to ${outPath}`);
process.exit(results.pass ? 0 : 1);
