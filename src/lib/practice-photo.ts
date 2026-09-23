// Practice photo (SPEC-PRACTICE-PHOTO.md, 23 Sep 2026) — the pure half.
//
// A student photographs a question. The bot files it under ONE sub-skill
// (`POST /api/portal-classify`, no embeddings), this side picks a bank SEED
// filed under that sub-skill and queues a `generation_requests` row the bot's
// worker re-skins into a NEW question for the student. Until it exists the
// Practice list shows a "Writing…" row; the done webhook flips it.
//
// Everything with a rule in it lives here, I/O-free and tested:
//   - the daily cap (counted on the finder ledger, tier 'practice-photo')
//   - the seed pick (marks within one of the photo's, real bank rows before
//     generated ones, never a reported one, never the same seed twice running)
//   - the request row's shape, the done webhook's parse + outcome, the Report
//     body's parse.
import { sgtDayStartISO } from './sgt';
import { tierOf, type Tier } from './practice-tiers';

/** Photographed questions a student may spend a Singapore day on (§8). */
export const DAILY_PRACTICE_PHOTO_CAP = 10;
export const PHOTO_CAP_MESSAGE =
  'You’ve used today’s photo questions — the ones already on your list are waiting. More tomorrow.';
export const PHOTO_UNREADABLE_MESSAGE =
  'We couldn’t read enough from that — try a clearer photo, or type the question instead.';
export const PHOTO_UNFILED_MESSAGE =
  'We couldn’t tell which skill that question tests — try a clearer photo, or the whole question in one shot.';
export const PHOTO_FAILED_MESSAGE =
  'That one didn’t pass our checks — try again, or snap a clearer photo.';

// ── Daily cap ────────────────────────────────────────────────────────────────
type CountResult = { count: number | null; error: unknown };
interface CountQuery extends PromiseLike<CountResult> {
  eq(column: string, value: string | boolean): CountQuery;
  gte(column: string, value: string): CountQuery;
}
export interface PhotoCountingClient {
  from(table: string): { select(columns: string, options: { count: 'exact'; head: true }): CountQuery };
}

/** Photo questions this student has QUEUED today (SGT day) — every accepted
 *  photo writes one finder-ledger row with tier 'practice-photo'; a photo the
 *  bot could not read or file writes none and never spends the day. */
export async function countPracticePhotosToday(client: PhotoCountingClient, identity: string, now: Date = new Date()): Promise<number> {
  const { count } = await client
    .from('portal_generation_log')
    .select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', identity)
    .eq('tier', 'practice-photo')
    .gte('created_at', sgtDayStartISO(now));
  return count ?? 0;
}

// ── The bot's classification ─────────────────────────────────────────────────
export type PhotoSubgroup = { id: number; name: string; topic: string | null; description: string | null };
export type PhotoClassification = {
  extractedText: string;
  level: string | null;
  subgroup: PhotoSubgroup | null;
  confidence: number | null;
  reason: string | null;
  marks: number | null;
  figureExpected: boolean;
};

/** The bot's `/api/portal-classify` reply, defensively read. Null = not a reply we can use. */
export function parseClassification(raw: unknown): PhotoClassification | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.ok !== true) return null;
  const sgRaw = r.subgroup && typeof r.subgroup === 'object' ? (r.subgroup as Record<string, unknown>) : null;
  const sgId = sgRaw ? Number(sgRaw.id) : NaN;
  const subgroup: PhotoSubgroup | null = sgRaw && Number.isFinite(sgId) && typeof sgRaw.name === 'string'
    ? {
        id: sgId,
        name: sgRaw.name,
        topic: typeof sgRaw.topic === 'string' ? sgRaw.topic : null,
        description: typeof sgRaw.description === 'string' ? sgRaw.description : null,
      }
    : null;
  const marks = typeof r.marks === 'number' && Number.isFinite(r.marks) && r.marks > 0 ? Math.round(r.marks) : null;
  return {
    extractedText: typeof r.extractedText === 'string' ? r.extractedText.slice(0, 4000) : '',
    level: typeof r.level === 'string' ? r.level : null,
    subgroup,
    confidence: typeof r.confidence === 'number' ? r.confidence : null,
    reason: typeof r.reason === 'string' ? r.reason : null,
    marks,
    figureExpected: r.figureExpected === true,
  };
}

