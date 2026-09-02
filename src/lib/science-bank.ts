// Science question bank — server-only reads (2026-09-02). The bank lives in a
// SEPARATE Supabase project (SPEC-SUBJECTS.md Part 1, ref eaxnstsecxmqdobfvmjh;
// env SUPABASE_URL_SCIENCE + SUPABASE_SERVICE_KEY_SCIENCE, the same pair the
// bot uses). Its `questions` table mirrors the math bank's columns (plus
// `subject` and `quarantined`, minus `deleted_at`/`figure_url`/`flagged_count`),
// so lib/bank-question-markdown renders its rows unchanged. There are no
// practice_* RPCs over there — everything below is PostgREST through
// supabase-js, mirroring the math RPCs' eligibility bars:
//
//   not quarantined · AI rows only when verified · has an answer or solution
//   · has stem text · image rows only with a CLEAN watermark scan (none of the
//   physics images has been scanned yet, so v1 is text-only — Adrian's rule:
//   never ship another company's watermark).
//
// Privacy: like the math routes, school / year / paper never leave the server.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from './supabase-server';
import { questionMarkdown, questionStructured, totalMarksOf, type BankQuestion } from './bank-question-markdown';
import {
  computeScienceMastery, isMcqAnswer, scienceLevel, type ScienceSubject, type TopicMastery,
} from './science-levels';

let _client: SupabaseClient | null = null;

export function scienceConfigured(): boolean {
  return !!(process.env.SUPABASE_URL_SCIENCE && process.env.SUPABASE_SERVICE_KEY_SCIENCE);
}

export function getScienceClient(): SupabaseClient {
  if (_client) return _client;
  const url = (process.env.SUPABASE_URL_SCIENCE || '').trim();
  const key = (process.env.SUPABASE_SERVICE_KEY_SCIENCE || '').trim();
  if (!url || !key) throw new Error('Science bank not configured (SUPABASE_URL_SCIENCE / SUPABASE_SERVICE_KEY_SCIENCE)');
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

/** The science `questions` row shape the portal reads (never school/year/paper). */
export type ScienceQuestionRow = BankQuestion & {
  id: string;
  subject: ScienceSubject;
  level: string | null;
  topics: string[] | null;
  difficulty: string | null;
  total_marks: number | null;
  has_image: boolean | null;
  quarantined: boolean | null;
};

const ROW_COLUMNS = 'id, subject, level, question_text, parts, answer, solution, topics, difficulty, total_marks, has_image, image_url, images, quarantined';
const ADVANCED = ['Advanced', 'Challenging'];

// The eligibility bars, as one reusable filter chain (supabase-js PostgREST).
// Typed loosely on purpose: threading the builder's generic through here made
// TypeScript's instantiation "excessively deep" (TS2589).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eligible<T = any>(q: any, subject: ScienceSubject): T { // eslint-disable-line @typescript-eslint/no-explicit-any
  return q
    .eq('subject', subject)
    .or('quarantined.is.null,quarantined.eq.false')
    .or('ai_generated.is.null,ai_generated.eq.false,verified.eq.true')
    .or('has_image.is.null,has_image.eq.false,image_watermark_status.eq.clean')
    .or('solution.neq.,answer.neq.')
    .not('question_text', 'is', null)
    .neq('question_text', '');
}

export interface ScienceTopicCount { topic: string; n: number; advanced_count: number }

// Per-topic counts over the ELIGIBLE pool (bank_topics counts the whole bank,
// images included, which would promise ~3× what the picker can serve). ~2.2k
// small rows; cached per level for ten minutes.
const topicCache = new Map<string, { at: number; rows: ScienceTopicCount[] }>();
const TOPIC_CACHE_MS = 10 * 60_000;

