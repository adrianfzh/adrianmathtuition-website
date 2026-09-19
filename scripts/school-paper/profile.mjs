#!/usr/bin/env node
// School-paper profile — reads one school's real papers for a level + exam from the
// bank and writes the SHAPE a new paper must match: marks, question count, topic
// order, marks per topic area, part sizes, figures, command words. Deterministic,
// no model call. First piece of the school-paper method (18 Sep 2026): the blueprint
// and the difficulty note for a school are written from this output.
//
//   node scripts/school-paper/profile.mjs --school "CHIJ St Nicholas Girls" \
//        --level S1 --exam EOY [--paper 1] [--model-year 2025] --out <dir>
//
// Writes <dir>/profile.json, <dir>/profile.md and <dir>/real-questions.md (the
// questions with their marks, NO answers — what an author may be shown).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MATH_SUPABASE_URL = 'https://nempslbewxtlikfzachi.supabase.co';
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SCHOOL = argOf('--school', null), LEVEL = argOf('--level', null), EXAM = argOf('--exam', null);
const PAPER = argOf('--paper', null), MODEL_YEAR = argOf('--model-year', null), OUT = argOf('--out', null);
if (!SCHOOL || !LEVEL || !EXAM || !OUT) { console.error('need --school --level --exam --out'); process.exit(2); }

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

// The topic AREA a bank topic name belongs to ("Numbers (HCF and LCM)" → "Numbers").
const areaOf = (t) => String(t).replace(/\s*\(.*$/, '').trim();
const qnum = (q) => Number(String(q.question_number).replace(/\D/g, '')) || 0;
const IMG = /\{\{IMG:[^}]+\}\}/g;
const REASON = /\bexplain|give a reason|justify|do you agree|is (he|she|it) correct|state (the|a) reason/i;
const SHOW = /\bshow that|\bprove\b/i;

// Leaf answer units: a part's sub-parts when it has them, else the part, else the question.
function units(q) {
  const out = [];
  const walk = (parts, prefix) => {
    for (const p of (parts ?? []).filter(Boolean)) {
      const kids = p.parts ?? p.subparts ?? null;
      const label = `${prefix}(${p.label})`;
      if (Array.isArray(kids) && kids.length) walk(kids, label);
      else out.push({ label, marks: Number(p.marks) || 0, text: p.text ?? '' });
    }
  };
  walk(q.parts, '');
  if (!out.length) out.push({ label: '', marks: Number(q.total_marks) || 0, text: q.question_text ?? '' });
  return out;
}

const env = loadEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL + SUPABASE_SECRET_KEY missing (or the bot .env fallback)');
const cols = 'id,year,paper,question_number,total_marks,topics,question_text,parts,has_image,figure_url,source_file';
let url = `${env.SUPABASE_URL}/rest/v1/questions?select=${cols}&school=eq.${encodeURIComponent(SCHOOL)}&level=eq.${LEVEL}` +
  `&exam_type=eq.${encodeURIComponent(EXAM)}&deleted_at=is.null&ai_generated=not.is.true&limit=1000`;
if (PAPER) url += `&paper=eq.${PAPER}`;
const res = await fetch(url, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } });
if (!res.ok) throw new Error(`bank read ${res.status}`);
const rows = await res.json();
if (!rows.length) { console.error('no papers in the bank for that school / level / exam'); process.exit(1); }

