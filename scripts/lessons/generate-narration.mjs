#!/usr/bin/env node
// scripts/lessons/generate-narration.mjs — the voice track for an animated lesson.
//
// For every scene in data/lessons/<slug>.json that has `narration` (or `beats`)
// but no committed clip yet, synthesize speech, write a small mono MP3 to
// public/lessons/<slug>/, and set the scene's `audio` to the served path.
// Zero runtime infrastructure: the clips are committed static assets.
//
// Providers (--provider, default minimax since 1 Oct 2026):
//   minimax  MiniMax Speech-02 (`speech-02-hd`, voice English_FriendlyPerson,
//            emotion calm, speed 1 — Adrian's pick after fifteen samples; the
//            one-minute explanation uses the SAME voice, src/lib/explain-voice-store.ts
//            — change them together). MINIMAX_API_KEY in .env.local. The API
//            answers MP3 already (24 kHz mono 64 kbps, hex-encoded), so no PCM
//            step: with ffmpeg on PATH (and no --keep-silence) the clip is trimmed
//            of lead/tail silence and re-encoded at --bitrate (40k); without it the
//            bytes are written as they came. No style prefix — MiniMax has
//            `emotion` + `speed` instead.
//   gemini   the original path, byte-for-byte: Gemini TTS (GOOGLE_API_KEY) → raw
//            PCM → ffmpeg → MP3, with the tutor STYLE prefix on every segment.
// --verify (the ASR round-trip) always transcribes with Gemini (GOOGLE_API_KEY).
//
//   node scripts/lessons/generate-narration.mjs binomial-theorem-am
//   node scripts/lessons/generate-narration.mjs binomial-theorem-am --dry
//   node scripts/lessons/generate-narration.mjs binomial-theorem-am --scene 7 --force
//   node scripts/lessons/generate-narration.mjs binomial-theorem-am --verify
//   node scripts/lessons/generate-narration.mjs binomial-theorem-am --provider gemini --voice Charon
//
// File names (1-based, zero-padded, so they sort like the lesson plays):
//   scene-07.mp3        a scene narrated by ONE string (whole-scene clip)
//   scene-07-3.mp3      the 3rd sub-step of a scene narrated by an ARRAY
//   scene-07-b3.mp3     the 3rd BEAT of a scene narrated by `beats` (the beat
//                       model, 2026-09-04): one clip per beat, its `say` is the
//                       text, and the path is written to beats[2].audio — the
//                       scene carries no `narration`/`audio` of its own
//
// Idempotent: a scene whose clip(s) already exist is skipped, so a re-run after
// editing ONE scene's narration (delete its files, or --scene N --force) only
// synthesizes that scene. Adrian's own recording drops in under the SAME file
// names — re-run nothing, the player only ever reads `audio` paths.
//
// Flags
//   --provider <p>     minimax (default) | gemini
//   --voice <name>     voice id (minimax default English_FriendlyPerson; gemini
//                      default Charon — see VOICES below)
//   --model <id>       TTS model (minimax default speech-02-hd; gemini default
//                      gemini-2.5-flash-preview-tts)
//   --emotion <e>      minimax only (default calm)
//   --speed <x>        minimax only (default 1)
//   --style "<text>"   gemini only — the spoken-style instruction prefixed to every segment
//   --bitrate <k>      MP3 bitrate of the ffmpeg encode (default 40k mono, ~5 KB/s
//                      — both providers; lesson-script.test.ts caps a lesson's
//                      clips at 3 MiB). Without ffmpeg a minimax clip stays at
//                      the API's 64 kbps.
//   --scene <n>        only scene n (1-based)
//   --force            regenerate even when a clip exists
//   --keep-silence     skip the leading/trailing silence trim
//   --masters <dir>    also keep a master of each clip there (OUTSIDE the repo):
//                      gemini — a lossless 24 kHz WAV, so a later bitrate change
//                      is a re-encode, not a re-synthesis; minimax — the API's
//                      untrimmed MP3 as it came back
//   --dry              plan only — no API calls, no writes
//   --verify           transcribe every clip back (Gemini audio understanding)
//                      and score it against its narration — the listen-check a
//                      terminal can do. Adds nothing to the repo.
//
// Gemini voices the API exposes (probed 2026-09-02 — the error for an unknown name
// lists them): achernar, achird, algenib, algieba, alnilam, aoede, autonoe,
// callirrhoe, charon, despina, enceladus, erinome, fenrir, gacrux, iapetus,
// kore, laomedeia, leda, orus, puck, pulcherrima, rasalgethi, sadachbia,
// sadaltager, schedar, sulafat, umbriel, vindemiatrix, zephyr, zubenelgenubi.
// Calm male tutors among them: Charon (informative), Iapetus (clear),
// Schedar (even), Sadaltager (knowledgeable), Umbriel (easy-going), Achird
// (friendly). Pace in the probe ranged 2.0–2.7 words/s.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEFAULTS = {
  provider: 'minimax',
  minimax: { model: 'speech-02-hd', voice: 'English_FriendlyPerson', emotion: 'calm', speed: 1, bitrate: '40k' },
  // gemini-3.1-flash-tts-preview also works (same request shape; mime differs
  // only in casing) but read the maths at ~1.6 words/s in the 2026-09-02 probe
  // — the 2.5 flash TTS model lands at a natural 2.0–2.4 words/s.
  model: 'gemini-2.5-flash-preview-tts',
  voice: 'Charon',
  bitrate: '40k',
  // Prefixed to every segment. The probe's ASR round-trip confirmed the
  // instruction itself is never read aloud. "never rushed"/"unhurried" slowed
  // the read to ~1.6–1.9 w/s; "natural conversational pace" keeps a tutor's
  // clarity without dragging.
  style: 'Read this as a warm, calm maths tutor talking to one student — clear and friendly, at a natural conversational pace: ',
  transcribeModel: 'gemini-2.5-flash',
};

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { flags: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args.flags[key] = next; i++; }
      else args.flags[key] = true;
    } else args.positional.push(a);
  }
  return args;
}

