// The teacher's mark, entered by the student (SPEC-SCIENCE-MARKING.md §Decision
// 10 Sep 2026, rule 7). Students hand in FRESH science papers, so no
// teacher-marked copy ever arrives with the hand-in; the truth comes back a
// week later when the teacher returns the paper, and the app asks for ONE
// number — the total the teacher gave. One number is one whole-paper
// calibration row, which is exactly the unit the ±2 gate counts.
//
// Pure: the parsing and the row shape live here so the route stays thin and
// the rules are tested without a request.

export const TEACHER_TOTAL_LABEL = 'student-reported teacher total';

export type TeacherTotal = { awarded: number; max: number };

export type ParsedTeacherTotal = { ok: true; value: TeacherTotal } | { ok: false; error: string };

/**
 * What the student typed → a teacher total, or why not. `max` defaults to the
 * marker's own max when left blank; a teacher's max may differ from ours (we
 * count what we saw; the school knows the paper), so it is accepted within
 * reason — 25% either way — and stored as typed.
 */
export function parseTeacherTotal(input: { awarded: unknown; max?: unknown }, aiMax: number): ParsedTeacherTotal {
  const awarded = toInt(input.awarded);
  if (awarded === null || awarded < 0) return { ok: false, error: 'Enter the mark your teacher gave — a whole number.' };
  const maxRaw = input.max === undefined || input.max === null || input.max === '' ? aiMax : toInt(input.max);
  if (maxRaw === null || maxRaw <= 0) return { ok: false, error: 'The “out of” must be a whole number above zero.' };
  if (aiMax > 0 && (maxRaw < aiMax * 0.75 || maxRaw > aiMax * 1.25)) {
    return { ok: false, error: `That “out of” (${maxRaw}) is far from the paper’s total we marked (${aiMax}) — check it.` };
  }
  if (awarded > maxRaw) return { ok: false, error: 'The mark cannot be more than the total.' };
  return { ok: true, value: { awarded, max: maxRaw } };
}

function toInt(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^\s*\d{1,4}\s*$/.test(v)) return parseInt(v, 10);
  return null;
}

/** The calibration_results row for a student-reported teacher total — only its writable columns
 *  (abs_delta / within_gate are generated in Postgres). */
export function teacherTotalRow(opts: {
  runId: string;
  subject: string;
  paperName: string | null;
  model: string | null;
  rulesVersion: string | null;
  aiAwarded: number;
  aiMax: number;
  truth: TeacherTotal;
}) {
  return {
    run_id: opts.runId,
    subject: opts.subject,
    paper_name: opts.paperName,
    truth_source: 'teacher' as const,
    truth_label: TEACHER_TOTAL_LABEL,
    model: opts.model || 'unknown',
    prompt_version: opts.rulesVersion,
    truth_awarded: opts.truth.awarded,
    truth_max: opts.truth.max,
    ai_awarded: opts.aiAwarded,
    ai_max: opts.aiMax,
    questions_total: 0,
    questions_agree: 0,
    per_question: [] as unknown[],
    notes: 'Entered by the student in the app from the teacher’s returned paper — whole-paper total only.',
  };
}

/** One line for Adrian's Telegram and the page: teacher vs ours. */
export function teacherTotalSummary(truth: TeacherTotal, ai: { awarded: number; max: number }): { delta: number; withinGate: boolean; line: string } {
  const delta = Math.abs(truth.awarded - ai.awarded);
  const withinGate = delta <= 2;
  return {
    delta,
    withinGate,
    line: `teacher ${truth.awarded}/${truth.max} · ours ${ai.awarded}/${ai.max} · |Δ| ${delta} ${withinGate ? '✅' : '❌'}`,
  };
}
