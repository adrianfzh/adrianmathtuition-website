#!/usr/bin/env node
// The bench for the English Practise checker (docs/HANDOFF-ENGLISH-BUILD.md step 2).
// Truth by construction: the seeded answers of our own sets (data/english/sets/).
//
//   npx tsx scripts/english-bench/run.ts [--name e1-YYYY-MM-DD] [--sets na01,nn01] [--limit N] [--report-only]
//
// Runs on this machine with the paid key in .env.local — the SAME reading the page uses
// (lib/english-practice-store judgeShort / judgeSummary), with no cap and nothing logged.
// Five checks; the verdicts come from src/lib/english-bench.ts (the functions the tests pin):
//   1. SEEDED   every seeded short answer is read once
//   2. REPEATS  every fourth one is read a second time
//   3. PADDING  every fifth one is read again with empty words around it
//   4. SWAPPED  each question's full answer is handed to a question half the set away
//   5. SUMMARY  every seeded summary, read twice
// Writes scripts/english-bench/results/<name>.json as it goes; run again to resume.
// Cost: about 3 US cents a read (answers the free rule can mark cost nothing).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownPassage, ownSeeds, ownUnits, type OwnReading } from '../../src/lib/english-own';
import { OWN_READING } from '../../src/lib/english-own-data';
import { padAnswer, pairVerdict, pct, seededVerdict, summaryVerdict, swapTarget, swappedVerdict } from '../../src/lib/english-bench';
import { summaryContentMax, type Unit } from '../../src/lib/english-practice';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function envFile(name: string): string {
  for (const dir of [path.join(process.env.HOME ?? '', 'dev/adrianmathtuition-website'), path.resolve(HERE, '../..')]) {   // the main checkout's file is the current one
    try {
      const line = fs.readFileSync(path.join(dir, '.env.local'), 'utf8').split('\n').find(l => l.startsWith(name + '='));
      const v = line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '').replace(/\\n$/, '') : '';
      if (v) return v;
    } catch { /* next */ }
  }
  return '';
}
if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = envFile('ANTHROPIC_API_KEY');

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const name = opt('--name', `e1-${new Date().toISOString().slice(0, 10)}`);
const only = opt('--sets', '') ? opt('--sets', '').split(',').map(s => s.trim()) : null;
const limit = Number(opt('--limit', '0'));
const reportOnly = args.includes('--report-only');
// --plan-only: write the rows to read and stop — the reading is then done on the plan (plan.ts), not the paid key
const planOnly = args.includes('--plan-only');
// --hard: read scripts/english-bench/hard-answers.json instead of the sets' own seeds — answers written the
// way students write them, each read twice
const hard = args.includes('--hard');
const OUT = path.join(HERE, 'results', `${name}.json`);

type Kind = 'seeded' | 'repeat' | 'padding' | 'swapped' | 'summary' | 'summary_repeat';
interface Row {
  key: string; kind: Kind; setId: string; unit: string; skill: string; flaw: string; text: string;
  truth: number; max: number; truthHit?: number[]; baseKey?: string;
  awarded?: number | null; hit?: number[] | null; usedModel?: boolean; why?: string; done?: boolean;
}

function hardPlan(): Row[] {
  const rows: Row[] = [];
  const list = JSON.parse(fs.readFileSync(path.join(HERE, 'hard-answers.json'), 'utf8')).answers as { set: string; n: string; mark: number; flaw: string; text: string; hit?: number[] }[];
  list.forEach((a, i) => {
    const s = OWN_READING.find(x => x.id === a.set);
    const u = s ? ownUnits(s).find(x => x.number === a.n) : undefined;
    if (!s || !u) throw new Error(`hard-answers.json: no question ${a.set} Q${a.n}`);
    if (only && !only.includes(a.set)) return;
    const summary = u.kind === 'summary';
    const base: Row = { key: `hard:${a.set}:${a.n}:${i}`, kind: summary ? 'summary' : 'seeded', setId: a.set, unit: a.n, skill: u.skill ?? '', flaw: a.flaw, text: a.text,
      truth: a.mark, max: summary ? summaryContentMax(u.scheme) : u.marks, ...(summary ? { truthHit: a.hit ?? [] } : {}) };
    rows.push(base, { ...base, key: `again:${base.key}`, kind: summary ? 'summary_repeat' : 'repeat', baseKey: base.key });
  });
  return rows;
}

