#!/usr/bin/env node
// Twins — phase 0 (SPEC-TWINS.md §1–9, built 30 Sep 2026).
// A twin is OUR question with the same sub-skill filing, level, part structure,
// marks per part, difficulty and method as one school question — new numbers,
// context and sentences. This script is the deterministic half of the recipe;
// the writing is done by plan-billed Claude Code agents (the `twin-question`
// skill), never the API.
//
//   node scripts/twins/twin.mjs queue   --level EM [--limit 20] [--json]
//   node scripts/twins/twin.mjs brief   --source <uuid> --run <dir>
//   node scripts/twins/twin.mjs check   --run <dir>          (gates → Q1.gates.json, Q1.solve.md, Q1.moderate.md)
//   node scripts/twins/twin.mjs publish --run <dir> [--dry]  (insert/refresh the row, verified=true — every check passed)
//   node scripts/twins/twin.mjs review  --runs <dir> [<dir>…] --out <file.html>
//
// Run dir files: source.json, corpus.json, plan.json, author-brief.md (from brief);
// Q1.json (author); Q1.gates.json / Q1.solve.md / Q1.moderate.md (check);
// Q1.blind.json (blind solver); Q1.verdict.json (moderator);
// Q1.figure.json|.cjs → Q1.figure.svg/.png (scripts/gce-paper/figure.mjs --run <dir> --slots 1).
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MATH_SUPABASE_URL = 'https://nempslbewxtlikfzachi.supabase.co';
const NOVELTY_MAX = 0.4;        // word-trigram Jaccard above this = a disguised copy (gce-paper's bar)
const TWIN_SCHOOL = 'AdrianMath';
const TWIN_EXAM_TYPE = 'Twin';
const BUCKET = 'practice-figures';
const PROMPT_VERSION = 'twin-v1';
const MODELS = { author: 'opus (Claude Code agent)', blind: 'sonnet (Claude Code agent)', moderate: 'opus (Claude Code agent)', figure: 'opus (Claude Code agent)' };
// JC (H2) blind solves on Opus (Adrian, 30 Sep 2026): Sonnet misses more long H2
// working cold, and every miss is a false key alarm for the moderator.
const modelsFor = (level) => (/^JC/.test(String(level ?? '')) ? { ...MODELS, blind: 'opus (Claude Code agent)' } : MODELS);

const argv = process.argv.slice(2);
const MODE = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'queue';
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const log = (s) => console.error(s);

