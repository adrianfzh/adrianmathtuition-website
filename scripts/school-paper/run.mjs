#!/usr/bin/env node
// School-paper run — the deterministic half of writing a NEW paper in one school's
// style (18 Sep 2026). Every model step is a Claude Code Agent spawn under the plan;
// this script never calls a model. The school's own folder
// (scripts/school-paper/schools/<key>/) holds plan.json (the approved slots) and
// standard.md (scope, difficulty, wording); the real papers come from the bank.
//
//   node scripts/school-paper/run.mjs brief    --key sngs-s1-eoy --run <dir>
//   node scripts/school-paper/run.mjs check    --run <dir> [--slots 1,2,3]
//   node scripts/school-paper/run.mjs assemble --run <dir>
//
// brief    → author-brief.md, Q<n>.brief.md, paper-so-far.md, corpus.json, plan.json
// check    → Q<n>.gates.json (+ Q<n>.solve.md, Q<n>.moderate.md when the gates pass)
// assemble → <key>.json in the shape scripts/gce-paper/export-docx.py reads, and
//            paper-shape-report.json (the counts the read-through needs)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MATH_SUPABASE_URL = 'https://nempslbewxtlikfzachi.supabase.co';
const NOVELTY_MAX = 0.4;        // word-trigram Jaccard against any bank question of the level
const NOVELTY_MAX_SCHOOL = 0.3; // stricter against the school's own papers
const PROMPT_VERSION = 'school-author-v1';
const argv = process.argv.slice(2);
const MODE = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'brief';
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const KEY = argOf('--key', null), RUN = argOf('--run', null);
const SLOTS = argOf('--slots', '') ? argOf('--slots', '').split(',').map(Number) : null;
const log = (...a) => console.error(...a);

