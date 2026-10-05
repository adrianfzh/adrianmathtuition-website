#!/usr/bin/env node
// scripts/twins/cloud-door.mjs — the cloud session's side of the twin doors (5 Oct 2026).
// No database key anywhere: everything goes through /api/agent/twins/* with
// AGENT_TOKEN_TWINS (docs/CLOUD.md §Cloud twins; the playbook is .claude/skills/cloud-twins).
// Run dirs look exactly like the local scripts' (author-brief.md → Q1.json → Q1.solve.md /
// Q1.check.md → Q1.blind.json → Q1.verdict.json), so the same agent prompts work.
//
//   node scripts/twins/cloud-door.mjs queue  --bank maths --level EM [--n 5] [--focus-only] [--skip id,id | --skip-file <file>] --out <dir>
//        (--skip: seeds you parked, so the next ones come forward; a file = one id per line)
//   node scripts/twins/cloud-door.mjs queue  --bank science [--n 5] [--pool PHY] [--text-only] --out <dir>
//        → <dir>/<seed>/author-brief.md + packet.json, one folder per seed; prints the folders
//   node scripts/twins/cloud-door.mjs figure [--doc <family>]               the library's families / one spec doc
//   node scripts/twins/cloud-door.mjs render --run <dir>                     Q1.figure.json → Q1.figure.png (look at it)
//   node scripts/twins/cloud-door.mjs check  --run <dir>                     the SERVER's automatic gates (dry) →
//        Q1.gates.json; a pass writes Q1.solve.md (blind solver) and Q1.check.md (checker / moderator)
//   node scripts/twins/cloud-door.mjs submit --run <dir>                     Q1.json + Q1.blind.json + Q1.verdict.json
//        (+ Q1.figure.json) → the server re-checks everything and files it → published.json
//   node scripts/twins/cloud-door.mjs retire --bank maths --id <uuid> --reason "…"   take back a twin a cloud session filed
//   node scripts/twins/cloud-door.mjs figure-need --run <dir>                 a seed parked because no figure family draws it:
//        RUN/Q1.figure-need.json {what, shape} (or Q1.json figure_need) → the "Figures we need" list (5 Oct 2026)
//
// Env: AGENT_TOKEN_TWINS (required, never printed); TWINS_BASE (default https://www.adrianmathtuition.com).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const MODE = argv[0];
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const BASE = (process.env.TWINS_BASE || 'https://www.adrianmathtuition.com').replace(/\/$/, '');
const TOKEN = (process.env.AGENT_TOKEN_TWINS || '').trim();
if (!TOKEN) { console.error('AGENT_TOKEN_TWINS is not set in this environment — ask Adrian to add it (docs/CLOUD.md §Cloud twins)'); process.exit(2); }

async function call(method, path, body) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) }; }
  return { status: r.status, json };
}
function readJsonLoose(path) {
  let t = readFileSync(path, 'utf8').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error(`${path}: no JSON object`);
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return JSON.parse(t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); }
}
const readIf = (p) => (existsSync(p) ? readJsonLoose(p) : null);

function bodyFor(dir, dry) {
  const packet = JSON.parse(readFileSync(join(dir, 'packet.json'), 'utf8'));
  const q = readJsonLoose(join(dir, 'Q1.json'));
  const fig = readIf(join(dir, 'Q1.figure.json'));
  const body = { bank: packet.bank, seed_id: packet.seed_id, topic: packet.topic ?? undefined, pool: packet.pool ?? undefined, subgroup_id: packet.subgroup_id ?? undefined, question: q, figure_spec: q.needs_figure ? fig : undefined, dry };
  if (!dry) {
    const blind = readIf(join(dir, 'Q1.blind.json'));
    const verdict = readIf(join(dir, 'Q1.verdict.json'));
    if (!blind || !verdict) throw new Error('Q1.blind.json and Q1.verdict.json are needed before submit');
    body.gate_record = { blind_answer: packet.bank === 'science' ? blind.answer : blind.answers, blind, checker: verdict, notes: existsSync(join(dir, 'notes.txt')) ? readFileSync(join(dir, 'notes.txt'), 'utf8') : undefined };
  }
  return body;
}

