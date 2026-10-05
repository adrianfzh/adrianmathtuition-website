import type { MetadataRoute } from 'next';
import { publishedSolutions } from '@/data/model-solutions';
import { FORMULA_PAGES, MF_PAGES } from '@/lib/formula-pages';

// The site's sitemap (served at /sitemap.xml). Public, indexable pages only —
// no /admin, no /app, no /kiosk, no tokenized routes. Base matches the
// canonical URLs the pages themselves declare (apex; Vercel 307s to www).
const BASE = 'https://adrianmathtuition.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${BASE}${path}`,
    changeFrequency: 'monthly',
    priority,
  });

  return [
    page('', 1),
    page('/secondary-math-tuition', 0.9),
    page('/o-level-a-math-tuition', 0.9),
    page('/jc-h2-math-tuition', 0.9),
    page('/solutions', 0.8),
    ...publishedSolutions().map(s => page(`/solutions/${s.slug}`, 0.7)),
    page('/revise', 0.6),
    // Revision-deck level indexes — the crawlable entry points to the
    // topic decks (/revise/[level]/[topic]/{worked-examples,recall}).
    ...['am', 'em', 'jc', 's1', 's2'].map(l => page(`/revise/${l}`, 0.6)),
    page('/formulas', 0.6),
    ...MF_PAGES.map(s => page(`/formulas/${s}`, 0.8)),
    ...FORMULA_PAGES.map(p => page(`/formulas/${p.slug}`, 0.5)),
    page('/tools', 0.5),
    page('/terms', 0.2),
  ];
}
