// The one-minute explanation's VOICE — the server half (1 Oct 2026).
//
// `ensureVoice(runId, q, script)`: for every beat of the explanation's script,
// the clip is looked up in the student-files bucket (ONE folder listing per
// question, never a head per beat), the missing ones are synthesised with the
// same Gemini TTS request scripts/lessons/generate-narration.mjs makes (model,
// voice Charon, the tutor `style` prefix — the topic lessons and the
// explanation are one voice), wrapped as WAV (lib/explain-voice pcmToWav; no
// ffmpeg on Vercel) and put under `runs/<runId>/explain/<q>/…` — a student's
// own data, served only through /api/files to Adrian or the owning student
// once the run is released. Four beats in flight; a beat that fails stays
// silent (the player paces it by its Auto timer) — this never throws.
//
// `prewarmExplainVoice(runId)`: at release, the clips for every lost-marks
// question of the run (≤ 6) are made ahead of the first tap, fire-and-forget.

import { buildExplainScript, canExplain } from './explain-clip';
import { VOICE_CONTENT_TYPE, beatSays, pcmToWav, voiceFolder, voiceKey } from './explain-voice';
import type { LessonScript } from './lesson-script';
import { buildStudentMarking, type MarkingRunRow } from './portal-marking';
import { fileUrl, listStudentFiles, putStudentFile } from './student-files';
import { getSupabaseAdmin } from './supabase';

/** The same three as scripts/lessons/generate-narration.mjs DEFAULTS — change them together. */
export const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
export const TTS_VOICE = 'Charon';
export const TTS_STYLE = 'Read this as a warm, calm maths tutor talking to one student — clear and friendly, at a natural conversational pace: ';

const CONCURRENCY = 4;
/** Questions pre-warmed per release — the paper's first lost-marks questions, not every one. */
export const PREWARM_MAX_QUESTIONS = 6;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One beat's sentence → 16-bit mono PCM + its rate. Throws on any failure; the caller makes that beat silent. */
async function synthesize(text: string, apiKey: string): Promise<{ pcm: Uint8Array; rate: number }> {
  const body = {
    contents: [{ parts: [{ text: TTS_STYLE + text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
    },
  };
  let part: { inlineData?: { mimeType?: string; data?: string } } | undefined;
  // Three tries: 429 / 5xx back off; the preview model's occasional 200 with no
  // audio (finishReason "OTHER") is re-asked the same way. A daily-quota 429
  // stops at once — there is no point hammering it.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    const raw = await r.text();
    if (!r.ok) {
      if (r.status === 429 && /per day|daily|PerDay/i.test(raw)) throw new Error(`TTS daily quota: ${raw.slice(0, 160)}`);
      if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(1500 * attempt); continue; }
      throw new Error(`TTS HTTP ${r.status}: ${raw.slice(0, 200)}`);
    }
    const j = JSON.parse(raw) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
    part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part) break;
    if (attempt < 3) await sleep(1000 * attempt);
  }
  if (!part?.inlineData?.data) throw new Error('TTS answered with no audio');
  const mime = String(part.inlineData.mimeType || '');
  // 2.5 answers "audio/L16;codec=pcm;rate=24000"; 3.1 "audio/l16; rate=24000; channels=1".
  if (!/audio\/l16/i.test(mime)) throw new Error(`unexpected TTS mime "${mime}"`);
  const channels = Number(/channels=(\d+)/i.exec(mime)?.[1] || 1);
  if (channels !== 1) throw new Error(`expected mono PCM, got channels=${channels}`);
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] || 24000);
  return { pcm: new Uint8Array(Buffer.from(part.inlineData.data, 'base64')), rate };
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

  const apiKey = (process.env.GOOGLE_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[explain-voice] GOOGLE_API_KEY missing — the explanation stays silent');
    return { urls, made: 0, failed: todo.map(beat => ({ beat, error: 'GOOGLE_API_KEY missing' })) };
  }

  let made = 0;
  let quotaHit = false;
  const worker = async () => {
    for (;;) {
      const k = todo.shift();
      if (k === undefined) return;
      if (quotaHit) { failed.push({ beat: k, error: 'daily quota' }); continue; }
      try {
        const { pcm, rate } = await synthesize(says[k], apiKey);
        const wav = pcmToWav(pcm, rate);
        const { url } = await putStudentFile({ key: keys[k], body: wav, contentType: VOICE_CONTENT_TYPE });
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