export async function scienceTopicCounts(levelKey: string): Promise<ScienceTopicCount[]> {
  const lvl = scienceLevel(levelKey);
  if (!lvl) return [];
  const hit = topicCache.get(levelKey);
  if (hit && Date.now() - hit.at < TOPIC_CACHE_MS) return hit.rows;
  // PostgREST caps every response at 1,000 rows (db-max-rows), so page.
  const PAGE = 1000;
  const all: { topics: string[] | null; difficulty: string | null }[] = [];
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await eligible<any>(getScienceClient().from('questions').select('topics, difficulty'), lvl.subject) // eslint-disable-line @typescript-eslint/no-explicit-any
      .eq('level', lvl.bankLevel)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`science topics: ${error.message}`);
    const page = (data || []) as { topics: string[] | null; difficulty: string | null }[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  const acc = new Map<string, ScienceTopicCount>();
  for (const r of all) {
    const topic = r.topics?.[0];
    if (!topic) continue;
    const cur = acc.get(topic) ?? { topic, n: 0, advanced_count: 0 };
    cur.n++;
    if (r.difficulty && ADVANCED.includes(r.difficulty)) cur.advanced_count++;
    acc.set(topic, cur);
  }
  const rows = [...acc.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  topicCache.set(levelKey, { at: Date.now(), rows });
  return rows;
}

/** The practice payload shape (matches the math `next` route + `mcq`/`subject`). */
export interface ScienceQuestionPayload {
  id: string;
  markdown: string;
  stem: string;
  parts: ReturnType<typeof questionStructured>['parts'];
  marks: number | null;
  figureUrl: null;
  source: null;
  hasSolution: boolean;
  topic: string | null;
  subject: ScienceSubject;
  mcq: boolean;
}

export function toPayload(q: ScienceQuestionRow): ScienceQuestionPayload {
  const { stem, parts } = questionStructured(q);
  const mcq = isMcqAnswer(q.answer);
  return {
    id: q.id,
    markdown: questionMarkdown(q),
    stem,
    parts,
    marks: q.total_marks ?? totalMarksOf(parts) ?? (mcq ? 1 : null),
    figureUrl: null,
    source: null,
    // "Answer: B" is all most MCQ rows carry — still worth revealing.
    hasSolution: !!(q.solution && q.solution.trim()),
    topic: q.topics?.[0] ?? null,
    subject: q.subject,
    mcq,
  };
}

/**
 * One random eligible question for a topic — the science twin of the
 * practice_next RPC. Two round trips: an exact count under the filters, then
 * one row at a random offset. `tier` maps onto `difficulty` exactly as the
 * math RPC does; `exclude` keeps a session from repeating itself.
 */
export async function scienceNext(opts: {
  levelKey: string; topic: string; exclude?: string[]; tier?: 'Standard' | 'Advanced' | null;
}): Promise<ScienceQuestionRow | null> {
  const lvl = scienceLevel(opts.levelKey);
  if (!lvl) return null;
  const sb = getScienceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = (select: string, head: boolean): any => {
    let q = eligible<any>(sb.from('questions').select(select, head ? { count: 'exact', head: true } : undefined), lvl.subject) // eslint-disable-line @typescript-eslint/no-explicit-any
      .eq('level', lvl.bankLevel)
      .contains('topics', [opts.topic]);
    if (opts.tier === 'Advanced') q = q.in('difficulty', ADVANCED);
    else if (opts.tier === 'Standard') q = q.or(`difficulty.is.null,difficulty.not.in.(${ADVANCED.join(',')})`);
    const excl = (opts.exclude ?? []).filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 80);
    if (excl.length) q = q.not('id', 'in', `(${excl.join(',')})`);
    return q;
  };
  const { count, error: cErr } = await build('id', true);
  if (cErr) throw new Error(`science next (count): ${cErr.message}`);
  if (!count) return null;
  const offset = Math.floor(Math.random() * count);
  const { data, error } = await build(ROW_COLUMNS, false).order('id').range(offset, offset);
  if (error) throw new Error(`science next: ${error.message}`);
  return ((data ?? []) as unknown as ScienceQuestionRow[])[0] ?? null;
}

/** One question by id (answer + solution included — server-side use only). */
export async function scienceQuestion(subject: ScienceSubject, id: string): Promise<ScienceQuestionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await getScienceClient().from('questions').select(ROW_COLUMNS).eq('id', id).eq('subject', subject).maybeSingle();
  if (error) throw new Error(`science question: ${error.message}`);
  return (data as unknown as ScienceQuestionRow | null) ?? null;
}

/** True when a row passes the same bars the picker applies (a deep link must never open what the picker would refuse). */
export function scienceEligible(q: ScienceQuestionRow & { ai_generated?: boolean | null; verified?: boolean | null; image_watermark_status?: string | null }): boolean {
  if (q.quarantined) return false;
  if (q.ai_generated === true && q.verified !== true) return false;
  if (q.has_image && q.image_watermark_status !== 'clean') return false;
  if (!(q.solution && q.solution.trim()) && !(q.answer && q.answer.trim())) return false;
  return !!(q.question_text && q.question_text.trim());
}

/** Per-topic mastery from the student's own science attempts (math project,
 *  `student_attempts.marking_json.science`). */
export async function scienceMasteryFor(userId: string, subject: ScienceSubject): Promise<Map<string, TopicMastery>> {
  const { data, error } = await createServiceClient()
    .from('student_attempts')
    .select('marking_json, attempted_at')
    .eq('user_id', userId)
    .eq('marking_json->science->>subject', subject)
    .order('attempted_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(`science mastery: ${error.message}`);
  const rows = (data || []).map((r: { marking_json: Record<string, unknown> | null; attempted_at: string }) => {
    const mj = r.marking_json || {};
    return {
      topics: Array.isArray(mj.topics) ? (mj.topics as unknown[]).filter((t): t is string => typeof t === 'string') : [],
      score: typeof mj.score === 'number' ? mj.score : null,
      outOf: typeof mj.outOf === 'number' ? mj.outOf : null,
      attemptedAt: r.attempted_at,
    };
  });
  return computeScienceMastery(rows);
}
