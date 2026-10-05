#!/usr/bin/env node
// scripts/science-twins/sci-twin.mjs — the deterministic half of SCIENCE twins
// (SPEC-TWINS §11, 5 Oct 2026, Adrian: "yes > start with Challenge").
//
// A science twin is OUR OWN MCQ, written at the Challenge level, modelled on a real
// Challenge (or Exam) row of the same sub-skill: a new situation and new numbers,
// harder reasoning, four options whose wrong ones are real mistakes. The writing is
// agents (author → blind solve → checker, plan-billed, never the API); this file does
// everything that is not judgement:
//
//   gap      the open practice topics (src/lib/portal-beta.ts, pure + Combined) and how
//            many servable Challenge MCQs each has → the gap to TARGET (30)
//   need     --pool CS_PHY --topic "Pressure" → how many that topic still wants (0 = full)
//   queue    seeds for the topics short of TARGET, one sub-skill at a time, Challenge
//            seeds first, then Exam; text-only seeds before figured ones   [--limit N --json]
//   brief    --source <uuid> --run <dir> [--pool PHY|CS_PHY…]  → source.json, corpus.json,
//            plan.json, author-brief.md
//   check    --run <dir>  → Q1.gates.json (format, house style, scope words, novelty vs the
//            seed and the whole topic, number-swap, same options, figure renders); a pass
//            writes Q1.solve.md (blind solver) and Q1.check.md (checker)
//   publish  --run <dir> [--dry]  → the row (school AdrianMath, exam_type Twin, twin_of,
//            verified, practice_checked_at) + its sub-skill filing + practice_difficulty
//            (challenge, source 'twin'). Refuses unless the gates, the blind solve and the
//            checker all passed.
//   review   --runs <dir…> --out <file.html>  → a phone-width page of the twins for Adrian
//
// Env: SUPABASE_URL_SCIENCE + SUPABASE_SERVICE_KEY_SCIENCE (environment, else .env.local,
// else the bot's .env). Never prints a key.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const argv = process.argv.slice(2);
const MODE = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'gap';
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const log = (s) => console.error(s);

export const TARGET = Number(process.env.SCI_TWINS_TARGET || 30);
const NOVELTY_MAX = 0.4;
const TWIN_SCHOOL = 'AdrianMath';
const TWIN_EXAM_TYPE = 'Twin';
const PROMPT_VERSION = 'sci-twin-1';
const BUCKET = 'question_images';
const MCQ_RE = /^\s*([A-Da-d]\s*$|\*\*\(?[A-D]\)?\*\*)/;
const SERVED = ['results', 'estimate', 'twin'];

// key → bank level, subject, syllabus words for the briefs
const SCI = {
  PHY: { bank: 'PHYS', subject: 'physics', name: 'Physics', code: '6091', cs: 'CS_PHYS' },
  CHEM: { bank: 'CHEM', subject: 'chemistry', name: 'Chemistry', code: '6092', cs: 'CS_CHEM' },
  BIO: { bank: 'BIO', subject: 'biology', name: 'Biology', code: '6093', cs: 'CS_BIO' },
};
const poolLevels = (key, combined) => (combined ? [SCI[key].cs, `${SCI[key].cs}_NA`] : [SCI[key].bank]);
const poolName = (key, combined) => (combined ? `CS_${key}` : key);
function parsePool(p) {
  const m = /^(CS_)?(PHY|CHEM|BIO)$/.exec(String(p ?? ''));
  return m ? { key: m[2], combined: !!m[1] } : null;
}
const syllabusOf = (key, combined) => combined
  ? `Singapore-Cambridge GCE O-Level Combined Science (5086 / 5087 / 5088), the ${SCI[key].name} section — narrower than pure ${SCI[key].name}: test ONLY what the Combined Science ${SCI[key].name} syllabus covers`
  : `Singapore-Cambridge GCE O-Level ${SCI[key].name} (${SCI[key].code})`;

// Things the O-Level physics syllabi do not ask (Adrian, 5 Oct 2026: "physics: no suvat
// equations, no momentum, no circular motion"). A twin naming one is out of scope.
const SCOPE_WORDS = {
  PHY: [/momentum/i, /impulse/i, /centripetal/i, /circular motion/i, /angular/i, /projectile/i, /\bsuvat\b/i,
    /v\s*=\s*u\s*\+\s*at/i, /v\s*(\^\s*2|²)\s*=\s*u\s*(\^\s*2|²)/i, /s\s*=\s*ut/i, /\bv\s*(\^\s*2|²)\s*=\s*2\s*g\s*h/i, /\bv\s*(\^\s*2|²)\s*=\s*2\s*a\s*s/i, /coefficient of friction/i, /\bμ\b/],
  CHEM: [/\bmolarity\b/i, /\bKc\b/, /equilibrium constant/i, /\bpH\s*=\s*-?\s*log/i, /enthalpy of formation/i, /hybridi[sz]ation/i],
  BIO: [/\bKrebs\b/i, /\bglycolysis\b/i, /\bATP synthase\b/i, /\bHardy[- ]Weinberg\b/i],
};
// Nothing that names a school, a sitting, or a model reaches a student.
const FORBIDDEN = [/\bclaude\b/i, /\bopus\b/i, /\bsonnet\b/i, /\bgpt\b/i, /\bgemini\b/i, /\bA\.?I\.?[- ]generated\b/i, /\bprelim/i, /secondary school/i, /\bGCE\b/, /\bO[- ]Level paper\b/i, /\bTYS\b/, /\b(19|20)\d{2}\s+(paper|prelim|exam)/i];

