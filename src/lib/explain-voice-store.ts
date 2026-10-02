// The one-minute explanation's VOICE — the server half (1 Oct 2026).
//
// `ensureVoice(runId, q, script)`: for every beat of the explanation's script,
// the clip is looked up in the student-files bucket (ONE folder listing per
// question, never a head per beat), the missing ones are synthesised with the
// same Gemini TTS request scripts/lessons/generate-narration.mjs makes (model,
// voice Charon, the tutor `style` prefix — the topic lessons and the
// explanation are one voice), as MP3 straight from MiniMax (1 Oct 2026; the first day's
// clips were Gemini PCM wrapped as WAV — lib/explain-voice pcmToWav stays for that),
// ffmpeg on Vercel) and put under `runs/<runId>/explain/<q>/…` — a student's
// own data, served only through /api/files to Adrian or the owning student
// once the run is released. Four beats in flight; a beat that fails stays
// silent (the player paces it by its Auto timer) — this never throws.
//
// `prewarmExplainVoice(runId)`: at release, the clips for every lost-marks
// question of the run (≤ 6) are made ahead of the first tap, fire-and-forget.

import { buildExplainScript, canExplain } from './explain-clip';
import { VOICE_CONTENT_TYPE, beatSays, voiceFolder, voiceKey } from './explain-voice';
import type { LessonScript } from './lesson-script';
import { buildStudentMarking, type MarkingRunRow } from './portal-marking';
import { fileUrl, listStudentFiles, putStudentFile } from './student-files';
import { getSupabaseAdmin } from './supabase';

/** MiniMax Speech-02 (Adrian, 1 Oct 2026, after fifteen samples: "english friendlyperson" —
 *  the Gemini voices sounded too Western / too deep). The same voice for the lessons:
 *  scripts/lessons/generate-narration.mjs --provider minimax — change them together. */
export const TTS_PROVIDER = 'minimax';
export const TTS_MODEL = 'speech-02-hd';
export const TTS_VOICE = 'English_FriendlyPerson';
/** calm, a touch of warmth — a student is reading their own mistake. */
export const TTS_EMOTION = 'calm';
export const TTS_SPEED = 1;

const CONCURRENCY = 4;
/** Questions pre-warmed per release — the paper's first lost-marks questions, not every one. */
export const PREWARM_MAX_QUESTIONS = 6;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One beat's sentence → MP3 bytes (MiniMax t2a_v2, hex-encoded audio). Throws on any failure; the caller makes that beat silent. */
async function synthesize(text: string, apiKey: string): Promise<Uint8Array> {
  const body = {
    model: TTS_MODEL,
    text,
    voice_setting: { voice_id: TTS_VOICE, speed: TTS_SPEED, vol: 1, pitch: 0, emotion: TTS_EMOTION },
    audio_setting: { format: 'mp3', sample_rate: 24000, bitrate: 64000, channel: 1 },
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    const raw = await r.text();
    if (!r.ok) {
      if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(1500 * attempt); continue; }
      throw new Error(`TTS HTTP ${r.status}: ${raw.slice(0, 200)}`);
    }
    const j = JSON.parse(raw) as { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } };
    const code = j.base_resp?.status_code ?? 0;
    if (code !== 0) {
      // 1008 = insufficient balance — stop at once, nothing to retry.
      if (code === 1008) throw new Error(`TTS daily quota: ${j.base_resp?.status_msg}`);
      if (attempt < 3) { await sleep(1000 * attempt); continue; }
      throw new Error(`TTS ${code}: ${j.base_resp?.status_msg}`);
    }
    if (j.data?.audio) return new Uint8Array(Buffer.from(j.data.audio, 'hex'));
    if (attempt < 3) await sleep(1000 * attempt);
  }
  throw new Error('TTS answered with no audio');
}

