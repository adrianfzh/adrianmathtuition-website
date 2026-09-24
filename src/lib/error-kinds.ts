// Error kinds — the fixed vocabulary for WHY a mark was lost.
//
// Adrian, 3 Sep 2026: "labelling errors like arithmetic errors … beside the
// crosses … okay then build it". The bot's marker labels every wrong line with
// one of these codes and draws the word in red beside the cross; the cover page
// adds them up (this module); and Adrian's Override on the desk records the
// kind HE saw (`triage_override.error_kind`), which is the ground truth the
// marker's labels are calibrated against.
//
// The eight codes are a CONTRACT shared with the bot (ai/paper-marker.js).
// Never add, rename or reorder one here without changing it there the same
// day. Anything that is not one of the eight is UNLABELLED, never a kind:
// older runs carry a free-text `lines[].error_type` ("ratio_inversion",
// "wrong_setup", …) from before the vocabulary was fixed, and a cover that
// read those as kinds would print nonsense at a student.
//
// Where a run keeps them (`paper_marking_runs.result_json`):
//   results[].marking_output.parts[].error_kind  — the kind that cost that
//                                                  part's marks; null at full marks
//   results[].marking_output.lines[].error_type  — per wrong line, same codes
//   results[].triage_override.error_kind         — Adrian's own reading
// Marks lost on a part = parts[].max − parts[].awarded.

type Json = Record<string, unknown>;
const asRecord = (v: unknown): Json | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;

