#!/usr/bin/env node
// scripts/gce-paper/publish.mjs — file a generated GCE paper into the question
// bank as a SET: the fourth Print-a-paper preset (lib/print-sets.ts,
// SPEC-PRINT-PAPER.md §Set papers). Students see "Set N · Paper 1/2" on
// /app/print once every slot of that paper is in the bank.
//
//   node scripts/gce-paper/publish.mjs --paper data/gce-generated/GCE-AM-P1-seed1-2026-09-08.json \
//        --figures <run dir holding Q<n>.figure.png> --set 1 [--dry] [--retract]
//
// Filing (one bank row per slot):
//   school 'AdrianMath' · exam_type 'Set <n>' · paper '1'|'2' · question_number = slot
//   level = the blueprint family (GCE-AM → AM, GCE-EM → EM, GCE-JC → JC)
//   year = the generation year · difficulty 'Standard' · verified false (Adrian flips it)
//   ai_generated true · solution_source 'fable_session'
//   gen_meta.set_item = '<key>-set<n>-Q<pos>' — the IDEMPOTENCY key: re-running
//   updates the row in place (a retracted row is revived), never duplicates it.
// Figures: Q<n>.figure.png → Storage bucket practice-figures (public) at
//   gce-sets/<key>-set<n>/Q<pos>.png → figure_url + has_image=true — exactly what
//   kiosk-pool's figureServable accepts; image_watermark_status stays NULL
//   (docs/FIGURES.md reserves 'clean' for the five fitness checks).
// Checks before any write: accepted slots contiguous 1..n, marks sum to the
// paper total, a PNG exists for every needs_figure slot. --dry prints the plan
// and stops (no env needed). --retract soft-deletes (deleted_at) every row of
// this key+set instead of publishing.
//
// Env: SUPABASE_URL + SUPABASE_SECRET_KEY (.env.local), else the bot repo's
// .env SUPABASE_SERVICE_KEY_MAIN — same fallback as generate.mjs. Never printed.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const MATH_SUPABASE_URL = 'https://nempslbewxtlikfzachi.supabase.co';
const SET_SCHOOL = 'AdrianMath';
const BUCKET = 'practice-figures';

// ---------------------------------------------------------------- args ----
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const paperPath = opt('--paper');
const figuresDir = opt('--figures');
const setNo = Number(opt('--set'));
const dry = flag('--dry');
const retract = flag('--retract');
if (!paperPath || !Number.isInteger(setNo) || setNo <= 0) {
  console.error('usage: publish.mjs --paper <assembled json> --figures <run dir> --set <n> [--dry] [--retract]');
  process.exit(2);
}

// ----------------------------------------------------------------- env ----
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

// -------------------------------------------------------------- paper -----
const paper = JSON.parse(readFileSync(resolve(paperPath), 'utf8'));
const km = /^GCE-(AM|EM|JC)-P([12])$/.exec(paper.key ?? '');
if (!km) { console.error(`paper.key "${paper.key}" is not GCE-<AM|EM|JC>-P<1|2>`); process.exit(2); }
const level = km[1]; // bank filing level; JC students reach 'JC' through PRINT_POOL_SCOPE
const paperNo = km[2];
const setKey = `${paper.key}-set${setNo}`;
const examType = `Set ${setNo}`;
const year = new Date(paper.generated_at ?? paper.assembled_at ?? Date.now()).getFullYear();

const slots = (paper.questions ?? []).filter((s) => s.accepted && s.question).sort((a, b) => a.pos - b.pos);
const problems = [];
slots.forEach((s, i) => { if (s.pos !== i + 1) problems.push(`slot ${s.pos} out of order / gap before it`); });
const sum = slots.reduce((t, s) => t + Number(s.question.total_marks || 0), 0);
if (sum !== Number(paper.total)) problems.push(`marks sum ${sum} ≠ paper total ${paper.total}`);
if (!slots.length) problems.push('no accepted slots');

/** Bank part labels carry no parentheses ("a", "i"); the generator writes "(a)". */
const bare = (label) => String(label ?? '').replace(/^\(|\)$/g, '').trim();
// An author sometimes writes a flat "(c)(i)", "(c)(ii)" instead of nesting
// subparts under (c). The bank shape is nested (part c → subparts i, ii), and
// bare() alone would file the label as "c)(i" — fold consecutive flat labels
// into their parent before mapping (P1 Q10 of Set 1 did this).
// Both halves must be delimited — "(c)(ii)", "c(ii)", "(c) (ii)" — so a plain
// nested "(ii)" can never be read as parent i + subpart i.
const FLAT = /^\(?([a-z])\)?\s*\(([ivx]+)\)$/i;
function foldFlatSubparts(parts) {
  const out = [];
  for (const p of parts ?? []) {
    const m = FLAT.exec(String(p.label ?? '').trim());
    if (!m) { out.push(p); continue; }
    const [, parent, sub] = m;
    const last = out[out.length - 1];
    const sp = { ...p, label: `(${sub})` };
    if (last && bare(last.label) === parent && Array.isArray(last.subparts) && last.__folded) {
      last.subparts.push(sp); last.marks = (Number(last.marks) || 0) + (Number(p.marks) || 0);
    } else if (last && bare(last.label) === parent && !last.subparts?.length && !String(last.text ?? '').trim()) {
      last.subparts = [sp]; last.marks = (Number(last.marks) || 0) + (Number(p.marks) || 0); last.__folded = true;
    } else {
      out.push({ label: `(${parent})`, text: '', marks: Number(p.marks) || 0, subparts: [sp], __folded: true });
    }
  }
  return out;
}
function bankParts(parts) {
  return foldFlatSubparts(parts).map((p) => {
    const row = { label: bare(p.label), text: String(p.text ?? '').trim(), marks: Number(p.marks || 0) };
    if (p.answer != null && String(p.answer).trim()) row.answer = String(p.answer).trim();
    if (Array.isArray(p.subparts) && p.subparts.length) row.subparts = bankParts(p.subparts);
    return row;
  });
}

