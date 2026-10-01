import { describe, expect, it } from 'vitest';
import { attachVoice, beatSays, pcmToWav, questionSlug, readWavHeader, sayHash, voiceFolder, voiceKey } from './explain-voice';
import { isValidKey } from './student-files-url';
import { lessonHasAudio, type PlayScene } from './lesson-script';

const RUN = '5e793b91-ba34-4c81-8d8d-c8f6ac404546';

describe('voiceKey', () => {
  it('is deterministic, a valid student-file key under the run, and changes with the sentence', () => {
    const a = voiceKey(RUN, '3', 0, 'You wrote this line.');
    expect(a).toBe(voiceKey(RUN, '3', 0, 'You wrote this line.'));
    expect(a).toMatch(new RegExp(`^runs/${RUN}/explain/3/b0-[0-9a-f]{8}\\.mp3$`));
    expect(isValidKey(a)).toBe(true);
    expect(voiceKey(RUN, '3', 0, 'You wrote this line!')).not.toBe(a);
    expect(voiceKey(RUN, '3', 1, 'You wrote this line.')).not.toBe(a);
  });
  it('slugs a part label the way the script slug does', () => {
    expect(questionSlug('6(a)(ii)')).toBe('6-a-ii');
    expect(questionSlug('')).toBe('q');
    expect(voiceFolder(RUN, '6(a)(ii)')).toBe(`runs/${RUN}/explain/6-a-ii`);
    expect(isValidKey(voiceKey(RUN, '6(a)(ii)', 2, 'x'))).toBe(true);
  });
  it('hashes to 8 hex chars', () => {
    expect(sayHash('')).toMatch(/^[0-9a-f]{8}$/);
    expect(sayHash('a')).not.toBe(sayHash('b'));
  });
});

const audioOf = (s: PlayScene) => ('beats' in s ? s.beats?.map(b => b.audio) : undefined);

const scenes: PlayScene[] = [
  { type: 'title', title: 'Q3', promise: 'the fix', beats: [{ say: 'One.', do: [] }, { say: 'Two.', do: [] }] },
  { type: 'caption', heading: 'h', text: 'no beats here' },
  { type: 'caption', heading: 'h', text: 't', beats: [{ say: 'Three.', do: [] }] },
];

describe('attachVoice', () => {
  it('flattens beats across scenes in order and fills audio only where a url is given', () => {
    expect(beatSays(scenes)).toEqual(['One.', 'Two.', 'Three.']);
    expect(lessonHasAudio(scenes)).toBe(false);
    const out = attachVoice(scenes, ['https://x/a.wav', null, 'https://x/c.wav']);
    expect(audioOf(out[0])).toEqual(['https://x/a.wav', undefined]);
    expect(audioOf(out[2])).toEqual(['https://x/c.wav']);
    expect(lessonHasAudio(out)).toBe(true);
    // The input is untouched; untouched scenes keep their identity.
    expect(audioOf(scenes[0])).toEqual([undefined, undefined]);
    expect(out[1]).toBe(scenes[1]);
    expect(out[0]).not.toBe(scenes[0]);
  });
  it('leaves everything silent when every url is null', () => {
    const out = attachVoice(scenes, [null, null, null]);
    expect(out).toEqual(scenes);
    expect(lessonHasAudio(out)).toBe(false);
  });
});

describe('pcmToWav', () => {
  it('writes a canonical 44-byte header for 16-bit mono at the given rate', () => {
    const pcm = new Uint8Array(24000 * 2); // one second at 24 kHz
    const wav = pcmToWav(pcm, 24000);
    expect(wav.length).toBe(44 + pcm.length);
    const h = readWavHeader(wav)!;
    expect(h).toMatchObject({ sampleRate: 24000, channels: 1, bitsPerSample: 16, dataBytes: pcm.length });
    expect(h.seconds).toBeCloseTo(1, 5);
    // RIFF size = 36 + data
    expect(new DataView(wav.buffer).getUint32(4, true)).toBe(36 + pcm.length);
  });
  it('drops a stray odd byte and rejects a non-WAV', () => {
    expect(pcmToWav(new Uint8Array(5)).length).toBe(44 + 4);
    expect(readWavHeader(new Uint8Array(10))).toBeNull();
    expect(readWavHeader(new Uint8Array(60))).toBeNull();
  });
});
