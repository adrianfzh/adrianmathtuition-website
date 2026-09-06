#!/usr/bin/env node
// One-off sweep of /Students in Dropbox → the four fixed names per paper folder
// (Adrian, 6 Sep 2026). Nothing is deleted: every file that is not one of the
// four is MOVED into the folder's "_versions/" subfolder, so the sweep is
// reversible by hand. Dry-run by default; --apply performs the moves.
//
//   node scripts/students-folder-sweep.mjs            # plan only
//   node scripts/students-folder-sweep.mjs --apply    # do it (writes scripts/.sweep-log.json)
//   node scripts/students-folder-sweep.mjs --undo     # move everything back, newest log first
//
// Rules per paper folder (one level under /Students/<name>/):
//   Marked (AI).pdf                      → 1 Marked by AI.pdf
//   newest Marked (Adrian)*.pdf          → 2 Marked by Adrian.pdf   (others → _versions)
//   newest .docx not "(worker original)" → 3 Practice Again.docx    (others → _versions)
//   its PDF twin (same stem), else the newest sheet PDF → 3 Practice Again.pdf (others → _versions)
//   anything else (his own exports, scans) → _versions/   — listed so he can check
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const LOG = path.join(process.cwd(), 'scripts', '.sweep-log.json');
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '').trim()]; }));
const API = 'https://api.dropboxapi.com/2';
let token = null;
async function auth() {
  if (token) return token;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.DROPBOX_REFRESH_TOKEN });
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${env.DROPBOX_APP_KEY}:${env.DROPBOX_APP_SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error('token: ' + await r.text());
  token = (await r.json()).access_token; return token;
}
async function rpc(ep, arg) {
  const r = await fetch(`${API}${ep}`, { method: 'POST', headers: { Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(arg) });
  if (!r.ok) throw new Error(`${ep}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function list(p) {
  let r = await rpc('/files/list_folder', { path: p, recursive: false });
  let entries = r.entries;
  while (r.has_more) { r = await rpc('/files/list_folder/continue', { cursor: r.cursor }); entries = entries.concat(r.entries); }
  return entries;
}
const stem = n => n.replace(/\.[^.]+$/, '').trim().toLowerCase();
const newest = arr => [...arr].sort((a, b) => String(b.server_modified || '').localeCompare(String(a.server_modified || '')))[0];

if (UNDO) {
  // Reverse every recorded move, last first. A file Adrian has since renamed or
  // removed just reports as failed; nothing else is touched.
  const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
  if (!log.length) { console.log('nothing to undo (no scripts/.sweep-log.json)'); process.exit(0); }
  let back = 0, failed = 0;
  for (const m of [...log].reverse()) {
    try { await rpc('/files/move_v2', { from_path: m.to, to_path: m.from, autorename: false }); back++; }
    catch (e) { failed++; console.error('FAILED', m.to, '→', m.from, String(e.message).slice(0, 120)); }
  }
  fs.writeFileSync(LOG, '[]');
  console.log(`undone: ${back} moved back, ${failed} failed`);
  process.exit(0);
}

const plan = []; // { folder, from, to }
const students = (await list('/Students')).filter(e => e['.tag'] === 'folder' && e.name !== '_Untagged');
for (const st of students) {
  const papers = (await list(st.path_lower)).filter(e => e['.tag'] === 'folder');
  for (const pf of papers) {
    const files = (await list(pf.path_lower)).filter(e => e['.tag'] === 'file');
    if (!files.length) continue;
    const keep = new Map(); // final name → entry
    const rest = [];
    const byName = n => files.filter(f => f.name.toLowerCase() === n.toLowerCase());
    // 1 — AI copy
    const ai = byName('Marked (AI).pdf')[0] || byName('1 Marked by AI.pdf')[0];
    if (ai) keep.set('1 Marked by AI.pdf', ai);
    // 2 — his copy
    const adrian = files.filter(f => /^(2 Marked by Adrian|Marked \(Adrian\)).*\.pdf$/i.test(f.name));
    if (adrian.length) { const n = newest(adrian); keep.set('2 Marked by Adrian.pdf', n); rest.push(...adrian.filter(f => f !== n)); }
    // 3 — the sheet: newest docx (not the worker original) + its PDF twin
    const docx = files.filter(f => /\.docx$/i.test(f.name) && !/worker original/i.test(f.name));
    const sheetPdfs = files.filter(f => /\.pdf$/i.test(f.name) && /practice again|advanced practice/i.test(f.name) && !/^4 /.test(f.name));
    if (docx.length) {
      const d = newest(docx); keep.set('3 Practice Again.docx', d); rest.push(...files.filter(f => /\.docx$/i.test(f.name) && f !== d));
      const twin = sheetPdfs.find(f => stem(f.name) === stem(d.name)) || newest(sheetPdfs);
      if (twin) { keep.set('3 Practice Again.pdf', twin); rest.push(...sheetPdfs.filter(f => f !== twin)); }
    } else if (sheetPdfs.length) { const t = newest(sheetPdfs); keep.set('3 Practice Again.pdf', t); rest.push(...sheetPdfs.filter(f => f !== t)); }
    // 4 — returned
    const ret = byName('4 Practice Again — returned.pdf')[0]; if (ret) keep.set('4 Practice Again — returned.pdf', ret);
    // everything else
    const kept = new Set([...keep.values()]);
    for (const f of files) if (!kept.has(f) && !rest.includes(f)) rest.push(f);
    for (const [name, f] of keep) if (f.name !== name) plan.push({ folder: pf.path_display, from: f.name, to: name });
    for (const f of rest) plan.push({ folder: pf.path_display, from: f.name, to: `_versions/${f.name}` });
  }
}
const renames = plan.filter(p => !p.to.startsWith('_versions/'));
const versions = plan.filter(p => p.to.startsWith('_versions/'));
console.log(`${students.length} students · ${plan.length} moves planned: ${renames.length} renames, ${versions.length} into _versions/`);
const byFolder = {}; for (const p of plan) (byFolder[p.folder] ||= []).push(`${p.from} → ${p.to}`);
for (const [f, moves] of Object.entries(byFolder)) console.log(`\n${f.replace('/Apps/AdrianMathNotes/Students/', '')}\n  ` + moves.join('\n  '));
if (!APPLY) { console.log('\n(dry run — add --apply to perform the moves)'); process.exit(0); }
let done = 0, failed = 0;
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
for (const p of plan) {
  const from = `${p.folder}/${p.from}`.replace('/Apps/AdrianMathNotes', ''), to = `${p.folder}/${p.to}`.replace('/Apps/AdrianMathNotes', '');
  try {
    const r = await rpc('/files/move_v2', { from_path: from, to_path: to, autorename: true });
    // record the REAL destination (autorename may have appended " (1)") so --undo can find it
    log.push({ from, to: r.metadata.path_display || to, at: new Date().toISOString() });
    fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
    done++;
  } catch (e) { failed++; console.error('FAILED', from, '→', to, String(e.message).slice(0, 120)); }
}
console.log(`\napplied: ${done} moved, ${failed} failed — log in scripts/.sweep-log.json (node scripts/students-folder-sweep.mjs --undo reverses it)`);