// ── The seed pick ────────────────────────────────────────────────────────────
export type SeedCandidate = {
  id: string;
  total_marks: number | null;
  difficulty: string | null;
  ai_generated: boolean | null;
  reported_at?: string | null;
  /** The last seed this student was served, if the caller knows — never picked twice running. */
};

export type SeedPick = { id: string; tier: Tier; marks: number | null };

/**
 * Which bank question to re-skin. Order of preference:
 *   1. never a reported question, never the seed the student just had
 *   2. marks within ±1 of the photographed question's (when it printed any)
 *   3. a real (non-generated) bank row before a generated one
 * Ties broken by `rand` (0 ≤ rand < 1) so the same photo does not always
 * produce the same twin. Null when nothing is left.
 */
export function pickSeed(
  rows: SeedCandidate[],
  opts: { marks: number | null; avoidId?: string | null; rand?: number } = { marks: null },
): SeedPick | null {
  const rand = opts.rand ?? Math.random();
  const live = rows.filter(r => r.id && !r.reported_at && r.id !== (opts.avoidId ?? ''));
  if (!live.length) return null;
  const score = (r: SeedCandidate): number => {
    let s = 0;
    if (opts.marks != null && r.total_marks != null && Math.abs(r.total_marks - opts.marks) <= 1) s += 2;
    if (r.ai_generated !== true) s += 1;
    return s;
  };
  const best = Math.max(...live.map(score));
  const top = live.filter(r => score(r) === best);
  const chosen = top[Math.min(top.length - 1, Math.floor(rand * top.length))];
  return { id: chosen.id, tier: tierOf(chosen.difficulty) ?? 'standard', marks: chosen.total_marks ?? null };
}

// ── The request row ──────────────────────────────────────────────────────────
export const PRACTICE_PHOTO_PREFIX = 'practice-photo:';

// ── The slots' peek (23 Sep 2026) ────────────────────────────────────────────
// A sheet slot with no sheet to write asks "is a photo waiting?" through
// `sheet-jobs?peek=1` and, when one is, spends its tick on that row instead
// (scripts/sheet-worker/run.sh, PHOTO_PROMPT.md). Waiting = pending, or claimed
// by the plan worker and older than its own reclaim age (the bot's
// scripts/topup-plan-worker.js: CLAIMED_BY 'plan-worker', STALE_MINUTES 240) —
// a row a dead session left claimed would otherwise wait for the nightly run.
export const PLAN_WORKER_CLAIMANT = 'plan-worker';
export const PLAN_WORKER_STALE_MS = 240 * 60_000;
export type PhotoQueueRow = { requested_by: string | null; status: string | null; claimed_by: string | null; claimed_at: string | null };
export function countPhotoWaiting(rows: PhotoQueueRow[], now = Date.now()): number {
  let n = 0;
  for (const r of rows) {
    if (!String(r.requested_by ?? '').startsWith(PRACTICE_PHOTO_PREFIX)) continue;
    if (r.status === 'pending') { n++; continue; }
    if (r.status !== 'claimed' || r.claimed_by !== PLAN_WORKER_CLAIMANT) continue;
    const t = r.claimed_at ? Date.parse(r.claimed_at) : NaN;
    if (Number.isNaN(t) || now - t > PLAN_WORKER_STALE_MS) n++;
  }
  return n;
}

/** What the worker is asked to write — the intent text rides `source_text` for the seed-less case and the ledger. */
export function intentText(c: Pick<PhotoClassification, 'extractedText' | 'subgroup' | 'marks'>): string {
  const head = c.subgroup ? `Sub-skill: ${c.subgroup.name}${c.subgroup.topic ? ` (${c.subgroup.topic})` : ''}` : 'Sub-skill: unknown';
  const marks = c.marks != null ? `Marks: ${c.marks}` : 'Marks: not printed';
  return [head, marks, '', c.extractedText.trim()].join('\n').slice(0, 4000);
}

