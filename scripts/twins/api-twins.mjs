#!/usr/bin/env node
// Twins on the API — ONLY from the organisation's free promotional credit (Adrian, 15 Oct 2026:
// "don't do jc twins, finish math and science twins"; the rule is "plan first; the API only
// from free promotional credit, for the gaps" — SPEC-TWINS §14). The SAME pipeline and gates
// as the plan-billed Fly lanes (bot worker/fly/twins.sh and science-twins.sh): the same prompts,
// the same deterministic scripts (twin.mjs / sci-twin.mjs / sci-stwin.mjs brief · check ·
// publish), the same verdict rules; only the model calls move from `claude -p` on the plan to
// the Messages API — the Batch API (half price) for every one-shot role, a plain call to finish a
// role that asks for a tool (the science figure spec), and `claude -p` on the API key for the
// maths figure step (it draws and looks at the picture with Bash). Opus 5.5 for every role.
//
//   node scripts/twins/api-twins.mjs run   --bank maths|sci|sci-mcq --n 20 [--levels S2,EM,AM,S1] [--cap 190]
//   node scripts/twins/api-twins.mjs all   [--cap 120] [--now] [--banks maths,sci] [--from-end]   (rounds of --n; --from-end = science tier 3, last first)
//   node scripts/twins/api-twins.mjs levels                      (practice levels: a shortlist of possible Advanced for Adrian's tap)
//   node scripts/twins/api-twins.mjs spent                       (the ledger: dollars so far, per bank and role)
//   node scripts/twins/api-twins.mjs report --bank maths|sci [--since ISO]   (published / parked / cost a twin)
//
// Runs live in ~/twins-api/<bank>/<run>/ (the run folders the lanes use: source.json, plan.json,
// author-brief.md, Q1.json, Q1.gates.json, Q1.blind.json, Q1.verdict.json, published|parked).
// Every API response's usage goes to ~/twins-api/ledger.jsonl; a batch is not sent when the
// ledger total plus that batch's worst case would cross --cap (HARD STOP, default US$190).
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const BOT = process.env.BOT_REPO || join(homedir(), 'dev', 'adrianmath-telegram-math-bot');
const HOME = process.env.TWINS_API_HOME || join(homedir(), 'twins-api');
const LEDGER = join(HOME, 'ledger.jsonl');
const MODEL = 'claude-opus-5-5';
// $ per million tokens (Opus 5.5): input, output, 5-minute cache write, cache read. Batch = half.
const PRICE = { in: 4, out: 20, cw: 5, cr: 0.2 };
// measured 16–17 Oct 2026: a science long question ≈ US$0.20 all roles, a request rarely above US$0.10 at half price
const WORST_PER_REQUEST = process.argv.includes('--now') ? 0.5 : 0.25;   // a batch is reserved at this per request before it is sent
const MAX_TOKENS = 32000;
const NOW = process.argv.includes('--now');   // plain calls instead of the Batch API

const argv = process.argv.slice(2);
const MODE = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'spent';
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

function env() {
  const { parse } = require('dotenv');
  const out = parse(readFileSync(join(ROOT, '.env.local'), 'utf8'));
  for (const k of Object.keys(out)) out[k] = String(out[k]).trim();
  return out;
}
// 🔒 OFF (Adrian, 19 Oct 2026: "switch off the credit lane. just use the normal lanes"). On 23–24 Oct a run on
// another machine — with its own empty ledger, so its US$ cap started from 0 — spent ≈US$32 more and took the
// ledger past the US$200 credit. The runner now refuses to start unless Adrian has said yes in his own words
// to THIS run and the caller passes --adrian-said-yes "<his words, dated>". The cap is per machine; check the
// Console balance (platform.claude.com) before any run.
if (['run', 'all', 'levels'].includes(MODE) && !argOf('--adrian-said-yes', '')) {
  console.error('api-twins: the credit lane is OFF (Adrian, 19 Oct 2026). Ask Adrian first; then pass --adrian-said-yes "<his words, date>". Check the Console credit balance — the US$ cap counts this machine only.');
  process.exit(2);
}
const ENV = env();
const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY, maxRetries: 4 });

// ------------------------------------------------------------- the ledger ----
const costOf = (u, batch) => ((PRICE.in * (u.input_tokens ?? 0) + PRICE.out * (u.output_tokens ?? 0)
  + PRICE.cw * (u.cache_creation_input_tokens ?? 0) + PRICE.cr * (u.cache_read_input_tokens ?? 0)) / 1e6) * (batch ? 0.5 : 1);
