// The public /formulas pages, one place: the /formulas index, each topic page's
// <title>/description (src/app/formulas/<slug>/layout.tsx — the topic pages are client
// components and cannot export metadata themselves) and the sitemap read this list.
// Add a row when a formulas page is added.

export type FormulaLevel = 'A-Level H2 Maths' | 'O-Level A Math' | 'O-Level E Math';

export type FormulaPage = { slug: string; title: string; level: FormulaLevel };

export const FORMULA_PAGES: FormulaPage[] = [
  { slug: 'jc-functions', title: 'Functions', level: 'A-Level H2 Maths' },
  { slug: 'jc-graphing', title: 'Graphing Techniques', level: 'A-Level H2 Maths' },
  { slug: 'jc-sequences', title: 'Sequences & Series', level: 'A-Level H2 Maths' },
  { slug: 'jc-vectors', title: 'Vectors', level: 'A-Level H2 Maths' },
  { slug: 'jc-complex', title: 'Complex Numbers', level: 'A-Level H2 Maths' },
  { slug: 'jc-differentiation', title: 'Differentiation', level: 'A-Level H2 Maths' },
  { slug: 'jc-integration', title: 'Integration', level: 'A-Level H2 Maths' },
  { slug: 'indices', title: 'Indices (Laws of Exponents)', level: 'O-Level A Math' },
  { slug: 'logarithms', title: 'Logarithms', level: 'O-Level A Math' },
  { slug: 'exponential-log-graphs', title: 'Exponential & Logarithmic Graphs', level: 'O-Level A Math' },
  { slug: 'factorization-cubics', title: 'Factorization of Cubics', level: 'O-Level A Math' },
  { slug: 'partial-fractions', title: 'Partial Fractions', level: 'O-Level A Math' },
  { slug: 'coordinate-geometry', title: 'Coordinate Geometry & Circles', level: 'O-Level A Math' },
  { slug: 'trigo', title: 'Trigonometry', level: 'O-Level A Math' },
  { slug: 'differentiation', title: 'Differentiation', level: 'O-Level A Math' },
  { slug: 'em-indices', title: 'Indices', level: 'O-Level E Math' },
  { slug: 'em-standard-form', title: 'Standard Form', level: 'O-Level E Math' },
  { slug: 'em-interest', title: 'Simple & Compound Interest', level: 'O-Level E Math' },
  { slug: 'em-sets', title: 'Sets', level: 'O-Level E Math' },
  { slug: 'em-polygons', title: 'Polygons', level: 'O-Level E Math' },
  { slug: 'em-congruency-similarity', title: 'Congruency & Similarity', level: 'O-Level E Math' },
  { slug: 'em-mensuration', title: 'Mensuration (Area & Volume)', level: 'O-Level E Math' },
  { slug: 'em-circular-measure', title: 'Circular Measure', level: 'O-Level E Math' },
  { slug: 'em-coordinate-geometry', title: 'Coordinate Geometry', level: 'O-Level E Math' },
  { slug: 'em-trigonometry', title: 'Trigonometry', level: 'O-Level E Math' },
  { slug: 'em-vectors', title: 'Vectors', level: 'O-Level E Math' },
  { slug: 'em-statistics', title: 'Statistics', level: 'O-Level E Math' },
];

/** The two typeset A-Level lists (server-rendered pages). */
export const MF_PAGES = ['mf27', 'mf26'] as const;

export function formulaPage(slug: string): FormulaPage | undefined {
  return FORMULA_PAGES.find(p => p.slug === slug);
}

/** <title> for a topic page, e.g. "Integration Formulas (A-Level H2 Maths)". */
export function formulaPageTitle(p: FormulaPage): string {
  return `${p.title} Formulas (${p.level}) | Adrian's Math Tuition`;
}

export function formulaPageDescription(p: FormulaPage): string {
  return `${p.title} formulas for Singapore ${p.level}, on one page: every formula you need, typeset, with notes on when to use each.`;
}
