#!/usr/bin/env node
// scripts/figure-recrop/cloud-door.mjs — the cloud session's side of the re-crop door
// (7 Oct 2026; docs/CLOUD.md §Cloud re-crops; the playbook is .claude/skills/cloud-recrop).
// No database key anywhere: everything goes through /api/agent/recrop/* with
// AGENT_TOKEN_FIGURES. One folder per figure; the session's agents LOOK at the pictures
// and write small JSON files; this script carries them to the server and back.
//
//   node scripts/figure-recrop/cloud-door.mjs queue --n 5 --out <dir>
//        → <dir>/<slug>/{orig.png, grid.png, judge.md, meta.json}; prints the folders and how many are left
//   node scripts/figure-recrop/cloud-door.mjs cut --run <dir>/<slug>
//        reads verdict.json (the judge's answer) → the server cuts →
//        new.png + verify.md + fitness.md        (or done.json when the figure ends here: refused / school mark)
//   node scripts/figure-recrop/cloud-door.mjs submit --run <dir>/<slug>
//        reads check.json (the second look) and fitness.json (when the check passed) →
//        done.json {final}   — or, after a failed FIRST cut, a new judge.md (the correction): judge again, cut again
//
// Env: AGENT_TOKEN_FIGURES (required, never printed); RECROP_BASE (default https://www.adrianmathtuition.com).
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const MODE = argv[0];
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = (process.env.RECROP_BASE || 'https://www.adrianmathtuition.com').replace(/\/$/, '');
const TOKEN = (process.env.AGENT_TOKEN_FIGURES || '').trim();
if (!TOKEN) { console.error('AGENT_TOKEN_FIGURES is not set in this environment (docs/CLOUD.md §Cloud re-crops).'); process.exit(2); }
const H = { Authorization: `Bearer ${TOKEN}` };

async function call(path, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
    if (r.status === 429 && attempt < 3) { await new Promise((res) => setTimeout(res, 60_000)); continue; }
    return r;
  }
}
const json = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${d.error || ''}`.trim()); return d; };
const save = async (url, file) => { const r = await call(url); if (!r.ok) throw new Error(`picture ${r.status}`); writeFileSync(file, Buffer.from(await r.arrayBuffer())); };
const readJson = (f) => { const t = readFileSync(f, 'utf8'); const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error(`${f}: no JSON object in it`); return JSON.parse(m[0]); };

process.on('unhandledRejection', (e) => { console.error(`failed: ${e?.message || e}`); process.exit(1); });

if (MODE === 'queue') {
  const out = resolve(argOf('--out', './recrop-run')); mkdirSync(out, { recursive: true });
  const d = await json(await call(`/api/agent/recrop/queue?n=${Number(argOf('--n', 5)) || 5}`));
  for (const it of d.items) {
    const dir = join(out, it.path.replace(/\.png$/i, '')); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ path: it.path, note: it.note, stem: it.stem }, null, 1));
    writeFileSync(join(dir, 'judge.md'), `${it.judge_prompt}\n\nLook at grid.png in this folder (the crop with the 0–1000 grid on it). Write your answer — the JSON object only — to verdict.json in this folder.\n`);
    await save(it.original, join(dir, 'orig.png')); await save(it.grid, join(dir, 'grid.png'));
    console.log(dir);
  }
  console.log(`${d.items.length} handed out · ${d.left} left in the queue`);
} else if (MODE === 'cut') {
  const dir = resolve(argOf('--run')); const meta = readJson(join(dir, 'meta.json'));
  const d = await json(await call('/api/agent/recrop/cut', { method: 'POST', body: JSON.stringify({ path: meta.path, verdict: readJson(join(dir, 'verdict.json')) }) }));
  if (d.done) { writeFileSync(join(dir, 'done.json'), JSON.stringify(d, null, 1)); console.log(`done: ${d.final} — ${d.why}`); }
  else {
    await save(d.new, join(dir, 'new.png'));
    for (const f of ['check.json', 'fitness.json']) if (existsSync(join(dir, f))) rmSync(join(dir, f));
    writeFileSync(join(dir, 'verify.md'), `${d.verify_prompt}\n\nThe FIRST image is orig.png and the SECOND is new.png, both in this folder. Write your answer — the JSON object only — to check.json in this folder.\n`);
    writeFileSync(join(dir, 'fitness.md'), `${d.fitness_prompt}\n\nThe image is new.png in this folder. Write your answer — the JSON object only — to fitness.json in this folder.\n`);
    console.log(`cut (${d.plan}, keeps ${Math.round(d.kept_share * 100)} % of the old crop${d.sliced ? ', an edge still touches ink' : ''}) → new.png · next: the second look (verify.md), then fitness (fitness.md)`);
  }
} else if (MODE === 'submit') {
  const dir = resolve(argOf('--run')); const meta = readJson(join(dir, 'meta.json'));
  const body = { path: meta.path, check: readJson(join(dir, 'check.json')) };
  if (existsSync(join(dir, 'fitness.json'))) body.fitness = readJson(join(dir, 'fitness.json'));
  const d = await json(await call('/api/agent/recrop/submit', { method: 'POST', body: JSON.stringify(body) }));
  if (d.again) {
    writeFileSync(join(dir, 'judge.md'), `${d.judge_prompt}\n\nLook at grid.png in this folder again. Write the corrected answer — the JSON object only — to verdict.json in this folder (replace the old one).\n`);
    console.log(`again: the second look found — ${d.why}. judge.md now carries the correction: judge once more, then cut, verify, submit.`);
  } else { writeFileSync(join(dir, 'done.json'), JSON.stringify(d, null, 1)); console.log(`done: ${d.final} — ${d.why}`); }
} else {
  console.error('usage: cloud-door.mjs queue --n 5 --out <dir> | cut --run <dir> | submit --run <dir>'); process.exit(2);
}