function ledgerRows() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const spentTotal = () => ledgerRows().reduce((a, r) => a + r.usd, 0);
function record(row) { mkdirSync(HOME, { recursive: true }); appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n'); }

// ---------------------------------------------------- the deterministic half ----
const SCRIPTS = { maths: 'scripts/twins/twin.mjs', sci: 'scripts/science-twins/sci-stwin.mjs', 'sci-mcq': 'scripts/science-twins/sci-twin.mjs' };
const NET_DOWN = /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|Connection error/;
function sh(bank, args, dir) {
  // a dropped connection is not a failed twin: wait and try again (up to ~30 min) before judging
  let r;
  for (let t = 0; t < 30; t++) {
    r = spawnSync('node', [SCRIPTS[bank], ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BOT_REPO: BOT }, maxBuffer: 64 << 20 });
    if (r.status === 0 || !NET_DOWN.test(`${r.stdout}${r.stderr}`)) break;
    log(`  network down (${args[0]}) — waiting a minute`); spawnSync('sleep', ['60']);
  }
  if (dir) appendFileSync(join(dir, 'lane.log'), `$ ${args.join(' ')}\n${r.stdout ?? ''}${r.stderr ?? ''}\n`);
  return { ok: r.status === 0, out: r.stdout ?? '', err: r.stderr ?? '' };
}
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const park = (it, why) => { writeFileSync(join(it.dir, 'parked'), why + '\n'); it.state = 'parked'; it.why = why; log(`  ✗ ${it.name}: ${why.slice(0, 200)}`); };
const gateProblems = (dir) => (readJson(join(dir, 'Q1.gates.json'))?.problems ?? []).map((p) => `- ${p}`).join('\n');

// the lanes' verdict rules, word for word (twins.sh verdict_ok; science: publish --dry refuses)
function mathsVerdictOk(dir) {
  const v = readJson(join(dir, 'Q1.verdict.json'));
  return !!v && v.all_agree === true && v.reads_as_source !== true && v.same_skill !== false && v.same_method !== false && Number(v.score || 0) >= 4;
}
function sciVerdictWhy(dir) {
  const v = readJson(join(dir, 'Q1.verdict.json')) ?? {}; const b = readJson(join(dir, 'Q1.blind.json')) ?? {};
  const keys = ['key_correct', 'blind_agrees', 'one_defensible_answer', 'in_syllabus', 'original', 'same_skill', 'level_ok', 'distractors_real', 'house_style', 'why_not_honest', 'student_safe', 'scheme_correct', 'scheme_markable', 'typed_answerable', 'self_contained', 'same_demand'];
  const bad = keys.filter((k) => k in v && v[k] !== true); if (v.reads_as_source) bad.push('reads_as_source');
  return `blind ${JSON.stringify(b.answer ?? b.answers ?? '').slice(0, 80)} · score ${v.score} · failed: ${bad.join(', ') || '-'} — ${String(v.why ?? '').slice(0, 200)}\n${(v.fixes ?? []).map((f) => `- ${f}`).join('\n')}`;
}

// ------------------------------------------------------------- the prompts ----
const P = {
  maths: join(ROOT, '.claude/skills/twin-question/prompts'),
  sci: join(ROOT, 'scripts/science-twins/prompts/structured'),
  'sci-mcq': join(ROOT, 'scripts/science-twins/prompts'),
};
const prompt = (bank, name) => readFileSync(join(P[bank], `${name}.md`), 'utf8').replace(/RUN\//g, '').replace(/folder RUN/g, 'folder given below').replace(/in RUN \(/g, 'in the folder (');
const HARNESS = (writes) => `

HOW THIS RUNS (the API, not Claude Code): you cannot open files or run commands. Every file you may read is pasted in this message under "=== FILE: <name> ===" (pictures follow their heading). Instead of writing files, reply with ONE JSON object and nothing else — its keys are the file names you were told to write (${writes.map((w) => `"${w}"`).join(', ')}), each value that file's full JSON content as an object (not a string). No prose, no code fence. Inside JSON strings every backslash is doubled and a newline is \\n.`;
function fileBlocks(dir, names, images = []) {
  const blocks = [];
  for (const n of names) {
    const p = join(dir, n);
    if (existsSync(p)) blocks.push({ type: 'text', text: `=== FILE: ${n} ===\n${readFileSync(p, 'utf8')}` });
  }
  for (const n of images) {
    const p = join(dir, n);
    if (!existsSync(p)) continue;
    blocks.push({ type: 'text', text: `=== FILE: ${n} (picture) ===` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: readFileSync(p).toString('base64') } });
  }
  return blocks;
}
const pngs = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort() : []);
const FIG_TOOL = { name: 'figure_doc', description: 'Print one figure family\'s spec language (fields, ranges, an example) — what `node scripts/gce-paper/figure.mjs --doc <family>` prints.', input_schema: { type: 'object', properties: { family: { type: 'string' } }, required: ['family'], additionalProperties: false } };
function figureDoc(family) {
  if (!/^[a-z0-9-]+$/.test(String(family))) return 'unknown family';
  const r = spawnSync('node', ['scripts/gce-paper/figure.mjs', '--doc', family], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BOT_REPO: BOT } });
  return (r.stdout || r.stderr || 'no output').slice(0, 30000);
}

