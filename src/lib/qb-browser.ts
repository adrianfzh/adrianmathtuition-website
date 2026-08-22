// Pure helpers for the admin Question Bank browser (/admin/questions).
// Kept out of the route per the testing policy — question ordering inside a
// reconstructed paper is exactly the kind of quiet logic that misfiles Q10
// before Q2 if left to lexicographic sort.

/**
 * Natural sort key for exam question numbers: "2" < "10", "12a" < "12b",
 * "3(b)" after "3(a)", bare number before its lettered parts. Non-numeric
 * numbers ("A1", "?") sort after everything numeric, alphabetically.
 */
export function qnumSortKey(qnum: string | null | undefined): [number, string] {
  const s = String(qnum ?? '').trim();
  const m = s.match(/^(\d+)(.*)$/);
  if (!m) return [Number.MAX_SAFE_INTEGER, s.toLowerCase()];
  return [parseInt(m[1], 10), m[2].trim().toLowerCase()];
}

export function compareQnum(a: string | null | undefined, b: string | null | undefined): number {
  const [na, sa] = qnumSortKey(a);
  const [nb, sb] = qnumSortKey(b);
  if (na !== nb) return na - nb;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * One-line card excerpt: LaTeX spans kept intact (the client renders them),
 * whitespace collapsed, sliced on a word boundary near `len`.
 */
export function excerptText(md: string | null | undefined, len = 220): string {
  const t = String(md ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= len) return t;
  const cut = t.slice(0, len);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > len * 0.6 ? lastSpace : len)}…`;
}

/** Search terms: whitespace-split, de-duplicated, capped, ILIKE-escaped. */
export function searchTerms(q: string | null | undefined, max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(q ?? '').split(/\s+/)) {
    const t = raw.trim().replace(/[%_,()]/g, '');
    if (t.length < 2 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