// ------------------------------------------------------------------ env ----
function loadEnv() {
  const { parse } = require('dotenv');
  const out = {};
  const p = join(ROOT, '.env.local');
  if (existsSync(p)) Object.assign(out, parse(readFileSync(p, 'utf8')));
  Object.assign(out, process.env);
  if (!out.SUPABASE_URL_SCIENCE || !out.SUPABASE_SERVICE_KEY_SCIENCE) {
    for (const f of [join(homedir(), 'dev', 'adrianmath-telegram-math-bot', '.env'), process.env.BOT_REPO && join(process.env.BOT_REPO, '.env')].filter(Boolean)) {
      if (!existsSync(f)) continue;
      const b = parse(readFileSync(f, 'utf8'));
      out.SUPABASE_URL_SCIENCE ||= b.SUPABASE_URL_SCIENCE; out.SUPABASE_SERVICE_KEY_SCIENCE ||= b.SUPABASE_SERVICE_KEY_SCIENCE;
    }
  }
  for (const k of ['SUPABASE_URL_SCIENCE', 'SUPABASE_SERVICE_KEY_SCIENCE']) out[k] = String(out[k] ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!out.SUPABASE_URL_SCIENCE || !out.SUPABASE_SERVICE_KEY_SCIENCE) throw new Error('SUPABASE_URL_SCIENCE / SUPABASE_SERVICE_KEY_SCIENCE missing');
  return out;
}
let _sb = null;
function sb() {
  if (_sb) return _sb;
  const env = loadEnv();
  const { createClient } = require('@supabase/supabase-js');
  _sb = createClient(env.SUPABASE_URL_SCIENCE, env.SUPABASE_SERVICE_KEY_SCIENCE, { auth: { persistSession: false } });
  return _sb;
}
// the serving filters of src/lib/science-bank.ts eligible(), student side (checked only)
function eligible(q, subject) {
  return q.eq('subject', subject)
    .or('quarantined.is.null,quarantined.eq.false')
    .or('ai_generated.is.null,ai_generated.eq.false,verified.eq.true')
    .or('has_image.is.null,has_image.eq.false,image_watermark_status.eq.clean')
    .or('solution.neq.,answer.neq.')
    .or('not_in_syllabus.is.null,not_in_syllabus.eq.false')
    .not('school', 'ilike', 'gce')
    .eq('practice_hidden', false)
    .not('question_text', 'is', null)
    .neq('question_text', '')
    .not('practice_checked_at', 'is', null)
    .filter('answer', 'match', '^\\s*([A-Da-d]\\s*$|[*][*][(]?[A-D][)]?[*][*])');
}
async function all(build) {
  const rows = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await build().range(a, a + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// --------------------------------------------------------- open topics ----
export function openTopics(src = readFileSync(join(ROOT, 'src/lib/portal-beta.ts'), 'utf8')) {
  const block = (name) => {
    const i = src.indexOf(`export const ${name}`);
    if (i < 0) return {};
    const body = src.slice(src.indexOf('{', src.indexOf('=', i)), src.indexOf('};', i));
    const clean = body.replace(/\/\/[^\n]*/g, '');
    const out = {};
    for (const m of clean.matchAll(/(PHY|CHEM|BIO)\s*:\s*\[([\s\S]*?)\]/g)) out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    return out;
  };
  const pools = [];
  for (const [combined, name] of [[false, 'SCIENCE_PRACTICE_OPEN_TOPICS'], [true, 'SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS']]) {
    for (const [key, topics] of Object.entries(block(name))) for (const topic of topics) pools.push({ key, combined, pool: poolName(key, combined), topic });
  }
  return pools;
}

async function challengeCount(p) {
  const s = SCI[p.key];
  const { count, error } = await eligible(sb().from('questions').select('id, practice_difficulty!inner(level, source)', { count: 'exact', head: true }), s.subject)
    .in('level', poolLevels(p.key, p.combined)).contains('topics', [p.topic])
    .eq('practice_difficulty.level', 'challenge').in('practice_difficulty.source', SERVED);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function gap() {
  const pools = openTopics();
  const out = [];
  for (const p of pools) { const n = await challengeCount(p); out.push({ ...p, challenge: n, gap: Math.max(0, TARGET - n) }); }
  if (has('--json')) { console.log(JSON.stringify(out)); return; }
  for (const r of out) console.log(`${r.pool.padEnd(8)} ${r.topic.padEnd(34)} challenge ${String(r.challenge).padStart(3)}  gap ${r.gap}`);
  console.log(`total gap ${out.reduce((a, r) => a + r.gap, 0)} (target ${TARGET} Challenge MCQs per open topic)`);
}

// how many Challenge MCQs one open topic still wants (0 = full) — asked right before writing one
async function need() {
  const pp = parsePool(argOf('--pool'));
  const topic = argOf('--topic');
  if (!pp || !topic) throw new Error('--pool PHY|CHEM|BIO|CS_… --topic "<topic>" required');
  const n = await challengeCount({ ...pp, topic });
  console.log(Math.max(0, TARGET - n));
}

// --------------------------------------------------------------- queue ----
async function seedsFor(p) {
  const s = SCI[p.key];
  const rows = await all(() => eligible(sb().from('questions').select('id, level, school, has_image, skill, question_text, practice_difficulty!inner(level, source)'), s.subject)
    .in('level', poolLevels(p.key, p.combined)).contains('topics', [p.topic])
    .in('practice_difficulty.level', ['challenge', 'exam']).in('practice_difficulty.source', ['results', 'estimate'])
    .neq('school', TWIN_SCHOOL).order('id'));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const twinned = new Set();
  const filing = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: t } = await sb().from('questions').select('twin_of').in('twin_of', chunk);
    for (const r of t ?? []) twinned.add(r.twin_of);
    const { data: f } = await sb().from('question_subgroups').select('question_id, subgroup_id, is_primary').in('question_id', chunk);
    for (const r of f ?? []) if (r.is_primary || !filing.has(r.question_id)) filing.set(r.question_id, r.subgroup_id);
  }
  const lvlRank = (r) => (r.practice_difficulty?.level ?? r.practice_difficulty?.[0]?.level) === 'challenge' ? 0 : 1;
  return rows
    .filter((r) => !twinned.has(r.id) && String(r.question_text ?? '').length > 40)
    .map((r) => ({ source_id: r.id, pool: p.pool, key: p.key, combined: p.combined, topic: p.topic, bank_level: r.level, subgroup_id: filing.get(r.id) ?? null, has_image: !!r.has_image, seed_level: lvlRank(r) === 0 ? 'challenge' : 'exam', skill: r.skill ?? null }))
    .sort((a, b) => (a.seed_level === b.seed_level ? 0 : a.seed_level === 'challenge' ? -1 : 1) || (a.has_image - b.has_image) || a.source_id.localeCompare(b.source_id));
}

async function queue() {
  const limit = Number(argOf('--limit', 10));
  const onlyPool = argOf('--pool', null);
  const textOnly = has('--text-only');
  const pools = openTopics().filter((p) => !onlyPool || p.pool === onlyPool);
  const want = [];
  for (const p of pools) { const n = await challengeCount(p); if (n < TARGET) want.push({ ...p, gap: TARGET - n }); }
  want.sort((a, b) => b.gap - a.gap);
  const lists = [];
  for (const p of want) {
    let seeds = await seedsFor(p);
    if (textOnly) seeds = seeds.filter((s) => !s.has_image);
    // one seed per sub-skill per round, so a topic's twins spread over its skills
    const bySg = new Map();
    for (const s of seeds) { const k = s.subgroup_id ?? `none-${s.source_id}`; if (!bySg.has(k)) bySg.set(k, []); bySg.get(k).push(s); }
    const spread = [];
    for (let round = 0; spread.length < seeds.length; round++) { let added = 0; for (const l of bySg.values()) if (l[round]) { spread.push(l[round]); added++; } if (!added) break; }
    lists.push({ p, seeds: spread.slice(0, p.gap).map((s) => ({ ...s, gap: p.gap })) });
  }
  const out = []; const used = new Set();   // a seed filed under two topics is used once
  for (let i = 0; out.length < limit; i++) {
    let left = 0;
    for (const l of lists) {
      const s = l.seeds[i];
      if (!s) continue;
      left++;
      if (out.length < limit && !used.has(s.source_id)) { out.push(s); used.add(s.source_id); }
    }
    if (!left) break;
  }
  if (has('--json')) { console.log(JSON.stringify(out)); return; }
  for (const r of out) console.log(`${r.source_id}  ${r.pool.padEnd(8)} ${r.topic.padEnd(32)} sg ${String(r.subgroup_id ?? '-').padEnd(6)} ${r.seed_level}${r.has_image ? ' (figure)' : ''}  gap ${r.gap}`);
  log(`${out.length} seeds over ${want.length} topics short of ${TARGET}`);
}

// ------------------------------------------------------------- helpers ----
function readJsonLoose(path) {
  let t = readFileSync(path, 'utf8').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error(`${path}: no JSON object`);
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return JSON.parse(t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); }
}
const readIf = (p, loose = true) => (existsSync(p) ? (loose ? readJsonLoose(p) : JSON.parse(readFileSync(p, 'utf8'))) : null);
function grams(text, n = 3) {
  const toks = String(text).toLowerCase().replace(/\\[a-z]+/g, ' ').replace(/[${}^_()\[\]\\|,.;:!?'"“”‘’*]/g, ' ').split(/\s+/).filter(Boolean);
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
const masked = (t) => String(t).toLowerCase().replace(/\d+(\.\d+)?/g, '#').replace(/[^a-z#]+/g, ' ').trim();
const normOpt = (t) => String(t).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const LETTERS = ['A', 'B', 'C', 'D'];
/** Split a bank MCQ into its stem and A–D options (both stored forms: "A) x" and "A  x"). */
export function splitMcq(text) {
  const lines = String(text ?? '').split('\n');
  const opts = {}; const stem = [];
  let cur = null;
  for (const l of lines) {
    const m = /^\s*\(?([A-D])[).:]?\s+(.*)$/.exec(l);
    if (m && (m[1] === 'A' || cur)) { cur = m[1]; opts[cur] = m[2].trim(); continue; }
    if (cur && l.trim()) { opts[cur] += ` ${l.trim()}`; continue; }
    if (!cur) stem.push(l);
  }
  return { stem: stem.join('\n').trim(), options: opts };
}
export const keyOf = (answer) => { const m = /([A-D])/.exec(String(answer ?? '').replace(/^\s*\*\*\(?/, '')); return m ? m[1] : null; };
export function questionText(q) {
  return `${String(q.stem ?? '').trim()}\n\n${LETTERS.map((l) => `${l}) ${String(q.options?.[l] ?? '').trim()}`).join('\n')}`;
}

// --------------------------------------------------------------- brief ----
async function brief() {
  const id = argOf('--source');
  const dir = resolve(argOf('--run', '.'));
  if (!id) throw new Error('--source <uuid> required');
  mkdirSync(dir, { recursive: true });
  const { data: src, error } = await sb().from('questions').select('id, level, subject, school, year, exam_type, paper, question_number, question_text, answer, solution, topics, skill, has_image, image_url, difficulty').eq('id', id).single();
  if (error) throw new Error(error.message);
  const key = Object.keys(SCI).find((k) => SCI[k].subject === src.subject);
  const combined = String(src.level).startsWith('CS_');
  const pool = argOf('--pool', poolName(key, combined));
  const pp = parsePool(pool);
  const topic = argOf('--topic', null) ?? (src.topics ?? [])[0];
  const { data: pd } = await sb().from('practice_difficulty').select('level, source, reason, detail').eq('question_id', id).maybeSingle();
  const { data: f } = await sb().from('question_subgroups').select('subgroup_id, is_primary').eq('question_id', id);
  const sgIds = (f ?? []).map((r) => r.subgroup_id);
  const { data: sgs } = sgIds.length ? await sb().from('subgroups').select('id, name, description, topic').in('id', sgIds) : { data: [] };
  const subgroups = (sgs ?? []).map((s) => ({ id: s.id, name: s.name, description: s.description, is_primary: !!(f ?? []).find((r) => r.subgroup_id === s.id)?.is_primary }));
  // the novelty corpus: every row of the topic in the subject, pure and Combined, any source
  const corpus = await all(() => sb().from('questions').select('id, level, school, year, question_text').eq('subject', src.subject).contains('topics', [topic]).neq('id', id).order('id'));
  // a few more rows of the same sub-skill, to show the range the skill spans (not to copy)
  let siblings = [];
  if (sgIds.length) {
    const { data: fs } = await sb().from('question_subgroups').select('question_id').in('subgroup_id', sgIds).neq('question_id', id).limit(40);
    const sids = (fs ?? []).map((r) => r.question_id);
    if (sids.length) {
      const { data: sr } = await sb().from('questions').select('id, question_text, answer, practice_difficulty(level)').in('id', sids).in('level', poolLevels(pp.key, pp.combined)).limit(40);
      siblings = (sr ?? []).filter((r) => r.practice_difficulty?.level === 'challenge' || r.practice_difficulty?.[0]?.level === 'challenge').slice(0, 3);
    }
  }
  const plan = {
    source: id, pool, key: pp.key, combined: pp.combined, subject: src.subject, bank_level: src.level, topic,
    skill: src.skill ?? null, subgroups, seed_level: pd?.level ?? null, seed_reason: pd?.reason ?? null,
    syllabus: syllabusOf(pp.key, pp.combined), seed_has_image: !!src.has_image, prompt_version: PROMPT_VERSION,
    models: { author: 'opus (Claude Code agent)', blind: 'opus (fresh Claude Code agent)', checker: 'opus (fresh Claude Code agent)' },
  };
  writeFileSync(join(dir, 'source.json'), JSON.stringify(src, null, 1));
  writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus.map((r) => ({ id: r.id, ref: `${r.level} ${r.school} ${r.year}`, text: r.question_text })), null, 0));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  const sp = splitMcq(src.question_text);
  const skillLine = subgroups.length ? subgroups.map((s) => `${s.name}${s.description ? ` — ${s.description}` : ''}`).join('; ') : (src.skill ?? '(no sub-skill filed — use the seed itself)');
  const md = `# Science twin — author brief

You write ONE new multiple-choice question for Singapore students: OUR OWN question, at the
**Challenge** level, modelled on the seed below. Write the file \`${dir}/Q1.json\` and stop.

## The seed (a school's question — never copy it)
- Syllabus: ${plan.syllabus}
- Topic: **${topic}**
- Sub-skill: **${skillLine}**
- The seed's level: ${plan.seed_level ?? 'unknown'}${plan.seed_reason ? ` (${plan.seed_reason})` : ''}
- The seed${src.has_image ? ' HAS A FIGURE (not shown; its question text describes enough to see the idea)' : ''}:

\`\`\`
${src.question_text}
\`\`\`
Key: ${keyOf(src.answer) ?? src.answer}
${src.solution ? `Its solution:\n\`\`\`\n${String(src.solution).slice(0, 1500)}\n\`\`\`` : ''}
${siblings.length ? `\n## Other Challenge questions of the same sub-skill (the range of the skill — do not copy these either)\n${siblings.map((s, i) => `${i + 1}. ${String(s.question_text).slice(0, 600)}`).join('\n\n')}\n` : ''}
## What to write
- **Same sub-skill as the seed, harder reasoning.** Challenge = more than half of students miss it
  first time: two or three ideas joined, a step most students skip, or a trap a careless reader
  falls into. Not harder by obscure facts, long arithmetic or trick wording.
- **A NEW situation and new numbers.** A teacher holding both must NOT say "that is the seed with
  the numbers changed". Different object, setting, quantities, sentences and order of ideas.
  Syllabus phrasing that belongs to everyone ("Which statement is correct?") is fine.
- **Only ${plan.syllabus} content.**${pp.key === 'PHY' ? ' Physics: NO equations of motion (no suvat, no v = u + at, no v² = u² + 2as) — kinematics is graphs, gradients, areas, average speed; NO momentum or impulse; NO circular motion; take g = 10 m/s² (or N/kg) and say so when it is used.' : ''}${pp.key === 'CHEM' ? ' Chemistry: relative atomic masses given in the stem when needed (e.g. "Aᵣ: C = 12, O = 16"); a gas volume 24 dm³ per mole at r.t.p. when used.' : ''}${pp.key === 'BIO' ? ' Biology: the syllabus facts and terms as the syllabus words them.' : ''}
- **Four options, exactly one defensible answer.** Every wrong option is a REAL mistake a student
  makes (a skipped step, a unit slip, a reversed idea, a common misconception) — not filler.
  Options of similar length and form. Numbers: plausible values, ascending order.
- **Plain words, one idea per sentence.** Units with every quantity. Chemical formulae with Unicode
  subscripts (H₂SO₄, CO₂, Fe²⁺). Maths in $…$ only where it helps ($\\frac{1}{2}$, $10^{-3}$).
- **No figure unless the question cannot stand without one.** If it needs one, it must be drawn by
  the bot's figure library from a spec (families: free-body-diagram, moments-lever, circuit-diagram,
  ray-diagram, speed-time, chem-apparatus, chem-graph, chem-energy-profile, chem-dot-cross,
  chem-electron-shells, chem-structure, measuring-instrument, function-graph, coordinate-plane):
  read the family's spec language first with
  \`node ${ROOT}/scripts/gce-paper/figure.mjs --doc <family>\`, then write \`${dir}/Q1.figure.json\`
  as \`{"family": "...", "spec": {...}}\` (exactly the shape --doc shows). Never copy or describe the
  seed's figure. The stem must still read correctly with the figure beside it.
- Never name a school, a year, an exam paper, a source, or any computer program in anything a
  student reads.

## The solution (house style — exactly this shape)
\`\`\`
**Key idea:** <the one idea the question turns on, one line>
<one step a line — a short sentence or one calculation each, units kept>
<…>
**Answer: B**
**Why not the others**
- **A:** <what is wrong with A>
- **C:** …
- **D:** …
\`\`\`
"Why not the others" may name the mistake that gives an option ONLY when that mistake reproduces
the option exactly (check the arithmetic). Otherwise just say why it is wrong.

## Q1.json — exactly this shape
\`\`\`json
{
  "stem": "the question text, WITHOUT the options",
  "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
  "answer": "B",
  "solution": "**Key idea:** …\\n…\\n**Answer: B**\\n**Why not the others**\\n- **A:** …\\n- **C:** …\\n- **D:** …",
  "distractors": { "A": "the mistake that gives A", "C": "…", "D": "…" },
  "why_challenge": "the ideas joined / the trap, in one or two lines",
  "originality_note": "how it differs from the seed: situation, numbers, order of ideas",
  "needs_figure": false
}
\`\`\`
`;
  writeFileSync(join(dir, 'author-brief.md'), md);
  log(`brief → ${dir} (${pool} · ${topic} · ${subgroups.map((s) => s.name).join(', ') || 'no sub-skill'} · corpus ${corpus.length})`);
}

// --------------------------------------------------------------- check ----
export function gateQuestion(q, { srcText, corpus = [], key }) {
  const problems = [];
  const stem = String(q.stem ?? '').trim();
  if (stem.length < 30) problems.push('stem too short');
  if (/^\s*\(?[A-D][).]\s/m.test(stem)) problems.push('the stem carries option lines — options go in "options" only');
  for (const l of LETTERS) if (!String(q.options?.[l] ?? '').trim()) problems.push(`option ${l} is empty`);
  const normed = LETTERS.map((l) => normOpt(q.options?.[l] ?? ''));
  if (new Set(normed).size < 4) problems.push('two options are the same');
  const ans = String(q.answer ?? '').trim().toUpperCase();
  if (!LETTERS.includes(ans)) problems.push('answer must be one letter A–D');
  const sol = String(q.solution ?? '');
  if (!/\*\*Key idea:\*\*/.test(sol)) problems.push('solution: no "**Key idea:**" line');
  const am = /\*\*Answer:\s*\(?([A-D])\)?\*\*/.exec(sol);
  if (!am) problems.push('solution: no "**Answer: X**" line');
  else if (am[1] !== ans) problems.push(`solution says Answer ${am[1]} but the key is ${ans}`);
  if (!/\*\*Why not the others\*\*/.test(sol)) problems.push('solution: no "**Why not the others**" heading');
  for (const l of LETTERS) {
    const bullet = new RegExp(`^\\s*-\\s*\\*\\*${l}:?\\*\\*`, 'm').test(sol);
    if (l !== ans && !bullet) problems.push(`solution: no "- **${l}:**" line under Why not the others`);
    if (l === ans && bullet) problems.push(`solution: the key ${l} is listed under Why not the others`);
  }
  const longLines = sol.split('\n').filter((l) => l.length > 260);
  if (longLines.length) problems.push(`solution: ${longLines.length} line(s) over 260 characters — one step a line`);
  const text = questionText(q);
  const everything = `${text}\n${sol}`;
  for (const re of FORBIDDEN) if (re.test(everything)) problems.push(`names something a student must never read (${re})`);
  for (const re of SCOPE_WORDS[key] ?? []) if (re.test(everything)) problems.push(`out of the syllabus scope (${re})`);
  const g = grams(text);
  const vsSource = Number(jaccard(g, grams(srcText)).toFixed(3));
  let nearest = null, nearestS = 0, nearestId = null;
  for (const r of corpus) { const s = jaccard(g, grams(r.text)); if (s > nearestS) { nearestS = s; nearest = r.ref; nearestId = r.id; } }
  nearestS = Number(nearestS.toFixed(3));
  if (vsSource > NOVELTY_MAX) problems.push(`too close to the seed (trigram Jaccard ${vsSource} > ${NOVELTY_MAX})`);
  if (nearestS > NOVELTY_MAX) problems.push(`too close to a bank question ${nearest} (trigram Jaccard ${nearestS} > ${NOVELTY_MAX})`);
  const m = masked(text);
  const numberSwap = m === masked(srcText) || corpus.some((r) => masked(r.text) === m);
  if (numberSwap) problems.push('number-swap: with the numbers masked it is the same as a bank question');
  const so = splitMcq(srcText).options;
  const sameOpts = LETTERS.filter((l) => so[l] && normed.includes(normOpt(so[l]))).length;
  if (sameOpts >= 3) problems.push(`${sameOpts} of the seed's options reappear — new options, please`);
  return { pass: problems.length === 0, problems, novelty: { vs_source: vsSource, nearest, nearest_id: nearestId, nearest_jaccard: nearestS, max: NOVELTY_MAX, number_swap: numberSwap, same_options: sameOpts } };
}

function check() {
  const dir = resolve(argOf('--run', '.'));
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const src = JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8'));
  const corpus = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'));
  const prev = readIf(join(dir, 'Q1.gates.json'), false) ?? {};
  const q = readJsonLoose(join(dir, 'Q1.json'));
  const res = gateQuestion(q, { srcText: src.question_text, corpus, key: plan.key });
  // a figure is drawn from its spec by the bot's registry (verify fails closed)
  let figure = null;
  if (q.needs_figure === true) {
    if (!existsSync(join(dir, 'Q1.figure.json')) && !existsSync(join(dir, 'Q1.figure.cjs'))) res.problems.push('needs_figure but no Q1.figure.json');
    else {
      const r = spawnSync(process.execPath, [join(ROOT, 'scripts/gce-paper/figure.mjs'), '--run', dir, '--slots', '1'], { encoding: 'utf8' });
      figure = { rc: r.status, out: String(r.stdout || r.stderr || '').slice(-400) };
      if (!existsSync(join(dir, 'Q1.figure.png'))) res.problems.push(`figure did not render: ${figure.out.replace(/\s+/g, ' ').slice(-200)}`);
    }
  }
  res.pass = res.problems.length === 0;
  const gates = { ...res, figure, checked_at: new Date().toISOString(), rounds: (prev.rounds ?? 0) + 1 };
  writeFileSync(join(dir, 'Q1.gates.json'), JSON.stringify(gates, null, 1));
  if (gates.pass) {
    const figLine = q.needs_figure ? `\nThe question has a figure: open \`${dir}/Q1.figure.png\` with the Read tool and use it.\n` : '';
    writeFileSync(join(dir, 'Q1.solve.md'), `# Blind solve

You are an expert examiner for ${plan.syllabus}. Solve this multiple-choice question
yourself, exactly as the strongest candidate would, working it fully. You have NOT seen
the setter's key. Then write \`${dir}/Q1.blind.json\`:

\`\`\`json
{ "answer": "A|B|C|D", "confidence": 0.0-1.0, "working": "your working, one step a line",
  "other_defensible": ["any OTHER letter a strong candidate could defend, with why — or empty"],
  "issues": ["anything unclear, wrong or out of syllabus in the question — or empty"] }
\`\`\`
${figLine}
## The question

${questionText(q)}
`);
    const corpusById = new Map(corpus.map((r) => [r.id, r]));
    const near = gates.novelty.nearest_id ? corpusById.get(gates.novelty.nearest_id) : null;
    const blindPath = join(dir, 'Q1.blind.json');
    writeFileSync(join(dir, 'Q1.check.md'), `# Checker — one science twin

You are a senior ${plan.syllabus} examiner checking OUR OWN Challenge-level MCQ before any student
sees it. Read this file, then the blind solver's answer in \`${blindPath}\`${q.needs_figure ? ` and the figure \`${dir}/Q1.figure.png\`` : ''}.
Work the question yourself first. Then write \`${dir}/Q1.verdict.json\` and stop.

## The twin
${questionText(q)}

Setter's key: **${q.answer}**

Setter's solution:
\`\`\`
${q.solution}
\`\`\`
Setter's notes — distractors: ${JSON.stringify(q.distractors ?? {})}; why Challenge: ${q.why_challenge ?? '-'}

## What it is modelled on (the seed, a school's question)
Topic ${plan.topic} · sub-skill ${plan.subgroups.map((s) => s.name).join(', ') || plan.skill || '-'}
\`\`\`
${src.question_text}
\`\`\`
Seed key: ${keyOf(src.answer)}

## The nearest bank question by wording (trigram Jaccard ${gates.novelty.nearest_jaccard})
\`\`\`
${near ? String(near.text).slice(0, 1200) : '(none)'}
\`\`\`

## Judge every point (false on any = the twin is NOT published)
1. key_correct — your own answer equals the key; blind_agrees — the blind solver's letter equals it.
2. one_defensible_answer — no other option a strong candidate could defend (read the blind solver's "other_defensible").
3. in_syllabus — everything needed is in ${plan.syllabus}.${plan.key === 'PHY' ? ' No equations of motion, no momentum, no circular motion.' : ''}
4. original — not the seed (or the nearest question) with numbers or nouns swapped: a new situation, new numbers, new sentences. reads_as_source = true if a teacher holding both would call it the same question.
5. same_skill — it exercises the seed's sub-skill.
6. challenge — rate the work as the estimator does: steps, ideas that must be joined, traps; work_score 1–5 (1–2 Core, 3 Exam, 4–5 Challenge). is_challenge = work_score ≥ 4 AND it is hard for a good reason (not obscure, not trick wording, not long arithmetic).
7. distractors_real — each wrong option is a real student mistake.
8. house_style — **Key idea:**, one step a line, units kept, bold **Answer: X**, then **Why not the others** with one line per wrong option; plain short words.
9. why_not_honest — wherever "why not the others" says an option comes from a particular mistake, that mistake reproduces the option EXACTLY (check the arithmetic). A line that just says why it is wrong is fine.
10. student_safe — nothing names a school, a year, a paper or a computer program; the facts are right.

\`\`\`json
{ "key_correct": true, "blind_agrees": true, "one_defensible_answer": true, "in_syllabus": true,
  "original": true, "reads_as_source": false, "same_skill": true,
  "work_score": 4, "is_challenge": true, "distractors_real": true, "house_style": true,
  "why_not_honest": true, "student_safe": true,
  "score": 1-5, "why": "one or two lines", "fixes": ["a concrete fix per failed point — or empty"] }
\`\`\`
`);
  }
  console.log(gates.pass ? `gates ✓ (vs seed ${gates.novelty.vs_source}, nearest ${gates.novelty.nearest_jaccard})` : `gates ✗\n- ${gates.problems.join('\n- ')}`);
  if (!gates.pass) process.exitCode = 1;
}