const { flags, positional } = parseArgs(process.argv.slice(2));
const slug = positional[0];
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: node scripts/lessons/generate-narration.mjs <slug> [--provider minimax|gemini] [--voice …] [--model …] [--scene N] [--force] [--dry] [--verify]');
  process.exit(2);
}
const PROVIDER = typeof flags.provider === 'string' ? flags.provider : DEFAULTS.provider;
if (PROVIDER !== 'minimax' && PROVIDER !== 'gemini') { console.error(`--provider must be minimax or gemini (got "${PROVIDER}")`); process.exit(2); }
const MINIMAX = PROVIDER === 'minimax';
const MODEL = flags.model || (MINIMAX ? DEFAULTS.minimax.model : DEFAULTS.model);
const VOICE = flags.voice || (MINIMAX ? DEFAULTS.minimax.voice : DEFAULTS.voice);
const BITRATE = flags.bitrate || (MINIMAX ? DEFAULTS.minimax.bitrate : DEFAULTS.bitrate);
const STYLE = typeof flags.style === 'string' ? flags.style : DEFAULTS.style;
const EMOTION = typeof flags.emotion === 'string' ? flags.emotion : DEFAULTS.minimax.emotion;
const SPEED = flags.speed !== undefined ? Number(flags.speed) : DEFAULTS.minimax.speed;
if (!Number.isFinite(SPEED) || SPEED <= 0) { console.error(`--speed must be a positive number (got "${flags.speed}")`); process.exit(2); }
const ONLY_SCENE = flags.scene ? Number(flags.scene) : null;
const FORCE = flags.force === true;
const DRY = flags.dry === true;
const VERIFY = flags.verify === true;
const KEEP_SILENCE = flags['keep-silence'] === true;
const MASTERS_DIR = typeof flags.masters === 'string' ? path.resolve(flags.masters) : null;

