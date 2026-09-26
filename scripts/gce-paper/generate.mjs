#!/usr/bin/env node
// Generate ONE genuinely new exam paper in the SEAB national-exam shape — the
// deterministic half. Every model call is made by a Claude Code agent under the
// plan (never the API): this script writes the briefs the agents follow, runs the
// gates on what they write back, and renders the paper.
//
//   node scripts/gce-paper/generate.mjs brief    --key GCE-AM-P1 --seed 1      → run dir + Q<n>.brief.md
//   node scripts/gce-paper/generate.mjs check    --run <dir> [--slots 1,2,3]    → gates on Q<n>.json, writes Q<n>.solve.md / Q<n>.moderate.md
//   node scripts/gce-paper/generate.mjs assemble --run <dir> [--pdf-dir <dir>]  → paper JSON + PDFs
//
// The round for one slot (orchestrated by the session, see docs/GCE-PAPER.md):
//   1. PLAN     the GCE-* blueprint (data/paper-blueprints.json, derived from the real
//               GCE papers) walked with the prelim builder's own walkTopics/targetMarks
//               → one topic and one mark target per slot.                    [brief]
//   2. AUTHOR   a Claude Opus agent reads Q<n>.brief.md + paper-so-far.md +
//               earlier-sets.md (every question our own earlier Sets asked — the
//               variety rule) and writes Q<n>.json — a NEW question in SEAB register
//               that names the skills it tests; real GCE questions on the topic are
//               shown as STYLE anchors only.                                 [agent]
//   3. GATES    marks sum, bank topic names, worked solution present, skills named,
//               word-trigram Jaccard against every real GCE question of the level
//               AND every question of our own earlier Sets (a disguised copy of
//               either fails).                                                 [check]
//   4. SOLVE    a FRESH Claude Opus agent reads ONLY Q<n>.solve.md (no key) and
//               writes Q<n>.blind.json.                                              [agent]
//   5. MODERATE a Claude Opus agent reads Q<n>.moderate.md (question + key + the
//               exemplars) and Q<n>.blind.json, compares part by part, scores "reads
//               like SEAB" 1–5, names a re-skinned exemplar or a repeat of an earlier
//               Set's question (repeats_set), as good as Set 1 (as_good_as_set1)
//               → Q<n>.verdict.json.                                          [agent]
//   6. REPAIR   a failing slot goes back to an Opus agent with the verdict (Q<n>.json
//               rewritten), then 3–5 again; three strikes → the slot is left out.
//   7. RENDER   the paper (answer key) + a solutions booklet through the SAME
//               renderers /app/print uses.                                 [assemble]
// Bank reads need SUPABASE_URL + SUPABASE_SECRET_KEY in the environment; when absent
// the script falls back to the bot repo's .env (SUPABASE_SERVICE_KEY_MAIN — the math
// project's key) for local runs. Values are never printed.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { graphPaperMajorPx } from './figure-size.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROMPT_VERSION = 'gce-author-v2'; // v2 (17 Sep 2026): skills[] + the earlier-Sets variety rule
// Who plays each role, recorded in plan.json at `brief` and carried into the assembled
// paper (publish.mjs reads the author to label the bank rows). Adrian, 23 Sep 2026: "use
// the trial split, but change solves blind to opus 5.5" — author, blind solve, repair and
// figures are `model: "opus"`, the moderator is `model: "fable"`. The record is the ALIAS
// (Adrian, 24 Sep 2026: "it will all default to the latest version right?"): Claude Code
// points each alias at the newest model of its family, so nothing here changes when a new
// Opus or Fable ships. On 24 Sep 2026 `opus` = claude-opus-5-5 and `fable` =
// claude-fable-5-1 (read from the agents' own transcripts); the paper's generated_at says
// when it was written. Until 23 Sep Fable wrote/moderated/repaired and Opus 5 solved
// blind; a run briefed before that has no `models` in plan.json and keeps the old record
// (MODELS_UNTIL_2026_09_23). A Math Set 2 and E Math Set 2 (23 Sep, every role on Opus 5.5)
// carry their own record in plan.json.
const AGENT = (id) => `${id} (Claude Code agent)`;
const MODELS = { author: AGENT('opus'), solver: AGENT('opus'), moderator: AGENT('fable'), figure: AGENT('opus') };
const MODELS_UNTIL_2026_09_23 = { author: AGENT('claude-fable-5-1'), solver: AGENT('claude-opus-5'), moderator: AGENT('claude-fable-5-1') };
const MATH_SUPABASE_URL = 'https://nempslbewxtlikfzachi.supabase.co';
const NOVELTY_MAX = 0.4; // word-trigram Jaccard above this = a disguised copy

// ---------------------------------------------------------------- CLI ----
const argv = process.argv.slice(2);
const MODE = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'brief';
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const KEY = argOf('--key', 'GCE-AM-P1');
const SEED = Number(argOf('--seed', '1'));
const RUN = argOf('--run', null);
const SLOTS = argOf('--slots', '') ? argOf('--slots', '').split(',').map(Number) : null;
const OUT_ROOT = argOf('--out', join(ROOT, 'data', 'gce-generated'));
const PDF_DIR = argOf('--pdf-dir', null);
// The Set number the paper is filed under (lib/print-sets setPaperTitle);
// defaults to the seed, as the skill says, but a re-written seed keeps its set.
const SET = Number(argOf('--set', String(SEED)));
const log = (...a) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

// ---------------------------------------------------------------- env ----
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
      if (b.SUPABASE_SERVICE_KEY_MAIN) {
        out.SUPABASE_SECRET_KEY = b.SUPABASE_SERVICE_KEY_MAIN;
        out.SUPABASE_URL = out.SUPABASE_URL || MATH_SUPABASE_URL;
      }
    }
  }
  for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']) out[k] = (out[k] ?? '').trim();
  return out;
}

// ------------------------------------------------ TS libs via esbuild ----
// The slot walk + PDF renderers are TypeScript under src/lib with '@/…' imports;
// bundle them once into node_modules/.cache so this script reuses the exact code
// /app/print and /admin/prelim-builder run.
async function loadLibs() {
  const cacheDir = join(ROOT, 'node_modules', '.cache', 'gce-paper');
  const entry = join(cacheDir, 'libs.entry.ts');
  const out = join(cacheDir, 'libs.mjs');
  mkdirSync(cacheDir, { recursive: true });
  const exportsSrc = [
    "export { walkTopics, targetMarks, applyPreset, mulberry32, countParts } from '@/lib/prelim-builder';",
    "export { renderPaperPDF } from '@/lib/render-paper-pdf';",
    "export { renderSolutionsPDF } from '@/lib/render-solutions-pdf';",
    "export { closeBrowser } from '@/lib/generate-pdf';",
    "export { getTopicsForLevel } from '@/lib/canonical-topics';",
    '',
  ].join('\n');
  const srcs = ['prelim-builder', 'render-paper-pdf', 'render-solutions-pdf', 'generate-pdf', 'katex-inline', 'canonical-topics']
    .map((f) => join(ROOT, 'src', 'lib', `${f}.ts`));
  const newest = Math.max(...srcs.filter(existsSync).map((f) => statSync(f).mtimeMs));
  const stale = !existsSync(out) || statSync(out).mtimeMs < newest || !existsSync(entry) || readFileSync(entry, 'utf8') !== exportsSrc;
  if (stale) {
    writeFileSync(entry, exportsSrc);
    // katex-inline locates KaTeX's assets with require.resolve; esbuild's ESM
    // output shims `require` as `__require`, which has no .resolve unless a real
    // `require` is in scope — so give the bundle one from createRequire.
    const banner = "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);";
    const r = spawnSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=esm', '--packages=external',
      `--alias:@=${join(ROOT, 'src')}`, `--outfile=${out}`, `--banner:js=${banner}`, '--log-level=warning'], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('esbuild bundle failed');
  }
  return import(pathToFileURL(out).href);
}

