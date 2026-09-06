#!/usr/bin/env node
// Second pass of the exam-library index (Adrian, 7 Sep 2026: "So do the 314
// missing papers"): the bank remembers each paper by the tidy name the
// extraction fleet gave it; Dropbox holds the same paper under the school's own
// name. Match by MEANING instead — read school / year / level / paper off the
// Dropbox filename and folder the way lib/paper-key does, and upload any file
// that names a bank paper the library still lacks.
//
//   node scripts/paper-library/match-by-meaning.mjs           # plan
//   node scripts/paper-library/match-by-meaning.mjs --apply   # upload + index
//   … --all      # ALSO index every Dropbox exam PDF whose name yields a KNOWN school + year + level + paper,
//                 # even when the bank has no rows for it (Adrian, 7 Sep 2026: "what about the other exam pdfs") —
//                 # the marker still grounds on the printed questions; only bank-known schools, so no junk keys
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const { parsePaperKey, SCHOOL_ALIASES } = require(path.join(process.env.HOME, 'dev/adrianmath-telegram-math-bot/lib/paper-key.js'));
const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '').trim()]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ROOT = [path.join(process.env.HOME, 'Library/CloudStorage/Dropbox/1 ONLINE LESSONS/3 Exam Papers'), path.join(process.env.HOME, 'Dropbox/1 ONLINE LESSONS/3 Exam Papers')].find(p => fs.existsSync(p));
const BUCKET = 'paper-library';

