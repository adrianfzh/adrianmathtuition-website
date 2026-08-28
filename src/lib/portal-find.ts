// Pure logic for the practice tab's "find me a question" surfaces:
//
//   · the /app/practice?qid= deep-link loader (eligibility gate),
//   · POST /api/portal/similar  (photo / search → bank matches via the bot),
//   · POST /api/portal/generate (no match → write a fresh question via the bot).
//
// Everything here is IO-free so it can be unit-tested (testing policy in
// CLAUDE.md): the routes hand in parsed JSON / a counting client and act on
// the returned verdicts. The Supabase table behind the generation cap is
// `portal_generation_log` (one row per similar/generate call — kind
// 'photo'|'search', qb_hit, generated, question_id).
import { sgtStartOfDayIso } from './portal-submit-limit';
import { qbLevelsFor } from './qb-levels';

// ── Generation cap ───────────────────────────────────────────────────────────
// Generated questions run the bot's full 4-gate worker (1–3 min of model time,
// real money); bank questions are unlimited. 5/day/student is the cost brake.
export const DAILY_GENERATE_CAP = 5;

export const CAP_MESSAGE =
  `You’ve used today’s ${DAILY_GENERATE_CAP} generated questions — bank questions are unlimited. A fresh batch opens at midnight!`;

export const NOT_AVAILABLE_MESSAGE = 'This isn’t available right now — pick from the topic list instead.';

export const GENERATE_FAILED_MESSAGE =
  'That one didn’t pass our checks — try again, or pick a bank match instead.';

type CountResult = { count: number | null; error: unknown };

interface GenCountQuery extends PromiseLike<CountResult> {
  eq(column: string, value: string | boolean): GenCountQuery;
  gte(column: string, value: string): GenCountQuery;
}

export interface GenerationCountingClient {
  from(table: string): {
    select(columns: string, options: { count: 'exact'; head: true }): GenCountQuery;
  };
}

/**
 * Generated questions this student has spent today (SGT calendar day, same
 * boundary as the submit cap). Only rows where generation actually SUCCEEDED
 * count — a failed attempt or a bank hit never spends the allowance.
 */
export async function countGenerationsToday(
  client: GenerationCountingClient,
  studentId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await client
    .from('portal_generation_log')
    .select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', studentId)
    .eq('generated', true)
    .gte('created_at', sgtStartOfDayIso(now));
  return count ?? 0;
}

// ── Finder cap (/similar) ────────────────────────────────────────────────────
// Every /similar call runs the bot's vision extraction + embedding match —
// real model money per call, smaller than a generation but previously
// UNCAPPED (found in the 2026-08-28 Phase G leak/rate-limit audit: /generate
// had its 5/day, /similar had none). The brake counts EVERY finder-ledger row
// for the student today — similar hits, misses, and generation attempts all
// log one `portal_generation_log` row each — so it bounds total finder model
// spend per student per SGT day. Generous on purpose: a student photographing
// their whole homework stays well under it; a runaway client or scripted
// abuse does not.
export const DAILY_FIND_CAP = 25;

export const FIND_CAP_MESSAGE =
  'You’ve done a lot of question-finding today — the finder reopens at midnight. Bank questions in the topic list stay unlimited!';

/**
 * Finder-ledger rows this student has written today (SGT calendar day): every
 * /similar call (hit or miss) and every /generate attempt logs exactly one
 * row, so this is the student's total finder model spend today.
 */
export async function countFinderCallsToday(
  client: GenerationCountingClient,
  studentId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await client
    .from('portal_generation_log')
    .select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', studentId)
    .gte('created_at', sgtStartOfDayIso(now));
  return count ?? 0;
}

// ── ?qid= eligibility ────────────────────────────────────────────────────────
// Mirrors the gates the `practice_next` RPC applies when it serves a random
// question, so a deep-linked question is never one the normal flow would have
// refused: not deleted, not flag-buried, AI rows only when verified, has
// something to show, and has an answer to mark against. One deliberate widening
// (per the QB reality that ~71% of "missing" answers live in parts[].answer):
// the answer check also accepts per-part answers/solutions, not just top-level.
export type EligibilityRow = {
  deleted_at?: string | null;
  flagged_count?: number | null;
  ai_generated?: boolean | null;
  verified?: boolean | null;
  question_text?: string | null;
  has_image?: boolean | null;
  image_url?: string | null;
  parts?: unknown;
  answer?: string | null;
  solution?: string | null;
};

function nonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim() !== '';
}

function partsHaveAnswer(parts: unknown): boolean {
  if (!Array.isArray(parts)) return false;
  return parts.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const part = p as { answer?: unknown; solution?: unknown; subparts?: unknown };
    return nonEmpty(part.answer) || nonEmpty(part.solution) || partsHaveAnswer(part.subparts);
  });
}

export function practiceEligibility(q: EligibilityRow): { ok: true } | { ok: false; reason: string } {
  if (q.deleted_at) return { ok: false, reason: 'removed from the bank' };
  if ((q.flagged_count ?? 0) >= 3) return { ok: false, reason: 'flagged by students' };
  if (q.ai_generated === true && q.verified !== true) return { ok: false, reason: 'AI question not yet verified' };
  const hasContent =
    nonEmpty(q.question_text) ||
    q.has_image === true ||
    nonEmpty(q.image_url) ||
    (Array.isArray(q.parts) && q.parts.length > 0);
  if (!hasContent) return { ok: false, reason: 'no question text' };
  const hasAnswer = nonEmpty(q.answer) || nonEmpty(q.solution) || partsHaveAnswer(q.parts);
  if (!hasAnswer) return { ok: false, reason: 'no answer on file' };
  return { ok: true };
}

