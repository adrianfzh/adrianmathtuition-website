// Inline $…$ TeX → KaTeX HTML for marker comments (mark-paper results panel).
//
// The marker writes feedback with inline TeX ("$\overrightarrow{SQ}=\tfrac{5}{3}…$"),
// which the web panel used to show RAW (Adrian, 2 Aug 2026: "rendering issues when
// page shows after marking completes"). The trap: comments also use $ as CURRENCY
// ("a set meal at $96 … the à-la-carte at $x") — a naive $…$ split would typeset the
// prose between two prices as garbage math. So a span only renders as math when it
// LOOKS like math; anything prose-like stays literal text.
//
// Second trap (2026-08-28): TWO prices in one string pair with each other, and short
// price comparisons slip past the prose guards — "$24 < $32" typeset as the math
// "24<" and KaTeX doesn't throw on prose, it italicises it ("$481.90 > local $479.40"
// → squished "481.90>local"). Live sweep found 119 such spans across marker comments,
// notebook entries, QB answers and /notes sub-group descriptions. Two guards fix it:
// the price-collision check in mathHtml (digit hard against BOTH sides of a $ pairing)
// and the ≥2-function-words rule in looksLikeMath. Both were validated against every
// mathHtml-rendered DB field — zero legit TeX spans flipped ("$1 = $ JPY $114.5$",
// "RM$3000$", "$5 < 15 = $ radius$^2$" all still render).

import katex from 'katex';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Two+ of these in a span = a sentence caught between two prices, not TeX
// ("8.50/2 and y baskets at "). Lowercase on purpose: uppercase runs are
// geometry labels ("$OF = OF$", "$= (AT + TB)(AT)$") and must stay math.
const PROSE_WORDS =
  /\b(?:an|and|at|by|each|for|from|has|have|if|in|is|it|no|of|on|or|per|so|than|that|the|then|to|was|were|with)\b/g;

/** Heuristic: is the content between two $ signs TeX, or prose caught between prices? */
export function looksLikeMath(c: string): boolean {
  if (/[\\^_{}]/.test(c)) return true;                                  // TeX commands/structure
  if ((c.match(PROSE_WORDS) ?? []).length >= 2) return false;           // sentence, not equation
  if (c.length <= 40 && /[=+*/<>≤≥]/.test(c) && !/[.;] /.test(c)) return true;  // short equation
  if (c.length <= 12 && !/\s/.test(c)) return true;                     // bare symbol/number run
  // Numeric coordinates/tuples — "(1, 6)", "(-1.5, 2)". Anchored to the parens
  // so a numeric span between two prices ("$5, $6") never matches.
  if (/^\(\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)+\s*\)$/.test(c)) return true;
  // Symbolic coordinates — "(-2a, a)", "(√5 a, 0)" — kept in step with the
  // bot's pen-math (Denise's Q9(c) note, 8 Sep 2026). No 2+-letter word, so
  // "(see, above)" stays prose.
  if (c.length <= 32 && !/[a-zA-Z]{2,}/.test(c) &&
      /^\(\s*[-+−]?[\w√.]+(\s*[-+−]?\s*[\w√.]+)*(\s*,\s*[-+−]?[\w√.]+(\s*[-+−]?\s*[\w√.]+)*)+\s*\)$/.test(c.trim())) return true;
  // Bare numeric lists — "$2, 3$" in a study note (Kayla's P2 script printed the
  // raw dollars, 2026-08-29). A digit is REQUIRED after every comma, so the
  // "5, " caught between two prices ("$5, $6") still reads as prose.
  if (/^-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)+$/.test(c.trim())) return true;
  // Short symbol runs with a SPACED minus — "$e - 2$", "$20 - 11.472$" (same
  // leak). The operator rule above deliberately omits `-` (hyphens live in
  // prose), so these need their own gate: no 2+-letter word anywhere, and real
  // content after every minus, so the "5 - " between "$5 - $10" stays literal.
  if (c.length <= 24 && !/[a-zA-Z]{2,}/.test(c) &&
      /^[\w().^]+(\s*[−–-]\s*[\w().^]+)+$/.test(c.trim())) return true;
  // Signed arithmetic — "$-2 - (-5)$", "$-4 - 1$", "$-2 + 5$": a leading minus or a
  // bracketed negative term (10 Sep 2026, Isabelle's EM 2025 P2 Q8(b)(ii) note;
  // twin of the bot's ai/pen-math.js rule). No 2+-letter word, content after
  // every operator.
  if (c.length <= 24 && !/[a-zA-Z]{2,}/.test(c) &&
      /^[−–-]?[\w√.^]+(\s*[−–+±-]\s*(?:\([−–-]?[\w√.^]+\)|[−–-]?[\w√.^]+))+$/.test(c.trim())) return true;
  return false;
}

// `\$` is a literal dollar sign (TeX-authored currency — "S\$75") and must
// never open or close a math span. Masked out of the pairing scan, restored
// afterwards: as "\$" inside math (KaTeX renders it as $), as plain "$" in prose.
const ESCAPED_DOLLAR = '\u0000';

/**
 * Singapore school notation writes parallel as // (Adrian, 6 and 11 Sep 2026:
 * "make the red pen use // for parallel"). KaTeX would draw \parallel as ∥,
 * so the macro rewrites it to a tight double slash, and a literal ∥ in prose
 * or maths becomes // before anything is rendered.
 */
export const KATEX_MACROS: Record<string, string> = { '\\parallel': '/\\!/' };
const PARALLEL_GLYPH = /\u2225/g;

/** Render a comment string to safe HTML: math spans via KaTeX, the rest escaped. */
export function mathHtml(s: string): string {
  const parts = s.replace(PARALLEL_GLYPH, '//').replace(/\\\$/g, ESCAPED_DOLLAR).split(/(\$[^$\n]+\$)/g);
  return parts
    .map((part, i) => {
      if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
        const inner = part.slice(1, -1).replaceAll(ESCAPED_DOLLAR, '\\$');
        // Two prices colliding, not a span: in "… $420 = $52.50 …" the closing $
        // is really the NEXT price's own dollar sign. A price's $ always touches
        // its digits, so digit-open + digit right after the closing $ decides it;
        // authored TeX never runs a bare digit into its closing $ from outside
        // ("$1 = $ JPY", "RM$3000$."). This also catches inners that pass the
        // TeX-structure test by luck ("$258.25; (ci) 1.22 × 10^10; (cii) $180").
        const priceCollision = /^\d/.test(inner) && /^\d/.test(parts[i + 1] ?? '');
        if (!priceCollision && looksLikeMath(inner)) {
          try {
            return katex.renderToString(inner, { throwOnError: false, output: 'html', macros: { ...KATEX_MACROS } });
          } catch { /* fall through — show the literal text */ }
        }
      }
      return escapeHtml(part.replaceAll(ESCAPED_DOLLAR, '$'));
    })
    .join('');
}