// The top folder names the bank level better than any filename does.
function levelFromFolder(top) {
  const t = top.toUpperCase();
  const na = /\(NA\)|\bNA\b|\(G2\)/.test(t), nt = /\(NT\)|\(G1\)/.test(t);
  if (/^AM S3/.test(t)) return na ? 'S3_AM_NA' : 'S3_AM';
  if (/^AM S4|^AM\b/.test(t)) return na ? 'AM_NA' : 'AM';
  if (/^EM S1/.test(t)) return 'S1';
  if (/^EM S2/.test(t)) return 'S2';
  if (/^EM S3/.test(t)) return nt ? 'S3_EM_NT' : na ? 'S3_EM_NA' : 'S3_EM';
  if (/^EM S4|^EM\b/.test(t)) return na ? 'EM_NA' : 'EM';
  if (/H1/.test(t)) return 'JC2_H1';
  if (/JC1|J1/.test(t)) return 'JC1';
  if (/H2|JC/.test(t)) return 'JC2';
  return null;
}
const STOP = /\b(secondary|sec|school|sch|high|ss|hs|the|of|prelim|preliminary|exam|examination|paper|questions?|qp|solutions?|answers?|ms|marking|scheme|final|end|year|mid|mye|eoy|sa1|sa2|wa1|wa2|ca1|ca2|promo|promotional|tys|gce|level|o|a|amath|emath|math|maths|mathematics|additional|elementary|express|na|nt|ip|integrated|programme|program|g1|g2|g3|p1|p2|p\d|\d+)\b/gi;
const schoolTokens = s => String(s || '').toLowerCase().replace(/[()\-_.,'’]/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
const kindOf = n => (/solution|answer|marking scheme|mark scheme|\bms\b|\bans\b/i.test(n) ? 'solutions' : 'questions');
const safe = s => String(s).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');

// 1. bank papers not yet in the library
let bank = []; { let from = 0; for (;;) { const { data } = await sb.from('questions').select('school, year, level, paper').is('deleted_at', null).range(from, from + 999); bank.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000; } }
const { data: lib } = await sb.from('paper_library').select('school, year, level, paper, kind');
const have = new Set((lib || []).map(r => `${r.school}|${r.year}|${r.level}|${r.paper}|${r.kind}`));
const wanted = new Map();
for (const r of bank) {
  if (!r.school || !r.year || !r.level || !/^\d+$/.test(String(r.paper))) continue;
  const k = `${r.school}|${r.year}|${r.level}|p${r.paper}`;
  if (!wanted.has(k)) wanted.set(k, { school: r.school, year: r.year, level: r.level, paper: `p${r.paper}`, hasQ: have.has(`${k}|questions`) || have.has(`${k}|combined`), hasS: have.has(`${k}|solutions`) || have.has(`${k}|answers`) || have.has(`${k}|combined`) });
}
const missing = [...wanted.values()].filter(w => !w.hasQ);
console.log(`bank papers: ${wanted.size} · without questions in the library: ${missing.length}`);

// 2. read every Dropbox PDF's meaning from its folder + name
const listing = execFileSync('find', [ROOT, '-type', 'f', '-iname', '*.pdf'], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\n').filter(Boolean);
const files = [];
for (const p of listing) {
  const rel = path.relative(ROOT, p); const parts = rel.split('/'); const top = parts[0]; const name = parts[parts.length - 1];
  if (/question bank|\bqb\b|revision|notes|worksheet|topical|by topic|keywords/i.test(rel) && !/prelim|tys|gce|o level|a level/i.test(name)) continue;
  // A multi-year compilation ("TYS 1982-1998", "2008-2019") is not one paper and is far
  // over the upload limit; the per-year papers are what the marker attaches.
  if (/\b(19|20)\d\d\s*[-–]\s*(19|20)\d\d\b/.test(name)) continue;
  const parsed = parsePaperKey({ paperName: `${parts.slice(1, -1).join(' ')} ${name.replace(/\.pdf$/i, '')}` });
  let level = levelFromFolder(top) || (parsed.level === 'AM' ? 'AM' : parsed.level === 'EM' ? 'EM' : parsed.level === 'H2' ? 'JC2' : null);
  // JC promos and H1 sit under the same "H2 JC" tree: the path says which year / syllabus.
  if (level === 'JC2' && /\bpromo|\bjc ?1\b|\bj1\b|year ?5|\by5\b/i.test(rel)) level = 'JC1';
  if ((level === 'JC2' || level === 'JC1') && /\bh1\b/i.test(rel) && !/\bh2\b/i.test(name)) level = 'JC2_H1';
  // Sec 3 papers filed under the S4 folders say so in the path or name.
  if (level === 'AM' && /\bsec ?3\b|\bs3\b/i.test(rel)) level = 'S3_AM';
  if (level === 'EM' && /\bsec ?3\b|\bs3\b/i.test(rel)) level = 'S3_EM';
  const year = parsed.year || (rel.match(/\b(20\d\d)\b/) || [])[1] && Number((rel.match(/\b(20\d\d)\b/) || [])[1]);
  const paper = parsed.paper ? `p${parsed.paper}` : null;
  const gce = parsed.exam === 'GCE' || /\btys\b|o[- ]level|gce/i.test(rel);
  const school = gce ? 'GCE' : (parsed.school || null);
  files.push({ path: p, rel, name, level, year, paper, school, gce, kind: kindOf(name), tokens: gce ? 'gce' : schoolTokens(parsed.school || name) });
}
console.log(`dropbox pdfs read: ${files.length}`);

// 3. match: same year + level + paper, and the school tokens agree
const bankTok = w => w.school === 'GCE' ? 'gce' : schoolTokens(w.school);
const plan = [];
const unmatched = [];
for (const w of missing) {
  const bt = bankTok(w);
  const cands = files.filter(f => f.year === w.year && f.level === w.level && (f.paper === w.paper || (f.gce && !f.paper)) && (f.gce ? w.school === 'GCE' : (f.tokens === bt || (bt && f.tokens && (f.tokens.includes(bt) || bt.includes(f.tokens))))));
  const q = cands.filter(c => c.kind === 'questions'); const s = cands.filter(c => c.kind === 'solutions');
  if (!q.length && !s.length) { unmatched.push(w); continue; }
  const pickQ = q.sort((a, b) => a.name.length - b.name.length)[0];
  const pickS = s.sort((a, b) => a.name.length - b.name.length)[0];
  if (pickQ) plan.push({ w, f: pickQ, kind: pickQ.paper ? 'questions' : 'combined' });
  if (pickS && !w.hasS) plan.push({ w, f: pickS, kind: pickS.paper ? 'solutions' : 'combined' });
}
// --all: every Dropbox PDF with a full, KNOWN key that the library lacks — a school is
// "known" when the bank has ever seen it (any level/year), so a parser leftover like
// "Final Exam" never becomes a school. TYS files without a paper number serve p1 + p2 as
// 'combined'.
if (ALL) {
  const knownSchools = new Map(); for (const r of bank) if (r.school) knownSchools.set(schoolTokens(r.school), r.school);
  const planned = new Set(plan.map(p => `${p.w.school}|${p.w.year}|${p.w.level}|${p.w.paper}|${p.kind}`));
  const byKey = new Map();
  for (const f of files) {
    if (!f.year || !f.level) continue;
    const school = f.gce ? 'GCE' : knownSchools.get(f.tokens);
    if (!school) continue;
    const papers = f.paper ? [f.paper] : (f.gce ? ['p1', 'p2'] : []);
    for (const paper of papers) {
      const kind = f.paper ? f.kind : 'combined';
      const k = `${school}|${f.year}|${f.level}|${paper}|${kind}`;
      if (have.has(k) || planned.has(k)) continue;
      const cur = byKey.get(k);
      if (!cur || f.name.length < cur.f.name.length) byKey.set(k, { w: { school, year: f.year, level: f.level, paper, hasS: false }, f, kind });
    }
  }
  for (const v of byKey.values()) { plan.push(v); planned.add(`${v.w.school}|${v.w.year}|${v.w.level}|${v.w.paper}|${v.kind}`); }
  console.log(`--all: ${byKey.size} more file(s) from Dropbox papers the bank does not hold`);
}
console.log(`matched: ${new Set(plan.map(p => `${p.w.school}|${p.w.year}|${p.w.level}|${p.w.paper}`)).size} papers (${plan.length} files) · still unmatched: ${unmatched.length}`);
for (const p of plan.slice(0, 14)) console.log(`  ${p.w.level} ${p.w.year} ${p.w.paper} ${p.w.school}  ←  ${p.f.rel}  [${p.kind}]`);
if (unmatched.length) console.log('  unmatched e.g.: ' + unmatched.slice(0, 8).map(u => `${u.level} ${u.year} ${u.paper} ${u.school}`).join(' | '));
if (!APPLY) { console.log('(dry run — add --apply to upload)'); process.exit(0); }

let up = 0, failed = 0;
for (const p of plan) {
  const { w, f, kind } = p;
  try {
    const buf = fs.readFileSync(f.path);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const objectPath = `${safe(w.level)}/${w.year}/${safe(w.school)}/${w.paper}/${kind}.pdf`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(objectPath, buf, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { error: rowErr } = await sb.from('paper_library').upsert({
      key: `${w.level.toLowerCase()} ${w.year} ${w.paper} ${w.school.toLowerCase()}`, kind, storage_path: objectPath, source_file: f.name,
      source_folder: path.dirname(f.rel), level: w.level, year: w.year, paper: w.paper, school: w.school, size_bytes: buf.length, sha256: sha, indexed_at: new Date().toISOString(),
    }, { onConflict: 'key,kind' });
    if (rowErr) throw new Error(rowErr.message);
    up++; if (up % 25 === 0) console.log(`  … ${up} uploaded`);
  } catch (e) { failed++; console.error('FAILED', f.rel, String(e.message).slice(0, 120)); }
}
console.log(`done: ${up} uploaded, ${failed} failed, ${unmatched.length} still unmatched`);
