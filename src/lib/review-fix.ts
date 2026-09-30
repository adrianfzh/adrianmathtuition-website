// The side-by-side on a Review card (30 Sep 2026): for each part that lost
// marks and has the red pen's "from your line" continuation, the student's own
// lines up to the one that went wrong (left) beside the correct steps from that
// line on (right). Built from the stored marking: `marking_output.lines[]` (the
// transcription, in page order) and `marking.parts[].continuation`
// ({steps_latex[], step_reasons[], final_latex, from_line_index}). Pure; tested.

export interface ReviewFix {
  /** The part's label, "(a)" — null for a one-part question. */
  label: string | null;
  /** The student's lines, oldest first; the LAST one is the line that went wrong. */
  yours: string[];
  /** The correct steps from that line on, each with its short reason ('' when none). */
  steps: { latex: string; why: string }[];
  /** The line the working should end on. */
  final: string | null;
}

/** How many of the student's lines before the wrong one to show — enough to see where they were. */
export const LINES_BEFORE = 2;

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function buildReviewFixes(parts: unknown, lines: unknown): ReviewFix[] {
  const ls = Array.isArray(lines) ? lines.map(rec) : [];
  const text = (l: Record<string, unknown> | null) => (l ? s(l.transcription_latex) || s(l.transcription_plain) : '');
  const out: ReviewFix[] = [];
  for (const raw of Array.isArray(parts) ? parts : []) {
    const p = rec(raw);
    if (!p || p.added_by_audit === true || p.continuation_ok === false) continue;
    if (n(p.awarded) >= n(p.max)) continue;
    const c = rec(p.continuation);
    if (!c) continue;
    const at = c.from_line_index;
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at >= ls.length) continue;
    const wrong = text(ls[at]);
    const stepsLatex = Array.isArray(c.steps_latex) ? c.steps_latex.map(s) : [];
    const reasons = Array.isArray(c.step_reasons) ? c.step_reasons : [];
    const steps = stepsLatex.map((latex, i) => ({ latex, why: s(reasons[i]) })).filter(x => x.latex);
    if (!wrong || steps.length === 0) continue;
    const yours: string[] = [];
    for (let i = Math.max(0, at - LINES_BEFORE); i < at; i++) {
      const t = text(ls[i]);
      if (t) yours.push(t);
    }
    yours.push(wrong);
    const final = s(c.final_latex);
    // The final line often repeats the last step; say it once.
    out.push({ label: s(p.label) && s(p.label) !== '(whole)' ? s(p.label) : null, yours, steps, final: final && final !== steps[steps.length - 1].latex ? final : null });
  }
  return out;
}
