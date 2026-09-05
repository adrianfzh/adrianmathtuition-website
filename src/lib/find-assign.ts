// Server-side I/O for Find a question (SPEC-PORTAL-V2 §4): enrich the bot's
// matches from the bank's own filing, put a found / generated question on the
// student's Practice list, and write the ledger row the nightly review reads.
// Every judgement is pure in lib/portal-find.ts — this file is only the
// queries, all service-role with the identity predicate IN the query
// (lib/supabase-server.ts header).
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  practiceEligibility, previewOf, primaryFiling, candidateTopic,
  type FindCandidate, type FindFiling, type FindTier, type FindVerdict, type FindReference, type SimilarMatch,
} from './portal-find';
import { questionServableTo, type SubgroupAudienceRow } from './subgroup-visibility';

export type FindViewer = { levels: string[]; isIp: boolean };

type QuestionRow = {
  id: string;
  question_text: string | null;
  parts: unknown;
  level: string | null;
  topics: string[] | null;
  total_marks: number | null;
  deleted_at: string | null;
  flagged_count: number | null;
  ai_generated: boolean | null;
  verified: boolean | null;
  has_image: boolean | null;
  image_url: string | null;
  answer: string | null;
  solution: string | null;
};

const QUESTION_COLUMNS =
  'id, question_text, parts, level, topics, total_marks, deleted_at, flagged_count, ai_generated, verified, has_image, image_url, answer, solution';

type SubgroupJoin = SubgroupAudienceRow & { id: number; topic: string; name: string };
type FilingRow = { question_id: string; subgroup_id: number; is_primary: boolean | null; subgroups: SubgroupJoin | SubgroupJoin[] | null };

export type Filings = { filings: FindFiling[]; audience: SubgroupAudienceRow[] };

/** Every sub-skill filing of the given questions (question_subgroups → subgroups), keyed by question id. */
export async function loadFilings(admin: SupabaseClient, ids: string[]): Promise<Map<string, Filings>> {
  const out = new Map<string, Filings>();
  if (!ids.length) return out;
  const { data, error } = await admin
    .from('question_subgroups')
    .select('question_id, subgroup_id, is_primary, subgroups(id, level, topic, name, visibility, ip_extra_level)')
    .in('question_id', ids);
  if (error) throw new Error(`filings read failed: ${error.message}`);
  for (const row of (data ?? []) as unknown as FilingRow[]) {
    const sgs = Array.isArray(row.subgroups) ? row.subgroups : row.subgroups ? [row.subgroups] : [];
    const slot = out.get(row.question_id) ?? { filings: [], audience: [] };
    for (const sg of sgs) {
      slot.filings.push({ id: sg.id, topic: sg.topic, name: sg.name, primary: row.is_primary === true });
      slot.audience.push(sg);
    }
    out.set(row.question_id, slot);
  }
  return out;
}

function candidateFrom(q: QuestionRow, preview: string, f: Filings | undefined): FindCandidate {
  return {
    id: q.id,
    preview,
    level: q.level,
    topics: Array.isArray(q.topics) ? q.topics.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    marks: q.total_marks ?? null,
    filings: f?.filings ?? [],
  };
}

/**
 * The bot's matches → candidates the tier rule can judge. Bot order is kept
 * (it is the embedding-similarity order the rule breaks ties by). A match
 * that fails the practice-eligibility bars (lib/portal-find) or the sub-group
 * audience gate (lib/subgroup-visibility — the same gate ?qid= applies) is
 * dropped with a reason, so it can neither be assigned nor vote.
 */
export async function enrichCandidates(
  admin: SupabaseClient,
  matches: SimilarMatch[],
  viewer: FindViewer,
): Promise<{ candidates: FindCandidate[]; dropped: { id: string; reason: string }[] }> {
  const candidates: FindCandidate[] = [];
  const dropped: { id: string; reason: string }[] = [];
  if (!matches.length) return { candidates, dropped };
  const ids = matches.map((m) => m.id);
  const [{ data: rows, error }, filings] = await Promise.all([
    admin.from('questions').select(QUESTION_COLUMNS).in('id', ids),
    loadFilings(admin, ids),
  ]);
  if (error) throw new Error(`questions read failed: ${error.message}`);
  const byId = new Map(((rows ?? []) as QuestionRow[]).map((r) => [r.id, r]));
  for (const m of matches) {
    const q = byId.get(m.id);
    if (!q) { dropped.push({ id: m.id, reason: 'not in the bank' }); continue; }
    const elig = practiceEligibility(q);
    if (!elig.ok) { dropped.push({ id: m.id, reason: elig.reason }); continue; }
    const f = filings.get(m.id);
    if (!questionServableTo(f?.audience ?? [], viewer)) {
      dropped.push({ id: m.id, reason: 'not part of this student’s syllabus' });
      continue;
    }
    candidates.push(candidateFrom(q, m.preview || previewOf(q), f));
  }
  return { candidates, dropped };
}