export function verdictOk(v, blind, key) {
  if (!v || !blind) return false;
  const letter = String(blind.answer ?? '').trim().toUpperCase();
  return letter === String(key).toUpperCase()
    && v.key_correct === true && v.blind_agrees === true && v.one_defensible_answer === true
    && v.in_syllabus === true && v.original === true && v.reads_as_source !== true && v.same_skill === true
    && Number(v.work_score) >= 4 && v.is_challenge === true && v.distractors_real === true
    && v.house_style === true && v.why_not_honest === true && v.student_safe === true && Number(v.score) >= 4;
}

// ------------------------------------------------------------- publish ----
async function publish() {
  const dir = resolve(argOf('--run', '.'));
  const dry = has('--dry');
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const src = JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8'));
  const q = readJsonLoose(join(dir, 'Q1.json'));
  const gates = readIf(join(dir, 'Q1.gates.json'), false);
  const blind = readIf(join(dir, 'Q1.blind.json'));
  const verdict = readIf(join(dir, 'Q1.verdict.json'));
  if (!gates?.pass) throw new Error('gates not passed — run check first');
  if (!verdictOk(verdict, blind, q.answer)) throw new Error(`refused: blind ${blind?.answer} vs key ${q.answer}; verdict ${JSON.stringify(verdict ?? null).slice(0, 400)}`);
  const png = join(dir, 'Q1.figure.png');
  if (q.needs_figure && !existsSync(png)) throw new Error('needs_figure but Q1.figure.png is not rendered');
  const item = `sci-twin-${plan.source}`;
  const imagePath = q.needs_figure ? `twins/${plan.source}.png` : null;
  const figSpec = existsSync(join(dir, 'Q1.figure.json')) ? JSON.parse(readFileSync(join(dir, 'Q1.figure.json'), 'utf8')) : null;
  const now = new Date().toISOString();
  const row = {
    level: plan.bank_level, subject: plan.subject, school: TWIN_SCHOOL, year: new Date().getFullYear(), exam_type: TWIN_EXAM_TYPE,
    paper: null, question_number: null,
    question_text: questionText(q), parts: null, answer: String(q.answer).trim().toUpperCase(), solution: q.solution, solution_source: 'opus_session',
    topics: [plan.topic], skill: plan.skill ?? null, difficulty: 'Challenging', total_marks: 1,
    has_image: !!imagePath, image_url: imagePath, images: [], image_size: 'md',
    // a drawn figure still waits for the science figure check (bot figfit, FIGFIT_BANK=science) to stamp 'clean'
    image_watermark_status: null,
    verified: true, ai_generated: true, twin_of: plan.source, source_question_id: null,
    quarantined: false, not_in_syllabus: false, practice_hidden: false,
    practice_checked_at: now, practice_check_note: 'twin: every check passed (gates, blind solve, checker)',
    gen_meta: {
      kind: 'science-twin', twin_item: item, twin_of: plan.source, prompt_version: PROMPT_VERSION, pool: plan.pool, level_written: 'challenge',
      source_ref: { school: src.school, year: src.year, paper: src.paper ?? null, question_number: src.question_number ?? null },
      models: plan.models, gates: { novelty: gates.novelty, rounds: gates.rounds },
      blind: { answer: blind.answer, confidence: blind.confidence ?? null, other_defensible: blind.other_defensible ?? [] },
      verdict: { work_score: verdict.work_score, score: verdict.score, why: verdict.why },
      distractors: q.distractors ?? null, why_challenge: q.why_challenge ?? null, originality_note: q.originality_note ?? null,
      figure: imagePath ? { family: figSpec?.family ?? null, spec: figSpec?.spec ?? figSpec } : null,
      subgroups: (plan.subgroups ?? []).map((s) => s.id), generated_at: now, verified_by: 'checks',
    },
  };
  if (dry) { console.log(JSON.stringify(row, null, 1)); return; }
  if (imagePath) {
    const { error } = await sb().storage.from(BUCKET).upload(imagePath, readFileSync(png), { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`figure upload: ${error.message}`);
  }
  const { data: existing } = await sb().from('questions').select('id').eq('gen_meta->>twin_item', item).limit(1);
  let qid;
  if (existing?.length) {
    qid = existing[0].id;
    const { error } = await sb().from('questions').update(row).eq('id', qid);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb().from('questions').insert(row).select('id').single();
    if (error) throw new Error(error.message);
    qid = data.id;
  }
  const filing = (plan.subgroups ?? []).map((s) => ({ question_id: qid, subgroup_id: s.id, is_primary: !!s.is_primary, confidence: 1, source: 'twin', reason: `science twin of ${plan.source}` }));
  if (filing.length) { const { error } = await sb().from('question_subgroups').upsert(filing, { onConflict: 'question_id,subgroup_id' }); if (error) log(`filing warning: ${error.message}`); }
  const { error: pdErr } = await sb().from('practice_difficulty').upsert({
    question_id: qid, level: 'challenge', source: 'twin', attempts: 0, wrong: 0, wrong_share: null,
    work_score: verdict.work_score, test_solve: null, reason: `Our own Challenge question; ${String(q.why_challenge ?? verdict.why ?? '').slice(0, 200)}`,
    detail: { twin_of: plan.source, checker_score: verdict.score }, updated_at: now,
  }, { onConflict: 'question_id' });
  if (pdErr) throw new Error(`practice_difficulty: ${pdErr.message}`);
  writeFileSync(join(dir, 'published.json'), JSON.stringify({ id: qid, item, at: now }, null, 1));
  console.log(`${existing?.length ? 'updated' : 'inserted'} ${qid} (science twin of ${plan.source}, Challenge)`);
}

// -------------------------------------------------------------- review ----
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mdLite = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function review() {
  const dirs = [];
  const i = argv.indexOf('--runs');
  for (let k = i + 1; i >= 0 && k < argv.length && !argv[k].startsWith('--'); k++) dirs.push(resolve(argv[k]));
  const out = resolve(argOf('--out', 'science-twins-review.html'));
  const withSeed = has('--with-seed');
  const cards = dirs.map((dir, n) => {
    const plan = readIf(join(dir, 'plan.json'), false); const src = readIf(join(dir, 'source.json'), false);
    const q = existsSync(join(dir, 'Q1.json')) ? readJsonLoose(join(dir, 'Q1.json')) : null;
    const v = readIf(join(dir, 'Q1.verdict.json')); const b = readIf(join(dir, 'Q1.blind.json')); const g = readIf(join(dir, 'Q1.gates.json'), false);
    if (!plan || !q) return '';
    const ok = verdictOk(v, b, q.answer) && g?.pass;
    const fig = q.needs_figure && existsSync(join(dir, 'Q1.figure.png')) ? `<img class="fig" src="data:image/png;base64,${readFileSync(join(dir, 'Q1.figure.png')).toString('base64')}">` : '';
    const subj = { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology' }[plan.subject];
    return `<section class="card ${ok ? 'ok' : 'no'}">
<div class="meta"><span class="pill ${plan.subject}">${plan.combined ? 'Combined · ' : ''}${subj}</span> <span>${esc(plan.topic)}</span> <span class="lvl">Challenge</span></div>
<div class="n">${n + 1}</div>
<div class="q">${mdLite(q.stem)}</div>${fig}
<ol class="opts">${LETTERS.map((l) => `<li class="${l === q.answer ? 'key' : ''}"><b>${l}</b> ${mdLite(q.options[l])}</li>`).join('')}</ol>
<details><summary>Solution</summary><div class="sol">${mdLite(q.solution)}</div></details>
<div class="checks">${ok ? '✓ every check passed' : '✗ not passed'} · blind solve ${esc(b?.answer ?? '–')} · checker ${esc(v?.score ?? '–')}/5 · work ${esc(v?.work_score ?? '–')}/5 · wording overlap ${g?.novelty?.vs_source ?? '–'} (seed), ${g?.novelty?.nearest_jaccard ?? '–'} (nearest)</div>
${withSeed ? `<details class="seed"><summary>Modelled on (school question — not shown to students)</summary><div class="q">${mdLite(src.question_text)}</div><div>Key ${esc(keyOf(src.answer))}</div></details>` : ''}
</section>`;
  }).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Science twins</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body,{delimiters:[{left:'$',right:'$',display:false}]})"></script>
<style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#1d1d1f;--mute:#6b6b70;--line:#e3e1da;--ok:#1f7a4d;--no:#b3261e;--key:#e8f5ec}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141416;--card:#1e1e21;--ink:#ececf0;--mute:#9a9aa2;--line:#2e2e33;--key:#163524}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:8px 0 4px}.sub{color:var(--mute);font-size:14px;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 14px;position:relative}
.card.no{border-color:var(--no)}
.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--mute);margin-bottom:8px;padding-right:28px}
.pill{border-radius:99px;padding:2px 9px;font-weight:600;color:#fff}.physics{background:#2f6fb5}.chemistry{background:#8a4fbf}.biology{background:#2e8b57}
.lvl{font-weight:600;color:var(--ink)}.n{position:absolute;top:12px;right:14px;color:var(--mute);font-size:13px}
.q{margin:4px 0 10px}.fig{max-width:100%;height:auto;display:block;margin:6px auto 10px;background:#fff;border-radius:8px}
.opts{list-style:none;padding:0;margin:0 0 10px}.opts li{padding:7px 10px;border:1px solid var(--line);border-radius:10px;margin:0 0 6px}
.opts li b{margin-right:8px}.opts li.key{background:var(--key);border-color:var(--ok)}
details{margin:6px 0}summary{cursor:pointer;color:var(--mute);font-size:14px}.sol{margin-top:6px;font-size:15px}
.checks{font-size:12px;color:var(--mute);margin-top:8px}.seed .q{font-size:14px;color:var(--mute)}
</style></head><body><main><h1>Science twins — first ${dirs.length}</h1>
<p class="sub">Our own Challenge questions, each modelled on a school question of the same skill. The right option is shaded. Nothing here is live yet.</p>
${cards}</main></body></html>`;
  writeFileSync(out, html);
  console.log(`review → ${out}`);
}

const MODES = { gap, need, queue, brief, check, publish, review };
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!MODES[MODE]) { log(`modes: ${Object.keys(MODES).join(' · ')}`); process.exit(2); }
  Promise.resolve(MODES[MODE]()).catch((e) => { log(`sci-twin ${MODE}: ${e.message}`); process.exit(1); });
}