// ── Request validation ───────────────────────────────────────────────────────
// Base64 of a client-downscaled ≤1600px JPEG is typically well under 1MB; the
// ceiling exists so nothing can push a request toward Vercel's 4.5MB platform
// body cap (CLAUDE.md gotcha — the cap is at the PLATFORM level).
export const MAX_IMAGE_BASE64 = 3_500_000;
export const MAX_SEARCH_TEXT = 500;
export const MAX_SEED_TEXT = 4000;

export type SimilarRequest =
  | { mode: 'photo'; imageBase64: string; level: string | null }
  | { mode: 'search'; text: string; level: string | null };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

function strField(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function parseSimilarBody(body: unknown): Parsed<SimilarRequest> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request', status: 400 };
  }
  const b = body as { imageBase64?: unknown; text?: unknown; level?: unknown };
  const level = strField(b.level);
  const rawImage = strField(b.imageBase64);
  const rawText = strField(b.text);

  if (rawImage != null && rawText != null) {
    return { ok: false, error: 'Send a photo or a description, not both', status: 400 };
  }
  if (rawImage != null) {
    // Accept a full data URL or bare base64 — the bot gets bare base64.
    const imageBase64 = rawImage.replace(/^data:[^,]*,/, '');
    if (!imageBase64.trim()) return { ok: false, error: 'That photo came through empty — try again', status: 400 };
    if (imageBase64.length > MAX_IMAGE_BASE64) {
      return { ok: false, error: 'Photo too large — try again (it will be resized automatically)', status: 413 };
    }
    return { ok: true, value: { mode: 'photo', imageBase64, level } };
  }
  if (rawText != null) {
    const text = rawText.trim().slice(0, MAX_SEARCH_TEXT);
    if (!text) return { ok: false, error: 'Describe the question you want first', status: 400 };
    return { ok: true, value: { mode: 'search', text, level } };
  }
  return { ok: false, error: 'Send a photo or a description', status: 400 };
}

export type GenerateRequest = {
  seedText: string;
  topic: string | null;
  level: string | null;
  kind: 'photo' | 'search';
};

export function parseGenerateBody(body: unknown): Parsed<GenerateRequest> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request', status: 400 };
  }
  const b = body as { seedText?: unknown; topic?: unknown; level?: unknown; kind?: unknown };
  const seed = strField(b.seedText)?.trim();
  if (!seed) return { ok: false, error: 'seedText required', status: 400 };
  return {
    ok: true,
    value: {
      seedText: seed.slice(0, MAX_SEED_TEXT),
      topic: nonEmpty(b.topic) ? b.topic.trim() : null,
      level: strField(b.level),
      kind: b.kind === 'photo' ? 'photo' : 'search',
    },
  };
}

/**
 * The QB level the bot should match/generate against. The client sends the
 * level currently selected in the practice flow; it only survives if the
 * student's account actually unlocks it (same gate as /practice/next's
 * levelAllowed), otherwise the first level their account allows is used —
 * qbLevelsFor always returns at least one.
 */
export function resolveQbLevel(
  requested: string | null | undefined,
  accountLevel: string | null,
  subjects: string[] | null,
): string {
  const allowed = qbLevelsFor(accountLevel, subjects);
  if (requested && allowed.some((a) => a.key === requested)) return requested;
  return allowed[0].key;
}

// ── Bot response normalisation ───────────────────────────────────────────────
// The bot endpoints are being built to this contract in the bot repo; parse
// defensively so a shape drift degrades to "no matches" rather than a crash,
// and so nothing that isn't a real bank id can end up in a ?qid= URL.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isQuestionId(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export type SimilarMatch = {
  id: string;
  preview: string;
  topics: string[];
  totalMarks: number | null;
};

export const MAX_MATCHES = 5;

export function normalizeMatches(raw: unknown): SimilarMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: SimilarMatch[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { id?: unknown; preview?: unknown; topics?: unknown; total_marks?: unknown; totalMarks?: unknown };
    if (!isQuestionId(e.id) || !nonEmpty(e.preview)) continue;
    const marks = Number(e.total_marks ?? e.totalMarks);
    out.push({
      id: e.id,
      preview: e.preview,
      topics: Array.isArray(e.topics) ? e.topics.filter(nonEmpty).slice(0, 3) : [],
      totalMarks: Number.isFinite(marks) && marks > 0 ? marks : null,
    });
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

/** The generated question's bank id, wherever in the response the bot put it. */
export function extractQuestionId(botResponse: unknown): string | null {
  if (!botResponse || typeof botResponse !== 'object') return null;
  const r = botResponse as { questionId?: unknown; question_id?: unknown; id?: unknown; question?: unknown };
  for (const v of [r.questionId, r.question_id, r.id]) {
    if (isQuestionId(v)) return v;
  }
  const q = r.question;
  if (q && typeof q === 'object' && isQuestionId((q as { id?: unknown }).id)) {
    return (q as { id: string }).id;
  }
  return null;
}
