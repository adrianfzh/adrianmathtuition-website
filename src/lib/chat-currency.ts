// The chat page's currency guard: a price's `$` must never pair with a maths `$`.
//
// Why (28 Sep 2026): the web prompt tells the solver to write currency as a
// plain `$` ("Alice paid $400 for $x$ packs … a profit of $1.30"), and the
// chat page paired `$400 for $` as maths — the words between two dollar signs
// came out as run-together italics. Isabelle, one minute later: "the font ure
// hsing is abit weitd i cant see". A sweep of the web chat's answers since
// July found the same in 23 of 1,227 answers (hire purchase, commission, interest,
// tax brackets, the EV charging trip).
//
// Deliberately STRICTER than math-inline's looksLikeMath: that one guards
// marker comments, where prose is the default; in a solver answer maths is the
// default, and the same sweep showed looksLikeMath would un-typeset ratios
// ("$2 : 3$") and long sums ("$5(36) + 4(40) + 2(68) = 476$"). Here a pair is a
// price only when it OPENS with an amount and reads as English after it — or
// runs straight into the next price's digits ("$24 < $32").

/** Stands in for a currency `$` while the chat renderer pairs math spans. */
export const CURRENCY_MARK = '';

// Words that follow a number inside real maths ("$60 mins$") — not English.
const UNIT_WORDS = /^(?:min|mins|sec|secs|hrs|deg|rad|cm|mm|km|kg)$/i;

/** Is the content of a `$…$` pair a price caught up to the next `$`, not TeX? */
export function readsAsPrice(inner: string, nextChar = ''): boolean {
  const amount = inner.match(/^\d(?:[\d,]|\\,)*(?:\.\d+)?/);   // 1,280 · 512\,210 · 1.30
  if (!amount) return false;
  if (/^\d/.test(nextChar)) return true;                     // "$24 < $32"
  const rest = inner.slice(amount[0].length);
  if (/^[a-zA-Z(^_{\\]/.test(rest)) return false;            // 2x, 3(…), 10^n, 5\times — a coefficient
  const words = rest
    .replace(/\\text\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .match(/[A-Za-z]{3,}/g) ?? [];
  // Lower- or mixed-case words only: "ABC" and "OB" are geometry labels.
  return words.some(w => w !== w.toUpperCase() && !UNIT_WORDS.test(w));
}

/**
 * Replace every `$` that opens a PRICE with CURRENCY_MARK, so the chat
 * renderer's `$…$` pairing never reaches it.
 *
 * The scan mirrors the renderer's own pairing (a `$$…$$` block is typeset and
 * stashed first; a single `$` pairs with the next single `$`, past any block).
 * A price `$` is marked and the scan resumes one character later, so
 * "$400 for $x$" still renders the `$x$`. An unpaired `$` is left alone: the
 * renderer never typesets it.
 */
export function markCurrencyDollars(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c !== '$') { out += c; i++; continue; }
    if (text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2);
      if (end < 0) { out += text.slice(i); break; }
      out += text.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    let j = text.indexOf('$', i + 1);
    while (j >= 0 && text[j + 1] === '$') {
      const close = text.indexOf('$$', j + 2);
      j = close < 0 ? -1 : text.indexOf('$', close + 2);
    }
    if (j < 0) { out += c; i++; continue; }
    // Judged as the renderer will see it: any display block already gone.
    const inner = text.slice(i + 1, j).replace(/\$\$[\s\S]*?\$\$/g, ' ');
    if (readsAsPrice(inner, text[j + 1] ?? '')) {
      out += CURRENCY_MARK;
      i++;
      continue;
    }
    out += text.slice(i, j + 1);
    i = j + 1;
  }
  return out;
}
