import type { MetadataRoute } from 'next';
import { publishedSolutions } from '@/data/model-solutions';

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
    ...FORMULA_SLUGS.map(s => page(`/formulas/${s}`, 0.5)),
    page('/tools', 0.5),
    page('/terms', 0.2),
  ];
}

// Static formula reference pages — one dir each under src/app/formulas/.
// Keep in sync when a formulas page is added (they are answer-shaped topic
// pages, exactly what search + AI crawlers cite).
const FORMULA_SLUGS = [
  'coordinate-geometry', 'differentiation', 'em-circular-measure',
  'em-congruency-similarity', 'em-coordinate-geometry', 'em-indices',
  'em-interest', 'em-mensuration', 'em-polygons', 'em-sets',
  'em-standard-form', 'em-statistics', 'em-trigonometry', 'em-vectors',
  'exponential-log-graphs', 'factorization-cubics', 'indices',
  'jc-complex', 'jc-differentiation', 'jc-functions', 'jc-graphing',
  'jc-integration', 'jc-sequences', 'jc-vectors', 'logarithms',
  'partial-fractions', 'trigo',
];
