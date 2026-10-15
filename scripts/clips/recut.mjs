#!/usr/bin/env node
// Re-cut a finished question clip to a NEW standing rule, keeping its voice (SPEC-CLIP-PIPELINE.md §9).
//
//   node scripts/clips/recut.mjs <questionId | qc-slug> [--base http://localhost:3211]
//
// When a rule is added after clips were made (15 Oct 2026, Adrian's second watch: a mistake that is
// said is SHOWN as a red ✗ note; "the base" lights the bases), the finished clips that now fail the
// verifier are re-cut here, not re-made: an Opus agent (scripts/clips/prompts/recut.md) changes only
// the flagged beats' board actions. Guards, no model: every `say`, every board line and every
// voice/timing file is byte-for-byte the same as before (so the recorded voice still fits); the
// verifier shows 0 errors and 0 warnings. Then the same last steps as a new clip: stored (status
// making), the phone look (cues, nothing cut/overlapping/two-line notes), a Sonnet picture read, and
// back to `ready` — or `failed` with the reason. The blind read is not repeated (no word changed);
// the recut is recorded on the row (gate.checks.recut) and in job_runs 'question-clips'.
// Needs the local clip (data/lessons/<slug>.json + public/lessons/<slug>/, from the run that made it).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, parseArgs, resolveSupabase } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const BASE = String(args.base || 'http://localhost:3211').replace(/\/$/, '');
const sb = resolveSupabase();
const T0 = Date.now();
const H = { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': 'application/json' };
async function rest(p, init = {}) {
  const r = await fetch(`${sb.url}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const sh = (cmd, argv, opts = {}) => { const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, ...opts }); return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`, stdout: r.stdout || '' }; };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const agents = [];
function agent(name, model, prompt, tools, effort = 'high') {
  return new Promise((resolve) => {
    const t = Date.now();
    const child = spawn('claude', ['-p', prompt, '--model', model, '--effort', effort, '--output-format', 'json', '--permission-mode', 'dontAsk', '--allowedTools', tools, '--strict-mcp-config', '--disable-slash-commands'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', d => { out += d; });
    child.on('close', () => { let j = null; try { j = JSON.parse(out); } catch { /* */ }
      agents.push({ step: name, model, effort, seconds: Math.round((Date.now() - t) / 1000), usd_notional: +(j?.total_cost_usd ?? 0).toFixed(3) });
      resolve(String(j?.result ?? out).trim().split('\n').pop().slice(0, 300)); });
  });
}

const key = String(args._[0] || '');
const filter = /^qc-/.test(key) ? `slug=eq.${key}` : `question_id=eq.${key}`;
const [row] = await rest(`question_clips?${filter}&select=question_id,slug,status,script,gate,cost`);
if (!row?.script) { console.error(`no stored clip for ${key}`); process.exit(2); }
const { question_id: QID, slug: SLUG } = row;
const LESSON = path.join(ROOT, 'data/lessons', `${SLUG}.json`);
const RUN = path.join(ROOT, 'data/clip-runs', SLUG);
const log = (m) => console.log(`[recut ${SLUG} ${Math.round((Date.now() - T0) / 1000)}s] ${m}`);
const local = readJson(LESSON);
if (!local) { console.error(`${SLUG}: no local copy data/lessons/${SLUG}.json — re-make the clip instead`); process.exit(2); }

const beatsOf = (s) => s.scenes.flatMap(sc => sc.beats);
const sayOf = (s) => JSON.stringify(beatsOf(s).map(b => b.say));
// Key order is not content: the database stores JSON with its keys re-ordered.
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const boardOf = (s) => JSON.stringify(canon(s.scenes.map(sc => sc.steps)));
if (sayOf(local) !== sayOf(row.script) || boardOf(local) !== boardOf(row.script)) {
  console.error(`${SLUG}: the local copy is not the stored clip (words or board differ) — re-make it instead`); process.exit(2);
}

function verify() {
  const v = sh('node', ['scripts/lessons/verify-lesson.mjs', LESSON, '--json', '--offline']);
  try { const j = JSON.parse(v.stdout); return (j.issues ?? []).filter(i => i.severity !== 'info').map(i => `${i.severity} ${i.where}: ${i.message}`); }
  catch { return [`verifier: ${v.out.trim().slice(-200)}`]; }
}
const before = verify();
if (!before.length) { log('0 findings — nothing to re-cut'); process.exit(0); }
log(`${before.length} finding(s): ${before.join(' | ').slice(0, 300)}`);
fs.mkdirSync(RUN, { recursive: true });
fs.writeFileSync(path.join(RUN, 'recut-before.json'), JSON.stringify(local, null, 2) + '\n');
const voiceOf = (s) => JSON.stringify(beatsOf(s).map(b => [b.audio, b.timing]));
const voiceBefore = voiceOf(local);

const RECUT_TOOLS = 'Read,Edit,Write,Glob,Grep,Bash(node scripts/lessons/verify-lesson.mjs:*)';
let reply = await agent('recut', 'opus', `Read scripts/clips/prompts/recut.md and follow it. The clip: data/lessons/${SLUG}.json. The verifier's findings:\n${before.join('\n')}`, RECUT_TOOLS);
log(`agent: ${reply}`);
let after = readJson(LESSON);
const fail = async (reason) => {
  fs.writeFileSync(LESSON, JSON.stringify(local, null, 2) + '\n');  // put the clip back as it was
  await rest(`question_clips?question_id=eq.${QID}`, { method: 'PATCH', body: JSON.stringify({ status: 'ready', updated_at: new Date().toISOString() }) });
  log(`NOT RE-CUT — ${reason} (the stored clip is unchanged)`);
  process.exit(1);
};
if (!after) await fail('the agent left no clip');
if (sayOf(after) !== sayOf(local)) await fail('a spoken word changed — the voice would no longer fit');
if (boardOf(after) !== boardOf(local)) await fail('a board line changed');
if (voiceOf(after) !== voiceBefore) await fail('a voice or timing file reference changed');
const left = verify();
if (left.length) await fail(`the verifier still finds: ${left.join(' | ').slice(0, 300)}`);
log('✓ words, board and voice unchanged · verifier 0 errors, 0 warnings');

let lk = null, pics = null, lookDetail = '';
for (let round = 1; round <= 2; round++) {
if (round === 2) {
  // One more round when the picture read found something the new rule's layout exposed (a glyph the
  // hand font lacks, a note that now crowds): same guards, the picture problems as the findings.
  reply = await agent('recut-pictures', 'opus', `Read scripts/clips/prompts/recut.md and follow it. The clip: data/lessons/${SLUG}.json. It now passes the verifier, but a look at the played clip on a phone found:\n${pics.problems.join('\n')}\nFix these in the board actions only (a note's text, its near/span, which beat carries it) — words, board lines and voice stay exactly as they are.`, RECUT_TOOLS);
  log(`agent (pictures): ${reply}`);
  after = readJson(LESSON);
  if (sayOf(after) !== sayOf(local) || boardOf(after) !== boardOf(local) || voiceOf(after) !== voiceBefore) await fail('the picture fix changed words, board or voice');
  const again = verify();
  if (again.length) await fail(`after the picture fix the verifier finds: ${again.join(' | ').slice(0, 300)}`);
}
// Store with the same https voice files the clip already uses, beat by beat.
const stored = JSON.parse(JSON.stringify(after));
const urls = beatsOf(row.script);
beatsOf(stored).forEach((b, i) => { b.audio = urls[i].audio; b.timing = urls[i].timing; });
await rest(`question_clips?question_id=eq.${QID}`, { method: 'PATCH', body: JSON.stringify({ status: 'making', script: stored, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });  // started_at now: the worker re-queues a 'making' row older than 40 min

const lookDir = path.join(os.tmpdir(), 'question-clip-look');
function lookOnce() {
  sh('node', ['scripts/clips/look.mjs', SLUG, '--base', BASE, '--path', `/app/clip/q/${QID}?check=1`, '--out', lookDir], { timeout: 6 * 60_000 });
  return readJson(path.join(RUN, 'look.json'));
}
lk = lookOnce();
if (lk && !lk.pass && lk.actions.fired < lk.actions.expected && lk.look.problems === 0 && lk.cue.over === 0) { log('look: the play stopped early; once more'); lk = lookOnce(); }
lookDetail = lk ? `${lk.actions.fired}/${lk.actions.expected} actions on the voice · cues worst ${lk.cue.worst.toFixed(2)} s · look problems ${lk.look.problems}` : 'the look did not run';
log(`${lk?.pass ? '✓' : '✗'} look: ${lookDetail}`);
pics = null;
if (lk?.pass) {
  fs.rmSync(path.join(RUN, 'pictures.json'), { force: true });
  await agent('pictures', 'sonnet', `Read scripts/clips/prompts/look-reader.md and follow it. slug ${SLUG}. Pictures: ${path.join(lookDir, SLUG)}.`, 'Read,Write,Glob,Bash(ls:*)', 'medium');
  pics = readJson(path.join(RUN, 'pictures.json'));
  log(`${pics?.pass ? '✓' : '✗'} pictures: ${pics ? (pics.pass ? `${pics.pictures} read, no problems` : pics.problems.slice(0, 2).join(' / ')) : 'not read'}`);
}
if (!lk?.pass || pics?.pass || !pics?.problems?.length) break;
}
const ok = !!lk?.pass && !!pics?.pass;
if (!ok) {
  // The stored clip goes back to the version that passed before; the re-cut is kept locally to look at.
  fs.writeFileSync(path.join(RUN, 'recut-after.json'), JSON.stringify(after, null, 2) + '\n');
  await rest(`question_clips?question_id=eq.${QID}`, { method: 'PATCH', body: JSON.stringify({ status: 'ready', script: row.script, updated_at: new Date().toISOString() }) });
  fs.writeFileSync(LESSON, JSON.stringify(local, null, 2) + '\n');
  log(`NOT RE-CUT — ${lk?.pass ? 'pictures' : 'look'} failed; the stored clip is the earlier version`);
  process.exit(1);
}
const gate = row.gate ?? { checks: {} };
gate.checks = { ...(gate.checks ?? {}),
  rules: { ok: true, detail: 'PASS — 0 errors, 0 warnings (after the re-cut)' },
  look: { ok: true, detail: lookDetail },
  pictures: { ok: true, detail: `${pics.pictures} pictures read · no problems` },
  recut: { ok: true, detail: `${new Date().toISOString().slice(0, 10)}: ${before.length} finding(s) of a new rule fixed, words + voice unchanged — ${reply}`.slice(0, 500) } };
const cost = { ...(row.cost ?? {}), recut_agents: agents };
await rest(`question_clips?question_id=eq.${QID}`, { method: 'PATCH', body: JSON.stringify({ status: 'ready', gate, cost, updated_at: new Date().toISOString() }) });
await rest('job_runs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'question-clips', ok: true, summary: `${SLUG} re-cut to a new rule · ${Math.round((Date.now() - T0) / 1000)}s`, meta: { question_id: QID, recut: true } }) }).catch(() => {});
log(`RE-CUT · ready · ${Math.round((Date.now() - T0) / 1000)}s`);
