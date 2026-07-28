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
