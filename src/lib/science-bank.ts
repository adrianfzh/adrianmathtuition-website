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
import { scienceImageBase, withScienceImageUrls } from './science-images';
import { resolveTopicPool } from './science-practice';
import {
  computeScienceMastery, sciencePoolLevels, MCQ_ANSWER_RE, MCQ_BOLD_RE, mcqKey, mcqStemParagraphs, scienceLevel, tsvBlocksToTables, type ScienceSubject, type TopicMastery,
} from './science-levels';

import { SERVED_DIFFICULTY_SOURCES, type DifficultyLevel } from './practice-difficulty';

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
  ai_generated?: boolean | null;
  verified?: boolean | null;
  image_watermark_status?: string | null;
  not_in_syllabus?: boolean | null;
  /** server-side only — the gate reads it; toPayload never passes it on (source: null) */
  school?: string | null;
  practice_hidden?: boolean | null;
  practice_checked_at?: string | null;
};

/** Which pool a caller draws from (lib/practice scienceServeFor): Combined Science or pure,
 *  and whether only rows that passed the blind-solve check may be served (students). */
export interface SciencePoolOpts { combined?: boolean; checkedOnly?: boolean }

// The gate columns (ai_generated, verified, image_watermark_status, not_in_syllabus)
// ride along so scienceEligible() sees what it checks — until 5 Oct 2026 they were
// missing, so every figure question the picker served came back "Question not found"
// from the grade route (image_watermark_status read as undefined ≠ 'clean').
// solution_images too, so a scheme's diagram reaches "Show solution".
const ROW_COLUMNS = 'id, subject, level, school, practice_hidden, practice_checked_at, question_text, parts, answer, solution, solution_images, topics, difficulty, total_marks, has_image, image_url, images, quarantined, ai_generated, verified, image_watermark_status, not_in_syllabus';

/** A row with its figures pointed at the SCIENCE bucket (lib/science-images — the maths bucket 400s). */
function withFigures<T extends ScienceQuestionRow>(q: T): T {
  return withScienceImageUrls(q as unknown as Record<string, unknown>, scienceImageBase(process.env.SUPABASE_URL_SCIENCE)) as unknown as T;
}
const ADVANCED = ['Advanced', 'Challenging'];
const EASY_FIRST = 4;
/** One random row of the build's pool that is NOT tagged Advanced / Challenging (null when none). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nextEasy(build: (select: string, head: boolean) => any): Promise<ScienceQuestionRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const narrow = (q: any) => q.or(`difficulty.is.null,difficulty.not.in.(${ADVANCED.join(',')})`);
  const { count, error } = await narrow(build('id', true));
  if (error || !count) return null;
  const offset = Math.floor(Math.random() * count);
  const { data } = await narrow(build(ROW_COLUMNS, false)).order('id').range(offset, offset);
  return ((data ?? []) as ScienceQuestionRow[])[0] ?? null;
}

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
    .or('not_in_syllabus.is.null,not_in_syllabus.eq.false')
    // national papers (school 'GCE' — GCE, TYS, specimen) are grounding-only, never served
    // (docs/CONTENT-POLICY.md; 1,129 MCQs were in the pool until 5 Oct 2026)
    .not('school', 'ilike', 'gce')
    // a row the practice check hid (duplicate copy, unanswerable as stored) — 5 Oct 2026;
    // the marker and grounding still read it
    .eq('practice_hidden', false)
    .not('question_text', 'is', null)
    .neq('question_text', '');
}

export interface ScienceTopicCount { topic: string; n: number; advanced_count: number; mcq_count: number }

// Per-topic counts over the ELIGIBLE pool (bank_topics counts the whole bank,
// images included, which would promise ~3× what the picker can serve). ~2.2k
// small rows; cached per level for ten minutes.
const topicCache = new Map<string, { at: number; rows: ScienceTopicCount[] }>();
const TOPIC_CACHE_MS = 10 * 60_000;

export async function scienceTopicCounts(levelKey: string, pool: SciencePoolOpts = {}): Promise<ScienceTopicCount[]> {
  const lvl = scienceLevel(levelKey);
  if (!lvl) return [];
  const cacheKey = `${levelKey}|${pool.combined ? 'cs' : 'pure'}|${pool.checkedOnly ? 'checked' : 'all'}`;
  const hit = topicCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TOPIC_CACHE_MS) return hit.rows;
  // PostgREST caps every response at 1,000 rows (db-max-rows), so page.
  const PAGE = 1000;
  const all: { topics: string[] | null; difficulty: string | null; answer?: string | null }[] = [];
  for (let from = 0; from < 20_000; from += PAGE) {
    let q = eligible<any>(getScienceClient().from('questions').select('topics, difficulty, answer'), lvl.subject) // eslint-disable-line @typescript-eslint/no-explicit-any
      .in('level', sciencePoolLevels(levelKey, !!pool.combined));
    if (pool.checkedOnly) q = q.not('practice_checked_at', 'is', null);
    const { data, error } = await q.order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`science topics: ${error.message}`);
    const page = (data || []) as { topics: string[] | null; difficulty: string | null; answer?: string | null }[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  const acc = new Map<string, ScienceTopicCount>();
  for (const r of all) {
    const topic = r.topics?.[0];
    if (!topic) continue;
    const cur = acc.get(topic) ?? { topic, n: 0, advanced_count: 0, mcq_count: 0 };
    cur.n++;
    if (mcqKey(r.answer)) cur.mcq_count++;   // the MCQ | Structured switch (1 Oct 2026)
    if (r.difficulty && ADVANCED.includes(r.difficulty)) cur.advanced_count++;
    acc.set(topic, cur);
  }
  const rows = [...acc.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  topicCache.set(cacheKey, { at: Date.now(), rows });
  return rows;
}

/**
 * The topics a caller may practise, with counts (5 Oct 2026): the open topics of their pool;
 * for a Combined Science student, each topic from the CS bank once its CS side is open, else
 * from the pure bank (lib/science-practice resolveTopicPool). `open` null = Adrian: the
 * pool he asked for, every topic.
 */
