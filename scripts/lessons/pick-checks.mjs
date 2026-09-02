#!/usr/bin/env node
// Candidate check questions for a lesson — real bank questions on the lesson's
// canonical topic that will GRADE CLEANLY when a student types one answer.
//
//   node scripts/lessons/pick-checks.mjs <level> <topic…> [--n 2] [--show 12] [--all]
//   e.g. node scripts/lessons/pick-checks.mjs AM Quadratic Functions
//
// Mirrors the pilot's selection reasoning: the same eligibility gate the
// practice deep link applies, a top-level `answer` (lesson checks never grade
// against a worked solution), single-part questions, answers that are a
// number or a coordinate point (an expression only ever grades "unclear"),
// no ±, no "shown". Real prelims outrank AI-generated rows, recent years
// outrank old ones. --all lists the excluded rows too, with the reason.
//
// The author still chooses: this prints candidates and paste-ready `check`
// scene stubs; it never edits a script.

import { loadTs, supaGet, parseArgs, fmt } from './shared.mjs';

const args = parseArgs(process.argv.slice(2));
const level = (args._[0] || '').toUpperCase();
const topic = args._.slice(1).join(' ').trim();
if (!level || !topic) {
  console.error('usage: node scripts/lessons/pick-checks.mjs <level> <topic…> [--n 2] [--show 12] [--all]');
  process.exit(2);
}
const want = Number(args.n ?? 2);
const show = Number(args.show ?? 12);

const [{ practiceEligibility }, { usableCheckAnswer, CHECK_QUESTION_COLUMNS }, { checkTypedAnswer },
  { answerClass }, { getTopicsForPaperLevel }] = await Promise.all([
  loadTs('src/lib/portal-find.ts'),
  loadTs('src/lib/lesson-load.ts'),
  loadTs('src/lib/notebook.ts'),
  loadTs('src/lib/lesson-verify.ts'),
  loadTs('src/lib/canonical-topics.ts'),
]);

const canonical = getTopicsForPaperLevel(level).flatMap(c => c.topics);
if (canonical.length === 0) { console.error(`Unknown level "${level}" — use AM / EM / JC / S1 / S2`); process.exit(2); }
if (!canonical.includes(topic)) {
  const near = canonical.filter(t => t.toLowerCase().includes(topic.toLowerCase().split(' ')[0]));
  console.error(`"${topic}" is not a canonical ${level} topic.${near.length ? ` Did you mean: ${near.join(' · ')}` : ''}`);
  process.exit(2);
}

const cols = `${CHECK_QUESTION_COLUMNS}, level, topics, school, year, paper, question_number, exam_type`;
const query = [
  `select=${encodeURIComponent(cols)}`,
  `level=eq.${encodeURIComponent(level)}`,
  `topics=cs.${encodeURIComponent(`{"${topic}"}`)}`,
  'deleted_at=is.null',
  'order=year.desc.nullslast',
  'limit=800',
].join('&');
const rows = await supaGet(`questions?${query}`);

const CLASS_RANK = { number: 0, point: 1, expression: 3 };
const excluded = new Map(); // reason → count
const skip = (reason) => excluded.set(reason, (excluded.get(reason) ?? 0) + 1);

const candidates = [];
for (const r of rows) {
  const elig = practiceEligibility(r);
  if (!elig.ok) { skip(elig.reason); continue; }
  const answer = usableCheckAnswer(r);
  if (!answer) { skip('no top-level answer'); continue; }
  const cls = answerClass(answer);
  const nparts = Array.isArray(r.parts) ? r.parts.filter(p => p && (p.label || p.text)).length : 0;
  const hasImage = r.has_image === true || (typeof r.image_url === 'string' && r.image_url.trim() && r.image_url.trim() !== '[]');
  const self = checkTypedAnswer(answer, answer);
  const reasons = [];
  if (cls === 'multi') reasons.push('multi-part answer');
  if (cls === 'pm') reasons.push('± answer');
  if (cls === 'shown') reasons.push('show/explain answer');
  if (self !== 'correct') reasons.push('answer does not grade against itself');
  if (nparts > 1) reasons.push(`${nparts} parts`);
  const ai = r.school === 'AI Generated' || r.ai_generated === true;
  const marks = r.total_marks ?? null;
  let score = CLASS_RANK[cls] ?? 4;
  score += hasImage ? 2 : 0;
  score += ai ? 2 : 0;
  score += Math.min(3, answer.replace(/\$/g, '').length / 15);
  score += marks !== null && (marks < 2 || marks > 7) ? 1 : 0;
  score -= (r.year ?? 0) >= 2022 ? 0.5 : 0;
  const c = { r, answer, cls, nparts, hasImage, self, reasons, score, ai, marks };
  if (reasons.length > 0) { skip(reasons[0]); if (args.all) candidates.push(c); continue; }
  candidates.push(c);
}
candidates.sort((a, b) => (a.reasons.length - b.reasons.length) || (a.score - b.score) || ((b.r.year ?? 0) - (a.r.year ?? 0)));

const clean = candidates.filter(c => c.reasons.length === 0);
console.log(`${fmt.bold(`Check candidates · ${level} · ${topic}`)} — ${clean.length} clean of ${rows.length} on-topic rows`);
if (excluded.size > 0) {
  console.log(fmt.dim(`  excluded: ${[...excluded.entries()].map(([k, v]) => `${v} ${k}`).join(' · ')}`));
}
console.log();

const source = (r) => [r.school, r.year, r.paper ? `P${r.paper}` : null, r.question_number ? `Q${r.question_number}` : null]
  .filter(Boolean).join(' ');
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

candidates.slice(0, show).forEach((c, i) => {
  const flags = [c.cls, c.self === 'correct' ? 'grades ✓' : `grades ${c.self}`, c.hasImage ? 'figure' : null, c.ai ? 'AI-generated' : null]
    .filter(Boolean).join(' · ');
  const bad = c.reasons.length ? fmt.red(`  ✖ ${c.reasons.join(', ')}`) : '';
  console.log(`${fmt.bold(`#${i + 1}`)}  ${fmt.cyan(c.r.id)}  ${source(c.r)}${c.marks ? ` · [${c.marks}]` : ''}${bad}`);
  console.log(`    answer: ${fmt.green(c.answer)}   ${fmt.dim(`[${flags}]`)}`);
  const text = oneLine(c.r.question_text);
  console.log(`    ${fmt.dim(text.length > 230 ? `${text.slice(0, 230)}…` : text || '(stem lives in parts)')}`);
  console.log();
});

if (clean.length === 0) {
  console.log(fmt.yellow('No clean single-answer questions on this topic — the lesson may need a different topic, or a bank answer fixed first.'));
  process.exit(1);
}

console.log(fmt.bold(`Paste-ready stubs for the top ${Math.min(want, clean.length)} — edit prompt/placeholder/why in the author's voice:`));
for (const c of clean.slice(0, want)) {
  const stub = {
    type: 'check',
    qid: c.r.id,
    prompt: `Your turn — a real ${c.r.school === 'GCE' ? 'O-Level' : 'prelim'} question (${source(c.r)}). <one line of coaching>`,
    placeholder: c.cls === 'point' ? '(h, k)' : '<letter> = ?',
    why: `<one line: the working that lands on ${c.answer}>`,
  };
  console.log(JSON.stringify(stub, null, 2));
}