function loadEnv() {
  const { parse } = require('dotenv');
  const out = {};
  const p = join(ROOT, '.env.local');
  if (existsSync(p)) Object.assign(out, parse(readFileSync(p, 'utf8')));
  Object.assign(out, process.env);
  if (!out.SUPABASE_SECRET_KEY) {
    const botEnv = join(homedir(), 'dev', 'adrianmath-telegram-math-bot', '.env');
    if (existsSync(botEnv)) {
      const b = parse(readFileSync(botEnv, 'utf8'));
      if (b.SUPABASE_SERVICE_KEY_MAIN) { out.SUPABASE_SECRET_KEY = b.SUPABASE_SERVICE_KEY_MAIN; out.SUPABASE_URL = out.SUPABASE_URL || MATH_SUPABASE_URL; }
    }
  }
  for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']) out[k] = (out[k] ?? '').trim();
  return out;
}
function readJsonLoose(path) {
  let t = readFileSync(path, 'utf8').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error(`${path}: no JSON object`);
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return JSON.parse(t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); }
}
const normLabel = (l) => { const s = String(l ?? '').trim().replace(/^\(|\)$/g, ''); return s ? `(${s})` : ''; };
function partsText(parts, depth = 0) {
  const pad = '  '.repeat(depth);
  return (parts ?? []).filter(Boolean).map((p) => { // a bank row can carry a null inside parts (seen 20 Sep 2026, EM corpus)
    const kids = p.subparts ?? p.parts;
    const head = `${pad}${normLabel(p.label)} ${String(p.text ?? '').trim()}${kids?.length ? '' : ` [${p.marks ?? '?'}]`}`;
    return kids?.length ? `${head}\n${partsText(kids, depth + 1)}` : head;
  }).join('\n');
}
const questionText = (q) => [String(q.stem ?? '').trim(), partsText(q.parts)].filter(Boolean).join('\n');
// leaf answer units: [marks, text]
function leaves(parts) {
  const out = [];
  const walk = (list) => { for (const p of (list ?? []).filter(Boolean)) { const kids = p.subparts ?? p.parts; if (kids?.length) walk(kids); else out.push({ marks: Number(p.marks) || 0, text: String(p.text ?? '') }); } };
  walk(parts);
  return out;
}
function grams(text, n = 3) {
  const toks = String(text).toLowerCase().replace(/\{\{IMG:[^}]+\}\}/g, ' ')
    .replace(/\\[a-z]+/g, ' ').replace(/[${}^_()\[\]\\|,.;:!?'"“”‘’]/g, ' ').split(/\s+/).filter(Boolean);
  const g = new Set();
  for (let i = 0; i + n <= toks.length; i++) g.add(toks.slice(i, i + n).join(' '));
  return g;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const REASON = /\bexplain|give a reason|justify|do you agree|is (he|she|it) correct|state (the|a|one) (reason|assumption)/i;
const SHOW = /\bshow that|\bprove\b/i;
const NOCALC = /without (using|the use of) a calculator/i;

// ------------------------------------------------------------- bank ----
async function fetchRows(env, filter) {
  const cols = 'id,school,year,level,exam_type,paper,question_number,total_marks,topics,question_text,parts,has_image';
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const url = `${env.SUPABASE_URL}/rest/v1/questions?select=${cols}&${filter}&deleted_at=is.null&ai_generated=not.is.true&order=id`;
    const res = await fetch(url, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`bank read ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}
const bankText = (r) => [String(r.question_text ?? '').trim(), partsText(r.parts)].filter(Boolean).join('\n').replace(/\{\{IMG:[^}]+\}\}/g, '[figure]');
const qn = (r) => Number(String(r.question_number).replace(/\D/g, '')) || 0;

// ------------------------------------------------------------ briefs ----
const JSON_SHAPE = `{"stem": "text before the parts ('' if none)", "parts": [{"label": "(a)", "text": "…", "marks": 2, "answer": "…", "subparts": [{"label": "(i)", "text": "…", "marks": 1, "answer": "…"}]}], "answer": "every final answer on one line, part by part", "total_marks": 5, "topics": ["bank topic name"], "skills": ["1–3 specific phrases naming what the question tests"], "needs_figure": false, "figure_description": "exact description a drafter could draw from: every length, angle, label, which values are printed and which are NOT", "solution": "full worked solution, part by part, with the marks (M1, A1, B1) beside the lines that earn them", "scope_check": "one line: why every step is inside the school's scope", "originality_note": "one line: which two things differ from the real questions shown"}`;

function authorBrief(plan, standard, topicList) {
  return `# Author brief — a new ${plan.school} ${plan.level} ${plan.exam} paper

You are an experienced Singapore secondary mathematics teacher setting ONE question of a new
paper in the style of this school's own ${plan.level} ${plan.exam} papers. The paper is
${plan.duration}, ${plan.total} marks, ${plan.slots.length} questions. Students write on the question paper.

${standard.trim()}

## Rules for every question
1. Write to the slot brief exactly: the marks of the slot, the marks of each part in the
   order given, the content described. The part marks are fixed; do not merge or split parts.
2. Every number must work. Solve your own question fully before you write it down. Answers
   should be clean where the school's are clean (whole numbers, simple fractions, exact
   multiples of $\\pi$) and need 3 significant figures only where a calculator part intends it.
3. A 1-mark part is one step. A 2-mark part is a method and an answer. A 3-mark part has two
   ideas. Do not pad a part to fill its marks and do not hide three ideas in two marks.
4. An explain part must be answerable in one or two sentences that contain a number or a
   named fact. Write the expected sentence in the answer.
5. Maths in LaTeX between single dollar signs. Money as \\$12.50 inside text. Units stated.
   Cone, sphere and pyramid formulas, when needed, are printed at the end of the stem in
   square brackets.
6. A figure is described, never drawn: set "needs_figure" and write "figure_description"
   so that a drafter could draw it without reading the question. Say "NOT drawn to scale"
   only where the school would. Never print on the figure a value the student must find.
7. "topics" must be names from this list only: ${topicList.join(' · ')}.
8. No question may be one of the real questions shown to you with the numbers, names or
   units changed. The standard's last section is the test.

## Output
Save ONE JSON object, no prose around it, in exactly this shape (subparts only where used;
a single-part question has one part with an empty label):
${JSON_SHAPE}
`;
}

function slotBrief(plan, slot, shown, paperNote) {
  const real = shown.map((r) => `### ${r.ref} · ${r.total_marks} marks${r.has_image ? ' · has a figure (not shown)' : ''}\n${r.text}`).join('\n\n');
  return `# Slot Q${slot.pos} of ${plan.slots.length} — ${slot.target} marks

**Topics:** ${slot.topics.join(', ')}
**Parts, in order, with their marks:** ${slot.parts.join(', ')}${slot.parts.length === 1 ? ' (a single-part question, no label)' : ''}
**Figure:** ${slot.figure ? 'YES, this question carries a figure. Describe it exactly.' : 'no figure'}
**What this slot asks:** ${slot.content}
${paperNote}
The part marks may be arranged as (a), (b), (c) or as (a)(i), (a)(ii), (b), whichever reads
naturally, but the leaf marks in order must be exactly ${slot.parts.join(', ')}.

## The school's own questions on this topic (${shown.length})
These show the SKILL and the LEVEL. They are not templates. Your question keeps the skill
and changes at least two of: the situation, the direction asked, what is given and what is
found, the representation, the shape. Do not reuse their numbers, names or objects.

${real || '(none on this topic in the two papers)'}
`;
}

// The solver's scope comes from the plan (`solver_scope`, e.g. "lower-secondary methods" or
// "O-Level Additional Mathematics methods"), never from a hard-coded level — 20 Sep 2026,
// the brief used to say "girls' school" + "lower-secondary methods" for every school.
const SOLVER_BRIEF = (plan) => { const scope = plan.solver_scope ?? `the methods taught in this school's ${plan.level} course`; return `You are a strong ${plan.level} mathematics student at ${plan.school}, sitting the ${plan.exam} paper. Solve the question below completely and independently, using only ${scope}. Work it fully, then return final answers. Give exact answers where the question asks for them; otherwise 3 significant figures, money to the nearest cent. For a "show that" part answer "shown" only if you completed the argument and the target is true. For an explain part, write the one or two sentences you would write. If a part cannot be done from the information given, is ambiguous, or needs a method beyond ${scope}, say so in "issues" and do not guess.

Return ONE JSON object: {"parts": [{"label": "(a)(i)", "answer": "…", "working": "short"}], "issues": ["…"], "minutes": <how long the whole question took a strong student>}`; };

const MODERATOR_BRIEF = (plan) => `You are the Head of Department moderating ONE question of a new ${plan.school} ${plan.level} ${plan.exam} paper before it is printed. You have the question with the setter's key and solution, the school's standard, the school's own real questions on the topic, and an independent blind solve.

Judge, in this order:
1. KEY: compare the setter's answer with the blind solve part by part. Equivalent forms agree. Where they differ, work it yourself and say who is right.
2. SCOPE: is every step inside the scope in the standard? A method from outside it fails the question.
3. MARKS: does each part deserve its marks (1 = one step, 2 = method and answer, 3 = two ideas, 4 = a short chain)?
4. DIFFERENT: set it beside each real question shown. Is it the same question with the numbers, names or units changed, or the same figure with new lengths? If so name it in "too_close_to". The same skill asked from a new direction or in a new situation is what is wanted.
5. DIFFICULTY: would this sit naturally in the school's 2025 paper at the same position: "easier", "same", "slightly harder" or "too hard"? Only "same" and "slightly harder" pass.
6. WORDING: the school's register, Singapore setting, units, accuracy instruction, marks in brackets, nothing ambiguous, the figure description complete and not giving away an answer.

Return ONE JSON object: {"parts": [{"label": "(a)", "agree": true, "note": ""}], "all_agree": true, "in_scope": true, "marks_fair": true, "too_close_to": null, "difficulty": "same", "score": 1-5, "problems": ["specific, fixable"], "accept": true}
"score" is the wording and craft, 5 = could be printed as it is. "accept" is true only when all_agree, in_scope, marks_fair, too_close_to is null, difficulty is "same" or "slightly harder", and score is at least 4.`;

async function brief() {
  if (!KEY || !RUN) throw new Error('--key <school key> and --run <dir> required');
  const schoolDir = join(HERE, 'schools', KEY);
  const plan = JSON.parse(readFileSync(join(schoolDir, 'plan.json'), 'utf8'));
  const standard = readFileSync(join(schoolDir, 'standard.md'), 'utf8');
  const sum = plan.slots.reduce((a, s) => a + s.target, 0);
  if (sum !== plan.total) throw new Error(`slots sum to ${sum}, the paper is ${plan.total}`);
  for (const s of plan.slots) if (s.parts.reduce((a, b) => a + b, 0) !== s.target) throw new Error(`Q${s.pos}: parts do not sum to ${s.target}`);
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL + SUPABASE_SECRET_KEY missing (or the bot .env fallback)');
  const levels = plan.corpus_levels ?? [plan.level];
  const rows = await fetchRows(env, `level=in.(${levels.join(',')})`);
  const corpus = rows.map((r) => {
    const own = r.school === plan.school;
    return { id: r.id, own, ref: `${own ? 'this school' : 'another school'} ${r.level} ${r.year} ${r.exam_type} P${r.paper} Q${r.question_number}`, topics: r.topics ?? [], total_marks: r.total_marks, has_image: r.has_image, level: r.level, exam: r.exam_type, year: r.year, qn: qn(r), text: bankText(r) };
  }).filter((r) => r.text.length >= 30);
  const own = corpus.filter((r) => r.own && r.level === plan.level && r.exam === plan.exam).sort((a, b) => b.year - a.year || a.qn - b.qn);
  if (!own.length) throw new Error('the school has no real papers in the bank for that level and exam');
  const topicList = [...new Set(rows.filter((r) => r.level === plan.level).flatMap((r) => r.topics ?? []))].sort();
  log(`${rows.length} bank rows (${levels.join(', ')}) · ${own.length} of the school's own · ${topicList.length} topic names`);

  const dir = resolve(RUN);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'author-brief.md'), authorBrief(plan, standard, topicList));
  writeFileSync(join(dir, 'standard.md'), standard);
  writeFileSync(join(dir, 'paper-so-far.md'), '# Already in this paper\n\n- (none yet)\n');
  const exemplars = {};
  const outline = plan.slots.map((s) => `Q${s.pos} (${s.target}) ${s.topics.join(', ')}`).join(' · ');
  for (const s of plan.slots) {
    // the model year's question at this position first, then every own question sharing a topic
    const shown = own.filter((r) => r.topics.some((t) => s.topics.includes(t)))
      .sort((a, b) => (b.year === plan.model_year && b.qn === s.pos) - (a.year === plan.model_year && a.qn === s.pos)).slice(0, 5);
    exemplars[s.pos] = shown.map((r) => ({ id: r.id, ref: r.ref }));
    const note = `**The whole paper, so that you do not stray into another slot's ground:** ${outline}\n`;
    writeFileSync(join(dir, `Q${s.pos}.brief.md`), slotBrief(plan, s, shown, note));
  }
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus.map(({ id, own, ref, topics, text }) => ({ id, own, ref, topics, text }))));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ...plan, prompt_version: PROMPT_VERSION, generated_at: new Date().toISOString(), topicList, exemplars }, null, 1));
  console.log(dir);
}

