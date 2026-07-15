#!/usr/bin/env node
// scripts/marking-eval.mjs — golden-set regression eval for the AI marking prompt.
//
// Ground truth: Adrian's own red-pen marking, transcribed into
// scripts/marking-golden-set.json (source scans in ~/Desktop/AdrianMath/marking_calibration/;
// conventions in MARKING_CONVENTIONS.md there).
//
// This evaluates the RULES encoding (mark arithmetic, ECF, reasons-required,
// correction style) on TRANSCRIBED working — it does not test handwriting vision.
// Run it after any change to buildMarkingPrompt or a model swap:
//   node scripts/marking-eval.mjs            # all items
//   node scripts/marking-eval.mjs --item 3   # one item
// Scores: margin_note agreement (exact) + per-line verdict agreement + required-flag hits.
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildMarkingPrompt } from '../src/lib/marking-pipeline.ts';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const MODEL = process.env.MARKING_EVAL_MODEL || 'claude-sonnet-5'; // default = marking-pipeline.ts runtime model — keep in sync when swapping

const golden = JSON.parse(fs.readFileSync(new URL('./marking-golden-set.json', import.meta.url), 'utf8'));
const only = process.argv.includes('--item') ? Number(process.argv[process.argv.indexOf('--item') + 1]) : null;

// NOTE: `temperature` is rejected ("deprecated") by claude-sonnet-5 — do not re-add it.
// Variance is handled by majority-of-K sampling instead (EVAL_SAMPLES, default 3).
const K = Math.max(1, Number(process.env.EVAL_SAMPLES || 3));

function scoreSample(out, item) {
  const gotMargin = (out.marks?.margin_note ?? '').replace('−', '-');
  const wantMargin = item.expected.margin_note.replace('−', '-');
  const marginOk = gotMargin === wantMargin;

  const verdicts = (out.lines ?? []).map(l => l.verdict);
  const vWant = item.expected.line_verdicts; // array aligned to working_lines, or null to skip
  let vOk = true, vDetail = 'skipped';
  if (vWant) {
    const n = Math.min(verdicts.length, vWant.length);
    const agree = vWant.slice(0, n).filter((w, k) => w === null || verdicts[k] === w).length;
    vOk = agree === vWant.length; // prefix match — the model may transcribe extra lines (answer line etc.)
    vDetail = `${agree}/${vWant.length}`;
  }

  const blob = JSON.stringify(out).toLowerCase();
  const flagsHit = item.expected.must_mention.filter(m => blob.includes(m.toLowerCase()));
  const fOk = flagsHit.length === item.expected.must_mention.length;

  return { ok: marginOk && vOk && fOk, gotMargin, wantMargin, marginOk, vDetail,
    flagsHit, fOk, missing: item.expected.must_mention.filter(m => !flagsHit.includes(m)) };
}

async function runSample(item) {
  const sys = buildMarkingPrompt(item.question, item.student_level, item.question_level);
  const user = `The student's handwritten working, transcribed line by line (treat as the page content):\n` +
    item.working_lines.map((l, n) => `Line ${n + 1}: ${l}`).join('\n') +
    `\nMax marks for this part: [${item.max_marks}]`;
  const resp = await anthropic.messages.create({
    model: MODEL, max_tokens: 16000, system: sys,
    messages: [{ role: 'user', content: user }],
  });
  const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return scoreSample(JSON.parse(raw), item); }
  catch { return { ok: false, nonJson: true, raw: raw.slice(0, 120) }; }
}

let pass = 0, total = 0;
for (const [i, item] of golden.items.entries()) {
  if (only !== null && i !== only) continue;
  total++;
  const samples = await Promise.all(Array.from({ length: K }, () =>
    runSample(item).catch(e => ({ ok: false, nonJson: true, raw: String(e).slice(0, 120) }))));
  const passes = samples.filter(s => s.ok).length;
  const ok = passes * 2 > K; // strict majority
  if (ok) pass++;
  const detail = samples.map(s => s.nonJson ? 'non-JSON' :
    `${s.ok ? 'pass' : 'fail'}(margin ${s.gotMargin || '(full)'}${s.marginOk ? '' : `≠${s.wantMargin || '(full)'}`}, v ${s.vDetail}${s.fOk ? '' : ', missing: ' + s.missing.join(';')})`).join(' | ');
  console.log(`#${i} ${item.id}: ${ok ? 'PASS' : 'FAIL'} ${passes}/${K} samples — ${detail}`);
}
console.log(`\n${pass}/${total} items agree with Adrian's marking (majority of ${K} samples)`);
process.exit(pass === total ? 0 : 1);
