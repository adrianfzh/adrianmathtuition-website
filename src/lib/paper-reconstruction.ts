/**
 * src/lib/paper-reconstruction.ts
 *
 * Pure logic for the /admin/questions "Papers" reconstruction feature:
 * judging how complete a reconstructed paper is (honest-gap assessment
 * against standard full-paper totals), sizing the working space a printed
 * question gets, and collecting answer-key lines.
 *
 * The GROUPING of bank rows into papers — with count, marks_total (positive
 * total_marks only) and numbered (non-blank question_number) — lives in the
 * Supabase `paper_index` view (migration paper_index_marks_total_numbered,
 * 2026-08-26), not here: one database aggregate instead of sweeping 26k rows.
 *
 * Kept pure and side-effect free per the repo testing policy — the sibling
 * .test.ts is the regression net.
 */

export type CoverageStatus = 'complete' | 'partial' | 'overfull' | 'unknown';

export interface CoverageAssessment {
  status: CoverageStatus;
  /** The standard full-paper total the marks were judged against. */
  assumedTotal: number | null;
  /** Marks short of assumedTotal (partial) or above it (overfull). */
  missingMarks: number;
  /** Human warning for the card / PDF footer; '' when nothing to flag. */
  label: string;
}

/**
 * Full Singapore papers total 80 (older O-Level P1), 90, or 100 marks —
 * except JC papers (Promo/MY/Prelim, H1 and H2), which are always 100.
 * Judge the reconstruction against whichever standard total is nearest
 * (ties go to the higher total — assuming more paper is the honest default),
 * with a ±2 tolerance for extraction noise in stored mark allocations.
 */
const STANDARD_TOTALS = [80, 90, 100];
const JC_TOTALS = [100];
const TOLERANCE = 2;

export function assessCoverage(marksTotal: number, count: number, level?: string | null): CoverageAssessment {
  if (count === 0) return { status: 'unknown', assumedTotal: null, missingMarks: 0, label: 'no questions' };
  if (marksTotal <= 0) {
    return { status: 'unknown', assumedTotal: null, missingMarks: 0, label: 'marks not recorded' };
  }
  const candidates = level && /^JC/i.test(level) ? JC_TOTALS : STANDARD_TOTALS;
  let assumed = candidates[0];
  for (const c of candidates.slice(1)) {
    if (Math.abs(marksTotal - c) <= Math.abs(marksTotal - assumed)) assumed = c; // ties → higher
  }
  const diff = marksTotal - assumed;
  if (Math.abs(diff) <= TOLERANCE) {
    return { status: 'complete', assumedTotal: assumed, missingMarks: 0, label: '' };
  }
  if (diff < 0) {
    return {
      status: 'partial', assumedTotal: assumed, missingMarks: -diff,
      label: `partial — ${-diff} marks missing (of a likely ${assumed}-mark paper)`,
    };
  }
  return {
    status: 'overfull', assumedTotal: assumed, missingMarks: diff,
    label: `${marksTotal} marks — ${diff} above a full ${assumed}-mark paper (possible duplicates)`,
  };
}

/**
 * Working-space sizing. This originally mirrored the create-exam-paper
 * skill's rule (2.5 lines per mark), but real school papers are roomier and
 * Adrian found the print cramped — now DELIBERATELY GENEROUS (2026-08-28):
 * 4 handwriting lines per mark, floor of 4 lines for markless parts, so a
 * 3-mark part gets ~a third of a page and a 4-mark part about half.
 */
export function workingSpaceLines(marks: number | null | undefined): number {
  const m = typeof marks === 'number' && marks > 0 ? marks : 0;
  return Math.max(4, m * 4);
}

/** One handwriting line ≈ 8mm; capped so a big closer still fits on a page. */
const LINE_MM = 8;
const SPACE_CAP_MM = 230;

export function workingSpaceMm(marks: number | null | undefined): number {
  return Math.min(SPACE_CAP_MM, workingSpaceLines(marks) * LINE_MM);
}

/** Minimal part shape the answer-key walk needs (questions.parts jsonb). */
export interface AnswerPart {
  label?: string | null;
  answer?: string | null;
  subparts?: AnswerPart[] | null;
}

/**
 * Answer-key lines for one question: per-part answers labelled "(a)(i) …",
 * falling back to the row-level answer column when no part carries one.
 */
export function answerKeyLines(parts: AnswerPart[] | null | undefined, rowAnswer: string | null | undefined): string[] {
  const out: string[] = [];
  const walk = (list: AnswerPart[], prefix: string) => {
    for (const p of list) {
      const label = p.label ? `${prefix}(${String(p.label).replace(/^\(|\)$/g, '')})` : prefix;
      if (p.answer && String(p.answer).trim()) out.push(`${label ? `${label} ` : ''}${String(p.answer).trim()}`);
      if (p.subparts?.length) walk(p.subparts, label);
    }
  };
  if (parts?.length) walk(parts, '');
  if (!out.length && rowAnswer && rowAnswer.trim()) out.push(rowAnswer.trim());
  return out;
}
