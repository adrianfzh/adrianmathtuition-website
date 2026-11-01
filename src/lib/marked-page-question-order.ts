/**
 * The marked copy's pages in QUESTION order, not photo order (Adrian, 1 Nov 2026:
 * "apparently the PDFs are not arranged correctly" — a 35-photo upload, shuffled,
 * came back Q6, Q1, Q5(iii), Q4(iii)… because the marked PDF followed photo_index).
 *
 * Sorted AFTER marking, from the marker's own results: every page with working
 * carries a question number and part labels there, including the pages whose
 * printed label is only "(ii)" (the pre-marking page labels cannot place those —
 * that is why bot lib/page-order.js only runs when pages are added). Nothing about
 * the marking changes; only the order the pages are stapled in. Pure.
 *
 * The rules, conservative — a wrong re-order is worse than none:
 *   • A page's key is the SMALLEST question/part marked on it (a page that ends Q5
 *     and starts Q6 belongs with Q5).
 *   • A page with no marked work (a continuation sheet, a blank) rides with the
 *     page before it in photo order — it is that page's overflow. No-work pages
 *     before the first marked page (a cover, instructions) stay at the front.
 *   • Ties keep photo order.
 *   • Fewer than half the pages marked → photo order, unchanged.
 */

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

type Key = [number, number, number, number];

/** "7(b)(ii)" → [7, 2, 2, 0]; "4(iii)(a)" → [4, 0, 3, 1]; "Q3" → [3, 0, 0, 0]; "(c)" → null. */
export function questionKey(label: string): Key | null {
  const s = String(label ?? '').trim().toLowerCase().replace(/^q(uestion)?\s*/, '');
  const m = s.match(/^(\d+)\s*(.*)$/);
  if (!m) return null;
  const q = parseInt(m[1], 10);
  const toks = (m[2].match(/\(([^)]+)\)|\b([a-z]{1,4})\b/g) || []).map(t => t.replace(/[()]/g, '').trim());
  let part = 0, sub = 0, tail = 0;
  for (const t of toks) {
    if (!part && !sub && /^[a-h]$/.test(t)) { part = t.charCodeAt(0) - 96; continue; }
    if (!sub && ROMAN[t]) { sub = ROMAN[t]; continue; }
    if (/^[a-z]$/.test(t) && !tail) tail = t.charCodeAt(0) - 96;   // (iii)(a), (a)(i)(A)
  }
  return [q, part, sub, tail];
}

function cmp(a: Key, b: Key): number {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

type ResultLike = {
  photo_index?: unknown;
  question_number?: unknown;
  marking_output?: { parts?: Array<{ label?: unknown }> | null } | null;
  marking?: { parts?: Array<{ label?: unknown }> | null } | null;
};

/** The smallest question/part each page carries, from a run's results. */
export function pageKeys(results: unknown): Map<number, Key> {
  const out = new Map<number, Key>();
  for (const r of Array.isArray(results) ? (results as ResultLike[]) : []) {
    if (typeof r?.photo_index !== 'number' || r.question_number == null) continue;
    const qn = String(r.question_number).trim();
    const parts = (r.marking_output?.parts ?? r.marking?.parts ?? []) as Array<{ label?: unknown }>;
    const labels = parts.map(p => String(p?.label ?? '').trim()).filter(Boolean)
      .map(l => (/^\d/.test(l) ? l : `${qn}${l}`));
    for (const l of labels.length ? labels : [qn]) {
      const k = questionKey(l) ?? questionKey(qn);
      if (!k) continue;
      const have = out.get(r.photo_index);
      if (!have || cmp(k, have) < 0) out.set(r.photo_index, k);
    }
  }
  return out;
}

/**
 * The photo indexes in the order the marked copy should show them. `photoIndexes`
 * are the body pages (covers are placed separately by the callers); `results` is
 * the run's result_json.results.
 */
export function questionPageOrder(photoIndexes: number[], results: unknown): number[] {
  const inPhotoOrder = [...new Set(photoIndexes)].sort((a, b) => a - b);
  if (inPhotoOrder.length < 2) return inPhotoOrder;
  const keys = pageKeys(results);
  const keyed = inPhotoOrder.filter(i => keys.has(i));
  if (!keyed.length || keyed.length * 2 < inPhotoOrder.length) return inPhotoOrder;

  let last: Key = [-1, 0, 0, 0];                     // front matter stays first
  const withKey = inPhotoOrder.map((i, pos) => {
    const k = keys.get(i);
    if (k) last = k;
    return { i, pos, key: k ?? last };
  });
  withKey.sort((a, b) => cmp(a.key, b.key) || a.pos - b.pos);
  return withKey.map(x => x.i);
}

/** A rank per photo_index for a sort comparator (unknown pages go last, in photo order). */
export function questionPageRank(photoIndexes: number[], results: unknown): (photoIndex: number) => number {
  const order = questionPageOrder(photoIndexes, results);
  const rank = new Map(order.map((p, r) => [p, r]));
  return (p: number) => rank.get(p) ?? order.length + p;
}