export async function scienceServedTopicCounts(levelKey: string, serve: SciencePoolOpts & { open: Readonly<Record<string, readonly string[]>> | null }): Promise<ScienceTopicCount[]> {
  if (!serve.open) return scienceTopicCounts(levelKey, serve);
  const open = serve.open;
  const wants = !!serve.combined;
  return (await scienceTopicCounts(levelKey, { combined: wants, checkedOnly: serve.checkedOnly }))
    .filter(t => resolveTopicPool(open, levelKey, t.topic, wants).open);
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

export function toPayload(raw: ScienceQuestionRow): ScienceQuestionPayload {
  const q = withFigures(raw);
  const mcq = mcqKey(q.answer) !== null;
  // Tab-separated tables become pipe tables; MCQ options each get their own
  // paragraph (single newlines fold in markdown).
  const text = tsvBlocksToTables(q.question_text);
  const row = { ...q, question_text: mcq ? mcqStemParagraphs(text) : text };
  const { stem, parts } = questionStructured(row);
  return {
    id: q.id,
    markdown: questionMarkdown(row),
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
  /** 'mcq' = rows whose answer is a bare letter; 'structured' = the rest; unset = either (1 Oct 2026). */
  kind?: 'mcq' | 'structured' | null;
  /** one skill inside the topic (`questions.skill`, lib/science-practice TOPIC_SKILLS); unset = the whole topic */
  skill?: string | null;
  /** Core / Exam / Challenge (practice_difficulty, 5 Oct 2026); unset = Mixed — every row, levelled or not */
  difficultyLevel?: DifficultyLevel | null;
} & SciencePoolOpts): Promise<ScienceQuestionRow | null> {
  const lvl = scienceLevel(opts.levelKey);
  if (!lvl) return null;
  const sb = getScienceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = (select: string, head: boolean): any => {
    const sel = opts.difficultyLevel ? `${select}, practice_difficulty!inner(level, source)` : select;
    let q = eligible<any>(sb.from('questions').select(sel, head ? { count: 'exact', head: true } : undefined), lvl.subject) // eslint-disable-line @typescript-eslint/no-explicit-any
      .in('level', sciencePoolLevels(opts.levelKey, !!opts.combined))
      .contains('topics', [opts.topic]);
    if (opts.difficultyLevel) q = q.eq('practice_difficulty.level', opts.difficultyLevel).in('practice_difficulty.source', SERVED_DIFFICULTY_SOURCES as unknown as string[]);
    // students: only rows that passed the blind-solve check (5 Oct 2026, questions.practice_checked_at)
    if (opts.checkedOnly) q = q.not('practice_checked_at', 'is', null);
    // MCQ = a bare letter OR the "**B** — …" form (lib/science-levels mcqKey).
    if (opts.kind === 'mcq') q = q.filter('answer', 'match', MCQ_ANSWER_RE);
    // structured = not a lettered answer (most structured rows carry NO answer at all — a
    // plain not.match would drop them), and a scheme on file to mark against.
    else if (opts.kind === 'structured') q = q.or('answer.is.null,answer.not.match.^\\s*[A-Da-d]\\s*$').or(`answer.is.null,answer.not.match.${MCQ_BOLD_RE}`).not('solution', 'is', null).neq('solution', '');
    if (opts.skill) q = q.eq('skill', opts.skill);
    if (opts.tier === 'Advanced') q = q.in('difficulty', ADVANCED);
    else if (opts.tier === 'Standard') q = q.or(`difficulty.is.null,difficulty.not.in.(${ADVANCED.join(',')})`);
    const excl = (opts.exclude ?? []).filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 80);
    if (excl.length) q = q.not('id', 'in', `(${excl.join(',')})`);
    return q;
  };
  // Easier first (5 Oct 2026 — science has no Standard / Advanced switch: the tags were set at
  // extraction and never checked): the first EASY_FIRST questions of a run avoid rows tagged
  // Advanced / Challenging when the topic has others; after that, everything is in the draw.
  if (!opts.tier && !opts.difficultyLevel && (opts.exclude ?? []).length < EASY_FIRST) {
    const easy = await nextEasy(build);
    if (easy) return easy;
  }
  const { count, error: cErr } = await build('id', true);
  if (cErr) throw new Error(`science next (count): ${cErr.message}`);
  if (!count) return null;
  const offset = Math.floor(Math.random() * count);
  const { data, error } = await build(ROW_COLUMNS, false).order('id').range(offset, offset);
  if (error) throw new Error(`science next: ${error.message}`);
  return ((data ?? []) as unknown as ScienceQuestionRow[])[0] ?? null;
}

