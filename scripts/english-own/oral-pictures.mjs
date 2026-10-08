#!/usr/bin/env node
// The stimulus pictures of our own oral sets (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026):
// generated from each set's `imagePrompt` (MiniMax image-01, MINIMAX_API_KEY in .env.local), so
// every picture is ours. Written to public/english/oral/<id>.jpg at 1280 wide. A picture that
// exists is skipped. LOOK at each one before committing it.
//
//   node scripts/english-own/oral-pictures.mjs [or02] [--force]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function loadEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\n$/, '').trim();
    }
  } catch { /* no file */ }
  return out;
}
const KEY = ({ ...loadEnv(), ...process.env }.MINIMAX_API_KEY || '').trim();
if (!KEY) { console.error('MINIMAX_API_KEY missing (.env.local)'); process.exit(2); }

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));
const { oral } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/english/speaking-sets.json'), 'utf8'));

for (const s of oral) {
  if (only.length && !only.includes(s.id)) continue;
  const out = path.join(ROOT, 'public/english/oral', `${s.id}.jpg`);
  if (fs.existsSync(out) && !FORCE) { console.log(`${s.id}: there already`); continue; }
  const r = await fetch('https://api.minimax.io/v1/image_generation', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'image-01', prompt: s.imagePrompt, aspect_ratio: '16:9', response_format: 'base64', n: 1, prompt_optimizer: false }),
  });
  const j = await r.json().catch(() => ({}));
  const b64 = j?.data?.image_base64?.[0];
  if (!r.ok || !b64) { console.error(`${s.id}: no picture (${r.status}) ${JSON.stringify(j.base_resp ?? j).slice(0, 200)}`); process.exitCode = 1; continue; }
  const tmp = path.join(os.tmpdir(), `${s.id}-raw.jpg`);
  fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-vf', 'scale=1280:-2', '-q:v', '4', out]);
  fs.rmSync(tmp, { force: true });
  console.log(`${s.id}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
