// Pure logic for "Find a question" (/app/find — SPEC-PORTAL-V2 §4) and the
// ?qid= deep links it grew out of:
//
//   · the /app/practice?qid= deep-link loader (eligibility gate),
//   · POST /api/portal/find     (photo / typed question → bot matches → the
//                                tier rule below → a Practice row, or "generate"),
//   · POST /api/portal/similar  (the older list-of-matches door; same bot call),
//   · POST /api/portal/generate (nothing similar → write a fresh question via the bot).
//
// Everything here is IO-free so it can be unit-tested (testing policy in
// CLAUDE.md): the routes hand in parsed JSON / a counting client and act on
// the returned verdicts. The Supabase table behind the generation cap is
// `portal_generation_log` (one row per similar/generate call — kind
// 'photo'|'search', qb_hit, generated, question_id).
import { sgtStartOfDayIso } from './portal-submit-limit';
import { qbLevelsFor } from './qb-levels';
import { allowedSubjects, type PaperSubject } from './portal-subjects';

// ── Generation cap ───────────────────────────────────────────────────────────
// Generated questions run the bot's full 4-gate worker (1–3 min of model time,
// real money); bank questions are unlimited. 10/day/student is the cost brake
// (Adrian, SPEC-PORTAL-V2 §4, 6 Sep 2026 — was 5 while the tool lived on the
// practice tab; Find a question generates whenever the bank has nothing
// GENUINELY similar, so it needed the headroom).
export const DAILY_GENERATE_CAP = 10;

export const CAP_MESSAGE =
  `You’ve used today’s ${DAILY_GENERATE_CAP} made-for-you questions — a fresh batch opens at midnight. Questions we find in the bank don’t count!`;

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
  /** The /api/portal/find ledger row this generation follows (nothing similar was found) — links the two rows for the nightly review. */
  findLogId: string | null;
};

