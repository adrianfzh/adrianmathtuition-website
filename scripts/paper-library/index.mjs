#!/usr/bin/env node
// The exam library → Supabase (SPEC-PAPER-MATCH phase 2; Adrian, 7 Sep 2026:
// "is it better if the exam library is in supabase?" → yes, "Do it").
//
// Target list = the files the question bank was built from (questions.source_file),
// so the library holds exactly the papers the marker can ground on. Each PDF is
// found by name under the Dropbox exam folder on this Mac, uploaded to the
// private 'paper-library' bucket, and indexed in paper_library keyed the way
// lib/paper-key bankFilterFor names a paper: (school, year, level, paper).
//
//   node scripts/paper-library/index.mjs           # dry run: found / missing / would upload
//   node scripts/paper-library/index.mjs --apply   # upload + upsert (skips unchanged by sha256)
//   node scripts/paper-library/index.mjs --apply --only=GCE   # a school filter, e.g. GCE
//
// DOCX sources (1,120 of them) are listed but not uploaded: the marker reads PDF
// pages. A Word export job is the follow-up.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7) || null;
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '').trim()]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ROOTS = [
  path.join(process.env.HOME, 'Library/CloudStorage/Dropbox/1 ONLINE LESSONS/3 Exam Papers'),
  path.join(process.env.HOME, 'Dropbox/1 ONLINE LESSONS/3 Exam Papers'),
].filter(p => fs.existsSync(p));
if (!ROOTS.length) { console.error('exam folder not found on this Mac'); process.exit(1); }
const ROOT = ROOTS[0];
const BUCKET = 'paper-library';

export function kindOf(name) {
  const n = String(name).toLowerCase();
  if (/solution|answer|marking scheme|mark scheme|\bms\b|\bans\b/.test(n)) return 'solutions';
  return 'questions';
}
export function keyOf({ level, year, paper, school }) {
  return `${String(level).toLowerCase()} ${year} p${paper} ${String(school).toLowerCase()}`.replace(/\s+/g, ' ').trim();
}
const safe = s => String(s).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');

// 1. the target list from the bank
const { data: rows, error } = await sb.rpc('exec_sql', {}).then(() => ({ data: null, error: 'unused' })).catch(() => ({ data: null, error: null }));
let targets = [];
{
  let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await sb.from('questions').select('source_file, school, year, level, paper, exam_type')
      .is('deleted_at', null).not('source_file', 'is', null).range(from, from + page - 1);
    if (error) { console.error(error.message); process.exit(1); }
    targets.push(...data); if (data.length < page) break; from += page;
  }
}
const byFile = new Map();
for (const r of targets) {
  if (!r.source_file || !r.school || !r.year || !r.level || !r.paper || !/^\d+$/.test(String(r.paper))) continue;
  if (ONLY && String(r.school).toUpperCase() !== ONLY.toUpperCase()) continue;
  const base = path.basename(r.source_file);
  if (!byFile.has(base)) byFile.set(base, { file: base, school: r.school, year: r.year, level: r.level, paper: String(r.paper), exam: r.exam_type || null, n: 0 });
  byFile.get(base).n++;
}
const pdfs = [...byFile.values()].filter(t => /\.pdf$/i.test(t.file));
const docx = [...byFile.values()].filter(t => /\.docx?$/i.test(t.file));
console.log(`bank sources: ${byFile.size} files (${pdfs.length} pdf, ${docx.length} docx) in ${ROOT}`);

// 2. locate on disk (metadata only — Dropbox smart sync downloads on read, not on find).
// Two homes: the Dropbox exam folder (original names) and the extraction fleet's
// paper bank ~/Desktop/AdrianMath/papers (the bank's OWN file names, with
// ".flagged" / ".done" suffixes once processed; ".icloud_evicted" means the bytes
// are not on this Mac — those are reported, not read; a recursive find over that
// iCloud folder stalls, so it is listed one level deep only).
const listing = execFileSync('find', [ROOT, '-type', 'f', '-iname', '*.pdf'], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\n').filter(Boolean);
const byBase = new Map();
for (const p of listing) { const b = path.basename(p).toLowerCase(); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(p); }
const BANK_DIR = path.join(process.env.HOME, 'Desktop/AdrianMath/papers');
const evicted = new Set();
if (fs.existsSync(BANK_DIR)) {
  for (const name of fs.readdirSync(BANK_DIR)) {
    const m = name.match(/^(.+?\.pdf)((\.[a-z_]+)*)$/i);
    if (!m) continue;
    const base = m[1].toLowerCase();
    if (/icloud_evicted/i.test(m[2] || '')) { evicted.add(base); continue; }
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(path.join(BANK_DIR, name));
  }
}
const found = [], missing = [];
for (const t of pdfs) { const hits = byBase.get(t.file.toLowerCase()); if (hits) found.push({ ...t, path: hits[0], dupes: hits.length - 1 }); else missing.push(t); }
const evictedMissing = missing.filter(m => evicted.has(m.file.toLowerCase()));
console.log(`found on disk: ${found.length} · missing: ${missing.length} (of which ${evictedMissing.length} are in the paper bank but iCloud-evicted on this Mac)${missing.length ? ' — first: ' + missing.slice(0, 4).map(m => m.file).join(' | ') : ''}`);
console.log(`kinds: ${found.filter(f => kindOf(f.file) === 'questions').length} questions, ${found.filter(f => kindOf(f.file) === 'solutions').length} solutions`);
if (!APPLY) { console.log('(dry run — add --apply to upload)'); process.exit(0); }

// 3. upload + upsert, skipping unchanged
const { data: existing } = await sb.from('paper_library').select('key, kind, sha256');
const have = new Map((existing || []).map(e => [`${e.key}|${e.kind}`, e.sha256]));
let up = 0, same = 0, failed = 0;
for (const f of found) {
  const key = keyOf(f), kind = kindOf(f.file);
  try {
    const buf = fs.readFileSync(f.path);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (have.get(`${key}|${kind}`) === sha) { same++; continue; }
    const objectPath = `${safe(f.level)}/${f.year}/${safe(f.school)}/p${f.paper}/${kind}.pdf`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(objectPath, buf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { error: rowErr } = await sb.from('paper_library').upsert({
      key, kind, storage_path: objectPath, source_file: f.file, source_folder: path.relative(ROOT, path.dirname(f.path)),
      level: f.level, year: f.year, paper: `p${f.paper}`, school: f.school, size_bytes: buf.length, sha256: sha, indexed_at: new Date().toISOString(),
    }, { onConflict: 'key,kind' });
    if (rowErr) throw new Error(rowErr.message);
    up++; if (up % 25 === 0) console.log(`  … ${up} uploaded`);
  } catch (e) { failed++; console.error('FAILED', f.file, String(e.message).slice(0, 120)); }
}
console.log(`done: ${up} uploaded, ${same} unchanged, ${failed} failed, ${missing.length} not on disk`);
