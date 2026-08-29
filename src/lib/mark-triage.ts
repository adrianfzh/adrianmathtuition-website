// Triage over a marking run's `result_json` — the flagged-only review pass.
//
// The marking engine (bot `ai/paper-marker.js`) writes one entry per marked
// attempt into `result_json.results[]`, each carrying its own
// `review_recommended` + `review_reasons` (set when the question wasn't found,
// the match was uncertain, the marker raised an uncertainty note, or marking
// confidence was low). Triage shows ONLY those; the confident majority is
// released untouched. On the last 14 days that is ~29% of questions — the other
// 71% is the time this screen gives back.
//
// Everything here is PURE (repo testing policy: marks logic never inline in a
// route) and NON-MUTATING — callers read-modify-write the row, and a mutation
// in place would make a failed write leave a half-edited object behind.
//
// ⚠ Overriding a mark corrects the RECORD, not the already-rendered annotated
// PDF. The PDF is built once at marking time by the bot's `deliverQueuedRun`;
// nothing here can redraw it. `total_awarded` (and therefore the score chip, the
// bleed table and anything downstream) reflects the override, while the PDF the
// student opens still shows the AI's original red pen. The override note exists
// to be said out loud — the release nudge carries it.

export interface TriagePart {
  label: string;
  awarded: number;
  max: number;
  errorSummary: string | null;
}

export interface TriageQuestion {
  /** Index into result_json.results[] — the address every mutation uses. */
  index: number;
  questionNumber: string;
  photoIndex: number | null;
  region: string | null;
  awarded: number;
  max: number;
  matchConfidence: string;
  markingConfidence: string;
  questionFound: boolean;
  reviewReasons: string[];
  parts: TriagePart[];
  overallComment: string;
  topic: string | null;
  /** Adrian has agreed with, or overridden, this question — it drops off the list. */
  reviewed: boolean;
  override: { awarded: number; previous: number; note: string; at: string } | null;
}

export interface TriageSummary {
  flagged: TriageQuestion[];
  totalQuestions: number;
  /** Questions the marker was confident about — never shown, never blocking. */
  unflaggedCount: number;
  awarded: number;
  max: number;
}

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function resultsOf(resultJson: unknown): Json[] {
  const root = asRecord(resultJson);
  const raw = root?.results;
  if (!Array.isArray(raw)) return [];
  return raw.map(r => asRecord(r)).filter((r): r is Json => r !== null);
}

/**
 * A question needs Adrian's eyes when the marker asked for review AND he hasn't
 * already resolved it. Agreeing or overriding sets `triage_reviewed`, which is
 * what makes a row disappear rather than re-appearing on every load.
 */
export function isFlagged(result: Json): boolean {
  return result.review_recommended === true && result.triage_reviewed !== true;
}

function toTriageQuestion(r: Json, index: number): TriageQuestion {
  const marking = asRecord(r.marking) ?? {};
  const markingOutput = asRecord(r.marking_output) ?? {};
  const meta = asRecord(markingOutput.meta) ?? {};
  const rawParts = Array.isArray(marking.parts) ? marking.parts : [];
  const override = asRecord(r.triage_override);

  return {
    index,
    questionNumber: str(r.question_number) || '?',
    photoIndex: typeof r.photo_index === 'number' ? r.photo_index : null,
    region: typeof r.region === 'string' ? r.region : null,
    awarded: num(marking.total_awarded),
    max: num(marking.total_max),
    matchConfidence: str(r.match_confidence) || 'high',
    markingConfidence: str(marking.marking_confidence) || 'medium',
    questionFound: r.question_found !== false,
    reviewReasons: Array.isArray(r.review_reasons) ? r.review_reasons.filter(x => typeof x === 'string') : [],
    parts: rawParts.map(p => {
      const part = asRecord(p) ?? {};
      return {
        label: str(part.label),
        awarded: num(part.awarded),
        max: num(part.max),
        errorSummary: typeof part.error_summary === 'string' ? part.error_summary : null,
      };
    }),
    overallComment: str(marking.overall_comment),
    topic: typeof meta.topic_detected === 'string' ? meta.topic_detected : null,
    reviewed: r.triage_reviewed === true,
    override: override
      ? {
          awarded: num(override.awarded),
          previous: num(override.previous),
          note: str(override.note),
          at: str(override.at),
        }
      : null,
  };
}

/** Flagged questions plus the counts the header needs. */
export function extractFlagged(resultJson: unknown): TriageSummary {
  const results = resultsOf(resultJson);
  const flagged: TriageQuestion[] = [];
  for (let i = 0; i < results.length; i++) {
    if (isFlagged(results[i])) flagged.push(toTriageQuestion(results[i], i));
  }
  const { awarded, max } = recomputeTotals(resultJson);
  return {
    flagged,
    totalQuestions: results.length,
    unflaggedCount: results.length - flagged.length,
    awarded,
    max,
  };
}

/**
 * Paper total = sum over results[].marking. Single source of truth: the numbers
 * on the row (`total_awarded`/`total_max`) and `result_json.totals` are both
 * derived from here, never computed independently in a route or a component.
 *
 * GROUNDED runs are the exception on the max side: when the bot grounded the
 * denominator against the official-paper registry or Adrian's "out of ___"
 * (`totals.max_source` of 'registry'/'override', set in bot ai/paper-totals.js),
 * the max did NOT come from summing detected questions — so an Agree/Override
 * here re-sums awarded but must keep that denominator. Re-summing it would put
 * the guess-sum (Eva's /89) right back on a run the bot already corrected to /90.
 */