export interface EnsureVoiceResult {
  /** One canonical file URL per beat (flattened across scenes), null where the beat has no clip. */
  urls: (string | null)[];
  /** Beats synthesised on this call (0 when every clip was already there). */
  made: number;
  /** Beats that failed this call, with the reason — logged, never thrown. */
  failed: { beat: number; error: string }[];
}

/**
 * The clip URL for every beat of the explanation, making the missing ones.
 * Never throws: a bucket or TTS failure leaves beats null.
 */
export async function ensureVoice(runId: string, questionNumber: string, script: Pick<LessonScript, 'scenes'>): Promise<EnsureVoiceResult> {
  const says = beatSays(script.scenes);
  const keys = says.map((say, k) => voiceKey(runId, questionNumber, k, say));
  const urls: (string | null)[] = keys.map(() => null);
  const failed: EnsureVoiceResult['failed'] = [];
  if (!keys.length) return { urls, made: 0, failed };

  let have = new Set<string>();
  try {
    have = new Set((await listStudentFiles(voiceFolder(runId, questionNumber))).filter(f => f.size > 44).map(f => f.key));
  } catch (e) {
    console.warn('[explain-voice] list failed', runId, questionNumber, (e as Error).message);
  }
  keys.forEach((key, k) => { if (have.has(key)) urls[k] = fileUrl(key); });

  const todo = keys.map((key, k) => k).filter(k => urls[k] === null);
  if (!todo.length) return { urls, made: 0, failed };

  const apiKey = (process.env.MINIMAX_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[explain-voice] MINIMAX_API_KEY missing — the explanation stays silent');
    return { urls, made: 0, failed: todo.map(beat => ({ beat, error: 'MINIMAX_API_KEY missing' })) };
  }

  let made = 0;
  let quotaHit = false;
  const worker = async () => {
    for (;;) {
      const k = todo.shift();
      if (k === undefined) return;
      if (quotaHit) { failed.push({ beat: k, error: 'daily quota' }); continue; }
      try {
        const mp3 = await synthesize(says[k], apiKey);
        const { url } = await putStudentFile({ key: keys[k], body: mp3, contentType: VOICE_CONTENT_TYPE });
        urls[k] = url;
        made++;
      } catch (e) {
        const msg = (e as Error).message || String(e);
        if (/daily quota/i.test(msg)) quotaHit = true;
        failed.push({ beat: k, error: msg });
        console.warn('[explain-voice] beat failed', runId, questionNumber, k, msg);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return { urls, made, failed };
}

const RUN_COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, student_label, student_starred_at, student_archived_at, student_note, paper_subject, superseded_by, subject, student_id';

/**
 * At release: the clips for the run's first lost-marks questions with something
 * to replay (≤ PREWARM_MAX_QUESTIONS), one question after another so the TTS
 * quota is not hit in a burst. Regardless of the student-facing flag — the
 * clips are cheap and the door may open any day. Never throws.
 */
export async function prewarmExplainVoice(runId: string): Promise<{ questions: number; made: number; failed: number }> {
  const out = { questions: 0, made: 0, failed: 0 };
  try {
    const { data: row } = await getSupabaseAdmin().from('paper_marking_runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle();
    if (!row) return out;
    const { papers } = buildStudentMarking([row as unknown as MarkingRunRow]);
    const questions = (papers[0]?.questions ?? []).filter(q => q.awarded < q.max && canExplain(q));
    const seen = new Set<string>();
    for (const q of questions) {
      if (out.questions >= PREWARM_MAX_QUESTIONS) break;
      if (seen.has(q.questionNumber)) continue;
      const script = buildExplainScript(q, runId);
      if (!script) continue;
      seen.add(q.questionNumber);
      out.questions++;
      const r = await ensureVoice(runId, q.questionNumber, script);
      out.made += r.made;
      out.failed += r.failed.length;
    }
  } catch (e) {
    console.warn('[explain-voice] prewarm failed', runId, (e as Error).message);
  }
  return out;
}
