#!/usr/bin/env node
// 🧹 The stale-doc sweeper — the MECHANICAL pass (Adrian, 5 Oct 2026: "stale-doc sweeper").
//
// Reads every instruction doc in both repos (and, on the Mac, the memory folder and
// ~/.claude/CLAUDE.md), pulls out the claims a machine can check, and checks each one
// against the code and the live database. No model call. The judgement pass (bot skill
// /doc-sweep) reads this output and the docs that changed.
//
//   node scripts/doc-sweep/check.mjs --web <website dir> --bot <bot dir>
//        [--memory <memory dir>] [--global <~/.claude/CLAUDE.md>]
//        [--json out.json] [--md out.md] [--changed-since <ISO date>]
//
// Env (optional): SUPABASE_URL + SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY_MAIN) for the
// main project's live table list; SUPABASE_URL_SCIENCE + SUPABASE_SERVICE_KEY_SCIENCE for
// the science project. Without them the table check falls back to the code alone.
// Exit 0 always (a report, not a gate); the summary line is the last line of stdout.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  judgeDoc, importance, switchTableClaims, switchStates, workerTimes, statedTimes,
  memoryIndexLinks, routeResolves,
} from './claims.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const here = path.dirname(new URL(import.meta.url).pathname);
const WEB = path.resolve(args.web || path.join(here, '../..'));
const BOT = args.bot ? path.resolve(args.bot) : null;
const MEM = args.memory ? path.resolve(args.memory.replace(/^~/, process.env.HOME)) : null;
const BANK = args.bank ? path.resolve(args.bank.replace(/^~/, process.env.HOME)) : null;
const GLOBAL = args.global ? path.resolve(args.global.replace(/^~/, process.env.HOME)) : null;

