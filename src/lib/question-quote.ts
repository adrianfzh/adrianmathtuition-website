// 🔦 A question clip lights the piece of the QUESTION the voice is talking about (Adrian, 31 Oct 2026:
// "why don't we highlight the part (and make it momentarily larger "like jump out") when narrator
// describes the question?"). The beat carries `{ do: 'quote', text }`; the question card splits the
// question around that text. Pure, so the matching rule is tested.

export type QuoteSplit = { before: string; part: string; after: string };

const dollars = (s: string) => (s.match(/(?<!\\)\$/g) || []).length;

/**
 * The question cut around `quote`: exact text first, else the same text with any run of spaces
 * matched loosely. Null when it is not there, or when the cut would split a `$…$` span (the
 * pieces could not be typeset on their own) — the card then shows the question unlit.
 */
export function splitQuote(question: string, quote: string | null | undefined): QuoteSplit | null {
  const q = (quote ?? '').trim();
  if (!question || !q) return null;
  let at = question.indexOf(q);
  let len = q.length;
  if (at < 0) {
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const m = new RegExp(esc).exec(question);
    if (!m) return insideMath(question, q);
    at = m.index; len = m[0].length;
  }
  const before = question.slice(0, at);
  const part = question.slice(at, at + len);
  if (dollars(before) % 2 !== 0 || dollars(part) % 2 !== 0) return insideMath(question, q);
  return { before, part, after: question.slice(at + len) };
}

const count = (s: string, re: RegExp) => (s.match(re) || []).length;
const balanced = (tex: string) =>
  count(tex, /(?<!\\)\{/g) === count(tex, /(?<!\\)\}/g) && count(tex, /\\left\b/g) === count(tex, /\\right\b/g);

/**
 * A quote that is one piece of a longer `$…$` span ("$(1-2x)^n$" inside "$(1-2x)^n = 1 + bx + …$",
 * 5 Nov 2026 — it never lit): the span is cut into its own `$…$` spans around the piece, when the
 * cut falls at a top-level point (braces and \left/\right balanced on every side).
 */
function insideMath(question: string, quote: string): QuoteSplit | null {
  const inner = quote.replace(/^\$/, '').replace(/\$$/, '').trim();
  if (!inner || inner.includes('$')) return null;
  const esc = inner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const re = new RegExp(esc, 'g');
  for (let m = re.exec(question); m; m = re.exec(question)) {
    const at = m.index, end = at + m[0].length;
    const head = question.slice(0, at), tail = question.slice(end);
    if (dollars(head) % 2 !== 1) continue; // not inside a math span
    const open = head.lastIndexOf('$');
    const close = tail.search(/(?<!\\)\$/);
    if (close < 0) continue;
    const pre = head.slice(open + 1), post = tail.slice(0, close);
    if (!balanced(pre) || !balanced(m[0]) || !balanced(post)) continue;
    const before = pre.trim() ? `${head}$` : head.slice(0, open);
    const after = post.trim() ? `$${tail}` : tail.slice(close + 1);
    return { before, part: `$${m[0]}$`, after };
  }
  return null;
}

type BeatLike = { do?: { do: string; text?: unknown }[] };

/**
 * The quote lit on the card for the beat on screen, or null. With `fired` (how many of the beat's
 * actions the voice has reached), it is the LATEST quote already reached — so a beat that reads two
 * pieces of the question lights each at its own words (Adrian, 5 Nov 2026: "when the narrator first
 * explains the question, the relevant parts in the question should be highlighted to follow the
 * narrator's explanation"). Before this, only the beat's first quote ever lit, for the whole beat.
 * Without `fired`, the beat's first quote (the old behaviour, for callers with no clock).
 */
export function quoteOfBeat(beats: BeatLike[] | undefined, step: number, fired?: number): string | null {
  const acts = beats?.[step]?.do ?? [];
  const ok = (x: { do: string; text?: unknown }) => x.do === 'quote' && typeof x.text === 'string' && x.text.trim() !== '';
  if (fired === undefined) {
    const a = acts.find(ok);
    return a ? (a.text as string) : null;
  }
  for (let j = Math.min(fired, acts.length) - 1; j >= 0; j--) if (ok(acts[j])) return acts[j].text as string;
  return null;
}

/**
 * Short enough to jump out without re-flowing the question: about one phone line once the maths is
 * typeset (TeX commands and braces count for little). A longer piece only lights.
 */
export function quoteIsShort(part: string): boolean {
  const shown = part.replace(/\\(left|right|frac|dfrac|tfrac|sqrt|cdot|times)/g, '').replace(/[{}$\\^_]/g, '');
  return shown.length <= 30;
}
