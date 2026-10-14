#!/usr/bin/env node
// scripts/science-structured-check.mjs — the SEEDED check that gates structured science
// practice (src/lib/portal-beta.ts SCIENCE_STRUCTURED_PRACTICE_OPEN_TO_STUDENTS).
//
// What it does (Adrian, 14 Oct 2026: "yes"):
//   scripts/science-structured-check/answers.json holds pretend student answers to real
//   structured bank questions, three per question — (a) right but worded differently,
//   (b) half-right, (c) wrong — each with the mark fixed IN ADVANCE from the scheme by a
//   separate writer that never saw the grader. This script marks every answer with the
//   SAME function the live route uses (src/app/api/portal/practice/grade/route.ts →
//   scienceQuestion → gradeAttempt({ question: {...row, level: 'O-Level <label>'},
//   lines, weaknessTags: [], pitfalls: [], subject })), so the model and prompt are the
//   live ones, and writes results.json + a summary.
//
// Pass bar: >= 90% exact AND no answer off by more than 1 mark.
//
// Run:  node scripts/science-structured-check.mjs              # all answers
//       node scripts/science-structured-check.mjs --only Q03,Q07   # re-mark some, merge into results.json
//       node scripts/science-structured-check.mjs --summary          # re-score saved results, no grading
//       SET=hard node scripts/science-structured-check.mjs   # the harder round: borderline answers
//       CONCURRENCY=5 (default)
// Needs .env.local (ANTHROPIC_API_KEY, SUPABASE_URL_SCIENCE, SUPABASE_SERVICE_KEY_SCIENCE).
// Cost: one grader call per answer (~90 calls, a few dollars).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
require('dotenv').config({ path: process.env.ENV_FILE || path.join(ROOT, '.env.local'), quiet: true });
for (const k of ['ANTHROPIC_API_KEY', 'SUPABASE_URL_SCIENCE', 'SUPABASE_SERVICE_KEY_SCIENCE']) {
  if (process.env[k]) process.env[k] = process.env[k].trim();
  else { console.error(`missing ${k}`); process.exit(1); }
}
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { gradeAttempt, GRADING_MODEL } = await jiti.import(path.join(ROOT, 'src/lib/practice-grade.ts'));
const { scienceQuestion } = await jiti.import(path.join(ROOT, 'src/lib/science-bank.ts'));
const { scienceLevelForSubject } = await jiti.import(path.join(ROOT, 'src/lib/science-levels.ts'));

// SET=hard runs the harder round (borderline answers) in scripts/science-structured-check-hard/
const DIR = path.join(ROOT, process.env.SET ? `scripts/science-structured-check-${process.env.SET}` : 'scripts/science-structured-check');
const set = JSON.parse(fs.readFileSync(path.join(DIR, 'answers.json'), 'utf8'));
// --only Q03,Q07 re-marks just those questions and merges them into the existing results.json
const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
const CONC = Math.max(1, Number(process.env.CONCURRENCY || 5));

