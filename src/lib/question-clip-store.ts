// Question clips — the server half (SPEC-CLIP-PIPELINE.md §9). The pure half
// (refusals, slugs, status words) is lib/question-clip.ts; the pipeline that fills
// a row is scripts/clips/question-clip.mjs, its queue runner question-clip-worker.mjs.
import { getSupabaseAdmin } from './supabase';
import { parseBankKey, photoClipId, preRefuse, schoolSlug, type ClipQuestionRow, type QuestionClipStatus } from './question-clip';
import type { LessonScript } from './lesson-script';
// The part-marks door: preRefuse (lib/question-clip) refuses any question with a part marked out of
// syllabus (hasPartMarks), so no clip ever shows a hidden part; bankQuestionsForRun reads ids only.
export { hasPartMarks } from './part-syllabus';

export interface QuestionClipRow {
  question_id: string;
  status: QuestionClipStatus;
  requested_from: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  seconds: number | null;
  slug: string | null;
  topic: string | null;
  script: LessonScript | null;
  gate: { checks?: Record<string, { ok: boolean; detail: string }>; steps?: { step: string; seconds: number }[] } | null;
  cost: { voice_usd?: number; voice_chars?: number; agent_usd_notional?: number; agents?: unknown[] } | null;
  refuse_reason: string | null;
  fail_reason: string | null;
  watched_at: string | null;
  verdict: 'good' | 'not_good' | null;
  note: string | null;
  /** §9b: 'photo' = a question read off a hand-in (origin = its marked run + number). */
  source: 'bank' | 'photo';
  origin: { run_id: string; question_number: string } | null;
  question_text: string | null;
  same_as: string | null;
}

const LIST_COLUMNS = 'question_id, source, origin, question_text, same_as, status, requested_from, requested_at, started_at, finished_at, seconds, slug, topic, gate, cost, refuse_reason, fail_reason, watched_at, verdict, note';

export async function getQuestionClip(questionId: string, withScript = true): Promise<QuestionClipRow | null> {
  const { data } = await getSupabaseAdmin().from('question_clips')
    .select(withScript ? `${LIST_COLUMNS}, script` : LIST_COLUMNS).eq('question_id', questionId).maybeSingle();
  return (data as unknown as QuestionClipRow) ?? null;
}

export async function listQuestionClips(limit = 200): Promise<QuestionClipRow[]> {
  const { data } = await getSupabaseAdmin().from('question_clips').select(LIST_COLUMNS)
    .order('requested_at', { ascending: false }).limit(limit);
  return (data as unknown as QuestionClipRow[]) ?? [];
}

/**
 * Ask for a clip. A question the board cannot check is recorded as refused at once (no
 * worker time); one already queued, being made or ready is left alone; a failed or refused
 * one is re-queued only when `retry` is set (Adrian's ↻ on /admin/question-clips).
 */
export async function enqueueQuestionClip(questionId: string, from: string, retry = false): Promise<QuestionClipStatus | 'missing'> {
  const sb = getSupabaseAdmin();
  const existing = await getQuestionClip(questionId, false);
  if (existing && (['queued', 'making', 'ready'].includes(existing.status) || !retry)) return existing.status;
  const { data: q } = await sb.from('questions')
    .select('id, question_text, answer, solution, level, topics, parts, has_image, figure_url, images, image_url, legacy_syllabus, national, ai_generated, verified')
    .eq('id', questionId).is('deleted_at', null).maybeSingle();
  if (!q) return 'missing';
  const refusal = preRefuse(q as ClipQuestionRow);
  const now = new Date().toISOString();
  await sb.from('question_clips').upsert({
    question_id: questionId, requested_from: from, requested_at: now, updated_at: now,
    status: refusal ? 'refused' : 'queued', refuse_reason: refusal ? `${refusal.kind}: ${refusal.why}` : null,
    fail_reason: null, finished_at: refusal ? now : null,
  }, { onConflict: 'question_id' });
  return refusal ? 'refused' : 'queued';
}

export async function setQuestionClipVerdict(questionId: string, verdict: 'good' | 'not_good' | null, note: string | null): Promise<void> {
  await getSupabaseAdmin().from('question_clips').update({
    verdict, note: note ? note.slice(0, 2000) : null, watched_at: verdict ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq('question_id', questionId);
}

/**
 * A marked paper's questions → their bank rows, when the marking matched the paper to the
 * bank (result_json.paper_match.trusted + key). Only one row per number counts (GCE and its
 * Specimen share a key — the GCE row wins); anything unsure is left out (no door).
 */
export async function bankQuestionsForRun(resultJson: unknown, numbers: string[]): Promise<Record<string, string>> {
  const pm = (resultJson as { paper_match?: { trusted?: boolean; key?: string | null } } | null)?.paper_match;
  const k = pm?.trusted ? parseBankKey(pm.key) : null;
  if (!k || !numbers.length) return {};
  const { data } = await getSupabaseAdmin().from('questions')
    .select('id, school, exam_type, question_number')
    .eq('level', k.level).eq('year', k.year).eq('paper', k.paper).is('deleted_at', null)
    .in('question_number', numbers);
  const out: Record<string, string> = {};
  for (const n of numbers) {
    const rows = (data ?? []).filter(r => r.question_number === n && schoolSlug(r.school) === schoolSlug(k.school));
    const pick = rows.length === 1 ? rows[0] : rows.filter(r => r.exam_type !== 'Specimen').length === 1 ? rows.find(r => r.exam_type !== 'Specimen') : null;
    if (pick) out[n] = pick.id;
  }
  return out;
}

/**
 * Ask for a clip of a PHOTO question (§9b): question `number` of marked run `runId`, on a paper
 * the marking did not match to the bank. The row id is photoClipId(run, number); the worker reads
 * the question off the photos, checks it with two blind solves, and copies an existing clip when
 * another student's photo of the same question was already made.
 */
export async function enqueuePhotoClip(runId: string, number: string, from: string, retry = false): Promise<{ id: string; status: QuestionClipStatus | 'missing' }> {
  const sb = getSupabaseAdmin();
  const id = photoClipId(runId, number);
  const existing = await getQuestionClip(id, false);
  if (existing && (['queued', 'making', 'ready'].includes(existing.status) || !retry)) return { id, status: existing.status };
  const { data: run } = await sb.from('paper_marking_runs').select('id').eq('id', runId).maybeSingle();
  if (!run) return { id, status: 'missing' };
  const now = new Date().toISOString();
  await sb.from('question_clips').upsert({
    question_id: id, source: 'photo', origin: { run_id: runId, question_number: number },
    requested_from: from, requested_at: now, updated_at: now, status: 'queued', refuse_reason: null, fail_reason: null, finished_at: null,
  }, { onConflict: 'question_id' });
  return { id, status: 'queued' };
}

/** The 🎬 door ids for a marked paper's questions the bank match did not cover: number → photoClipId. */
export function photoClipIdsForRun(runId: string, numbers: string[]): Record<string, string> {
  return Object.fromEntries(numbers.map(n => [n, photoClipId(runId, n)]));
}
