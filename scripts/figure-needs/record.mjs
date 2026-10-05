#!/usr/bin/env node
// scripts/figure-needs/record.mjs — record ONE figure a twin needed that no figure-library family
// draws (5 Oct 2026; table figure_needs, maths project; lib/figure-needs.ts is the rule's home —
// normShape is repeated here because the Fly lanes run plain node). Called by the maths twins lane
// (bot worker/fly/twins.sh) and the science twins lane (worker/fly/science-twins.sh) when they park
// a seed for want of a figure. Fail-soft: prints the shape key, exit 0 even when the write fails.
//   node scripts/figure-needs/record.mjs --bank maths|science --seed <uuid> --what "<one line>"
//        [--shape venn-probability] [--subject physics] [--level PHYS] [--topic "Pressure"] [--source twins-lane]
//   node scripts/figure-needs/record.mjs --from-run <dir> --bank … --source …   (reads Q1.json figure_need / Q1.figure-need.json, plan.json, source.json)
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const argv = process.argv.slice(2);
const argOf = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const STOP = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'for', 'in', 'on', 'to', 'diagram', 'figure', 'drawing', 'showing', 'shows']);
export function normShape(shape, what) {
  const src = String(shape ?? '').trim() || String(what ?? '');
  const words = src.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return words.slice(0, 4).join('-') || 'unknown';
}
const readJ = (p) => { try { return JSON.parse(readFileSync(p, 'utf8').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return null; } };

function env() {
  const out = { ...process.env };
  if (!out.SUPABASE_URL || !out.SUPABASE_SECRET_KEY) {
    const { parse } = require('dotenv');
    const p = join(ROOT, '.env.local');
    if (existsSync(p)) { const e = parse(readFileSync(p, 'utf8')); out.SUPABASE_URL ||= e.SUPABASE_URL; out.SUPABASE_SECRET_KEY ||= e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY; }
    const b = join(homedir(), 'dev', 'adrianmath-telegram-math-bot', '.env');
    if ((!out.SUPABASE_SECRET_KEY) && existsSync(b)) { const e = parse(readFileSync(b, 'utf8')); out.SUPABASE_SECRET_KEY ||= e.SUPABASE_SERVICE_KEY_MAIN; out.SUPABASE_URL ||= 'https://nempslbewxtlikfzachi.supabase.co'; }
  }
  return { url: String(out.SUPABASE_URL ?? '').trim().replace(/\/$/, ''), key: String(out.SUPABASE_SECRET_KEY ?? '').trim() };
}

async function main() {
  const bank = argOf('--bank');
  let seed = argOf('--seed'), what = argOf('--what'), shape = argOf('--shape'), subject = argOf('--subject'), level = argOf('--level'), topic = argOf('--topic');
  const run = argOf('--from-run');
  if (run) {
    const q = readJ(join(run, 'Q1.json')) ?? {};
    const need = readJ(join(run, 'Q1.figure-need.json')) ?? q.figure_need ?? {};
    const plan = readJ(join(run, 'plan.json')) ?? {};
    const src = readJ(join(run, 'source.json')) ?? {};
    what ||= need.what || q.figure_description || null;
    shape ||= need.shape || null;
    seed ||= plan.source || src.id || null;
    subject ||= plan.subject || src.subject || (bank === 'maths' ? 'maths' : null);
    level ||= plan.bank_level || plan.level || src.level || null;
    topic ||= plan.topic || (plan.topics ?? [])[0] || (src.topics ?? [])[0] || null;
  }
  if (!['maths', 'science'].includes(bank) || !what) { console.error('record: --bank maths|science and a description (--what, or a run with figure_need) required'); return; }
  const row = { bank, seed_id: seed && /^[0-9a-f-]{36}$/i.test(seed) ? seed : null, subject, level, topic, what: String(what).replace(/\s+/g, ' ').trim().slice(0, 300), shape: normShape(shape, what), source: argOf('--source', bank === 'science' ? 'science-twins-lane' : 'twins-lane') };
  const { url, key } = env();
  if (!url || !key) { console.error('record: no SUPABASE_URL / SUPABASE_SECRET_KEY'); console.log(row.shape); return; }
  const r = await fetch(`${url}/rest/v1/figure_needs${row.seed_id ? '?on_conflict=bank,seed_id,shape' : ''}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: `return=minimal${row.seed_id ? ',resolution=ignore-duplicates' : ''}` }, body: JSON.stringify(row),
  });
  if (!r.ok) console.error(`record: ${r.status} ${(await r.text()).slice(0, 200)}`);
  console.log(row.shape);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => console.error(`record: ${e.message}`));
