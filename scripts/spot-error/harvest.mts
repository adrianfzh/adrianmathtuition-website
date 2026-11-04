// scripts/spot-error/harvest.mts — pick good real mistakes for 🔍 spot-the-error
// cards (SPEC-SPOT-ERROR.md §2). Writes ANONYMOUS briefs for the author agents.
//
//   npx tsx scripts/spot-error/harvest.mts --out /path/briefs.json [--limit 12] [--kind sign]
//
// Reads paper_marking_runs.result_json ONLY — never the photos, the student
// columns (student_id / student_name / student_label / student_note) or any
// per-line student_note; lib/spot-error briefsFromRun keeps the typed lines and
// the printed question and nothing else. Superseded runs are skipped. Briefs
// whose key already became a unit (any status, rejected included) are skipped.
// Keep --out OUTSIDE the repo (the scratchpad): briefs hold re-typed working.
import fs from 'node:fs';
import { sb, arg } from './env.mjs';
import { briefsFromRun, rankBriefs, SPOT_ORIGIN, type SpotBrief } from '../../src/lib/spot-error';

const OUT = arg('--out');
if (!OUT) { console.error('--out <file> required (keep it outside the repo)'); process.exit(1); }
const LIMIT = Math.max(1, Number(arg('--limit') ?? 12) || 12);
const KIND = arg('--kind') ?? null;

const briefs: SpotBrief[] = [];
for (let from = 0; ; from += 200) {
  // Explicit columns: the student_* columns are never fetched.
  const { data, error } = await sb.from('paper_marking_runs')
    .select('id, subject, result_json')
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .range(from, from + 199);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data ?? []) briefs.push(...briefsFromRun(r as { id: string; subject: unknown; result_json: unknown }));
  if (!data || data.length < 200) break;
}

const { data: used } = await sb.from('learning_units').select('payload->>key').eq('payload->>origin', SPOT_ORIGIN);
const skip = new Set((used ?? []).map(u => (u as Record<string, string>).key).filter(Boolean));
const pool = KIND ? briefs.filter(b => b.error_kind === KIND) : briefs;
const picked = rankBriefs(pool, LIMIT, skip);

const byKind: Record<string, number> = {};
for (const b of briefs) byKind[b.error_kind] = (byKind[b.error_kind] ?? 0) + 1;
fs.writeFileSync(OUT, JSON.stringify(picked, null, 2));
console.log(`candidates ${briefs.length} by kind ${JSON.stringify(byKind)}; already used ${skip.size}; wrote ${picked.length} → ${OUT}`);
