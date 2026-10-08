// English oral practice — the I/O half. Pure rules live in lib/english-oral.ts.
// SPEC-ENGLISH-ORAL-LISTENING.md (8 Oct 2026).
//
// One attempt = one row of english_oral_attempts. Each spoken answer is stored as a private
// student file (oral/<identity>/<attempt>/<n>.<ext>), turned into words, shown to the student to
// confirm, and then the WORDS are read on the plan queue (plan_reads, kind 'english-oral') —
// never on the paid Claude key. The reader never gets the recording.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSupabaseAdmin } from './supabase';
import { sgtDayStartISO } from './sgt';
import { putStudentFile, oralKey } from './student-files';
import { enqueuePlanRead, getPlanRead } from './plan-reads';
import { oralById } from './english-speaking-data';
import { AUDIO_MIME, ORAL_WORDS_MAX, buildOralPrompt, parseOralReply, promptsFor, type OralPart, type OralReport } from './english-oral';

export const ORAL_READ_KIND = 'english-oral';
const TABLE = 'english_oral_attempts';

export interface OralAnswer { q: number; key: string; seconds: number; heard: string; said: string | null }
export interface OralAttempt {
  id: string; identity: string; set_id: string; part: OralPart; answers: OralAnswer[];
  status: 'recording' | 'queued' | 'done' | 'failed'; job: string | null; report: OralReport | null; created_at: string; done_at: string | null;
}
const COLS = 'id, identity, set_id, part, answers, status, job, report, created_at, done_at';

export async function getAttempt(id: string, identity: string): Promise<OralAttempt | null> {
  const { data } = await getSupabaseAdmin().from(TABLE).select(COLS).eq('id', id).maybeSingle();
  const row = data as OralAttempt | null;
  // Adrian ('admin') may open any attempt; a student only their own.
  return row && (row.identity === identity || identity === 'admin') ? row : null;
}

export async function newAttempt(identity: string, setId: string, part: OralPart): Promise<OralAttempt | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).insert({ identity, set_id: setId, part }).select(COLS).single();
  if (error) { console.error('[english-oral] attempt insert failed:', error.message); return null; }
  return data as OralAttempt;
}

export async function latestAttempts(identity: string, limit = 12): Promise<OralAttempt[]> {
  const { data } = await getSupabaseAdmin().from(TABLE).select(COLS).eq('identity', identity).in('status', ['queued', 'done']).order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as OralAttempt[];
}

/** Reports asked for today — the cap's count. */
export async function oralReportsToday(identity: string): Promise<number> {
  const { count } = await getSupabaseAdmin().from(TABLE).select('id', { count: 'exact', head: true })
    .eq('identity', identity).in('status', ['queued', 'done']).gte('created_at', sgtDayStartISO());
  return count ?? 0;
}

/**
 * Speech into words — Gemini on the Google key the site already has (the same call the
 * end-of-lesson voice note makes, /api/admin/voice-log). The words are written exactly as
 * spoken: a slip the transcriber tidied away could never be taught. Null = could not.
 */
export async function transcribeSpeech(audio: Buffer, ext: string): Promise<string | null> {
  const key = (process.env.GOOGLE_API_KEY || '').trim();
  if (!key) { console.error('[english-oral] GOOGLE_API_KEY missing'); return null; }
  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: AUDIO_MIME[ext] ?? 'audio/webm', data: audio.toString('base64') } },
        { text: 'Write down exactly what the speaker says. The speaker is a secondary school student in Singapore answering an English oral examination question. ' +
          'Keep every word as spoken, including grammar mistakes, repeated words and unfinished sentences. Do NOT correct or improve anything. ' +
          'Leave out only sounds like "um" and "er". Use ordinary punctuation. Output ONLY the words spoken. ' +
          'If the recording is silent, is only noise, or has no clear speech, output exactly: [nothing] — never guess and never make up words.' },
      ] }],
      generationConfig: { temperature: 0 },
    });
    const text = result.response.text().trim();
    return /^\[?nothing\]?\.?$/i.test(text) ? '' : text.slice(0, ORAL_WORDS_MAX);
  } catch (e) {
    console.error('[english-oral] transcription failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Store one spoken answer and what was heard in it. Re-recording a prompt replaces its answer. */
export async function saveAnswer(attempt: OralAttempt, q: number, audio: Buffer, ext: string, seconds: number, heard: string): Promise<OralAttempt | null> {
  const key = oralKey(attempt.identity, attempt.id, q + 1, ext);
  try { await putStudentFile({ key, body: audio, contentType: AUDIO_MIME[ext] }); }
  catch (e) { console.error('[english-oral] recording not stored:', e instanceof Error ? e.message : e); return null; }
  const answers = [...attempt.answers.filter(a => a.q !== q), { q, key, seconds, heard, said: null }].sort((a, b) => a.q - b.q);
  const { data, error } = await getSupabaseAdmin().from(TABLE).update({ answers }).eq('id', attempt.id).eq('status', 'recording').select(COLS).maybeSingle();
  if (error || !data) { console.error('[english-oral] answer save failed:', error?.message ?? 'not recording'); return null; }
  return data as OralAttempt;
}

/** The student has confirmed the words: queue them for the plan reader. */
export async function queueReport(attempt: OralAttempt, said: string[]): Promise<boolean> {
  const set = oralById(attempt.set_id);
  if (!set) return false;
  const job = await enqueuePlanRead({ kind: ORAL_READ_KIND, identity: attempt.identity, ref: attempt.id, model: 'opus', prompt: buildOralPrompt(set, attempt.part, said) });
  if (!job) return false;
  const answers = attempt.answers.map(a => ({ ...a, said: said[a.q] ?? a.heard }));
  const { error } = await getSupabaseAdmin().from(TABLE).update({ answers, status: 'queued', job }).eq('id', attempt.id);
  if (error) { console.error('[english-oral] queue update failed:', error.message); return false; }
  return true;
}

export const saidOf = (attempt: Pick<OralAttempt, 'answers' | 'set_id' | 'part'>): string[] => {
  const set = oralById(attempt.set_id);
  const n = set ? promptsFor(set, attempt.part).length : attempt.answers.length;
  return Array.from({ length: n }, (_, q) => { const a = attempt.answers.find(x => x.q === q); return a ? (a.said ?? a.heard) : ''; });
};

/** A queued attempt whose reading is back becomes done (or failed) here; anything else is returned as it is. */
export async function settle(attempt: OralAttempt): Promise<OralAttempt> {
  if (attempt.status !== 'queued' || !attempt.job) return attempt;
  const read = await getPlanRead(attempt.job);
  if (!read || read.status === 'queued' || read.status === 'claimed') return attempt;
  const report = read.status === 'replied' && read.reply ? parseOralReply(read.reply, attempt.part, saidOf(attempt)) : null;
  const patch = { status: report ? 'done' : 'failed', report, done_at: new Date().toISOString() } as const;
  await getSupabaseAdmin().from(TABLE).update(patch).eq('id', attempt.id).eq('status', 'queued');
  return { ...attempt, ...patch };
}