const plan = slots.map((s) => {
  const q = s.question;
  const png = figuresDir ? join(resolve(figuresDir), `Q${s.pos}.figure.png`) : null;
  const hasPng = !!png && existsSync(png);
  if (q.needs_figure && !hasPng) problems.push(`Q${s.pos} needs a figure but ${png ?? '(no --figures dir)'} is missing`);
  const storagePath = `gce-sets/${setKey}/Q${s.pos}.png`;
  return { pos: s.pos, topic: s.topic, marks: Number(q.total_marks || 0), needsFigure: !!q.needs_figure, png: hasPng ? png : null, storagePath, item: `${setKey}-Q${s.pos}` };
});

console.log(`${paper.key} seed ${paper.seed ?? '?'} → ${SET_SCHOOL} · ${examType} · Paper ${paperNo} · level ${level} · year ${year}`);
console.log(`${slots.length} questions · ${sum} marks (paper total ${paper.total}) · ${plan.filter((p) => p.needsFigure).length} figures`);
for (const p of plan) {
  console.log(`  Q${String(p.pos).padStart(2)}  [${String(p.marks).padStart(2)}]  ${p.topic}${p.needsFigure ? (p.png ? '  🖼 ' + basename(p.png) : '  🖼 MISSING') : ''}`);
}
if (problems.length) {
  console.error('\nNot publishable:');
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
if (dry) { console.log('\n--dry: nothing written.'); process.exit(0); }

// ------------------------------------------------------------- publish ----
const env = loadEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) { console.error('SUPABASE_URL / SUPABASE_SECRET_KEY not found'); process.exit(2); }
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

if (retract) {
  const { data, error } = await sb.from('questions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('school', SET_SCHOOL).eq('exam_type', examType).eq('level', level).eq('paper', paperNo)
    .is('deleted_at', null).select('id');
  if (error) { console.error('retract failed: ' + error.message); process.exit(1); }
  console.log(`\nretracted ${data?.length ?? 0} rows of ${setKey}`);
  process.exit(0);
}

const publishedAt = new Date().toISOString();
let inserted = 0, updated = 0;
for (const p of plan) {
  const s = slots.find((x) => x.pos === p.pos);
  const q = s.question;
  let figureUrl = null;
  if (p.png) {
    const { error } = await sb.storage.from(BUCKET).upload(p.storagePath, readFileSync(p.png), { contentType: 'image/png', upsert: true });
    if (error) { console.error(`Q${p.pos} figure upload failed: ${error.message}`); process.exit(1); }
    figureUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.storagePath}`;
  }
  const topics = Array.isArray(q.topics) && q.topics.length ? q.topics : [s.topic];
  const row = {
    question_text: String(q.stem ?? '').trim(),
    answer: q.answer != null && String(q.answer).trim() ? String(q.answer).trim() : null,
    parts: bankParts(q.parts),
    total_marks: p.marks,
    topics,
    level,
    school: SET_SCHOOL,
    year,
    exam_type: examType,
    paper: paperNo,
    question_number: String(p.pos),
    difficulty: 'Standard',
    has_image: !!figureUrl,
    figure_url: figureUrl,
    image_url: null,
    images: [],
    image_size: 'md',
    verified: false,
    ai_generated: true,
    solution: q.solution ?? null,
    solution_source: 'fable_session',
    deleted_at: null,
    gen_meta: {
      kind: 'gce-set',
      set_key: setKey,
      set_item: p.item,
      key: paper.key,
      seed: paper.seed ?? null,
      set: setNo,
      slot: p.pos,
      paper_total: paper.total,
      prompt_version: paper.prompt_version ?? null,
      models: paper.models ?? null,
      gates: s.gates ? { pass: s.gates.pass ?? null, novelty: s.gates.novelty ?? null } : null,
      blind_agree: Array.isArray(s.verdict?.parts) ? s.verdict.parts.every((v) => v.agree) : null,
      figure: figureUrl ? { file: basename(p.png), description: q.figure_description ?? null } : null,
      syllabus_check: q.syllabus_check ?? null,
      originality_note: q.originality_note ?? null,
      source_json: basename(paperPath),
      published_at: publishedAt,
    },
  };
  const { data: existing, error: selErr } = await sb.from('questions').select('id').eq('gen_meta->>set_item', p.item).limit(1);
  if (selErr) { console.error(`Q${p.pos} lookup failed: ${selErr.message}`); process.exit(1); }
  if (existing?.length) {
    const { error } = await sb.from('questions').update(row).eq('id', existing[0].id);
    if (error) { console.error(`Q${p.pos} update failed: ${error.message}`); process.exit(1); }
    updated++;
    console.log(`  Q${p.pos} updated ${existing[0].id}`);
  } else {
    const { data, error } = await sb.from('questions').insert(row).select('id').single();
    if (error) { console.error(`Q${p.pos} insert failed: ${error.message}`); process.exit(1); }
    inserted++;
    console.log(`  Q${p.pos} inserted ${data.id}`);
  }
}
console.log(`\n${setKey}: ${inserted} inserted, ${updated} updated — students on /app/print see "${examType} · Paper ${paperNo}" once the whole paper is in.`);
