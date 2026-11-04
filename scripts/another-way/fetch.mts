// scripts/another-way/fetch.mts — the bank rows an author agent needs (SPEC-ANOTHER-WAY.md).
//
//   npx tsx scripts/another-way/fetch.mts --ids a,b,c --out rows.json
//
// Reads only id, level, topics, question_text, answer, solution — small rows, no images.
// Skips a question that already has a row in question_alt_methods.
import fs from 'node:fs';
import { sb, arg } from '../spot-error/env.mjs';

const ids = (arg('--ids') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const out = arg('--out');
if (!ids.length || !out) { console.error('--ids and --out required'); process.exit(1); }
const { data: have } = await sb.from('question_alt_methods').select('question_id').in('question_id', ids);
const skip = new Set((have ?? []).map(r => r.question_id));
const { data, error } = await sb.from('questions')
  .select('id, level, topics, question_text, answer, solution')
  .in('id', ids.filter(i => !skip.has(i))).is('deleted_at', null);
if (error) { console.error(error.message); process.exit(1); }
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log(`${data?.length ?? 0} rows → ${out} (${skip.size} already have another way)`);
