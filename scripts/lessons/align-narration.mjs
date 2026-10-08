#!/usr/bin/env node
// Time every spoken word of a lesson's voice clips, so the board can move on
// the WORD (docs/LESSONS.md § Word cues + § Timing sidecars).
//
//   node scripts/lessons/align-narration.mjs <slug>            # write missing sidecars + stamp beats[].timing
//   node scripts/lessons/align-narration.mjs <slug> --force    # redo every clip
//   node scripts/lessons/align-narration.mjs <slug> --report   # also print how far from its word every cued action fires
//   node scripts/lessons/align-narration.mjs <slug> --report --against HEAD~1   # …and what the script at that commit did
//
// Free and local, ffmpeg only — no speech model, no paid service, nothing leaves
// the Mac. How: the voice pauses between phrases, and ffmpeg can hear exactly
// where every pause starts and ends. The beat's own `say` is the script of the
// clip, so the words are dealt out to the stretches of speech between the
// pauses — each stretch gets the run of words that fits its length at the
// voice's own pace (a pause nearly always falls at a comma or a full stop, and
// the fit prefers that) — and inside a stretch each word takes its share by
// length. The first word after every pause is exact; a word inside a stretch
// is good to about a tenth of a second.
//
// (A speech recogniser's own word times were tried first — whisper.cpp, base.en.
// They drifted by seconds on a third of the clips and piled up at the end of
// others; the pauses do not lie. When whisper-cli is installed it is still asked
// ONE thing — which word it heard right after each pause — see heardStarts.)
//
// Output: public/lessons/<slug>/scene-NN-bK.timing.json beside each clip
//   { "words": [["Expand", 0.15, 0.52], …] }   seconds, clip-relative, one entry per word of `say`
// and `timing` on each beat that has one. Re-run after any clip is regenerated.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, LESSONS_DIR, formatJson, loadTs, parseArgs } from './shared.mjs';