export function parseGenerateBody(body: unknown): Parsed<GenerateRequest> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request', status: 400 };
  }
  const b = body as { seedText?: unknown; topic?: unknown; level?: unknown; kind?: unknown; findLogId?: unknown };
  const seed = strField(b.seedText)?.trim();
  if (!seed) return { ok: false, error: 'seedText required', status: 400 };
  return {
    ok: true,
    value: {
      seedText: seed.slice(0, MAX_SEED_TEXT),
      topic: nonEmpty(b.topic) ? b.topic.trim() : null,
      level: strField(b.level),
      kind: b.kind === 'photo' ? 'photo' : 'search',
      findLogId: isQuestionId(b.findLogId) ? b.findLogId : null,
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

// ── Find a question: the tier rule (SPEC-PORTAL-V2 §4, Adrian 6 Sep 2026) ────
// "A returned match must be a genuinely SIMILAR question — same topic AND the
// same sub-skill / question type, testing the same concept, marks within one.
// Same chapter is NOT enough and is never offered. When nothing similar
// exists, generate." Two tiers reach a student: 'similar' (a bank question)
// and 'made-for-you' (generated). There is no third.
//
// The bot's /api/portal-similar answers with bank ids in embedding-similarity
// order and says nothing about sub-skills, so the route enriches every match
// from the bank's own filing (question_subgroups → subgroups — the sub-skill
// taxonomy the practice picker is built on) and this pure block judges. The
// student's own question has no bank row, so its sub-skill is INFERRED from
// the pool: the sub-group the most candidates are filed under is the
// reference, and it must be corroborated by at least TWO candidates. One bank
// question near the photo proves only that the embedding found something; two
// filed under the same sub-skill say what the question is about. Measured on
// 6 Sep 2026 over 40 AM/EM bank questions: the single nearest neighbour shares
// the source's primary sub-group only ~45% of the time (80% share any filing,
// 75% the topic), so trusting rank 1 alone would label plenty of "same
// chapter" questions similar — exactly what Adrian ruled out.
//
// Marks: the reference is the marks printed on the student's question when
// the photo/typing carries them ("[4]", "(4 marks)"), else the top-ranked
// member of the reference sub-skill; a candidate must sit within
// MARKS_TOLERANCE of it. The nightly find-review (scripts/find-review) grades
// what this rule let through, so it is tightened from evidence, not by feel.
export type FindTier = 'similar' | 'made-for-you';
export const FIND_TIERS: readonly FindTier[] = ['similar', 'made-for-you'];
/** The label on the student's card. */
export const FIND_TIER_LABEL: Record<FindTier, string> = {
  similar: 'Similar question',
  'made-for-you': 'Made for you',
};
export function isFindTier(v: unknown): v is FindTier {
  return v === 'similar' || v === 'made-for-you';
}

/** One sub-skill filing of a bank question (question_subgroups → subgroups). */
export type FindFiling = { id: number; topic: string; name: string; primary: boolean };

export type FindCandidate = {
  id: string;
  preview: string;
  /** questions.level as stored (AM, S3_AM, EM_NA, JC1, …). */
  level: string | null;
  /** questions.topics — the canonical topic tags. */
  topics: string[];
  marks: number | null;
  filings: FindFiling[];
};

export type FindReference = {
  subgroupId: number | null;
  subgroupName: string | null;
  topic: string | null;
  marks: number | null;
  /** Where the marks reference came from: the student's own question, or the reference sub-skill's top match. */
  marksFrom: 'student' | 'anchor' | null;
};

export type FindVerdict = { id: string; rank: number; tier: 'similar' | null; reason: string };

export type FindClassification = {
  /** Candidates judged similar, best (bot rank) first — the route assigns the first. */
  similar: FindCandidate[];
  /** Every candidate's verdict + one-line reason — stored on the ledger for the nightly review. */
  verdicts: FindVerdict[];
  reference: FindReference;
};

export const MARKS_TOLERANCE = 1;

/** A bank level family → the subject the subject gate speaks (lib/portal-subjects). Sec 1–2 maths sits in the O-Level family. */
export function bankLevelSubject(level: string | null | undefined): PaperSubject | null {
  const s = String(level ?? '').toUpperCase().trim();
  if (!s) return null;
  if (s === 'AM' || /^AM_/.test(s) || /_AM(_|$)/.test(s)) return 'A Math';
  if (s === 'EM' || /^EM_/.test(s) || /_EM(_|$)/.test(s)) return 'E Math';
  if (/^JC/.test(s)) return 'H2 Math';
  if (/^S[12](_|$)/.test(s)) return 'E Math';
  return null;
}

/**
 * The marks printed on the student's question: "[4]" (several "[n]" summed —
 * a multi-part question), else "(4 marks)" / "4 marks". Null when nothing is
 * printed or the total is implausible for ONE question (a photographed page
 * of several questions sums past 20).
 */
export function parseMarksFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const bracket = [...text.matchAll(/\[\s*(\d{1,2})\s*\]/g)].map((m) => Number(m[1]));
  let total: number | null = null;
  if (bracket.length) total = bracket.reduce((a, b) => a + b, 0);
  else {
    const words = [...text.matchAll(/\b(\d{1,2})\s*marks?\b/gi)].map((m) => Number(m[1]));
    if (words.length) total = words.reduce((a, b) => a + b, 0);
  }
  if (total == null || total <= 0 || total > 20) return null;
  return total;
}

/**
 * The filing that says what a question is ABOUT. A multi-part question can
 * carry two `is_primary` filings (seen live 6 Sep 2026: a Circles question
 * primary under both "Standard and general form" and Coordinate Geometry's
 * "equation of line"), so among the primaries prefer the one whose topic is
 * the row's own first tag; then any primary; then any filing.
 */
export function primaryFiling(c: Pick<FindCandidate, 'filings'> & { topics?: string[] }): FindFiling | null {
  const primaries = c.filings.filter((f) => f.primary);
  for (const t of c.topics ?? []) {
    const hit = primaries.find((f) => f.topic === t);
    if (hit) return hit;
  }
  return primaries[0] ?? c.filings[0] ?? null;
}

/** The headline topic of a candidate: its primary filing's topic, else its first bank tag. */
export function candidateTopic(c: Pick<FindCandidate, 'filings' | 'topics'>): string | null {
  return primaryFiling(c)?.topic ?? c.topics[0] ?? null;
}

/**
 * The subject gate (SPEC-PORTAL-V2 §2): a student only ever receives questions
 * of their own subjects. Applied to the pool BEFORE the tier rule, so a
 * dropped A-Math neighbour can neither be returned nor vote on the sub-skill.
 */
export function subjectGateCandidates<T extends { id: string; level: string | null }>(
  candidates: T[],
  allowed: readonly PaperSubject[],
): { kept: T[]; dropped: { id: string; reason: string }[] } {
  const kept: T[] = [];
  const dropped: { id: string; reason: string }[] = [];
  for (const c of candidates) {
    const subject = bankLevelSubject(c.level);
    if (subject && (allowed as readonly string[]).includes(subject)) kept.push(c);
    else dropped.push({ id: c.id, reason: subject ? `${subject} is not one of this student's subjects` : `unknown bank level ${c.level ?? '?'}` });
  }
  return { kept, dropped };
}

/**
 * THE tier rule. Returns the similar candidates (bot order), a verdict per
 * candidate, and the inferred reference. Never returns a "same chapter" tier.
 */
export function classifyFindCandidates(
  candidates: FindCandidate[],
  opts: { studentMarks?: number | null } = {},
): FindClassification {
  const none: FindReference = { subgroupId: null, subgroupName: null, topic: null, marks: null, marksFrom: null };
  if (!candidates.length) return { similar: [], verdicts: [], reference: none };

  // Tally every filing across the pool. The reference sub-skill is the one the
  // most candidates share; ties go to the sub-group seen earliest in bot
  // order, then to the one that is a PRIMARY filing there.
  type Tally = { id: number; topic: string; name: string; members: number[]; first: number; primaryFirst: boolean };
  const tally = new Map<number, Tally>();
  candidates.forEach((c, i) => {
    const seen = new Set<number>();
    for (const f of c.filings) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const t = tally.get(f.id);
      if (t) t.members.push(i);
      else tally.set(f.id, { id: f.id, topic: f.topic, name: f.name, members: [i], first: i, primaryFirst: f.primary });
    }
  });
  const ranked = [...tally.values()].sort(
    (a, b) => b.members.length - a.members.length || a.first - b.first || Number(b.primaryFirst) - Number(a.primaryFirst),
  );
  const win = ranked[0];

  const unfiled = 'not filed under any sub-skill yet';
  if (!win || win.members.length < 2) {
    const lone = 'no second bank match shares its sub-skill — one neighbour is not corroboration';
    return {
      similar: [],
      verdicts: candidates.map((c, i) => ({ id: c.id, rank: i, tier: null, reason: c.filings.length ? lone : unfiled })),
      reference: win ? { subgroupId: win.id, subgroupName: win.name, topic: win.topic, marks: null, marksFrom: null } : none,
    };
  }

  const anchor = candidates[win.members[0]];
  const studentMarks = opts.studentMarks ?? null;
  const refMarks = studentMarks ?? anchor.marks ?? null;
  const reference: FindReference = {
    subgroupId: win.id,
    subgroupName: win.name,
    topic: win.topic,
    marks: refMarks,
    marksFrom: studentMarks != null ? 'student' : refMarks != null ? 'anchor' : null,
  };

  const similar: FindCandidate[] = [];
  const others = win.members.length - 1;
  const verdicts: FindVerdict[] = candidates.map((c, i) => {
    const filing = c.filings.find((f) => f.id === win.id);
    if (!filing) {
      return {
        id: c.id, rank: i, tier: null,
        reason: c.filings.length ? `different sub-skill (${primaryFiling(c)?.name ?? '?'})` : unfiled,
      };
    }
    // Same canonical topic: the shared sub-skill must be what the question is
    // ABOUT — its primary filing there, or that topic among its own tags. A
    // question filed under it only in passing is another topic's question.
    if (!filing.primary && !c.topics.includes(win.topic)) {
      return { id: c.id, rank: i, tier: null, reason: `touches the sub-skill only in passing — the question is about ${candidateTopic(c) ?? 'another topic'}` };
    }
    if (refMarks != null) {
      if (c.marks == null) return { id: c.id, rank: i, tier: null, reason: 'marks unknown on the bank row' };
      if (Math.abs(c.marks - refMarks) > MARKS_TOLERANCE) {
        return { id: c.id, rank: i, tier: null, reason: `${c.marks} marks vs ${refMarks} — more than one apart` };
      }
    }
    similar.push(c);
    return { id: c.id, rank: i, tier: 'similar', reason: `shares “${win.name}” (${win.topic}) with ${others} other match${others === 1 ? '' : 'es'}` };
  });
  return { similar, verdicts, reference };
}

