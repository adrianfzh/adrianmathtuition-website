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
import Anthropic from '@anthropic-ai/sdk';
import { anthropicText, SONNET_55 } from './claude-models';
import { speak } from './english-listening-voice';
import { askedPrompts, buildFollowUpPrompt, isPartnerAttempt, parseFollowUp, standInFollowUp, turnCount } from './english-oral-partner';
import { alertText, concernPrompt, readConcern, screen, type WellbeingKind } from './wellbeing';
import { sendTelegram } from './telegram';

export const ORAL_READ_KIND = 'english-oral';
const TABLE = 'english_oral_attempts';

export interface OralAnswer { q: number; key: string; seconds: number; heard: string; said: string | null; followUp?: string | null }
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
  const job = await enqueuePlanRead({ kind: ORAL_READ_KIND, identity: attempt.identity, ref: attempt.id, model: 'opus', prompt: buildOralPrompt(set, attempt.part, said, isPartnerAttempt(attempt) ? askedPrompts(set, attempt.answers) : undefined) });
  if (!job) return false;
  const answers = attempt.answers.map(a => ({ ...a, said: said[a.q] ?? a.heard }));
  const { error } = await getSupabaseAdmin().from(TABLE).update({ answers, status: 'queued', job }).eq('id', attempt.id);
  if (error) { console.error('[english-oral] queue update failed:', error.message); return false; }
  return true;
}

/** How many answers this attempt takes: 1 (Part 1), 6 (Part 2 with the partner), 3 (Part 2 before 5 Nov 2026). */
export const turnsOf = (attempt: Pick<OralAttempt, 'answers' | 'set_id' | 'part' | 'status'>): number => {
  const set = oralById(attempt.set_id);
  if (!set) return attempt.answers.length;
  return isPartnerAttempt(attempt) ? turnCount(set) : promptsFor(set, attempt.part).length;
};
/** What was asked at each turn (the partner's follow-ups included). */
export const askedOf = (attempt: Pick<OralAttempt, 'answers' | 'set_id' | 'part' | 'status'>): string[] => {
  const set = oralById(attempt.set_id);
  if (!set) return [];
  return isPartnerAttempt(attempt) ? askedPrompts(set, attempt.answers) : promptsFor(set, attempt.part);
};

export const saidOf = (attempt: Pick<OralAttempt, 'answers' | 'set_id' | 'part' | 'status'>): string[] => {
  const n = turnsOf(attempt);
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

// ── The speaking partner (Part 2, 5 Nov 2026 — SPEC §Speaking partner) ─────────────────────────
/** The same voice as the recorded prompts (scripts/english-own/speaking-audio.mjs). */
const PARTNER_VOICE = 'English_FriendlyPerson';
const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
/** Real time between turns, so the paid key (Adrian approved the cost, 5 Nov 2026: about S$0.13 a practice). */
export const ORAL_PARTNER_MODEL = process.env.ORAL_PARTNER_MODEL || SONNET_55;

/**
 * The question that reacts to the answer just given, and whether the answer sounded like a
 * student at risk. A failed or unusable reply → a stand-in question (the practice never stops on
 * it) and risk unknown (null).
 */
export async function writeFollowUp(attempt: OralAttempt, q: number, heard: string): Promise<{ say: string; risk: boolean | null; standIn: boolean }> {
  const set = oralById(attempt.set_id);
  if (!set) return { say: standInFollowUp(q), risk: null, standIn: true };
  const asked = askedPrompts(set, attempt.answers);
  const talk = Array.from({ length: q + 1 }, (_, i) => ({ asked: asked[i] ?? '', said: i === q ? heard : (attempt.answers.find(a => a.q === i)?.heard ?? '') }));
  try {
    const msg = await anthropic().messages.create({ model: ORAL_PARTNER_MODEL, max_tokens: 2000, messages: [{ role: 'user', content: buildFollowUpPrompt(set, talk) }] }, { timeout: 25_000 });
    const r = parseFollowUp(anthropicText(msg));
    return r.say ? { say: r.say, risk: r.risk, standIn: false } : { say: standInFollowUp(q), risk: r.risk, standIn: true };
  } catch (e) {
    console.error('[english-oral] follow-up failed:', e instanceof Error ? e.message : e);
    return { say: standInFollowUp(q), risk: null, standIn: true };
  }
}

/** The partner's words read aloud → a data: URL the page plays. Null = the page shows the words only. */
export async function partnerVoice(text: string): Promise<string | null> {
  try { return `data:audio/mpeg;base64,${Buffer.from(await speak(text, PARTNER_VOICE, 1, 'calm')).toString('base64')}`; }
  catch (e) { console.error('[english-oral] partner voice failed:', e instanceof Error ? e.message : e); return null; }
}

/** Keep the follow-up on the answer it reacts to, so the next turn and the report know what was asked. */
export async function saveFollowUp(attempt: OralAttempt, q: number, followUp: string): Promise<OralAttempt | null> {
  const answers = attempt.answers.map(a => (a.q === q ? { ...a, followUp } : a));
  const { data, error } = await getSupabaseAdmin().from(TABLE).update({ answers }).eq('id', attempt.id).eq('status', 'recording').select(COLS).maybeSingle();
  if (error || !data) { console.error('[english-oral] follow-up save failed:', error?.message ?? 'not recording'); return null; }
  return data as OralAttempt;
}

/**
 * The wellbeing check on one spoken answer (lib/wellbeing.ts, the bot's rules). `modelRisk` is
 * the follow-up writer's own judgement when there was one; otherwise a `check` hit asks one small
 * question. Serious → Adrian is told (students topic) and the page shows the help lines.
 */
export async function wellbeingCheck(attempt: OralAttempt, heard: string, modelRisk: boolean | null | undefined): Promise<WellbeingKind | null> {
  const hit = screen(heard);
  if (hit.level === 'none') return null;
  let source: 'keyword' | 'model' | 'fallback' = 'keyword';
  if (hit.level === 'check') {
    let risk = modelRisk ?? null;
    if (risk === null) {
      try {
        const msg = await anthropic().messages.create({ model: ORAL_PARTNER_MODEL, max_tokens: 1000, messages: [{ role: 'user', content: concernPrompt(heard) }] }, { timeout: 20_000 });
        risk = readConcern(anthropicText(msg));
      } catch (e) { console.error('[english-oral] wellbeing check failed:', e instanceof Error ? e.message : e); }
    }
    if (risk === false) return null;
    if (risk === null && hit.fallback !== 'serious') return null;
    source = risk === null ? 'fallback' : 'model';
  }
  const who = attempt.identity === 'admin' ? 'Test (your own login)' : attempt.identity;
  await sendTelegram(alertText({ kind: hit.kind, who, where: `English oral practice (${attempt.part === 'planned' ? 'Part 1' : 'Part 2'}, ${attempt.set_id})`, words: heard, source }), 'students', { plain: true }).catch(() => false);
  return hit.kind;
}
