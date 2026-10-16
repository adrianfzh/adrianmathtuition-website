// One-off (17 Oct 2026, SPEC-PART-SKILLS.md §Twins): give the twins published before the publish paths
// copied part labels the seed's labels, where the seed has them and the parts line up.
//   node scripts/twins/part-labels-backfill.mjs [--bank maths|science] [--dry]
// Never touches question_subgroups. Twins whose seed has no labels are left for the filer's re-tag.
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { seedPartLabelRows } from '../../src/lib/twin-part-labels.mjs';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });
const argv = process.argv.slice(2);
const bank = argv.includes('--bank') ? argv[argv.indexOf('--bank') + 1] : 'maths';
const dry = argv.includes('--dry');
const clean = (v) => String(v ?? '').trim().replace(/^"|"$/g, '');
const sb = bank === 'science'
  ? createClient(clean(process.env.SUPABASE_URL_SCIENCE || process.env.SCIENCE_SUPABASE_URL), clean(process.env.SUPABASE_SERVICE_KEY_SCIENCE || process.env.SCIENCE_SUPABASE_SECRET_KEY))
  : createClient(clean(process.env.SUPABASE_URL), clean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

async function all(q) { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await q().range(from, from + 999); if (error) throw new Error(error.message); out.push(...data); if (data.length < 1000) return out; } }
const twins = await all(() => sb.from('questions').select('id, twin_of, parts').eq('school', 'AdrianMath').eq('exam_type', 'Twin').not('twin_of', 'is', null).order('id'));
const seeds = [...new Set(twins.map((t) => t.twin_of))];
const labels = new Map(), seedRow = new Map(), done = new Set();
for (let i = 0; i < seeds.length; i += 150) {
  const ids = seeds.slice(i, i + 150);
  for (const r of await all(() => sb.from('question_part_subgroups').select('question_id, part_path, subgroup_id, marks, confidence').in('question_id', ids).order('question_id').order('part_path'))) {
    if (!labels.has(r.question_id)) labels.set(r.question_id, []); labels.get(r.question_id).push(r);
  }
}
const labelled = [...labels.keys()];
for (let i = 0; i < labelled.length; i += 150) for (const q of await all(() => sb.from('questions').select('id, parts').in('id', labelled.slice(i, i + 150)).order('id'))) seedRow.set(q.id, q);
const tids = twins.map((t) => t.id);
for (let i = 0; i < tids.length; i += 150) for (const r of await all(() => sb.from('question_part_subgroups').select('question_id').in('question_id', tids.slice(i, i + 150)).order('question_id'))) done.add(r.question_id);
const tally = {}; const rows = [];
for (const t of twins) {
  if (done.has(t.id)) { tally['already labelled'] = (tally['already labelled'] || 0) + 1; continue; }
  const seed = seedRow.get(t.twin_of);
  const r = seed ? seedPartLabelRows(t, seed, labels.get(t.twin_of)) : { rows: [], why: 'seed has no part labels' };
  tally[r.why ?? 'copied'] = (tally[r.why ?? 'copied'] || 0) + 1;
  rows.push(...r.rows);
}
console.log(JSON.stringify({ bank, twins: twins.length, ...tally, rows: rows.length, dry }));
if (!dry) for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from('question_part_subgroups').upsert(rows.slice(i, i + 200), { onConflict: 'question_id,part_path' }); if (error) throw new Error(error.message); }
