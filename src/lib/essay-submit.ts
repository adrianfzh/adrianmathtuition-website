// One door for handing an essay to the marker (SPEC-ESSAY-MARKING.md, 12 Sep
// 2026): the student's POST and the calibration harness's admin POST both come
// through here, so the row shape, the rubric and code list the bot receives,
// and the failure handling can never differ between them. Server-only.
import { getSupabaseAdmin } from './supabase';
import { essayRubricFor, ESSAY_KINDS, type EssayKind } from './essay-rubric';
import { essayCodesFor } from './essay-codes';

/** Essays a student may hand in per Singapore day. Three while E1 is preview-only (the spec's one a day lands with E5). */
export const DAILY_ESSAY_CAP = 3;
export const MIN_WORDS = 80;
export const MAX_WORDS = 1200;
export const MAX_QUESTION_CHARS = 1500;

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export interface EssaySubmission {
  identity: string;
  studentName: string | null;
  level: string | null;
  kind: string;
  question: string;
  text: string;
  /** 'app' for a student's hand-in, 'calibration' for the harness. */
  source?: 'app' | 'calibration';
  calibrationSet?: string | null;
  teacherMark?: Record<string, unknown> | null;
}

export type SubmitOutcome =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

/** Validate, insert the QUEUED row, ping the bot. A refusal is a failed row, never a silent queue. */
export async function submitEssay(s: EssaySubmission): Promise<SubmitOutcome> {
  const kind = String(s.kind ?? '').trim();
  const question = String(s.question ?? '').trim().slice(0, MAX_QUESTION_CHARS);
  const text = String(s.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!(kind in ESSAY_KINDS)) return { ok: false, status: 400, error: 'Choose the kind of writing.' };
  const wc = wordCount(text);
  if (wc < MIN_WORDS) return { ok: false, status: 400, error: `That is ${wc} words — paste the whole essay (at least ${MIN_WORDS}).` };
  if (wc > MAX_WORDS) return { ok: false, status: 400, error: `That is ${wc} words — one essay at a time (at most ${MAX_WORDS}).` };
  const rubric = essayRubricFor('english', kind);
  const codes = essayCodesFor('english');
  if (!rubric || !codes.length) return { ok: false, status: 400, error: 'No rubric is seeded for that kind yet.' };

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return { ok: false, status: 503, error: 'Essay marking is temporarily unavailable.' };

  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb.from('essay_runs').insert({
    airtable_student_id: s.identity,
    student_name: s.studentName,
    subject: 'english',
    syllabus: rubric.syllabus,
    level: s.level,
    essay_kind: kind,
    question: question || null,
    essay_text: text,
    transcript_source: 'typed',
    word_count: wc,
    status: 'queued',
    source: s.source ?? 'app',
    calibration_set: s.calibrationSet ?? null,
    teacher_mark: s.teacherMark ?? null,
  }).select('id').single();
  if (error || !row) return { ok: false, status: 500, error: error?.message ?? 'Could not save the essay.' };

  let ok = false;
  let why = '';
  try {
    const r = await fetch(`${botBase}/api/essay-mark`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: row.id, text, question: question || null, essayKind: kind as EssayKind,
        subject: 'english', syllabus: rubric.syllabus, level: s.level,
        studentName: s.studentName, rubric: { criteria: rubric.criteria }, codes,
      }),
      signal: AbortSignal.timeout(15000),
    });
    ok = r.status === 202;
    if (!ok) why = `bot answered ${r.status}`;
  } catch (e) {
    why = e instanceof Error ? e.message : String(e);
  }
  if (!ok) {
    await sb.from('essay_runs').update({ status: 'failed', error: why }).eq('id', row.id);
    return { ok: false, status: 503, error: 'The marker did not pick this up. Try again in a minute.' };
  }
  return { ok: true, id: row.id };
}
