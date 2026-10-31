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
    if (!m) return null;
    at = m.index; len = m[0].length;
  }
  const before = question.slice(0, at);
  const part = question.slice(at, at + len);
  if (dollars(before) % 2 !== 0 || dollars(part) % 2 !== 0) return null;
  return { before, part, after: question.slice(at + len) };
}

type BeatLike = { do?: { do: string; text?: unknown }[] };

/** The quote the beat on screen carries, or null. */
export function quoteOfBeat(beats: BeatLike[] | undefined, step: number): string | null {
  const a = (beats?.[step]?.do ?? []).find(x => x.do === 'quote');
  return a && typeof a.text === 'string' && a.text.trim() ? a.text : null;
}

/**
 * Short enough to jump out without re-flowing the question: about one phone line once the maths is
 * typeset (TeX commands and braces count for little). A longer piece only lights.
 */
export function quoteIsShort(part: string): boolean {
  const shown = part.replace(/\\(left|right|frac|dfrac|tfrac|sqrt|cdot|times)/g, '').replace(/[{}$\\^_]/g, '');
  return shown.length <= 30;
}
