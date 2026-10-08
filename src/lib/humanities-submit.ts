// One door for handing a humanities answer to the reader (SPEC-HUMANITIES.md
// §H1, 2 Oct 2026): the student's POST and the bench's admin POST both come
// through here. The website owns the question, the sources and the level scheme
// (data/humanities/…), so it writes the whole prompt (lib/humanities-prompt) and
// queues TWO reads on the plan queue (plan_reads — Adrian, 7 Oct 2026: "all on
// plan"); lib/humanities-settle-run settles the run when they are back. Server-only.
import { getSupabaseAdmin } from './supabase';
import { questionById, maxOf, SCHEME_VERSION } from './humanities-questions';
import { buildHumanitiesPayload } from './humanities-prompt';
import { enqueueHumanitiesRead, HUMANITIES_PLAN_MODEL, type PlanModel } from './humanities-settle-run';
import { wordCount } from './humanities-report';

/** Answers a student may hand in per Singapore day. */
export const DAILY_HUMANITIES_CAP = 20;
export const MIN_WORDS = 3;
export const MAX_WORDS = 600;

// The paid reader (the bot's /api/humanities-mark, about 5 US cents an answer) is OFF unless
// HUMANITIES_READ_USE_API=1 is set on purpose. Unset everywhere — do not set it without Adrian's word.
export const humanitiesReadOnApi = (): boolean => process.env.HUMANITIES_READ_USE_API === '1';

export interface HumanitiesSubmission {
  identity: string;
  studentName: string | null;
  questionId: string;
  answer: string;
  /** 'app' for a student's answer, 'calibration' for the bench. */
  source?: 'app' | 'calibration';
  calibrationSet?: string | null;
  /** The bench's truth: the level the answer was written at. */
  truthLevel?: number | null;
  /** A timed paper's answers share one id; minutes = how long the paper took. */
  paperId?: string | null;
  paperMinutes?: number | null;
  /** The bench only: which plan reader reads it (to compare the two before one is chosen). */
  model?: PlanModel;
}

export type SubmitOutcome =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

/** Validate, insert the QUEUED row, queue its two reads. A refusal is a failed row, never a silent queue. */
export async function submitHumanities(s: HumanitiesSubmission): Promise<SubmitOutcome> {
  const ctx = questionById(String(s.questionId ?? ''));
  if (!ctx) return { ok: false, status: 400, error: 'That question is not in the bank.' };
  const answer = String(s.answer ?? '').replace(/\r\n?/g, '\n').trim();
  const wc = wordCount(answer);
  if (wc < MIN_WORDS) return { ok: false, status: 400, error: 'Write your answer first.' };
  if (wc > MAX_WORDS) return { ok: false, status: 400, error: `That is ${wc} words — keep one answer under ${MAX_WORDS}.` };

  const onApi = humanitiesReadOnApi();
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (onApi && (!botBase || !botSecret)) return { ok: false, status: 503, error: 'Feedback is temporarily unavailable.' };

  const max = maxOf(ctx.question);
  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb.from('humanities_runs').insert({
    airtable_student_id: s.identity,
    student_name: s.studentName,
    subject: ctx.set.subject,
    skill: ctx.question.skill,
    question_id: ctx.question.id,
    answer_text: answer,
    word_count: wc,
    levels_max: max,
    scheme_version: SCHEME_VERSION,
    status: 'queued',
    source: s.source ?? 'app',
    calibration_set: s.calibrationSet ?? null,
    truth_level: s.truthLevel ?? null,
    ...(s.paperId ? { paper_id: s.paperId, paper_minutes: s.paperMinutes ?? null } : {}),
  }).select('id').single();
  if (error || !row) return { ok: false, status: 500, error: error?.message ?? 'Could not save the answer.' };

  const payload = buildHumanitiesPayload(ctx, answer);
  let ok = false;
  let why = '';
  if (!onApi) {
    // The two read orders the bench was run on: 1 = claim by claim, 2 = the whole answer first.
    const model = s.model ?? HUMANITIES_PLAN_MODEL;
    const queued = await Promise.all([1, 2].map(pass => enqueueHumanitiesRead({ id: row.id, identity: s.identity }, payload, pass, model)));
    ok = queued.every(Boolean);
    if (!ok) why = 'the plan queue did not take the reads';
  } else {
    try {
      const r = await fetch(`${botBase}/api/humanities-mark`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: row.id, studentName: s.studentName, source: s.source ?? 'app', ...payload }),
        signal: AbortSignal.timeout(15000),
      });
      ok = r.status === 202;
      if (!ok) why = `bot answered ${r.status}`;
    } catch (e) {
      why = e instanceof Error ? e.message : String(e);
    }
  }
  if (!ok) {
    await sb.from('humanities_runs').update({ status: 'failed', error: why }).eq('id', row.id);
    return { ok: false, status: 503, error: 'The reader did not pick this up. Try again in a minute.' };
  }
  return { ok: true, id: row.id };
}
