#!/usr/bin/env node
// Re-voice a finished question clip in the current clip voice, keeping its words and board
// (SPEC-CLIP-PIPELINE.md §9). 16 Oct 2026: Adrian picked a new voice ("can the voice be more
// upbeat?" … "use voice C" — MiniMax English_FriendlyPerson, emotion happy, speed 1.1, the defaults
// of scripts/lessons/generate-narration.mjs); clips made before keep the old calm voice until this runs.
//
//   node scripts/clips/revoice.mjs <qc-slug | questionId> [--base http://localhost:3211]
//
// Steps (no writing model): guard — the local clip is the stored clip (same words, same board);
// every line re-voiced (generate-narration --force), word timing redone (align-narration --force),
// the speech round trip (≥ 85 % a line; a low line → the clip is recorded again, once); the new files
// uploaded under a NEW folder (question-clips/<id>/v<time>/ — a phone that cached the old voice
// never mixes the two); stored (status making); the phone look again (every board move on its word,
// ≤ 0.3 s); ready. The board did not change, so the picture read is not repeated. Fail at any step
// → the stored clip stays the old version (status ready), the reason printed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, parseArgs, resolveSupabase } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const BASE = String(args.base || 'http://localhost:3211').replace(/\/$/, '');
const VOICE_USD_PER_1K = 0.1;
const sb = resolveSupabase();
const T0 = Date.now();
const H = { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': 'application/json' };
async function rest(p, init = {}) {
  const r = await fetch(`${sb.url}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function upload(file, key, type) {
  const r = await fetch(`${sb.url}/storage/v1/object/lesson-audio/${key}`, {
    method: 'POST', headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': type, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: fs.readFileSync(file),
  });
  if (!r.ok) throw new Error(`upload ${key}: ${r.status}`);
  return `${sb.url}/storage/v1/object/public/lesson-audio/${key}`;
}
const sh = (cmd, argv, opts = {}) => { const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, ...opts }); return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;

const key = String(args._[0] || '');
const [row] = await rest(`question_clips?${/^qc-/.test(key) ? `slug=eq.${key}` : `question_id=eq.${key}`}&select=question_id,slug,status,script,gate,cost`);
if (!row?.script || row.status !== 'ready') { console.error(`${key}: no ready clip`); process.exit(2); }
const { question_id: QID, slug: SLUG } = row;
const LESSON = path.join(ROOT, 'data/lessons', `${SLUG}.json`);
const RUN = path.join(ROOT, 'data/clip-runs', SLUG);
const log = (m) => console.log(`[revoice ${SLUG} ${Math.round((Date.now() - T0) / 1000)}s] ${m}`);
const local = readJson(LESSON);
const beatsOf = (s) => s.scenes.flatMap(sc => sc.beats);
const sameClip = local && JSON.stringify(beatsOf(local).map(b => b.say)) === JSON.stringify(beatsOf(row.script).map(b => b.say))
  && JSON.stringify(canon(local.scenes.map(sc => [sc.steps, sc.beats.map(b => b.do)]))) === JSON.stringify(canon(row.script.scenes.map(sc => [sc.steps, sc.beats.map(b => b.do)])));
if (!sameClip) { console.error(`${SLUG}: the local copy is not the stored clip — re-make it instead`); process.exit(2); }
fs.mkdirSync(RUN, { recursive: true });
const keep = () => rest(`question_clips?question_id=eq.${QID}`, { method: 'PATCH', body: JSON.stringify({ status: 'ready', script: row.script, updated_at: new Date().toISOString() }) });
const fail = async (why) => { fs.writeFileSync(LESSON, JSON.stringify(local, null, 2) + '\n'); await keep(); log(`NOT RE-VOICED — ${why} (the stored clip keeps the old voice)`); process.exit(1); };

// Voice + timing + the speech round trip.
const g = sh('node', ['scripts/lessons/generate-narration.mjs', SLUG, '--force']);
if (!g.ok) await fail(`voice: ${g.out.trim().slice(-200)}`);
const scoreAll = () => {
  const al = sh('node', ['scripts/lessons/align-narration.mjs', SLUG, '--force']);
  if (!al.ok) return { ok: false, why: `timing: ${al.out.trim().slice(-200)}` };
  const ver = sh('node', ['scripts/lessons/generate-narration.mjs', SLUG, '--verify']);
  fs.writeFileSync(path.join(RUN, 'asr.txt'), ver.out);
  sh('node', ['scripts/clips/asr-score.mjs', SLUG]);
  return { ok: true, asr: readJson(path.join(RUN, 'asr.json')) };
};
let sc = scoreAll();
if (!sc.ok) await fail(sc.why);
const low = (sc.asr?.lines ?? []).filter(l => (l.score ?? 1) < 0.85);
if (low.length) {
  // A line the round trip did not hear right: record the clip again, once (a fresh take usually fixes it).
  log(`speech round trip low on ${low.length} line(s) — recording again`);
  sh('node', ['scripts/lessons/generate-narration.mjs', SLUG, '--force']);
  sc = scoreAll();
  if (!sc.ok) await fail(sc.why);
}
const worst = sc.asr?.worst;
if (worst == null || worst < 0.85) await fail(`speech round trip worst ${worst == null ? 'not scored' : Math.round(worst * 100) + ' %'}`);
log(`✓ voice: every line re-voiced · speech round trip worst ${Math.round(worst * 100)} %`);

// Upload under a new folder; store; look.
const ver = `v${Date.now().toString(36)}`;
const fresh = readJson(LESSON);
const stored = JSON.parse(JSON.stringify(fresh));
for (const b of beatsOf(stored)) for (const k of ['audio', 'timing']) {
  if (!b[k]) await fail(`a beat has no ${k}`);
  const file = path.join(ROOT, 'public', b[k]);
  b[k] = await upload(file, `question-clips/${QID}/${ver}/${path.basename(file)}`, k === 'audio' ? 'audio/mpeg' : 'application/json');
}
await rest(`question_clips?question_id=eq.${QID}`, { method: 'PATCH', body: JSON.stringify({ status: 'making', script: stored, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
const lookDir = path.join(os.tmpdir(), 'question-clip-look');
const lookOnce = () => { sh('node', ['scripts/clips/look.mjs', SLUG, '--base', BASE, '--path', `/app/clip/q/${QID}?check=1`, '--out', lookDir], { timeout: 6 * 60_000 }); return readJson(path.join(RUN, 'look.json')); };
let lk = lookOnce();
if (lk && !lk.pass && lk.actions.fired < lk.actions.expected && lk.look.problems === 0 && lk.cue.over === 0) { log('look: the play stopped early; once more'); lk = lookOnce(); }
const lookDetail = lk ? `${lk.actions.fired}/${lk.actions.expected} actions on the voice · cues worst ${lk.cue.worst.toFixed(2)} s · look problems ${lk.look.problems}` : 'the look did not run';
if (!lk?.pass) await fail(`look: ${lookDetail}`);
log(`✓ look: ${lookDetail}`);

const chars = beatsOf(fresh).reduce((n, b) => n + b.say.length, 0);
const gate = row.gate ?? { checks: {} };
gate.checks = { ...(gate.checks ?? {}),
  voice: { ok: true, detail: `${beatsOf(fresh).length}/${beatsOf(fresh).length} beats voiced + timed · speech round trip worst ${Math.round(worst * 100)} % (voice C, 16 Oct 2026)` },
  look: { ok: true, detail: lookDetail } };
const cost = { ...(row.cost ?? {}), revoice_usd: +(chars / 1000 * VOICE_USD_PER_1K).toFixed(3) };
await rest(`question_clips?question_id=eq.${QID}`, { method: 'PATCH', body: JSON.stringify({ status: 'ready', gate, cost, updated_at: new Date().toISOString() }) });
await rest('job_runs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'question-clips', ok: true, summary: `${SLUG} re-voiced (voice C) · ${Math.round((Date.now() - T0) / 1000)}s`, meta: { question_id: QID, revoice: true } }) }).catch(() => {});
log(`RE-VOICED · ready · ${Math.round((Date.now() - T0) / 1000)}s · voice US$${cost.revoice_usd}`);
