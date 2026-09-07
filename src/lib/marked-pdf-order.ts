/**
 * Page order for the marked-paper PDF.
 *
 * Adrian marks off the printed PDF, so a transcript sheet has to sit with the
 * photo it belongs to — flipping to the back of a 55-page document to find out
 * why Q7 lost a mark is useless (28 Jul 2026). Each annotated photo is followed
 * immediately by the typeset sheets for the questions found ON that photo.
 *
 * Transcripts whose `photo_index` is missing (older runs, or a question the
 * marker couldn't attribute to a page) can't be placed next to anything, so
 * they land at the end rather than being dropped.
 */

export type PhotoPage<P> = { photo_index: number; item: P };
export type SheetPage<S> = { photo_index: number | null | undefined; label: string; item: S };

export type OrderedPage<P, S> =
  | { kind: 'photo'; item: P }
  | { kind: 'sheet'; item: S };

/** Question labels sort naturally: Q2 before Q10, 3a before 3b. */
function byLabel(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { numeric: true });
}

export function orderMarkedPages<P, S>(
  photos: PhotoPage<P>[],
  sheets: SheetPage<S>[],
): OrderedPage<P, S>[] {
  const byPhoto = new Map<number, SheetPage<S>[]>();
  const orphans: SheetPage<S>[] = [];
  for (const s of sheets) {
    if (typeof s.photo_index === 'number') {
      const bucket = byPhoto.get(s.photo_index);
      if (bucket) bucket.push(s); else byPhoto.set(s.photo_index, [s]);
    } else {
      orphans.push(s);
    }
  }

  const out: OrderedPage<P, S>[] = [];
  const placed = new Set<number>();
  for (const p of photos.slice().sort((a, b) => a.photo_index - b.photo_index)) {
    out.push({ kind: 'photo', item: p.item });
    placed.add(p.photo_index);
    for (const s of (byPhoto.get(p.photo_index) || []).sort(byLabel)) {
      out.push({ kind: 'sheet', item: s.item });
    }
  }

  // Sheets pointing at a photo we never got (annotation failed, or photos-only
  // mode) still belong in the document — after the photos, in question order.
  const stranded = [...byPhoto.entries()]
    .filter(([i]) => !placed.has(i))
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, list]) => list.sort(byLabel));
  for (const s of [...stranded, ...orphans.sort(byLabel)]) {
    out.push({ kind: 'sheet', item: s.item });
  }
  return out;
}

/**
 * The paper's OWN cover page(s) — the printed MOE/school front sheet with the
 * candidate's name — go first, before the "Where your marks went" page (Adrian,
 * 6 Sep 2026: "cover page is the first page"). The bot's page classification
 * tags them `kind: 'cover'`; anything else (student work, question pages, an
 * answer key) keeps its place. Order preserved; missing or malformed input → [].
 */
export type AnnotatedPhotoLike = {
  photo_index: number;
  /** Does any marked question sit on this page? (from results[].photo_index — the
   *  annotated_photos rows of a Mac hand-back carry no attempts at all) */
  hasWork?: boolean | null;
  attempts?: unknown[] | null;
  unreadable?: boolean | null;
};

/** The per-page facts the fallback needs, from a run's result_json. Pure. */
export function frontMatterPages(rj: { results?: unknown; annotated_photos?: unknown } | null | undefined): AnnotatedPhotoLike[] {
  const photos = Array.isArray(rj?.annotated_photos) ? rj!.annotated_photos as Array<{ photo_index?: unknown; unreadable?: unknown; attempts?: unknown }> : [];
  const worked = new Set<number>();
  for (const q of Array.isArray(rj?.results) ? rj!.results as Array<{ photo_index?: unknown }> : []) {
    if (typeof q?.photo_index === 'number') worked.add(q.photo_index);
  }
  return photos
    .filter(p => typeof p?.photo_index === 'number')
    .map(p => ({
      photo_index: p.photo_index as number,
      hasWork: worked.has(p.photo_index as number) || (Array.isArray(p.attempts) && p.attempts.length > 0),
      unreadable: p.unreadable === true,
    }));
}

/** How many leading no-work pages may count as the paper's front matter without a classification. */
export const FRONT_MATTER_MAX = 3;

/**
 * The photos that open the PDF, before the "Where your marks went" page.
 *
 * Preferred: the classification pre-pass's `kind: 'cover'` pages. Fallback (7 Sep
 * 2026 — Gavin's paper was marked on the Mac, whose hand-back carries no
 * classification, so the cover slid behind the analysis page): the LEADING run
 * of photos with no attempts and not flagged unreadable — the printed cover,
 * instructions and formula sheet — capped at FRONT_MATTER_MAX, and only when a
 * later photo does carry attempts (a paper that is all blanks has no "cover").
 */
export function coverPhotoIndexes(classification: unknown, annotated?: AnnotatedPhotoLike[] | null): number[] {
  const out: number[] = [];
  if (Array.isArray(classification)) {
    for (const p of classification) {
      if (!p || typeof p !== 'object') continue;
      const { photo_index, kind } = p as { photo_index?: unknown; kind?: unknown };
      if (kind === 'cover' && typeof photo_index === 'number' && Number.isInteger(photo_index) && photo_index >= 0) out.push(photo_index);
    }
  }
  if (out.length || !Array.isArray(annotated) || !annotated.length) return [...new Set(out)].sort((a, b) => a - b);

  const sorted = [...annotated].filter(a => a && Number.isInteger(a.photo_index)).sort((a, b) => a.photo_index - b.photo_index);
  const hasWork = (a: AnnotatedPhotoLike) => a.hasWork === true || (Array.isArray(a.attempts) && a.attempts.length > 0);
  if (!sorted.some(hasWork)) return [];
  const front: number[] = [];
  for (const a of sorted) {
    if (hasWork(a) || a.unreadable || front.length >= FRONT_MATTER_MAX) break;
    front.push(a.photo_index);
  }
  return front;
}
