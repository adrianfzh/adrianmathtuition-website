// The recordings of a listening paper: every line read by MiniMax (speech-02-hd, the same voices as
// scripts/english-own/speaking-audio.mjs — change them together), joined with pauses by
// lib/mp3-join.ts (no ffmpeg), uploaded to the public bucket english-audio. The level sets the
// speed and the pauses (LEVEL_VOICE). Singapore words are read as sg-say.mjs says (sound only).
// Server only. Costs MiniMax money: ~US$0.10 per 1,000 characters (see voiceChars).
import { getSupabaseAdmin } from './supabase';
import { sayAs } from './sg-say.mjs';
import { joinMp3 } from './mp3-join';
import type { ListeningSet, SpeakerVoice } from './english-listening';
import { LEVEL_VOICE, LISTENING_BUCKET, partAudioKey, type ListeningLevel } from './english-listening-papers';

const TTS_MODEL = 'speech-02-hd';
const NARRATOR = 'English_FriendlyPerson';
const VOICES: Record<SpeakerVoice, string> = { girl: 'English_radiant_girl', woman: 'English_CalmWoman', boy: 'English_ReservedYoungMan', man: NARRATOR };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** What the voice reads: titles it might spell out said in full, then Singapore words as sg-say.mjs says. */
export const spoken = (text: string): string => sayAs(String(text).replace(/\bMdm\b\.?/g, 'Madam'));

/** The characters the voice is paid for in one part: its intro and every line. */
export const voiceChars = (s: ListeningSet): number => spoken(s.intro).length + s.script.reduce((n, l) => n + spoken(l.text).length, 0);

async function speak(text: string, voice: string, speed: number, emotion?: string): Promise<Uint8Array> {
  const key = (process.env.MINIMAX_API_KEY || '').trim();
  if (!key) throw new Error('MINIMAX_API_KEY missing');
  const body = { model: TTS_MODEL, text: spoken(text), voice_setting: { voice_id: voice, speed, vol: 1, pitch: 0, ...(emotion ? { emotion } : {}) },
    audio_setting: { format: 'mp3', sample_rate: 24000, bitrate: 64000, channel: 1 } };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch('https://api.minimax.io/v1/t2a_v2', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    const raw = await r.text();
    if (!r.ok) { if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(1500 * attempt); continue; } throw new Error(`TTS HTTP ${r.status}: ${raw.slice(0, 200)}`); }
    const j = JSON.parse(raw) as { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } };
    const code = j.base_resp?.status_code ?? 0;
    if (code === 1008) throw new Error(`MiniMax balance: ${j.base_resp?.status_msg}`);
    if (code !== 0) { if (attempt < 3) { await sleep(1000 * attempt); continue; } throw new Error(`TTS ${code}: ${j.base_resp?.status_msg}`); }
    if (j.data?.audio) return new Uint8Array(Buffer.from(j.data.audio, 'hex'));
  }
  throw new Error('TTS answered with no audio');
}

/** Make one part's recording and upload it. Lines are read four at a time. */
export async function voicePart(s: ListeningSet, level: ListeningLevel): Promise<{ key: string; seconds: number; chars: number }> {
  const v = LEVEL_VOICE[level];
  const talk = s.script.some(l => l.who === 'b');
  const voiceOf = (who: string) => (who === 'narrator' ? NARRATOR : VOICES[s.voices?.[who as 'a' | 'b'] as SpeakerVoice] ?? NARRATOR);
  const lines = [{ text: s.intro, voice: NARRATOR, emotion: 'calm', pause: 2 },
    ...s.script.map(l => ({ text: l.text, voice: voiceOf(l.who), emotion: voiceOf(l.who) === NARRATOR ? 'calm' : undefined, pause: talk ? v.gapTalk : v.gapSpeech }))];
  const clips: Uint8Array[] = new Array(lines.length);
  for (let i = 0; i < lines.length; i += 4) {
    await Promise.all(lines.slice(i, i + 4).map(async (l, k) => { clips[i + k] = await speak(l.text, l.voice, v.speed, l.emotion); }));
  }
  const { mp3, seconds } = joinMp3(lines.map((l, i) => ({ clip: clips[i], pauseAfter: l.pause })));
  const key = partAudioKey(s.id);
  const { error } = await getSupabaseAdmin().storage.from(LISTENING_BUCKET).upload(key, mp3, { contentType: 'audio/mpeg', upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
  return { key, seconds: Math.round(seconds), chars: voiceChars(s) };
}
