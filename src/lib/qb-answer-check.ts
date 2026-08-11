// src/lib/qb-answer-check.ts — deterministic gate for Tier-A question-bank
// answer extraction (see .claude/agents/qb-extractor.md).
//
// The extractor proposes `answer` values read off existing worked solutions. This
// module decides which proposals are allowed to be written. It is PURE — no network,
// no DB — so it can be unit-tested and so the proposal step and the write step stay
// separate. Same division of labour as topup-plan-worker's --insert-gated: the model
// proposes, a boring deterministic pass decides what lands.
//
// The failure this exists to catch: a plausible-looking answer that is not actually
// in the source. A blank `answer` merely hides a question from practice generation;
// a WRONG one becomes a grading key and marks a correct student down. At ~6.8k rows
// a 2% slip is ~135 poisoned questions with no way to tell which.

export interface Proposal {
  id: string;
  answer: string;
  /** Verbatim slice of the solution the answer was read from. Required. */
  evidence?: string;
}

export interface SourceRow {
  id: string;
  solution: string;
  question_text?: string;
  /** Current stored value. Must still be empty or the proposal is stale. */
  answer?: string | null;
}

export type CheckCode =
  | 'empty_answer'
  | 'too_long'
  | 'already_answered'
  | 'missing_row'
  | 'missing_evidence'
  | 'evidence_not_in_solution'
  | 'number_not_in_solution'
  | 'part_label_unknown';

export interface CheckResult {
  id: string;
  ok: boolean;
  /** Codes that failed. Empty when ok. */
  reasons: CheckCode[];
  /** Human-readable detail, one per reason, same order. */
  detail: string[];
  /** True when the answer carries no digits at all (proof / prose answers). */
  prose: boolean;
}

/** Existing answers average 78 chars; anything near this is transcription, not extraction. */
const MAX_ANSWER_CHARS = 300;

/** Collapse whitespace and normalise unicode minus/quotes so substring checks survive reflow. */
export function normalise(s: string): string {
  return (s || '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull numeric literals out of text. LaTeX-safe: `\frac{8e-1}{8}` yields 8, 1, 8 —
 * every one of which must also be findable in the solution, which is what we want.
 * Deliberately ignores digits that are part of a LaTeX control word (`\sqrt3` is rare
 * and would be caught by the evidence check anyway).
 */
export function numbersIn(text: string): string[] {
  const cleaned = (text || '').replace(/(\d),(?=\d{3}\b)/g, '$1'); // 1,234 -> 1234
  const out = cleaned.match(/\d+(?:\.\d+)?/g) || [];
  return out;
}

/** Does `a` look like `s` rounded — to a's decimal places, or to a's significant figures? */
function isRoundingOf(a: string, s: string): boolean {
  const an = Number(a);
  const sn = Number(s);
  if (!Number.isFinite(an) || !Number.isFinite(sn)) return false;

  const dp = a.includes('.') ? a.split('.')[1].length : 0;
  if (Number(sn.toFixed(dp)) === an) return true;

  const sig = a.replace(/^0+\.?0*/, '').replace(/[^0-9]/g, '').length;
  if (sig > 0 && sig <= 15) {
    const rounded = Number(sn.toPrecision(sig));
    if (rounded === an) return true;
  }
  return false;
}

/**
 * Every number in the proposed answer must be justified by the solution — present
 * literally, or a rounding of a value that is present. Solutions routinely end
 * `= 2.3465 ≈ 2.35`, so a literal-only check would reject correct extractions.
 */
export function unjustifiedNumbers(answer: string, solution: string): string[] {
  const solNums = numbersIn(solution);
  const solSet = new Set(solNums);
  const bad: string[] = [];
  for (const a of numbersIn(answer)) {
    if (solSet.has(a)) continue;
    if (solNums.some((s) => isRoundingOf(a, s))) continue;
    bad.push(a);
  }
  return bad;
}

/** Part labels used by the answer, e.g. `(a)`, `(ii)`. */
export function partLabels(text: string): string[] {
  const m = (text || '').match(/\((?:[a-z]|i{1,3}v?|vi{0,3}|ix|x)\)/gi) || [];
  return Array.from(new Set(m.map((x) => x.toLowerCase())));
}

export function checkProposal(p: Proposal, row: SourceRow | undefined): CheckResult {
  const reasons: CheckCode[] = [];
  const detail: string[] = [];
  const fail = (code: CheckCode, msg: string) => {
    reasons.push(code);
    detail.push(msg);
  };

  const answer = (p.answer || '').trim();
  const prose = numbersIn(answer).length === 0;

  if (!row) {
    fail('missing_row', `no source row supplied for ${p.id}`);
    return { id: p.id, ok: false, reasons, detail, prose };
  }
  if (!answer) fail('empty_answer', 'proposed answer is empty');
  if (answer.length > MAX_ANSWER_CHARS)
    fail('too_long', `${answer.length} chars — extract the answer, do not copy the working`);
  if ((row.answer || '').trim())
    fail('already_answered', 'row already has an answer; proposal is stale');

  const sol = normalise(row.solution || '');
  const ev = normalise(p.evidence || '');

  if (!ev) {
    fail('missing_evidence', 'no evidence slice supplied');
  } else if (!sol.includes(ev)) {
    fail('evidence_not_in_solution', 'evidence is not a verbatim slice of the solution');
  }

  if (answer && sol) {
    const bad = unjustifiedNumbers(answer, row.solution || '');
    if (bad.length)
      fail(
        'number_not_in_solution',
        `${bad.join(', ')} appear in the answer but not in the solution`,
      );

    const known = new Set([
      ...partLabels(row.solution || ''),
      ...partLabels(row.question_text || ''),
    ]);
    const unknown = partLabels(answer).filter((l) => !known.has(l));
    if (unknown.length)
      fail('part_label_unknown', `part label(s) ${unknown.join(', ')} not present in the source`);
  }

  return { id: p.id, ok: reasons.length === 0, reasons, detail, prose };
}

export interface BatchReport {
  total: number;
  accepted: CheckResult[];
  held: CheckResult[];
  /** Accepted rows whose answer carries no digits — worth an eyeball, not a rejection. */
  proseAccepted: number;
  byReason: Record<string, number>;
}

export function checkBatch(proposals: Proposal[], rows: SourceRow[]): BatchReport {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const results = proposals.map((p) => checkProposal(p, byId.get(p.id)));
  const accepted = results.filter((r) => r.ok);
  const held = results.filter((r) => !r.ok);
  const byReason: Record<string, number> = {};
  for (const r of held) for (const c of r.reasons) byReason[c] = (byReason[c] || 0) + 1;
  return {
    total: proposals.length,
    accepted,
    held,
    proseAccepted: accepted.filter((r) => r.prose).length,
    byReason,
  };
}

/** Single-quote escaping for inline SQL literals. */
export function sqlLiteral(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * UPDATE statements for accepted proposals only. The empty-guard is non-negotiable:
 * it makes the write idempotent, safe to re-run, and safe under parallel workers.
 */
export function buildUpdates(report: BatchReport, proposals: Proposal[]): string[] {
  const okIds = new Set(report.accepted.map((r) => r.id));
  return proposals
    .filter((p) => okIds.has(p.id))
    .map(
      (p) =>
        `UPDATE questions SET answer = ${sqlLiteral(p.answer.trim())} ` +
        `WHERE id = ${sqlLiteral(p.id)} AND (answer IS NULL OR answer = '');`,
    );
}
