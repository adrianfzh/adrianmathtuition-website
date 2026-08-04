import type { Metadata } from 'next';

// Link-preview (Open Graph) metadata for Next pages.
//
// Every page inherits siteName/locale/images from the root layout; this fills in the
// per-page title, description and generated card image. Keep the card `title` short —
// it is set in ~84px type, so anything past ~40 characters steps down a size.
//
// Static pages under public/tools/*.html are NOT Next routes and cannot use this;
// their tags are injected into the file head by scripts/og-tools.mjs.

export function ogCard(opts: {
  /** Headline drawn on the card image. Short. */
  card: string;
  /** Subline drawn on the card image. One sentence. */
  cardSub: string;
  /** Small uppercase eyebrow on the card image. */
  tag?: string;
  /** Title shown in the chat preview and browser tab context. */
  title: string;
  /** Description shown in the chat preview. */
  description: string;
  /** Path from site root, e.g. '/articles/linear-law-marks'. */
  path: string;
  type?: 'website' | 'article';
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const q = new URLSearchParams({ title: opts.card, sub: opts.cardSub });
  if (opts.tag) q.set('tag', opts.tag);
  const image = `/api/og?${q.toString()}`;

  return {
    openGraph: {
      type: opts.type ?? 'website',
      url: opts.path,
      title: opts.title,
      description: opts.description,
      images: [{ url: image, width: 1200, height: 630, alt: opts.card }],
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images: [image],
    },
  };
}