/** The request for one role of one item: {system, content, tools?, writes}. */
function request(it, role) {
  const { bank, dir } = it;
  const sci = bank !== 'maths';
  if (role === 'author' || role === 'repair') {
    let text = prompt(bank, 'author');
    if (role === 'repair') text += sci ? `\n\n${prompt(bank, 'repair')}\nProblems from ${it.problems}` : `\n\nREPAIR ROUND. Your draft Q1.json failed these checks:\n${it.problems}`;
    const writes = sci ? ['Q1.json', 'Q1.figure.json (only if a figure is truly needed)'] : ['Q1.json'];
    const content = [...fileBlocks(dir, ['author-brief.md', ...(role === 'repair' ? ['Q1.json'] : [])], sci ? pngs(dir, /^seed-fig-\d+\.png$/) : [])];
    if (role === 'repair') content.unshift({ type: 'text', text: 'Your earlier draft is the Q1.json below.' });
    return { system: text + HARNESS(writes) + (sci ? '\nTo read a figure family\'s spec language, call the figure_doc tool instead of running the command.' : ''), content, tools: sci ? [FIG_TOOL] : undefined };
  }
  if (role === 'blind') return { system: prompt(bank, 'blind') + HARNESS(['Q1.blind.json']), content: fileBlocks(dir, ['Q1.solve.md'], pngs(dir, /^Q1[a-z]*\.figure\.png$/)) };
  if (role === 'moderate') return { system: prompt(bank, 'moderate') + HARNESS(['Q1.verdict.json']), content: fileBlocks(dir, ['Q1.moderate.md', 'Q1.blind.json'], pngs(dir, /^Q1[a-z]*\.figure\.png$/)) };
  if (role === 'checker') return { system: prompt(bank, 'checker') + HARNESS(['Q1.verdict.json']), content: fileBlocks(dir, ['Q1.check.md', 'Q1.blind.json'], pngs(dir, /^Q1\.figure\.png$/)) };
  throw new Error(`no role ${role}`);
}
const params = (rq) => ({
  model: MODEL, max_tokens: MAX_TOKENS, thinking: { type: 'adaptive' }, output_config: { effort: 'high' },
  system: rq.system, messages: [{ role: 'user', content: rq.content.length ? rq.content : [{ type: 'text', text: '(no files)' }] }],
  ...(rq.tools ? { tools: rq.tools } : {}),
});

