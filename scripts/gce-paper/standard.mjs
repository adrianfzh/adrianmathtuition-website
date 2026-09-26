#!/usr/bin/env node
// standard.mjs — put THE RECENT STANDARD in front of every author and moderator.
//
// Adrian, 12 Sep 2026: "sep 11 set was too easy, must know that the standard for o levels
// got higher the recent years, like 2024/2025 are harder compared to previous years."
// The exemplars in Q<n>.brief.md are weighted by syllabus cut and mark closeness, not by
// year, so an author calibrates to the 2019–2022 register unless told otherwise.
//
//   node scripts/gce-paper/standard.mjs --run "$RUN" [--years 2024,2025]
//
// Writes into the run dir (after `generate.mjs brief`):
//   standard-questions-P<n>.md  every real question of those years for this paper number,
//                               from the run's own corpus.json, in Q order — difficulty
//                               anchors AND the re-skin list for the moderator.
//   standard.md                 the written standard for the level (the skill's
//                               reference/{em,am}-standard-2024-2025.md, jc-standard-2022-2024.md);
//                               a note when none exists.
// Both files are named by the prompt templates in .claude/skills/gce-paper/prompts/.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const RUN = argOf('--run', null);
if (!RUN) { console.error('usage: standard.mjs --run <run dir> [--years 2024,2025]'); process.exit(2); }

const plan = JSON.parse(readFileSync(join(RUN, 'plan.json'), 'utf8'));
const corpus = JSON.parse(readFileSync(join(RUN, 'corpus.json'), 'utf8'));
const paperNo = Number(plan.paperNo);
const level = /^GCE-EM/.test(plan.key) ? 'EM' : /^GCE-AM/.test(plan.key) ? 'AM' : /^GCE-JC/.test(plan.key) ? 'JC' : null;
// The sittings that set the standard. O-Level: 2024 + 2025 (Adrian, 12 Sep 2026, above).
// H2: 2022–2024 — Adrian, 26 Sep 2026: "discount year 2025 because somehow that year was
// too easy"; 2025 was the first sitting of the revised 9758 (recurrence in, method of
// differences out), so its questions are still in the run's corpus as syllabus anchors
// and in the novelty gate, but they do not set the difficulty.
const DEFAULT_YEARS = level === 'JC' ? '2022,2023,2024' : '2024,2025';
const YEARS = argOf('--years', DEFAULT_YEARS).split(',').map(s => s.trim()).filter(Boolean);
const kind = paperNo === 1 ? 'a short question' : 'a long question';

const re = new RegExp(`^GCE (${YEARS.join('|')}) P${paperNo} Q(\\d+)`);
const rows = corpus.filter(q => re.test(q.ref));
rows.sort((a, b) => {
  const ya = a.ref.match(/^GCE (\d{4})/)[1], yb = b.ref.match(/^GCE (\d{4})/)[1];
  if (ya !== yb) return ya < yb ? -1 : 1;
  return Number(a.ref.match(/Q(\d+)/)[1]) - Number(b.ref.match(/Q(\d+)/)[1]);
});
if (!rows.length) { console.error(`no GCE ${YEARS.join('/')} P${paperNo} questions in ${join(RUN, 'corpus.json')}`); process.exit(1); }

const out = [];
const yearsText = YEARS.length > 1 ? `${YEARS.slice(0, -1).join(', ')} and ${YEARS[YEARS.length - 1]}` : YEARS[0];
out.push(`# The recent standard — every GCE ${yearsText} Paper ${paperNo} question`, '');
out.push(`Read these for DIFFICULTY and for what ${kind} now demands. They are the real papers; the novelty gate and the moderator reject any new question that re-skins one of them (same situation or structure with new numbers). Marks are in [n].`, '', '');
let year = null;
for (const q of rows) {
  const y = q.ref.match(/^GCE (\d{4})/)[1];
  if (y !== year) { year = y; out.push(`## GCE ${y} Paper ${paperNo}`, ''); }
  out.push(`### ${q.ref} (${(q.topics || []).join(', ')})`);
  out.push(String(q.text || '').replace(/[ \t]+/g, ' ').trim(), '');
}
const qPath = join(RUN, `standard-questions-P${paperNo}.md`);
writeFileSync(qPath, out.join('\n'));
console.log(`${qPath}  (${rows.length} questions: ${YEARS.map(y => `${y}: ${rows.filter(r => r.ref.startsWith(`GCE ${y} `)).length}`).join(', ')})`);

const refFile = { EM: 'em-standard-2024-2025.md', AM: 'am-standard-2024-2025.md', JC: 'jc-standard-2022-2024.md' }[level];
const ref = refFile ? join(ROOT, '.claude', 'skills', 'gce-paper', 'reference', refFile) : null;
const sPath = join(RUN, 'standard.md');
if (ref && existsSync(ref)) {
  writeFileSync(sPath, readFileSync(ref, 'utf8'));
  console.log(`${sPath}  (from ${ref.replace(ROOT + '/', '')})`);
} else {
  writeFileSync(sPath, `# The ${YEARS.join('/')} standard\n\nNo written standard exists yet for ${plan.key}. Read standard-questions-P${paperNo}.md: every slot must sit AT the difficulty of those papers for its marks — not below (rejected) and not above (the paper must stay finishable). Write the standard doc for this level (see .claude/skills/gce-paper/reference/) once a paper has been read against the recent years.\n`);
  console.log(`${sPath}  (placeholder — no written standard for ${plan.key} yet)`);
}
