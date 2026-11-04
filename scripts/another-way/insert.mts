// scripts/another-way/insert.mts — save checked "Another way" drafts as WAITING rows
// (status 'pending') for Adrian's review on /admin/another-way (SPEC-ANOTHER-WAY.md §3).
//
//   npx tsx scripts/another-way/insert.mts --drafts drafts.json --checks checks.json [--apply]
//
// drafts.json = { drafts: AltDraft[] } (or a bare array) from the author agent.
// checks.json = { [question_id]: AltChecks & { fix_better?, fix_working? } } from the BLIND checker.
// A checker's wording fix (never a maths repair) replaces the draft's text before the rules run.
// Refused: any altDraftProblems line, or a check that did not pass (checkProblems). A question that
// already has a row is skipped. Dry run unless --apply. Nothing is approved here.
import fs from 'node:fs';
import { sb, arg, argv } from '../spot-error/env.mjs';
import { altDraftProblems, checkProblems, type AltDraft, type AltChecks } from '../../src/lib/alt-method';

const APPLY = argv.includes('--apply');
const dp = arg('--drafts'), cp = arg('--checks');
if (!dp || !cp) { console.error('--drafts <file> and --checks <file> required'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(dp, 'utf8'));
const drafts: AltDraft[] = Array.isArray(raw) ? raw : raw.drafts ?? [];
const checks = JSON.parse(fs.readFileSync(cp, 'utf8')) as Record<string, AltChecks & { fix_better?: string; fix_working?: string }>;

const { data: have } = await sb.from('question_alt_methods').select('question_id').in('question_id', drafts.map(d => d.question_id));
const existing = new Set((have ?? []).map(r => r.question_id));

let ok = 0, bad = 0;
for (const d0 of drafts) {
  const c = checks[d0.question_id];
  const d: AltDraft = { ...d0, ...(c?.fix_better ? { better: c.fix_better } : {}), ...(c?.fix_working ? { working: c.fix_working } : {}) };
  const tag = `${d.question_id.slice(0, 8)} ${d.main_method} → ${d.alt_method}`;
  if (existing.has(d.question_id)) { console.log(`skip  ${tag} — already has a row`); continue; }
  const problems = [...altDraftProblems(d), ...checkProblems(c)];
  if (problems.length) { bad++; console.log(`✗ ${tag}\n    ${problems.join('\n    ')}`); continue; }
  ok++;
  if (!APPLY) { console.log(`✓ ${tag} — dry run`); continue; }
  const { fix_better: _b, fix_working: _w, ...kept } = c;
  const { error } = await sb.from('question_alt_methods').insert({
    question_id: d.question_id, main_method: d.main_method.trim(), alt_method: d.alt_method.trim(),
    working: d.working.trim(), better: d.better.trim(), alt_answer: d.alt_answer.trim(),
    checks: kept, status: 'pending',
  });
  if (error) { ok--; bad++; console.log(`✗ ${tag} — ${error.message}`); continue; }
  console.log(`✓ ${tag} saved as waiting`);
}
console.log(`${ok} ok, ${bad} refused${APPLY ? '' : ' (dry run — add --apply to save)'}`);
