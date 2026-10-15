#!/usr/bin/env node
// Question clip — make ONE one-minute solution clip for ONE bank question, end to end,
// through every check the 7 Logarithms skill clips passed (SPEC-CLIP-PIPELINE.md §9,
// step 2 — 15 Oct 2026). No hand edits: what fails a check is refused or failed, never
// patched by a person.
//
//   node scripts/clips/question-clip.mjs <questionId> [--base http://localhost:3210] [--from batch]
//
// Needs: .env.local (Supabase service key, MINIMAX_API_KEY, GOOGLE_API_KEY, ADMIN_SESSION_SECRET),
// the `claude` CLI signed in (the agents are plan-billed Claude Code runs, never the API),
// /usr/bin/python3 with sympy, ffmpeg, Chrome, and a running site at --base (for the fit + the look):
// a production server (`npx next start -p 3210`) — a dev server's live reloads stop a clip mid-play.
//
// The steps (each stamped with its seconds in gate.steps):
//   1 gather     the bank row + its sub-skill filing; refused up front when its working cannot be
//                checked (lib/question-clip preRefuse: figure, graph, proof, words, too long)
//   1b bible     the topic's bible — written once by an Opus agent from Adrian's APPROVED notes
//                (pull-notes) + the approved pitfalls when the topic has none yet
//   2a plan      an Opus agent plans the board and runs the maths check until it passes, or refuses
//   4  maths     chain-check.py again, independently, with answer.bank = the bank's answer verbatim:
//                every line follows from the one before, and every number of the bank's answer is
//                on the last line
//   fit          every board of the plan, rendered at 390 × 844, fits above the bottom bar (fit.mjs) —
//                before any narration or voice is paid for; too tall → the planner splits / shortens
//   2b drafts    two Opus writers, blind to each other, in parallel
//   5  read      a fresh Opus blind reader picks and scores (≥ 4 on all six); one rewrite if not
//   3  rules     assemble.mjs (board copied from the plan) + the lesson verifier (0 errors, 0 warnings)
//   6  voice     MiniMax voice, word timing, speech round trip ≥ 85 % a line
//   —  store     voice to the public lesson-audio bucket, the script to question_clips (status making)
//   7  look      look.mjs plays it at phone size from /app/clip/q/<id>?check=1 (cues ≤ 0.3 s, nothing
//                cut off / overlapping / tiny / below the screen), then a Sonnet agent looks at every
//                picture
//   9  record    question_clips: ready (every check passed) or failed (fail_reason); job_runs
//                'question-clips'
// Working files: data/clip-plans/qc-*.json, data/clip-runs/qc-*/, data/lessons/qc-*.json,
// public/lessons/qc-*/ — all git-ignored; the row in question_clips is the record.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, loadTs, parseArgs, resolveSupabase } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const QID = String(args._[0] || '');
if (!/^[0-9a-f-]{36}$/i.test(QID)) { console.error('usage: node scripts/clips/question-clip.mjs <questionId> [--base URL] [--from batch]'); process.exit(2); }
const BASE = String(args.base || 'http://localhost:3210').replace(/\/$/, '');
const FROM = String(args.from || 'admin');
const WORKER = String(args.worker || `${os.hostname().split('.')[0]}:${process.pid}`);
/** MiniMax speech-02-hd, US$ per 1,000 characters (list price; step 1 measured < US$0.12). */
const VOICE_USD_PER_1K = 0.1;