/**
 * 🎚 How many servable MCQs of a topic sit at each level (practice_difficulty, results or
 * estimate — never the sample), for the Core · Exam · Challenge · Mixed choice. Three head
 * counts, cached ten minutes per pool + topic.
 */
const levelCountCache = new Map<string, { at: number; counts: Record<DifficultyLevel, number> }>();
export async function scienceLevelCounts(levelKey: string, topic: string, pool: SciencePoolOpts = {}): Promise<Record<DifficultyLevel, number>> {
  const lvl = scienceLevel(levelKey);
  const zero = { core: 0, exam: 0, challenge: 0 };
  if (!lvl) return zero;
  const key = `${levelKey}|${pool.combined ? 'cs' : 'pure'}|${pool.checkedOnly ? 'checked' : 'all'}|${topic}`;
  const hit = levelCountCache.get(key);
  if (hit && Date.now() - hit.at < TOPIC_CACHE_MS) return hit.counts;
  const counts = { ...zero };
  await Promise.all((['core', 'exam', 'challenge'] as const).map(async l => {
    let q = eligible<any>(getScienceClient().from('questions').select('id, practice_difficulty!inner(level, source)', { count: 'exact', head: true }), lvl.subject) // eslint-disable-line @typescript-eslint/no-explicit-any
      .in('level', sciencePoolLevels(levelKey, !!pool.combined))
      .contains('topics', [topic])
      .filter('answer', 'match', MCQ_ANSWER_RE)
      .eq('practice_difficulty.level', l)
      .in('practice_difficulty.source', SERVED_DIFFICULTY_SOURCES as unknown as string[]);
    if (pool.checkedOnly) q = q.not('practice_checked_at', 'is', null);
    const { count, error } = await q;
    if (error) throw new Error(`science level counts: ${error.message}`);
    counts[l] = count ?? 0;
  }));
  levelCountCache.set(key, { at: Date.now(), counts });
  return counts;
}

/** One question by id (answer + solution included — server-side use only). */
export async function scienceQuestion(subject: ScienceSubject, id: string): Promise<ScienceQuestionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await getScienceClient().from('questions').select(ROW_COLUMNS).eq('id', id).eq('subject', subject).maybeSingle();
  if (error) throw new Error(`science question: ${error.message}`);
  const row = (data as unknown as ScienceQuestionRow | null) ?? null;
  return row ? withFigures(row) : null;
}

/** True when a row passes the same bars the picker applies (a deep link must never open what the picker would refuse). */
export function scienceEligible(q: ScienceQuestionRow, pool?: SciencePoolOpts & { levelKey?: string }): boolean {
  if (q.quarantined) return false;
  if (pool?.checkedOnly && !q.practice_checked_at) return false;
  if (pool?.levelKey && !sciencePoolLevels(pool.levelKey, !!pool.combined).includes(q.level ?? '')) return false;
  if (q.not_in_syllabus === true) return false;
  if ((q.school || '').trim().toUpperCase() === 'GCE') return false;   // national = grounding-only
  if (q.practice_hidden === true) return false;                          // hidden by the practice check
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