// ------------------------------------------------------------- check ----
function refreshPaperSoFar(dir, plan) {
  const lines = [];
  for (const s of plan.slots) {
    const f = join(dir, `Q${s.pos}.json`), g = join(dir, `Q${s.pos}.gates.json`);
    if (!existsSync(f) || !existsSync(g) || !JSON.parse(readFileSync(g, 'utf8')).pass) continue;
    const q = readJsonLoose(f);
    const ctx = String(q.stem || q.parts?.[0]?.text || '').replace(/\$[^$]*\$/g, '…').replace(/\s+/g, ' ').slice(0, 140);
    lines.push(`- Q${s.pos} (${s.target} marks): ${(q.skills ?? []).join('; ')} — ${ctx}`);
  }
  writeFileSync(join(dir, 'paper-so-far.md'), `# Already in this paper (do not reuse a setting, a name or a skill)\n\n${lines.length ? lines.join('\n') : '- (none yet)'}\n`);
}

function check() {
  if (!RUN) throw new Error('--run <dir> required');
  const dir = resolve(RUN);
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const corpus = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).map((r) => ({ ...r, g: grams(r.text) }));
  const standard = readFileSync(join(dir, 'standard.md'), 'utf8');
  const out = [];
  for (const s of SLOTS ? plan.slots.filter((x) => SLOTS.includes(x.pos)) : plan.slots) {
    const f = join(dir, `Q${s.pos}.json`);
    if (!existsSync(f)) { out.push({ pos: s.pos, pass: false, problems: ['Q.json missing'] }); continue; }
    let q;
    try { q = readJsonLoose(f); } catch (e) { out.push({ pos: s.pos, pass: false, problems: [`invalid JSON: ${e.message}`] }); continue; }
    const problems = [];
    const lv = q.parts?.length ? leaves(q.parts) : [{ marks: Number(q.total_marks) || 0, text: q.stem ?? '' }];
    const got = lv.map((x) => x.marks);
    if (got.join(',') !== s.parts.join(',')) problems.push(`part marks ${got.join(',')} ≠ the slot's ${s.parts.join(',')}`);
    if (!Array.isArray(q.topics) || !q.topics.length) problems.push('topics missing');
    else for (const t of q.topics) if (!plan.topicList.includes(t)) problems.push(`topic "${t}" is not a bank name`);
    if (!Array.isArray(q.skills) || !q.skills.length) problems.push('skills missing');
    if (!q.solution || String(q.solution).length < 40) problems.push('no worked solution');
    if (lv.some((x, i) => !String((q.parts?.length ? flatAnswers(q.parts) : [q.answer])[i] ?? '').trim())) problems.push('a part has no answer');
    if (!!q.needs_figure !== !!s.figure) problems.push(s.figure ? 'the slot carries a figure: needs_figure + figure_description required' : 'the slot has no figure');
    if (q.needs_figure && String(q.figure_description ?? '').length < 60) problems.push('figure_description too thin to draw from');
    const text = questionText(q);
    if (text.length < 40) problems.push('question text too short');
    const g = grams(text);
    let near = { s: 0, ref: null }, nearOwn = { s: 0, ref: null };
    for (const r of corpus) { const j = jaccard(g, r.g); if (j > near.s) near = { s: j, ref: r.ref }; if (r.own && j > nearOwn.s) nearOwn = { s: j, ref: r.ref }; }
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const novelty = { nearest: near.ref, jaccard: r3(near.s), nearest_own: nearOwn.ref, jaccard_own: r3(nearOwn.s) };
    if (near.s > NOVELTY_MAX) problems.push(`too close to ${near.ref} (trigram Jaccard ${near.s.toFixed(2)})`);
    if (nearOwn.s > NOVELTY_MAX_SCHOOL) problems.push(`too close to the school's own ${nearOwn.ref} (trigram Jaccard ${nearOwn.s.toFixed(2)})`);
    const prevF = join(dir, `Q${s.pos}.gates.json`);
    const prev = existsSync(prevF) ? JSON.parse(readFileSync(prevF, 'utf8')) : {};
    const gates = { pos: s.pos, pass: problems.length === 0, problems, novelty, marks: got.reduce((a, b) => a + b, 0), checked_at: new Date().toISOString(), rounds: (prev.rounds ?? 0) + 1 };
    writeFileSync(prevF, JSON.stringify(gates, null, 1));
    if (gates.pass) {
      const shown = q.needs_figure ? `${text}\n\n[The diagram, described in words — the printed paper shows it as a figure: ${String(q.figure_description).trim()}]` : text;
      writeFileSync(join(dir, `Q${s.pos}.solve.md`), `${SOLVER_BRIEF(plan)}\n\nWrite your answers to Q${s.pos}.blind.json in this folder. Read no other file.\n\n# QUESTION ${s.pos} (${s.target} marks)\n\n${shown}\n`);
      const ids = (plan.exemplars[s.pos] ?? []).map((e) => e.id);
      const real = corpus.filter((r) => ids.includes(r.id)).map((r) => `[${r.ref}]\n${r.text.slice(0, 1200)}`).join('\n\n');
      writeFileSync(join(dir, `Q${s.pos}.moderate.md`), `${MODERATOR_BRIEF(plan)}\n\nRead Q${s.pos}.blind.json in this folder for the blind solve, then write Q${s.pos}.verdict.json there.\n\n# THE SLOT\nQ${s.pos}, ${s.target} marks, parts ${s.parts.join(', ')}. ${s.content}\nNearest wording in the bank: ${novelty.nearest} @ ${novelty.jaccard}; nearest of the school's own: ${novelty.nearest_own} @ ${novelty.jaccard_own}.\n\n# THE QUESTION\n${shown}\n\n# SETTER'S KEY\n${q.answer ?? ''}\n\n# SETTER'S SOLUTION\n${q.solution}\n\n# SETTER'S NOTES\nskills: ${(q.skills ?? []).join('; ')}\nscope: ${q.scope_check ?? ''}\noriginality: ${q.originality_note ?? ''}\n\n# THE SCHOOL'S REAL QUESTIONS ON THIS TOPIC\n${real || '(none)'}\n\n# THE STANDARD\n${standard}\n`);
    }
    out.push(gates);
    log(`Q${s.pos} ${gates.pass ? '✓' : '✗'} ${gates.pass ? `nearest own ${novelty.nearest_own} @ ${novelty.jaccard_own}` : problems.join('; ')}`);
  }
  refreshPaperSoFar(dir, plan);
  console.log(JSON.stringify(out));
}
function flatAnswers(parts) {
  const out = [];
  const walk = (list) => { for (const p of (list ?? []).filter(Boolean)) { const kids = p.subparts ?? p.parts; if (kids?.length) walk(kids); else out.push(p.answer); } };
  walk(parts);
  return out;
}