const QC = await loadTs('src/lib/question-clip.ts');
const SLUG = QC.questionClipSlug(QID);
const RUN = path.join(ROOT, 'data/clip-runs', SLUG);
const PLAN = path.join(ROOT, 'data/clip-plans', `${SLUG}.json`);
const LESSON = path.join(ROOT, 'data/lessons', `${SLUG}.json`);
const sb = resolveSupabase();
const T0 = Date.now();
const steps = [];
const agents = [];
const log = (m) => console.log(`[${SLUG} ${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);

// ── IO ──────────────────────────────────────────────────────────────────────
async function rest(p, init = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${sb.url}/rest/v1/${p}`, { ...init, headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
      const t = await r.text();
      if (!r.ok) throw new Error(`Supabase ${r.status} ${p.split('?')[0]}: ${t.slice(0, 300)}`);
      return t ? JSON.parse(t) : null;
    } catch (e) { if (i >= 3 || /Supabase 4/.test(String(e))) throw e; await new Promise(res => setTimeout(res, 1500 * (i + 1))); }
  }
}
async function saveRow(patch) {
  await rest('question_clips?on_conflict=question_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ question_id: QID, slug: SLUG, updated_at: new Date().toISOString(), ...patch }),
  });
}
async function upload(file, key, type) {
  const r = await fetch(`${sb.url}/storage/v1/object/${QC.CLIP_AUDIO_BUCKET}/${key}`, {
    method: 'POST', headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, 'Content-Type': type, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: fs.readFileSync(file),
  });
  if (!r.ok) throw new Error(`upload ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `${sb.url}/storage/v1/object/public/${QC.CLIP_AUDIO_BUCKET}/${key}`;
}
async function stampJob(ok, summary, meta) {
  await rest('job_runs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'question-clips', ok, summary: summary.slice(0, 300), meta }) }).catch(() => {});
}
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
function sh(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`, stdout: r.stdout || '' };
}
async function step(name, fn) {
  const t = Date.now();
  log(`${name} …`);
  try { return await fn(); } finally { steps.push({ step: name, seconds: Math.round((Date.now() - t) / 1000) }); }
}

