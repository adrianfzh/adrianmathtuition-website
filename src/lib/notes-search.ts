// ── Notes portal: typo- and synonym-tolerant search ──────────────────────────
//
// Pure matching logic behind the /notes sidebar search box (NotesShell.tsx).
// Split out of the component so the matching pipeline is documented and
// unit-tested in one place, and so the component only has to precompute a
// haystack per entry and re-run the (cheap) query side on every keystroke.
//
// Adrian, round 5: search failed on "trigo identitis" (typo) and "min point"
// (synonym for "turning point") even though both concepts are on the site —
// the old matcher was a bare case-insensitive substring check.
//
// Per query word, in this order (cheapest first — this runs on every
// keystroke against ~600 entries, so early-exit matters):
//   (a) substring — the word is a substring of the normalized haystack. This
//       also covers PREFIXES for free: "differentiat" hits "differentiation".
//   (b) synonym   — the word (or a two-word phrase built from it and an
//       adjacent word) is a curated SYNONYMS key; if any of its expansions is
//       a substring of the haystack, the word counts as matched.
//   (c) typo      — Damerau–Levenshtein distance ≤1 (word length ≥5) or ≤2
//       (length ≥9) against an individual haystack TOKEN. Never attempted
//       below length 5 — short words ("sin") must not fuzzy-hit lookalikes
//       ("sign").
// A word matches if ANY stage passes; an ENTRY matches if EVERY query word
// matches — the same AND-across-words contract the old inline `matches` had.

// ── normalize ─────────────────────────────────────────────────────────────

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

/**
 * Lowercase, fold diacritics to their base letter, map superscript digits to
 * plain ones (b² → b2 — so "b²-4ac", "b^2-4ac" and "b2-4ac" all collapse to
 * the same token once punctuation is stripped below), drop everything that
 * isn't a letter/digit/space (punctuation and any remaining math symbols —
 * √ × ÷ ° — just vanish, per spec), then collapse whitespace.
 *
 * Punctuation is DELETED, not replaced with a space, so "b2-4ac" normalizes
 * to the single token "b24ac" rather than two — that's deliberate: it's what
 * lets the discriminant synonym below use one key instead of three
 * spellings. Real whitespace is only ever collapsed, never deleted, so
 * ordinary multi-word labels keep their word boundaries.
 */
export function normalize(s: string): string {
  let out = s.toLowerCase();
  // \p{Mn} = Unicode "Mark, Nonspacing" — every combining accent (Latin,
  // Greek, Vietnamese, …) once NFD has split a letter from its accent.
  out = out.normalize('NFD').replace(/\p{Mn}/gu, ''); // diacritics off
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, ch => SUPERSCRIPT_DIGITS[ch] ?? '');
  out = out.replace(/[^a-z0-9\s]/g, ''); // punctuation + math symbols
  return out.replace(/\s+/g, ' ').trim();
}

// ── synonyms ──────────────────────────────────────────────────────────────

/**
 * Query-term → index-term expansions. Curated, not generated — every entry
 * below is either a genuine abbreviation substring can't reach ('cts' is not
 * a substring of "completing the square") or an alternate term Adrian's
 * students actually type (British/American spelling, "slope" for
 * "gradient"). Checked against real `subgroups.name` / `content_snippets
 * .card_title` text in Supabase (2026-08-28) so each target is a substring of
 * wording that's actually on the page, not a guess.
 *
 * Targets are deliberately word STEMS or root phrases, not necessarily whole
 * dictionary words — 'factoris' (no trailing "e") is a substring of
 * "factorise", "factorising" AND "factorisation" at once; 'turning point'
 * (singular) is a substring of "Turning Points" (plural). That's what makes
 * stage (b) a plain substring check on the target, not another fuzzy pass.
 */
export const SYNONYMS: Record<string, string[]> = {
  // Turning/stationary points: 'min'/'max' name the point by what it IS, not
  // by what the content happens to call it. Both "Turning Point" and
  // "Stationary Point" wording are in real use for the same concept — e.g.
  // "Stationary Points & Nature" carries no "turning point" text at all — so
  // both single-word triggers and the two-word "minimum/maximum point"
  // phrasing expand to both, and neither wording is a dead end.
  min: ['turning point', 'stationary point'],
  max: ['turning point', 'stationary point'],
  'minimum point': ['turning point', 'stationary point'],
  'maximum point': ['turning point', 'stationary point'],
  tp: ['turning point', 'stationary point'],

  // Singapore content always says "gradient", never "slope".
  slope: ['gradient'],

  // b²-4ac / b^2-4ac / b2-4ac all normalize to the one token below.
  b24ac: ['discriminant'],

  cts: ['completing the square'],
  sf: ['significant figures'],

  // The mnemonic, spelled with or without spaces, and each syllable alone.
  soh: ['trigonometry'],
  cah: ['trigonometry'],
  toa: ['trigonometry'],
  sohcahtoa: ['trigonometry'],

  // "lg" (log base 10) shows up in the content itself (log-linearisation
  // cards say "lg/ln transforms") — worth a direct trigger too.
  log: ['logarithm'],
  ln: ['logarithm'],
  lg: ['logarithm'],

  // "diff"/"integrate" are already substring-reachable in most cases, but the
  // VERB forms "differentiate"/"integrate" are NOT substrings of the noun
  // forms "differentiation"/"integration" — they diverge on the suffix —
  // which is the actual gap these two close.
  diff: ['differentiation'],
  differentiate: ['differentiation'],
  integrate: ['integration'],

  // American spelling. factorise/factorising/factorisation are already one
  // substring-reachable stem from each other — only the American 'z' needed
  // its own entry.
  factorize: ['factoris'],

  std: ['standard'],
  eqn: ['equation'],
  eqns: ['equation'],
};

