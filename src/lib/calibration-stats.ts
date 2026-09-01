// Pure statistics over calibration_results rows — the numbers behind
// /admin/calibration and /api/admin/calibration. No I/O and no clock (callers
// pass `now`), so every line here is unit-testable (calibration-stats.test.ts).
//
// The gate (SPEC-SUBJECTS.md "calibration gate", SPEC-SCIENCE-MARKING.md
// "Calibration protocol"): Adrian hand-marks 10–15 real scripts per subject;
// the AI must land within ±2 marks of him per paper before anything for that
// subject is released to a student. So a subject's gate is MET only when
//   (a) at least GATE_MIN_PAPERS papers have been compared — the spec's floor
//       of the 10–15 range; a 3-for-3 streak proves nothing — and
//   (b) at least GATE_MIN_WITHIN_SHARE of them landed within GATE_THRESHOLD_MARKS.
//
// The stretch criterion is shown on the page as the target line rather than
// computed (there is no dual-rater data yet): GATE_TARGET_LINE below.
//
// Conventions:
//   • `abs_delta` / `within_gate` are generated columns in Postgres. They are
//     honoured when present and recomputed from the awarded marks when a caller
//     (or a narrower select) leaves them out, so the numbers never depend on
//     which columns were fetched.
//   • Signed delta = AI − truth: positive means the AI OVER-awarded (lenient),
//     negative means it UNDER-awarded (the student was short-changed).
//   • Question agreement is Σ questions_agree / Σ questions_total across papers
//     (a 40-question paper weighs more than a 5-question one), not a mean of
//     per-paper ratios.
//   • Over/under shares are over the per-question verdicts actually recorded
//     (`per_question[].verdict`), so a row whose harness wrote no per-question
//     detail contributes nothing to them.
//   • The trend buckets papers by ISO week (Monday 00:00 UTC) — the last
//     TREND_WEEKS weeks ending with the week containing `now`, oldest first.

import { MARK_SUBJECTS } from './mark-subjects';

export const GATE_THRESHOLD_MARKS = 2;
export const GATE_MIN_PAPERS = 10;
export const GATE_MIN_WITHIN_SHARE = 0.9;
export const TREND_WEEKS = 8;
export const GATE_TARGET_LINE = 'human–machine agreement ≥ human dual-rater agreement';

export type CalibrationVerdict = 'agree' | 'over' | 'under' | 'missing' | 'extra';
export const CALIBRATION_VERDICTS: readonly CalibrationVerdict[] = ['agree', 'over', 'under', 'missing', 'extra'];

export type CalibrationQuestion = {
  question: string;
  label?: string | null;
  truth_awarded: number | null;
  truth_max: number | null;
  ai_awarded: number | null;
  ai_max: number | null;
  delta: number | null;
  verdict: CalibrationVerdict | string;
};

export type CalibrationRow = {
  id: string;
  created_at: string;
  run_id: string | null;
  subject: string;
  paper_name: string | null;
  truth_source: string;
  truth_label: string | null;
  model: string;
  prompt_version: string | null;
  truth_awarded: number;
  truth_max: number;
  ai_awarded: number;
  ai_max: number;
  abs_delta?: number | null;
  within_gate?: boolean | null;
  questions_total: number;
  questions_agree: number;
  per_question: CalibrationQuestion[] | null;
  notes: string | null;
};

export type TrendPoint = { weekStart: string; papers: number; meanAbsDelta: number | null };

export type CalibrationGate = {
  threshold: number;
  minPapers: number;
  minWithinShare: number;
  met: boolean;
  /** How many more papers before the gate can even be judged. */
  papersShort: number;
};

export type SubjectStats = {
  subject: string;
  papers: number;
  withinGate: number;
  withinGateShare: number | null;
  meanAbsDelta: number | null;
  questionAgreement: number | null;
  overShare: number | null;
  underShare: number | null;
  verdicts: Record<CalibrationVerdict, number>;
  trend: TrendPoint[];
  latestPromptVersion: string | null;
  latestModel: string | null;
  latestAt: string | null;
  gate: CalibrationGate;
};

export type CalibrationStats = {
  subjects: SubjectStats[];
  papers: number;
  gate: { threshold: number; minPapers: number; minWithinShare: number; targetLine: string };
};

