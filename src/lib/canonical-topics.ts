// Canonical topic lists for Singapore secondary and JC mathematics.
// Used in the lesson input modal for quick multi-select.

export interface TopicCategory {
  label: string;
  topics: string[];
}

export const SECONDARY_TOPICS: TopicCategory[] = [
  {
    label: 'Numbers & Algebra',
    topics: [
      'Numbers & Operations',
      'Ratio, Rate & Percentage',
      'Algebraic Manipulation',
      'Equations & Inequalities',
      'Functions & Graphs (Linear)',
      'Quadratic Equations',
      'Quadratic Functions & Graphs',
      'Indices & Surds',
      'Polynomials & Partial Fractions',
      'Exponential & Log Functions',
      'Binomial Theorem',
    ],
  },
  {
    label: 'Geometry & Trigonometry',
    topics: [
      'Coordinate Geometry',
      'Angles & Triangles',
      'Quadrilaterals & Polygons',
      'Circles (Angle Properties)',
      'Congruence & Similarity',
      'Pythagoras\' Theorem',
      'Trigonometry (Basic SOHCAHTOA)',
      'Further Trigonometry (Sine/Cosine Rule)',
      'Mensuration (Perimeter & Area)',
      'Mensuration (Volume & Surface Area)',
      'Vectors',
      'Transformations',
    ],
  },
  {
    label: 'Statistics & Probability',
    topics: [
      'Statistics (Data Representation)',
      'Mean, Median, Mode',
      'Standard Deviation',
      'Probability (Basic)',
      'Permutations & Combinations',
    ],
  },
];

export const JC_TOPICS: TopicCategory[] = [
  {
    label: 'Pure Mathematics',
    topics: [
      'Functions (Inverse & Composite)',
      'Graphs & Transformations',
      'Inequalities',
      'Sequences & Series (AP/GP)',
      'Method of Differences',
      'Differentiation (Rules)',
      'Further Differentiation (Implicit/Parametric)',
      'Applications of Differentiation',
      'Maclaurin\'s Series',
      'Integration (Standard & Definite)',
      'Integration (By Parts & Substitution)',
      'Integration (Partial Fractions)',
      'Applications of Integration',
      'Differential Equations',
      'Vectors (2D)',
      'Vectors (3D: Lines & Planes)',
      'Complex Numbers',
    ],
  },
  {
    label: 'Statistics',
    topics: [
      'Permutations & Combinations',
      'Probability',
      'Discrete Random Variables',
      'Binomial Distribution',
      'Normal Distribution',
      'Sampling & Estimation',
      'Hypothesis Testing',
      'Correlation & Linear Regression',
    ],
  },
];

// Flat topic arrays for quick lookup
export const SECONDARY_FLAT: string[] = SECONDARY_TOPICS.flatMap(c => c.topics);
export const JC_FLAT: string[] = JC_TOPICS.flatMap(c => c.topics);
export const ALL_TOPICS_FLAT: string[] = [...SECONDARY_FLAT, ...JC_FLAT];

/** Returns the canonical topic list (with categories) for a given student level string. */
export function getTopicsForLevel(level: string): TopicCategory[] {
  const l = level.toLowerCase();
  if (l === 'jc') return JC_TOPICS;
  if (l === 'secondary' || l === 'sec') return SECONDARY_TOPICS;
  // Mixed or unknown: show both
  return [
    ...SECONDARY_TOPICS.map(c => ({ ...c, label: `[Sec] ${c.label}` })),
    ...JC_TOPICS.map(c => ({ ...c, label: `[JC] ${c.label}` })),
  ];
}