// ── Find a question: which bank to search ───────────────────────────────────
// The bot accepts one level family per call (AM | EM | JC | S1 | S2, its
// canonicalLevel collapses S3_AM/JC2/… onto these). A student with both
// O-Level subjects picks E Math or A Math on the page; JC has one option; Sec
// 1–2 have theirs. Options come from the account's QB levels (lib/qb-levels)
// collapsed to families, then pass the subject gate — so nothing outside
// allowedSubjects(account) is ever searched.
export type FindLevelKey = 'S1' | 'S2' | 'EM' | 'AM' | 'JC';
export type FindLevelOption = { key: FindLevelKey; label: string };

const FIND_LEVEL_LABEL: Record<FindLevelKey, string> = {
  S1: 'Sec 1', S2: 'Sec 2', EM: 'E Math', AM: 'A Math', JC: 'H2 Math',
};

function findKeyOf(qbKey: string): FindLevelKey | null {
  if (qbKey === 'S1' || qbKey === 'S2') return qbKey;
  if (qbKey === 'EM' || qbKey === 'S3_EM' || qbKey === 'EM_NA') return 'EM';
  if (qbKey === 'AM' || qbKey === 'S3_AM') return 'AM';
  if (qbKey === 'JC1' || qbKey === 'JC2') return 'JC';
  return null;
}