function num(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** AI − truth. Positive = the AI gave more than the human (lenient). */
export function signedDelta(row: Pick<CalibrationRow, 'ai_awarded' | 'truth_awarded'>): number {
  return num(row.ai_awarded) - num(row.truth_awarded);
}

/** |AI − truth| — the generated column when fetched, recomputed otherwise. */
export function absDelta(row: Pick<CalibrationRow, 'ai_awarded' | 'truth_awarded' | 'abs_delta'>): number {
  if (typeof row.abs_delta === 'number' && Number.isFinite(row.abs_delta)) return row.abs_delta;
  return Math.abs(signedDelta(row));
}

/** The per-paper gate: |Δ| ≤ threshold. Always derived from the marks so a
 *  different threshold can be asked about; the generated column agrees at 2. */
export function isWithinGate(
  row: Pick<CalibrationRow, 'ai_awarded' | 'truth_awarded' | 'abs_delta'>,
  threshold = GATE_THRESHOLD_MARKS,
): boolean {
  return absDelta(row) <= threshold;
}

/** Monday 00:00:00 UTC of the week containing `d`. */
export function weekStartUtc(d: Date): Date {
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
}

const WEEK_MS = 7 * 86400_000;

/** Mean |Δ| per ISO week for the last `weeks` weeks (oldest first, the current
 *  week last). Weeks with no papers carry `meanAbsDelta: null`, never 0 —
 *  "no data" must not draw as "perfect". Rows outside the window are ignored
 *  here but still count in every other statistic. */
export function weeklyTrend(rows: CalibrationRow[], now: Date, weeks = TREND_WEEKS): TrendPoint[] {
  const first = weekStartUtc(now).getTime() - (weeks - 1) * WEEK_MS;
  const points: TrendPoint[] = [];
  const sums: number[] = [];
  for (let i = 0; i < weeks; i++) {
    points.push({ weekStart: new Date(first + i * WEEK_MS).toISOString().slice(0, 10), papers: 0, meanAbsDelta: null });
    sums.push(0);
  }
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (!Number.isFinite(t) || t < first || t >= first + weeks * WEEK_MS) continue;
    const i = Math.floor((t - first) / WEEK_MS);
    points[i].papers++;
    sums[i] += absDelta(r);
  }
  for (let i = 0; i < weeks; i++) {
    if (points[i].papers > 0) points[i].meanAbsDelta = sums[i] / points[i].papers;
  }
  return points;
}

/** Tally of per-question verdicts across rows. Rows without a per_question
 *  array, and entries with an unknown verdict, are skipped. */
export function verdictCounts(rows: CalibrationRow[]): Record<CalibrationVerdict, number> {
  const counts: Record<CalibrationVerdict, number> = { agree: 0, over: 0, under: 0, missing: 0, extra: 0 };
  for (const r of rows) {
    if (!Array.isArray(r.per_question)) continue;
    for (const q of r.per_question) {
      const v = q?.verdict;
      if (v === 'agree' || v === 'over' || v === 'under' || v === 'missing' || v === 'extra') counts[v]++;
    }
  }
  return counts;
}

export function gateFor(papers: number, withinGateShare: number | null): CalibrationGate {
  return {
    threshold: GATE_THRESHOLD_MARKS,
    minPapers: GATE_MIN_PAPERS,
    minWithinShare: GATE_MIN_WITHIN_SHARE,
    met: papers >= GATE_MIN_PAPERS && (withinGateShare ?? 0) >= GATE_MIN_WITHIN_SHARE,
    papersShort: Math.max(0, GATE_MIN_PAPERS - papers),
  };
}

export function subjectStats(rows: CalibrationRow[], subject: string, now: Date): SubjectStats {
  const mine = rows.filter(r => r.subject === subject);
  const papers = mine.length;
  const withinGate = mine.filter(r => isWithinGate(r)).length;
  const withinGateShare = papers ? withinGate / papers : null;
  const meanAbsDelta = papers ? mine.reduce((s, r) => s + absDelta(r), 0) / papers : null;

  const qTotal = mine.reduce((s, r) => s + num(r.questions_total), 0);
  const qAgree = mine.reduce((s, r) => s + num(r.questions_agree), 0);
  const questionAgreement = qTotal > 0 ? qAgree / qTotal : null;

  const verdicts = verdictCounts(mine);
  const nVerdicts = CALIBRATION_VERDICTS.reduce((s, v) => s + verdicts[v], 0);
  const overShare = nVerdicts ? verdicts.over / nVerdicts : null;
  const underShare = nVerdicts ? verdicts.under / nVerdicts : null;

  // Newest first, independent of the order the rows arrived in.
  const newest = mine.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latestPromptVersion = newest.find(r => r.prompt_version)?.prompt_version ?? null;

  return {
    subject,
    papers,
    withinGate,
    withinGateShare,
    meanAbsDelta,
    questionAgreement,
    overShare,
    underShare,
    verdicts,
    trend: weeklyTrend(mine, now),
    latestPromptVersion,
    latestModel: newest[0]?.model ?? null,
    latestAt: newest[0]?.created_at ?? null,
    gate: gateFor(papers, withinGateShare),
  };
}

/** Per-subject stats. The four known subjects always appear (in canonical
 *  order, zeroed when empty) so the dashboard can show the gate a subject has
 *  yet to earn; any other subject found in the rows is appended alphabetically. */
export function calibrationStats(
  rows: CalibrationRow[],
  now: Date,
  subjects: readonly string[] = MARK_SUBJECTS,
): CalibrationStats {
  const known = new Set(subjects);
  const extra = [...new Set(rows.map(r => r.subject).filter(s => s && !known.has(s)))].sort();
  return {
    subjects: [...subjects, ...extra].map(s => subjectStats(rows, s, now)),
    papers: rows.length,
    gate: {
      threshold: GATE_THRESHOLD_MARKS,
      minPapers: GATE_MIN_PAPERS,
      minWithinShare: GATE_MIN_WITHIN_SHARE,
      targetLine: GATE_TARGET_LINE,
    },
  };
}