// ---------------------------------------------------------- assemble ----
function assemble() {
  if (!RUN) throw new Error('--run <dir> required');
  const dir = resolve(RUN);
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const questions = plan.slots.map((s) => {
    const read = (suffix) => { const f = join(dir, `Q${s.pos}.${suffix}`); return existsSync(f) ? readJsonLoose(f) : null; };
    const q = read('json'), gates = read('gates.json'), verdict = read('verdict.json'), blind = read('blind.json');
    const accepted = !!(q && gates?.pass && verdict?.all_agree === true && verdict?.in_scope !== false && verdict?.marks_fair !== false && !verdict?.too_close_to
      && ['same', 'slightly harder'].includes(verdict?.difficulty) && Number(verdict?.score) >= 4);
    return { pos: s.pos, topic: s.topics[0], target: s.target, accepted, question: accepted ? q : null, draft: accepted ? null : q, gates, blind, verdict };
  });
  const ok = questions.filter((x) => x.accepted);
  const lv = ok.flatMap((x) => (x.question.parts?.length ? leaves(x.question.parts) : [{ marks: x.target, text: x.question.stem }]));
  const count = (n) => lv.filter((u) => (n === 4 ? u.marks >= 4 : u.marks === n)).length;
  const shape = {
    questions: ok.length, marks: ok.reduce((a, x) => a + x.target, 0), figures: ok.filter((x) => x.question.needs_figure).length,
    answer_units: lv.length, units_1: count(1), units_2: count(2), units_3: count(3), units_4plus: count(4),
    reason_units: lv.filter((u) => REASON.test(u.text)).length, show_units: lv.filter((u) => SHOW.test(u.text)).length,
    no_calculator_units: ok.filter((x) => NOCALC.test(questionText(x.question))).length,
    minutes_blind: ok.reduce((a, x) => a + (Number(x.blind?.minutes) || 0), 0),
    difficulty: Object.fromEntries(['same', 'slightly harder'].map((d) => [d, ok.filter((x) => x.verdict.difficulty === d).length])),
  };
  writeFileSync(join(dir, 'paper-shape-report.json'), JSON.stringify(shape, null, 1) + '\n');
  const paper = {
    key: plan.key, title: plan.title, school: plan.school, level: plan.level, exam: plan.exam, prompt_version: plan.prompt_version,
    shape: { subject: 'Mathematics', duration: plan.duration, level: plan.level },
    front: { note: plan.subtitle_note, instructions: plan.instructions, formulae: plan.formulae ?? [] }, // formulae: [[head, body|null], …] as export-docx.py prints them; [] = no formulae page
    layout: { page_per_question: plan.page_per_question === true }, // export-docx.py: a fresh page per question
    total: plan.total, generated_at: plan.generated_at, assembled_at: new Date().toISOString(), questions,
  };
  const jsonPath = join(dir, `${plan.key}.json`);
  writeFileSync(jsonPath, JSON.stringify(paper, null, 1) + '\n');
  log(`${ok.length}/${questions.length} accepted · ${shape.marks} marks · ${shape.answer_units} parts (${shape.units_1}/${shape.units_2}/${shape.units_3}/${shape.units_4plus}) · ${shape.reason_units} explain · ${shape.show_units} show · blind solve ${shape.minutes_blind} min`);
  const waiting = questions.filter((x) => !x.accepted).map((x) => `Q${x.pos}`);
  if (waiting.length) log(`not accepted: ${waiting.join(', ')}`);
  console.log(JSON.stringify({ json: jsonPath, ok: ok.length, shape }));
}

const modes = { brief, check, assemble };
if (!modes[MODE]) { console.error(`unknown mode ${MODE}; use brief | check | assemble`); process.exit(2); }
Promise.resolve().then(() => modes[MODE]()).catch((e) => { console.error(e); process.exit(1); });