export function recomputeTotals(resultJson: unknown): { awarded: number; max: number } {
  const counted = resultsOf(resultJson).reduce<{ awarded: number; max: number }>(
    (acc, r) => {
      const marking = asRecord(r.marking) ?? {};
      return { awarded: acc.awarded + num(marking.total_awarded), max: acc.max + num(marking.total_max) };
    },
    { awarded: 0, max: 0 }
  );
  const prior = asRecord(asRecord(resultJson)?.totals);
  if (prior && (prior.max_source === 'registry' || prior.max_source === 'override')) {
    return { awarded: counted.awarded, max: num(prior.max) };
  }
  return counted;
}

function replaceResult(resultJson: unknown, index: number, next: Json): Json {
  const root = asRecord(resultJson) ?? {};
  const results = resultsOf(resultJson);
  const updated = results.map((r, i) => (i === index ? next : r));
  const withResults: Json = { ...root, results: updated };
  // Spread the prior totals first so a grounded run's breadcrumbs (counted_max,
  // max_source) survive the rewrite — recomputeTotals needs them NEXT time too.
  const prior = asRecord(root.totals);
  const totals: Json = { ...(prior ?? {}), ...recomputeTotals(withResults) };
  return { ...withResults, totals };
}

export class TriageIndexError extends Error {}

function requireResult(resultJson: unknown, index: number): Json {
  const results = resultsOf(resultJson);
  const r = results[index];
  if (!r) throw new TriageIndexError(`No question at index ${index} (run has ${results.length})`);
  return r;
}

/**
 * Change the marks on one question. `at` is passed in rather than read from the
 * clock so this stays pure and testable.
 *
 * Clamped to [0, total_max]: the flagged cases include "no question found", where
 * the max is the marker's own allocation, and a typo'd override there would
 * silently skew the paper total and the bleed table.
 */
export function applyOverride(
  resultJson: unknown,
  index: number,
  awarded: number,
  note: string,
  at: string
): Json {
  const r = requireResult(resultJson, index);
  const marking = asRecord(r.marking) ?? {};
  const max = num(marking.total_max);
  const previous = num(marking.total_awarded);
  const clamped = Math.min(Math.max(num(awarded), 0), max);

  const next: Json = {
    ...r,
    marking: { ...marking, total_awarded: clamped },
    triage_reviewed: true,
    triage_reviewed_at: at,
    // Keep the first `previous` across repeated overrides — it's the AI's original
    // mark, and it stops being recoverable the moment a second edit overwrites it.
    triage_override: {
      awarded: clamped,
      previous: asRecord(r.triage_override) ? num(asRecord(r.triage_override)!.previous) : previous,
      note: str(note),
      at,
    },
  };
  return replaceResult(resultJson, index, next);
}

/** Accept the AI's mark as-is; the flag is resolved and the row drops off. */
export function applyAgree(resultJson: unknown, index: number, at: string): Json {
  const r = requireResult(resultJson, index);
  return replaceResult(resultJson, index, { ...r, triage_reviewed: true, triage_reviewed_at: at });
}

/**
 * A run can be released the moment nothing is still awaiting Adrian's eyes.
 * Runs with no flags at all qualify immediately — that's the common case and it
 * should never require opening anything.
 */
export function isReleasable(resultJson: unknown): boolean {
  return resultsOf(resultJson).every(r => !isFlagged(r));
}

/** Count of questions still awaiting review — drives the "N left" chip. */
export function pendingCount(resultJson: unknown): number {
  return resultsOf(resultJson).filter(isFlagged).length;
}

export interface AutoHold {
  hold: boolean;
  reasons: string[];
}

/**
 * Would the bot's auto-release accuracy gates hold this run? Mirror of the bot's
 * `lib/release-gates.js` computeReleaseGates, re-derived from the persisted
 * `result_json` (the bot persists the same signals it gated on in memory) so the
 * triage board can say WHY a hand-in did not go out by itself. Born from Alessi's
 * auto-released 38/66: 15 of 16 parts were marked "no question found" and nothing
 * in the ladder looked (29 Aug 2026).
 *
 * Gates — keep in lockstep with the bot:
 *   U — any unreadable page (real writing, both reads empty; kept with a banner)
 *   E — zero marked questions
 *   Q — half or more of the questions marked without their question
 *   R — reconciliation merged or flagged reads (its `redraws` receipts are
 *       housekeeping and never hold)
 *
 * Display + explanation only on this side: the actual auto-release decision is
 * the bot's, made before the release call ever reaches this API.
 */
export function computeAutoHold(resultJson: unknown): AutoHold {
  const root = asRecord(resultJson) ?? {};
  const reasons: string[] = [];

  const unreadable = Array.isArray(root.unreadable_pages) ? root.unreadable_pages : [];
  if (unreadable.length) {
    reasons.push(`${unreadable.length} page${unreadable.length === 1 ? '' : 's'} could not be read`);
  }

  const results = resultsOf(resultJson);
  if (!results.length) {
    reasons.push('no questions were marked');
  } else {
    const noQ = results.filter(r => r.question_found === false).length;
    if (noQ / results.length >= 0.5) {
      reasons.push(`${noQ}/${results.length} questions marked without their question`);
    }
  }

  const rec = asRecord(root.reconciliation);
  if (rec) {
    const structural =
      (Array.isArray(rec.relabels) ? rec.relabels.length : 0) +
      (Array.isArray(rec.superseded_parts) ? rec.superseded_parts.length : 0) +
      (Array.isArray(rec.superseded_results) ? rec.superseded_results.length : 0);
    const flagged = Array.isArray(rec.notes) ? rec.notes.length : 0;
    if (structural || flagged) {
      reasons.push('reconciliation merged or flagged reads');
    }
  }

  return { hold: reasons.length > 0, reasons };
}