const git = (dir, a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const repos = { web: WEB, ...(BOT ? { bot: BOT } : {}) };

// ── the index ───────────────────────────────────────────────────────────────
const files = {};          // repo → Set of tracked paths
const basenames = new Map(); // basename → [repo:path]
const dirs = new Set();    // repo:dir
for (const [r, dir] of Object.entries(repos)) {
  files[r] = new Set(git(dir, ['ls-files']).split('\n').filter(Boolean));
  for (const f of files[r]) {
    const b = path.basename(f);
    if (!basenames.has(b)) basenames.set(b, []);
    basenames.get(b).push(`${r}:${f}`);
    let d = path.dirname(f);
    while (d && d !== '.') { dirs.add(`${r}:${d}`); d = path.dirname(d); }
  }
}

// every identifier token in the CODE of both repos (docs excluded, big data files skipped)
const CODE = /\.(ts|tsx|js|mjs|cjs|sh|py|sql|toml|ya?ml|json|swift|plist|txt|html|css|svg)$/;
const tokens = new Set();
const modelIds = new Set();
const botRouteStrings = new Set();
for (const [r, dir] of Object.entries(repos)) {
  for (const f of files[r]) {
    if (!CODE.test(f) || f.endsWith('.md')) continue;
    if (/^(_backups\/|_old\/|prompt_lint_reports\/)/.test(f)) continue;
    let st; try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
    if (st.size > 3_000_000) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/[A-Za-z_][A-Za-z0-9_]{4,}/g)) tokens.add(m[0]);
    for (const m of src.matchAll(/\b(claude-(?:opus|sonnet|haiku|fable)-[0-9][\w.-]*[0-9a-z]|gemini-[0-9][\w.-]*[0-9a-z]|gpt-[0-9][\w.-]*[0-9a-z])\b/g)) modelIds.add(m[1]);
    if (r === 'bot') for (const m of src.matchAll(/['"`](\/(?:api|admin|app)\/[\w\-\/:]+)/g)) botRouteStrings.add(m[1].replace(/\/:[\w]+/g, '/[x]'));
  }
}
// prompts the bot keeps as .txt/.md under prompts/ are code to the model — their names count too
for (const [r, dir] of Object.entries(repos)) for (const f of files[r]) {
  if (/^(prompts|ai\/subjects)\//.test(f) && /\.(txt|md)$/.test(f)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/[A-Za-z_][A-Za-z0-9_]{4,}/g)) tokens.add(m[0]);
  }
}

// the website's app entries (dirs holding page/route files), as segment arrays
const appEntries = [];
for (const f of files.web) {
  const m = f.match(/^src\/app\/(.*)\/(page|route)\.(tsx?|js)$/);
  if (m) appEntries.push(m[1].split('/'));
}
// next.config redirects count as live doors
let redirects = [];
try { redirects = [...fs.readFileSync(path.join(WEB, 'next.config.ts'), 'utf8').matchAll(/source:\s*'([^']+)'/g)].map(m => m[1].replace(/:[\w*]+/g, '[x]').split('/').filter(Boolean)); } catch {}

// history: deleted and renamed paths (one git log per repo)
const history = new Map(); // path → {kind, to, date, sha, repo}
for (const [r, dir] of Object.entries(repos)) {
  let out = '';
  try { out = git(dir, ['log', '--diff-filter=DR', '--name-status', '-M', '--format=@%h %as']); } catch { continue; }
  let sha = '', date = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) { [sha, date] = line.slice(1).split(' '); continue; }
    const p = line.split('\t');
    if (p[0] === 'D' && !history.has(p[1])) history.set(p[1], { kind: 'deleted', date, sha, repo: r });
    if (p[0]?.startsWith('R') && !history.has(p[1])) history.set(p[1], { kind: 'renamed', to: p[2], date, sha, repo: r });
  }
}
// follow rename chains to the live name
for (const h of history.values()) {
  let hops = 0;
  while (h.kind === 'renamed' && history.get(h.to)?.kind === 'renamed' && hops++ < 10) h.to = history.get(h.to).to;
  if (h.kind === 'renamed' && !files[h.repo].has(h.to)) { const next = history.get(h.to); if (next?.kind === 'deleted') Object.assign(h, { kind: 'deleted', date: next.date, sha: next.sha }); }
}

// the live tables (PostgREST's OpenAPI root lists every table and view)
async function liveTables(url, key) {
  if (!url || !key || /SENSITIVE/.test(key)) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const j = await res.json();
    return Object.keys(j.definitions || {});
  } catch { return null; }
}
const tableLists = await Promise.all([
  liveTables(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY_MAIN || process.env.SUPABASE_SERVICE_ROLE_KEY),
  liveTables(process.env.SUPABASE_URL_SCIENCE, process.env.SUPABASE_SERVICE_KEY_SCIENCE),
]);
const tables = tableLists.some(Boolean) ? new Set(tableLists.flat().filter(Boolean)) : null;

// vercel.json crons, the student switches, the worker's times
const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
const crons = vercel.crons || [];
const switches = switchStates(fs.readFileSync(path.join(WEB, 'src/lib/portal-beta.ts'), 'utf8'));

// the paper bank (Mac: ~/Desktop/AdrianMath, Fly: /data/bank) — tracked files and skills only, never a walk
if (BANK && fs.existsSync(path.join(BANK, '.git'))) { try { files.bank = new Set(git(BANK, ['ls-files']).split('\n').filter(Boolean)); for (const f of files.bank) { let d = path.dirname(f); while (d && d !== '.') { dirs.add(`bank:${d}`); d = path.dirname(d); } } } catch {} }
const skillNames = new Set();
if (BANK) try { for (const d of fs.readdirSync(path.join(BANK, '.claude/skills'))) skillNames.add(d); } catch {}
for (const [r] of Object.entries(repos)) for (const f of files[r]) { const m = f.match(/^\.claude\/skills\/([^/]+)\/SKILL\.md$/); if (m) skillNames.add(m[1]); }
try { for (const d of fs.readdirSync(path.join(process.env.HOME, '.claude/skills'))) skillNames.add(d); } catch {}

