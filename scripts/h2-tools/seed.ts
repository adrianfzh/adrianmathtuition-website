// Seed / re-seed the H2 practice tools' items (SPEC-H2-TOOLS.md) from the committed files:
//   data/h2-tools/method-drills.json   → method_drills
//   data/h2-tools/stats-writeups.json  → stats_writeup_items
// Each item carries a stable `id` (written once by this script when missing), so a
// re-run UPSERTS: edit the file, re-run, the live rows follow. An item's `status`
// ('live' | 'held') and `verify_note` come from the file — the blind-solve check
// decides them (SPEC-H2-TOOLS.md §Checks).
//
//   npx tsx scripts/h2-tools/seed.ts          # dry: counts only
//   npx tsx scripts/h2-tools/seed.ts --go     # write
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

const root = path.join(__dirname, '..', '..');
const env = dotenv.parse(fs.readFileSync(path.join(root, '.env.local')));
for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (env[k] && !process.env[k]) process.env[k] = String(env[k]).trim();
}
const go = process.argv.includes('--go');

function ensureIds(file: string): Record<string, unknown>[] {
  const items = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>[];
  let added = 0;
  for (const it of items) if (typeof it.id !== 'string') { it.id = crypto.randomUUID(); added++; }
  if (added && go) fs.writeFileSync(file, JSON.stringify(items, null, 2) + '\n');
  return items;
}

async function main() {
  const { getSupabaseAdmin } = await import('../../src/lib/supabase');
  const { toMethodDrill, toStatsItem } = await import('../../src/lib/h2-tools');
  const db = getSupabaseAdmin();

  const drills = ensureIds(path.join(root, 'data/h2-tools/method-drills.json'));
  const bad = drills.filter(d => !toMethodDrill(d));
  if (bad.length) throw new Error(`${bad.length} malformed drill(s): ${bad.map(b => b.id).join(', ')}`);
  const drillRows = drills.map(d => ({
    id: d.id, area: d.area, skill: d.skill, stem: d.stem, ask: d.ask ?? null, options: d.options, answer: d.answer,
    why: d.why, trap: d.trap ?? null, trap_why: d.trap_why ?? null, source_question_id: d.source_question_id ?? null,
    status: d.status === 'live' ? 'live' : 'held', verify_note: d.verify_note ?? null,
    verified_at: d.status === 'live' ? new Date().toISOString() : null,
  }));

  const stats = ensureIds(path.join(root, 'data/h2-tools/stats-writeups.json'));
  const badS = stats.filter(s => !toStatsItem(s));
  if (badS.length) throw new Error(`${badS.length} malformed write-up item(s)`);
  const statsRows = stats.map(s => ({
    id: s.id, kind: s.kind, context: s.context, task: s.task, elements: s.elements, model_answer: s.model_answer,
    tests: s.tests ?? null, source_question_id: s.source_question_id ?? null,
    status: s.status === 'live' ? 'live' : 'held', verify_note: s.verify_note ?? null,
    verified_at: s.status === 'live' ? new Date().toISOString() : null,
  }));

  const live = (rs: { status: string }[]) => rs.filter(r => r.status === 'live').length;
  console.log(`drills: ${drillRows.length} (${live(drillRows)} live) · write-ups: ${statsRows.length} (${live(statsRows)} live)`);
  if (!go) { console.log('dry run — add --go to write'); return; }
  const a = await db.from('method_drills').upsert(drillRows);
  if (a.error) throw new Error(a.error.message);
  const b = await db.from('stats_writeup_items').upsert(statsRows);
  if (b.error) throw new Error(b.error.message);
  console.log('written');
}
main().catch(e => { console.error(e); process.exit(1); });
