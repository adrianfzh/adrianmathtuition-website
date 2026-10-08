#!/usr/bin/env node
// The recordings for our own listening sets and the spoken prompts of the oral sets
// (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026).
//
//   node scripts/english-own/speaking-audio.mjs              make what is missing
//   node scripts/english-own/speaking-audio.mjs ls02 --force redo one set
//   node scripts/english-own/speaking-audio.mjs --sample <voice_id> ["words"]   a test line (or your words) → a scratch file, its path printed
//
// Voice: the lessons' voice (MiniMax speech-02-hd, English_FriendlyPerson — the same constants as
// lib/explain-voice-store.ts and scripts/lessons/generate-narration.mjs; change them together) for
// the narrator, a man speaking and the oral prompts. A girl, a woman and a boy take the voices in
// VOICES below (the lessons' voice is a man's), so speakers can be told apart.
// Output: one mono MP3 a set in public/english/listening/<id>.mp3 (intro, a pause, then the lines
// with short gaps), and public/english/oral/<id>-q<n>.mp3 for each Part 2 prompt. Needs ffmpeg and
// MINIMAX_API_KEY in .env.local. A file that exists is skipped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TTS_MODEL = 'speech-02-hd';
const NARRATOR = 'English_FriendlyPerson';
// A speaker's voice by who they are (a set's `voices`). A man is the lessons' voice too.
const VOICES = { girl: 'English_radiant_girl', woman: 'English_CalmWoman', boy: 'English_ReservedYoungMan', man: NARRATOR };
const BITRATE = '40k';

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
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function speak(text, voice, emotion) {
  const body = { model: TTS_MODEL, text, voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0, ...(emotion ? { emotion } : {}) },
    audio_setting: { format: 'mp3', sample_rate: 24000, bitrate: 64000, channel: 1 } };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch('https://api.minimax.io/v1/t2a_v2', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const raw = await r.text();
    if (!r.ok) { if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(1500 * attempt); continue; } throw new Error(`TTS HTTP ${r.status}: ${raw.slice(0, 200)}`); }
    const j = JSON.parse(raw);
    const code = j.base_resp?.status_code ?? 0;
    if (code === 1008) throw new Error(`MiniMax balance: ${j.base_resp?.status_msg}`);
    if (code !== 0) { if (attempt < 3) { await sleep(1000 * attempt); continue; } throw new Error(`TTS ${code}: ${j.base_resp?.status_msg}`); }
    if (j.data?.audio) return Buffer.from(j.data.audio, 'hex');
  }
  throw new Error('TTS answered with no audio');
}

const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse';

/** parts: [{ text, voice, emotion?, gap }] — gap = seconds of silence AFTER the part. */
async function render(parts, outFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speaking-'));
  try {
    const wavs = [];
    for (const [i, p] of parts.entries()) {
      const mp3 = path.join(tmp, `${i}.mp3`);
      fs.writeFileSync(mp3, await speak(p.text, p.voice, p.emotion));
      const wav = path.join(tmp, `${i}.wav`);
      ff(['-i', mp3, '-af', `${TRIM},apad=pad_dur=${p.gap}`, '-ar', '24000', '-ac', '1', wav]);
      wavs.push(wav);
      process.stdout.write('.');
    }
    const listFile = path.join(tmp, 'list.txt');
    fs.writeFileSync(listFile, wavs.map(w => `file '${w}'`).join('\n'));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-ar', '24000', '-ac', '1', '-b:a', BITRATE, outFile]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const si = args.indexOf('--sample');
if (!KEY) { console.error('MINIMAX_API_KEY missing (.env.local)'); process.exit(2); }

if (si >= 0) {
  const voice = args[si + 1];
  const out = path.join(os.tmpdir(), `sample-${voice}.mp3`);
  fs.writeFileSync(out, await speak(args[si + 2] || 'Good morning, everyone. Last month my aunt asked me to help at the community garden near her block.', voice));
  console.log(out);
  process.exit(0);
}

const only = args.filter(a => !a.startsWith('--'));
const { listening, oral } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/english/speaking-sets.json'), 'utf8'));

for (const s of listening) {
  if (only.length && !only.includes(s.id)) continue;
  const out = path.join(ROOT, 'public/english/listening', `${s.id}.mp3`);
  if (fs.existsSync(out) && !FORCE) { console.log(`${s.id}: there already`); continue; }
  const talk = s.script.some(l => l.who === 'b');
  const voiceOf = who => (who === 'narrator' ? NARRATOR : VOICES[s.voices?.[who]] ?? NARRATOR);
  const parts = [{ text: s.intro, voice: NARRATOR, emotion: 'calm', gap: 2 },
    ...s.script.map(l => ({ text: l.text, voice: voiceOf(l.who), emotion: voiceOf(l.who) === NARRATOR ? 'calm' : undefined, gap: talk ? 0.45 : 0.8 }))];
  process.stdout.write(`${s.id} `);
  await render(parts, out);
  console.log(` ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

for (const s of oral) {
  if (only.length && !only.includes(s.id)) continue;
  for (const [i, p] of s.interaction.entries()) {
    const out = path.join(ROOT, 'public/english/oral', `${s.id}-q${i + 1}.mp3`);
    if (fs.existsSync(out) && !FORCE) continue;
    process.stdout.write(`${s.id} q${i + 1} `);
    await render([{ text: p, voice: NARRATOR, emotion: 'calm', gap: 0.2 }], out);
    console.log(` ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
}
