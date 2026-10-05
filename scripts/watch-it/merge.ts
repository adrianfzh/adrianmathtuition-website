// ▶ Watch it — merge the authored specs that pass into data/watch-it/*.json.
//
//   npx tsx scripts/watch-it/merge.ts            (after every batch's check.ts prints 0 fail)
//
// Re-checks every spec against work/source.json; only passing specs land, one
// file per topic, keys sorted (a stable diff). Skips are counted, not stored.
import fs from 'node:fs';
import path from 'node:path';
import { checkWatchSpec, type WatchSpec } from '../../src/lib/watch-it';

const WORK = path.join(__dirname, 'work');
const OUT = path.resolve(__dirname, '../../data/watch-it');
const source = JSON.parse(fs.readFileSync(path.join(WORK, 'source.json'), 'utf8')) as Record<string, { topic: string; question_text: string; solution: string | null; answer: string | null }>;
const files: Record<string, string> = { Kinematics: 'kinematics.json', 'Chemical Calculations': 'chemical-calculations.json' };
// Held back by hand: the bank's solution is doubtful (14f87508 — the masses give an absurd Ar),
// or the clip had to bridge a step the solution skips (13fe097e). Fix the bank row first.
const HOLD = new Set(['14f87508', '13fe097e', 'b882b105', 'b99ea362', 'bed7929f', 'c0538688', 'cebe9432', 'c6979449']); // the last six draw an equation the solution only implies
const merged: Record<string, Record<string, WatchSpec>> = { Kinematics: {}, 'Chemical Calculations': {} };
const tally: Record<string, { ok: number; skip: number; fail: number; reasons: Record<string, number> }> = {};
for (const f of fs.readdirSync(path.join(WORK, 'out')).filter(f => f.endsWith('.json')).sort()) {
  const specs = JSON.parse(fs.readFileSync(path.join(WORK, 'out', f), 'utf8')) as Record<string, WatchSpec | { skip: string }>;
  for (const [qid, spec] of Object.entries(specs)) {
    const src = source[qid];
    if (!src) continue;
    const t = (tally[src.topic] ??= { ok: 0, skip: 0, fail: 0, reasons: {} });
    if (HOLD.has(qid.slice(0, 8))) continue;
    if ('skip' in spec) { t.skip++; const r = String(spec.skip).toLowerCase().slice(0, 40); t.reasons[r] = (t.reasons[r] ?? 0) + 1; continue; }
    const errors = checkWatchSpec(spec, src);
    if (errors.length) { t.fail++; console.log(`✗ ${qid}: ${errors[0]}`); continue; }
    merged[src.topic][qid] = spec;
    t.ok++;
  }
}
for (const [topic, specs] of Object.entries(merged)) {
  const sorted = Object.fromEntries(Object.keys(specs).sort().map(k => [k, specs[k]]));
  fs.writeFileSync(path.join(OUT, files[topic]), JSON.stringify(sorted, null, 1) + '\n');
}
for (const [topic, t] of Object.entries(tally)) console.log(`${topic}: ${t.ok} clips · ${t.skip} skipped · ${t.fail} failing`);