export type PhotoRequestRow = {
  requested_by: string;
  similarity_level: 're-skin' | 'same-skills';
  source_question_id: string | null;
  source_text: string;
  count: 1;
  status: 'pending';
  generated_ids: string[];
  tier: Tier;
  topic: string | null;
  figure_mode: 'graph' | null;
  priority: 1;
  portal_account_id: string;
  intent_json: {
    level: string | null;
    subgroup: PhotoSubgroup;
    marks: number | null;
    text: string;
    figureExpected: boolean;
  };
};

/** The `generation_requests` row for one accepted photo. A seed means RE-SKIN;
 *  without one the worker writes from scratch on the sub-skill (§4). */
export function buildPhotoRequest(input: {
  portalAccountId: string;
  classification: PhotoClassification & { subgroup: PhotoSubgroup };
  seed: SeedPick | null;
}): PhotoRequestRow {
  const c = input.classification;
  return {
    requested_by: PRACTICE_PHOTO_PREFIX + input.portalAccountId,
    similarity_level: input.seed ? 're-skin' : 'same-skills',
    source_question_id: input.seed?.id ?? null,
    source_text: intentText(c),
    count: 1,
    status: 'pending',
    generated_ids: [],
    tier: input.seed?.tier ?? 'standard',
    topic: c.subgroup.topic,
    figure_mode: c.figureExpected ? 'graph' : null,
    priority: 1,
    portal_account_id: input.portalAccountId,
    intent_json: {
      level: c.level,
      subgroup: c.subgroup,
      marks: c.marks,
      text: c.extractedText.trim().slice(0, 4000),
      figureExpected: c.figureExpected,
    },
  };
}

/** The Writing… row's title — the sub-skill, never the photo's text. */
export function writingTitle(subgroup: Pick<PhotoSubgroup, 'name' | 'topic'>): string {
  return subgroup.name.trim().slice(0, 120) || subgroup.topic?.trim().slice(0, 120) || 'A question from your photo';
}

// ── The done webhook ─────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DoneBody = { requestId: string; questionIds: string[]; error: string | null };

export function parseDoneBody(body: unknown): { ok: true; value: DoneBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;
  const requestId = typeof b.requestId === 'string' ? b.requestId.trim() : '';
  if (!UUID_RE.test(requestId)) return { ok: false, error: 'requestId (uuid) is required' };
  const questionIds = Array.isArray(b.questionIds)
    ? b.questionIds.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))
    : [];
  const error = typeof b.error === 'string' && b.error.trim() ? b.error.trim().slice(0, 300) : null;
  return { ok: true, value: { requestId, questionIds, error } };
}

/** What the done webhook does to the Writing… row: the first written question
 *  makes it live; nothing written withdraws it (the student is told). */
export function doneOutcome(d: Pick<DoneBody, 'questionIds' | 'error'>):
  { status: 'assigned'; questionId: string } | { status: 'revoked'; reason: string } {
  if (d.questionIds[0]) return { status: 'assigned', questionId: d.questionIds[0] };
  return { status: 'revoked', reason: d.error || 'no question written' };
}

// ── Report ───────────────────────────────────────────────────────────────────
export const REPORT_REASONS = ['wrong-answer', 'not-like-mine', 'unclear', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function parseReportBody(body: unknown): { ok: true; value: { assignmentId: string; reason: ReportReason; note: string | null } } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;
  const assignmentId = typeof b.assignmentId === 'string' ? b.assignmentId.trim() : '';
  if (!UUID_RE.test(assignmentId)) return { ok: false, error: 'assignmentId (uuid) is required' };
  const reason = REPORT_REASONS.find(r => r === b.reason) ?? 'other';
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 400) : null;
  return { ok: true, value: { assignmentId, reason, note } };
}

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  'wrong-answer': 'The answer looks wrong',
  'not-like-mine': 'Not like the question I photographed',
  unclear: 'I can’t tell what it’s asking',
  other: 'Something else',
};

/** The reason stored on the question and shown to Adrian: "<label> — <note>". */
export function reportReasonText(reason: ReportReason, note: string | null): string {
  return note ? `${REPORT_REASON_LABEL[reason]} — ${note}` : REPORT_REASON_LABEL[reason];
}