/** SYNONYMS re-keyed by normalized form, with normalized targets — built once
 *  at module load so lookups on the hot path are a plain Map.get(). */
const SYNONYM_INDEX: Map<string, string[]> = new Map(
  Object.entries(SYNONYMS).map(([key, targets]) => [normalize(key), targets.map(normalize)]),
);

// ── typo tolerance ────────────────────────────────────────────────────────

/** Never fuzzy-match below 5 chars; ≤1 edit from length 5, ≤2 from length 9. */
function typoBudget(wordLength: number): number {
  if (wordLength >= 9) return 2;
  if (wordLength >= 5) return 1;
  return 0;
}

/**
 * Damerau–Levenshtein distance, bounded (optimal string alignment:
 * substitution, insertion, deletion, adjacent transposition, each cost 1).
 * Returns whether `a` is within `maxDist` edits of `b`, bailing out as soon
 * as a row's minimum already exceeds `maxDist` — a wildly different pair of
 * words never runs the full O(len(a)·len(b)) table. Three rolling rows, no
 * full grid allocation, since `maxDist` is always ≤2 in this module.
 */
function withinEditDistance(a: string, b: string, maxDist: number): boolean {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > maxDist) return false;
  if (a === b) return true;

  // prev2 = row (i-2), prev1 = row (i-1), curr = row being built (row i).
  let prev2 = new Array<number>(bl + 1).fill(0);
  let prev1 = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1).fill(0);
  for (let j = 0; j <= bl; j++) prev1[j] = j; // row 0: transform "" → b[0..j)

  for (let i = 1; i <= al; i++) {
    curr[0] = i; // transform a[0..i) → ""
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        prev1[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev1[j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, prev2[j - 2] + 1); // adjacent transposition
      }
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return false; // row short-circuit — can't recover
    const rotate = prev2;
    prev2 = prev1;
    prev1 = curr;
    curr = rotate;
  }
  return prev1[bl] <= maxDist;
}

// ── entry matching ────────────────────────────────────────────────────────

/**
 * Does every word in `queryWords` match `hay`? Both must already be
 * normalized: `hay` is `normalize(\`${label} ${context}\`)`, `queryWords` is
 * `normalize(query).split(' ').filter(Boolean)`.
 *
 * Callers should precompute `hay` once per entry — it doesn't change on every
 * keystroke — and only redo the cheap query-side work each time the query
 * changes, so a keystroke over ~600 entries stays a substring scan for the
 * common case and only reaches synonym/typo checks for words that miss.
 */
export function entryMatches(hay: string, queryWords: string[]): boolean {
  if (queryWords.length === 0) return false;
  const hayTokens = hay.split(' ').filter(Boolean);

  const synonymHit = (key: string): boolean => {
    const targets = SYNONYM_INDEX.get(key);
    return targets != null && targets.some(t => hay.includes(t));
  };
  // A two-word synonym key ("minimum point") is checked as the phrase formed
  // with the NEXT query word, from each word's position — so it fires
  // regardless of which of the two words is being evaluated.
  const phraseHit = (leftIndex: number): boolean => {
    if (leftIndex < 0 || leftIndex + 1 >= queryWords.length) return false;
    return synonymHit(`${queryWords[leftIndex]} ${queryWords[leftIndex + 1]}`);
  };

  return queryWords.every((word, i) => {
    if (hay.includes(word)) return true; // (a) substring — cheapest, tried first
    if (synonymHit(word)) return true; // (b) synonym, single word
    if (phraseHit(i - 1) || phraseHit(i)) return true; // (b) synonym, two-word phrase
    const budget = typoBudget(word.length); // (c) typo — last resort
    if (budget === 0) return false;
    return hayTokens.some(tok => withinEditDistance(word, tok, budget));
  });
}