export function findLevelOptions(
  account: { level: string | null; subjects: string[] | null } | null | undefined,
): FindLevelOption[] {
  const allowed = allowedSubjects(account ? { level: account.level, subjects: account.subjects } : null) as readonly string[];
  const collapsed: FindLevelOption[] = [];
  for (const l of qbLevelsFor(account?.level ?? null, account?.subjects ?? null)) {
    const key = findKeyOf(l.key);
    if (!key || collapsed.some((o) => o.key === key)) continue;
    collapsed.push({ key, label: FIND_LEVEL_LABEL[key] });
  }
  const gated = collapsed.filter((o) => {
    const subject = bankLevelSubject(o.key);
    return subject != null && allowed.includes(subject);
  });
  // qbLevelsFor is never empty and already honours the subjects, so the gate
  // only ever narrows; if the two ever disagree, the wider list is still the
  // student's own levels — better than an empty page.
  return gated.length ? gated : collapsed;
}

/** The level the route searches: the student's pick when it is one of their options, else their first. */
export function resolveFindLevel(
  requested: string | null | undefined,
  account: { level: string | null; subjects: string[] | null } | null | undefined,
): FindLevelKey {
  const options = findLevelOptions(account);
  return options.find((o) => o.key === requested)?.key ?? options[0].key;
}

// ── Bank-row preview ────────────────────────────────────────────────────────
/**
 * Student-facing preview of a bank row: stem + parts/subparts TEXT only, never
 * an answer or solution — the bot's `questionPreview`, mirrored for the rows
 * the site reads itself (a generated question, the review's question text).
 */
export function previewOf(row: { question_text?: string | null; parts?: unknown }, maxLen = 200): string {
  const bits: string[] = [];
  const stem = typeof row.question_text === 'string' ? row.question_text.trim() : '';
  if (stem) bits.push(stem);
  if (Array.isArray(row.parts)) {
    for (const p of row.parts) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
      const part = p as { label?: unknown; text?: unknown; subparts?: unknown };
      const t = typeof part.text === 'string' ? part.text.trim() : '';
      if (t) bits.push(part.label ? `(${String(part.label)}) ${t}` : t);
      if (Array.isArray(part.subparts)) {
        for (const sp of part.subparts) {
          if (!sp || typeof sp !== 'object') continue;
          const sub = sp as { label?: unknown; text?: unknown };
          const st = typeof sub.text === 'string' ? sub.text.trim() : '';
          if (st) bits.push(sub.label ? `(${String(sub.label)}) ${st}` : st);
        }
      }
      if (bits.join(' ').length >= maxLen) break;
    }
  }
  const joined = bits.join(' ').replace(/\s+/g, ' ').trim();
  return joined.length > maxLen ? `${joined.slice(0, maxLen).trimEnd()}…` : joined;
}
