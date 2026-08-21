#!/usr/bin/env node
// scripts/golden-anatomy-check.mjs — verifies the markAnatomy prompt addition is
// score-neutral: runs golden-set items through the PRE-anatomy prompt (baseline)
// and the current production prompt (with markAnatomy), and compares awarded
// scores. Also validates the returned anatomy through lib/mark-anatomy.ts (the
// same gate production uses) and reports how often it reconciles.
//
// The E6-calibrated rubric text is untouched by the anatomy addition; this
// script exists to prove that with model calls, not just by reading the diff.
//
// Run:  node scripts/golden-anatomy-check.mjs                 # first 5 items, 1 sample each
//       node scripts/golden-anatomy-check.mjs --n 39 --samples 3   # full set (integrator)
//       node scripts/golden-anatomy-check.mjs --items 0,3,7   # specific items
// Env:  PRACTICE_EVAL_MODEL (default claude-opus-5)
//
// PASS = every item's median baseline score equals its median with-anatomy score.
// With --samples 1 a 1-mark disagreement can be plain sampling noise (the grader
// runs at default temperature) — re-run the disagreeing item with --samples 3
// before reading it as prompt-caused drift.
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildGradingPrompt } from '../src/lib/practice-grade-prompt.ts';
import { parseMarkAnatomy } from '../src/lib/mark-anatomy.ts';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const MODEL = process.env.PRACTICE_EVAL_MODEL || 'claude-opus-5'; // = GRADING_MODEL in practice-grade.ts

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const K = Math.max(1, Number(arg('--samples', 1)));
const golden = JSON.parse(fs.readFileSync(new URL('./marking-golden-set.json', import.meta.url), 'utf8'));
const itemsArg = arg('--items', null);
const n = Math.min(golden.items.length, Number(arg('--n', 5)));
const picked = itemsArg
  ? itemsArg.split(',').map(Number).map(i => ({ item: golden.items[i], i }))
  : golden.items.slice(0, n).map((item, i) => ({ item, i }));

async function runOnce(item, anatomy) {
  const question = { level: item.student_level, question_text: item.question, total_marks: item.max_marks };
  const prompt = buildGradingPrompt({ question, lines: item.working_lines, isPhoto: false, weaknessTags: [], anatomy });
  // Mirror gradeAttempt(): user message, max_tokens 5000, outermost-braces parse, one retry.
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = attempt === 0 ? '' : `\n\nYour previous reply was not valid JSON (${lastErr}). Reply with ONLY the JSON object.`;
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 5000,
      messages: [{ role: 'user', content: prompt + extra }],
    });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    try {
      return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 100) : 'parse error';
    }
  }
  return null;
}

const score = (out, max) => out && typeof out.score === 'number' ? Math.max(0, Math.min(out.score, max)) : NaN;
const median = xs => {
  const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};

// Anatomy health for one with-anatomy output: every partBreakdown entry either
// carries anatomy that survives the production gate, or has none.
function anatomyReport(out) {
  const parts = Array.isArray(out?.partBreakdown) ? out.partBreakdown : [];
  let present = 0, valid = 0;
  for (const p of parts) {
    if (p && p.markAnatomy !== undefined) {
      present++;
      if (parseMarkAnatomy(p.markAnatomy, p.awarded, p.outOf)) valid++;
    }
  }
  return { parts: parts.length, present, valid };
}

let allEqual = true;
console.log(`model=${MODEL}, samples/variant=${K}, items=${picked.map(p => p.i).join(',')}\n`);
for (const { item, i } of picked) {
  const base = [], withA = [], reports = [];
  for (let k = 0; k < K; k++) {
    const [b, w] = await Promise.all([runOnce(item, false), runOnce(item, true)]);
    base.push(score(b, item.max_marks));
    withA.push(score(w, item.max_marks));
    if (w) reports.push(anatomyReport(w));
  }
  const mb = median(base), mw = median(withA);
  const equal = mb === mw;
  if (!equal) allEqual = false;
  const anat = reports.map(r => `${r.valid}/${r.present} valid (of ${r.parts} parts)`).join(' | ') || 'n/a';
  console.log(`#${i} ${item.id} [/${item.max_marks}]`);
  console.log(`   baseline: ${base.join(',')} (median ${mb})   with-anatomy: ${withA.join(',')} (median ${mw})   ${equal ? 'EQUAL' : '*** DIFFERS ***'}`);
  console.log(`   anatomy: ${anat}`);
}
console.log(`\n${allEqual ? 'PASS — median awarded scores identical on every item.' : 'DIFFERS on ≥1 item — re-run those items with --samples 3 to separate sampling noise from prompt drift.'}`);
process.exit(allEqual ? 0 : 1);
