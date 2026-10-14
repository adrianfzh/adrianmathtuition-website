// 🧪 Write the check's verdicts back (14 Oct 2026, Adrian: "yes").
//   node scripts/science-qcheck/apply.mjs <batch.json> <reports dir> [--dry]
// pass → practice_checked_at = now (structured practice serves it to students) + a note;
// fail → practice_check_note "structured check failed (<date>): <reason>", never served, never
// picked again. A row already stamped is left alone; an item with no report waits for next time.
// Stamps job_runs 'science-qcheck' (meta.fails = the messy ones, for the morning brief).
import fs from 'node:fs';
import path from 'node:path';
import { rest, stamp } from './lib.mjs';

const [batchFile, reportsDir] = process.argv.slice(2);
const dry = process.argv.includes('--dry');
const items = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
const day = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
const now = new Date().toISOString();
let passed = 0, failed = 0, missing = 0; const fails = [];
for (const it of items) {
  const f = path.join(reportsDir, `${it.id}.json`);
  let rep; try { rep = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { missing++; continue; }
  const pass = rep.verdict === 'pass';
  const reason = String(rep.reason || 'no reason given').replace(/\s+/g, ' ').slice(0, 240);
  const body = pass ? { practice_checked_at: now, practice_check_note: `structured check passed (claude-opus, ${day})` }
    : { practice_check_note: `structured check failed (${day}): ${reason}` };
  if (!dry) await rest(`questions?id=eq.${it.id}&practice_checked_at=is.null`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  if (pass) passed++; else { failed++; fails.push({ id: it.id, pools: it.pools, reason }); }
}
const summary = `${items.length} structured science questions looked at: ${passed} passed (now served), ${failed} failed, ${missing} not reached`;
console.log(summary);
for (const x of fails) console.log(`  ✗ ${x.id.slice(0, 8)} [${x.pools.join(', ')}] ${x.reason}`);
if (!dry) await stamp(missing < items.length || items.length === 0, summary, { passed, failed, missing, fails });