// ------------------------------------------------------------------ env ----
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
  if (!out.SUPABASE_URL || !out.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY missing (.env.local)');
  return out;
}
function sbClient(env) {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}
async function rest(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } });
  if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function restAll(env, path) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await rest(env, `${path}&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

// -------------------------------------------------------------- helpers ----
function readJsonLoose(path) {
  let t = readFileSync(path, 'utf8').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error(`${path}: no JSON object`);
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return JSON.parse(t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); }
}
const normLabel = (l) => { const s = String(l ?? '').trim().replace(/^\(|\)$/g, ''); return s ? `(${s})` : ''; };
const bare = (l) => String(l ?? '').trim().replace(/^\(|\)$/g, '');
function partsText(parts, depth = 0) {
  const pad = '  '.repeat(depth);
  return (parts ?? []).map((p) => {
    const head = `${pad}${normLabel(p.label)} ${String(p.text ?? '').trim()} [${p.marks ?? '?'}]`;
    return p.subparts?.length ? `${head}\n${partsText(p.subparts, depth + 1)}` : head;
  }).join('\n');
}
const questionText = (q) => [String(q.stem ?? q.question_text ?? '').trim(), partsText(q.parts)].filter(Boolean).join('\n');
function sumMarks(q) {
  if (!q.parts?.length) return Number(q.total_marks) || 0;
  const s = (list) => list.reduce((a, p) => a + (p.subparts?.length ? s(p.subparts) : Number(p.marks) || 0), 0);
  return s(q.parts);
}
function grams(text, n = 3) {
  const toks = String(text).toLowerCase().replace(/\\[a-z]+/g, ' ').replace(/[${}^_()\[\]\\|,.;:!?'"“”‘’]/g, ' ').split(/\s+/).filter(Boolean);
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
// the number-swap detector: digits (and decimal points) masked, the sentences compared
const masked = (t) => String(t).toLowerCase().replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
// structure signature: part labels + marks, nested — the twin's must equal the source's
function structure(parts) {
  return (parts ?? []).map((p) => ({ label: bare(p.label), marks: Number(p.marks) || 0, sub: p.subparts?.length ? structure(p.subparts) : [] }));
}
function flatParts(parts, prefix = '') {
  const out = [];
  for (const p of parts ?? []) {
    const label = `${prefix}${normLabel(p.label)}`;
    if (p.subparts?.length) out.push(...flatParts(p.subparts, label));
    else out.push({ label, text: String(p.text ?? ''), marks: Number(p.marks) || 0, answer: p.answer });
  }
  return out;
}
const SHAPE = {
  EM: { subject: 'Elementary Mathematics', code: '4052', tag: 'E Math' },
  AM: { subject: 'Additional Mathematics', code: '4049', tag: 'A Math' },
  S3_EM: { subject: 'Elementary Mathematics (Sec 3)', code: '4052', tag: 'S3 E Math' },
  S3_AM: { subject: 'Additional Mathematics (Sec 3)', code: '4049', tag: 'S3 A Math' },
  S1: { subject: 'Mathematics (Sec 1)', code: 'Sec 1', tag: 'Sec 1' },
  S2: { subject: 'Mathematics (Sec 2)', code: 'Sec 2', tag: 'Sec 2' },
  JC1: { subject: 'H2 Mathematics (JC 1)', code: '9758', tag: 'JC1' },
  JC2: { subject: 'H2 Mathematics', code: '9758', tag: 'JC2' },
};
const shapeOf = (level) => SHAPE[level] ?? { subject: `Mathematics (${level})`, code: level, tag: level };
const runFile = (dir, f) => join(dir, f);
const readIf = (p, loose = false) => (existsSync(p) ? (loose ? readJsonLoose(p) : JSON.parse(readFileSync(p, 'utf8'))) : null);

// ---------------------------------------------------------------- queue ----
async function queue() {
  const env = loadEnv();
  const level = argOf('--level', 'EM');
  const limit = Number(argOf('--limit', '20'));
  const rows = await restAll(env, `twin_queue?select=*&level=eq.${level}&text_len=gt.40&has_any_twin=is.false&order=draws_90d.desc,subgroup.asc,source_id.asc`);
  // most-drawn first; then the rest of the pool grouped by sub-skill, the
  // sub-skills with the most rows first (what students meet most)
  const drawn = rows.filter((r) => r.draws_90d > 0);
  const rest = rows.filter((r) => r.draws_90d === 0 && r.subgroup);
  const bySg = new Map();
  for (const r of rest) bySg.set(r.subgroup, (bySg.get(r.subgroup) ?? 0) + 1);
  // one row per sub-skill per round, the biggest sub-skills first — variety over depth
  const sgs = [...bySg.keys()].sort((a, b) => (bySg.get(b) - bySg.get(a)) || a.localeCompare(b));
  const buckets = new Map(sgs.map((k) => [k, rest.filter((r) => r.subgroup === k).sort((a, b) => String(a.source_id).localeCompare(String(b.source_id)))]));
  const spread = [];
  for (let round = 0; spread.length < rest.length; round++) for (const k of sgs) { const b = buckets.get(k); if (b[round]) spread.push(b[round]); }
  const picked = [...drawn, ...spread].slice(0, limit);
  if (has('--json')) { console.log(JSON.stringify(picked, null, 1)); return; }
  for (const r of picked) console.log(`${r.source_id}  draws ${String(r.draws_90d).padStart(2)}  ${String(r.total_marks).padStart(2)}m  ${r.has_image ? 'fig' : '   '}  ${r.school} ${r.year}  · ${r.topic} › ${r.subgroup ?? '(unfiled)'}`);
  log(`${picked.length} of ${rows.length} untwinned ${level} rows (${drawn.length} drawn in 90 days)`);
}

// ---------------------------------------------------------------- brief ----
async function brief() {
  const env = loadEnv();
  const id = argOf('--source', null);
  const dir = resolve(argOf('--run', null) ?? `./twins/${id}`);
  if (!id) throw new Error('--source <uuid>');
  mkdirSync(dir, { recursive: true });
  const [src] = await rest(env, `questions?select=id,level,school,year,exam_type,paper,question_number,question_text,parts,answer,solution,total_marks,topics,difficulty,has_image,figure_url,image_url,images&id=eq.${id}`);
  if (!src) throw new Error(`no question ${id}`);
  const filing = await rest(env, `question_subgroups?select=subgroup_id,is_primary,confidence,subgroups(id,name,topic,description,level)&question_id=eq.${id}`);
  const subgroups = filing.map((f) => ({ id: f.subgroup_id, is_primary: f.is_primary, name: f.subgroups?.name, topic: f.subgroups?.topic, description: f.subgroups?.description }));
  const shape = shapeOf(src.level);
  // the whole real corpus at this level — the novelty gate compares against every one
  const corpus = (await restAll(env, `questions?select=id,school,year,question_text,parts&level=eq.${src.level}&deleted_at=is.null&ai_generated=not.is.true&order=id.asc`))
    .map((r) => ({ id: r.id, ref: `${r.school} ${r.year}`, text: questionText(r) })).filter((r) => r.text.length > 20);
  // Adrian's method + pitfalls for the topics, as background the author reads (never quoted)
  let knowledge = [];
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/teaching_knowledge`, { method: 'POST', headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_level: src.level, p_topics: src.topics ?? [], p_context: questionText(src).slice(0, 1500), p_methods: 4, p_pitfalls: 4, p_formulae: 0 }) });
    if (r.ok) { const k = await r.json(); knowledge = [...(k?.methods ?? []).map((m) => ({ kind: 'method', title: m.question_type, body: `${m.method}${m.watch_out ? ` Watch out: ${m.watch_out}` : ''}` })), ...(k?.pitfalls ?? []).map((m) => ({ kind: 'pitfall', title: m.context, body: `wrong move: ${m.wrong_move}. ${m.why_wrong ?? ''} ${m.corrective_cue ? `Cue: ${m.corrective_cue}` : ''}` }))]; }
  } catch { /* background only */ }
  const marks = Number(src.total_marks) || sumMarks(src);
  const plan = { source: id, level: src.level, subject: shape.subject, code: shape.code, marks, difficulty: src.difficulty ?? 'Standard', topics: src.topics ?? [], subgroups, structure: structure(src.parts), has_figure: !!(src.has_image || src.figure_url || (src.image_url && src.image_url !== '[]')), prompt_version: PROMPT_VERSION, models: modelsFor(src.level), briefed_at: new Date().toISOString() };
  writeFileSync(runFile(dir, 'source.json'), JSON.stringify(src, null, 1));
  writeFileSync(runFile(dir, 'corpus.json'), JSON.stringify(corpus));
  writeFileSync(runFile(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  const flat = flatParts(src.parts);
  const keyLines = flat.length ? flat.map((p) => `${p.label} [${p.marks}] → ${p.answer ?? '(no answer on file)'}`).join('\n') : `(single part, ${marks} marks) → ${src.answer ?? '(no answer on file)'}`;
  const kText = knowledge.length ? knowledge.map((k) => `- (${k.kind ?? k.source ?? 'note'}) ${k.title ?? ''} ${k.body ?? k.text ?? JSON.stringify(k)}`.slice(0, 600)).join('\n') : '(none on file for these topics)';
  const structText = plan.structure.length
    ? plan.structure.map((p) => `(${p.label}) ${p.marks} marks${p.sub.length ? ` = ${p.sub.map((s) => `(${s.label}) ${s.marks}`).join(' + ')}` : ''}`).join('; ')
    : `single part, ${marks} marks`;
  writeFileSync(runFile(dir, 'author-brief.md'), `# Twin of ${src.school} ${src.year} ${src.paper ?? ''} Q${src.question_number ?? '?'} — ${shape.tag}, ${marks} marks

Level: ${src.level} (${shape.subject}, ${shape.code}). Difficulty: ${plan.difficulty}.
Topics (bank names, keep exactly): ${(src.topics ?? []).join(' | ')}
Sub-skill filing (the twin must test exactly these): ${subgroups.map((s) => `${s.name}${s.is_primary ? ' (primary)' : ''}${s.description ? ` — ${s.description}` : ''}`).join('; ') || '(unfiled — test what the source tests)'}
Structure to reproduce exactly: ${structText}
Figure: ${plan.has_figure ? 'the source HAS a diagram — the twin needs one too; describe it in figure_description exactly (every given length/angle/label) so a figure author can draw it from your words alone' : 'the source has no diagram; the twin must not need one either'}

## THE SOURCE QUESTION (read for its skill, structure and method — then write something else)
${questionText(src)}

Source answer key:
${keyLines}
${src.solution ? `\nSource solution (method only — your twin has its own numbers):\n${String(src.solution).slice(0, 3000)}` : ''}

## Adrian's method notes for these topics (background — teach the same method, never quote these)
${kText}

## OUTPUT
Write ONE JSON file Q1.json in this folder (no prose, no code fence):
{"stem": string, "parts": [{"label": "(a)", "text": string, "marks": int, "answer": string, "subparts": [{"label": "(i)", "text": string, "marks": int, "answer": string}]}], "answer": string, "total_marks": ${marks}, "topics": ${JSON.stringify(src.topics ?? [])}, "difficulty": "${plan.difficulty}", "needs_figure": ${plan.has_figure}, "figure_description": string, "solution": string, "method_note": "one line: the method the source teaches and how your twin teaches the same one", "originality_note": "one line: what is new — context, numbers, sentences"}
"parts" is [] for a single-part question (its final answer sits in "answer"). Labels and marks per part must match the structure above EXACTLY. Inside JSON strings every backslash is doubled (\\\\frac) and a newline is \\n.
`);
  log(`briefed ${id} → ${dir} (${corpus.length} corpus rows, ${subgroups.length} sub-skills, ${knowledge.length} knowledge rows)`);
}

// ---------------------------------------------------------------- check ----
const SOLVER_BRIEF = (shape) => `You are an expert ${shape.subject} (${shape.code}) examiner. Solve the question below completely and independently, exactly as the strongest candidate would. Work it fully in your reasoning, then return only final answers. Be exact where the question demands exact form; otherwise give 3 significant figures. For a "show that"/"prove"/"explain why" part answer "shown" only if you completed the argument and the target is true; if the target is false or the part cannot be done from the given information, say so in issues.
Write ONE JSON file: {"answers": {"<part label, e.g. (a) or (b)(ii), or 'single'>": "<final answer as a marker writes it>"}, "solvable": bool, "issues": ["specific ambiguity / missing information / false target / step that cannot be done — or empty"]}`;

const MODERATOR_BRIEF = (shape) => `You are a SEAB moderator for ${shape.subject} (${shape.code}), and you are checking a TWIN: our own question written to teach the same sub-skill, with the same part structure and marks, as one school's question. Three jobs.

1. CHECK THE KEY. An independent examiner solved the twin blind (Q1.blind.json beside this brief). Compare part by part with the setter's key below. Two answers AGREE when mathematically equivalent or differing only in presentation (0.5 vs 1/2; 3\\sqrt{5} vs 6.71 to 3 s.f.; "shown" vs "proved"). They DISAGREE when a value, a sign, a root or an interval differs, or when the examiner reports the part cannot be done. Where they disagree, work the part yourself and say who is right.

2. IS IT A TWIN, NOT A COPY. Put the twin beside the source (below). It must test the same sub-skill by the same method with the same structure — and it must NOT be the source re-numbered: a new context or situation, new sentences, numbers that are not a constant offset or multiple of the source's. If a candidate who had just done the source would recognise the twin as "the same question with different numbers", set reads_as_source to true (the twin is then rejected).

3. JUDGE THE QUESTION. Could it sit in a school's paper at this level? Register (imperatives, precision demands, part labels, mark discipline), difficulty for the marks, syllabus scope, clarity, examination-clean numbers, and the solution reads in a teacher's voice with the method shown.
Scores: 5 = indistinguishable from a real question; 4 = real after a light edit; 3 = recognisably machine-made; 2 = wrong weight, scope or method; 1 = unusable.

Write ONE JSON file: {"parts": [{"label": string, "agree": bool, "note": string}], "all_agree": bool, "key_verdict": "one sentence — who is right where they differ", "same_skill": bool, "same_method": bool, "reads_as_source": bool, "score": 1|2|3|4|5, "fixes": ["specific edits that would raise the score — empty at 5"], "why": "one or two sentences"}`;

function check() {
  const dir = resolve(argOf('--run', '.'));
  const plan = JSON.parse(readFileSync(runFile(dir, 'plan.json'), 'utf8'));
  const src = JSON.parse(readFileSync(runFile(dir, 'source.json'), 'utf8'));
  const corpus = JSON.parse(readFileSync(runFile(dir, 'corpus.json'), 'utf8'));
  const shape = shapeOf(plan.level);
  const qPath = runFile(dir, 'Q1.json');
  if (!existsSync(qPath)) { console.log(JSON.stringify({ pass: false, problems: ['Q1.json missing'] })); process.exit(1); }
  const q = readJsonLoose(qPath);
  const problems = [];
  const text = questionText(q);
  const srcText = questionText(src);
  // structure
  const want = JSON.stringify(plan.structure), got = JSON.stringify(structure(q.parts));
  if (want !== got) problems.push(`structure differs: want ${want} got ${got}`);
  const marks = sumMarks(q);
  if (marks !== plan.marks) problems.push(`marks ${marks} ≠ ${plan.marks}`);
  if (Number(q.total_marks) !== plan.marks) problems.push(`total_marks ${q.total_marks} ≠ ${plan.marks}`);
  const flat = flatParts(q.parts);
  for (const p of flat) { if (!String(p.answer ?? '').trim()) problems.push(`${p.label} has no answer`); if (!p.text.trim()) problems.push(`${p.label} has no text`); }
  if (!flat.length && !String(q.answer ?? '').trim()) problems.push('single-part question has no answer');
  if (String(q.solution ?? '').trim().length < 40) problems.push('solution missing or too short');
  if (!String(q.stem ?? '').trim() && !flat.length) problems.push('empty question');
  const topics = Array.isArray(q.topics) ? q.topics : [];
  const wantTopics = plan.topics ?? [];
  if (JSON.stringify([...topics].sort()) !== JSON.stringify([...wantTopics].sort())) problems.push(`topics ${JSON.stringify(topics)} ≠ source ${JSON.stringify(wantTopics)}`);
  if (plan.has_figure && !q.needs_figure) problems.push('source has a figure; twin says needs_figure=false');
  if (q.needs_figure && !String(q.figure_description ?? '').trim()) problems.push('needs_figure without figure_description');
  // novelty vs the source and the whole level
  const g = grams(text);
  const vsSource = Number(jaccard(g, grams(srcText)).toFixed(3));
  let nearest = null, nearestS = 0;
  for (const r of corpus) { const s = jaccard(g, grams(r.text)); if (s > nearestS) { nearestS = s; nearest = r.ref; } }
  nearestS = Number(nearestS.toFixed(3));
  if (vsSource > NOVELTY_MAX) problems.push(`too close to the source (trigram Jaccard ${vsSource} > ${NOVELTY_MAX})`);
  if (nearestS > NOVELTY_MAX) problems.push(`too close to ${nearest} (trigram Jaccard ${nearestS} > ${NOVELTY_MAX})`);
  // number swap: the sentences with digits masked
  const numberSwap = masked(text) === masked(srcText);
  if (numberSwap) problems.push('number swap: the twin is the source with its numbers changed');
  // no part's text lifted from the source
  const srcLower = srcText.toLowerCase();
  for (const p of flat) { const t = p.text.trim().toLowerCase(); if (t.length > 25 && srcLower.includes(t)) problems.push(`${p.label} text appears verbatim in the source`); }
  const stem = String(q.stem ?? '').trim().toLowerCase();
  if (stem.length > 25 && srcLower.includes(stem)) problems.push('stem appears verbatim in the source');
  const prev = readIf(runFile(dir, 'Q1.gates.json')) ?? {};
  const gates = { pass: problems.length === 0, problems, novelty: { vs_source: vsSource, nearest, nearest_jaccard: nearestS, max: NOVELTY_MAX, number_swap: numberSwap }, structure: { ok: want === got, marks }, checked_at: new Date().toISOString(), rounds: (prev.rounds ?? 0) + 1 };
  writeFileSync(runFile(dir, 'Q1.gates.json'), JSON.stringify(gates, null, 1));
  if (gates.pass) {
    const shown = q.needs_figure && q.figure_description ? `${text}\n\n[The diagram, described in words — the printed question shows it as a figure: ${String(q.figure_description).trim()}]` : text;
    writeFileSync(runFile(dir, 'Q1.solve.md'), `${SOLVER_BRIEF(shape)}\n\nWrite your answers to Q1.blind.json in this folder.\n\n# QUESTION (${plan.marks} marks)\n\n${shown}\n`);
    const key = flat.length ? flat.map((p) => `${p.label} [${p.marks}] ${p.answer}`).join('\n') : `single: ${q.answer}`;
    writeFileSync(runFile(dir, 'Q1.moderate.md'), `${MODERATOR_BRIEF(shape)}\n\nRead Q1.blind.json in this folder for the blind examiner's answers, then write Q1.verdict.json there.\n\n# THE TWIN (${plan.marks} marks; sub-skill: ${(plan.subgroups ?? []).map((s) => s.name).join('; ') || 'as the source'})\n\n${shown}\n\n## Setter's key\n${key}\n\n## Setter's solution\n${q.solution}\n\n## Setter's notes\nmethod: ${q.method_note ?? ''}\noriginality: ${q.originality_note ?? ''}\n\n# THE SOURCE (${src.school} ${src.year}, ${plan.marks} marks)\n\n${srcText}\n\nSource key:\n${flatParts(src.parts).map((p) => `${p.label} ${p.answer ?? ''}`).join('\n') || src.answer || ''}\n`);
  }
  console.log(JSON.stringify(gates));
  log(`${gates.pass ? '✓' : '✗'} vs source ${vsSource}, nearest ${nearest} @ ${nearestS}${problems.length ? ` — ${problems.join('; ')}` : ''}`);
  process.exit(gates.pass ? 0 : 1);
}

// ------------------------------------------------------------- publish ----
function bankParts(parts) {
  return (parts ?? []).map((p) => {
    const row = { label: bare(p.label), text: String(p.text ?? '').trim(), marks: Number(p.marks) || 0 };
    if (p.answer != null && String(p.answer).trim()) row.answer = String(p.answer).trim();
    if (p.subparts?.length) row.subparts = bankParts(p.subparts);
    return row;
  });
}
function verdictOk(v) {
  return !!v && v.all_agree === true && v.reads_as_source !== true && v.same_skill !== false && v.same_method !== false && Number(v.score) >= 4;
}
async function publish() {
  const env = loadEnv();
  const dir = resolve(argOf('--run', '.'));
  const dry = has('--dry');
  const plan = JSON.parse(readFileSync(runFile(dir, 'plan.json'), 'utf8'));
  const src = JSON.parse(readFileSync(runFile(dir, 'source.json'), 'utf8'));
  const q = readJsonLoose(runFile(dir, 'Q1.json'));
  const gates = readIf(runFile(dir, 'Q1.gates.json'));
  const verdict = readIf(runFile(dir, 'Q1.verdict.json'), true);
  const blind = readIf(runFile(dir, 'Q1.blind.json'), true);
  if (!gates?.pass) throw new Error('gates not passed — run check first');
  if (!verdictOk(verdict)) throw new Error(`verdict refuses: ${JSON.stringify({ all_agree: verdict?.all_agree, reads_as_source: verdict?.reads_as_source, same_skill: verdict?.same_skill, same_method: verdict?.same_method, score: verdict?.score })}`);
  const png = runFile(dir, 'Q1.figure.png');
  if (q.needs_figure && !existsSync(png)) throw new Error('needs_figure but Q1.figure.png is not rendered');
  const figSpec = existsSync(runFile(dir, 'Q1.figure.json')) ? JSON.parse(readFileSync(runFile(dir, 'Q1.figure.json'), 'utf8')) : (existsSync(runFile(dir, 'Q1.figure.cjs')) ? { family: 'engine', file: 'Q1.figure.cjs' } : null);
  const item = `twin-${plan.source}`;
  const storagePath = `twins/${plan.source}.png`;
  const sb = sbClient(env);
  let figureUrl = null;
  if (q.needs_figure) {
    if (!dry) {
      const { error } = await sb.storage.from(BUCKET).upload(storagePath, readFileSync(png), { contentType: 'image/png', upsert: true });
      if (error) throw new Error(`figure upload: ${error.message}`);
    }
    figureUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  }
  const row = {
    question_text: String(q.stem ?? '').trim(),
    answer: q.answer != null && String(q.answer).trim() ? String(q.answer).trim() : null,
    parts: bankParts(q.parts),
    total_marks: plan.marks,
    topics: plan.topics,
    level: plan.level,
    school: TWIN_SCHOOL,
    year: new Date().getFullYear(),
    exam_type: TWIN_EXAM_TYPE,
    paper: null,             // a twin sits in no paper — idx_questions_dedup keys on (school, year, paper, question_number, level, exam_type)
    question_number: null,   // and two sources sharing 'Paper 1 Q5' would collide; the source's paper/Q live in gen_meta.source_ref
    difficulty: plan.difficulty ?? 'Standard',
    has_image: !!figureUrl,
    figure_url: figureUrl,
    image_url: null,
    images: [],
    image_size: 'md',
    verified: true,             // every check passed to get here — that IS the verify (Adrian, 30 Sep 2026: "if they pass the checks consider them verified")
    ai_generated: true,
    twin_of: plan.source,
    solution: q.solution ?? null,
    solution_source: 'opus_session',
    deleted_at: null,
    gen_meta: {
      kind: 'twin', twin_of: plan.source, twin_item: item, prompt_version: PROMPT_VERSION,
      source_ref: { school: src.school, year: src.year, paper: src.paper ?? null, question_number: src.question_number ?? null },
      author_model: (plan.models ?? MODELS).author, blind_model: (plan.models ?? modelsFor(plan.level)).blind, moderate_model: (plan.models ?? MODELS).moderate,
      gates: { novelty: gates.novelty, number_swap: gates.novelty?.number_swap ?? null, structure: gates.structure?.ok ?? null, blind_agree: verdict.all_agree, moderator_score: verdict.score, figure_verify: q.needs_figure ? true : null, rounds: gates.rounds },
      figure: figureUrl ? { family: figSpec?.family ?? null, spec: figSpec, description: q.figure_description ?? null } : null,
      blind_answers: blind?.answers ?? null,
      verdict: { key_verdict: verdict.key_verdict, why: verdict.why, fixes: verdict.fixes ?? [] },
      method_note: q.method_note ?? null, originality_note: q.originality_note ?? null,
      subgroups: (plan.subgroups ?? []).map((s) => s.id),
      generated_at: new Date().toISOString(), verified_at: new Date().toISOString(), verified_by: 'checks',
    },
  };
  if (dry) { console.log(JSON.stringify(row, null, 1)); return; }
  const { data: existing, error: selErr } = await sb.from('questions').select('id').eq('gen_meta->>twin_item', item).limit(1);
  if (selErr) throw new Error(selErr.message);
  let qid;
  if (existing?.length) {
    qid = existing[0].id;
    const { error } = await sb.from('questions').update(row).eq('id', qid);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb.from('questions').insert(row).select('id').single();
    if (error) throw new Error(error.message);
    qid = data.id;
  }
  // the same sub-skill filing as the source — a twin answers to the same shelf
  const filing = (plan.subgroups ?? []).map((s) => ({ question_id: qid, subgroup_id: s.id, is_primary: !!s.is_primary, confidence: 1, source: 'twin', reason: `twin of ${plan.source}` }));
  if (filing.length) {
    const { error } = await sb.from('question_subgroups').upsert(filing, { onConflict: 'question_id,subgroup_id,source' });
    if (error) log(`filing warning: ${error.message}`);
  }
  writeFileSync(runFile(dir, 'published.json'), JSON.stringify({ id: qid, item, at: row.gen_meta.generated_at, figure_url: figureUrl }, null, 1));
  console.log(`${existing?.length ? 'updated' : 'inserted'} ${qid} (twin of ${plan.source}, verified by the checks)`);
}

// -------------------------------------------------------------- review ----
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Display maths ($$…$$ — the bank's tables and stem-and-leaf arrays) keeps its newlines as spaces so <br> never lands inside KaTeX.
const md = (s) => esc(String(s ?? '').replace(/\$\$[\s\S]*?\$\$/g, (m) => m.replace(/\n/g, ' '))).replace(/\n/g, '<br>');
function review() {
  const i = argv.indexOf('--runs');
  const rest_ = i >= 0 ? argv.slice(i + 1) : [];
  const stop = rest_.findIndex((a) => a.startsWith('--'));
  const dirs = (stop >= 0 ? rest_.slice(0, stop) : rest_).map((d) => resolve(d));
  const out = resolve(argOf('--out', 'twins-review.html'));
  const cards = [];
  let n = 0, ok = 0;
  for (const dir of dirs) {
    n++;
    const plan = readIf(runFile(dir, 'plan.json'));
    const src = readIf(runFile(dir, 'source.json'));
    const q = existsSync(runFile(dir, 'Q1.json')) ? readJsonLoose(runFile(dir, 'Q1.json')) : null;
    const gates = readIf(runFile(dir, 'Q1.gates.json'));
    const verdict = readIf(runFile(dir, 'Q1.verdict.json'), true);
    const pub = readIf(runFile(dir, 'published.json'));
    const accepted = !!(gates?.pass && verdictOk(verdict) && pub);
    if (accepted) ok++;
    const fig = existsSync(runFile(dir, 'Q1.figure.png')) ? `<img src="data:image/png;base64,${readFileSync(runFile(dir, 'Q1.figure.png')).toString('base64')}" style="max-width:320px">` : '';
    const srcImg = src?.figure_url ? `<img src="${esc(src.figure_url)}" style="max-width:320px">` : (src?.has_image ? '<em>(source diagram lives in its image)</em>' : '');
    const status = accepted ? '✅ published (verified by the checks)' : !q ? '⛔ no draft' : !gates?.pass ? `✗ gates: ${esc((gates?.problems ?? []).join('; '))}` : !verdictOk(verdict) ? `✗ moderator: score ${verdict?.score ?? '?'}, agree ${verdict?.all_agree}, reads_as_source ${verdict?.reads_as_source} — ${esc(verdict?.why ?? '')}` : '⏳ not published';
    cards.push(`<section class="card ${accepted ? 'ok' : 'no'}"><h2>${n}. ${esc(plan?.subject ?? '')} · ${plan?.marks ?? '?'} marks · ${esc((plan?.subgroups ?? []).map((s) => s.name).join('; '))}</h2>
<p class="status">${status}${verdict ? ` · moderator ${verdict.score}/5` : ''}${gates?.novelty ? ` · Jaccard vs source ${gates.novelty.vs_source}, nearest ${esc(gates.novelty.nearest)} @ ${gates.novelty.nearest_jaccard}` : ''}${pub ? ` · <code>${pub.id}</code>` : ''}</p>
<div class="cols"><div><h3>Source — ${esc(src?.school)} ${src?.year ?? ''}</h3>${srcImg}<div class="q">${md(questionText(src ?? {}))}</div><details><summary>key</summary>${md(flatParts(src?.parts).map((p) => `${p.label} ${p.answer ?? ''}`).join('\n') || src?.answer)}</details></div>
<div><h3>Twin</h3>${fig}<div class="q">${q ? md(questionText(q)) : ''}</div>${q ? `<details><summary>key + solution</summary>${md(flatParts(q.parts).map((p) => `${p.label} ${p.answer ?? ''}`).join('\n') || q.answer)}<hr>${md(q.solution)}</details>` : ''}${verdict ? `<p class="why">${esc(verdict.why ?? '')}${verdict.fixes?.length ? `<br>fixes: ${esc(verdict.fixes.join(' · '))}` : ''}</p>` : ''}</div></div></section>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Twins review</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\\\[',right:'\\\\]',display:true},{left:'$',right:'$',display:false},{left:'\\\\(',right:'\\\\)',display:false}]})"></script>
<style>body{font:15px/1.5 -apple-system,Helvetica,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#222}.card{border:1px solid #ddd;border-radius:10px;padding:14px 18px;margin:18px 0}.card.ok{border-color:#7c9}.card.no{border-color:#e99;background:#fff8f8}.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}.q{white-space:normal;margin:8px 0}h2{font-size:17px;margin:0 0 4px}h3{font-size:14px;color:#666;margin:6px 0}.status{font-size:13px;color:#444}.why{font-size:13px;color:#555;border-left:3px solid #ccc;padding-left:8px}details{font-size:13px;color:#444}@media(max-width:800px){.cols{grid-template-columns:1fr}}</style>
<h1>Twins — ${ok} of ${n} published for your read</h1><p>Every published twin passed every check and sits in the bank verified; Retire on /admin/generated takes one out. Source on the left, our twin on the right.</p>${cards.join('\n')}`;
  writeFileSync(out, html);
  console.log(`${out}: ${ok}/${n} accepted`);
}

const modes = { queue, brief, check, publish, review };
if (!modes[MODE]) { log(`unknown mode ${MODE}`); process.exit(2); }
Promise.resolve(modes[MODE]()).catch((e) => { log(`twin.mjs ${MODE}: ${e.message}`); process.exit(1); });