// ── Env (.env.local, dotenv-style; trailing literal "\n" trimmed — see CLAUDE.md) ──

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    val = val.replace(/\\n$/, '').trim();
    out[key] = val;
  }
  return out;
}
const env = { ...loadEnv(), ...process.env };
const API_KEY = env.GOOGLE_API_KEY;
const MINIMAX_API_KEY = (env.MINIMAX_API_KEY || '').trim();

// ── Lesson + segment plan ────────────────────────────────────────────────────

const scriptPath = path.join(ROOT, 'data', 'lessons', `${slug}.json`);
if (!fs.existsSync(scriptPath)) { console.error(`no such lesson: ${scriptPath}`); process.exit(2); }
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const outDir = path.join(ROOT, 'public', 'lessons', slug);
const servedBase = `/lessons/${slug}`;

const pad2 = n => String(n).padStart(2, '0');
const words = t => t.trim().split(/\s+/).filter(Boolean).length;

/** One synthesizable unit: a whole-scene string, one entry of a per-step array, or one beat. */
function planSegments() {
  const segments = [];
  script.scenes.forEach((scene, i) => {
    const n = i + 1;
    if (ONLY_SCENE !== null && n !== ONLY_SCENE) return;
    if (Array.isArray(scene.beats) && scene.beats.length > 0) {
      if (scene.narration !== undefined || scene.audio !== undefined) {
        throw new Error(`scene ${n} carries beats AND narration/audio — a beat scene derives both from beats[].say (run verify-lesson)`);
      }
      scene.beats.forEach((b, j) => {
        if (typeof b.say !== 'string' || !b.say.trim()) throw new Error(`scene ${n} beat ${j + 1}: say must be a non-empty string`);
        const key = `scene-${pad2(n)}-b${j + 1}`;
        const served = `${servedBase}/${key}.mp3`;
        const existing = typeof b.audio === 'string' ? b.audio : undefined;
        const existingFile = existing && existing.startsWith('/') ? path.join(ROOT, 'public', existing) : null;
        const present = !!existingFile && fs.existsSync(existingFile) && fs.statSync(existingFile).size > 0;
        segments.push({ sceneIdx: i, sceneNo: n, stepIdx: j, perStep: false, beat: true, key, text: b.say, served, file: path.join(outDir, `${key}.mp3`), existing, present });
      });
      return;
    }
    const narration = scene.narration;
    if (narration === undefined) return;
    const list = Array.isArray(narration) ? narration : [narration];
    list.forEach((text, j) => {
      const key = Array.isArray(narration) ? `scene-${pad2(n)}-${j + 1}` : `scene-${pad2(n)}`;
      const served = `${servedBase}/${key}.mp3`;
      const existing = Array.isArray(scene.audio) ? scene.audio[j] : (j === 0 && typeof scene.audio === 'string' ? scene.audio : undefined);
      const existingFile = existing && existing.startsWith('/') ? path.join(ROOT, 'public', existing) : null;
      const present = !!existingFile && fs.existsSync(existingFile) && fs.statSync(existingFile).size > 0;
      segments.push({ sceneIdx: i, sceneNo: n, stepIdx: j, perStep: Array.isArray(narration), key, text, served, file: path.join(outDir, `${key}.mp3`), existing, present });
    });
  });
  return segments;
}

// ── Gemini TTS ───────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function geminiPost(model, body, { attempts = 6 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (r.ok) return JSON.parse(text);
    lastErr = new Error(`HTTP ${r.status}: ${text.slice(0, 400)}`);
    // 429 = quota/rate; 5xx = transient. Daily-quota exhaustion says so in the
    // message — no point hammering it; a re-run tomorrow resumes (idempotent).
    if (r.status === 429 && /per day|daily|PerDay/i.test(text)) throw lastErr;
    if (r.status === 429 || r.status >= 500) { await sleep(Math.min(60_000, 4_000 * 2 ** (attempt - 1))); continue; }
    throw lastErr;
  }
  throw lastErr;
}