/** What the student's card and the ledger keep about the question. */
export type FindQuestionSummary = {
  id: string;
  preview: string;
  topic: string | null;
  subgroup: string | null;
  marks: number | null;
  level: string | null;
  topics: string[];
};

export function summarise(c: FindCandidate): FindQuestionSummary {
  return {
    id: c.id,
    preview: c.preview,
    topic: candidateTopic(c),
    subgroup: primaryFiling(c)?.name ?? null,
    marks: c.marks,
    level: c.level,
    topics: c.topics,
  };
}

/** One bank question (a freshly generated one, or the review's read-back) as a summary; null when missing or not practice-eligible. */
export async function loadQuestionSummary(admin: SupabaseClient, questionId: string): Promise<FindQuestionSummary | null> {
  const [{ data: q }, filings] = await Promise.all([
    admin.from('questions').select(QUESTION_COLUMNS).eq('id', questionId).maybeSingle<QuestionRow>(),
    loadFilings(admin, [questionId]),
  ]);
  if (!q || !practiceEligibility(q).ok) return null;
  return summarise(candidateFrom(q, previewOf(q), filings.get(questionId)));
}

/** The Practice-list title: the sub-skill when the bank knows it, else the topic. */
export function findTitleFor(s: Pick<FindQuestionSummary, 'subgroup' | 'topic'>): string {
  if (s.subgroup) return s.subgroup.slice(0, 120);
  if (s.topic) return `${s.topic} question`.slice(0, 120);
  return 'A question you found';
}

/**
 * Put a found / generated question on the student's Practice list — a
 * `portal_assignments` row with source 'find' and the tier stamped, kind
 * 'question' so it opens in the instant grader exactly like a From-Adrian
 * bank question (SPEC-ASSIGN). Returns the row id, or null when the insert
 * failed (logged — the caller then falls back to a plain ?qid= link).
 */
export async function createFindAssignment(
  admin: SupabaseClient,
  input: { identity: string; question: FindQuestionSummary; level: string; tier: FindTier },
): Promise<string | null> {
  const { data, error } = await admin
    .from('portal_assignments')
    .insert({
      airtable_student_id: input.identity,
      kind: 'question',
      question_id: input.question.id,
      title: findTitleFor(input.question),
      topic: input.question.topic,
      level: input.level.slice(0, 20),
      tier: null,
      note: null,
      source: 'find',
      find_tier: input.tier,
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !data) {
    console.error('[find-assign] assignment insert failed:', error?.message);
    return null;
  }
  return data.id;
}

export type FindLedgerRow = {
  identity: string;
  kind: 'photo' | 'search';
  qbHit: boolean;
  generated: boolean;
  questionId: string | null;
  seedText: string | null;
  level: string | null;
  tier: FindTier | null;
  assignmentId: string | null;
  parentLogId?: string | null;
  candidates?: unknown;
};

/** One `portal_generation_log` row — the find ledger the caps count and the nightly review reads. Never throws; null when the write failed. */
export async function logFindRow(admin: SupabaseClient, row: FindLedgerRow): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('portal_generation_log')
      .insert({
        airtable_student_id: row.identity,
        kind: row.kind,
        qb_hit: row.qbHit,
        generated: row.generated,
        question_id: row.questionId,
        seed_text: row.seedText ? row.seedText.slice(0, 4000) : null,
        level: row.level,
        tier: row.tier,
        assignment_id: row.assignmentId,
        parent_log_id: row.parentLogId ?? null,
        candidates: row.candidates ?? null,
      })
      .select('id')
      .single<{ id: string }>();
    if (error) throw new Error(error.message);
    return data?.id ?? null;
  } catch (e) {
    console.error('[find-assign] ledger write failed:', (e as Error).message);
    return null;
  }
}

/** The compact candidate pool the ledger keeps for the review: every match with its verdict and why. */
export function ledgerCandidates(input: {
  candidates: FindCandidate[];
  verdicts: FindVerdict[];
  reference: FindReference;
  dropped: { id: string; reason: string }[];
}): unknown {
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  return {
    reference: input.reference,
    pool: input.verdicts.map((v) => {
      const c = byId.get(v.id);
      return {
        id: v.id,
        rank: v.rank,
        tier: v.tier,
        reason: v.reason,
        topic: c ? candidateTopic(c) : null,
        subgroup: c ? primaryFiling(c)?.name ?? null : null,
        marks: c?.marks ?? null,
        level: c?.level ?? null,
        preview: c?.preview.slice(0, 160) ?? null,
      };
    }),
    dropped: input.dropped,
  };
}