/** Parse the reply into {file: content} and write the files. Returns the names written. */
function applyReply(it, msg, expect) {
  const text = (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  writeFileSync(join(it.dir, `${it.role}.reply.txt`), text);
  const body = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = body.indexOf('{'); const z = body.lastIndexOf('}');
  let obj; try { obj = JSON.parse(body.slice(a, z + 1)); } catch { return []; }
  const files = Object.keys(obj).some((k) => /\.json$/.test(k)) ? obj : { [expect]: obj };
  const wrote = [];
  for (const [k, v] of Object.entries(files)) {
    const name = k.split(' ')[0].replace(/^.*\//, '');
    if (!/^Q1(\.figure|\.blind|\.verdict)?\.json$/.test(name) || v == null || (typeof v === 'object' && !Object.keys(v).length)) continue;
    writeFileSync(join(it.dir, name), typeof v === 'string' ? v : JSON.stringify(v, null, 1));
    wrote.push(name);
  }
  return wrote;
}

// ----------------------------------------------------------- the API calls ----
/** Keep trying a call while the connection is down (the Mac lost its network mid-run on 16 Oct 2026). */
async function patient(fn) {
  for (let t = 0; ; t++) {
    try { return await fn(); } catch (e) {
      if (t >= 120 || !NET_DOWN.test(`${e?.message} ${e?.cause?.message ?? ''} ${e?.cause?.cause?.code ?? ''}`)) throw e;
      log(`  network down — waiting a minute (${e.message})`); await new Promise((r) => setTimeout(r, 60000));
    }
  }
}
const batchCreate = (body) => patient(() => client.messages.batches.create(body));
async function batchWait(id) {
  let st = await patient(() => client.messages.batches.retrieve(id));
  while (st.processing_status !== 'ended') { await new Promise((r) => setTimeout(r, 20000)); st = await patient(() => client.messages.batches.retrieve(id)); }
  return patient(async () => { const out = []; for await (const r of await client.messages.batches.results(id)) out.push(r); return out; });
}
/** One batch for [{it, role}] — waits, finishes any tool turn synchronously, writes files. */
async function runBatch(jobs, cap) {
  if (!jobs.length) return true;
  const spent = spentTotal();
  if (spent + jobs.length * WORST_PER_REQUEST > cap) { log(`🛑 HARD STOP: spent $${spent.toFixed(2)} + this batch's worst case $${(jobs.length * WORST_PER_REQUEST).toFixed(2)} would cross $${cap}`); return false; }
  const reqs = jobs.map((j, i) => { j.rq = request(j.it, j.role); return { custom_id: `j${i}`, params: params(j.rq) }; });
  if (NOW) {
    // --now: plain calls, 8 at a time — full price, minutes instead of the batch queue's wait
    log(`now: ${jobs.length} × ${[...new Set(jobs.map((j) => j.role))].join('/')}`);
    const queue = [...jobs];
    await Promise.all(Array.from({ length: 8 }, async () => { for (let j; (j = queue.shift());) j.msg = await sync(j, []); }));
    return true;
  }
  const b = await batchCreate({ requests: reqs });
  log(`batch ${b.id}: ${jobs.length} × ${[...new Set(jobs.map((j) => j.role))].join('/')}`);
  const byId = new Map((await batchWait(b.id)).map((r) => [r.custom_id, r]));
  await Promise.all(jobs.map(async (j, i) => {
    const r = byId.get(`j${i}`);
    let msg = r?.result?.type === 'succeeded' ? r.result.message : null;
    if (msg) record({ bank: j.it.bank, run: j.it.name, role: j.role, batch: true, usage: msg.usage, usd: costOf(msg.usage, true) });
    if (!msg) { log(`  ${j.it.name} ${j.role}: batch ${r?.result?.type ?? 'missing'} — one plain retry`); msg = await sync(j, []); }
    else if (msg.stop_reason === 'tool_use') msg = await sync(j, [{ role: 'assistant', content: msg.content }, toolResults(msg)]);
    j.msg = msg;
  }));
  return true;
}
function toolResults(msg) {
  return { role: 'user', content: msg.content.filter((c) => c.type === 'tool_use').map((c) => ({ type: 'tool_result', tool_use_id: c.id, content: figureDoc(c.input?.family) })) };
}
/** A plain (streamed) call continuing a conversation, looping while the model asks for a tool. */
async function sync(j, extra) {
  const p = params(j.rq); p.messages.push(...extra);
  for (let turn = 0; turn < 6; turn++) {
    let msg;
    try { msg = await patient(() => client.messages.stream(p).finalMessage()); } catch (e) { log(`  ${j.it.name} ${j.role}: ${e.message}`); return null; }
    record({ bank: j.it.bank, run: j.it.name, role: j.role, batch: false, usage: msg.usage, usd: costOf(msg.usage, false) });
    if (msg.stop_reason !== 'tool_use') return msg;
    p.messages.push({ role: 'assistant', content: msg.content }, toolResults(msg));
  }
  return null;
}

// maths figure step: the lane's figure-author prompt on `claude -p`, billed to the API key
function mathsFigure(it) {
  const fig = readFileSync(join(ROOT, '.claude/skills/gce-paper/prompts/figure-author.md'), 'utf8')
    .replace(/RUN\/QN/g, `${it.dir}/Q1`).replace(/QN\./g, 'Q1.').replace(/--run RUN --slots N/g, `--run ${it.dir} --slots 1`)
    .replace(/into RUN/g, `into ${it.dir}`).replace(/Repo: ROOT/, `Repo: ${ROOT}`).replace(/registry: BOT/, `registry: ${BOT}`).replace(/from ROOT/g, `from ${ROOT}`);
  const e = { ...process.env, ANTHROPIC_API_KEY: ENV.ANTHROPIC_API_KEY, BOT_REPO: BOT };
  delete e.CLAUDE_CODE_OAUTH_TOKEN; delete e.ANTHROPIC_AUTH_TOKEN;
  const r = spawnSync('claude', ['-p', `[twins api] ${fig}`, '--model', MODEL, '--effort', 'high', '--permission-mode', 'dontAsk',
    '--allowedTools', 'Bash Read Write Edit Glob Grep', '--add-dir', it.dir, '--output-format', 'json'], { cwd: ROOT, encoding: 'utf8', env: e, timeout: 900000, maxBuffer: 64 << 20 });
  writeFileSync(join(it.dir, 'figure.log'), (r.stdout ?? '') + (r.stderr ?? ''));
  const out = readJson(join(it.dir, 'figure.log')) ?? (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
  const usd = Number(out?.total_cost_usd ?? 0);
  record({ bank: 'maths', run: it.name, role: 'figure', batch: false, claude_p: true, usd, usage: out?.usage ?? null });
}

// ------------------------------------------------------------ the picking ----
function pick(bank, n, levels) {
  // no '~' in a folder name: Claude Code's write check refuses it (the figure step could not save, 15 Oct 2026)
  const dirOf = (name) => join(HOME, bank, name.replace(/~/g, '__'));
  const done = (name) => existsSync(join(dirOf(name), 'published')) || existsSync(join(dirOf(name), 'parked'));
  const items = []; const usedUnit = new Set();
  if (bank === 'maths') {
    const lists = levels.map((L) => { const r = sh('maths', ['queue', '--level', L, '--per-skill', '3', '--json', '--limit', '400']); try { return JSON.parse(r.out).map((x) => ({ ...x, L })); } catch { return []; } });
    for (let round = 0; items.length < n && lists.some((l) => l.length); round++) {
      for (const l of lists) {
        while (l.length) {
          const x = l.shift();
          if (done(x.source_id) || usedUnit.has(x.subgroup_id)) continue;
          usedUnit.add(x.subgroup_id); items.push({ bank, name: x.source_id, dir: dirOf(x.source_id), level: x.L, unit: x.subgroup_id, label: `${x.L} · ${x.topic} · ${x.subgroup}` }); break;
        }
        if (items.length >= n) break;
      }
    }
  } else {
    const FROM_END = process.argv.includes('--from-end');
    const r = sh(bank, ['queue', '--json', '--limit', FROM_END || argOf('--tiers', null) ? '20000' : '400', '--done-dir', join(HOME, bank)]);
    let rows = []; try { rows = JSON.parse(r.out); } catch { /* */ }
    // --from-end (16 Oct 2026, Adrian: "yes"): the free science lanes work the list from the top
    // (open topics first), so the credit run takes it from the far end — tier 3 only, last first —
    // and the two never write the same seed.
    if (FROM_END) rows = rows.filter((x) => Number(x.tier ?? 3) === 3).reverse();
    // --tiers 1,2 (17 Oct 2026): the open topics. The free lane parked 104 of their 158 seeds, 44 of
    // them only because its checker could not save a verdict, and skipped the rest — the credit run
    // (no such save fault) takes them on.
    const TIERS = argOf('--tiers', null);
    if (TIERS) { const want = new Set(TIERS.split(',').map(Number)); rows = rows.filter((x) => want.has(Number(x.tier))); }
    for (const x of rows) {
      const seeds = x.seeds ? x.seeds : [x.source_id];
      const sid = seeds.find((s) => !done(bank === 'sci' ? `S-${x.pool}-${s}` : `${x.pool}-${s}`));
      const unit = `${x.pool}-${x.subgroup_id}`;
      const name0 = bank === 'sci' ? `S-${x.pool}-${sid}` : `${x.pool}-${sid}`;
      // one seed can be offered under two sub-skills — one run folder per seed a round (17 Oct 2026)
      if (!sid || usedUnit.has(unit) || items.some((i) => i.name === name0)) continue;
      const name = name0;
      usedUnit.add(unit); items.push({ bank, name, sid, pool: x.pool, sg: x.subgroup_id, dir: dirOf(name), label: `${x.pool} · ${x.topic} · ${x.subgroup}` });
      if (items.length >= n) break;
    }
  }
  return items;
}

// ---------------------------------------------------------------- one round ----
async function round(bank, n, cap, levels) {
  const items = pick(bank, n, levels);
  log(`${bank}: ${items.length} seeds picked (${levels.join(',')})`);
  const sci = bank !== 'maths';
  for (const it of items) {
    mkdirSync(it.dir, { recursive: true });
    const args = sci ? ['brief', '--source', it.sid, '--run', it.dir, '--pool', it.pool, '--subgroup', String(it.sg)] : ['brief', '--source', it.name, '--run', it.dir];
    const br = sh(bank, args, it.dir);
    // a "~2" seed whose first twin is not live yet: not a failure — leave it for a later round
    if (!br.ok && /no first twin/.test(br.err + br.out)) { rmSync(it.dir, { recursive: true, force: true }); it.state = 'later'; it.why = 'waits for its first twin'; continue; }
    if (!br.ok) { park(it, 'brief failed'); continue; }
    it.state = 'author';
  }
  const live = () => items.filter((i) => !['parked', 'published', 'stopped', 'later'].includes(i.state));
  for (let guard = 0; guard < 12 && live().length; guard++) {
    // every item waiting on a model call goes into ONE batch
    const jobs = live().filter((i) => ['author', 'repair', 'blind', 'moderate', 'checker'].includes(i.state)).map((it) => ({ it, role: (it.role = it.state) }));
    if (jobs.length && !(await runBatch(jobs, cap))) { for (const i of live()) i.state = 'stopped'; break; }
    for (const j of jobs) {
      const it = j.it;
      if (!j.msg) { park(it, `${j.role}: no reply`); continue; }
      if (j.msg.stop_reason === 'refusal') { park(it, `${j.role}: declined`); continue; }
      if (j.role === 'author' || j.role === 'repair') {
        for (const f of ['Q1.json', 'Q1.figure.json']) if (j.role === 'repair' && existsSync(join(it.dir, f))) rmSync(join(it.dir, f));
        const wrote = applyReply(it, j.msg, 'Q1.json');
        if (!wrote.includes('Q1.json')) { park(it, `${j.role} wrote nothing`); continue; }
        if (sci && readJson(join(it.dir, 'Q1.json'))?.figure_need?.what) {
          spawnSync('node', ['scripts/figure-needs/record.mjs', '--from-run', it.dir, '--bank', 'science', '--source', 'twins-api'], { cwd: ROOT });
          park(it, 'no figure family draws it'); continue;
        }
        if (sci) rmSync(join(it.dir, 'Q1.blind.json'), { force: true }), rmSync(join(it.dir, 'Q1.verdict.json'), { force: true });
        if (sh(bank, ['check', '--run', it.dir], it.dir).ok) { it.state = 'blind'; continue; }
        if (j.role === 'author') { it.problems = sci ? `the automatic checks:\n${gateProblems(it.dir)}` : gateProblems(it.dir); it.state = 'repair'; it.rewritten = true; continue; }
        park(it, `gates: ${gateProblems(it.dir).replace(/\n/g, '; ').slice(0, 300)}`); continue;
      }
      if (j.role === 'blind') { if (!applyReply(it, j.msg, 'Q1.blind.json').length) { park(it, 'blind solver wrote nothing'); continue; } it.state = sci ? 'checker' : 'moderate'; continue; }
      if (j.role === 'moderate') {
        if (!applyReply(it, j.msg, 'Q1.verdict.json').length) { park(it, 'moderator wrote nothing'); continue; }
        if (!mathsVerdictOk(it.dir)) { const v = readJson(join(it.dir, 'Q1.verdict.json')) ?? {}; park(it, `moderator: score ${v.score} agree ${v.all_agree} reads_as_source ${v.reads_as_source} — ${String(v.why ?? '').slice(0, 200)}`); continue; }
        it.state = readJson(join(it.dir, 'Q1.json'))?.needs_figure === true ? 'figure' : 'publish'; continue;
      }
      if (j.role === 'checker') {
        if (!applyReply(it, j.msg, 'Q1.verdict.json').length) { park(it, 'checker wrote nothing'); continue; }
        if (sh(bank, ['publish', '--run', it.dir, '--dry'], it.dir).ok) { it.state = 'publish'; continue; }
        if (!it.rewritten) { it.problems = `the checker: ${sciVerdictWhy(it.dir)}`; it.state = 'repair'; it.rewritten = true; continue; }
        park(it, `checker: ${sciVerdictWhy(it.dir).split('\n')[0]}`); continue;
      }
    }
    // the steps with no batch: figures (maths), then publish
    for (const it of live().filter((i) => i.state === 'figure')) {
      if (spentTotal() + 1.5 > cap) { it.state = 'stopped'; continue; }
      log(`  ${it.name}: figure`);
      mathsFigure(it);
      spawnSync('node', ['scripts/gce-paper/figure.mjs', '--run', it.dir, '--slots', '1'], { cwd: ROOT, env: { ...process.env, BOT_REPO: BOT } });
      if (!sh('maths', ['figures', '--run', it.dir], it.dir).ok) {
        spawnSync('node', ['scripts/figure-needs/record.mjs', '--from-run', it.dir, '--bank', 'maths', '--source', 'twins-api'], { cwd: ROOT });
        park(it, 'figure not rendered'); continue;
      }
      it.state = 'publish';
    }
    for (const it of live().filter((i) => i.state === 'publish')) {
      if (!sci) {
        // §12: every new maths twin starts Core (Standard); a Challenge seed keeps Challenge. The
        // Advanced read is a shortlist for Adrian's tap afterwards (levels mode), never decided here.
        const plan = readJson(join(it.dir, 'plan.json'));
        plan.difficulty = plan.difficulty === 'Challenging' ? 'Challenging' : 'Standard';
        plan.models = { author: `${MODEL} (API batch)`, blind: `${MODEL} (API batch)`, moderate: `${MODEL} (API batch)`, figure: `${MODEL} (claude -p, API key)` };
        writeFileSync(join(it.dir, 'plan.json'), JSON.stringify(plan, null, 1));
        // asked fresh: a plan lane may have filled the sub-skill meanwhile
        const need = Number(sh('maths', ['need', '--level', it.level, '--subgroup', String(it.unit), '--per-skill', '3']).out.trim() || 1);
        if (need <= 0) { park(it, 'sub-skill already full when publishing'); continue; }
      }
      const r = sh(bank, ['publish', '--run', it.dir], it.dir);
      if (r.ok) { writeFileSync(join(it.dir, 'published'), new Date().toISOString() + '\n'); it.state = 'published'; log(`  ✅ ${it.name} published`); }
      else park(it, `publish failed: ${(r.err || r.out).trim().split('\n').pop().slice(0, 200)}`);
    }
  }
  return items;
}

async function stamp(bank, items, usd) {
  const c = (s) => items.filter((i) => i.state === s).length;
  const job = bank === 'maths' ? 'twin-batch' : 'science-twins';
  const summary = `api: ${c('published')} published, ${c('parked')} parked, ${c('stopped')} stopped of ${items.length} — US$${usd.toFixed(2)} this round, US$${spentTotal().toFixed(2)} of the free credit so far`;
  try {
    await fetch('https://www.adrianmathtuition.com/api/job-log', { method: 'POST', headers: { Authorization: `Bearer ${ENV.ADMIN_PASSWORD}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job, ok: true, summary, meta: { via: 'api', bank, published: c('published'), parked: c('parked'), stopped: c('stopped'), looked: items.length, usd, spent_total: spentTotal() } }) });
  } catch (e) { log(`job-log: ${e.message}`); }
  log(summary);
}

// ------------------------------------------------------------------ modes ----
if (MODE === 'run') {
  const bank = argOf('--bank', 'maths'); const n = Number(argOf('--n', 20)); const cap = Number(argOf('--cap', 190));
  const levels = String(argOf('--levels', 'S2,EM,AM,S1')).split(',');
  if (!SCRIPTS[bank]) throw new Error('--bank maths|sci|sci-mcq');
  const before = spentTotal();
  const items = await round(bank, n, cap, levels);
  const usd = spentTotal() - before;
  writeFileSync(join(HOME, `round-${bank}-${Date.now()}.json`), JSON.stringify(items.map(({ name, label, state, why }) => ({ name, label, state, why })), null, 1));
  await stamp(bank, items, usd);
  if (items.some((i) => i.state === 'stopped')) process.exit(3);
} else if (MODE === 'all') {
  // the full run: maths and science long questions take turns, 20 seeds a round, until both gaps
  // give nothing more or the HARD STOP (--cap) is reached. Biggest maths gaps first (S2, EM, AM, S1).
  const cap = Number(argOf('--cap', 120)); const n = Number(argOf('--n', 20));
  const levels = String(argOf('--levels', 'S2,EM,AM,S1')).split(',');
  const banks = String(argOf('--banks', 'maths,sci')).split(',');
  const empty = new Set();
  for (let r = 0; empty.size < banks.length; r++) {
    const bank = banks[r % banks.length]; if (empty.has(bank)) continue;
    const before = spentTotal();
    const items = await round(bank, n, cap, levels);
    await stamp(bank, items, spentTotal() - before);
    if (items.some((i) => i.state === 'stopped')) { log('🛑 stopped at the spending line'); break; }
    if (!items.filter((i) => i.state !== 'later').length) empty.add(bank);
  }
  log(`all done: US$${spentTotal().toFixed(2)} spent in total`);
} else if (MODE === 'levels') {
  // §12 practice levels for the maths twins this runner published: every one is Core (Standard)
  // already; one Opus read per twin makes a GENEROUS shortlist of possible Advanced for Adrian's
  // tap (likely / maybe), never a decision. → docs/samples/api-twins-advanced-shortlist.html
  const cap = Number(argOf('--cap', 190)); const base = join(HOME, 'maths');
  const doneFile = join(HOME, 'levels-read.json'); const read = readJson(doneFile) ?? {};
  const ids = readdirSync(base).map((r) => readJson(join(base, r, 'published.json'))?.id).filter(Boolean);
  const todo = ids.filter((id) => !read[id]);
  const H = { apikey: ENV.SUPABASE_SECRET_KEY, Authorization: `Bearer ${ENV.SUPABASE_SECRET_KEY}` };
  const rows = [];
  for (let i = 0; i < ids.length; i += 40) {
    const r = await patient(() => fetch(`${ENV.SUPABASE_URL}/rest/v1/questions?select=id,level,topics,total_marks,question_text,parts,solution,figure_url,difficulty&id=in.(${ids.slice(i, i + 40).join(',')})`, { headers: H }));
    rows.push(...(await r.json()));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const LV = { S1: 'lower secondary Sec 1 (MOE 2020 syllabus)', S2: 'lower secondary Sec 2 (MOE 2020 syllabus)', EM: 'O-Level E Math 4052', S3_EM: 'Sec 3 E Math 4052', AM: 'O-Level A Math 4049', S3_AM: 'Sec 3 A Math 4049' };
  const RULE = readFileSync(join(ROOT, 'SPEC-TWINS.md'), 'utf8').split('## 12.')[1].split('**The shortlist method')[0];
  const sys = `You sort Singapore maths practice questions into levels for a tutor. Every question is Core unless it clearly is not. Your job is ONLY to make a GENEROUS shortlist of questions that MIGHT be Advanced, for the tutor to tap; untapped ones stay Core. The tutor's rules and his corrections so far:\n\n${RULE}\n\nReply with ONE JSON object and nothing else: {"verdict": "core" | "maybe" | "likely", "hardest_part": "(b)(ii)" or "", "reason": "one plain line naming the undrilled idea or the trap the student meets (for maybe/likely); for core, the routine method"}. "likely" = you are fairly sure it needs an idea not usually drilled for this topic, or a genuine trap; "maybe" = borderline, keep it generous; a step the question leads to ("hence") is Core.`;
  const jobs = todo.filter((id) => byId.has(id)).map((id) => { const q = byId.get(id); return { id, q, text: `Level: ${LV[q.level] ?? q.level}. Topic: ${(q.topics ?? []).join(', ')}. ${q.total_marks} marks.\n\n${q.question_text}\n\n${(q.parts ?? []).map((p) => `${p.label} ${p.text ?? ''} [${p.marks ?? ''}]${(p.subparts ?? []).map((s) => `\n  ${s.label} ${s.text ?? ''} [${s.marks ?? ''}]`).join('')}`).join('\n')}\n\nWorked solution:\n${q.solution ?? ''}` }; });
  if (jobs.length) {
    if (spentTotal() + jobs.length * 0.1 > cap) { log('🛑 HARD STOP before the level read'); process.exit(3); }
    const b = await batchCreate({ requests: jobs.map((j, i) => ({ custom_id: `l${i}`, params: { model: MODEL, max_tokens: 8000, thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, system: sys, messages: [{ role: 'user', content: j.text }] } })) });
    log(`level batch ${b.id}: ${jobs.length}`);
    for (const r of await batchWait(b.id)) {
      const j = jobs[Number(r.custom_id.slice(1))]; const m = r.result?.type === 'succeeded' ? r.result.message : null; if (!m) continue;
      record({ bank: 'maths', run: j.id, role: 'level', batch: true, usage: m.usage, usd: costOf(m.usage, true) });
      const t = m.content.filter((c) => c.type === 'text').map((c) => c.text).join(''); const a = t.indexOf('{'); const z = t.lastIndexOf('}');
      try { read[j.id] = JSON.parse(t.slice(a, z + 1)); } catch { read[j.id] = { verdict: 'maybe', reason: 'reader reply unreadable — look at it', hardest_part: '' }; }
    }
    writeFileSync(doneFile, JSON.stringify(read, null, 1));
  }
  const short = ids.filter((id) => byId.has(id) && ['maybe', 'likely'].includes(read[id]?.verdict));
  const sample = short.map((id) => { const q = byId.get(id); return { id, topic: `${q.level} · ${(q.topics ?? []).join(', ')}`, marks: q.total_marks, question: q.question_text, parts: q.parts, solution: q.solution, figure_url: q.figure_url }; });
  const scores = short.map((id) => ({ id, level: read[id].verdict === 'likely' ? 'Advanced' : 'Challenge', reason: read[id].reason, hardest_part: read[id].hardest_part }));
  const tmp = join(HOME, 'levels'); mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, 'sample.json'), JSON.stringify(sample)); writeFileSync(join(tmp, 'scores.json'), JSON.stringify(scores));
  const out = join(ROOT, 'docs/samples/api-twins-advanced-shortlist.html');
  spawnSync('python3', [join(ROOT, 'scripts/practice-levels/sample-page.py'), join(tmp, 'sample.json'), join(tmp, 'scores.json'), out, 'New twins (written on the free credit) — which are Advanced?',
    `<p>${short.length} of ${ids.length} new maths twins might be Advanced. Every one is Core until you tap it.</p>`, 'shortlist'], { stdio: 'inherit' });
  console.log(`${short.length} shortlisted of ${ids.length} (${scores.filter((s) => s.level === 'Advanced').length} likely) → ${out}`);
} else if (MODE === 'spent') {
  const rows = ledgerRows(); const by = {};
  for (const r of rows) { const k = `${r.bank} ${r.role}`; by[k] = (by[k] ?? 0) + r.usd; }
  for (const [k, v] of Object.entries(by).sort()) console.log(`${k.padEnd(22)} $${v.toFixed(2)}`);
  console.log(`total $${spentTotal().toFixed(2)} (${rows.length} calls)`);
} else if (MODE === 'report') {
  const bank = argOf('--bank', 'maths'); const base = join(HOME, bank);
  const runs = existsSync(base) ? readdirSync(base) : [];
  const pub = runs.filter((r) => existsSync(join(base, r, 'published'))); const parked = runs.filter((r) => existsSync(join(base, r, 'parked')));
  const usd = ledgerRows().filter((r) => r.bank === bank).reduce((a, r) => a + r.usd, 0);
  console.log(JSON.stringify({ bank, published: pub.length, parked: parked.length, usd: +usd.toFixed(2), usd_per_published: pub.length ? +(usd / pub.length).toFixed(3) : null,
    parked_why: parked.map((r) => readFileSync(join(base, r, 'parked'), 'utf8').trim().slice(0, 140)) }, null, 1));
}
