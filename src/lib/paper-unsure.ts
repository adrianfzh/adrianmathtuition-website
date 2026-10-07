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
