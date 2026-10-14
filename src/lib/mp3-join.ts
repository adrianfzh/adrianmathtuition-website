// Join MP3 clips into one file with pauses between them, with no ffmpeg (Vercel has none).
// MPEG audio is a run of independent frames, so clips of the same format join end to end once each
// clip's header block is dropped: an ID3 tag, and a first "Xing"/"Info"/"VBRI" frame that states
// the clip's own length (left in, a player would believe the first clip is the whole file).
// A pause is a run of silent frames of the same format, made from a frame that holds no sound.
// Pure; tested (mp3-join.test.ts). Used by lib/english-listening-voice.ts.

const BITRATES: Record<string, number[]> = {
  // MPEG-1 Layer III, MPEG-2/2.5 Layer III (kbps by index)
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export interface FrameInfo { at: number; size: number; version: number; sampleRate: number; samples: number; channels: number; bitrate: number }

/** The frame header at `i`, or null when there is none (Layer III only). */
export function frameAt(b: Uint8Array, i: number): FrameInfo | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[i + 1] >> 3) & 3;           // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (b[i + 1] >> 1) & 3;             // 1 = Layer III
  if (version === 1 || layer !== 1) return null;
  const bi = (b[i + 2] >> 4) & 15, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
  if (bi === 0 || bi === 15 || si === 3) return null;
  const bitrate = (version === 3 ? BITRATES.v1 : BITRATES.v2)[bi] * 1000;
  const sampleRate = RATES[version][si];
  const samples = version === 3 ? 1152 : 576;
  const size = Math.floor((samples / 8) * bitrate / sampleRate) + pad;
  const channels = ((b[i + 3] >> 6) & 3) === 3 ? 1 : 2;
  return { at: i, size, version, sampleRate, samples, channels, bitrate };
}

function skipId3(b: Uint8Array): number {
  if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    return 10 + size + ((b[5] & 0x10) ? 10 : 0);
  }
  return 0;
}

const hasTag = (b: Uint8Array, from: number, to: number): boolean => {
  for (let i = from; i + 4 <= to; i++) {
    const t = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    if (t === 'Xing' || t === 'Info' || t === 'VBRI') return true;
  }
  return false;
};

/** The audio frames of one clip: no ID3 tag, no length-stating first frame, no trailing tag. */
export function audioFrames(clip: Uint8Array): { frames: Uint8Array; first: FrameInfo | null; count: number } {
  let i = skipId3(clip);
  while (i < clip.length && !frameAt(clip, i)) i++;           // find the first frame
  const first = frameAt(clip, i);
  if (!first) return { frames: new Uint8Array(0), first: null, count: 0 };
  if (hasTag(clip, i + 4, Math.min(i + first.size, clip.length))) i += first.size;
  const start = i;
  let count = 0;
  for (let f = frameAt(clip, i); f && i + f.size <= clip.length; f = frameAt(clip, i)) { i += f.size; count++; }
  return { frames: clip.subarray(start, i), first: frameAt(clip, start), count };
}

/** One frame that holds no sound, in the format of `like`: header + side info + no data. */
export function silentFrame(like: FrameInfo): Uint8Array {
  const f = new Uint8Array(like.size);
  // header: sync, version, Layer III, no CRC; same bitrate index and rate; no padding; mono or stereo as `like`
  const versionBits = like.version << 3;
  const bi = (like.version === 3 ? BITRATES.v1 : BITRATES.v2).indexOf(like.bitrate / 1000);
  const si = RATES[like.version].indexOf(like.sampleRate);
  f[0] = 0xff; f[1] = 0xe0 | versionBits | (1 << 1) | 1;
  f[2] = (bi << 4) | (si << 2);
  f[3] = like.channels === 1 ? 0xc0 : 0x00;
  // side info and main data all zero = every granule has no bits = silence
  return f;
}

/** How many seconds of sound a set of frames holds. */
export const framesSeconds = (count: number, f: FrameInfo): number => (count * f.samples) / f.sampleRate;

/**
 * Join clips, each followed by its pause in seconds. Clips must share one format (the voice's own:
 * 24 kHz mono); a clip in another format is an error, never a garbled file.
 */
export function joinMp3(parts: { clip: Uint8Array; pauseAfter: number }[]): { mp3: Uint8Array; seconds: number } {
  const chunks: Uint8Array[] = [];
  let format: FrameInfo | null = null;
  let frames = 0;
  for (const [n, p] of parts.entries()) {
    const a = audioFrames(p.clip);
    if (!a.first) throw new Error(`clip ${n + 1} has no MP3 frames`);
    if (!format) format = a.first;
    else if (a.first.sampleRate !== format.sampleRate || a.first.channels !== format.channels || a.first.version !== format.version) {
      throw new Error(`clip ${n + 1} is ${a.first.sampleRate} Hz, ${a.first.channels} channel(s); the first was ${format.sampleRate} Hz, ${format.channels}`);
    }
    chunks.push(a.frames); frames += a.count;
    const pause = Math.round((p.pauseAfter * format.sampleRate) / format.samples);
    if (pause > 0) { const s = silentFrame(format); for (let k = 0; k < pause; k++) chunks.push(s); frames += pause; }
  }
  const mp3 = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0; for (const c of chunks) { mp3.set(c, o); o += c.length; }
  return { mp3, seconds: format ? framesSeconds(frames, format) : 0 };
}