// Words a student must never read in feedback (CLAUDE.md: no model names, never "Adrian",
// no disclaimers; a school or paper name would leak the source).
const MODEL_WORDS = /\b(claude|opus|sonnet|haiku|fable|gemini|minimax|gpt|chatgpt|ai model|language model|as an ai)\b/i;
const DISCLAIMER = /\b(may not be (fully )?accurate|not always (be )?(right|accurate|perfect)|ai[- ]marked|automated marking|double[- ]check with your (tutor|teacher)|i (cannot|can't) see)\b/i;
const SOURCE_WORDS = /\b(adrian|prelim|seab|tys|ten[- ]year series|60\d\d)\b/i;
const SCHOOL_WORDS = /\b[A-Z][a-z]+ (Secondary|High School|Institution|Academy|College)\b/;

function feedbackText(r) {
  return [
    ...r.partBreakdown.map(p => p.comment),
    ...r.lineComments.flatMap(c => [c.comment, c.fix || '']),
    ...r.strengths, ...r.nextSteps,
  ].filter(Boolean).join(' \n');
}

function flagsFor(text) {
  const bad = [];
  if (MODEL_WORDS.test(text)) bad.push('model name');
  if (DISCLAIMER.test(text)) bad.push('disclaimer');
  const src = text.match(SOURCE_WORDS) || text.match(SCHOOL_WORDS);
  if (src) bad.push(`source/name: "${src[0]}"`);
  return bad;
}

async function gradeOne(item, qCache) {
  const level = scienceLevelForSubject(item.subject);
  let row = qCache.get(item.bankId);
  if (!row) { row = await scienceQuestion(item.subject, item.bankId); qCache.set(item.bankId, row); }
  if (!row) throw new Error(`question ${item.qid} not found`);
  const t0 = Date.now();
  const result = await gradeAttempt({
    question: { ...row, level: `O-Level ${level.label}` },
    lines: item.lines, weaknessTags: [], pitfalls: [], subject: item.subject,
  });
  const text = feedbackText(result);
  const bad = flagsFor(text);
  if (row.school && row.school.length > 3 && text.toLowerCase().includes(row.school.toLowerCase())) bad.push('school name');
  const lost = item.expected < row.total_marks;
  // "says what was missing": a marked-down answer must carry at least one ✗ line or a next step
  const saysMissing = result.score >= result.outOf || result.lineComments.some(c => !c.ok) || result.nextSteps.length > 0;
  return {
    qid: item.qid, bankId: item.bankId, subject: item.subject, type: item.type, variant: item.variant,
    outOf: row.total_marks, graderOutOf: result.outOf,
    expected: item.expected, given: result.score, diff: result.score - item.expected,
    verdict: result.verdict, parseRetried: !!result.parseRetried, ms: Date.now() - t0,
    why_expected: item.why, lines: item.lines,
    feedback: {
      parts: result.partBreakdown.map(p => ({ label: p.label, awarded: p.awarded, outOf: p.outOf, comment: p.comment })),
      lineComments: result.lineComments.map(c => ({ line: c.line, ok: c.ok, comment: c.comment, ...(c.fix ? { fix: c.fix } : {}) })),
      strengths: result.strengths, nextSteps: result.nextSteps,
    },
    feedbackFlags: bad, saysMissing: lost ? saysMissing : true,
  };
}

const summaryOnly = process.argv.includes('--summary');
const items = summaryOnly ? [] : set.filter(i => !only || only.has(i.qid));
const qCache = new Map();
const results = [];
let next = 0;
async function worker() {
  while (next < items.length) {
    const it = items[next++];
    for (let tryN = 0; tryN < 3; tryN++) {
      try { const r = await gradeOne(it, qCache); results.push(r); process.stderr.write(`${r.qid}${r.variant} exp ${r.expected} got ${r.given}\n`); break; }
      catch (e) { process.stderr.write(`${it.qid}${it.variant} error: ${e.message}\n`); if (tryN === 2) results.push({ qid: it.qid, variant: it.variant, subject: it.subject, type: it.type, error: e.message }); }
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
const RESULTS = path.join(DIR, 'results.json');
if ((only || summaryOnly) && fs.existsSync(RESULTS)) {
  const keep = JSON.parse(fs.readFileSync(RESULTS, 'utf8')).results.filter(r => !(only && only.has(r.qid)) && set.some(i => i.qid === r.qid && i.variant === r.variant));
  results.push(...keep);
}
results.sort((a, b) => (a.qid + a.variant).localeCompare(b.qid + b.variant));

// feedback flags are re-checked on every run (so a widened word list covers saved results too)
for (const r of results) if (r.feedback) {
  const text = feedbackText({ partBreakdown: r.feedback.parts, lineComments: r.feedback.lineComments, strengths: r.feedback.strengths, nextSteps: r.feedback.nextSteps });
  r.feedbackFlags = [...flagsFor(text), ...(r.feedbackFlags || []).filter(f => f === 'school name')];
}
const ok = results.filter(r => !r.error);
function stats(rs) {
  const n = rs.length;
  const exact = rs.filter(r => r.diff === 0).length;
  const off1 = rs.filter(r => Math.abs(r.diff) === 1).length;
  const off2 = rs.filter(r => Math.abs(r.diff) >= 2).length;
  return { n, exact, off1, off2, exactPct: n ? Math.round((1000 * exact) / n) / 10 : 0 };
}
const by = key => Object.fromEntries([...new Set(ok.map(r => r[key]))].sort().map(k => [k, stats(ok.filter(r => r[key] === k))]));
const all = stats(ok);
const summary = {
  ranAt: new Date().toISOString(), model: GRADING_MODEL, answers: results.length, errors: results.length - ok.length,
  overall: all,
  pass: ok.length === results.length && all.exactPct >= 90 && all.off2 === 0,
  bySubject: by('subject'), byType: by('type'), byVariant: by('variant'),
  overMarked: ok.filter(r => r.diff > 0).length, underMarked: ok.filter(r => r.diff < 0).length,
  feedbackFlags: ok.filter(r => r.feedbackFlags.length).map(r => ({ qid: r.qid, variant: r.variant, flags: r.feedbackFlags })),
  missingNotSaid: ok.filter(r => !r.saysMissing).map(r => `${r.qid}${r.variant}`),
  outOfMismatch: ok.filter(r => r.graderOutOf !== r.outOf).map(r => `${r.qid}${r.variant} ${r.graderOutOf}/${r.outOf}`),
};
fs.writeFileSync(RESULTS, JSON.stringify({ summary, results }, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