/** Text → 16-bit PCM buffer + sample rate. */
async function synthesize(text) {
  const body = {
    contents: [{ parts: [{ text: STYLE + text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  };
  // The preview model occasionally answers 200 with finishReason "OTHER" and
  // no audio at all (1 of 31 segments in the pilot run) — a re-ask succeeds.
  let j, part;
  for (let attempt = 1; attempt <= 4; attempt++) {
    j = await geminiPost(MODEL, body);
    part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part) break;
    if (attempt < 4) await sleep(1500 * attempt);
  }
  if (!part) throw new Error(`no audio in response after 4 tries: ${JSON.stringify(j).slice(0, 300)}`);
  const mime = String(part.inlineData.mimeType || '');
  // 2.5 answers "audio/L16;codec=pcm;rate=24000", 3.1 "audio/l16; rate=24000; channels=1".
  if (!/audio\/l16/i.test(mime)) throw new Error(`unexpected audio mime "${mime}" — expected raw L16 PCM`);
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] || 24000);
  const channels = Number(/channels=(\d+)/i.exec(mime)?.[1] || 1);
  if (channels !== 1) throw new Error(`expected mono PCM, got channels=${channels}`);
  return { pcm: Buffer.from(part.inlineData.data, 'base64'), rate };
}

// ── MiniMax Speech-02 ────────────────────────────────────────────────────────

/** Text → MP3 bytes (t2a_v2; `data.audio` is HEX). Same request as lib/explain-voice-store.ts. */
async function synthesizeMinimax(text) {
  const body = {
    model: MODEL,
    text,
    voice_setting: { voice_id: VOICE, speed: SPEED, vol: 1, pitch: 0, emotion: EMOTION },
    audio_setting: { format: 'mp3', sample_rate: 24000, bitrate: 64000, channel: 1 },
  };
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MINIMAX_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const raw = await r.text();
    if (!r.ok) {
      lastErr = new Error(`HTTP ${r.status}: ${raw.slice(0, 300)}`);
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(30_000, 2_000 * 2 ** (attempt - 1))); continue; }
      throw lastErr;
    }
    const j = JSON.parse(raw);
    const code = j.base_resp?.status_code ?? 0;
    if (code !== 0) {
      // 1008 = insufficient balance — stop the run, nothing to retry (the worker reads "daily").
      if (code === 1008) throw new Error(`MiniMax daily quota / balance (${code}): ${j.base_resp?.status_msg}`);
      lastErr = new Error(`MiniMax ${code}: ${j.base_resp?.status_msg}`);
      await sleep(1500 * attempt);
      continue;
    }
    if (j.data?.audio) return Buffer.from(j.data.audio, 'hex');
    lastErr = new Error(`no audio in response: ${raw.slice(0, 200)}`);
    await sleep(1500 * attempt);
  }
  throw lastErr;
}

// ── ffmpeg / ffprobe ─────────────────────────────────────────────────────────

