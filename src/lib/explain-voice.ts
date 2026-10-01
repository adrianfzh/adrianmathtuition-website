// The one-minute explanation's VOICE (1 Oct 2026) — the pure half.
//
// lib/explain-clip builds the script with a `say` on every beat and no
// `audio`; this module names where a beat's clip lives, wraps the raw PCM the
// Gemini TTS answers with as a WAV (Vercel has no ffmpeg and the repo carries
// no MP3 encoder — WAV is what a browser plays with zero dependencies), and
// hangs the clip URLs back on the beats so the player's `lessonHasAudio` sees
// them and the 🔊 pill appears. Client-safe: no Node built-ins — the page's
// client island calls `attachVoice` in the browser. The bucket I/O and the
// TTS call live in lib/explain-voice-store (server).

import type { Beat } from './lesson-script';

/** The clip container. WAV until an encoder is worth a dependency. */
export const VOICE_EXT = 'mp3';
export const VOICE_CONTENT_TYPE = 'audio/mpeg';

/** A scene that may carry beats — a LessonScript scene or the player's PlayScene. */
// `type` is on every scene; without it the weak-type rule refuses the `check-skipped` marker.
type BeatScene = { type: string; beats?: Beat[] };

/** The question number as a key segment, the same rule as the script's slug. */
export function questionSlug(questionNumber: string): string {
  return String(questionNumber ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'q';
}

/** FNV-1a over the UTF-16 code units, 8 hex chars — enough to tell one sentence from another, no crypto import. */
export function sayHash(say: string): string {
  let h = 0x811c9dc5;
  const text = String(say ?? '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The bucket folder every clip of one question sits in (list this once, not a head per beat). */
export function voiceFolder(runId: string, questionNumber: string): string {
  return `runs/${runId}/explain/${questionSlug(questionNumber)}`;
}

/**
 * Where beat k's clip lives: `runs/<runId>/explain/<q-slug>/b<k>-<hash>.mp3` (MiniMax answers MP3 since 1 Oct 2026; the earlier Gemini WAVs sit beside, unreferenced).
 * The hash is of the spoken sentence, so a changed `say` (a re-mark, a wording
 * fix in lib/explain-clip) gets a new clip and the old one is simply unused.
 */
export function voiceKey(runId: string, questionNumber: string, beatIndex: number, sayText: string): string {
  return `${voiceFolder(runId, questionNumber)}/b${beatIndex}-${sayHash(sayText)}.${VOICE_EXT}`;
}

/** Every beat's `say`, flattened across the scenes in order — the index is the beat index the keys use. */
export function beatSays(scenes: readonly BeatScene[]): string[] {
  const out: string[] = [];
  for (const scene of scenes) for (const b of scene.beats ?? []) out.push(b.say);
  return out;
}

/**
 * The scenes with `beats[k].audio` set from `urls` (flattened beat order; a
 * null leaves that beat silent — the player falls back to its Auto timer for
 * it). Returns NEW scene objects only where something changed, so a render
 * keyed on the array's identity re-runs `lessonHasAudio`.
 */
export function attachVoice<S extends BeatScene>(scenes: readonly S[], urls: readonly (string | null | undefined)[]): S[] {
  let k = 0;
  return scenes.map(scene => {
    if (!scene.beats?.length) return scene;
    let changed = false;
    const beats = scene.beats.map(b => {
      const url = urls[k++];
      if (!url || b.audio === url) return b;
      changed = true;
      return { ...b, audio: url };
    });
    return changed ? { ...scene, beats } : scene;
  });
}

/**
 * Raw 16-bit little-endian mono PCM → a RIFF/WAVE file. 44-byte canonical
 * header; `pcm.length` must be even (a stray byte is dropped).
 */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataLen = pcm.length - (pcm.length % 2);
  const out = new Uint8Array(44 + dataLen);
  const dv = new DataView(out.buffer);
  const ascii = (at: number, text: string) => { for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i); };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);          // fmt chunk size
  dv.setUint16(20, 1, true);           // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  ascii(36, 'data');
  dv.setUint32(40, dataLen, true);
  out.set(pcm.subarray(0, dataLen), 44);
  return out;
}

/** The header fields of a WAV made here — for tests and the curl proof. */
export function readWavHeader(bytes: Uint8Array): { sampleRate: number; channels: number; bitsPerSample: number; dataBytes: number; seconds: number } | null {
  if (bytes.length < 44) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ' || tag(36) !== 'data') return null;
  const channels = dv.getUint16(22, true);
  const sampleRate = dv.getUint32(24, true);
  const bitsPerSample = dv.getUint16(34, true);
  const dataBytes = dv.getUint32(40, true);
  const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
  return { sampleRate, channels, bitsPerSample, dataBytes, seconds: bytesPerSec ? dataBytes / bytesPerSec : 0 };
}
