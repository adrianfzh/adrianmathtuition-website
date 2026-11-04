#!/usr/bin/env node
// Challenge pilot (4 Nov 2026, Adrian: "yes" to "Start a pilot of 20 AI-made Challenge questions?").
// Saves AI-written Advanced/Challenge questions that passed the gates (two blind solves, a
// syllabus check, a named key step) as HIDDEN rows: ai_generated = true, verified = false, so the
// serve gate (lib/serve-gate.ts 'unverified') keeps every one away from students until Adrian taps
// Approve on /admin/generated?tab=pilot. Filed under the seed's sub-skills (source 'challenge-pilot')
// so an approved one lands in the right Practice topic.
//
//   node scripts/challenge-pilot/insert.mjs <final.json> [--dry]
//
// final.json = a list of the author shape (cid, level, topics, seed_id, seed_ref, harder_by,
// harder_how, proposed_label, key_step, methods, stem, parts, answer, total_marks, solution,
// mark_scheme) plus `gates` (blind answers, syllabus verdict). Idempotent on gen_meta.pilot_item.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const PILOT = 'challenge-2026-11';
const file = process.argv[2];
const dry = process.argv.includes('--dry');
if (!file) { console.error('usage: insert.mjs <final.json> [--dry]'); process.exit(1); }

function loadEnv() {
  const { parse } = require('dotenv');
  const out = {};
  for (const p of [join(process.cwd(), '.env.local'), join(homedir(), 'dev', 'adrianmathtuition-website', '.env.local')]) {
    if (existsSync(p)) { Object.assign(out, parse(readFileSync(p, 'utf8'))); break; }
  }
  Object.assign(out, process.env);
  const url = (out.SUPABASE_URL ?? '').trim();
  const key = (out.SUPABASE_SECRET_KEY || out.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY missing (.env.local)');
  return { url, key };
}

const items = JSON.parse(readFileSync(file, 'utf8'));
const { createClient } = require('@supabase/supabase-js');
const env = loadEnv();
const sb = createClient(env.url, env.key, { auth: { persistSession: false } });

const DIFF = { Challenge: 'Challenging', Advanced: 'Advanced' };
let done = 0;
for (const it of items) {
  const item = `pilot-${PILOT}-${it.cid}`;
  const { data: exists } = await sb.from('questions').select('id').eq('gen_meta->>pilot_item', item).limit(1);
  if (exists?.length) { console.log(`${it.cid}: already saved (${exists[0].id})`); continue; }
  const seed = typeof it.seed_id === 'string' && /^[0-9a-f-]{36}$/.test(it.seed_id) ? it.seed_id : null;
  // Filing: explicit `subgroups` win; else the seed's filings inside THIS question's first topic;
  // else the busiest sub-skill of that topic (so an approved question lands under the right Practice topic).
  let filing = [];
  const topic = it.topics?.[0];
  const { data: topicSgs } = await sb.from('subgroups').select('id').eq('level', it.level).eq('topic', topic);
  const inTopic = new Set((topicSgs ?? []).map((r) => r.id));
  if (seed) {
    const { data } = await sb.from('question_subgroups').select('subgroup_id, is_primary').eq('question_id', seed);
    const mine = (data ?? []).filter((f) => inTopic.has(f.subgroup_id));
    filing = mine.filter((f) => f.is_primary).length ? mine.filter((f) => f.is_primary) : mine.slice(0, 1);
  }
  if (!filing.length && inTopic.size) {
    let best = null, bestN = -1;
    for (const id of inTopic) {
      const { count } = await sb.from('question_subgroups').select('question_id', { count: 'exact', head: true }).eq('subgroup_id', id);
      if ((count ?? 0) > bestN) { bestN = count ?? 0; best = id; }
    }
    if (best != null) filing = [{ subgroup_id: best, is_primary: true }];
  }
  if (Array.isArray(it.subgroups) && it.subgroups.length) filing = it.subgroups.map((id, i) => ({ subgroup_id: id, is_primary: i === 0 }));
  // A draft sometimes carries a literal backslash-n where a line break was meant (a LaTeX command
  // starting \\n — \\neq, \\ne, \\nu — is always followed by a lower-case letter).
  const nl = (t) => (typeof t === 'string' ? t.replace(/\\n(?![a-z])/g, '\n').replace(/\\"/g, '"') : t);
  it.stem = nl(it.stem); it.answer = nl(it.answer); it.solution = nl(it.solution);
  for (const p of it.parts ?? []) { p.text = nl(p.text); p.answer = nl(p.answer); }
  // A part with no letter is not a part: fold it into the stem (it would print as "()").
  for (const p of (it.parts ?? []).filter((p) => !String(p.label ?? '').replace(/[()\s]/g, ''))) {
    it.stem = [it.stem, p.text].filter(Boolean).join('\n\n');
    if (!it.answer && p.answer) it.answer = p.answer;
  }
  it.parts = (it.parts ?? []).filter((p) => String(p.label ?? '').replace(/[()\s]/g, ''));
  const parts = (it.parts ?? []).map((p) => ({ label: String(p.label).replace(/^\(|\)$/g, ''), text: p.text, marks: Number(p.marks) || 0, ...(p.answer ? { answer: p.answer } : {}) }));
  const now = new Date().toISOString();
  const row = {
    question_text: it.stem ?? '', parts, answer: it.answer ?? null, total_marks: it.total_marks,
    topics: it.topics, level: it.level, school: 'AdrianMath', year: 2026, exam_type: 'Challenge', paper: null, question_number: null,
    difficulty: DIFF[it.proposed_label] ?? 'Advanced', has_image: false, image_url: null, images: [], image_size: 'md',
    verified: false, ai_generated: true, twin_of: null, solution: it.solution, solution_source: 'opus_session', deleted_at: null,
    gen_meta: {
      kind: 'challenge-pilot', pilot: PILOT, pilot_item: item, note: `pilot:${PILOT}`,
      seed_id: seed, seed_ref: it.seed_ref ?? null, harder_by: it.harder_by, harder_how: it.harder_how,
      proposed_label: it.proposed_label, key_step: it.key_step, methods: it.methods, mark_scheme: it.mark_scheme,
      gates: it.gates ?? null, subgroups: filing.map((f) => f.subgroup_id),
      author_model: 'opus (Claude Code agent)', blind_model: 'opus (Claude Code agent) ×2', generated_at: now,
    },
  };
  if (dry) { console.log(`${it.cid}: dry — ${row.level} ${row.difficulty} ${row.topics.join('/')} filing=${filing.map((f) => f.subgroup_id).join(',') || 'NONE'}`); continue; }
  const { data: ins, error } = await sb.from('questions').insert(row).select('id').single();
  if (error) { console.error(`${it.cid}: insert failed — ${error.message}`); process.exitCode = 1; continue; }
  if (filing.length) {
    const rows = filing.map((f) => ({ question_id: ins.id, subgroup_id: f.subgroup_id, is_primary: !!f.is_primary, confidence: 1, source: 'challenge-pilot', reason: `pilot ${PILOT}, shape of ${it.seed_ref ?? 'seed'}` }));
    const { error: fe } = await sb.from('question_subgroups').upsert(rows, { onConflict: 'question_id,subgroup_id,source' });
    if (fe) console.warn(`${it.cid}: filing warning — ${fe.message}`);
  }
  done++;
  console.log(`${it.cid}: saved ${ins.id}`);
}
console.log(`${done} saved${dry ? ' (dry run)' : ''}`);
