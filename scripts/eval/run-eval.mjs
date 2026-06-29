// Eval harness for the math-answer prompt.
//
//   node scripts/eval/run-eval.mjs                  # eval the default model
//   EVAL_MODEL=claude-opus-4-8 node scripts/eval/run-eval.mjs
//
// Loads scripts/eval/dataset.json (questions + expected answers) and
// scripts/eval/prompt.md (the system prompt being tuned), asks the model
// each question, then uses a cheap judge model to mark each answer
// correct/incorrect against the expected answer. Prints per-question
// results + overall accuracy. Exit code 0 if accuracy >= TARGET, else 1
// (so a loop can stop when the target is hit).
import fs from 'node:fs';

const DIR = new URL('./', import.meta.url).pathname;
const ROOT = new URL('../../', import.meta.url).pathname;
const env = Object.fromEntries(
  fs.readFileSync(ROOT + '.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const KEY = env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || 'claude-sonnet-4-6';
const JUDGE = process.env.EVAL_JUDGE || 'claude-haiku-4-5';
const TARGET = Number(process.env.EVAL_TARGET || '100'); // % accuracy to pass

const dataset = JSON.parse(fs.readFileSync(DIR + 'dataset.json', 'utf8'));
const systemPrompt = fs.readFileSync(DIR + 'prompt.md', 'utf8');

async function ask(model, system, user, max = 2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: max, ...(system ? { system } : {}), messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${model}: ${JSON.stringify(j).slice(0, 200)}`);
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function finalLine(text) {
  const m = text.match(/FINAL:\s*(.+)\s*$/m);
  return (m ? m[1] : text.split('\n').pop() || '').trim();
}

async function judge(question, expected, got) {
  const verdict = await ask(JUDGE, null,
    `You are grading a maths answer. Mark CORRECT if the student's final answer is mathematically equivalent to the expected answer (ignore formatting, wording, and extra working), else INCORRECT.\n\n` +
    `Question: ${question}\nExpected: ${expected}\nStudent's final answer: ${got}\n\nReply with exactly one word: CORRECT or INCORRECT.`, 16);
  return /correct/i.test(verdict) && !/incorrect/i.test(verdict);
}

const results = [];
for (const item of dataset) {
  try {
    const answer = await ask(MODEL, systemPrompt, item.question);
    const got = finalLine(answer);
    const ok = await judge(item.question, item.expected, got);
    results.push({ id: item.id, ok, got, expected: item.expected });
    console.log(`  ${ok ? '✓' : '✗'}  ${item.id.padEnd(22)} got: ${got.slice(0, 48).padEnd(48)} ${ok ? '' : '(want: ' + item.expected + ')'}`);
  } catch (e) {
    results.push({ id: item.id, ok: false, got: 'ERROR', expected: item.expected });
    console.log(`  ⚠  ${item.id.padEnd(22)} ${String(e.message).slice(0, 60)}`);
  }
}

const pass = results.filter((r) => r.ok).length;
const acc = Math.round((100 * pass) / results.length);
console.log(`\n  MODEL=${MODEL}  accuracy: ${pass}/${results.length} = ${acc}%  (target ${TARGET}%)`);
if (acc < TARGET) { console.log('  ✗ below target — failures:', results.filter((r) => !r.ok).map((r) => r.id).join(', ')); process.exit(1); }
console.log('  ✓ target met'); process.exit(0);