const modes = {
  async queue() {
    const bank = argOf('--bank');
    const out = resolve(argOf('--out', `./twins-${new Date().toISOString().slice(0, 10)}`));
    const qs = new URLSearchParams({ bank, n: argOf('--n', '5') });
    if (bank === 'maths') qs.set('level', argOf('--level', 'EM'));
    if (argOf('--pool')) qs.set('pool', argOf('--pool'));
    if (has('--text-only')) qs.set('text_only', '1');
    if (has('--focus-only')) qs.set('focus_only', '1');
    const skip = [...(argOf('--skip', '') || '').split(','), ...(argOf('--skip-file') && existsSync(argOf('--skip-file')) ? readFileSync(argOf('--skip-file'), 'utf8').split(/\s+/) : [])].map((x) => x.trim()).filter(Boolean);
    if (skip.length) qs.set('skip', skip.join(','));
    const { status, json } = await call('GET', `/api/agent/twins/queue?${qs}`);
    if (status !== 200) { console.error(`queue: HTTP ${status} ${JSON.stringify(json)}`); process.exit(1); }
    mkdirSync(out, { recursive: true });
    for (const it of json.items ?? []) {
      if (it.error) { console.error(`skip ${it.seed_id}: ${it.error}`); continue; }
      const dir = join(out, it.bank === 'science' ? `${it.pool}-${it.seed_id}` : it.seed_id);   // science: one seed can serve a pure AND a Combined sub-skill
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'author-brief.md'), it.author_brief);
      const { author_brief: _b, ...packet } = it;
      writeFileSync(join(dir, 'packet.json'), JSON.stringify(packet, null, 1));
      console.log(`${dir}  ${it.bank === 'maths' ? `${it.level} · ${it.subskill?.name ?? '-'} (${it.subskill_has}/${it.subskill_has + it.subskill_wants})` : `${it.pool} · ${it.topic} · ${it.subskill?.name ?? '-'} (${it.subskill_twins}/${it.subskill_twins + it.subskill_need}, ${it.level})`}${it.seed?.has_figure ? ' · FIGURE' : ''}  blind=${it.models?.blind}`);
    }
    console.error(bank === 'maths' ? `${json.subskills_short} sub-skills short of ${json.per_skill}; ${json.twins_to_write} twins to write` : `${json.gap?.short + json.gap?.no_seed} sub-skills short of ${json.per_skill}; ${json.gap?.need} twins to write (${json.gap?.open_need} on open practice topics)`);
  },
  async figure() {
    const fam = argOf('--doc');
    const { status, json } = await call('GET', `/api/agent/twins/figure${fam ? `?doc=${encodeURIComponent(fam)}` : ''}`);
    if (status !== 200) { console.error(`figure: HTTP ${status} ${JSON.stringify(json)}`); process.exit(1); }
    if (json.families) for (const f of json.families) console.log(`${f.name.padEnd(30)} ${f.teaching_only ? '[teaching] ' : ''}${f.line}`);
    else console.log(`family: ${json.family}  spec_version: ${json.spec_version ?? '?'}\n\n${json.doc ?? '(no doc)'}`);
  },
  async render() {
    const dir = resolve(argOf('--run', '.'));
    const spec = readJsonLoose(join(dir, 'Q1.figure.json'));
    const { status, json } = await call('POST', '/api/agent/twins/figure', { spec });
    if (status !== 200) { console.log(`✗ ${json.reason ?? json.error}`); process.exit(1); }
    writeFileSync(join(dir, 'Q1.figure.png'), Buffer.from(json.png, 'base64'));
    console.log(`✓ ${json.family} → ${join(dir, 'Q1.figure.png')} (open it and look)`);
  },
  async check() {
    const dir = resolve(argOf('--run', '.'));
    const { status, json } = await call('POST', '/api/agent/twins/submit', bodyFor(dir, true));
    const prev = readIf(join(dir, 'Q1.gates.json')) ?? {};
    writeFileSync(join(dir, 'Q1.gates.json'), JSON.stringify({ ...json, http: status, rounds: (prev.rounds ?? 0) + 1 }, null, 1));
    if (status === 200 && json.ok) {
      writeFileSync(join(dir, 'Q1.solve.md'), json.solve_brief);
      writeFileSync(join(dir, json.bank === 'maths' ? 'Q1.moderate.md' : 'Q1.check.md'), json.check_brief);
      console.log(`gates ✓ (vs seed ${json.gates?.novelty?.vs_source}, nearest ${json.gates?.novelty?.nearest_jaccard})${json.figure ? ` · figure ${json.figure.family}` : ''} → Q1.solve.md + ${json.bank === 'maths' ? 'Q1.moderate.md' : 'Q1.check.md'}`);
    } else {
      console.log(`gates ✗ [${json.gate ?? status}]\n- ${(json.problems ?? [json.error]).join('\n- ')}`);
      process.exit(1);
    }
  },
  async submit() {
    const dir = resolve(argOf('--run', '.'));
    const { status, json } = await call('POST', '/api/agent/twins/submit', bodyFor(dir, false));
    if (status === 200 && json.ok) {
      writeFileSync(join(dir, 'published.json'), JSON.stringify({ id: json.id, bank: json.bank, at: new Date().toISOString() }, null, 1));
      console.log(`✓ filed ${json.id} (${json.bank})`);
    } else {
      writeFileSync(join(dir, 'refused.json'), JSON.stringify({ http: status, ...json }, null, 1));
      console.log(`✗ refused [${json.gate ?? status}]\n- ${(json.problems ?? [json.error]).join('\n- ')}`);
      process.exit(1);
    }
  },
  async ['figure-need']() {
    const dir = resolve(argOf('--run', '.'));
    const packet = readIf(join(dir, 'packet.json')) ?? {};
    const q = readIf(join(dir, 'Q1.json')) ?? {};
    const need = readIf(join(dir, 'Q1.figure-need.json')) ?? q.figure_need ?? {};
    const what = need.what || q.figure_description;
    if (!what) { console.error('figure-need: write RUN/Q1.figure-need.json {"what": "…", "shape": "…"} first'); process.exit(1); }
    const { status, json } = await call('POST', '/api/agent/twins/figure-need', { bank: packet.bank, seed_id: packet.seed_id, what, shape: need.shape ?? null, subject: packet.bank === 'maths' ? 'maths' : (packet.pool ?? null), level: packet.level ?? packet.pool ?? null, topic: packet.topic ?? null });
    console.log(status === 200 && json.ok ? `✓ recorded as "${json.shape}"` : `✗ ${json.error ?? status}`);
    if (status !== 200) process.exit(1);
  },
  async retire() {
    const { status, json } = await call('POST', '/api/agent/twins/retire', { bank: argOf('--bank'), id: argOf('--id'), reason: argOf('--reason', 'retired by the session') });
    console.log(status === 200 ? `✓ retired ${argOf('--id')}` : `✗ ${json.error ?? status}`);
    if (status !== 200) process.exit(1);
  },
};
if (!modes[MODE]) { console.error(`modes: ${Object.keys(modes).join(' · ')}`); process.exit(2); }
modes[MODE]().catch((e) => { console.error(`cloud-door ${MODE}: ${e.message}`); process.exit(1); });
