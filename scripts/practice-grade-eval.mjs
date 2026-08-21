#!/usr/bin/env node
// scripts/practice-grade-eval.mjs — E6 calibration gate for the PORTAL practice
// grader (src/lib/practice-grade-prompt.ts), scored against the same golden set
// as marking-eval.mjs: Adrian's own red-pen marking, 39 transcribed items.
//
// Differences from marking-eval.mjs (the /mark-paper prompt eval):
//   - builds the portal grader's prompt (user message, no system prompt) and the
//     runtime model claude-opus-5, exactly as gradeAttempt() sends it;
//   - golden items carry no bank mark scheme, so the MARK SCHEME block is absent —
//     a HARDER condition than production, where every bank question ships its scheme;
//   - scoring maps margin_note "-n" on max_marks m → expected awarded score m−n and
//     compares GradeResult.score. Two thresholds are reported:
//       exact  — score equals Adrian's, wrong lines flagged, must_mention present
//       ±1     — score within 1 mark of Adrian's (the PLAN-PORTAL-SOLO E6 gate:
//                pass = ±1 on ≥80% of items)
//
// Run:  node scripts/practice-grade-eval.mjs            # all items
//       node scripts/practice-grade-eval.mjs --item 3   # one item
// Env:  PRACTICE_EVAL_MODEL (default claude-opus-5), EVAL_SAMPLES (default 3)
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildGradingPrompt } from '../src/lib/practice-grade-prompt.ts';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const MODEL = process.env.PRACTICE_EVAL_MODEL || 'claude-opus-5'; // = GRADING_MODEL in practice-grade.ts — keep in sync
const K = Math.max(1, Number(process.env.EVAL_SAMPLES || 3));

const golden = JSON.parse(fs.readFileSync(new URL('./marking-golden-set.json', import.meta.url), 'utf8'));
const only = process.argv.includes('--item') ? Number(process.argv[process.argv.indexOf('--item') + 1]) : null;

function expectedScore(item) {
  const m = item.expected.margin_note.replace('−', '-');
  return m === '' ? item.max_marks : item.max_marks - Math.abs(parseInt(m, 10));
}

function scoreSample(out, item) {
  const want = expectedScore(item);
  const got = typeof out.score === 'number' ? Math.max(0, Math.min(out.score, item.max_marks)) : NaN;
  const exactScore = got === want;
  const within1 = Number.isFinite(got) && Math.abs(got - want) <= 1;

  // Line verdicts: golden 'wrong' lines must be flagged ok=false; golden 'correct'
  // lines fail only if flagged ok=false (the portal prompt allows skipping trivial
  // correct lines); null = don't care.
  const comments = Array.isArray(out.lineComments) ? out.lineComments : [];
  const byLine = new Map(comments.filter(c => typeof c.line === 'number').map(c => [c.line, c]));
  const vWant = item.expected.line_verdicts;
  let vOk = true, vDetail = 'skipped';
  if (vWant) {
    let agree = 0, judged = 0;
    vWant.forEach((w, k) => {
      if (w === null) return;
      judged++;
      const c = byLine.get(k + 1);
      const ok = w === 'wrong' ? (c ? c.ok === false : false) : !(c && c.ok === false);
      if (ok) agree++;
    });
    vOk = agree === judged;
    vDetail = `${agree}/${judged}`;
  }

  const blob = JSON.stringify(out).toLowerCase();
  const flagsHit = item.expected.must_mention.filter(m => blob.includes(m.toLowerCase()));
  const fOk = flagsHit.length === item.expected.must_mention.length;

  return { ok: exactScore && vOk && fOk, within1, got, want, exactScore, vDetail, fOk,
    missing: item.expected.must_mention.filter(m => !flagsHit.includes(m)) };
}

async function runSample(item) {
  // Synthetic bank question: golden items have the question text + max marks but no
  // parts/answer/solution (scheme-less). level → the student's level, e.g. "Sec 4".
  const question = { level: item.student_level, question_text: item.question, total_marks: item.max_marks };
  const prompt = buildGradingPrompt({ question, lines: item.working_lines, isPhoto: false, weaknessTags: [] });

  // Mirror gradeAttempt(): user message, max_tokens 5000, outermost-braces parse,
  // one retry with the parse error appended.
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = attempt === 0 ? '' : `\n\nYour previous reply was not valid JSON (${lastErr}). Reply with ONLY the JSON object.`;
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 5000,
      messages: [{ role: 'user', content: prompt + extra }],
    });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    try {
      const raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      return scoreSample(raw, item);
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 100) : 'parse error';
    }
  }
  return { ok: false, within1: false, nonJson: true };
}

const CONCURRENCY = 3; // items in flight (×K calls each)
const items = golden.items.map((item, i) => ({ item, i })).filter(({ i }) => only === null || i === only);
const results = new Array(items.length);
let cursor = 0;
async function worker() {
  while (cursor < items.length) {
    const idx = cursor++;
    const { item } = items[idx];
    const samples = await Promise.all(Array.from({ length: K }, () =>
      runSample(item).catch(e => ({ ok: false, within1: false, nonJson: true, err: String(e).slice(0, 120) }))));
    results[idx] = samples;
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

let exactPass = 0, gatePass = 0;
for (const [idx, { item, i }] of items.entries()) {
  const samples = results[idx];
  const exact = samples.filter(s => s.ok).length * 2 > K;
  const gate = samples.filter(s => s.within1).length * 2 > K;
  if (exact) exactPass++;
  if (gate) gatePass++;
  const detail = samples.map(s => s.nonJson ? `non-JSON${s.err ? '(' + s.err + ')' : ''}` :
    `${s.ok ? 'pass' : 'fail'}(score ${s.got}${s.exactScore ? '' : `≠${s.want}`}, v ${s.vDetail}${s.fOk ? '' : ', missing: ' + s.missing.join(';')})`).join(' | ');
  console.log(`#${i} ${item.id}: ${exact ? 'EXACT' : gate ? '±1  ' : 'FAIL'} — ${detail}`);
}
const n = items.length;
const pct = x => `${x}/${n} (${Math.round(100 * x / n)}%)`;
console.log(`\nexact agreement (score+lines+mentions): ${pct(exactPass)}`);
console.log(`E6 gate — score within ±1 of Adrian's:  ${pct(gatePass)}  [gate needs ≥80%]`);
process.exit(gatePass / n >= 0.8 ? 0 : 1);