function plan(): Row[] {
  if (hard) return hardPlan();
  const rows: Row[] = [];
  const sets: OwnReading[] = OWN_READING.filter(s => !only || only.includes(s.id));
  for (const s of sets) {
    const seeds = ownSeeds(s);
    const short = seeds.filter(x => x.unit.kind === 'short');
    short.forEach((x, i) => {
      const base: Row = { key: `seed:${s.id}:${x.unit.number}:${i}`, kind: 'seeded', setId: s.id, unit: x.unit.number, skill: x.unit.skill ?? '', flaw: x.seed.flaw, text: x.seed.text, truth: x.seed.mark, max: x.unit.marks };
      rows.push(base);
      if (i % 4 === 0) rows.push({ ...base, key: `repeat:${base.key}`, kind: 'repeat', baseKey: base.key });
      if (i % 5 === 2) rows.push({ ...base, key: `pad:${base.key}`, kind: 'padding', baseKey: base.key, text: padAnswer(x.seed.text) });
    });
    // a full answer handed to a question half the set away: it must earn nothing there
    const units = ownUnits(s).filter(u => u.kind === 'short');
    units.forEach((u, i) => {
      const j = swapTarget(i, units.length);
      const full = short.find(x => x.unit.number === u.number && x.seed.mark === u.marks && x.seed.flaw === 'full');
      if (j == null || !full) return;
      rows.push({ key: `swap:${s.id}:${u.number}->${units[j].number}`, kind: 'swapped', setId: s.id, unit: units[j].number, skill: units[j].skill ?? '', flaw: 'swapped', text: full.seed.text, truth: 0, max: units[j].marks });
    });
    seeds.filter(x => x.unit.kind === 'summary').forEach((x, i) => {
      const max = summaryContentMax(x.unit.scheme);
      const base: Row = { key: `sum:${s.id}:${x.unit.number}:${i}`, kind: 'summary', setId: s.id, unit: x.unit.number, skill: 'summary', flaw: x.seed.flaw, text: x.seed.text, truth: x.seed.mark, max, truthHit: x.seed.hit ?? [] };
      rows.push(base, { ...base, key: `sumrepeat:${base.key}`, kind: 'summary_repeat', baseKey: base.key });
    });
  }
  return limit ? rows.slice(0, limit) : rows;
}

function load(): Row[] {
  const fresh = plan();
  if (!fs.existsSync(OUT)) return fresh;
  const old = new Map((JSON.parse(fs.readFileSync(OUT, 'utf8')).rows as Row[]).map(r => [r.key, r]));
  return fresh.map(r => { const o = old.get(r.key); return o?.done && o.text === r.text ? o : r; });
}