function haveBinary(name) {
  try { execFileSync(name, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
const HAVE_FFMPEG = haveBinary('ffmpeg');
const HAVE_FFPROBE = haveBinary('ffprobe');

/** Keep 150 ms of lead-in and 300 ms of tail; drop the rest of the digital silence. */
const TRIM_FILTER = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.3,areverse';

function encodeMp3(pcm, rate, outFile) {
  const tmp = outFile + '.pcm';
  fs.writeFileSync(tmp, pcm);
  try {
    if (MASTERS_DIR) {
      fs.mkdirSync(MASTERS_DIR, { recursive: true });
      const wav = path.join(MASTERS_DIR, path.basename(outFile, '.mp3') + '.wav');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', tmp, wav], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    const args = ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', tmp];
    if (!KEEP_SILENCE) args.push('-af', TRIM_FILTER);
    // Mono speech at the source rate; CBR keeps every clip's size predictable.
    args.push('-c:a', 'libmp3lame', '-b:a', BITRATE, '-ar', String(rate), '-ac', '1', '-id3v2_version', '0', outFile);
    execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * MiniMax path: the bytes ARE the clip. Trim the lead/tail silence through
 * ffmpeg when it is on PATH (a re-encode at --bitrate, 40k by default — the
 * API's 64 kbps would bust the 3 MiB-per-lesson test); otherwise — or with
 * --keep-silence — write them as they came.
 */
function writeMp3(mp3, outFile) {
  if (MASTERS_DIR) {
    fs.mkdirSync(MASTERS_DIR, { recursive: true });
    fs.writeFileSync(path.join(MASTERS_DIR, path.basename(outFile)), mp3);
  }
  if (KEEP_SILENCE || !HAVE_FFMPEG) { fs.writeFileSync(outFile, mp3); return; }
  const tmp = outFile + '.raw.mp3';
  fs.writeFileSync(tmp, mp3);
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-af', TRIM_FILTER,
      '-c:a', 'libmp3lame', '-b:a', BITRATE, '-ac', '1', '-id3v2_version', '0', outFile], { stdio: ['ignore', 'ignore', 'pipe'] });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function probe(file) {
  if (!HAVE_FFPROBE) return { codec: 'mp3', rate: 24000, channels: 1, secs: NaN, bytes: fs.statSync(file).size };
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate:format=duration',
    '-of', 'json', file,
  ]).toString();
  const j = JSON.parse(out);
  const s = j.streams?.[0] || {};
  return { codec: s.codec_name, rate: Number(s.sample_rate), channels: Number(s.channels), secs: Number(j.format?.duration || 0), bytes: fs.statSync(file).size };
}

// ── JSON writer: 2-space indent, short leaf objects/arrays inline (the hand style of data/lessons/*.json) ──

const INLINE_MAX = 120;
function isPrimitive(v) { return v === null || typeof v !== 'object'; }
function inlineable(v) {
  if (Array.isArray(v)) return v.every(isPrimitive);
  if (isPrimitive(v)) return true;
  return Object.values(v).every(x => isPrimitive(x) || (Array.isArray(x) && x.every(isPrimitive)));
}
function inlineJson(v) {
  if (Array.isArray(v)) return `[${v.map(inlineJson).join(', ')}]`;
  if (isPrimitive(v)) return JSON.stringify(v);
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  return entries.length === 0 ? '{}' : `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inlineJson(x)}`).join(', ')} }`;
}
function formatJson(v, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (isPrimitive(v)) return JSON.stringify(v);
  if (inlineable(v)) {
    const one = inlineJson(v);
    if (one.length <= INLINE_MAX) return one;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return `[\n${v.map(x => padIn + formatJson(x, indent + 1)).join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, x]) => `${padIn}${JSON.stringify(k)}: ${formatJson(x, indent + 1)}`).join(',\n')}\n${pad}}`;
}

// ── Verify: transcribe back and score ────────────────────────────────────────

// The transcriber writes maths as symbols ("1 + 2x + x²", "12 - 3R = 0",
// "T5 = 6 choose 4 * 2 to the power 4") where the narration has the words a
// tutor says. Speak the symbols and numbers before comparing, so the score
// measures what was SAID, not how the ASR chose to typeset it.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numberWords(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) { const o = n % 10; return o ? [TENS[Math.floor(n / 10)], ONES[o]] : [TENS[Math.floor(n / 10)]]; }
  if (n < 1000) { const r = n % 100; return [ONES[Math.floor(n / 100)], 'hundred', ...(r ? ['and', ...numberWords(r)] : [])]; }
  if (n < 10000) { const r = n % 1000; return [ONES[Math.floor(n / 1000)], 'thousand', ...(r ? (r < 100 ? ['and', ...numberWords(r)] : numberWords(r)) : [])]; }
  return [String(n)];
}
const SPELLING = { neighbors: 'neighbours', neighbor: 'neighbour', ncr: 'n c r' };
function normalizeWords(t) {
  const spoken = t.toLowerCase()
    .replace(/[’']/g, '')
    .replace(/²/g, ' squared ').replace(/³/g, ' cubed ')
    .replace(/(\d)\s*\+\s*/g, '$1 plus ').replace(/\+/g, ' plus ')
    .replace(/(\d|[a-z])\s*[-−–]\s*(\d|[a-z]\b)/g, '$1 minus $2')
    .replace(/[×*]/g, ' times ').replace(/=/g, ' equals ').replace(/\//g, ' over ')
    .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ');
  return spoken.split(/\s+/).filter(Boolean)
    .flatMap(w => (/^\d+$/.test(w) ? numberWords(Number(w)) : [w]))
    .flatMap(w => (SPELLING[w] ? SPELLING[w].split(' ') : [w]));
}
/** Fraction of the narration's words the transcript also contains (bag of words). */
function containment(narration, transcript) {
  const a = normalizeWords(narration);
  const bag = new Map();
  for (const w of normalizeWords(transcript)) bag.set(w, (bag.get(w) || 0) + 1);
  let hit = 0;
  for (const w of a) { const c = bag.get(w) || 0; if (c > 0) { hit++; bag.set(w, c - 1); } }
  return a.length ? hit / a.length : 0;
}
async function transcribe(file) {
  const data = fs.readFileSync(file).toString('base64');
  const body = { contents: [{ parts: [
    { text: 'Transcribe this audio verbatim. Output only the spoken words, nothing else.' },
    { inlineData: { mimeType: 'audio/mpeg', data } },
  ] }] };
  const j = await geminiPost(DEFAULTS.transcribeModel, body, { attempts: 3 });
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const segments = planSegments();
  if (segments.length === 0) { console.log(`${slug}: no narration to synthesize.`); return; }

  if (VERIFY) {
    if (!API_KEY) throw new Error('GOOGLE_API_KEY missing (.env.local)');
    console.log(`Verifying ${segments.length} clip(s) of ${slug} by transcription (${DEFAULTS.transcribeModel})…\n`);
    let low = 0;
    for (const seg of segments) {
      if (!seg.present) { console.log(`  ${seg.key}: (no clip)`); continue; }
      const t = await transcribe(seg.existing.startsWith('/') ? path.join(ROOT, 'public', seg.existing) : seg.file);
      const score = containment(seg.text, t);
      const flag = score < 0.85 ? '  ⚠ LOW' : '';
      if (score < 0.85) low++;
      console.log(`  ${seg.key}: ${(score * 100).toFixed(0)}% of narration words heard${flag}`);
      if (score < 0.85) console.log(`      heard: ${t.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    console.log(`\n${low === 0 ? 'All clips match their narration.' : `${low} clip(s) below 85% — listen to those.`}`);
    return;
  }

  const todo = segments.filter(s => FORCE || !s.present);
  console.log(`${slug}: ${segments.length} segment(s), ${segments.length - todo.length} already have clips, ${todo.length} to synthesize` +
    (DRY ? ' (dry run)' : ` — ${PROVIDER} ${MODEL} / ${VOICE}${MINIMAX ? ` / ${EMOTION} ×${SPEED}` : ` / ${BITRATE}`} mono`));
  for (const s of todo) console.log(`  · ${s.key}  (${words(s.text)} words)`);
  if (DRY || todo.length === 0) { if (!DRY) writeScript(segments); return; }

  if (MINIMAX) {
    if (!MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY missing (.env.local)');
    if (!HAVE_FFMPEG && !KEEP_SILENCE) console.log('  (ffmpeg not on PATH — clips written untrimmed, as the API returned them)');
  } else {
    if (!API_KEY) throw new Error('GOOGLE_API_KEY missing (.env.local)');
    for (const bin of ['ffmpeg', 'ffprobe']) if (!haveBinary(bin)) throw new Error(`${bin} not found on PATH (brew install ffmpeg)`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Two in flight: kind to the rate limit, half the wall time of sequential.
  const queue = [...todo];
  const results = [];
  const failures = [];
  async function worker() {
    for (;;) {
      const seg = queue.shift();
      if (!seg) return;
      try {
        if (MINIMAX) {
          writeMp3(await synthesizeMinimax(seg.text), seg.file);
        } else {
          const { pcm, rate } = await synthesize(seg.text);
          encodeMp3(pcm, rate, seg.file);
        }
        const p = probe(seg.file);
        seg.present = true;
        results.push({ seg, p });
        const wps = words(seg.text) / p.secs;
        const pace = Number.isFinite(wps) ? `  ${wps.toFixed(2)} w/s${wps < 1.6 || wps > 3.4 ? '  ⚠ pace' : ''}` : '';
        console.log(`  ✓ ${seg.key}  ${Number.isFinite(p.secs) ? p.secs.toFixed(1) + 's' : '?s'}  ${(p.bytes / 1024).toFixed(0)} KB${pace}`);
      } catch (e) {
        failures.push({ seg, error: e.message });
        console.log(`  ✗ ${seg.key}: ${e.message}`);
        if (/per day|daily|PerDay|balance/i.test(e.message)) { queue.length = 0; }
      }
    }
  }
  await Promise.all([worker(), worker()]);

  // Every segment that now has a file gets its served path in the JSON —
  // including ones from earlier runs, so a partial run still leaves the
  // script consistent (the validator insists audio arrays match narration
  // arrays in length, so a per-step scene is only written once complete).
  writeScript(segments);

  // Summary
  let totalSecs = 0, totalBytes = 0;
  console.log('\nClips on disk:');
  for (const seg of segments) {
    if (!fs.existsSync(seg.file)) continue;
    const p = probe(seg.file);
    totalSecs += Number.isFinite(p.secs) ? p.secs : 0; totalBytes += p.bytes;
    if (p.codec !== 'mp3' || p.channels !== 1) console.log(`  ⚠ ${seg.key}: ${p.codec} ${p.channels}ch — expected mono mp3`);
  }
  console.log(`  ${segments.filter(s => fs.existsSync(s.file)).length} file(s), ${(totalSecs / 60).toFixed(1)} min, ${(totalBytes / 1024).toFixed(0)} KB total`);
  if (failures.length) {
    console.log(`\n${failures.length} segment(s) failed — re-run to resume (idempotent):`);
    for (const f of failures) console.log(`  ${f.seg.key}: ${f.error.slice(0, 200)}`);
    process.exitCode = 1;
  }
}

/** Write `audio` paths for every complete scene, in the hand formatting. */
function writeScript(segments) {
  const byScene = new Map();
  for (const seg of segments) {
    if (!byScene.has(seg.sceneIdx)) byScene.set(seg.sceneIdx, []);
    byScene.get(seg.sceneIdx).push(seg);
  }
  let changed = false;
  for (const [sceneIdx, segs] of byScene) {
    const scene = script.scenes[sceneIdx];
    if (segs[0].beat) {
      // Beats are independent: each beat's audio is written the moment its clip exists.
      for (const seg of segs) {
        if (!(fs.existsSync(seg.file) && fs.statSync(seg.file).size > 0)) continue;
        if (scene.beats[seg.stepIdx].audio !== seg.served) { scene.beats[seg.stepIdx].audio = seg.served; changed = true; }
      }
      continue;
    }
    const complete = segs.every(s => fs.existsSync(s.file) && fs.statSync(s.file).size > 0);
    if (!complete) continue;
    const next = segs[0].perStep ? segs.map(s => s.served) : segs[0].served;
    if (JSON.stringify(scene.audio) !== JSON.stringify(next)) { scene.audio = next; changed = true; }
  }
  const text = formatJson(script) + '\n';
  if (changed || text !== fs.readFileSync(scriptPath, 'utf8')) {
    fs.writeFileSync(scriptPath, text);
    console.log(`\nWrote ${path.relative(ROOT, scriptPath)}${changed ? ' (audio paths updated)' : ' (reformatted)'}. Run npm test to validate.`);
  }
}

main().catch(e => { console.error(`\n${e.message}`); process.exit(1); });
