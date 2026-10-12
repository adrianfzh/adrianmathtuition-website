// 🔎 "Which paper is this?" — the student's side (7 Oct 2026, SPEC-PAPER-MATCH.md §⑥).
//
// A hand-in whose name names no exam and whose pages carry no printed questions is
// marked from the working alone. The bot then compares that marking with the national
// paper it might be (bot lib/paper-recognise.js). When they agree it marks the paper
// again against the real one before the student sees anything. When they do NOT agree
// it releases the paper as marked and stamps `result_json.paper_match.candidate.unsure`
// — Adrian: "if unsure, just mark like what it's doing now … then put a message to the
// user, and give an option to reupload/remark". This file reads that stamp. Pure.

export interface PaperCandidate {
  /** What the student reads: "2025 A-Level H2 Maths Paper 1". */
  label: string;
  /** The paper name the run takes when the student says yes ("… · H2 TYS"). */
  name: string;
  key: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The paper we could not confirm, while the student has not answered — else null. */
export function unsurePaper(resultJson: unknown): PaperCandidate | null {
  const rj = resultJson && typeof resultJson === 'object' ? (resultJson as Record<string, unknown>) : {};
  const pm = rj.paper_match && typeof rj.paper_match === 'object' ? (rj.paper_match as Record<string, unknown>) : {};
  const c = pm.candidate && typeof pm.candidate === 'object' ? (pm.candidate as Record<string, unknown>) : null;
  if (!c || c.unsure !== true || c.answered) return null;
  const label = str(c.label), name = str(c.name), key = str(c.key);
  if (!label || !name || !key) return null;
  return { label, name, key };
}

/** The candidate stamp after the student's answer. `yes` → confirmed by the student. */
export function answeredCandidate(candidate: Record<string, unknown>, yes: boolean, nowIso: string, was: string | null): Record<string, unknown> {
  const { unsure: _unsure, ...rest } = candidate;
  return yes
    ? { ...rest, confirmed: 'student', answered: 'yes', answered_at: nowIso, was }
    : { ...rest, unsure: true, answered: 'no', answered_at: nowIso };
}

// ── Named one paper, wrote another (12 Oct 2026) ─────────────────────────────────────
// Adrian, on a hand-in named "… 2024 paper 2 amath" whose working was 2024 A Math
// Paper 1: "if marker noticed — just give a suggestion to user: this paper looks like
// paper 1, rename to paper 1 instead — tap to rename? … short and simple". The bot
// (lib/paper-recognise misnamedCandidates) marks it against the paper it really is and
// leaves the student's own name on the card (`student_label` = `kept_label`); this
// reads the stamp. The suggestion stands while the card still carries that kept name —
// tapping Rename clears the label (the app's name for the real paper shows), and any
// rename of their own hides it too.

export interface RenameSuggestion {
  /** "2024 A Math Paper 1" */
  label: string;
  /** The button: "Rename to Paper 1". */
  button: string;
}

/** The rename to suggest on this run, or null. Pure. */
export function renameSuggestion(resultJson: unknown, studentLabel: string | null | undefined): RenameSuggestion | null {
  const rj = resultJson && typeof resultJson === 'object' ? (resultJson as Record<string, unknown>) : {};
  const pm = rj.paper_match && typeof rj.paper_match === 'object' ? (rj.paper_match as Record<string, unknown>) : {};
  const c = pm.candidate && typeof pm.candidate === 'object' ? (pm.candidate as Record<string, unknown>) : null;
  if (!c || c.misnamed !== true || c.suggest !== true || c.not_held === true) return null;
  const label = str(c.label), kept = str(c.kept_label);
  if (!label || !kept || str(studentLabel) !== kept) return null;
  const n = (str(c.key).match(/p(\d)$/) || [])[1];
  return { label, button: n ? `Rename to Paper ${n}` : 'Rename it' };
}

/**
 * Do we lack the question paper this hand-in was marked from? Then the student is told
 * ONCE, plainly, and asked for it (Adrian, 12 Oct 2026: "if we don't, tell the student
 * so — that there are no questions and ask them to submit the question paper"). True on
 * the bot's two stamps: a named paper nobody holds (`paper_match.ungrounded`) and working
 * that reads as a paper the bank does not hold (`candidate.not_held`). Pure.
 */
export function missingQuestionPaper(resultJson: unknown): boolean {
  const rj = resultJson && typeof resultJson === 'object' ? (resultJson as Record<string, unknown>) : {};
  const pm = rj.paper_match && typeof rj.paper_match === 'object' ? (rj.paper_match as Record<string, unknown>) : {};
  const c = pm.candidate && typeof pm.candidate === 'object' ? (pm.candidate as Record<string, unknown>) : null;
  if (c && c.not_held === true) return true;
  return !!(pm.ungrounded && typeof pm.ungrounded === 'object');
}

/** The line itself — no tutor, no model named. */
export const MISSING_PAPER_LINE =
  "We don't have the question paper for this one, so it was marked from your working only. Please send the question paper (a photo of each page is fine) so we can check it properly.";