export const ERROR_KINDS = [
  'concept', 'arithmetic', 'transfer', 'sign', 'rounding', 'units', 'misread', 'incomplete',
  // careless — the ninth code (5 Sep 2026, Adrian: "this is very common"): a
  // mechanical slip inside a method the student clearly knows that is none of the
  // five specific slips (dropped term, lost factor, wrong coefficient in the same
  // line). Appended, so stored codes and rollups keyed on the first eight still read.
  'careless',
  // keywords — the tenth code (24 Sep 2026, the chemistry study loop): SCIENCE
  // ONLY. The right idea in words that miss the scheme's required term or phrase
  // ("it goes cloudy" for "a white precipitate forms"). The marker quotes the
  // scheme's phrase beside the student's own in `scheme_words` on the part; the
  // Notebook files it as "wrong keywords". Never on a maths paper. Appended.
  'keywords',
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export function isErrorKind(x: unknown): x is ErrorKind {
  return typeof x === 'string' && (ERROR_KINDS as readonly string[]).includes(x);
}

/**
 * The word a STUDENT reads on the cover page — lower-case, as it sits inside a
 * sentence. Student vocabulary, not the marker's: "transfer" means nothing to
 * a sixteen-year-old, "copied wrongly" does.
 */
export const ERROR_KIND_LABEL: Record<ErrorKind, string> = {
  concept: 'concept',
  arithmetic: 'arithmetic',
  transfer: 'copied wrongly',
  sign: 'sign',
  rounding: 'rounding',
  units: 'units',
  misread: 'misread',
  incomplete: 'incomplete',
  careless: 'careless',
  keywords: 'wording',
};

/** What each code means — the hint beside it in the desk's Override select. */
export const ERROR_KIND_HINT: Record<ErrorKind, string> = {
  concept: 'wrong method or misunderstanding',
  arithmetic: 'slip inside a correct method',
  transfer: 'copied own value wrongly / carried across parts',
  sign: 'sign error',
  rounding: 'rounded early, or wrong s.f. / d.p.',
  units: 'missing or wrong units',
  misread: 'answered a different question / missed a condition',
  incomplete: 'stopped short, or not attempted',
  careless: 'a slip in a step they know how to do — dropped term, lost factor',
  keywords: "the right idea in words that miss the scheme's term (science only)",
};

/**
 * The three buckets. Careless = the method was right and a slip cost the mark;
 * concept-side = the method was not right; incomplete stands on its own,
 * because "did not finish" says nothing about whether they could have.
 */
export const CARELESS_KINDS: readonly ErrorKind[] = ['arithmetic', 'transfer', 'sign', 'rounding', 'units', 'careless'];
export const CONCEPT_KINDS: readonly ErrorKind[] = ['concept', 'misread'];

export type ErrorKindTotals = {
  byKind: Record<ErrorKind, number>;
  careless: number;
  concept: number;
  incomplete: number;
  /** Marks lost on parts with no valid kind — older runs, or a part the marker left untagged. */
  unlabelled: number;
  /** Every mark lost on the run, labelled or not. */
  lostTotal: number;
};

export function emptyErrorKindTotals(): ErrorKindTotals {
  const byKind = Object.fromEntries(ERROR_KINDS.map(k => [k, 0])) as Record<ErrorKind, number>;
  return { byKind, careless: 0, concept: 0, incomplete: 0, unlabelled: 0, lostTotal: 0 };
}

/**
 * Marks lost on a run, attributed by `parts[].error_kind`.
 *
 * Takes `result_json.results` (the array) and nothing else. A part with marks
 * lost and no valid kind counts as `unlabelled` — never guessed, never dropped,
 * so the buckets plus `unlabelled` always add back up to `lostTotal`. Parts
 * with a missing or non-numeric max/awarded are skipped: they cannot have lost
 * a countable mark. Reads `marking_output.parts` (the contract) and falls back
 * to the back-compat `marking.parts` copy only when the former is absent.
 *
 * ROWS AND PARTS THE ALLOCATION AUDIT ADDED DO NOT COUNT (14 Sep 2026). The bot
 * invents an `added_by_audit` row or part, awarded 0, for every mark the marker
 * could not find on any page — a shortfall flag for Adrian's desk, not work the
 * student got wrong. Counting them made the cover's kinds row report marks lost
 * to nothing at all: Alexis Wong's A Math GCE 2022 Paper 1 carried nine such
 * rows worth 32 marks, every one of them `unlabelled`. They stay out of the
 * paper's total for the same reason.
 */
export function errorKindTotals(results: unknown): ErrorKindTotals {
  const t = emptyErrorKindTotals();
  if (!Array.isArray(results)) return t;
  for (const raw of results) {
    const q = asRecord(raw);
    if (!q || q.added_by_audit) continue;
    const mo = asRecord(q.marking_output);
    const parts = Array.isArray(mo?.parts) ? mo.parts
      : Array.isArray(asRecord(q.marking)?.parts) ? (asRecord(q.marking)!.parts as unknown[]) : [];
    for (const p of parts) {
      const part = asRecord(p);
      if (!part || part.added_by_audit) continue;
      const mx = Number(part.max), aw = Number(part.awarded);
      if (!Number.isFinite(mx) || !Number.isFinite(aw)) continue;
      const lost = mx - aw;
      if (lost <= 0) continue;
      t.lostTotal += lost;
      const kind = reconcileKind(part.error_kind, part.error_summary);
      if (kind) t.byKind[kind] += lost;
      else t.unlabelled += lost;
    }
  }
  t.careless = CARELESS_KINDS.reduce((s, k) => s + t.byKind[k], 0);
  t.concept = CONCEPT_KINDS.reduce((s, k) => s + t.byKind[k], 0);
  t.incomplete = t.byKind.incomplete;
  return t;
}

/** True when at least one lost mark carries a kind — the cover row's show/hide switch. */
export function hasLabelledLoss(t: ErrorKindTotals | null | undefined): boolean {
  return !!t && t.lostTotal - t.unlabelled > 0;
}

/**
 * A `misread` whose sentence says the printed question was COPIED wrongly is a
 * copy slip, not a reading of the wrong question (Adrian, 10 Sep 2026 —
 * Isabelle's AM 2024 P1 Q8(b): the marker wrote "copied V wrongly" and filed it
 * as `misread`, so the sheet opened by teaching a stationary-point method she
 * already had). Read the kind against its own summary: such a `misread` comes
 * back as `transfer` (the careless bucket, "copied wrongly" on the cover); every
 * other valid kind comes back as it came; anything else is null. The bot's
 * marker applies the same regex when it writes the part (lib/error-kinds.js);
 * this is the read-side twin for runs marked before it.
 */
export const COPIED_WRONGLY_RE = /\b(copied|copying|copy|miscopied|miscopy|transcribed)\b[^.]{0,60}\b(wrong|wrongly|incorrect|incorrectly)\b|\bmiscop|\bcopy(ing)? (error|slip)\b/i;

export function reconcileKind(kind: unknown, summary: unknown): ErrorKind | null {
  if (!isErrorKind(kind)) return null;
  if (kind === 'misread' && typeof summary === 'string' && COPIED_WRONGLY_RE.test(summary)) return 'transfer';
  return kind;
}