function report(rows: Row[]) {
  const by = new Map(rows.map(r => [r.key, r]));
  const got = (r?: Row): number | null => (r?.done && r.awarded != null ? r.awarded : null);
  const seeded = rows.filter(r => r.kind === 'seeded');
  const sv = seededVerdict(seeded.map(r => ({ truth: r.truth, max: r.max, awarded: got(r) })));
  const rv = pairVerdict(rows.filter(r => r.kind === 'repeat').map(r => ({ first: got(by.get(r.baseKey!)), second: got(r) })));
  const pv = pairVerdict(rows.filter(r => r.kind === 'padding').map(r => ({ first: got(by.get(r.baseKey!)), second: got(r) })));
  const wv = swappedVerdict(rows.filter(r => r.kind === 'swapped').map(got));
  const sums = rows.filter(r => r.kind === 'summary' || r.kind === 'summary_repeat');
  const unitOf = (r: Row): Unit | undefined => OWN_READING.flatMap(s => (s.id === r.setId ? ownUnits(s) : [])).find(u => u.number === r.unit);
  const uv = summaryVerdict(sums.map(r => ({ truthHit: r.truthHit ?? [], hit: r.done ? (r.hit ?? null) : null, max: r.max })), i => unitOf(sums[i])?.scheme.points.length ?? 0);
  const model = rows.filter(r => r.done && r.usedModel).length;
  const paid = rows.filter(r => r.done && r.usedModel && (r as Row & { by?: string }).by !== 'plan').length;   // plan reads cost no money

  const line = (label: string, ok: boolean, text: string) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(9)} ${text}`);
  console.log(`\nEnglish Practise bench — ${name} — ${rows.filter(r => r.done).length}/${rows.length} read, ${model} judged (${model - paid} on the plan, ${paid} on the paid key${paid ? `, about US$${(paid * 0.03).toFixed(2)}` : ''})\n`);
  line('SEEDED', sv.pass, `${sv.right}/${sv.read} on the seeded mark (${pct(sv.rate)}) · gross misses ${sv.gross} · unread ${sv.unread}`);
  line('REPEATS', rv.pass, `${rv.same}/${rv.n} the same mark twice (${pct(rv.rate)}) · two apart ${rv.farApart}`);
  if (pv.n) line('PADDING', pv.pass, `${pv.same}/${pv.n} unmoved (${pct(pv.rate)})`);
  if (wv.n) line('SWAPPED', wv.pass, `${wv.zero}/${wv.n} earned nothing (${pct(wv.rate)})`);
  if (sums.length) line('SUMMARY', uv.pass, `${uv.within1}/${uv.read} within one point (${pct(uv.rate)}) · three away ${uv.far} · point by point ${pct(uv.pointsAgree)}`);

  const flaws = [...new Set(seeded.map(r => r.flaw))];
  console.log('\nBy kind of answer: ' + flaws.map(f => { const x = seeded.filter(r => r.flaw === f && got(r) != null); return `${f} ${x.filter(r => r.awarded === r.truth).length}/${x.length}`; }).join(' · '));
  const skills = [...new Set(seeded.map(r => r.skill))];
  console.log('By skill:          ' + skills.map(f => { const x = seeded.filter(r => r.skill === f && got(r) != null); return `${f} ${x.filter(r => r.awarded === r.truth).length}/${x.length}`; }).join(' · '));
  const off = rows.filter(r => r.done && ((r.kind === 'seeded' && r.awarded !== r.truth) || (r.kind === 'swapped' && r.awarded !== 0)
    || ((r.kind === 'repeat' || r.kind === 'padding') && r.awarded !== by.get(r.baseKey!)?.awarded)));
  if (off.length) console.log('\nOff the mark:');
  for (const r of off) console.log(`  ${r.setId} Q${r.unit} [${r.kind}/${r.flaw}] seeded ${r.kind === 'repeat' || r.kind === 'padding' ? by.get(r.baseKey!)?.awarded + ' (first read)' : r.truth}/${r.max}, read ${r.awarded} — “${r.text.slice(0, 90)}” — ${r.why ?? ''}`);
  for (const r of sums.filter(x => x.done)) console.log(`  summary ${r.setId} [${r.flaw}] seeded points ${JSON.stringify(r.truthHit)} · read ${JSON.stringify(r.hit)}`);
  const none = (n: number) => n === 0;   // a check with no rows (a --hard or one-kind run) is not a failure
  const pass = sv.pass && rv.pass && (none(pv.n) || pv.pass) && (none(wv.n) || wv.pass) && (!sums.length || uv.pass);
  console.log(`\n${pass ? 'THE BENCH PASSES.' : 'THE BENCH DOES NOT PASS.'}`);
  return { pass, seeded: sv, repeats: rv, padding: pv, swapped: wv, summary: sums.length ? uv : null };
}

async function main() {
  const rows = load();
  const save = (verdict?: unknown) => fs.writeFileSync(OUT, JSON.stringify({ name, model: process.env.ENGLISH_CHECK_MODEL || 'claude-sonnet-5', at: new Date().toISOString(), verdict, rows }, null, 1));
  if (planOnly) { save(); console.log(`${rows.length} rows written to results/${name}.json (${rows.filter(r => !r.done).length} to read) — now plan.ts export`); return; }
  if (!reportOnly) {
    if (process.env.ENGLISH_CHECK_USE_API !== '1') { console.error('The paid key is off (Adrian, 7 Oct 2026: "all on plan"). Use --plan-only + plan.ts, or --report-only.'); process.exit(2); }
    if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(2); }
    const { judgeShort, judgeSummary } = await import('../../src/lib/english-practice-store');
    const sets = new Map(OWN_READING.map(s => [s.id, { passage: ownPassage(s), units: new Map(ownUnits(s).map(u => [u.number, u])) }]));
    const todo = rows.filter(r => !r.done);
    console.log(`${todo.length} to read (${rows.length - todo.length} already done)`);
    let at = 0;
    const worker = async () => {
      for (;;) {
        const r = todo[at++];
        if (!r) return;
        const s = sets.get(r.setId)!;
        const unit = s.units.get(r.unit)!;
        for (let tries = 0; tries < 2 && !r.done; tries++) {
          if (r.kind === 'summary' || r.kind === 'summary_repeat') {
            const c = await judgeSummary(unit, r.text, s.passage);
            if (c.state === 'marked') { r.hit = c.verdict.hit; r.awarded = c.content; r.usedModel = true; r.why = c.verdict.language; r.done = true; }
          } else {
            const c = await judgeShort(unit, r.text, s.passage);
            if (c.state === 'marked') { r.awarded = c.verdict.awarded; r.usedModel = c.usedModel; r.why = c.verdict.why; r.done = true; }
          }
        }
        if (!r.done) console.log(`  unread: ${r.key}`);
        if (at % 10 === 0) { save(); process.stdout.write(`  ${at}/${todo.length}\r`); }
      }
    };
    await Promise.all([...Array(8)].map(worker));
    save();
  }
  const verdict = report(rows);
  // --report-only never writes: a report on SOME sets must not drop the other sets' rows from the file
  if (!reportOnly) save(verdict);
  process.exit(verdict.pass ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