const byPaper = new Map();
for (const r of rows) { const k = `${r.year}·P${r.paper}`; (byPaper.get(k) ?? byPaper.set(k, []).get(k)).push(r); }
const papers = [...byPaper.entries()].map(([key, qs]) => {
  qs.sort((a, b) => qnum(a) - qnum(b));
  const slots = qs.map((q) => {
    const u = units(q);
    const all = `${q.question_text ?? ''} ${u.map((x) => x.text).join(' ')}`;
    return {
      id: q.id, q: qnum(q), marks: Number(q.total_marks) || 0, topics: q.topics ?? [], areas: [...new Set((q.topics ?? []).map(areaOf))],
      units: u.map((x) => ({ label: x.label, marks: x.marks })), figure: !!(q.has_image || q.figure_url || IMG.test(all)),
      reason_units: u.filter((x) => REASON.test(x.text)).length, show_units: u.filter((x) => SHOW.test(x.text)).length,
    };
  });
  const allUnits = slots.flatMap((s) => s.units);
  const areaMarks = {};
  for (const s of slots) { const a = s.areas[0] ?? 'Other'; areaMarks[a] = (areaMarks[a] ?? 0) + s.marks; }
  return {
    key, year: qs[0].year, paper: qs[0].paper, source_file: qs[0].source_file,
    questions: slots.length, marks: slots.reduce((t, s) => t + s.marks, 0), figures: slots.filter((s) => s.figure).length,
    answer_units: allUnits.length, units_1: allUnits.filter((x) => x.marks === 1).length, units_2: allUnits.filter((x) => x.marks === 2).length,
    units_3: allUnits.filter((x) => x.marks === 3).length, units_4plus: allUnits.filter((x) => x.marks >= 4).length,
    largest_unit: Math.max(...allUnits.map((x) => x.marks)), largest_question: Math.max(...slots.map((s) => s.marks)),
    reason_units: slots.reduce((t, s) => t + s.reason_units, 0), show_units: slots.reduce((t, s) => t + s.show_units, 0),
    area_marks: areaMarks, slots,
  };
}).sort((a, b) => b.year - a.year);

const model = papers.find((p) => String(p.year) === String(MODEL_YEAR)) ?? papers[0];
const profile = { school: SCHOOL, level: LEVEL, exam: EXAM, generated: new Date().toISOString().slice(0, 10), model_paper: model.key, papers };
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'profile.json'), JSON.stringify(profile, null, 2));

const md = [`# ${SCHOOL} · ${LEVEL} · ${EXAM} — paper profile`, '', `Read from the bank on ${profile.generated}. Model paper: **${model.key}**.`, ''];
md.push('| paper | questions | marks | figures | answer units | 1-mark | 2-mark | 3-mark | 4+ | largest unit | largest question | explain | show that |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const p of papers) md.push(`| ${p.key} | ${p.questions} | ${p.marks} | ${p.figures} | ${p.answer_units} | ${p.units_1} | ${p.units_2} | ${p.units_3} | ${p.units_4plus} | ${p.largest_unit} | ${p.largest_question} | ${p.reason_units} | ${p.show_units} |`);
const areas = [...new Set(papers.flatMap((p) => Object.keys(p.area_marks)))];
md.push('', '## Marks per topic area', '', `| area | ${papers.map((p) => p.key).join(' | ')} |`, `|---|${papers.map(() => '---').join('|')}|`);
for (const a of areas) md.push(`| ${a} | ${papers.map((p) => p.area_marks[a] ?? 0).join(' | ')} |`);
for (const p of papers) {
  md.push('', `## ${p.key} — question by question`, '', '| Q | marks | parts | figure | topics |', '|---|---|---|---|---|');
  for (const s of p.slots) md.push(`| ${s.q} | ${s.marks} | ${s.units.map((u) => `${u.label || '—'} ${u.marks}`).join(', ')} | ${s.figure ? 'yes' : ''} | ${s.topics.join(' / ')} |`);
}
writeFileSync(join(OUT, 'profile.md'), md.join('\n') + '\n');

const rq = [`# ${SCHOOL} · ${LEVEL} · ${EXAM} — the real questions (no answers)`, ''];
for (const [key, qs] of byPaper) {
  rq.push(`## ${key}`, '');
  for (const q of qs) {
    rq.push(`### Q${qnum(q)} [${q.total_marks}] — ${(q.topics ?? []).join(' / ')}  \`${q.id}\``, '', (q.question_text ?? '').replace(IMG, '[figure]').trim());
    const walk = (parts, d) => { for (const p of parts ?? []) { rq.push(`${'  '.repeat(d)}(${p.label}) ${(p.text ?? '').replace(IMG, '[figure]').trim()}${p.marks ? ` [${p.marks}]` : ''}`); walk(p.parts ?? p.subparts, d + 1); } };
    walk(q.parts, 0); rq.push('');
  }
}
writeFileSync(join(OUT, 'real-questions.md'), rq.join('\n'));
console.log(join(OUT, 'profile.md'));
