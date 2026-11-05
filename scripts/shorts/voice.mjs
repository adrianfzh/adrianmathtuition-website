#!/usr/bin/env node
// scripts/shorts/voice.mjs — the voice for a "common trap" Short, with the clip pipeline's own tools
// (SPEC-CLIP-PIPELINE.md §10): the approved clip voice (MiniMax speech-02-hd, English_FriendlyPerson,
// scripts/lessons/generate-narration.mjs) and the speech round trip (--verify, then
// scripts/clips/asr-score.mjs: every line ≥ 85 %).
//
//   node scripts/shorts/voice.mjs <slug…>     (or --all)
//   --force   re-voice lines that already have a file
//
// The voice stays PRIVATE: it is written to out/shorts/<slug>/voice/ (git-ignored), never public/.
// Paid: MiniMax ≈ US$0.08 per 1,000 characters; the round trip a few Gemini Flash cents.
// Writes out/shorts/<slug>/voice.json (lesson-shaped, with audio paths) + asr.json + voice-cost.json.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const slugs = argv.includes('--all')
  ? fs.readdirSync(path.join(ROOT, 'data/shorts')).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.replace(/\.json$/, ''))
  : argv.filter(a => !a.startsWith('--'));
if (!slugs.length) { console.error('usage: node scripts/shorts/voice.mjs <slug…> | --all [--force]'); process.exit(2); }

// MiniMax list price for speech-02-hd (Nov 2026): US$100 per million characters.
const USD_PER_CHAR = 100 / 1_000_000;
let failed = 0;
for (const slug of slugs) {
  const short = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/shorts', `${slug}.json`), 'utf8'));
  const dir = path.join(ROOT, 'out/shorts', slug);
  const voiceDir = path.join(dir, 'voice');
  fs.mkdirSync(voiceDir, { recursive: true });
  const scriptFile = path.join(dir, 'voice.json');
  // Keep audio paths from an earlier run when the words have not changed.
  const prev = fs.existsSync(scriptFile) ? JSON.parse(fs.readFileSync(scriptFile, 'utf8')) : null;
  const beats = short.beats.map((b, i) => {
    const old = prev?.scenes?.[0]?.beats?.[i];
    return old && old.say === b.say && old.audio && !FORCE ? { say: b.say, audio: old.audio } : { say: b.say };
  });
  // A changed line loses its file so generate-narration voices it again.
  short.beats.forEach((b, i) => {
    const old = prev?.scenes?.[0]?.beats?.[i];
    if (old?.audio && (old.say !== b.say || FORCE)) fs.rmSync(path.join(ROOT, old.audio), { force: true });
  });
  fs.writeFileSync(scriptFile, JSON.stringify({ slug, scenes: [{ type: 'caption', beats }] }, null, 2) + '\n');
  const todoChars = beats.filter(b => !b.audio).reduce((n, b) => n + b.say.length, 0);

  const run = (extra) => execFileSync('node', ['scripts/lessons/generate-narration.mjs', slug, '--script', scriptFile, '--out', path.relative(ROOT, voiceDir), ...extra], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  console.log(`\n── ${slug}: ${beats.length} lines, ${todoChars} characters to voice`);
  process.stdout.write(run([]));
  const asr = run(['--verify']);
  fs.writeFileSync(path.join(dir, 'asr.txt'), asr);
  let asrOk = true;
  try {
    process.stdout.write(execFileSync('node', ['scripts/clips/asr-score.mjs', slug, '--script', scriptFile, '--dir', dir], { cwd: ROOT, encoding: 'utf8' }));
  } catch (e) {
    asrOk = false;
    process.stdout.write(String(e.stdout || ''));
  }
  const cost = { slug, characters: short.beats.reduce((n, b) => n + b.say.length, 0), voicedNow: todoChars, usdNow: +(todoChars * USD_PER_CHAR).toFixed(4) };
  const costFile = path.join(dir, 'voice-cost.json');
  const before = fs.existsSync(costFile) ? JSON.parse(fs.readFileSync(costFile, 'utf8')) : { usdTotal: 0 };
  cost.usdTotal = +((before.usdTotal || 0) + cost.usdNow).toFixed(4);
  fs.writeFileSync(costFile, JSON.stringify(cost, null, 2) + '\n');
  if (!asrOk) failed++;
}
process.exit(failed ? 1 : 0);
