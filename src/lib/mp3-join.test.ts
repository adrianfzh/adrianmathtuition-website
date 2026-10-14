import { describe, it, expect } from 'vitest';
import { audioFrames, frameAt, joinMp3, silentFrame, type FrameInfo } from './mp3-join';

// The voice's format: MPEG-2 Layer III, 24 kHz, mono, 64 kbps → 576 samples, 192 bytes a frame.
const VOICE: FrameInfo = { at: 0, size: 192, version: 2, sampleRate: 24000, samples: 576, channels: 1, bitrate: 64000 };
const frames = (n: number): Uint8Array => { const s = silentFrame(VOICE); const out = new Uint8Array(n * s.length); for (let i = 0; i < n; i++) out.set(s, i * s.length); return out; };
const cat = (...xs: Uint8Array[]): Uint8Array => { const o = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };

describe('joining MP3 clips', () => {
  it('reads the voice format from a frame header', () => {
    const f = frameAt(silentFrame(VOICE), 0)!;
    expect([f.version, f.sampleRate, f.channels, f.bitrate, f.size, f.samples]).toEqual([2, 24000, 1, 64000, 192, 576]);
  });
  it('drops an ID3 tag and a frame that states the clip length', () => {
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4]);
    const xing = silentFrame(VOICE); xing.set([0x58, 0x69, 0x6e, 0x67], 20);   // "Xing"
    const a = audioFrames(cat(id3, xing, frames(5)));
    expect(a.count).toBe(5);
  });
  it('adds the pause as silent frames: 1 s at 24 kHz is about 42 frames', () => {
    const r = joinMp3([{ clip: frames(10), pauseAfter: 1 }, { clip: frames(10), pauseAfter: 0 }]);
    expect(r.mp3.length).toBe((10 + 42 + 10) * 192);
    expect(r.seconds).toBeCloseTo(62 * 0.024, 3);
  });
  it('refuses a clip in another format', () => {
    const other = silentFrame({ ...VOICE, sampleRate: 22050, size: 208 });
    expect(() => joinMp3([{ clip: frames(2), pauseAfter: 0 }, { clip: cat(other, other), pauseAfter: 0 }])).toThrow(/22050 Hz/);
  });
});
