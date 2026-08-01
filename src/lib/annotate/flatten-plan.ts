// Which pages get re-encoded on Done and which pass through untouched
// (SPEC-ANNOTATE.md §5): a page with no ink keeps its ORIGINAL Blob URL —
// no generational JPEG loss, no wasted upload.

export type FlattenPage = { photoIndex: number; url: string };
export type FlattenPlanEntry = { photoIndex: number; url: string; reencode: boolean };

export function planFlatten(pages: FlattenPage[], inkedIndexes: number[]): FlattenPlanEntry[] {
  if (!pages.length) throw new Error('planFlatten: no pages — nothing to assemble');
  const known = new Set(pages.map((p) => p.photoIndex));
  for (const idx of inkedIndexes) {
    if (!known.has(idx)) throw new Error(`planFlatten: inked page ${idx} is not in the page list`);
  }
  const inked = new Set(inkedIndexes);
  return [...pages]
    .sort((a, b) => a.photoIndex - b.photoIndex)
    .map((p) => ({ photoIndex: p.photoIndex, url: p.url, reencode: inked.has(p.photoIndex) }));
}
