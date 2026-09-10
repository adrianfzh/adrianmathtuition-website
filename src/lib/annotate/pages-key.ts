// lib/annotate/pages-key.ts — a content key for the overlay's `pages` prop.
//
// 10 Sep 2026 (Adrian, on the iPad: "the annotation page closes by itself after
// scrolling down … and reloads again?"): /admin/mark-paper re-renders every 15 s
// while any sheet is being written (its history poll), and each render handed
// AnnotateOverlay a brand-new `pages` array built by `.map()`. The overlay's
// effects keyed on that array then re-ran — every page's editable layer was
// rebuilt as a fresh blob image on every tick, on a tab Safari already kills
// under memory pressure. The overlay now keys its page-dependent work on THIS
// string, which only changes when a page's identity actually changes.
export type PageLike = {
  photoIndex: number;
  url: string;
  layerUrl?: string | null;
  inkUrl?: string | null;
  originalUrl?: string | null;
  rot?: number | null;
  layer?: unknown;
};

/** Same pages, same key — whatever array holds them. Pure. */
export function pagesSignature(pages: readonly PageLike[] | null | undefined): string {
  return (pages ?? [])
    .map(p => [p.photoIndex, p.url, p.layerUrl ?? '', p.inkUrl ?? '', p.originalUrl ?? '', p.rot ?? 0, p.layer ? 'L' : ''].join('|'))
    .join('\n');
}
