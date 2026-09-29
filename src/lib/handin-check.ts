// What a hand-in's pre-flight found, and what the student answered — the record on
// the run (SPEC-HANDIN-COMPLETENESS ⑤, built 29 Sep 2026). Pure.
//
// result_json.handin_check = {
//   checked_at, list: 'printed-paper' | 'bank' | 'none', key,   // what we compared against
//   asked:   [{q, part?}],   // what the check found the first time (the student saw this)
//   missing: [{q, part?}],   // what was still missing at the final send
//   answer:  'not-done' | 'added' | 'sent-anyway' | null,
// }
// The desk reads it: 'sent-anyway' with anything missing is a ⚠️ watch-out, never a hold.

export type HandinMissing = { q: number; part?: string };
export type HandinAnswer = 'not-done' | 'added' | 'sent-anyway' | null;

/** A missing-list from the client or the bot → only well-formed entries, capped. */
export function cleanMissing(x: unknown): HandinMissing[] {
  if (!Array.isArray(x)) return [];
  const out: HandinMissing[] = [];
  for (const m of x.slice(0, 60)) {
    const q = Number((m as { q?: unknown })?.q);
    if (!Number.isInteger(q) || q < 1 || q > 99) continue;
    const part = (m as { part?: unknown })?.part;
    out.push(typeof part === 'string' && /^[a-h]$/.test(part) ? { q, part } : { q });
  }
  return out;
}

const LISTS = new Set(['printed-paper', 'bank', 'none']);

/**
 * The stamp for this send.
 *  - preflight: the bot's reply when the check ran on THIS request (null when the
 *    student confirmed, which skips it).
 *  - check: what the client echoes back from the check it was shown — { asked, list, key }.
 *  - answer: the button the student pressed ('not-done' | 'sent-anyway'); on a plain
 *    re-send after being asked, the answer is 'added' (they went back for pages).
 * Returns null when there is nothing to record (no check ran and none was shown).
 */
export function handinCheckStamp(input: {
  at: string;
  preflight?: { list?: unknown; key?: unknown; missing?: unknown } | null;
  check?: { asked?: unknown; list?: unknown; key?: unknown } | null;
  answer?: unknown;
}): Record<string, unknown> | null {
  const asked = cleanMissing(input.check?.asked);
  const pre = input.preflight ?? null;
  if (!pre && !asked.length) return null;
  const listRaw = (pre?.list ?? input.check?.list) as unknown;
  const list = typeof listRaw === 'string' && LISTS.has(listRaw) ? listRaw : 'none';
  const keyRaw = (pre?.key ?? input.check?.key) as unknown;
  const key = typeof keyRaw === 'string' ? keyRaw.slice(0, 80) : null;
  let answer: HandinAnswer = null;
  let missing: HandinMissing[];
  if (pre) {
    missing = cleanMissing(pre.missing);
    if (asked.length) answer = 'added';            // asked before, came back with more pages
  } else {
    missing = asked;
    answer = input.answer === 'not-done' ? 'not-done' : 'sent-anyway';
  }
  return { checked_at: input.at, list, key, asked, missing, answer };
}

/** The desk's one line, or null: missing at hand-in and sent anyway / said not done. */
export function handinCheckLine(stamp: unknown): string | null {
  const s = stamp as { missing?: unknown; answer?: unknown } | null;
  const missing = cleanMissing(s?.missing);
  if (!missing.length) return null;
  const refs = missing.slice(0, 8).map((m) => (m.part ? `Q${m.q}(${m.part})` : `Q${m.q}`)).join(', ') + (missing.length > 8 ? '…' : '');
  if (s?.answer === 'not-done') return `✋ Student said not done: ${refs}`;
  return `⚠️ Missing at hand-in, sent anyway: ${refs}`;
}
