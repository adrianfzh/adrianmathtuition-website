#!/usr/bin/env node
// scripts/tag-untagged-papers.mjs — attach marked scripts to the student whose
// name is already in the paper name.
//
// 118 of 132 marked scripts had no student on them, and an untagged run is a
// dead end: it cannot be released, the 📘 sheet button refuses it, and it never
// shows under Marked papers on the student's profile. Marked, paid for, and
// unreachable by everything downstream.
//
// The names were there all along — "sophie am tys 2021 p1", "chloe em tys 2022
// p1". This matches the leading words of the paper name against the student
// list and proposes the tag.
//
//   node scripts/tag-untagged-papers.mjs                 # dry run, shows every proposal
//   node scripts/tag-untagged-papers.mjs --apply
//   node scripts/tag-untagged-papers.mjs --revert <batch>
//
// It will not guess. A first name shared by two students, or a paper called
// "worksheet", is reported and left alone — a script filed under the wrong
// student is worse than one filed under nobody, because the wrong student's
// profile then lies about what they have done.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');
const REVERT = revertIdx > -1 ? process.argv[revertIdx + 1] : null;
const BATCH = `tag-${new Date().toISOString().slice(0, 10)}`;

if (REVERT) {
  const { data } = await sb.from('paper_tag_log').select('run_id').eq('batch', REVERT);
  for (const r of data ?? []) {
    await sb.from('paper_marking_runs').update({ student_id: null, student_name: null }).eq('id', r.run_id);
  }
  await sb.from('paper_tag_log').delete().eq('batch', REVERT);
  console.log(`untagged ${(data ?? []).length} script(s) from batch ${REVERT}`);
  process.exit(0);
}

// ── students ────────────────────────────────────────────────────────────────
const students = [];
let offset = '';
do {
  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/Students?fields%5B%5D=Student%20Name&pageSize=100${offset ? `&offset=${offset}` : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!r.ok) { console.error(`airtable ${r.status}`); process.exit(1); }
  const d = await r.json();
  for (const rec of d.records ?? []) {
    const name = (rec.fields['Student Name'] || '').trim();
    if (name) students.push({ id: rec.id, name });
  }
  offset = d.offset || '';
} while (offset);
console.log(`${students.length} students on file`);

// Key on the squashed first name ("Si Jia" and "sijia" are the same person to a
// filename), and remember every student who answers to it so a shared first
// name can be refused rather than guessed.
const squash = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const byFirst = new Map();
const addKey = (k, s, leading) => {
  if (!k) return;
  if (!byFirst.has(k)) byFirst.set(k, []);
  const list = byFirst.get(k);
  const seen = list.find(x => x.id === s.id);
  if (seen) { seen.leading = seen.leading || leading; return; }
  list.push({ ...s, leading });
};
for (const s of students) {
  const parts = s.name.split(/\s+/).filter(Boolean);
  // Airtable holds names surname-first as often as not — "Tan Sijia", "Sun
  // Wanqing", "Goh Rui En Megan" — while a paper is titled by the name Adrian
  // calls them, which can be any token in there. So key on EVERY token and
  // every adjacent pair joined (a two-word given name is typed as one in a
  // filename: "Si Jia" → "sijia"), plus the whole name.
  //
  // Keying this widely makes common surnames collide, and that is the point:
  // a paper called "tan …" then matches several students, and the ambiguity
  // rule refuses it rather than picking one.
  for (let i = 0; i < parts.length; i++) {
    addKey(squash(parts[i]), s, i === 0);
    if (i + 1 < parts.length) addKey(squash(parts[i] + parts[i + 1]), s, i === 0);
  }
  addKey(squash(s.name), s, true);
}

// ── untagged runs ───────────────────────────────────────────────────────────
const { data: runs, error } = await sb.from('paper_marking_runs')
  .select('id, paper_name, created_at, total_awarded, total_max')
  .not('total_max', 'is', null).is('student_id', null)
  .order('created_at', { ascending: false });
if (error) { console.error(error.message); process.exit(1); }

const matched = [], ambiguous = [], unmatched = [];
for (const run of runs ?? []) {
  const words = String(run.paper_name || '').trim().split(/\s+/);
  // Try the first word, then the first two joined — "si jia" as well as "sijia".
  const candidates = [
    squash(words[0] || ''),
    squash((words[0] || '') + (words[1] || '')),
    squash((words[0] || '') + (words[1] || '') + (words[2] || '')),
  ].filter(Boolean);
  let hit = null;
  for (const c of candidates) {
    const found = byFirst.get(c);
    if (!found) continue;
    if (found.length === 1) { hit = { student: found[0] }; break; }
    // Several students answer to this name. Prefer the one it LEADS — "Isabelle
    // Toh Si Xian" over "Eva Isabelle Wong" for a paper called "isabelle …":
    // a paper is titled by the name Adrian calls them, which is the name they
    // lead with. Only when that still leaves more than one is it a real tie
    // (Chloe Zhang and Chloe Gng both lead with Chloe) and refused.
    const leads = found.filter(f => f.leading);
    if (leads.length === 1) { hit = { student: leads[0] }; break; }
    hit = { ambiguous: leads.length ? leads : found }; break;
  }
  if (!hit) unmatched.push(run);
  else if (hit.ambiguous) ambiguous.push({ run, students: hit.ambiguous });
  else matched.push({ run, student: hit.student });
}

console.log(`\n${matched.length} can be tagged · ${ambiguous.length} ambiguous · ${unmatched.length} no name in the title\n`);
const byStudent = new Map();
for (const m of matched) byStudent.set(m.student.name, (byStudent.get(m.student.name) || 0) + 1);
for (const [name, n] of [...byStudent].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} → ${name}`);

if (ambiguous.length) {
  console.log('\nAMBIGUOUS — two students answer to this name, so left alone:');
  for (const a of ambiguous.slice(0, 10)) console.log(`  "${a.run.paper_name}" → ${a.students.map(s => s.name).join(' / ')}`);
}
if (unmatched.length) {
  console.log('\nNO MATCH — left alone:');
  const names = [...new Set(unmatched.map(r => String(r.paper_name || '').split(/\s+/)[0]))];
  console.log(`  ${names.slice(0, 30).join(', ')}${names.length > 30 ? ` … (${names.length} distinct)` : ''}`);
  console.log('  (a real first name here means the student is not in Airtable under that spelling)');
}

if (!APPLY) { console.log('\ndry run — re-run with --apply to tag them'); process.exit(0); }

let done = 0;
for (const { run, student } of matched) {
  await sb.from('paper_tag_log').insert({ run_id: run.id, batch: BATCH, student_id: student.id, student_name: student.name });
  const { error: upErr } = await sb.from('paper_marking_runs')
    .update({ student_id: student.id, student_name: student.name }).eq('id', run.id);
  if (upErr) console.log(`✗ ${run.paper_name}: ${upErr.message}`); else done++;
}
console.log(`\ntagged ${done} script(s) · revert with: node scripts/tag-untagged-papers.mjs --revert ${BATCH}`);