/** One plan-billed Claude Code agent (never the API). Resolves with its one-line reply. */
function agent(name, model, prompt, { tools = 'Read,Write,Edit,Glob,Grep', timeoutMin = 12, effort = 'medium' } = {}) {
  return new Promise((resolve) => {
    const t = Date.now();
    const child = spawn('claude', ['-p', prompt, '--model', model, '--effort', effort, '--output-format', 'json', '--permission-mode', 'dontAsk', '--allowedTools', tools, '--strict-mcp-config', '--disable-slash-commands'], { cwd: ROOT, env: { ...process.env, CLIP_AGENT: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', () => {});
    const kill = setTimeout(() => child.kill('SIGTERM'), timeoutMin * 60_000);
    child.on('close', () => {
      clearTimeout(kill);
      let j = null; try { j = JSON.parse(out); } catch { /* not JSON */ }
      const u = j?.usage ?? {};
      agents.push({ step: name, model, effort, seconds: Math.round((Date.now() - t) / 1000), usd_notional: +(j?.total_cost_usd ?? 0).toFixed(3),
        tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) });
      resolve(String(j?.result ?? out).trim().split('\n').pop().slice(0, 300));
    });
  });
}

// ── finish ──────────────────────────────────────────────────────────────────
const gate = { slug: SLUG, question_id: QID, steps, checks: {} };
let voiced = false;  // voice money is only spent once the voice step runs
const cost = () => {
  const chars = voiced ? (readJson(LESSON)?.scenes ?? []).flatMap(s => s.beats ?? []).reduce((n, b) => n + (b.say?.length ?? 0), 0) : 0;
  return { voice_chars: chars, voice_usd: +(chars / 1000 * VOICE_USD_PER_1K).toFixed(3), agents,
    agent_usd_notional: +agents.reduce((n, a) => n + a.usd_notional, 0).toFixed(2), billed: 'agents on the Claude plan (usd_notional = list price, not charged); voice on MiniMax' };
};
async function finish(status, reason) {
  const seconds = Math.round((Date.now() - T0) / 1000);
  gate.pass = status === 'ready';
  gate.seconds = seconds;
  fs.mkdirSync(RUN, { recursive: true });
  fs.writeFileSync(path.join(RUN, 'question-gate.json'), JSON.stringify(gate, null, 1) + '\n');
  const c = cost();
  await saveRow({ status, finished_at: new Date().toISOString(), seconds, gate, cost: c,
    refuse_reason: status === 'refused' ? reason : null, fail_reason: status === 'failed' ? reason : null,
    ...(status === 'ready' ? {} : {}) });
  await stampJob(status !== 'failed', `${SLUG} ${status}${reason ? `: ${reason}` : ''} · ${seconds}s`, { question_id: QID, status, seconds, voice_usd: c.voice_usd });
  log(`${status.toUpperCase()}${reason ? ` — ${reason}` : ''} · ${seconds}s · voice US$${c.voice_usd} · agents ${agents.length} (${c.agent_usd_notional} notional)`);
  process.exit(status === 'failed' ? 1 : 0);
}
const put = (k, ok, detail) => { gate.checks[k] = { ok: !!ok, detail }; log(`  ${ok ? '✓' : '✗'} ${k}: ${detail}`); };

// ── 1 gather ────────────────────────────────────────────────────────────────
const prev = (await rest(`question_clips?question_id=eq.${QID}&select=attempts,status`))?.[0];
await saveRow({ status: 'making', claimed_by: WORKER, started_at: new Date().toISOString(), attempts: (prev?.attempts ?? 0) + 1,
  requested_from: prev ? undefined : FROM, finished_at: null, fail_reason: null, refuse_reason: null });

const q = await step('gather', async () => {
  const [row] = await rest(`questions?id=eq.${QID}&select=id,question_text,answer,solution,level,topics,parts,has_image,figure_url,images,image_url,total_marks,legacy_syllabus,national,ai_generated,verified`);
  if (!row) return null;
  const filing = await rest(`question_subgroups?question_id=eq.${QID}&select=is_primary,subgroups(id,name,topic,level,description)`).catch(() => []);
  row.subgroup = (filing.find(f => f.is_primary) ?? filing[0])?.subgroups ?? null;
  return row;
});
if (!q) await finish('failed', 'no such question in the bank');
const pre = QC.preRefuse(q);
if (pre) { put('pre', false, `${pre.kind}: ${pre.why}`); await finish('refused', `${pre.kind}: ${pre.why}`); }
const level = String(q.level).toUpperCase();
const topic = q.subgroup?.topic || q.topics?.[0];
if (!topic) await finish('refused', 'no-topic: the question is not filed under a topic');
const bibleRel = `data/clip-bibles/${QC.bibleFile(topic, level)}`;
fs.rmSync(RUN, { recursive: true, force: true });
fs.mkdirSync(RUN, { recursive: true });
for (const p of [PLAN, LESSON]) fs.rmSync(p, { force: true });
fs.rmSync(path.join(ROOT, 'public/lessons', SLUG), { recursive: true, force: true });
await saveRow({ topic, bible: bibleRel });

// ── 1b bible ────────────────────────────────────────────────────────────────
if (!fs.existsSync(path.join(ROOT, bibleRel))) {
  await step('bible', async () => {
    const notes = sh('node', ['scripts/lessons/pull-notes.mjs', level, topic]);
    if (!notes.ok) return finish('refused', `no-notes: no approved notes for ${level} ${topic} yet, so no bible to write the clip from`);
    const notesFile = path.join(RUN, 'notes.txt');
    fs.writeFileSync(notesFile, notes.stdout);
    const pit = await rest('rpc/teaching_knowledge', { method: 'POST', body: JSON.stringify({ p_level: level, p_topics: [topic], p_context: q.question_text, p_methods: 6, p_pitfalls: 12, p_formulae: 0 }) }).catch(() => null);
    fs.writeFileSync(path.join(RUN, 'pitfalls.json'), JSON.stringify(pit ?? [], null, 1));
    const reply = await agent('bible', 'opus', `Read scripts/clips/prompts/bible-writer.md and follow it. Topic: ${level} · ${topic}. Notes: ${path.relative(ROOT, notesFile)}. Pitfalls: ${path.relative(ROOT, RUN)}/pitfalls.json. Write ${bibleRel}.`);
    log(`  bible: ${reply}`);
  });
  if (!fs.existsSync(path.join(ROOT, bibleRel))) await finish('failed', `the bible for ${topic} was not written`);
}

// ── 2a plan + 4 maths ───────────────────────────────────────────────────────
fs.writeFileSync(path.join(RUN, 'question.json'), JSON.stringify({
  question_id: QID, slug: SLUG, level, topic, bible: bibleRel, marks: q.total_marks,
  subskill: q.subgroup ? { id: q.subgroup.id, name: q.subgroup.name, description: q.subgroup.description } : null,
  question_text: q.question_text, parts: q.parts ?? [], solution: q.solution, answer: q.answer,
}, null, 1) + '\n');
const CHAIN_TOOL = 'Read,Write,Edit,Glob,Grep,Bash(/usr/bin/python3 scripts/clips/chain-check.py:*)';
const planReply = await step('plan', () => agent('plan', 'opus',
  `Read scripts/clips/prompts/question-plan.md and follow it. slug: ${SLUG}. The question: data/clip-runs/${SLUG}/question.json. Write data/clip-plans/${SLUG}.json.`, { tools: CHAIN_TOOL }));
log(`  plan: ${planReply}`);
let plan = readJson(PLAN);
if (!plan) await finish('failed', 'the board plan was not written');
if (plan.refuse) { put('plan', false, `${plan.refuse}: ${plan.why}`); await finish('refused', `${plan.refuse}: ${plan.why}`); }

function mathsCheck() {
  plan = readJson(PLAN);
  plan.answer = { ...(plan.answer || {}), bank: q.answer };  // the bank's answer, verbatim — never the agent's copy
  plan.slug = SLUG;
  // A line's `note` is a string aside in the lesson format; the rule beside a step is the writer's
  // `note` action. An object here is the planner's mistake — move it into the outline.
  for (const l of plan.lines ?? []) if (l.note != null && typeof l.note !== 'string') { (plan.outline ??= []).push(`Rule beside the line with ${l.note.near}: ${l.note.text}`); delete l.note; }
  fs.writeFileSync(PLAN, JSON.stringify(plan, null, 1) + '\n');
  const r = sh('/usr/bin/python3', ['scripts/clips/chain-check.py', SLUG, '--json']);
  const j = (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
  return j ? { pass: j.pass, n: j.checks.length, bad: j.checks.filter(c => !c.ok).map(c => `${c.line}: ${c.detail}`) } : { pass: false, n: 0, bad: [r.out.trim().slice(-400)] };
}
let mc = await step('maths', async () => mathsCheck());
if (!mc.pass) {
  await step('plan-repair', () => agent('plan-repair', 'opus',
    `Read scripts/clips/prompts/question-plan.md. The plan data/clip-plans/${SLUG}.json fails the independent maths check (answer.bank was set to the bank's answer verbatim). Failures:\n${mc.bad.join('\n')}\nFix the plan (never weaken a check) and run the check until it passes, or refuse as the instructions say.`, { tools: CHAIN_TOOL }));
  if (readJson(PLAN)?.refuse) { const p = readJson(PLAN); await finish('refused', `${p.refuse}: ${p.why}`); }
  mc = mathsCheck();
}
put('maths', mc.pass, mc.pass ? `${mc.n}/${mc.n} line checks, bank answer on the last line` : mc.bad.join(' | ').slice(0, 600));
if (!mc.pass) await finish('failed', `maths check: ${mc.bad[0] ?? ''}`.slice(0, 300));

// ── fit: every board on one phone screen, before a word is written ─────────
async function fitCheck() {
  const p = readJson(PLAN);
  const nb = Math.max(1, p.boards?.length ?? 1);
  const scenes = Array.from({ length: nb }, (_, k) => {
    const board = p.boards?.[k] ?? { heading: p.heading, intro: p.intro };
    const lines = p.lines.filter(l => (l.board ?? 0) === k);
    return { type: 'equation-steps', heading: board.heading, ...(board.intro ? { intro: board.intro } : {}),
      steps: lines.map(l => ({ tokens: l.tokens })), beats: lines.map((_, i) => ({ say: 'Line.', do: [{ do: 'write', step: i }] })) };
  });
  await saveRow({ script: { slug: SLUG, title: p.title, level: p.level, topic: p.topic, minutes: 1, kind: 'clip', theme: 'chalk', scenes } });
  const r = sh('node', ['scripts/clips/fit.mjs', SLUG, '--base', BASE, '--path', `/app/clip/q/${QID}?check=1`], { timeout: 4 * 60_000 });
  const j = readJson(path.join(RUN, 'fit.json'));
  return j ? { pass: j.pass, detail: j.boards.map(b => b.error ? `board ${b.board + 1}: ${b.error}` : `board ${b.board + 1} ends ${b.bottom} px, screen ${b.fold} px`).join(' · ') } : { pass: false, detail: r.out.trim().slice(-300) };
}
let fit = await step('fit', fitCheck);
for (let n = 0; !fit.pass && n < 2; n++) {
  await step(`fit-repair-${n + 1}`, () => agent('fit-repair', 'opus',
    `Read scripts/clips/prompts/question-plan.md. The plan data/clip-plans/${SLUG}.json passes the maths check but a board is TALLER than a phone screen (390 × 844): ${fit.detail}. Make every board fit: shorten the intro to the question's numbers and ask (cut story words), and/or move lines to a second board (boards + "board" on each line), never merge two steps into one line. Keep every check true and run the maths check until it passes.`, { tools: CHAIN_TOOL }));
  mc = mathsCheck();
  if (!mc.pass) await finish('failed', `maths check after the fit repair: ${mc.bad[0] ?? ''}`.slice(0, 300));
  fit = await step('fit', fitCheck);
}
put('fit', fit.pass, fit.detail);
if (!fit.pass) await finish('failed', `fit: ${fit.detail}`.slice(0, 300));

// ── 2b drafts + 5 blind read ────────────────────────────────────────────────
const WRITE_TOOL = 'Read,Write,Edit,Glob,Grep,Bash(node scripts/clips/draft-check.mjs:*)';
const WRITER = (key, extra = '') => `Read scripts/clips/prompts/writer.md and follow it. You are draft ${key}. One clip only: slug ${SLUG} (plan data/clip-plans/${SLUG}.json). Write data/clip-runs/${SLUG}/draft-${key}.json.${extra}`;
await step('drafts', () => Promise.all([agent('draft-A', 'opus', WRITER('A'), { effort: 'high', tools: WRITE_TOOL }), agent('draft-B', 'opus', WRITER('B'), { effort: 'high', tools: WRITE_TOOL })]));
if (!readJson(path.join(RUN, 'draft-A.json')) && !readJson(path.join(RUN, 'draft-B.json'))) await finish('failed', 'no draft was written');

async function blindRead(only) {
  fs.rmSync(path.join(RUN, 'blind-read.json'), { force: true });
  const which = only ? `This time there is ONE draft to read: data/clip-runs/${SLUG}/draft-${only}.json — "pick" it ("${only}") and score it.` : `Read both drafts (draft-A.json, draft-B.json; if one is missing, pick the other).`;
  await agent(`read${only ? '-' + only : ''}`, 'opus', `Read scripts/clips/prompts/blind-reader.md and follow it. One clip only: slug ${SLUG}. ${which} Write data/clip-runs/${SLUG}/blind-read.json.`, { effort: 'high' });
  const br = readJson(path.join(RUN, 'blind-read.json'));
  const low = br ? Math.min(...Object.values(br.scores ?? { x: 0 })) : 0;
  return { br, pass: !!br && br.verdict === 'pass' && low >= 4, low };
}
let rd = await step('read', () => blindRead(null));
// Up to two rewrites with the reader's notes (step 1 needed A2 / A3 on two of its seven clips);
// each rewrite is read again by a FRESH reader. Still below 4 → the clip is dropped (SPEC §2 step 5).
for (const key of ['C', 'D']) {
  if (rd.pass || !rd.br) break;
  const from = rd.br.pick || 'A';
  const notes = (rd.br.notes ?? []).map((n, i) => `${i + 1}. ${n}`).join('\n');
  await step(`rewrite-${key}`, () => agent(`rewrite-${key}`, 'opus', WRITER(key, ` Start from draft-${from}.json. A blind reader scored it ${JSON.stringify(rd.br.scores)} (every score must be ≥ 4). Fix EVERY note below — each one will be checked — and apply its fixed_beats (data/clip-runs/${SLUG}/blind-read.json, keys = beat numbers from 1):\n${notes}`), { effort: 'high', tools: WRITE_TOOL }));
  rd = await step(`read-${key}`, () => blindRead(key));
}
put('read', rd.pass, rd.br ? `pick ${rd.br.pick} · lowest score ${rd.low} · ${rd.br.verdict}` : 'no blind read written');
if (!rd.pass) await finish('failed', `blind read: ${(rd.br?.notes ?? []).slice(0, 2).join(' / ') || 'not passed'}`.slice(0, 300));

// ── 3 rules (assemble + verifier) ───────────────────────────────────────────
function assembleAndRules() {
  const a = sh('node', ['scripts/clips/assemble.mjs', SLUG]);
  if (!a.ok) return { ok: false, detail: a.out.trim().slice(-300) };
  const lesson = readJson(LESSON);
  lesson.kind = 'clip';
  fs.writeFileSync(LESSON, JSON.stringify(lesson, null, 2) + '\n');
  const v = sh('node', ['scripts/lessons/verify-lesson.mjs', SLUG, '--json', '--offline']);
  try {
    const j = JSON.parse(v.stdout);
    const issues = (j.issues ?? []).filter(i => i.severity !== 'info');
    return { ok: j.ok && issues.length === 0, detail: issues.length ? issues.map(i => `${i.severity} ${i.where}: ${i.message}`).join(' | ') : 'PASS — 0 errors, 0 warnings' };
  } catch { return { ok: false, detail: v.out.trim().slice(-300) }; }
}
let rules = await step('rules', async () => assembleAndRules());
if (!rules.ok) {
  const pick = readJson(path.join(RUN, 'blind-read.json'))?.pick || 'A';
  await step('rules-repair', () => agent('rules-repair', 'opus', WRITER('R', ` Start from draft-${pick}.json (with the blind reader's fixed_beats in data/clip-runs/${SLUG}/blind-read.json applied) and fix ONLY these rule failures of the lesson verifier, changing nothing else: ${rules.detail}`), { effort: 'high', tools: WRITE_TOOL }));
  rd = await step('read-repair', () => blindRead('R'));
  rules = rd.pass ? assembleAndRules() : { ok: false, detail: `repair not passed by the blind reader: ${rules.detail}` };
}
put('rules', rules.ok, rules.detail.slice(0, 600));
if (!rules.ok) await finish('failed', `rules: ${rules.detail}`.slice(0, 300));
const lessonNow = readJson(LESSON);
const sameBoard = JSON.stringify(lessonNow.scenes.flatMap(sc => sc.steps.map(s => s.tokens))) === JSON.stringify(readJson(PLAN).lines.map(l => l.tokens));
put('board', sameBoard, sameBoard ? `${plan.lines.length} lines = the checked plan` : 'the clip\'s lines differ from the checked plan');
if (!sameBoard) await finish('failed', 'board differs from the checked plan');

// ── 6 voice ─────────────────────────────────────────────────────────────────
const voice = await step('voice', async () => {
  voiced = true;
  const g = sh('node', ['scripts/lessons/generate-narration.mjs', SLUG]);
  if (!g.ok) return { ok: false, detail: `voice: ${g.out.trim().slice(-300)}` };
  const al = sh('node', ['scripts/lessons/align-narration.mjs', SLUG]);
  if (!al.ok) return { ok: false, detail: `timing: ${al.out.trim().slice(-300)}` };
  const ver = sh('node', ['scripts/lessons/generate-narration.mjs', SLUG, '--verify']);
  fs.writeFileSync(path.join(RUN, 'asr.txt'), ver.out);
  const sc = sh('node', ['scripts/clips/asr-score.mjs', SLUG]);
  const asr = readJson(path.join(RUN, 'asr.json'));
  const beats = readJson(LESSON).scenes.flatMap(s => s.beats);
  const timed = beats.filter(b => b.audio && b.timing).length;
  const ok = timed === beats.length && asr?.worst != null && asr.worst >= 0.85;
  return { ok, detail: `${timed}/${beats.length} beats voiced + timed · speech round trip worst ${asr?.worst != null ? Math.round(asr.worst * 100) + ' %' : 'not scored ' + sc.out.slice(-120)}` };
});
put('voice', voice.ok, voice.detail);
if (!voice.ok) await finish('failed', voice.detail);

// ── store (status making) ───────────────────────────────────────────────────
await step('store', async () => {
  const lesson = readJson(LESSON);
  for (const sc of lesson.scenes) for (const b of sc.beats) {
    for (const k of ['audio', 'timing']) {
      if (!b[k] || /^https:/.test(b[k])) continue;
      const file = path.join(ROOT, 'public', b[k]);
      b[k] = await upload(file, QC.clipAudioPath(QID, path.basename(file)), k === 'audio' ? 'audio/mpeg' : 'application/json');
    }
  }
  await saveRow({ script: lesson, plan: readJson(PLAN), gate });
});

// ── 7 look ──────────────────────────────────────────────────────────────────
const lookDir = path.join(os.tmpdir(), 'question-clip-look');
const look = await step('look', async () => {
  const r = sh('node', ['scripts/clips/look.mjs', SLUG, '--base', BASE, '--path', `/app/clip/q/${QID}?check=1`, '--out', lookDir], { timeout: 6 * 60_000 });
  const lk = readJson(path.join(RUN, 'look.json'));
  if (!lk) return { ok: false, detail: `look did not run: ${r.out.trim().slice(-300)}` };
  return { ok: lk.pass, lk, detail: `${lk.actions.fired}/${lk.actions.expected} actions on the voice · cues worst ${lk.cue.worst.toFixed(2)} s (gate ${lk.cue.gateS} s) · look problems ${lk.look.problems}${lk.pageErrors?.length ? ` · page errors ${lk.pageErrors.length}` : ''}` };
});
put('look', look.ok, look.detail);
if (!look.ok) await finish('failed', `look: ${look.detail}`);
const pics = await step('pictures', async () => {
  await agent('pictures', 'sonnet', `Read scripts/clips/prompts/look-reader.md and follow it. slug ${SLUG}. Pictures: ${path.join(lookDir, SLUG)}.`, { tools: `Read,Write,Glob,Bash(ls:*)` });
  return readJson(path.join(RUN, 'pictures.json'));
});
put('pictures', !!pics?.pass, pics ? `${pics.pictures} pictures read · ${pics.pass ? 'no problems' : pics.problems.slice(0, 3).join(' / ')}` : 'the picture read did not run');
if (!pics?.pass) await finish('failed', `pictures: ${pics?.problems?.[0] ?? 'not read'}`.slice(0, 300));

await saveRow({ script: (await rest(`question_clips?question_id=eq.${QID}&select=script`))[0].script, plan: readJson(PLAN) });
await finish('ready', null);
