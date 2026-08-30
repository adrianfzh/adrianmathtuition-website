/**
 * Which earlier marking runs does a freshly-released run replace?
 *
 * A paper can be marked more than once (Adrian re-marks after a calibration
 * fix, or the marker is re-run on better photos). Each pass writes a NEW row in
 * `paper_marking_runs` — so before this existed, releasing a re-mark left the
 * student looking at the same paper twice with two different scores. Alessi Tay
 * saw exactly that on 2026-08-30: "2021 OLevel Amath Paper 1" at 38/66 and at
 * 50/90 (the /90 grounding fix landed between the two passes).
 *
 * Adrian's rule (2026-08-31): "re-mark lands, previous run auto-archive."
 * Releasing a marking is the moment it becomes the marking, so that is when the
 * older passes get stamped `superseded_by`. They stay in the table — run rows
 * are never deleted — but drop out of the student's list.
 *
 * `superseded_by` is NOT `archived_at`. Archived means "cleared from the triage
 * queue without releasing" and mark-triage refuses it on a released run (409).
 * Superseded means "released, then replaced by a better marking of the same
 * paper", which only ever applies to released runs.
 *
 * Matching is deliberately strict — the identity of a paper is not something to
 * guess at. `paper_name` alone is nowhere near unique ("worksheet (10 photos)"
 * appears eight times across different students), so an untagged run can never
 * supersede anything, and a run is only ever replaced by a LATER one for the
 * SAME student.
 */

export type SupersedeRun = {
  id: string;
  student_id: string | null;
  paper_name: string | null;
  created_at: string;
  superseded_by?: string | null;
};

/** Papers are named by hand and by the bot — compare them forgivingly. */
export function normalisePaperName(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Ids of the runs `winner` replaces. Empty whenever identity is not certain:
 * an untagged run (no `student_id`) or an unnamed paper supersedes nothing.
 */
export function pickSuperseded(winner: SupersedeRun, candidates: SupersedeRun[]): string[] {
  const student = String(winner.student_id ?? '').trim();
  const paper = normalisePaperName(winner.paper_name);
  if (!student || !paper) return [];

  const winnerAt = Date.parse(winner.created_at);
  if (!Number.isFinite(winnerAt)) return [];

  return candidates
    .filter(c => {
      if (c.id === winner.id) return false;
      if (String(c.student_id ?? '').trim() !== student) return false;
      if (normalisePaperName(c.paper_name) !== paper) return false;
      if (c.superseded_by) return false;                 // already replaced
      const at = Date.parse(c.created_at);
      // Only ever look backwards. A newer pass that has not been released yet
      // is a candidate to replace THIS one later, never the other way round.
      return Number.isFinite(at) && at < winnerAt;
    })
    .map(c => c.id);
}
