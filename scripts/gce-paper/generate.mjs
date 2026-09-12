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
//   2. AUTHOR   a Claude Fable agent reads Q<n>.brief.md + paper-so-far.md and writes
//               Q<n>.json — a NEW question in SEAB register; real GCE questions on the
//               topic are shown as STYLE anchors only.                       [agent]
//   3. GATES    marks sum, bank topic names, worked solution present, word-trigram
//               Jaccard against every real GCE question of the level (a disguised
//               copy fails).                                                   [check]
//   4. SOLVE    a Claude Opus agent reads ONLY Q<n>.solve.md (no key) and writes
//               Q<n>.blind.json.                                              [agent]
//   5. MODERATE a Claude Fable agent reads Q<n>.moderate.md (question + key + the
//               exemplars) and Q<n>.blind.json, compares part by part, scores "reads
//               like SEAB" 1–5, names a re-skinned exemplar → Q<n>.verdict.json. [agent]
//   6. REPAIR   a failing slot goes back to a Fable agent with the verdict (Q<n>.json
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

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROMPT_VERSION = 'gce-author-v1';
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

// ------------------------------------------------------------ briefs ----
const SHAPE = {
  AM: {
    subject: 'Additional Mathematics', code: '4049', level: 'AM', cut: 2021, duration: '2 hours 15 minutes',
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
    subject: 'Mathematics', code: '4052', level: 'EM', cut: 2023, duration: '2 hours 15 minutes',
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
};

function authorBrief(shape, topicList) {
  return `You are a senior setter for the Singapore-Cambridge GCE O-Level ${shape.subject} examination (syllabus ${shape.code}). You write NEW examination questions that a candidate, a teacher or a SEAB moderator would accept as genuine in register, structure, difficulty and mark discipline — but every question must be genuinely your own: a new situation, new numbers, a new structure. Never a paraphrase, a re-skin or a "same question, different numbers" of any exemplar you are shown, nor of any past paper you remember.

${shape.register}

CONTENT — ${shape.code} only
${shape.scope}

DISCIPLINE
- The numbers must work out the way examination numbers do: exact answers exact, otherwise 3 significant figures; choose constants so the working is clean. Every "show that" target must be TRUE — derive it yourself before you write it. Every part must be solvable, unambiguously, from what is given.
- A question may span two syllabus topics where SEAB would (a circle question that ends in coordinate geometry; a differentiation question that ends in an integral). Name every topic tested using ONLY these bank names: ${topicList.join(' | ')}.
- Prefer a question that needs no figure. Where the topic truly demands one (a plane geometry proof, a circle-properties diagram, a Venn diagram, a box-and-whisker plot, a cumulative frequency curve, a histogram, a solid, a graph grid), describe the configuration exactly so the question is answerable from the text alone, and set needs_figure true with a precise figure_description: the configuration, the axis window (x and y ranges), which points are labelled and how, whether the curve's equation is printed on the figure, what is shaded, and that NOTHING the candidate is asked to find or prove appears on it — a separate agent draws the figure from this text alone.
- All mathematics in LaTeX between $…$: \\frac, \\sqrt, ^{ }, \\mathrm{e}^{x}, \\ln, \\lg, \\sin, \\cos, \\tan, \\sec, \\operatorname{cosec}, \\cot, \\pi, \\le, \\ge, ^\\circ, \\frac{dy}{dx}, \\int … \\,dx. No display environments, no \\[ \\], no markdown.
- Answer key: the final answer of every part exactly as a marker writes it, and a full worked solution.

OUTPUT — write ONE JSON file (no prose, no code fence) of this shape:
{"stem": string, "parts": [{"label": "(a)", "text": string, "marks": int, "answer": string, "subparts": [{"label": "(i)", "text": string, "marks": int, "answer": string}]}], "answer": string, "total_marks": int, "topics": [string], "needs_figure": bool, "figure_description": string, "solution": string, "syllabus_check": string, "originality_note": string}
"parts" is [] for a single-part question, whose final answer sits in "answer". "subparts" is omitted or [] when a part has none. The marks of the parts (and of the subparts within a part) must sum exactly to total_marks. Inside JSON strings every backslash is doubled (\\\\frac) and a newline is \\n.`;
}

function slotBrief({ shape, paperNo, pos, nSlots, total, target, slot, topic, exemplars }) {
  const pool = slot.topic_pool;
  const ex = exemplars.topical.map((r, i) => `[${i + 1}] ${refOf(r)} (${r.total_marks} marks; topics: ${r.topics.join(', ')})\n${r.text.slice(0, 1400)}`).join('\n\n');
  const px = exemplars.positional.map((r) => `- ${refOf(r)} (${r.total_marks} marks; ${r.topics.join(', ')}):\n${r.text.slice(0, 900)}`).join('\n');
  return `# Question ${pos} — ${topic}, ${target} marks

Write question ${pos} of a ${shape.subject} ${shape.code} Paper ${paperNo}: ${total} marks, ${shape.duration}, ${nSlots} questions, marks rising through the paper.

SLOT
- Question ${pos} of ${nSlots}, ${target} marks (in the real papers question ${pos} carried ${slot.marks[0]}–${slot.marks[1]} marks).${slot.parts ? ` Parts: ${slot.parts[0]}–${slot.parts[1]} (1 = a single-part question).` : ''}
- Primary topic: ${topic}.
- Topics the real papers placed at this position (weights): ${pool.map((p) => `${p.topic} ${p.weight}`).join(', ')}. You may pair the primary topic with ONE of these where the question naturally leads there.

ALREADY IN THIS PAPER — read paper-so-far.md in this folder before writing. Do not repeat a context, a structure or a topic already covered (a second question on a topic is only acceptable if it tests a different skill).

EXEMPLARS — real SEAB questions on this topic. STYLE AND WEIGHT ONLY: your question must not resemble any of them in situation, numbers, unknowns, or the sequence of parts.
${ex || '(no exemplars on file for this topic — rely on the register in the brief)'}

POSITION EXEMPLARS — what question ${pos} looked like in recent papers:
${px || '(none)'}
`;
}

const SOLVER_BRIEF = (shape) => `You are an expert O-Level ${shape.subject} (${shape.code}) examiner. Solve the question below completely and independently, exactly as the strongest candidate would. Work it fully in your reasoning, then return only final answers. Be exact where the question demands exact form; otherwise give 3 significant figures. For a "show that"/"prove" part answer "shown" only if you completed the argument and the target is true; if the target is false or the part cannot be done from the given information, say so in issues.
Write ONE JSON file: {"answers": {"<part label, e.g. (a) or (b)(ii), or 'single'>": "<final answer as a marker writes it>"}, "solvable": bool, "issues": ["specific ambiguity / missing information / false target / step that cannot be done — or empty"]}`;

const MODERATOR_BRIEF = (shape) => `You are a SEAB moderator for O-Level ${shape.subject} (${shape.code}). Two jobs.

1. CHECK THE KEY. An independent examiner solved this question blind (their answers are in the .blind.json file beside this brief). Compare part by part with the setter's key below. Two answers AGREE when mathematically equivalent or differing only in presentation (0.5 vs 1/2; 3\\sqrt{5} vs 6.71 to 3 s.f.; a solution set in another order; "shown" vs "proved"). They DISAGREE when a value, a sign, a root, or an interval differs, or when the examiner reports the part cannot be done. Where they disagree, work the part yourself and say who is right.

2. JUDGE THE QUESTION. Could it sit in the actual GCE paper at the stated position? Register (imperatives, precision demands, part labels, mark discipline), difficulty for the marks, syllabus scope, clarity, examination-clean numbers. Then check it against the exemplars listed below: it must not be a re-skin (same situation/structure with new numbers) of any of them.
Scores: 5 = indistinguishable from a real question; 4 = a real question after a light edit; 3 = recognisably school-made; 2 = wrong weight or scope; 1 = unusable.

Write ONE JSON file: {"parts": [{"label": string, "agree": bool, "note": string}], "all_agree": bool, "key_verdict": "one sentence — who is right where they differ", "score": 1|2|3|4|5, "fixes": ["specific edits that would raise the score — empty at 5"], "too_close_to": null | "<exemplar ref>", "why": "one or two sentences"}`;

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
  if (!shape) throw new Error(`no SEAB shape brief for family ${fam} yet (AM and EM)`);
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
  ])];
  const plan = def.slots.map((slot, i) => ({ pos: Number(slot.pos), topic: topics[i], target: targets[i], marks: slot.marks, parts: slot.parts ?? null, pool: slot.topic_pool }));
  log(`plan ${KEY} seed ${SEED}: ` + plan.map((p) => `Q${p.pos} ${p.topic} [${p.target}]`).join(' · '));
  log(`total ${total} · must_appear ${def.must_appear.length}`);

  log(`fetching real GCE ${shape.level} questions for style anchors…`);
  const rows = await fetchGceRows(env, shape.level);
  log(`${rows.length} rows (${rows.filter((r) => r.year >= shape.cut).length} current-syllabus)`);

  const dir = join(OUT_ROOT, 'runs', `${KEY}-seed${SEED}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'author-brief.md'), authorBrief(shape, topicList) + '\n');
  writeFileSync(join(dir, 'paper-so-far.md'), '# Already in this paper\n\n- (none yet)\n');
  const exemplarIds = {};
  for (const p of plan) {
    const slot = def.slots.find((s) => Number(s.pos) === p.pos);
    const exemplars = pickExemplars(rows, p.topic, p.target, p.pos, shape.cut, paperNo);
    exemplarIds[p.pos] = [...exemplars.topical, ...exemplars.positional].map((r) => ({ id: r.id, ref: refOf(r) }));
    writeFileSync(join(dir, `Q${p.pos}.brief.md`), slotBrief({ shape, paperNo, pos: p.pos, nSlots: plan.length, total, target: p.target, slot, topic: p.topic, exemplars }));
  }
  // the real GCE texts the novelty gate compares against (ids + text only)
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(rows.map((r) => ({ id: r.id, ref: refOf(r), topics: r.topics, text: r.text }))));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({
    key: KEY, seed: SEED, shape, paperNo, total, prompt_version: PROMPT_VERSION, blueprint_derived_at: bp.source?.gce?.derived_at ?? null,
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
    lines.push(`- Q${p.pos} (${p.target} marks): ${(q.topics ?? [p.topic]).join(', ')} — ${ctx}`);
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
      writeFileSync(join(dir, `Q${p.pos}.moderate.md`), `${MODERATOR_BRIEF(shape)}\n\nRead Q${p.pos}.blind.json in this folder for the blind examiner's answers, then write Q${p.pos}.verdict.json there.\n\n# PAPER ${planJ.paperNo}, QUESTION ${p.pos} of ${planJ.plan.length}, ${p.target} MARKS\n\n${shown}\n\n# SETTER'S ANSWER KEY\n${answerKeyLines(q.parts, q.answer).join('\n') || '(none)'}\n\n# SETTER'S WORKED SOLUTION\n${String(q.solution ?? '')}\n\n# EXEMPLARS THE SETTER WAS SHOWN\n${exText}\n`);
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
function figureDataUri(runDir, pos) {
  const p = resolve(runDir, `Q${pos}.figure.svg`);
  if (!existsSync(p)) return null;
  let svg = readFileSync(p, 'utf8');
  // The print renderer (render-paper-pdf) sizes an <img> at naturalWidth x 96/200
  // CSS px (its sharpness pass for scanned crops) and caps it at 300pt tall. A
  // graph-paper grid the candidate draws on must print as large as that cap
  // allows, so its nominal width/height (never the viewBox) are scaled up until
  // the printed height meets the cap. Every other figure keeps the engine's size.
  const specPath = resolve(runDir, `Q${pos}.figure.json`);
  if (existsSync(specPath)) {
    let family = null;
    try { family = JSON.parse(readFileSync(specPath, 'utf8')).family; } catch { /* not a registry figure */ }
    if (family === 'graph-paper') {
      const m = svg.match(/<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/);
      if (m) {
        const w = Number(m[1]), h = Number(m[2]);
        const CAP_CSS_HEIGHT = 400;           // the renderer's 300pt max-height, in CSS px
        const CSS_PER_NATURAL = 96 / 200;     // the renderer's sharpness ratio
        const factor = Math.max(1, CAP_CSS_HEIGHT / CSS_PER_NATURAL / h);
        svg = svg
          .replace(/(<svg[^>]*\swidth=")[\d.]+(")/, `$1${Math.round(w * factor)}$2`)
          .replace(/(<svg[^>]*\sheight=")[\d.]+(")/, `$1${Math.round(h * factor)}$2`);
      }
    }
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function assemble() {
  if (!RUN) throw new Error('--run <dir> required');
  const dir = resolve(RUN);
  const planJ = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const questions = planJ.plan.map((p) => {
    const read = (suffix) => { const f = join(dir, `Q${p.pos}.${suffix}`); return existsSync(f) ? readJsonLoose(f) : null; };
    const gates = read('gates.json'), verdict = read('verdict.json'), blind = read('blind.json');
    const q = read('json');
    const accepted = !!(q && gates?.pass && verdict?.all_agree === true && !verdict?.too_close_to && Number(verdict?.score) >= 4);
    return { pos: p.pos, topic: p.topic, target: p.target, accepted, question: accepted ? q : null, draft: accepted ? null : q, gates, blind, verdict, exemplars: planJ.exemplars[p.pos] ?? [] };
  });
  const ok = questions.filter((s) => s.accepted);
  const paper = {
    ...planJ, models: { author: 'claude-fable-5-1 (Claude Code agent)', solver: 'claude-opus-5 (Claude Code agent)', moderator: 'claude-fable-5-1 (Claude Code agent)' },
    assembled_at: new Date().toISOString(), questions,
  };
  delete paper.exemplars;
  const stamp = paper.generated_at.slice(0, 10);
  const jsonPath = join(OUT_ROOT, `${planJ.key}-seed${planJ.seed}-${stamp}.json`);
  mkdirSync(OUT_ROOT, { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(paper, null, 1) + '\n');
  log(`${ok.length}/${questions.length} accepted · ${ok.reduce((a, s) => a + s.target, 0)} marks · saved ${jsonPath}`);
  const missingMust = planJ.must_appear.filter((t) => !ok.some((s) => s.question.topics.includes(t)));
  if (missingMust.length) log(`⚠ must_appear not covered: ${missingMust.join(', ')}`);
  if (!ok.length) { console.log(JSON.stringify({ json: jsonPath, ok: 0 })); return; }

  const libs = await loadLibs();
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
    return { qnum: String(s.pos), marks: s.target, stem, images: figure ? [figure] : [], missingFigure: false, parts: toParts(q.parts), answerLines: answerKeyLines(q.parts, q.answer) };
  });
  const title = `${planJ.shape.subject} ${planJ.shape.code} · Paper ${planJ.paperNo} · Practice paper in the GCE format`;
  const total = ok.reduce((a, s) => a + s.target, 0);
  const metaLine = `${ok.length} questions · ${total} marks · ${planJ.shape.duration} · AI-authored draft (seed ${planJ.seed}) — not a past-year paper`;
  const pdfDir = PDF_DIR ? resolve(PDF_DIR) : OUT_ROOT;
  mkdirSync(pdfDir, { recursive: true });
  const base = `${planJ.key}-seed${planJ.seed}-${stamp}`;
  const paperPdf = join(pdfDir, `${base}.pdf`);
  writeFileSync(paperPdf, await libs.renderPaperPDF({ title, metaLine, questions: pdfQs, workingSpace: true, answerKey: true, coverageWarning: ok.length < questions.length ? `${questions.length - ok.length} slot(s) did not pass the gates and were left out` : null }));
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