/** The stretches of speech in a clip: [start, end] seconds, in order. */
function speechRuns(mp3, duration) {
  const err = String(spawnSync('ffmpeg', ['-i', mp3, '-af', 'silencedetect=noise=-35dB:d=0.18', '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '');
  const quiet = [];
  for (const m of err.matchAll(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: (-?[\d.]+)/g)) quiet.push([Math.max(0, Number(m[1])), Math.min(duration, Number(m[2]))]);
  const runs = [];
  let t = 0;
  for (const [a, b] of quiet) { if (a - t > 0.08) runs.push([t, a]); t = Math.max(t, b); }
  if (duration - t > 0.08) runs.push([t, duration]);
  if (!runs.length) return [[0, duration]];
  // The clip's first and last breath are shorter than a pause (clips are trimmed to
  // ~150 ms lead / 300 ms tail): find them with a finer ear, so the first word is not timed at 0.
  const fine = String(spawnSync('ffmpeg', ['-i', mp3, '-af', 'silencedetect=noise=-35dB:d=0.04', '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '');
  const fq = [...fine.matchAll(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: (-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  const lead = fq.find(([a]) => a <= 0.02);
  if (lead && lead[1] > runs[0][0] && lead[1] < runs[0][1]) runs[0][0] = lead[1];
  const tail = fq.find(([, b]) => b >= duration - 0.02);
  const last = runs[runs.length - 1];
  if (tail && tail[0] < last[1] && tail[0] > last[0]) last[1] = tail[0];
  return runs;
}

// ── A second opinion, when it is installed: which word did a recogniser hear right after each pause? ──
// Optional (`brew install whisper-cpp` + a model at WHISPER_MODEL or ~/.cache/whisper-cpp/ggml-*.en.bin).
// Its word times are NOT used — only its vote on which word starts a stretch, which
// settles the rare pause that falls in mid-phrase ("Factorize the two | out of every term").
const NUM = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
const key = (w) => { const k = w.toLowerCase().replace(/[^a-z0-9]/g, ''); return NUM[k] ?? k; };
function findModel() {
  const dir = path.join(os.homedir(), '.cache/whisper-cpp');
  const cands = [process.env.WHISPER_MODEL, path.join(dir, 'ggml-small.en.bin'), path.join(dir, 'ggml-base.en.bin')].filter(Boolean);
  if (spawnSync('whisper-cli', ['--help']).error) return null;
  return cands.find(p => fs.existsSync(p)) ?? null;
}
/** Per script word: the time the recogniser started it at, or NaN. */
function heardStarts(mp3, say, words, model, tmp) {
  try {
    const wav = path.join(tmp, 'clip.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ar', '16000', '-ac', '1', wav]);
    execFileSync('whisper-cli', ['-m', model, '-f', wav, '-ojf', '-of', path.join(tmp, 'clip'), '-np', '-ml', '1', '-sow', '--prompt', say], { stdio: 'ignore' });
    const heard = (JSON.parse(fs.readFileSync(path.join(tmp, 'clip.json'), 'utf8')).transcription ?? [])
      .map(seg => ({ k: key(String(seg.text ?? '')), t: seg.offsets.from / 1000 })).filter(h => h.k);
    // longest common subsequence: script word → heard word
    const a = words.map(key), n = a.length, m = heard.length;
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === heard[j].k ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = new Array(n).fill(NaN);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i] === heard[j].k) out[i++] = heard[j++].t;
      else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    if (process.env.DEBUG) console.error(words.map((w, i) => `${w}@${Number.isNaN(out[i]) ? '?' : out[i].toFixed(2)}`).join(' '));
    return out;
  } catch (e) { if (process.env.DEBUG) console.error(e.message); return null; }
}

/** A word's length as the voice spends it: its letters, plus the gap before the next word. */
const wordLen = (w) => Math.max(1, w.replace(/[^A-Za-z0-9]/g, '').length) + 1;
const endsPhrase = (w) => /[.,;:!?…—–]["')\]]*$/.test(w);

/**
 * Deal the words out to the stretches of speech: contiguous groups, in order,
 * one per stretch, minimising how far each stretch's length is from what its
 * words need at the clip's overall pace — and preferring a pause that falls
 * after punctuation. Returns [{ text, start, end }] per word.
 */
function timeWords(words, runs, heard = null) {
  const n = words.length;
  // More stretches than words can fill (a click, a breath): fold the shortest into its neighbour.
  const R = runs.map(r => [...r]);
  while (R.length > n) {
    let k = 0;
    for (let i = 1; i < R.length; i++) if (R[i][1] - R[i][0] < R[k][1] - R[k][0]) k = i;
    if (k > 0) { R[k - 1][1] = R[k][1]; R.splice(k, 1); } else { R[1][0] = R[0][0]; R.splice(0, 1); }
  }
  const K = R.length;
  const len = words.map(wordLen);
  const cum = [0];
  for (const l of len) cum.push(cum[cum.length - 1] + l);
  const speech = R.reduce((p, r) => p + (r[1] - r[0]), 0);
  const pace = cum[n] / speech;                       // letters a second, over the whole clip
  const VOTE = 0.3;
  const NO_PUNCT = 0.3;                               // a pause in mid-phrase costs as much as a 0.55 s misfit
  // best[k][j] = cheapest way to put the first j words into the first k stretches
  const best = Array.from({ length: K + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const from = Array.from({ length: K + 1 }, () => new Int32Array(n + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= K; k++) {
    const d = R[k - 1][1] - R[k - 1][0];
    for (let j = k; j <= n - (K - k); j++) {
      for (let i = k - 1; i < j; i++) {
        if (best[k - 1][i] === Infinity) continue;
        const need = (cum[j] - cum[i]) / pace;
        let c = best[k - 1][i] + (need - d) ** 2 + (k < K && !endsPhrase(words[j - 1]) ? NO_PUNCT : 0);
        // the recogniser heard word j start (a quarter-second early at most) where the next stretch starts: a vote for this cut
        // (the closer its time is to where the stretch really starts, the stronger the vote)
        if (k < K && heard && !Number.isNaN(heard[j])) c -= VOTE * Math.max(0, 1 - Math.abs(heard[j] - R[k][0]) / 0.25);
        if (c < best[k][j]) { best[k][j] = c; from[k][j] = i; }
      }
    }
  }
  const cuts = new Array(K + 1).fill(0);
  cuts[K] = n;
  for (let k = K, j = n; k >= 1; k--) { j = from[k][j]; cuts[k - 1] = j; }
  const out = [];
  for (let k = 0; k < K; k++) {
    const [a, b] = R[k];
    const total = cum[cuts[k + 1]] - cum[cuts[k]];
    for (let i = cuts[k]; i < cuts[k + 1]; i++) {
      const s = a + ((cum[i] - cum[cuts[k]]) / total) * (b - a);
      const e = a + ((cum[i + 1] - cum[cuts[k]]) / total) * (b - a);
      out.push({ text: words[i], start: s, end: e });
    }
  }
  return { words: out, stretches: K, misfit: Math.sqrt(Math.max(0, best[K][n]) / K) };
}

const args = parseArgs(process.argv.slice(2));
const slug = args._[0];
if (!slug) { console.error('usage: align-narration.mjs <slug> [--force] [--report]'); process.exit(2); }
const file = path.join(LESSONS_DIR, `${slug}.json`);
const script = JSON.parse(fs.readFileSync(file, 'utf8'));
const speech = await loadTs('src/lib/lesson-speech.ts');
const beatsLib = await loadTs('src/lib/lesson-beats.ts');
const model = findModel();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsn-align-'));
if (!model) console.log('(no whisper-cli + model found: timing from the pauses alone)');
const before = typeof args.against === 'string' ? JSON.parse(execFileSync('git', ['show', `${args.against}:data/lessons/${slug}.json`], { cwd: ROOT, maxBuffer: 1 << 26 }).toString()) : null;
const durOf = (mp3) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString().trim());

let wrote = 0, clips = 0, low = [];
const report = [];
for (const [si, scene] of script.scenes.entries()) {
  for (const [bi, beat] of (scene.beats ?? []).entries()) {
    if (!beat.audio || !beat.audio.startsWith('/lessons/')) continue;
    clips++;
    const mp3 = path.join(ROOT, 'public', beat.audio);
    if (!fs.existsSync(mp3)) { console.warn(`  missing clip ${beat.audio}`); continue; }
    const side = beat.audio.replace(/\.[a-z0-9]+$/i, '.timing.json');
    const sidePath = path.join(ROOT, 'public', side);
    const words = speech.spokenWords(beat.say);
    const duration = durOf(mp3);
    let timed;
    if (fs.existsSync(sidePath) && !args.force) {
      timed = JSON.parse(fs.readFileSync(sidePath, 'utf8')).words.map(([text, start, end]) => ({ text, start, end }));
    } else {
      const r = timeWords(words, speechRuns(mp3, duration), model ? heardStarts(mp3, beat.say, words, model, tmp) : null);
      timed = r.words;
      if (r.misfit > 0.6) low.push(`${beat.audio} — its pauses fit the words poorly (${r.misfit.toFixed(2)} s a stretch); is the clip the same words as the script?`);
      fs.writeFileSync(sidePath, JSON.stringify({ words: timed.map(w => [w.text, +w.start.toFixed(3), +w.end.toFixed(3)]) }) + '\n');
      wrote++;
    }
    beat.timing = side;

    if (args.report) {
      // Where each action fires, three ways: what an earlier version of the
      // script did (--against <git ref>: its guessed `at` fractions), the word's
      // estimated share with no sidecar, and the word's real time.
      const exact = speech.buildSpeechTrack(beat.say, duration, { words: timed, sentences: null });
      const tExact = beatsLib.resolveActionTimes(beat.do, beat.say, exact);
      const tShare = beatsLib.resolveActionTimes(beat.do, beat.say, speech.buildSpeechTrack(beat.say, duration, null));
      const oldBeat = before?.scenes?.[si]?.beats?.[bi];
      const tOld = oldBeat && oldBeat.say === beat.say ? beatsLib.resolveActionTimes(oldBeat.do) : null;
      // An action is matched to its old self by kind + target, so a re-ordered beat still compares.
      const sig = (a) => JSON.stringify({ ...a, at: undefined, on: undefined });
      let from = 0;
      beat.do.forEach((a, j) => {
        if (typeof a.on !== 'string') return;
        const idx = speech.cueWordIndex(beat.say, a.on, from);
        if (idx < 0) return;
        from = idx;
        const said = timed[idx].start;
        report.push({
          where: `scene ${si + 1} beat ${bi + 1} ${a.do}`, on: a.on, said,
          guess: (() => { const k = tOld ? oldBeat.do.findIndex(o => sig(o) === sig(a)) : -1; return k >= 0 ? tOld[k] * duration - said : null; })(),
          share: tShare[j] * duration - said,
          exact: tExact[j] * duration - said,
        });
      });
    }
  }
}
fs.writeFileSync(file, formatJson(script) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${slug}: ${clips} clips, ${wrote} sidecars written, ${clips - wrote} already there`);
for (const l of low) console.warn(`  ⚠ listen to this one: ${l}`);

if (args.report && report.length) {
  const stat = (xs) => {
    const v = xs.filter(x => x !== null).map(Math.abs).sort((p, q) => p - q);
    if (!v.length) return 'n/a';
    const mean = v.reduce((p, q) => p + q, 0) / v.length;
    return `mean ${mean.toFixed(2)} s · median ${v[Math.floor(v.length / 2)].toFixed(2)} s · worst ${v[v.length - 1].toFixed(2)} s · over half a second: ${v.filter(x => x > 0.5).length}/${v.length}`;
  };
  console.log(`\nHow far from its word each action fires (${report.length} cued actions; − = early, + = late):`);
  for (const r of report) {
    console.log(`  ${r.where.padEnd(30)} "${r.on}" said at ${r.said.toFixed(2)} s · before ${r.guess === null ? '  n/a' : (r.guess >= 0 ? '+' : '') + r.guess.toFixed(2)} · no sidecar ${(r.share >= 0 ? '+' : '') + r.share.toFixed(2)} · sidecar ${(r.exact >= 0 ? '+' : '') + r.exact.toFixed(2)}`);
  }
  console.log(`\n  before (guessed at)   : ${stat(report.map(r => r.guess))}`);
  console.log(`  word cue, no sidecar  : ${stat(report.map(r => r.share))}`);
  console.log(`  word cue + sidecar    : ${stat(report.map(r => r.exact))}   (the ${speech.CUE_LEAD_S} s head start is on purpose)`);
}
