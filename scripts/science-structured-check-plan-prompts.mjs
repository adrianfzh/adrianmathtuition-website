// The grader check on the PLAN instead of the paid key (Adrian, 14 Oct 2026: "can run on plan api instead?").
// Writes the live grader's exact prompt (buildGradingPrompt, same as gradeAttempt's typed path) for each
// answer in a set, one .txt per answer. Then hand the .txt files to Opus subagents (≈15 each): "read
// prompts/<item>.txt, follow it as your only instruction, write ONLY the JSON reply to out/<item>.json",
// and score out/*.json against the set's `expected`. Same prompt, same model; only the pipe differs.
//   node scripts/science-structured-check-plan-prompts.mjs scripts/science-structured-check/answers.json <prompts dir>
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const ROOT = path.resolve('.'); const require = createRequire(path.join(ROOT, 'package.json'));
require('dotenv').config({ path: '.env.local', quiet: true });
for (const k of ['SUPABASE_URL_SCIENCE', 'SUPABASE_SERVICE_KEY_SCIENCE']) process.env[k] = process.env[k].trim();
const { createJiti } = require('jiti'); const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { buildGradingPrompt } = await jiti.import(path.join(ROOT, 'src/lib/practice-grade-prompt.ts'));
const { scienceQuestion } = await jiti.import(path.join(ROOT, 'src/lib/science-bank.ts'));
const { scienceLevelForSubject } = await jiti.import(path.join(ROOT, 'src/lib/science-levels.ts'));
const [setFile, outDir] = process.argv.slice(2);
const set = JSON.parse(fs.readFileSync(setFile, 'utf8')); const cache = new Map();
for (const it of set) {
  let row = cache.get(it.bankId); if (!row) { row = await scienceQuestion(it.subject, it.bankId); cache.set(it.bankId, row); }
  const level = scienceLevelForSubject(it.subject);
  const p = buildGradingPrompt({ question: { ...row, level: `O-Level ${level.label}` }, lines: it.lines, isPhoto: false, weaknessTags: [], pitfalls: [], methods: [], subject: it.subject });
  fs.writeFileSync(path.join(outDir, `${it.qid}${it.variant}.txt`), p);
}
console.log(set.length);