// ------------------------------------------------------------ helpers ----
function readJsonLoose(path) {
  let t = readFileSync(path, 'utf8').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error(`${path}: no JSON object`);
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch {
    // LaTeX backslashes that are not JSON escapes — double them and retry
    return JSON.parse(t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'));
  }
}
const normLabel = (l) => { const s = String(l ?? '').trim().replace(/^\(|\)$/g, ''); return s ? `(${s})` : ''; };
function partsText(parts, depth = 0) {
  const pad = '  '.repeat(depth);
  return (parts ?? []).map((p) => {
    const head = `${pad}${normLabel(p.label)} ${String(p.text ?? '').trim()} [${p.marks ?? '?'}]`;
    return p.subparts?.length ? `${head}\n${partsText(p.subparts, depth + 1)}` : head;
  }).join('\n');
}
function questionText(q) {
  return [String(q.stem ?? '').trim(), partsText(q.parts)].filter(Boolean).join('\n');
}
function answerKeyLines(parts, rowAnswer) {
  const out = [];
  const walk = (list, prefix) => {
    for (const p of list) {
      const label = p.label ? `${prefix}${normLabel(p.label)}` : prefix;
      if (p.answer && String(p.answer).trim()) out.push(`${label ? `${label} ` : ''}${String(p.answer).trim()}`);
      if (p.subparts?.length) walk(p.subparts, label);
    }
  };
  if (parts?.length) walk(parts, '');
  if (!out.length && rowAnswer && String(rowAnswer).trim()) out.push(String(rowAnswer).trim());
  return out;
}
function sumMarks(q) {
  if (!q.parts?.length) return Number(q.total_marks) || 0;
  const s = (list) => list.reduce((a, p) => a + (p.subparts?.length ? s(p.subparts) : Number(p.marks) || 0), 0);
  return s(q.parts);
}
function grams(text, n = 3) {
  const toks = String(text).toLowerCase()
    .replace(/\\[a-z]+/g, ' ').replace(/[${}^_()\[\]\\|,.;:!?'"“”‘’]/g, ' ')
    .split(/\s+/).filter(Boolean);
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
const refOf = (r) => `GCE ${r.year}${r.exam_type === 'Specimen' ? ' specimen' : ''} P${r.paper} Q${r.qn}`;

// ------------------------------------------------------------- bank ----
async function fetchGceRows(env, level) {
  const cols = 'id,year,paper,question_number,total_marks,topics,question_text,parts,answer,has_image,exam_type';
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = `${env.SUPABASE_URL}/rest/v1/questions?select=${cols}&school=eq.GCE&level=eq.${level}` +
      `&exam_type=in.(GCE,Specimen)&deleted_at=is.null&order=id.asc&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    for (const r of page) {
      rows.push({
        id: r.id, year: r.year, paper: r.paper, exam_type: r.exam_type, total_marks: r.total_marks, topics: r.topics ?? [],
        qn: parseInt(String(r.question_number ?? '').replace(/\D/g, ''), 10),
        text: questionText({ stem: r.question_text, parts: Array.isArray(r.parts) ? r.parts : [] }),
      });
    }
    if (page.length < 1000) break;
  }
  return rows;
}
function pickExemplars(rows, topic, target, pos, cut, paperNo) {
  const onTopic = rows.filter((r) => r.topics.includes(topic) && r.text.length > 40);
  const score = (r) => (r.year >= cut ? 0 : 100) + Math.abs((r.total_marks ?? 0) - target) * 3 + (2030 - r.year) * 0.1;
  const chosen = [];
  const seen = new Set();
  for (const r of [...onTopic].sort((a, b) => score(a) - score(b))) {
    const k = `${r.year}-${r.paper}`;
    if (seen.has(k)) continue;
    seen.add(k); chosen.push(r);
    if (chosen.length >= 5) break;
  }
  const positional = rows.filter((r) => r.paper === paperNo && r.year >= cut && r.qn === pos && r.text.length > 40)
    .sort((a, b) => b.year - a.year).slice(0, 2);
  return { topical: chosen, positional };
}

// ------------------------------------------------------ earlier Sets ----
// Adrian, 17 Sep 2026: "the papers generated say set 1, set 2, set 3, .. should not
// be (too) similar to each other. should aim to test a wide variety of skills".
// Every question our own Sets have already asked (the bank's AdrianMath · Set n rows
// of this level, plus any assembled paper JSON on this machine that is not in the
// bank yet, plus the --companion paper) is put in front of every author and
// moderator, and the novelty gate compares against them as it does against the
// real GCE papers. The paper being (re)written is left out; its sister paper
// (same Set, other paper number) is kept — a Set's two papers must not repeat
// each other either.
// Adrian, 17 Sep 2026, same day: "just make sure the standard is as good as set 1 for
// am and em". Set 1 of each level is the paper he read and approved (A Math: "a math
// set 1 paper was good", 11 Sep 2026; E Math Set 1 published after his read-through,
// 16 Sep 2026). So Set 1 is shown for TWO reasons: what not to repeat, and the
// quality a later Set must reach. Its full text never drops out of earlier-sets.md.
const BENCHMARK_SET = 1;
const BENCHMARK_QUOTE = 'Adrian, 17 Sep 2026 (binding): "just make sure the standard is as good as set 1 for am and em"';
const VARIETY_QUOTE = 'Adrian, 17 Sep 2026 (binding): "the papers generated say set 1, set 2, set 3, .. should not be (too) similar to each other. should aim to test a wide variety of skills"';
async function fetchEarlierSets(env, level, { fam, paperNo, set, companionPath }) {
  const items = new Map();
  const put = (it) => { if (!(it.set === set && it.paper === paperNo) && it.text.length > 20 && !items.has(it.ref)) items.set(it.ref, it); };
  const cols = 'id,exam_type,paper,question_number,total_marks,topics,question_text,parts,gen_meta';
  for (let offset = 0; ; offset += 1000) {
    const url = `${env.SUPABASE_URL}/rest/v1/questions?select=${cols}&school=eq.AdrianMath&level=eq.${level}` +
      `&exam_type=like.Set*&deleted_at=is.null&order=id.asc&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    for (const r of page) {
      const n = Number(String(r.exam_type ?? '').replace(/\D/g, ''));
      const pn = Number(r.paper), pos = parseInt(String(r.question_number ?? '').replace(/\D/g, ''), 10);
      if (!n && n !== 0) continue;
      put({ ref: `Set ${n} P${pn} Q${pos}`, set: n, paper: pn, pos, marks: r.total_marks, topics: r.topics ?? [],
        skills: Array.isArray(r.gen_meta?.skills) ? r.gen_meta.skills : [], source: 'bank',
        text: questionText({ stem: r.question_text, parts: Array.isArray(r.parts) ? r.parts : [] }) });
    }
    if (page.length < 1000) break;
  }
  const local = [];
  const genDir = join(ROOT, 'data', 'gce-generated');
  if (existsSync(genDir)) for (const f of readdirSync(genDir)) if (new RegExp(`^GCE-${fam}-P\\d-seed\\d+.*\\.json$`).test(f)) local.push(join(genDir, f));
  if (companionPath) local.push(resolve(companionPath));
  for (const f of local) {
    let pj; try { pj = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    const n = Number(pj.set ?? pj.seed), pn = Number(pj.paperNo ?? String(pj.key ?? '').split('-P')[1]);
    for (const sl of pj.questions ?? []) {
      const q = sl.question; if (!sl.accepted || !q) continue;
      put({ ref: `Set ${n} P${pn} Q${sl.pos}`, set: n, paper: pn, pos: Number(sl.pos), marks: sl.target, topics: q.topics ?? [sl.topic],
        skills: Array.isArray(q.skills) ? q.skills : [], source: 'local', text: questionText(q) });
    }
  }
  return [...items.values()].sort((a, b) => a.set - b.set || a.paper - b.paper || a.pos - b.pos);
}
const oneLine = (text, n = 170) => { const t = String(text).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const askedAs = (e) => (e.skills.length ? e.skills.join('; ') : oneLine(e.text));
function earlierSetsDoc(earlier, set, paperNo, years = '2024/25') {
  const head = `# Our own earlier Sets — what has already been asked

${VARIETY_QUOTE}

This is Set ${set}, Paper ${paperNo}. Below is every question our own Sets of this level have asked so far${earlier.some((e) => e.set === set) ? ` (including this Set's other paper)` : ''}: ${earlier.length} questions.

THE VARIETY RULE — binding on every setter and moderator
1. No question of this paper may share a SITUATION, a STRUCTURE or a SEQUENCE OF PARTS with any question below. The novelty gate compares word overlap with each of them exactly as it does with the real GCE papers; the moderator names a repeat in "repeats_set" and the slot is rejected.
2. The same TOPIC is expected — a GCE paper covers the syllabus every year. The same SKILL asked the same way is not. Where a topic has been tested before, test a different skill of that topic, or the same skill from another direction (reversed, inside a context, as a proof, read from a graph, with the unknown moved).
3. Across a Set's two papers and across Sets, cover the syllabus's skills WIDELY: where you have a choice, prefer a skill no earlier Set has tested over one that has been.
4. Never trade the standard for variety: the question must still sit at the ${years} standard for its marks, inside the syllabus, in SEAB's register.

THE QUALITY BENCHMARK — Set ${BENCHMARK_SET}
${BENCHMARK_QUOTE}
Set ${BENCHMARK_SET} of this level is the paper the tutor read and approved. It is shown below for two reasons: so that you do not repeat it, and so that you MATCH it. Every question of this paper must be at least as good as the Set ${BENCHMARK_SET} question of similar marks: as demanding for its marks, with numbers as clean, a context that carries real information, parts that build on each other, SEAB's wording, and a key that is exactly right. A question that is different from Set ${BENCHMARK_SET} but thinner, more scaffolded, more contrived or less clean than it is rejected. Different content, the same quality.
`;
  if (!earlier.length) return `${head}\n(No earlier Set of this level exists yet — this is the first. Rules 2–4 still hold inside this paper and between its two papers.)\n`;
  const byTopic = new Map();
  for (const e of earlier) for (const t of e.topics) { if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(e); }
  const topicLines = [...byTopic.keys()].sort().map((t) => `### ${t}\n${byTopic.get(t).map((e) => `- ${e.ref} [${e.marks}] — ${askedAs(e)}`).join('\n')}`).join('\n\n');
  // the file is read by every author and moderator: the by-topic list covers every
  // Set, the full texts only the newest three (the gate still compares against all)
  // plus Set 1, always — it is the quality benchmark
  const allSets = [...new Set(earlier.map((e) => e.set))].sort((a, b) => b - a);
  const newest = [...new Set([...allSets.slice(0, 3), ...allSets.filter((n) => n === BENCHMARK_SET)])];
  const full = earlier.filter((e) => newest.includes(e.set)).map((e) => `### ${e.ref} (${e.marks} marks; ${e.topics.join(', ')})${e.skills.length ? `\nSkills: ${e.skills.join('; ')}` : ''}\n${e.text}`).join('\n\n');
  return `${head}\n## Already tested, by topic\n\n${topicLines}\n\n## Earlier questions in full${newest.length < allSets.length ? ` (Sets ${[...newest].sort((a, b) => a - b).join(', ')} — older Sets are in the list above)` : ''}\n\n${full}\n`;
}

// ------------------------------------------------------------ briefs ----
const SHAPE = {
  AM: {
    subject: 'Additional Mathematics', code: '4049', level: 'AM', exam: 'O-Level', cut: 2021, duration: '2 hours 15 minutes', standardYears: '2024/25',
    scope: 'Quadratic functions, equations and inequalities (incl. nature of roots, simultaneous equations involving one linear and one non-linear equation); surds; indices and logarithms (incl. exponential growth/decay models); polynomials, remainder and factor theorems, partial fractions; binomial theorem for positive integer index; linear law; coordinate geometry of straight lines, perpendicular bisectors, areas of rectilinear figures; equations of circles; plane geometry proofs (angle properties of circles, similar/congruent triangles, tangent-chord theorem, midpoint theorem, intersecting chords); trigonometry (ratios of special angles, graphs of sin/cos/tan and their transformations, identities incl. sec/cosec/cot, addition and double-angle formulae, R-formula, equations, real-world models); differentiation (chain/product/quotient rules, trig/exp/log functions, tangents and normals, increasing/decreasing functions, rates of change, maxima/minima); integration (as reverse of differentiation, standard forms incl. (ax+b)^n, trig, e^x, 1/x, definite integrals, areas between curves and lines); kinematics of a particle in a straight line via calculus. NOT in 4049: vectors, matrices, statistics, complex numbers, integration by parts or substitution, inverse trigonometric functions, series beyond binomial.',
    register: `REGISTER — how SEAB asks
- Plain, exact, economical English. Instructions are imperatives: Find, Show that, Hence, Explain why, Determine, Express, Solve, Sketch, State, Calculate, Verify, Use … to …, Given that …
- Parts are labelled (a), (b), (c), with sub-parts (i), (ii). Every part carries its marks. A single-part question has no labels.
- Precision demands are explicit: "giving your answer in the form $a + b\\sqrt{3}$, where $a$ and $b$ are integers", "correct to 2 decimal places", "in terms of $\\pi$", "in exact form", "in logarithmic form".
- A "Show that"/"Prove that" part states its target exactly; a later part uses it ("Hence …", "Using your answer to part (a) …").
- Contexts are brief and concrete (a coffee machine, a patch of water, a ball thrown upwards), never chatty; units are given; constants are named ("where $k$ is a constant"); the model is stated as a formula.
- "A calculator must not be used in this question." opens a question whose point is exact arithmetic (surds, exact trigonometric values). Otherwise no calculator remark.
- Function notation $\\mathrm{f}(x)$, $\\mathrm{f}'(x)$, $\\frac{dy}{dx}$, $\\int \\ldots \\,dx$; angles in radians unless degrees are stated; a domain such as $0 \\le x \\le 2\\pi$ or $-\\frac{\\pi}{2} \\le \\theta \\le \\frac{\\pi}{2}$ is always stated for a trigonometric equation.
- Marks follow the work: about 1 mark per 1.5 minutes. 1–2 marks: state/verify/one-line deduction. 3–4 marks: one standard routine. 5–7 marks: a multi-step argument. A long closing question of 9–12 marks has 3–5 parts that build on one another.`,
  },
  // 4052 (first examined 2023): both papers 90 marks, 2 h 15 min, calculator allowed on both.
  EM: {
    subject: 'Mathematics', code: '4052', level: 'EM', exam: 'O-Level', cut: 2023, duration: '2 hours 15 minutes', standardYears: '2024/25',
    scope: 'Numbers and their operations (primes, HCF/LCM, squares/cubes/roots, standard form, estimation, significant figures); ratio and proportion (incl. map scales, direct and inverse proportion); percentage (incl. reverse percentage); rate and speed (incl. average speed, conversion of units); financial mathematics (simple and compound interest, hire purchase, money exchange, taxation, utilities bills); algebraic expressions and formulae (expansion, factorisation incl. grouping and quadratic trinomials, algebraic fractions, changing the subject, algebraic identities); functions and graphs (linear, quadratic incl. completed-square and factorised forms, cubic, reciprocal y=a/x and a/x^2, exponential y=ka^x, drawing on a grid from a table of values, gradient of a curve by a tangent, solving equations by drawing a suitable line); equations and inequalities (linear, simultaneous linear, quadratic by factorisation / completing the square / the formula, fractional equations reducing to quadratics, linear inequalities incl. double inequalities, word problems leading to these); set language and notation (union, intersection, complement, subsets, Venn diagrams with numbers of elements); matrices (display of information, addition, scalar multiplication, multiplication of two matrices, interpretation of the product; no inverses); problems in real-world contexts (reading tables and information sheets, making and justifying a decision, estimating a cost or a quantity); angles, triangles and polygons (angle properties of parallel lines, triangles, quadrilaterals and regular polygons; construction with ruler, compasses and protractor: perpendicular bisectors and angle bisectors; scale drawings); congruence and similarity (tests, ratios of lengths, areas and volumes of similar figures and solids); properties of circles (symmetry properties: equal chords, perpendicular from centre, tangents from a point; angle properties: angle at centre, angle in a semicircle, angles in the same segment, opposite angles of a cyclic quadrilateral, tangent-radius; reasons stated); Pythagoras\' theorem and trigonometry (sine, cosine and tangent for acute and obtuse angles, sine and cosine rules, area of a triangle as ½ab sin C, bearings, angles of elevation and depression, simple 3-D problems); mensuration (area of a triangle, parallelogram, trapezium, circle; arc length and sector area with the angle in RADIANS or degrees; surface area and volume of a prism, cylinder, pyramid, cone and sphere; composite solids); coordinate geometry (gradient, length, midpoint is NOT required, equation of a straight line y=mx+c, parallel lines, area of a rectilinear figure by shoelace is NOT required — use base×height or split into triangles); vectors in two dimensions (column vectors, magnitude, position vectors, addition, scalar multiples, collinearity, expressing one vector in terms of others, ratios of areas of triangles with a common height or on the same base); data handling and analysis (tables, bar charts, pie charts, pictograms, line graphs, histograms with equal class widths, dot diagrams, stem-and-leaf, box-and-whisker plots, cumulative frequency curves, median, quartiles, percentiles, range, interquartile range, mean and standard deviation for grouped and ungrouped data, comparing two distributions in context); probability (single events, combined events by possibility diagrams and tree diagrams, with and without replacement, mutually exclusive and independent events). NOT in 4052: calculus, logarithms, surds, the binomial theorem, trigonometric identities, the R-formula, quadratic inequalities, matrices inverses and determinants, vectors in three dimensions, the shoelace formula, the midpoint formula.',
    register: `REGISTER — how SEAB asks (4052)
- Plain, exact, economical English. Instructions are imperatives: Find, Calculate, Work out, Write down, Simplify, Factorise, Expand, Solve, Show that, Explain why, Give a reason, Complete the table, Draw, Describe, Estimate, Express, State.
- Parts are labelled (a), (b), (c), with sub-parts (i), (ii). Every part carries its marks. A 1–3 mark question is often a single unlabelled part.
- A scientific calculator is allowed on BOTH papers. Never write "a calculator must not be used". The paper's rubric already says: non-exact answers to 3 significant figures, angles to 1 decimal place, π = calculator value or 3.142 — so a question states a precision only when it wants something else ("correct to 2 decimal places", "in its simplest form", "in terms of π", "as a fraction in its lowest terms", "in standard form", "to the nearest cent").
- Angles are in DEGREES with the degree sign ($58^\\circ$); a sector angle in radians is stated as "1.8 radians". Bearings are three-figure ($048^\\circ$). Money is dollars and cents ($\\$92.75$).
- Contexts are short, concrete and Singaporean-neutral (a garden fountain, a box of apples, a map of Singapore, a candle business): the situation in one or two sentences, units given, then the parts. Never chatty, never a story.
- "Show that" states its target exactly ("Show that $x^2 - 102x + 1440 = 0$", "Show that $p = 2.5$") and a later part uses it. "Explain why …" / "Give a reason for your answer" / "Is he correct?" parts are worth 1 mark and expect one sentence with a number in it. A circle-properties question says "Give a reason for each step of your working."
- Statistics and probability parts ask for interpretation in context ("By commenting on the means and the standard deviations, compare …", "Explain what this tells you about …").
- Paper 1 (27 short questions, 90 marks): each question tests ONE idea in 1–7 marks, answered in the space provided; the paper walks the syllabus (number, algebra, geometry, statistics interleaved), with the vector and mensuration questions near the end.
- Paper 2 (9 long questions, 90 marks): each question is 8–12 marks in 3–5 parts. Early questions are ALGEBRA MEDLEYS whose parts (a), (b), (c), (d) are separate short problems on different algebra skills. Later ones are one context developed through parts: a graph question (a table of values with two blanks, "On the grid, draw the graph of …", a gradient by a tangent, "By drawing a suitable straight line, solve …"), a trigonometry-on-the-ground question with bearings and a mast, a statistics + probability question over a table or histogram, a circle-properties + circular-measure question, a speed/quadratic question ("Show that … = 0", solve to 2 decimal places, reject a root, interpret), and the last question is a PROBLEM IN A REAL-WORLD CONTEXT: an information sheet (a table of prices, rates or measurements) followed by parts that end in a 5–7 mark "Suggest a suitable … Justify your answer" or "Is it worth …? Show your working" decision.
- Marks follow the work: about 1 mark per 1.5 minutes. 1 mark: read/state/one-line. 2 marks: one routine. 3–4 marks: a short chain. 5–7 marks: a multi-step argument or a decision with working.`,
  },
  // 9758 H2 Mathematics (revised for the 2024 JC1 intake, first examined 2025): two 3-hour
  // papers of 100 marks; Paper 1 pure, Paper 2 = Section A pure (40) + Section B statistics
  // (60). Bank rows sit under level 'JC2'; a Set files under level 'JC' (publish.mjs,
  // lib/print-sets). The difficulty standard is the 2022–2024 sittings (Adrian, 26 Sep 2026:
  // "discount year 2025 because somehow that year was too easy"); 2025 and the 2025 specimen
  // stay in the corpus as syllabus anchors (recurrence sequences, no method of differences).
  JC: {
    subject: 'Mathematics', code: '9758', level: 'JC2', setLevel: 'JC', exam: 'A-Level', cut: 2017, duration: '3 hours', standardYears: '2022–2024',
    additional: 'List of Formulae (MF26)',
    sections: { a: 'Section A: Pure Mathematics [40 marks]', b: 'Section B: Probability and Statistics [60 marks]' },
    // bank topic names that are not in 9758 (the bank's JC list still carries them for old prelims)
    excludeTopics: ['Distributions (Poisson)', 'Mathematical Induction'],
    figures: 'an Argand diagram, a curve sketch with its asymptotes, a region to be rotated, a 3-D configuration for a vector question, a scatter diagram, a normal curve, a tree diagram, a printed table of data',
    notation: 'H2 notation: \\mathrm{f}: x \\mapsto \\ldots, \\mathrm{f}^{-1}, \\mathrm{fg}, column vectors \\begin{pmatrix} 1 \\\\ 2 \\\\ 3 \\end{pmatrix} (also \\mathbf{i}, \\mathbf{j}, \\mathbf{k}), \\mathbf{r} = \\mathbf{a} + \\lambda\\mathbf{b}, \\mathbf{r} \\cdot \\mathbf{n} = d, \\mathbf{a} \\times \\mathbf{b}, z^{*}, \\arg z, \\sum_{r=1}^{n}, u_n and S_n, \\mathrm{N}(\\mu, \\sigma^2), \\mathrm{B}(n, p), \\bar{X}, \\mathrm{H}_0 and \\mathrm{H}_1, \\mathrm{P}(A \\mid B), \\mathrm{e}^{x}.',
    scope: 'PURE MATHEMATICS (all of Paper 1; Section A of Paper 2). Functions: domain and range, one-one functions and inverses (restricting a domain so that an inverse exists; the graph of f^{-1} as the reflection of f in y = x; the domain of f^{-1} is the range of f), composite functions and the condition for fg to exist, repeated composition (f^2, f^{2025}(x) by finding the pattern); NOT (fg)^{-1} = g^{-1}f^{-1}, NOT restricting a domain to make a composite exist. Graphs and transformations: sketching y = (ax+b)/(cx+d) and y = (ax^2+bx+c)/(dx+e) with their asymptotes (vertical, horizontal, oblique), intercepts, turning points and symmetry; y^2 = ax, x^2 = by, the ellipse x^2/a^2 + y^2/b^2 = 1 and the hyperbolas x^2/a^2 - y^2/b^2 = 1, y^2/b^2 - x^2/a^2 = 1; the transformations y = af(x), y = f(x) + a, y = f(x + a), y = f(ax) and combinations described as a SEQUENCE (order matters); the graphs of y = |f(x)|, y = f(|x|) and y = 1/f(x) from y = f(x); simple parametric curves and their sketches. Equations and inequalities: formulating an equation, a system of linear equations (solved on the graphing calculator) or an inequality from a situation; solving an equation exactly or numerically; inequalities f(x)/g(x) > 0 with linear or quadratic f and g by a sign test, never by cross-multiplying; the modulus and |x - a| < b <=> a - b < x < a + b, |x - a| > b <=> x < a - b or x > a + b; solving an inequality from a sketch, and a related inequality by a substitution (x -> |x|, x -> e^x) into one already solved. Sequences and series: a sequence as a function of n, the relation u_n = S_n - S_{n-1}, sequences given by a formula or by a recurrence u_{n+1} = f(u_n) (generating terms, a limit L satisfying L = f(L) when the sequence converges, the behaviour read from a graph or a table), sum and difference of two series, convergence of a series and the sum to infinity, arithmetic and geometric series (nth term, sum to n terms, the condition |r| < 1 for convergence, the sum to infinity), finance and other models built on them (savings with increasing deposits, a loan with monthly interest and repayments, a bouncing ball); NOT the method of differences (removed in the revised 9758 — never set a telescoping sum; a sum whose result is GIVEN may be used for a change of variable), NOT mathematical induction. Vectors: 2-D and 3-D vectors, position, displacement and direction vectors, magnitude, unit vectors, distance between points, collinearity, the ratio theorem (a point dividing a line in a given ratio, midpoints), the scalar product (angle between vectors, a . n-hat as a length of projection, perpendicularity), the vector product (area of a triangle or parallelogram, |a x n-hat| as a perpendicular distance, a normal to a plane); vector and cartesian equations of lines and of planes (r . n = d, r = a + lambda b + mu c, cartesian); the foot of the perpendicular from a point to a line or a plane and the distance, the reflection of a point in a line or a plane; the angle between two lines, a line and a plane, two planes; the relationship between two lines (intersecting, parallel, skew), a line and a plane (meets in a point, lies in it, parallel to it), two planes (the line of intersection); problems in a stated 3-D situation (an aircraft path, a pipeline under a plane of rock); NOT the shortest distance or common perpendicular between two skew lines, NOT triple products. Complex numbers: extending the number system, complex roots of a quadratic, conjugate roots of a polynomial equation with real coefficients (and using them to find unknown real coefficients or the remaining root), modulus, argument (principal, in (-pi, pi]) and conjugate, the four operations in cartesian form, equality of complex numbers (a pair of simultaneous equations in z and w solved by elimination or by comparing real and imaginary parts), the Argand diagram, the geometrical effect of conjugation, negation, addition, subtraction and multiplication by i (a rotation through a right angle); NOT polar or modulus-argument form, NOT exponential form r e^{i theta}, NOT de Moivre, NOT loci. Differentiation: the sign of f\' and f\'\' read from and drawn on a graph, the graph of y = f\'(x) from y = f(x), implicit and parametric differentiation, the nature of stationary points by the first or second derivative test, tangents and normals (including to implicit and parametric curves, and where a tangent meets the curve again or passes through a given point), maxima and minima in a modelled situation (an area, a volume, a cost) with the maximum shown to be one, connected rates of change (a bowl filling, a ladder, a shadow); NOT non-stationary points of inflexion, NOT the second derivative of a parametric curve. Maclaurin series: the standard series for (1+x)^n with rational n, e^x, sin x, cos x, ln(1+x) with their ranges of validity (all in MF26), the first terms of a series by repeated differentiation (also from a differential relation such as dy/dx = k e^x (1 + y^2), differentiating that relation again), by repeated implicit differentiation, or by multiplying and substituting standard series (e^x cos 2x, ln((1+x)/(1-x)), (1+x)^n with a non-integer n, tan^{-1}(sqrt 2 + x) via its derivatives), the series as an approximation (an integral estimated from its first terms, a value of pi or ln 2), small-angle approximations sin x ~ x, cos x ~ 1 - x^2/2, tan x ~ x; NOT the general term. Integration techniques: f\'(x)[f(x)]^n (n = -1 included), f\'(x) e^{f(x)}, sin^2 x, cos^2 x, tan^2 x and products of sines and cosines via the factor formulae, the four standard forms 1/(x^2 + a^2), 1/sqrt(a^2 - x^2), 1/(x^2 - a^2), 1/(a^2 - x^2) (results in MF26), partial fractions, integration by a GIVEN substitution (including a trigonometric one for sqrt(a^2 - x^2)), integration by parts (including ln x, x^2 e^x, e^x sin x by two rounds), a modulus integrand split at its zero; NOT reduction formulae. Definite integrals: the integral as a limit of a sum, area under and between curves and lines (regions below the x-axis, areas against the y-axis, a parametric curve via integral y (dx/dt) dt), volumes of revolution about the x-axis or the y-axis (a cartesian curve, a region between two curves, a spherical cap or a bowl), exact values by hand where asked and numerical values from the graphing calculator otherwise; NOT the volume of revolution of a parametric curve. Differential equations: general and particular solutions of dy/dx = f(x) g(y) by separating variables, including reducing an equation to that form by a GIVEN substitution, second-order equations of the form d^2y/dx^2 = f(x) or a first-order equation in v = dx/dt by direct integration, formulating an equation from a situation (rate of change proportional to the amount, rate in minus rate out, a logistic-type dP/dt = kP(N - P), Newton cooling, a falling parachutist), interpreting the solution and its long-term behaviour, sketching the solution curve. PROBABILITY AND STATISTICS (Section B of Paper 2 only). Probability and counting: the addition and multiplication principles, permutations and combinations, arrangements in a line or a circle with repetition and restrictions (identical objects, objects together, objects separated), selection of committees with conditions; addition and multiplication of probabilities, mutually exclusive and independent events (tested numerically), tables of outcomes, Venn diagrams, tree diagrams and counting methods for probabilities, conditional probability P(A|B) = P(A and B)/P(B), P(A or B) = P(A) + P(B) - P(A and B), games with turns and geometric-series probabilities, probabilities in terms of an unknown n or p. Discrete random variables: a probability distribution from a table, expectation and variance from it, E(aX + b) and Var(aX + b); the binomial distribution B(n, p) as a model with its two conditions stated in context (independent trials, a constant probability), its mean np and variance np(1 - p), probabilities and cumulative probabilities from the graphing calculator, the most likely value, a binomial on top of a binomial (the number of days on which an event happens), the range of p from a modal value; NOT cumulative distribution functions, NOT the Poisson distribution (removed from 9758), NOT the geometric distribution, NOT the normal approximation to the binomial. Normal distribution: N(mu, sigma^2) as a model, the standard normal, probabilities and inverse probabilities from the graphing calculator, the symmetry of the curve (drawn with its main features), finding mu and/or sigma from one or two given probabilities (standardising and solving), E and Var of aX + b and of aX + bY with X and Y independent (the sum of n independent copies X_1 + ... + X_n against the multiple nX; the difference of two totals; a percentage reduction as a scaling), the mass exceeded by a given percentage; NOT the normal approximation to the binomial. Sampling: population and simple random sample, why and how a random sample is taken and what makes one unsuitable, the sample mean as a random variable with E(X-bar) = mu and Var(X-bar) = sigma^2/n, its distribution from a normal population, the Central Limit Theorem for a large sample from any population (n >= 30 as the rule of thumb), unbiased estimates of the population mean and variance from raw data or from summarised data (sum x and sum x^2, or sum (x - a) and sum (x - a)^2). Hypothesis testing: null and alternative hypotheses stated with the parameter defined, the test statistic, critical region and critical value, level of significance and p-value, a test of a population mean from a normal population with known variance or from a large sample (a z-test), one-tail and two-tail tests and the reason for the choice, the conclusion in the context of the question, the assumptions a test needs, the range of a significance level or of a variance consistent with a stated conclusion; NOT the terms Type I and Type II error, NOT a test of the difference of two means, NOT a t-test. Correlation and linear regression: a scatter diagram and what it shows, the product moment correlation coefficient as a measure of linear fit and its interpretation (values near -1, 0 and 1; unaffected by a change of units), the least-squares regression line (the meaning of the residuals and of least squares; y on x, and x on y, and which to use), interpolation and extrapolation and the reliability of an estimate, a square, reciprocal, logarithmic or other transformation to achieve linearity and the choice between candidate models by comparing r; NOT deriving the formulae, NOT r^2 = b_1 b_2, NOT hypothesis tests on r. ASSUMED KNOWLEDGE (O-Level A Math): quadratics and the discriminant, surds, polynomials and partial fractions, binomial theorem for a positive integer index, indices and logarithms, trigonometric identities and the R-formula, the sine and cosine rules, basic differentiation and integration.',
    register: `REGISTER — how SEAB asks (9758)
- Plain, exact, economical English. Every part is an imperative: Find, Show that, Hence (or Hence, or otherwise), Deduce, State, Sketch, Explain (why / whether / how you know / in context), Determine (whether / the possible values), Verify, Use … to …, Write down, Solve, Express, Describe (a sequence of transformations; the set of points; the relationship), Justify your answer, Give a reason, Suggest.
- Parts are (a), (b), (c) with sub-parts (i), (ii); every leaf part carries its marks in [ ]; a 3–6 mark question may be unparted. The parts of a long question BUILD: an early "Show that" prints the result the later parts need, and "Hence", "Using the result in part (b)" or "Use your answer to part (c)(i)" says so.
- Precision is stated when it matters: "giving your answer in exact form", "in the form a + ib where a and b are real numbers", "correct to 3 significant figures", "in terms of p", "to the nearest cent", "correct to 2 decimal places", "as a single simplified fraction"; otherwise the rubric's 3 s.f. applies and nothing is said. "Find exactly", "Find the exact value" and "Solve exactly" forbid a decimal; "Use calculus", "Using calculus", "By integration" and "Show by integration" forbid a calculator read-off; "Do not use a calculator in answering this question." opens a whole question (a complex-number question, an exact-integral question, an exact inequality); "Without using a calculator" opens a part. Section B says "State the distribution you use", "In this question you should state the parameters of any distributions you use", "Define any symbols you use", "Give your conclusion in the context of the question".
- The graphing calculator is assumed. Numerical roots, definite integrals, the regression constants, r, binomial and normal probabilities and inverse-normal values are READ from it and the question asks only for the value — a question that wants the working says so. Where a graph is used to find a solution the candidate sketches it. Unsupported calculator answers earn no method marks, so a 4-mark part is never a single calculator read.
- Notation is the syllabus's: \\mathrm{f}: x \\mapsto \\frac{ax+k}{x-a}, x \\in \\mathbb{R}, x \\neq a; \\mathrm{f}(x), \\mathrm{f}^{-1}, \\mathrm{fg}, \\mathrm{f}^2; \\frac{\\mathrm{d}y}{\\mathrm{d}x}, \\frac{\\mathrm{d}^2y}{\\mathrm{d}x^2}, \\int \\ldots \\,\\mathrm{d}x; \\sum_{r=1}^{n}; u_n and S_n; column vectors and \\mathbf{i}, \\mathbf{j}, \\mathbf{k}; \\mathbf{r} = \\mathbf{a} + \\lambda\\mathbf{b}; \\mathbf{r} \\cdot \\mathbf{n} = d; the cartesian line \\frac{x+2}{3} = \\frac{y-1}{2} = z - 5; z^{*}, |z|, \\arg z; \\mathrm{N}(\\mu, \\sigma^2), \\mathrm{B}(n, p), \\bar{X}, \\mathrm{H}_0: \\mu = 17.3, \\mathrm{P}(A \\mid B). Angles in radians unless degrees are named; \\mathrm{e}^{x}, \\ln x, \\mathrm{i} upright.
- Contexts are brief, concrete and self-contained; they carry the numbers the model needs and nothing more (a pipeline under a river, an ornament cut from a sphere, a parachutist, a roller-coaster loop, savings then a loan, a company's two machines, a swimmer's times, a bird feeder, a quality-control sample). Units are given; constants are named ("where k is a positive constant", "where \\alpha is a constant"). No story, no chattiness, no names beyond one or two.
- Paper 1 opens with 4–6-mark questions (a system of equations, an inequality, a vector fact, a complex-number question, a short sequence question) and climbs to two or three 12–15-mark closers — a differential-equation model, a vector problem in a stated 3-D situation, a finance question on arithmetic and geometric series, a parametric or graph model, a functions question with several parts — with one question that "may require concepts and skills from more than one topic" in a real-world context. Paper 2 Section A is four (occasionally five) pure questions of 6–13 marks; Section B climbs from a 5–6-mark probability or counting starter through binomial, normal, sampling and hypothesis-testing questions to a 12–17-mark closer, usually the regression or the normal-plus-test question, set in a real-world context.
- Section B asks for words as often as numbers: "State, in context, two assumptions needed for X to be well modelled by a binomial distribution", "Explain whether … should use a one-tailed or a two-tailed test", "State hypotheses for the test, defining any parameters you use", "give your conclusion in the context of the question", "Explain whether your estimate is reliable", "Explain what the scatter diagram tells you about the relationship", "Explain whether the 65 members comprise a sample or a population", "Explain why it is reasonable to assume that the two distributions are independent". A 1-mark explain part expects one sentence with the reason in it; a 2-mark one, two distinct points.
- Marks follow the work at about 1.8 minutes a mark (100 marks in 3 hours). 1–2 marks: state / write down / one deduction / one calculator value. 3–4: one standard routine, or a routine with one decision. 5–6: a routine with a decision and a second idea, a model built from the situation, or a proof. 7 or more in ONE part is rare and needs a chain (a differential equation solved from a substitution to a particular solution; a regression model chosen, fitted and used). Marks climb through each paper and through each section.`,
  },
};

function authorBrief(shape, topicList) {
  return `You are a senior setter for the Singapore-Cambridge GCE ${shape.exam ?? 'O-Level'} ${shape.subject} examination (syllabus ${shape.code}). You write NEW examination questions that a candidate, a teacher or a SEAB moderator would accept as genuine in register, structure, difficulty and mark discipline — but every question must be genuinely your own: a new situation, new numbers, a new structure. Never a paraphrase, a re-skin or a "same question, different numbers" of any exemplar you are shown, nor of any past paper you remember.

${shape.register}

CONTENT — ${shape.code} only
${shape.scope}

DISCIPLINE
- The numbers must work out the way examination numbers do: exact answers exact, otherwise 3 significant figures; choose constants so the working is clean. Every "show that" target must be TRUE — derive it yourself before you write it. Every part must be solvable, unambiguously, from what is given.
- A question may span two syllabus topics where SEAB would (a circle question that ends in coordinate geometry; a differentiation question that ends in an integral). Name every topic tested using ONLY these bank names: ${topicList.join(' | ')}.
- Prefer a question that needs no figure. Where the topic truly demands one (${shape.figures ?? 'a plane geometry proof, a circle-properties diagram, a Venn diagram, a box-and-whisker plot, a cumulative frequency curve, a histogram, a solid, a graph grid'}), describe the configuration exactly so the question is answerable from the text alone, and set needs_figure true with a precise figure_description: the configuration, the axis window (x and y ranges), which points are labelled and how, whether the curve's equation is printed on the figure, what is shaded, and that NOTHING the candidate is asked to find or prove appears on it — a separate agent draws the figure from this text alone.
- All mathematics in LaTeX between $…$: \\frac, \\sqrt, ^{ }, \\mathrm{e}^{x}, \\ln, \\lg, \\sin, \\cos, \\tan, \\sec, \\operatorname{cosec}, \\cot, \\pi, \\le, \\ge, ^\\circ, \\frac{dy}{dx}, \\int … \\,dx. No display environments, no \\[ \\], no markdown.${shape.notation ? ` ${shape.notation}` : ''}
- Answer key: the final answer of every part exactly as a marker writes it, and a full worked solution.
- VARIETY. Read earlier-sets.md in this folder: every question our own earlier Sets have asked. Your question must not share a situation, a structure or a sequence of parts with any of them, and where its topic has been tested before it must test a DIFFERENT skill of that topic (or the same skill from another direction). Name what you test in "skills": 1–3 short phrases, each specific enough to tell two questions on one topic apart ("reverse percentage through two successive changes", "discriminant condition for a line to be tangent to a curve" — never just "percentage" or "quadratics").

OUTPUT — write ONE JSON file (no prose, no code fence) of this shape:
{"stem": string, "parts": [{"label": "(a)", "text": string, "marks": int, "answer": string, "subparts": [{"label": "(i)", "text": string, "marks": int, "answer": string}]}], "answer": string, "total_marks": int, "topics": [string], "skills": [string], "needs_figure": bool, "figure_description": string, "solution": string, "syllabus_check": string, "originality_note": string}
"parts" is [] for a single-part question, whose final answer sits in "answer". "subparts" is omitted or [] when a part has none. The marks of the parts (and of the subparts within a part) must sum exactly to total_marks. Inside JSON strings every backslash is doubled (\\\\frac) and a newline is \\n.`;
}

function slotBrief({ shape, paperNo, pos, nSlots, total, target, slot, topic, exemplars, earlier = [], section = null }) {
  const pool = slot.topic_pool;
  const ex = exemplars.topical.map((r, i) => `[${i + 1}] ${refOf(r)} (${r.total_marks} marks; topics: ${r.topics.join(', ')})\n${r.text.slice(0, 1400)}`).join('\n\n');
  const own = earlier.filter((e) => e.topics.includes(topic)).sort((a, b) => b.set - a.set || a.paper - b.paper || a.pos - b.pos).slice(0, 8);
  const ownText = own.map((e) => `- ${e.ref} (${e.marks} marks)${e.skills.length ? ` — skills: ${e.skills.join('; ')}` : ''}:\n${e.text.slice(0, 700)}`).join('\n\n');
  const px = exemplars.positional.map((r) => `- ${refOf(r)} (${r.total_marks} marks; ${r.topics.join(', ')}):\n${r.text.slice(0, 900)}`).join('\n');
  return `# Question ${pos} — ${topic}, ${target} marks

Write question ${pos} of a ${shape.subject} ${shape.code} Paper ${paperNo}: ${total} marks, ${shape.duration}, ${nSlots} questions, marks rising through the paper.${section ? `\n${section}` : ''}

SLOT
- Question ${pos} of ${nSlots}, ${target} marks (in the real papers question ${pos} carried ${slot.marks[0]}–${slot.marks[1]} marks).${slot.parts ? ` Parts: ${slot.parts[0]}–${slot.parts[1]} (1 = a single-part question).` : ''}
- Primary topic: ${topic}.
- Topics the real papers placed at this position (weights): ${pool.map((p) => `${p.topic} ${p.weight}`).join(', ')}. You may pair the primary topic with ONE of these where the question naturally leads there.

ALREADY IN THIS PAPER — read paper-so-far.md in this folder before writing. Do not repeat a context, a structure or a topic already covered (a second question on a topic is only acceptable if it tests a different skill).

OUR OWN EARLIER SETS ON THIS TOPIC — already asked. Test a DIFFERENT skill of ${topic} (or the same skill from another direction); never the same situation, structure or sequence of parts. The full list across all topics is earlier-sets.md.
${ownText || '(none — no earlier Set has a question on this topic)'}

EXEMPLARS — real SEAB questions on this topic. STYLE AND WEIGHT ONLY: your question must not resemble any of them in situation, numbers, unknowns, or the sequence of parts.
${ex || '(no exemplars on file for this topic — rely on the register in the brief)'}

POSITION EXEMPLARS — what question ${pos} looked like in recent papers:
${px || '(none)'}
`;
}

const SOLVER_BRIEF = (shape) => `You are an expert ${shape.exam ?? 'O-Level'} ${shape.subject} (${shape.code}) examiner. Solve the question below completely and independently, exactly as the strongest candidate would. Work it fully in your reasoning, then return only final answers. Be exact where the question demands exact form; otherwise give 3 significant figures. For a "show that"/"prove" part answer "shown" only if you completed the argument and the target is true; if the target is false or the part cannot be done from the given information, say so in issues.
Write ONE JSON file: {"answers": {"<part label, e.g. (a) or (b)(ii), or 'single'>": "<final answer as a marker writes it>"}, "solvable": bool, "issues": ["specific ambiguity / missing information / false target / step that cannot be done — or empty"]}`;

const MODERATOR_BRIEF = (shape, variety = false) => `You are a SEAB moderator for ${shape.exam ?? 'O-Level'} ${shape.subject} (${shape.code}). Two jobs.

1. CHECK THE KEY. An independent examiner solved this question blind (their answers are in the .blind.json file beside this brief). Compare part by part with the setter's key below. Two answers AGREE when mathematically equivalent or differing only in presentation (0.5 vs 1/2; 3\\sqrt{5} vs 6.71 to 3 s.f.; a solution set in another order; "shown" vs "proved"). They DISAGREE when a value, a sign, a root, or an interval differs, or when the examiner reports the part cannot be done. Where they disagree, work the part yourself and say who is right.

2. JUDGE THE QUESTION. Could it sit in the actual GCE paper at the stated position? Register (imperatives, precision demands, part labels, mark discipline), difficulty for the marks, syllabus scope, clarity, examination-clean numbers. Then check it against the exemplars listed below: it must not be a re-skin (same situation/structure with new numbers) of any of them.
Scores: 5 = indistinguishable from a real question; 4 = a real question after a light edit; 3 = recognisably school-made; 2 = wrong weight or scope; 1 = unusable.

${variety ? `
3. VARIETY. The section "OUR OWN EARLIER SETS" below lists questions our own earlier Sets (and this Set's other paper) have already asked on the same topic, and the ones nearest in wording. The same topic is expected; the same SKILL asked the same way is not. If this question shares a situation, a structure or a sequence of parts with one of them, or tests the same skill the same way, set "repeats_set" to that ref (the slot is then rejected) and say in "fixes" which different skill of the topic to test instead. Also check the setter's "skills" phrases are true of the question and specific (not just the topic name); if not, say so in "fixes".
4. AS GOOD AS SET ${BENCHMARK_SET}. ${BENCHMARK_QUOTE}. Set ${BENCHMARK_SET} of this level is the paper the tutor read and approved; its questions are in earlier-sets.md in full. Put this question beside the Set ${BENCHMARK_SET} question(s) of similar marks: is it as demanding for its marks, are its numbers as clean, does its context carry real information, do its parts build, is the wording SEAB's? If it is thinner, more scaffolded, more contrived (a strained context chosen only to be different) or less clean than Set ${BENCHMARK_SET}, score it at most 3, set "as_good_as_set1" to false and say in "fixes" what Set ${BENCHMARK_SET} does that this does not.
` : ''}
Write ONE JSON file: {"parts": [{"label": string, "agree": bool, "note": string}], "all_agree": bool, "key_verdict": "one sentence — who is right where they differ", "score": 1|2|3|4|5, "standard": "at"|"routine"|"below"|"above" ("routine" only where standard.md defines a ROUTINE slot), "fixes": ["specific edits that would raise the score — empty at 5"], "too_close_to": null | "<exemplar ref>",${variety ? ' "repeats_set": null | "<Set ref, e.g. Set 1 P2 Q4>", "as_good_as_set1": bool,' : ''} "why": "one or two sentences"}`;

// ---------------------------------------------------------- brief mode ----
async function brief() {
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL + SUPABASE_SECRET_KEY missing (or the bot .env fallback)');
  const libs = await loadLibs();
  const bp = JSON.parse(readFileSync(join(ROOT, 'data', 'paper-blueprints.json'), 'utf8'));
  const def0 = bp.papers[KEY];
  if (!def0) throw new Error(`no blueprint entry ${KEY}`);
  const fam = KEY.split('-')[1];
  const paperNo = Number(KEY.split('-P')[1]);
  const shape = SHAPE[fam];
  if (!shape) throw new Error(`no SEAB shape brief for family ${fam} (AM, EM and JC)`);
  let def = libs.applyPreset(def0, bp.presets?.standard?.overlay);
  // --companion <paper.json>: the sister paper already generated (P1 when
  // planning P2). SEAB's two papers cover the syllabus between them, so topics
  // that paper already used are down-weighted here (never zeroed — the walk
  // still needs a candidate in every pool) and the untouched ones come forward.
  const companionPath = argOf('--companion', null);
  if (companionPath) {
    const comp = JSON.parse(readFileSync(resolve(companionPath), 'utf8'));
    const used = new Set(comp.questions.flatMap((s) => (s.question ?? s.draft)?.topics ?? []));
    def = { ...def, slots: def.slots.map((sl) => ({ ...sl, topic_pool: sl.topic_pool.map((t) => ({ ...t, weight: used.has(t.topic) ? t.weight * 0.1 : t.weight })) })) };
    log(`companion ${comp.key} seed ${comp.seed}: down-weighting ${used.size} topics it already covers`);
  }
  const rng = libs.mulberry32(SEED);
  const topics = libs.walkTopics(def, rng);
  const targets = libs.targetMarks(def, { difficulty: 'standard' });
  const total = targets.reduce((a, b) => a + b, 0);
  const topicList = [...new Set([
    ...libs.getTopicsForLevel(shape.level).flatMap((c) => c.topics),
    ...def.slots.flatMap((s) => s.topic_pool.map((p) => p.topic)),
  ])].filter((t) => !(shape.excludeTopics ?? []).includes(t));
  // A sectioned paper (H2 Paper 2): the blueprint's section_boundary is the first
  // Section B slot; the shape names the sections. Carried into plan.json for the
  // briefs, the rendered PDF and the DOCX.
  const boundary = Number(def.section_boundary) || null;
  const sections = boundary && shape.sections ? { boundary, ...shape.sections } : null;
  const sectionLine = (pos) => sections
    ? `${sections.a} = questions 1–${boundary - 1}; ${sections.b} = questions ${boundary}–${def.slots.length}. This question is in ${pos < boundary ? 'Section A (pure mathematics only)' : 'Section B (probability and statistics only)'}.`
    : null;
  const plan = def.slots.map((slot, i) => ({ pos: Number(slot.pos), topic: topics[i], target: targets[i], marks: slot.marks, parts: slot.parts ?? null, pool: slot.topic_pool, ...(sections ? { section: Number(slot.pos) < boundary ? 'A' : 'B' } : {}) }));
  log(`plan ${KEY} seed ${SEED}: ` + plan.map((p) => `Q${p.pos} ${p.topic} [${p.target}]`).join(' · '));
  log(`total ${total} · must_appear ${def.must_appear.length}`);

  log(`fetching real GCE ${shape.level} questions for style anchors…`);
  const rows = await fetchGceRows(env, shape.level);
  log(`${rows.length} rows (${rows.filter((r) => r.year >= shape.cut).length} current-syllabus)`);

  log('fetching our own earlier Sets of this level (the variety rule)…');
  const earlier = await fetchEarlierSets(env, shape.setLevel ?? shape.level, { fam, paperNo, set: SET, companionPath });
  log(`${earlier.length} earlier Set questions: ${[...new Set(earlier.map((e) => `Set ${e.set} P${e.paper}`))].join(', ') || 'none'}`);

  const dir = join(OUT_ROOT, 'runs', `${KEY}-seed${SEED}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'earlier-sets.md'), earlierSetsDoc(earlier, SET, paperNo, shape.standardYears));
  writeFileSync(join(dir, 'earlier-sets.json'), JSON.stringify(earlier));
  writeFileSync(join(dir, 'author-brief.md'), authorBrief(shape, topicList) + '\n');
  writeFileSync(join(dir, 'paper-so-far.md'), '# Already in this paper\n\n- (none yet)\n');
  const exemplarIds = {};
  for (const p of plan) {
    const slot = def.slots.find((s) => Number(s.pos) === p.pos);
    const exemplars = pickExemplars(rows, p.topic, p.target, p.pos, shape.cut, paperNo);
    exemplarIds[p.pos] = [...exemplars.topical, ...exemplars.positional].map((r) => ({ id: r.id, ref: refOf(r) }));
    writeFileSync(join(dir, `Q${p.pos}.brief.md`), slotBrief({ shape, paperNo, pos: p.pos, nSlots: plan.length, total, target: p.target, slot, topic: p.topic, exemplars, earlier, section: sectionLine(p.pos) }));
  }
  // the real GCE texts the novelty gate compares against (ids + text only)
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(rows.map((r) => ({ id: r.id, ref: refOf(r), topics: r.topics, text: r.text }))));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({
    key: KEY, seed: SEED, set: SET, variety: true, models: MODELS, earlier_sets: [...new Set(earlier.map((e) => `Set ${e.set} P${e.paper}`))], shape, paperNo, total, sections, prompt_version: PROMPT_VERSION, blueprint_derived_at: bp.source?.gce?.derived_at ?? null,
    generated_at: new Date().toISOString(), topicList, must_appear: def.must_appear, plan, exemplars: exemplarIds,
  }, null, 1));
  console.log(dir);
}

// ---------------------------------------------------------- check mode ----
function refreshPaperSoFar(dir, planJ) {
  const lines = [];
  for (const p of planJ.plan) {
    const f = join(dir, `Q${p.pos}.json`);
    const g = join(dir, `Q${p.pos}.gates.json`);
    if (!existsSync(f) || !existsSync(g)) continue;
    const gates = JSON.parse(readFileSync(g, 'utf8'));
    if (!gates.pass) continue;
    const q = readJsonLoose(f);
    const ctx = String(q.stem || q.parts?.[0]?.text || '').replace(/\$[^$]*\$/g, '…').replace(/\s+/g, ' ').slice(0, 140);
    const sk = Array.isArray(q.skills) && q.skills.length ? ` — SKILLS: ${q.skills.join('; ')}` : '';
    lines.push(`- Q${p.pos} (${p.target} marks): ${(q.topics ?? [p.topic]).join(', ')}${sk} — ${ctx}`);
  }
  writeFileSync(join(dir, 'paper-so-far.md'), `# Already in this paper\n\n${lines.length ? lines.join('\n') : '- (none yet)'}\n`);
}
function check() {
  if (!RUN) throw new Error('--run <dir> required');
  const dir = resolve(RUN);
  const planJ = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const corpus = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'));
  const corpusGrams = corpus.map((r) => ({ ref: r.ref, g: grams(r.text) }));
  const shape = planJ.shape;
  // plans written before 17 Sep 2026 carry no variety flag: their slots are
  // checked as they were written (no skills[], no earlier-Sets comparison).
  const variety = planJ.variety === true;
  const earlierPath = join(dir, 'earlier-sets.json');
  const earlier = variety && existsSync(earlierPath) ? JSON.parse(readFileSync(earlierPath, 'utf8')) : [];
  const earlierGrams = earlier.map((e) => ({ ...e, g: grams(e.text) }));
  const targets = SLOTS ? planJ.plan.filter((p) => SLOTS.includes(p.pos)) : planJ.plan;
  const out = [];
  for (const p of targets) {
    const f = join(dir, `Q${p.pos}.json`);
    if (!existsSync(f)) { out.push({ pos: p.pos, pass: false, problems: ['Q.json missing'] }); continue; }
    let q;
    try { q = readJsonLoose(f); } catch (e) { out.push({ pos: p.pos, pass: false, problems: [`invalid JSON: ${e.message}`] }); continue; }
    const problems = [];
    const marks = sumMarks(q);
    if (marks !== p.target) problems.push(`marks sum ${marks} ≠ slot target ${p.target}`);
    if (!Array.isArray(q.topics) || !q.topics.length) problems.push('topics missing');
    else for (const t of q.topics) if (!planJ.topicList.includes(t)) problems.push(`topic "${t}" is not a bank name`);
    if (!q.solution || String(q.solution).length < 40) problems.push('no worked solution');
    const text = questionText(q);
    if (text.length < 40) problems.push('question text too short');
    const g = grams(text);
    let nearest = { score: 0, ref: null };
    for (const r of corpusGrams) { const s = jaccard(g, r.g); if (s > nearest.score) nearest = { score: s, ref: r.ref }; }
    const novelty = { nearest: nearest.ref, jaccard: Math.round(nearest.score * 1000) / 1000 };
    if (nearest.score > NOVELTY_MAX) problems.push(`too close to ${nearest.ref} (trigram Jaccard ${nearest.score.toFixed(2)})`);
    let nearSets = [];
    if (variety) {
      if (!Array.isArray(q.skills) || !q.skills.length || q.skills.some((k) => String(k).trim().length < 8)) problems.push('skills missing — 1–3 specific phrases naming what the question tests');
      nearSets = earlierGrams.map((e) => ({ e, s: jaccard(g, e.g) })).sort((a, b) => b.s - a.s);
      const top = nearSets[0];
      novelty.nearest_set = top ? top.e.ref : null;
      novelty.jaccard_set = top ? Math.round(top.s * 1000) / 1000 : 0;
      if (top && top.s > NOVELTY_MAX) problems.push(`too close to our own ${top.e.ref} (trigram Jaccard ${top.s.toFixed(2)}) — the variety rule`);
      // the same skill phrase as an earlier Set: not a failure by itself (a phrase can
      // be asked from another direction), but the moderator is told.
      const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const mine = new Set((q.skills ?? []).map(norm));
      novelty.repeated_skills = earlier.filter((e) => e.skills.some((k) => mine.has(norm(k)))).map((e) => e.ref);
    }
    const prev = existsSync(join(dir, `Q${p.pos}.gates.json`)) ? JSON.parse(readFileSync(join(dir, `Q${p.pos}.gates.json`), 'utf8')) : {};
    const gates = { pos: p.pos, pass: problems.length === 0, problems, novelty, marks, checked_at: new Date().toISOString(), rounds: (prev.rounds ?? 0) + 1 };
    writeFileSync(join(dir, `Q${p.pos}.gates.json`), JSON.stringify(gates, null, 1));
    if (gates.pass) {
      // A figure question is unanswerable from the stem alone (a box plot's
      // quartiles, a circle's marked angles live on the diagram), so the solver
      // and the moderator see the drawing described in words. The novelty gate
      // above compared the question text only.
      const shown = q.needs_figure && q.figure_description
        ? `${text}\n\n[The diagram, described in words — the printed paper shows it as a figure: ${String(q.figure_description).trim()}]`
        : text;
      writeFileSync(join(dir, `Q${p.pos}.solve.md`), `${SOLVER_BRIEF(shape)}\n\nWrite your answers to Q${p.pos}.blind.json in this folder.\n\n# QUESTION ${p.pos} (${p.target} marks)\n\n${shown}\n`);
      const exRefs = (planJ.exemplars[p.pos] ?? []).map((e) => e.ref);
      const exText = corpus.filter((r) => exRefs.includes(r.ref)).map((r) => `[${r.ref}]\n${r.text.slice(0, 800)}`).join('\n\n');
      // the moderator's variety evidence: earlier-Set questions on the same topic(s),
      // plus the three nearest in wording whatever their topic
      const sameTopic = earlier.filter((e) => e.topics.some((t) => (q.topics ?? []).includes(t)));
      const nearRefs = nearSets.slice(0, 3).filter((x) => x.s > 0.15).map((x) => x.e.ref);
      const ownShown = earlier.filter((e) => sameTopic.includes(e) || nearRefs.includes(e.ref));
      const ownText = !variety ? '' : `\n\n# SETTER'S NAMED SKILLS\n${(q.skills ?? []).join('; ') || '(none)'}${novelty.repeated_skills?.length ? `\n(the same phrase was used by: ${novelty.repeated_skills.join(', ')})` : ''}\n\n# OUR OWN EARLIER SETS — same topic, and the nearest in wording\n${ownShown.length ? ownShown.map((e) => `[${e.ref}] (${e.marks} marks; ${e.topics.join(', ')})${e.skills.length ? ` skills: ${e.skills.join('; ')}` : ''}\n${e.text.slice(0, 800)}`).join('\n\n') : '(no earlier Set question on this topic)'}`;
      writeFileSync(join(dir, `Q${p.pos}.moderate.md`), `${MODERATOR_BRIEF(shape, variety)}\n\nRead Q${p.pos}.blind.json in this folder for the blind examiner's answers, then write Q${p.pos}.verdict.json there.\n\n# PAPER ${planJ.paperNo}, QUESTION ${p.pos} of ${planJ.plan.length}, ${p.target} MARKS\n\n${shown}\n\n# SETTER'S ANSWER KEY\n${answerKeyLines(q.parts, q.answer).join('\n') || '(none)'}\n\n# SETTER'S WORKED SOLUTION\n${String(q.solution ?? '')}\n\n# EXEMPLARS THE SETTER WAS SHOWN\n${exText}${ownText}\n`);
    }
    out.push(gates);
    log(`Q${p.pos} ${gates.pass ? '✓' : '✗'} ${gates.pass ? `nearest ${novelty.nearest} @ ${novelty.jaccard}` : problems.join('; ')}`);
  }
  refreshPaperSoFar(dir, planJ);
  console.log(JSON.stringify(out));
}

// ------------------------------------------------------- assemble mode ----
// A drawn figure lives beside its draft as Q<n>.figure.svg (written by
// scripts/gce-paper/figure.mjs from Q<n>.figure.json). Embedded as a data URI
// so the rendered PDF needs no file host; the JSON keeps the svg path only.
// Printed size. The print renderer (render-paper-pdf) sizes an <img> at
// naturalWidth x 96/200 CSS px (its sharpness pass for scanned crops), so a
// vector figure prints at nominalWidth x 0.127 mm — the engine's ~600px
// nominal came out at 76 mm, too small to read (Adrian, 16 Sep 2026). The
// nominal width/height (never the viewBox) are rewritten here:
//   - a drawing prints 80 mm wide, 100 mm when it is wide (aspect >= 1.5),
//     never taller than 80 mm (the renderer caps at 300pt; an explicit width
//     against that cap would distort);
//   - a graph-paper grid prints with one major square = 1 cm exactly (the
//     paper's scale is real), uncapped in height — the question starts on a
//     fresh page when it does not fit.
const NATURAL_PER_MM = 200 / 25.4;
// Optional per-figure printed widths, in mm, for a figure Adrian asked to see
// bigger or smaller than the rule below gives: <run>/figure-sizes.json = {"26": 105}.
// export-docx.py reads the same file.
function figureSizes(runDir) {
  const p = resolve(runDir, 'figure-sizes.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

function figureDataUri(runDir, pos) {
  const p = resolve(runDir, `Q${pos}.figure.svg`);
  if (!existsSync(p)) return null;
  let svg = readFileSync(p, 'utf8');
  const askedMm = Number(figureSizes(runDir)[String(pos)]) || 0;
  const specPath = resolve(runDir, `Q${pos}.figure.json`);
  let family = null;
  if (existsSync(specPath)) {
    try { family = JSON.parse(readFileSync(specPath, 'utf8')).family; } catch { /* not a registry figure */ }
  }
  const m = svg.match(/<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/);
  let tall = false;
  if (m) {
    const w = Number(m[1]), h = Number(m[2]);
    let factor;
    if (family === 'graph-paper') {
      const major = graphPaperMajorPx(svg);
      factor = major ? (10 * NATURAL_PER_MM) / major : 1;
      tall = true;
    } else if (askedMm) {
      factor = (askedMm * NATURAL_PER_MM) / w;
    } else {
      // 80 mm wide, 100 mm when wide (aspect >= 1.5), never taller than 80 mm —
      // Adrian, 21 Sep 2026, on EM Set 1: "the diagram can be smaller" (Q18 sheet,
      // Q20 pentagon, Q22 two solids). Was 100 / 120 / 100.
      const targetMm = w / h >= 1.5 ? 100 : 80;
      factor = (targetMm * NATURAL_PER_MM) / w;
      const maxH = 80 * NATURAL_PER_MM;
      if (h * factor > maxH) factor = maxH / h;
    }
    svg = svg
      .replace(/(<svg[^>]*\swidth=")[\d.]+(")/, `$1${Math.round(w * factor)}$2`)
      .replace(/(<svg[^>]*\sheight=")[\d.]+(")/, `$1${Math.round(h * factor)}$2`);
  }
  return { uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, tall };
}

// Counts for the session's whole-paper check. An answer unit is a leaf part, or a
// question with no parts — the same measure the two written standards use.
function paperShape(ok) {
  const units = [];
  for (const s of ok) {
    const q = s.question;
    const walk = (list) => { for (const p of list ?? []) { if (p.subparts?.length) walk(p.subparts); else units.push({ pos: s.pos, marks: Number(p.marks) || 0, text: String(p.text ?? '') }); } };
    if (q.parts?.length) walk(q.parts); else units.push({ pos: s.pos, marks: Number(q.total_marks) || s.target, text: String(q.stem ?? ''), unparted: true });
  }
  const routine = ok.filter((s) => s.verdict?.standard === 'routine');
  return {
    questions: ok.length,
    answer_units: units.length,
    unparted: units.filter((u) => u.unparted).length,
    units_6plus: units.filter((u) => u.marks >= 6).length,
    units_5plus: units.filter((u) => u.marks >= 5).length,
    units_2orless: units.filter((u) => u.marks <= 2).length,
    largest_unit: units.reduce((a, u) => Math.max(a, u.marks), 0),
    printed_targets: units.filter((u) => /\b(show that|prove)\b/i.test(u.text)).length,
    reason_units: units.filter((u) => /\b(explain|give a reason|justify|is (he|she|it) correct)\b/i.test(u.text)).length,
    routine: { slots: routine.map((s) => `Q${s.pos}`), marks: routine.reduce((a, s) => a + s.target, 0) },
    last_standard: ok.length ? ok[ok.length - 1].verdict?.standard ?? null : null,
  };
}

async function assemble() {
  if (!RUN) throw new Error('--run <dir> required');
  const dir = resolve(RUN);
  const planJ = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const questions = planJ.plan.map((p) => {
    const read = (suffix) => { const f = join(dir, `Q${p.pos}.${suffix}`); return existsSync(f) ? readJsonLoose(f) : null; };
    const gates = read('gates.json'), verdict = read('verdict.json'), blind = read('blind.json');
    const q = read('json');
    const accepted = !!(q && gates?.pass && verdict?.all_agree === true && !verdict?.too_close_to && !verdict?.repeats_set && verdict?.as_good_as_set1 !== false && Number(verdict?.score) >= 4);
    return { pos: p.pos, topic: p.topic, target: p.target, accepted, question: accepted ? q : null, draft: accepted ? null : q, gates, blind, verdict, exemplars: planJ.exemplars[p.pos] ?? [] };
  });
  const ok = questions.filter((s) => s.accepted);
  // The same title the app prints once the paper is a Set (lib/print-sets
  // setPaperTitle): "E Math · Set 1 · Paper 1 · O-Level format".
  const level = String(planJ.shape.level ?? '');
  const subjectShort = level === 'AM' ? 'A Math' : /^JC/.test(level) ? 'H2 Mathematics' : 'E Math';
  const title = `${subjectShort} · Set ${SET} · Paper ${planJ.paperNo} · ${/^JC/.test(level) ? 'A-Level' : 'O-Level'} format`;
  const paper = {
    ...planJ, models: planJ.models ?? MODELS_UNTIL_2026_09_23,
    set: SET, title, assembled_at: new Date().toISOString(), questions,
  };
  delete paper.exemplars;
  const stamp = paper.generated_at.slice(0, 10);
  const jsonPath = join(OUT_ROOT, `${planJ.key}-seed${planJ.seed}-${stamp}.json`);
  mkdirSync(OUT_ROOT, { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(paper, null, 1) + '\n');
  log(`${ok.length}/${questions.length} accepted · ${ok.reduce((a, s) => a + s.target, 0)} marks · saved ${jsonPath}`);
  // The whole-paper check (EM standard item 13, AM standard List B) is the session's, at
  // the read-through. These counts are what it needs; nothing here accepts or rejects.
  const shape = paperShape(ok);
  writeFileSync(join(dir, 'paper-shape-report.json'), JSON.stringify(shape, null, 1) + '\n');
  log(`paper shape · ${shape.answer_units} answer units · ${shape.unparted} unparted · ${shape.units_6plus} of 6+ marks (largest ${shape.largest_unit}) · ${shape.units_2orless} of ≤2 marks · ${shape.printed_targets} show/prove · ${shape.reason_units} explain · routine slots ${shape.routine.slots.join(', ') || 'none'} (${shape.routine.marks} marks) · last question: ${shape.last_standard ?? '?'}`);
  const missingMust = planJ.must_appear.filter((t) => !ok.some((s) => s.question.topics.includes(t)));
  if (missingMust.length) log(`⚠ must_appear not covered: ${missingMust.join(', ')}`);
  if (!ok.length) { console.log(JSON.stringify({ json: jsonPath, ok: 0 })); return; }

  const libs = await loadLibs();
  const findPart = (parts, test) => { for (const p of parts ?? []) { if (test(p)) return p; const sub = findPart(p.subparts, test); if (sub) return sub; } return null; };
  const toParts = (parts) => (parts ?? []).map((p) => ({
    // a part that carries subparts prints no bracket of its own — GCE brackets only (i), (ii)
    label: normLabel(p.label), text: String(p.text ?? ''), marks: p.subparts?.length ? null : (p.marks ?? null), answer: p.answer ?? null,
    subparts: p.subparts?.length ? toParts(p.subparts) : null,
  }));
  const pdfQs = ok.map((s) => {
    const q = s.question;
    const figure = figureDataUri(dir, s.pos);
    const stem = q.needs_figure && q.figure_description && !figure
      ? `${String(q.stem ?? '').trim()}\n[Figure to be drawn: ${q.figure_description}]`
      : String(q.stem ?? '').trim();
    const parts = toParts(q.parts);
    // A grid the candidate draws on is printed where the paper says "On the
    // grid" — after that part — not above the question like a diagram.
    const gridPart = figure?.tall ? findPart(parts, (p) => /\bgrid\b/i.test(p.text)) : null;
    if (gridPart) gridPart.image_url_after = figure.uri;
    // H2 Paper 2 prints its two section headings (plan.json `sections`, from the shape)
    const sectionHeading = planJ.sections ? (s.pos === 1 ? planJ.sections.a : s.pos === planJ.sections.boundary ? planJ.sections.b : undefined) : undefined;
    return { qnum: String(s.pos), marks: s.target, stem, images: figure && !gridPart ? [figure.uri] : [], uncappedFigures: figure?.tall === true, missingFigure: false, parts, answerLines: answerKeyLines(q.parts, q.answer), ...(sectionHeading ? { sectionHeading } : {}) };
  });
  const total = ok.reduce((a, s) => a + s.target, 0);
  const metaLine = `${ok.length} questions · ${total} marks · ${planJ.shape.duration}`;
  const pdfDir = PDF_DIR ? resolve(PDF_DIR) : OUT_ROOT;
  mkdirSync(pdfDir, { recursive: true });
  const base = `${planJ.key}-seed${planJ.seed}-${stamp}`;
  const paperPdf = join(pdfDir, `${base}.pdf`);
  writeFileSync(paperPdf, await libs.renderPaperPDF({ title, metaLine, questions: pdfQs, workingSpace: true, answerKey: true, answerKeyColor: '#111', coverageWarning: ok.length < questions.length ? `${questions.length - ok.length} slot(s) did not pass the gates and were left out` : null }));
  const solPdf = join(pdfDir, `${base}-solutions.pdf`);
  writeFileSync(solPdf, await libs.renderSolutionsPDF({
    title: `${title} · Worked solutions`,
    items: ok.map((s) => ({
      qnum: String(s.pos), questionText: questionText(s.question), solution: String(s.question.solution ?? ''),
      answer: answerKeyLines(s.question.parts, s.question.answer).join('; '), parts: toParts(s.question.parts), solutionImages: [],
    })),
  }));
  await libs.closeBrowser();
  console.log(JSON.stringify({ json: jsonPath, ok: ok.length, paperPdf, solPdf }));
}

const modes = { brief, check, assemble };
if (!modes[MODE]) { console.error(`unknown mode ${MODE}; use brief | check | assemble`); process.exit(2); }
Promise.resolve().then(() => modes[MODE]()).catch((e) => { console.error(e); process.exit(1); });
