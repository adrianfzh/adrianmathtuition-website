#!/usr/bin/env node
// 📏 Seed the consistency set with the bot's GOLDEN BENCH papers (17 Sep 2026).
//
// The bench papers are already the ones every marking fix is checked against
// (bot repo, test/golden/*.json — each file's `run_id` is a real
// paper_marking_runs row), so they are the natural first set: papers we have
// argued about, across both subjects and several years. Adrian changes the set
// afterwards from /api/admin/consistency-set.
//
//   node scripts/seed-consistency-set.mjs                 # the ids below
//   node scripts/seed-consistency-set.mjs --dry           # say what it would do
//   node scripts/seed-consistency-set.mjs --from <dir>    # re-read a bench folder
//
// Needs SUPABASE_URL + SUPABASE_SECRET_KEY (from .env.local).
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The bench as it stood on 17 Sep 2026. `--from` re-reads a checkout instead,
// so the set can be re-seeded after the bench grows without editing this list.
const GOLDEN = [
  ['0d1ea3bc-50e3-4e36-975e-07e6ff87206e', 'bench: am tys 2023 p1 — extra working'],
  ['5906c3b4-faf0-41b3-9318-ee36b77f6476', 'bench: am tys 2024 p2 — page brackets'],
  ['466ef7e7-cd93-4248-bb1e-d4b20b312485', 'bench: am tys 2025 p1 — remarked'],
  ['308c0fd0-d997-4721-95bd-2f47476843f7', 'bench: am tys 2025 p2 — remarked'],
  ['c74f3251-d3f3-4e71-ac12-cfd0d43b8c0a', 'bench: am set 3 p1 — zero part, no code'],
  ['022d1058-c552-4f33-873f-95b1d2a11eca', 'bench: em 2022 p1 — partless labels'],
  ['ef5d0b46-c482-47fe-88ab-cebe8ced7f60', 'bench: em tys 2022 p2 — fragments'],
  ['a7c2c444-2d7a-4ac2-9d98-f32e56c13cf7', 'bench: em tys 2022 p2 — over-allocated'],
  ['4d4a7129-5806-484c-bd26-ac0ea20ab5c4', 'bench: em tys 2024 p1 — grounded'],
  ['5c74f3b2-f600-4d1e-8fbc-38449511994b', 'bench: em tys 2025 p1 — scheme allocation'],
  ['a0e86585-10ae-4424-bedb-50fca4e6dba2', 'bench: em practice set 3 p2 — zero part ticks'],
];

function fromFolder(dir) {
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (j.run_id) out.push([j.run_id, `bench: ${j.paper_name || j.slug || f}`]);
    } catch { /* a bench file that is not a paper (pen-cases.json) is not in the set */ }
  }
  return out;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const fromIdx = args.indexOf('--from');
const rows = fromIdx >= 0 ? fromFolder(args[fromIdx + 1]) : GOLDEN;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL + SUPABASE_SECRET_KEY required'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// Only a paper that can actually be re-read goes in: stored photos, and a
// marking to compare against. A row that fails either is reported, not seeded —
// a set with a paper in it that silently never reads is worse than a short set.
const { data: runs, error } = await sb.from('paper_marking_runs')
  .select('id, paper_name, student_name, total_max, result_json')
  .in('id', rows.map(([id]) => id));
if (error) { console.error('read failed:', error.message); process.exit(1); }
const byId = new Map((runs ?? []).map((r) => [r.id, r]));

const ok = [], bad = [];
for (const [id, note] of rows) {
  const run = byId.get(id);
  if (!run) { bad.push([id, note, 'run not found']); continue; }
  const photos = run.result_json?.source?.photos;
  if (!Array.isArray(photos) || !photos.length) { bad.push([id, note, 'no stored photos']); continue; }
  const marked = !!(run.result_json?.results?.length) || run.total_max != null;
  if (!marked) { bad.push([id, note, 'not marked']); continue; }
  ok.push([id, note, run, photos.length]);
}

for (const [id, note, run, n] of ok) console.log(`  ✓ ${id.slice(0, 8)}  ${String(run.paper_name || '').padEnd(40)} ${String(n).padStart(3)} pages  ${note}`);
for (const [id, note, why] of bad) console.log(`  ✗ ${id.slice(0, 8)}  ${why.padEnd(40)} ${note}`);

if (dry) { console.log(`\n(dry) would seed ${ok.length}, skip ${bad.length}`); process.exit(0); }
if (!ok.length) { console.log('\nnothing to seed'); process.exit(0); }

const { error: upErr } = await sb.from('consistency_set')
  .upsert(ok.map(([run_id, note]) => ({ run_id, note, active: true })), { onConflict: 'run_id' });
if (upErr) { console.error('seed failed:', upErr.message); process.exit(1); }
console.log(`\nseeded ${ok.length} paper(s)${bad.length ? `, skipped ${bad.length}` : ''}.`);
console.log(`Roughly ${ok.length} × 16 min of Mac plan time each Sunday night.`);
