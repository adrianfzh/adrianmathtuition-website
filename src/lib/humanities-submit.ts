// One door for handing a humanities answer to the marker (SPEC-HUMANITIES.md
// §H1, 2 Oct 2026): the student's POST and the bench's admin POST both come
// through here. The website owns the question, the sources and the level scheme
// (data/humanities/…); the bot receives them WITH the answer and knows nothing
// about the subject itself. Server-only.
import { getSupabaseAdmin } from './supabase';
import { questionById, levelsMax, rulesFor, tagsFor, SCHEME_VERSION, SUBJECT_NAME } from './humanities-questions';
import { wordCount } from './humanities-report';

/** Answers a student may hand in per Singapore day. */
export const DAILY_HUMANITIES_CAP = 20;
export const MIN_WORDS = 3;
export const MAX_WORDS = 600;

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
}

export type SubmitOutcome =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

/** Validate, insert the QUEUED row, ping the bot. A refusal is a failed row, never a silent queue. */
export async function submitHumanities(s: HumanitiesSubmission): Promise<SubmitOutcome> {
  const ctx = questionById(String(s.questionId ?? ''));
  if (!ctx) return { ok: false, status: 400, error: 'That question is not in the bank.' };
  const answer = String(s.answer ?? '').replace(/\r\n?/g, '\n').trim();
  const wc = wordCount(answer);
  if (wc < MIN_WORDS) return { ok: false, status: 400, error: 'Write your answer first.' };
  if (wc > MAX_WORDS) return { ok: false, status: 400, error: `That is ${wc} words — keep one answer under ${MAX_WORDS}.` };

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return { ok: false, status: 503, error: 'Feedback is temporarily unavailable.' };

  const max = levelsMax(ctx.question.skill);
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

  let ok = false;
  let why = '';
  try {
    const r = await fetch(`${botBase}/api/humanities-mark`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: row.id, answer, studentName: s.studentName, source: s.source ?? 'app',
        subject: SUBJECT_NAME[ctx.set.subject], kind: ctx.set.kind, skill: ctx.question.skill,
        // A case study's Background Information rides with the issue line: the bot's prompt has one slot for both.
        issue: ctx.set.background ? `${ctx.set.issue}\n\nBACKGROUND INFORMATION\n${ctx.set.background}` : ctx.set.issue,
        question: ctx.question.question,
        sources: ctx.inView.map(x => ({ id: x.id, provenance: x.provenance, text: x.text })),
        scheme: { label: ctx.scheme.label, levels: ctx.scheme.levels, note: ctx.scheme.note ?? null, slips: ctx.scheme.slips, lifts: ctx.scheme.lifts },
        rules: rulesFor(ctx.question.skill), tags: tagsFor(ctx.question.skill),
      }),
      signal: AbortSignal.timeout(15000),
    });
    ok = r.status === 202;
    if (!ok) why = `bot answered ${r.status}`;
  } catch (e) {
    why = e instanceof Error ? e.message : String(e);
  }
  if (!ok) {
    await sb.from('humanities_runs').update({ status: 'failed', error: why }).eq('id', row.id);
    return { ok: false, status: 503, error: 'The reader did not pick this up. Try again in a minute.' };
  }
  return { ok: true, id: row.id };
}
