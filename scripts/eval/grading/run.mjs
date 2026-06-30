// Grading swap-gate: run the SAME grader prompt against any candidate model and
// measure how close it lands to your marked exemplars. The moment a cheaper/open
// model clears the bar here, flip GRADING_MODEL in src/lib/learn/prompts.ts.
//
//   node scripts/eval/grading/run.mjs                          # default model
//   EVAL_MODEL=claude-sonnet-4-6 node scripts/eval/grading/run.mjs
//   EVAL_MODEL=claude-opus-4-8 EVAL_TARGET=75 node scripts/eval/grading/run.mjs
//
// Metric: % of exemplars graded within ±3 marks (~1 band) of your mark, + mean
// absolute error. Exit 0 if it clears EVAL_TARGET, else 1 (so it gates).
import fs from 'node:fs';
import { ENGLISH_SYSTEM } from '../../../src/lib/learn/prompts.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const env = Object.fromEntries(
  fs.readFileSync(ROOT + '.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const KEY = env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || 'claude-opus-4-8';
const TARGET = Number(process.env.EVAL_TARGET || '75'); // % within ±3 marks
const TOL = Number(process.env.EVAL_TOL || '3');         // marks tolerance ≈ 1 band

const essays = JSON.parse(fs.readFileSync(new URL('./essays.json', import.meta.url), 'utf8'));

async function grade(question, essay) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 3500, system: ENGLISH_SYSTEM,
      messages: [{ role: 'user', content: `Essay question / prompt: ${question}\n\nHere is my writing:\n\n${essay}` }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${MODEL}: ${JSON.stringify(j).slice(0, 160)}`);
  const raw = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const obj = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  return Number(obj?.overall?.score);
}

console.log(`\n  Grading eval — MODEL=${MODEL}  (±${TOL} marks ≈ 1 band, target ${TARGET}%)\n`);
let within = 0, sumErr = 0, n = 0;
for (const e of essays) {
  try {
    const got = await grade(e.question, e.essay);
    const diff = Math.abs(got - e.expectedScore);
    const ok = diff <= TOL; if (ok) within++; sumErr += diff; n++;
    console.log(`  ${ok ? '✓' : '✗'}  ${e.id.padEnd(22)} you=${String(e.expectedScore).padStart(2)}/30  model=${String(got).padStart(2)}/30  Δ${diff}`);
  } catch (err) {
    console.log(`  ⚠  ${e.id.padEnd(22)} ${String(err.message).slice(0, 70)}`); n++;
  }
}
const pct = n ? Math.round((100 * within) / n) : 0;
const mae = n ? (sumErr / n).toFixed(1) : '—';
console.log(`\n  within ±${TOL}: ${within}/${n} = ${pct}%   mean abs error: ${mae} marks`);
if (pct < TARGET) { console.log(`  ✗ below target (${TARGET}%) — keep current model.\n`); process.exit(1); }
console.log(`  ✓ clears target — this model is good enough to grade.\n`); process.exit(0);