// ── resolution ──────────────────────────────────────────────────────────────
const PREFIXES = ['', 'src/', 'src/app/', 'src/components/', 'scripts/', 'worker/', 'worker/fly/'];
function pathExists(p, repo) {
  const pin = p.match(/^@(web|bot):(.*)$/);
  if (pin) return files[pin[1]] && (files[pin[1]].has(pin[2]) || dirs.has(`${pin[1]}:${pin[2].replace(/\/$/, '')}`)) ? p : null;
  if (repo === 'memory' && MEM && p.endsWith('.md') && !p.includes('/') && fs.existsSync(path.join(MEM, p))) return `memory:${p}`;
  const order = (repo === 'bot' ? ['bot', 'web'] : ['web', 'bot']).concat(files.bank ? ['bank'] : []);
  const isDir = p.endsWith('/');
  const q = p.replace(/\/$/, '');
  for (const r of order) {
    if (!files[r]) continue;
    for (const pre of PREFIXES) {
      if (isDir ? dirs.has(`${r}:${pre}${q}`) : files[r].has(pre + q)) return `${r}:${pre}${q}`;
      if (!isDir && dirs.has(`${r}:${pre}${q}`)) return `${r}:${pre}${q}`;
    }
  }
  if (!q.includes('/')) { const b = basenames.get(q); if (b) return b[0]; }
  // an untracked local file (settings.local.json, .env.local …) still exists on this machine
  for (const r of order) for (const pre of PREFIXES) if (repos[r] && fs.existsSync(path.join(repos[r], pre + q))) return `${r}:${pre}${q}`;
  // a path written relative to its folder (worker/plan-marking/run.sh written as plan-marking/run.sh)
  for (const r of order) if (files[r]) for (const f of files[r]) if (f.endsWith('/' + q)) return `${r}:${f}`;
  return null;
}
function pathHistory(p) {
  const q = p.replace(/^@\w+:/, '').replace(/\/$/, '');
  for (const pre of PREFIXES) { const h = history.get(pre + q); if (h) return { ...h, toAsWritten: h.to && pre && h.to.startsWith(pre) ? h.to.slice(pre.length) : h.to }; }
  for (const [k, h] of history) if (k.endsWith('/' + q)) return { ...h, toAsWritten: h.to };
  return null;
}
const routeExists = (r) => {
  const clean = r.replace(/[?#].*$/, '');
  if (routeResolves(clean, appEntries) || routeResolves(clean, redirects)) return true;
  if (botRouteStrings.has(clean)) return true;
  for (const s of botRouteStrings) if (s.startsWith(clean + '/') || clean.startsWith(s + '/')) return true;
  // a page under a folder (e.g. /admin/students) whose child pages exist counts as a section name
  return appEntries.some(e => ('/' + e.join('/')).startsWith(clean + '/'));
};
const ctxBase = {
  pathExists, pathHistory,
  hasToken: (t) => tokens.has(t),
  isTable: (t) => (tables ? tables.has(t) : null),
  routeExists,
  skillExists: (n) => skillNames.has(n),
  modelKnown: (id) => modelIds.has(id) || [...modelIds].some(m => m.startsWith(id + '-') || id.startsWith(m + '-')),
  crons, switches,
};

// ── the docs ────────────────────────────────────────────────────────────────
const DOC_RE = /^(CLAUDE\.md|[A-Z][A-Z0-9_-]*\.md|docs\/.*\.md|\.claude\/skills\/.*\/SKILL\.md|.*PROMPT[\w-]*\.md|worker\/.*\.md)$/;
const docs = [];
for (const [r, dir] of Object.entries(repos)) for (const f of files[r]) {
  if (!DOC_RE.test(f) || / \d+\.md$/.test(f) || /^(_old|_backups|node_modules)\//.test(f)) continue;
  if (/^(CHANGELOG|LICENSE|AUDIT|STATUS)\b/.test(f)) continue;
  docs.push({ repo: r, rel: f, abs: path.join(dir, f), label: `${r === 'web' ? 'website' : 'bot'}/${f}` });
}
if (MEM && fs.existsSync(MEM)) for (const f of fs.readdirSync(MEM)) if (f.endsWith('.md')) docs.push({ repo: 'memory', rel: f, abs: path.join(MEM, f), label: `memory/${f}` });
if (GLOBAL && fs.existsSync(GLOBAL)) docs.push({ repo: 'global', rel: 'CLAUDE.md', abs: GLOBAL, label: '~/.claude/CLAUDE.md' });

const findings = [];
for (const d of docs) {
  const text = fs.readFileSync(d.abs, 'utf8');
  for (const f of judgeDoc(text, { ...ctxBase, repo: d.repo === 'memory' ? 'memory' : d.repo === 'bot' ? 'bot' : 'web' })) findings.push({ doc: d.label, abs: d.abs, ...f });
}

// — the CLAUDE.md switch table vs portal-beta.ts —
{
  const lines = fs.readFileSync(path.join(WEB, 'CLAUDE.md'), 'utf8').split('\n');
  const rows = switchTableClaims(lines);
  const named = new Set(rows.map(r => r.name));
  for (const r of rows) {
    if (!(r.name in switches)) findings.push({ doc: 'website/CLAUDE.md', line: r.line, kind: 'switch', claim: r.name, actual: 'no such switch in src/lib/portal-beta.ts' });
    else if (r.open !== null && r.open !== switches[r.name] && !/SCIENCE_MARKING_OPEN/.test(r.name))
      findings.push({ doc: 'website/CLAUDE.md', line: r.line, kind: 'switch', claim: `${r.name} ${r.open ? 'open' : 'closed'}`, actual: `${switches[r.name] ? 'open' : 'closed'} in src/lib/portal-beta.ts`, fix: { table: true } });
  }
  const tableLine = rows.length ? rows[rows.length - 1].line : 0;
  for (const n of Object.keys(switches)) if (!named.has(n))
    findings.push({ doc: 'website/CLAUDE.md', line: tableLine, kind: 'switch', claim: `(no row for ${n})`, actual: `${n} exists in src/lib/portal-beta.ts (${switches[n] ? 'open' : 'closed'}) but the switch table has no row`, fix: { table: true } });
}

// — the Fly worker's times vs the switches page's "when" and the rhythm labels —
if (BOT) {
  const jobsSh = fs.readFileSync(path.join(BOT, 'worker/fly/jobs.sh'), 'utf8');
  const extra = fs.readdirSync(path.join(BOT, 'worker/fly')).filter(f => f.endsWith('.sh') && f !== 'jobs.sh').map(f => fs.readFileSync(path.join(BOT, 'worker/fly', f), 'utf8'));
  const times = workerTimes(jobsSh, extra);
  const wj = fs.readFileSync(path.join(WEB, 'src/lib/worker-jobs.ts'), 'utf8').split('\n');
  wj.forEach((line, i) => {
    const m = line.match(/key: '([a-z0-9-]+)'.*when: '([^']*)'/);
    if (!m || !times[m[1]]) return;
    const said = statedTimes(m[2]);
    if (!said.length) return;
    const real = times[m[1]];
    if (said.some(t => !real.includes(t))) findings.push({ doc: 'website/src/lib/worker-jobs.ts', line: i + 1, kind: 'worker_time', claim: `${m[1]} runs at ${said.join(' + ')}`, actual: `bot worker/fly runs it at ${real.join(' + ')}` });
  });
  const jh = fs.readFileSync(path.join(WEB, 'src/lib/job-health.ts'), 'utf8').split('\n');
  jh.forEach((line, i) => {
    const m = line.match(/^\s*'([a-z0-9-]+)':\s*\{[^}]*label: '([^']*)'/);
    if (!m || !times[m[1]]) return;
    const said = statedTimes(m[2]);
    if (said.length && said.some(t => !times[m[1]].includes(t))) findings.push({ doc: 'website/src/lib/job-health.ts', line: i + 1, kind: 'worker_time', claim: `${m[1]} label "${m[2]}"`, actual: `bot worker/fly runs it at ${times[m[1]].join(' + ')}` });
  });
}

// — memory: the index and the files agree —
if (MEM && fs.existsSync(path.join(MEM, 'MEMORY.md'))) {
  const idx = fs.readFileSync(path.join(MEM, 'MEMORY.md'), 'utf8');
  const links = memoryIndexLinks(idx);
  const present = new Set(fs.readdirSync(MEM).filter(f => f.endsWith('.md') && f !== 'MEMORY.md'));
  idx.split('\n').forEach((line, i) => { for (const l of memoryIndexLinks(line)) if (!present.has(l)) findings.push({ doc: 'memory/MEMORY.md', line: i + 1, kind: 'memory_index', claim: l, actual: 'the index links a memory file that does not exist' }); });
  const linked = new Set(links);
  // a file is reachable from the index directly, or through a [[wikilink]] in a linked file
  for (const f of present) if (!linked.has(f)) {
    const slug = f.replace(/\.md$/, '');
    const viaWiki = [...linked].some(l => { try { const t = fs.readFileSync(path.join(MEM, l), 'utf8'); return t.includes(`[[${slug}]]`) || t.includes(`(${f})`) || t.includes(f); } catch { return false; } });
    if (!viaWiki) findings.push({ doc: `memory/${f}`, line: 1, kind: 'memory_index', claim: f, actual: 'not in MEMORY.md and no indexed memory links to it' });
  }
}

// ── how sure: 'sure' = the code or the live system says otherwise; 'look' = worth a look ──
// A doc that describes plans (SPEC, IDEAS, briefings, dated hand-offs and findings) names
// things that were never built; those stay 'look' unless the thing was built and then removed.
const PLAN_DOC = /(SPEC-|IDEAS|BRIEFING|HANDOFF|FINDINGS|PLAN-|-20\d\d-\d\d)/;
const CODE_DIR = /^(@\w+:)?(src|lib|scripts|worker|ai|handlers|docs|\.claude|test|supabase|migrations|prompts|config|cron|ios-shell|sql)\//;
const removedFrom = new Map(); // token → 'web 2026-09-08' | ''
async function pickaxe(tok) {
  if (removedFrom.has(tok)) return removedFrom.get(tok);
  let hit = '';
  for (const [r, dir] of Object.entries(repos)) {
    try {
      const out = execFileSync('git', ['-C', dir, 'log', '-S', tok, '--format=%h %as', '-1', '--', '.', ':!*.md'], { encoding: 'utf8' }).trim();
      if (out) { hit = `${r === 'web' ? 'website' : 'bot'} ${out}`; break; }
    } catch {}
  }
  removedFrom.set(tok, hit);
  return hit;
}
for (const f of findings) {
  const plan = PLAN_DOC.test(f.doc);
  if (f.kind === 'name') {
    const hit = await pickaxe(f.claim);
    if (hit) { f.actual = `was in the code until ${hit.split(' ').slice(0, 1)} commit ${hit.split(' ')[1]} (${hit.split(' ')[2]}) — removed or renamed since`; f.tier = 'sure'; }
    else { f.actual = 'never in the code of either repo (an outside name, a plan, or a typo)'; f.tier = 'look'; }
  } else if (f.kind === 'path') {
    f.tier = /renamed|deleted|lives at/.test(f.actual) || (CODE_DIR.test(f.claim) && !plan) ? 'sure' : 'look';
    // a bare file name with no folder that never existed is a working file a skill makes (run.json, content.py) — not a claim
    if (f.tier === 'look' && !f.claim.includes('/')) f.drop = true;
  } else if (f.kind === 'route' || f.kind === 'skill' || f.kind === 'model' || f.kind === 'switch') {
    f.tier = plan ? 'look' : 'sure';
  } else f.tier = 'sure';
}

for (let i = findings.length - 1; i >= 0; i--) if (findings[i].drop) findings.splice(i, 1);

// ── output ──────────────────────────────────────────────────────────────────
for (const f of findings) f.score = importance(f.doc, f) + (f.tier === 'sure' ? 40 : 0);
findings.sort((a, b) => b.score - a.score || a.doc.localeCompare(b.doc) || a.line - b.line);
const byKind = {};
const byTier = { sure: 0, look: 0 };
for (const f of findings) { byKind[f.kind] = (byKind[f.kind] || 0) + 1; byTier[f.tier] = (byTier[f.tier] || 0) + 1; }

// ── --apply: the obvious corrections, in place, one line at a time ──────────
// Only a 'sure' finding with a {from, to} (a renamed file, an old Desktop repo path) in a doc
// that is not a plan; the line must still hold `from`. The caller reviews `git diff` and commits.
const applied = [];
if (args.apply) {
  const byFile = new Map();
  for (const f of findings) if (f.tier === 'sure' && f.fix?.from && f.fix?.to && f.abs && !PLAN_DOC.test(f.doc) && !f.doc.startsWith('memory/')) {
    if (!byFile.has(f.abs)) byFile.set(f.abs, []);
    byFile.get(f.abs).push(f);
  }
  for (const [abs, fs_] of byFile) {
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    let changedHere = 0;
    for (const f of fs_) {
      const i = f.line - 1;
      if (!lines[i] || !lines[i].includes(f.fix.from)) continue;
      lines[i] = lines[i].split(f.fix.from).join(f.fix.to);
      changedHere++; f.applied = true; applied.push(`${f.doc}:${f.line} ${f.fix.from} → ${f.fix.to}`);
    }
    if (changedHere) fs.writeFileSync(abs, lines.join('\n'));
  }
}

let changed = [];
if (args['changed-since']) {
  for (const [r, dir] of Object.entries(repos)) {
    const out = git(dir, ['log', `--since=${args['changed-since']}`, '--name-only', '--format=']);
    for (const f of new Set(out.split('\n').filter(Boolean))) if (DOC_RE.test(f) && files[r].has(f)) changed.push(`${r === 'web' ? 'website' : 'bot'}/${f}`);
  }
}

const result = {
  at: new Date().toISOString(),
  docs: docs.length,
  tables: tables ? tables.size : null,
  counts: byKind,
  tiers: byTier,
  total: findings.length,
  changed_docs: changed,
  applied,
  findings,
};
if (args.json) fs.writeFileSync(args.json, JSON.stringify(result, (k, v) => (k === 'abs' ? undefined : v), 2));
if (args.md) {
  const md = [`# Stale-doc sweep — ${result.at.slice(0, 10)}`, '', `${docs.length} docs read · ${findings.length} claims that do not match (${byTier.sure} sure, ${byTier.look} worth a look) · ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' · ')}`, ''];
  for (const tier of ['sure', 'look']) {
    md.push(`## ${tier === 'sure' ? 'Sure — the code or the live system says otherwise' : 'Worth a look — may be a plan, an outside name, or a file outside the repos'}`, '', '| doc | line | claim | what is true |', '|---|---|---|---|');
    for (const f of findings.filter(x => x.tier === tier)) md.push(`| ${f.doc} | ${f.line} | \`${String(f.claim).replace(/\|/g, '\\|')}\` | ${String(f.actual).replace(/\|/g, '\\|')} |`);
    md.push('');
  }
  fs.writeFileSync(args.md, md.join('\n') + '\n');
}
if (!args.json && !args.md) for (const f of findings.slice(0, 60)) console.log(`${f.doc}:${f.line}  [${f.kind}]  ${f.claim}  →  ${f.actual}`);
if (applied.length) console.log(applied.map(a => `fixed ${a}`).join('\n'));
console.log(`doc-sweep: ${docs.length} docs, ${findings.length} stale claims — ${byTier.sure} sure, ${byTier.look} worth a look${applied.length ? `, ${applied.length} fixed in place` : ''} (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})${tables ? `, ${tables.size} live tables` : ', live tables not read'}`);
