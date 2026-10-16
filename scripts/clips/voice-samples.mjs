#!/usr/bin/env node
// Voice samples for Adrian to pick by ear (Adrian, 16 Oct 2026: "can the voice be more upbeat?").
// Same voice and request as scripts/lessons/generate-narration.mjs — only the emotion / speed differ.
//
//   node scripts/clips/voice-samples.mjs <out-dir> "<line>" ["<line>" …]
//
// Writes <out-dir>/<n>-<emotion>-<speed>.mp3, one file per setting, the lines joined with a pause.
// Costs a few cents (MiniMax speech-02-hd, a few hundred characters per setting).

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lessons/shared.mjs';

const [outDir, ...lines] = process.argv.slice(2);
if (!outDir || !lines.length) { console.error('usage: node scripts/clips/voice-samples.mjs <out-dir> "<line>" …'); process.exit(2); }

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
  .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
  .map(m => [m[1], m[2].replace(/^"(.*)"$/, '$1').replace(/\\n$/, '').trim()]));
const KEY = process.env.MINIMAX_API_KEY || env.MINIMAX_API_KEY;
if (!KEY) { console.error('MINIMAX_API_KEY not set'); process.exit(2); }

const SETTINGS = [
  { name: 'A-now', emotion: 'calm', speed: 1 },
  { name: 'B-brighter', emotion: 'happy', speed: 1 },
  { name: 'C-brighter-quicker', emotion: 'happy', speed: 1.1 },
];

fs.mkdirSync(outDir, { recursive: true });
const text = lines.join(' <#0.6#> ');
for (const s of SETTINGS) {
  const r = await fetch('https://api.minimax.io/v1/t2a_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'speech-02-hd', text,
      voice_setting: { voice_id: 'English_FriendlyPerson', speed: s.speed, vol: 1, pitch: 0, emotion: s.emotion },
      audio_setting: { format: 'mp3', sample_rate: 24000, bitrate: 64000, channel: 1 },
    }),
  });
  const j = await r.json();
  if (!j.data?.audio) { console.error(s.name, JSON.stringify(j.base_resp)); continue; }
  const file = path.join(outDir, `${s.name}.mp3`);
  fs.writeFileSync(file, Buffer.from(j.data.audio, 'hex'));
  console.log(file);
}
