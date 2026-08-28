// Inline $…$ TeX → KaTeX HTML for marker comments (mark-paper results panel).
//
// The marker writes feedback with inline TeX ("$\overrightarrow{SQ}=\tfrac{5}{3}…$"),
// which the web panel used to show RAW (Adrian, 2 Aug 2026: "rendering issues when
// page shows after marking completes"). The trap: comments also use $ as CURRENCY
// ("a set meal at $96 … the à-la-carte at $x") — a naive $…$ split would typeset the
// prose between two prices as garbage math. So a span only renders as math when it
// LOOKS like math; anything prose-like stays literal text.

import katex from 'katex';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Heuristic: is the content between two $ signs TeX, or prose caught between prices? */
export function looksLikeMath(c: string): boolean {
  if (/[\\^_{}]/.test(c)) return true;                                  // TeX commands/structure
  if (c.length <= 40 && /[=+*/<>≤≥]/.test(c) && !/[.;] /.test(c)) return true;  // short equation
  if (c.length <= 12 && !/\s/.test(c)) return true;                     // bare symbol/number run
  // Numeric coordinates/tuples — "(1, 6)", "(-1.5, 2)". Anchored to the parens
  // so a numeric span between two prices ("$5, $6") never matches.
  if (/^\(\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)+\s*\)$/.test(c)) return true;
  return false;
}

// `\$` is a literal dollar sign (TeX-authored currency — "S\$75") and must
// never open or close a math span. Masked out of the pairing scan, restored
// afterwards: as "\$" inside math (KaTeX renders it as $), as plain "$" in prose.
const ESCAPED_DOLLAR = '\u0000';

/** Render a comment string to safe HTML: math spans via KaTeX, the rest escaped. */
export function mathHtml(s: string): string {
  return s
    .replace(/\\\$/g, ESCAPED_DOLLAR)
    .split(/(\$[^$\n]+\$)/g)
    .map((part) => {
      if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
        const inner = part.slice(1, -1).replaceAll(ESCAPED_DOLLAR, '\\$');
        if (looksLikeMath(inner)) {
          try {
            return katex.renderToString(inner, { throwOnError: false, output: 'html' });
          } catch { /* fall through — show the literal text */ }
        }
      }
      return escapeHtml(part.replaceAll(ESCAPED_DOLLAR, '$'));
    })
    .join('');
}
