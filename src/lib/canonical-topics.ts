// Canonical topic lists for Singapore secondary and JC mathematics.
// Source: canonical_topics.json — exact topic names used in the question bank.
// Used in lesson input modal (quick multi-select) and exam section (topics tested).

export interface TopicCategory {
  label: string;
  topics: string[];
}

// ─── Sec 1 (23 topics) ────────────────────────────────────────────────────────
export const S1_EXAM_TOPICS: TopicCategory[] = [
  {
    label: 'Algebra',
    topics: [
      'Algebra (Expansion)',
      'Algebra (Expressions)',
      'Algebra (Factorization)',
      'Algebra (Fractions)',
      'Algebra (Linear Equations)',
    ],
  },
  {
    label: 'Numbers',
    topics: [
      'Numbers (Estimation)',
      'Numbers (HCF and LCM)',
      'Numbers (Percentages)',
      'Numbers (Prime Factorization)',
      'Numbers (Rate)',
      'Numbers (Ratio)',
      'Numbers (Speed)',
    ],
  },
  {
    label: 'Geometry & Measurement',
    topics: [
      'Angles',
      'Coordinate Geometry (Lines)',
      'Geometrical Constructions',
      'Mensuration',
      'Polygons',
      'Symmetry',
    ],
  },
  {
    label: 'Other',
    topics: [
      'Financial Math (Exchange Rate)',
      'Financial Math (Interest)',
      'Math In Real World Context',
      'Number Patterns',
      'Statistics',
    ],
  },
];

// ─── Sec 2 own topics (25 topics) ─────────────────────────────────────────────
export const S2_OWN_TOPICS: TopicCategory[] = [
  {
    label: 'Algebra',
    topics: [
      'Algebra (Expansion)',
      'Algebra (Expressions)',
      'Algebra (Factorization)',
      'Algebra (Fractions)',
      'Algebra (Graph on Graph Paper)',
      'Algebra (Identities)',
      'Algebra (Inequalities)',
      'Algebra (Quadratic Equations)',
      'Algebra (Quadratic Graphs)',
      'Algebra (Simultaneous Equations)',
      'Algebra (Subject of Formula)',
    ],
  },
  {
    label: 'Geometry & Measurement',
    topics: [
      'Angles',
      'Congruency and Similarity',
      'Coordinate Geometry (Lines)',
      'Map Scales',
      'Mensuration',
      'Pythagoras\' Theorem',
    ],
  },
  {
    label: 'Numbers',
    topics: [
      'Indices',
      'Indices (Standard Form)',
      'Numbers (Estimation)',
      'Numbers (Percentages)',
      'Proportion',
    ],
  },
  {
    label: 'Statistics & Probability',
    topics: [
      'Probability',
      'Statistics',
      'Trigonometry',
    ],
  },
];

// S2 exam = S2 own topics + S1 topics (cumulative)
export const S2_EXAM_TOPICS: TopicCategory[] = [
  ...S2_OWN_TOPICS,
  ...S1_EXAM_TOPICS.map(c => ({ ...c, label: `[S1] ${c.label}` })),
];

// ─── O-Level E Math (44 topics) ───────────────────────────────────────────────
export const EM_OWN_TOPICS: TopicCategory[] = [
  {
    label: 'Algebra',
    topics: [
      'Algebra (Expansion)',
      'Algebra (Expressions)',
      'Algebra (Factorization)',
      'Algebra (Fractions)',
      'Algebra (Graph on Graph Paper)',
      'Algebra (Identities)',
      'Algebra (Inequalities)',
      'Algebra (Linear Equations)',
      'Algebra (Quadratic Equations)',
      'Algebra (Quadratic Graphs)',
      'Algebra (Simultaneous Equations)',
      'Algebra (Subject of Formula)',
    ],
  },
  {
    label: 'Numbers',
    topics: [
      'Indices',
      'Indices (Standard Form)',
      'Numbers (Estimation)',
      'Numbers (HCF and LCM)',
      'Numbers (Percentages)',
      'Numbers (Prime Factorization)',
      'Numbers (Rate)',
      'Numbers (Ratio)',
      'Numbers (Speed)',
      'Proportion',
    ],
  },
  {
    label: 'Geometry & Trigonometry',
    topics: [
      'Angles',
      'Circle Properties',
      'Circular Measure',
      'Congruency and Similarity',
      'Coordinate Geometry',
      'Distance and Speed Time Graphs',
      'Geometrical Constructions',
      'Graphs of Functions',
      'Map Scales',
      'Mensuration',
      'Polygons',
      'Trigonometry',
      'Vectors',
    ],
  },
  {
    label: 'Other',
    topics: [
      'Financial Math (Hire Purchase)',
      'Financial Math (Interest)',
      'Financial Math (Taxation)',
      'Math In Real World Context',
      'Matrices',
      'Number Patterns',
      'Sets',
    ],
  },
  {
    label: 'Statistics & Probability',
    topics: [
      'Probability',
      'Statistics',
    ],
  },
];

// EM exam = EM own + S2 own + S1 topics (cumulative)
export const E_MATH_EXAM_TOPICS: TopicCategory[] = [
  ...EM_OWN_TOPICS,
  ...S2_OWN_TOPICS.map(c => ({ ...c, label: `[S2] ${c.label}` })),
  ...S1_EXAM_TOPICS.map(c => ({ ...c, label: `[S1] ${c.label}` })),
];

// ─── O-Level A Math (33 topics) ───────────────────────────────────────────────
export const A_MATH_EXAM_TOPICS: TopicCategory[] = [
  {
    label: 'Algebra & Functions',
    topics: [
      'Binomial Theorem',
      'Indices',
      'Linear Law',
      'Logarithms',
      'Modulus Functions',
      'Nature of Roots',
      'Partial Fractions',
      'Polynomials',
      'Power Graphs',
      'Quadratic Functions',
      'Quadratic Inequalities',
      'Simultaneous Equations',
      'Surds',
    ],
  },
  {
    label: 'Geometry',
    topics: [
      'Circles',
      'Coordinate Geometry',
      'Plane Geometry',
      'Proof',
    ],
  },
  {
    label: 'Trigonometry',
    topics: [
      'Trigonometry (Applications)',
      'Trigonometry (Equations)',
      'Trigonometry (Graphs)',
      'Trigonometry (Identities)',
      'Trigonometry (R-Formula)',
      'Trigonometry (Ratios)',
    ],
  },
  {
    label: 'Calculus',
    topics: [
      'Differentiation (Increasing and Decreasing Functions)',
      'Differentiation (Maximum and Minimum)',
      'Differentiation (Rates of Change)',
      'Differentiation (Tangents and Normals)',
      'Differentiation (Techniques)',
      'Integration (Applications)',
      'Integration (Area)',
      'Integration (Definite Integrals)',
      'Integration (Techniques)',
      'Kinematics',
    ],
  },
];

// ─── JC H2 Mathematics (30 topics) ───────────────────────────────────────────
export const JC_TOPICS: TopicCategory[] = [
  {
    label: 'Pure Mathematics',
    topics: [
      'APGP',
      'Binomial Expansion',
      'Complex Numbers',
      'Differentiation (Concavity)',
      'Differentiation (Maclaurin Series)',
      'Differentiation (Maximum and Minimum)',
      'Differentiation (Rates of Change)',
      'Differentiation (Tangents and Normals)',
      'Differentiation (Techniques)',
      'Equations',
      'Functions',
      'Graphing Techniques',
      'Inequalities',
      'Integration (Area and Volume)',
      'Integration (Differential Equations)',
      'Integration (Techniques)',
      'Mathematical Induction',
      'Parametric Equations',
      'Series and Sequences',
      'Vectors',
    ],
  },
  {
    label: 'Statistics',
    topics: [
      'Distributions (Binomial)',
      'Distributions (DRV)',
      'Distributions (Normal)',
      'Distributions (Poisson)',
      'Distributions (Sampling)',
      'Hypothesis Testing',
      'Linear Regression',
      'Permutations and Combinations',
      'Probability',
      'Sampling Methods',
    ],
  },
];

// ─── Legacy flat arrays (used for topic chip lookups) ─────────────────────────
const _s1Flat = S1_EXAM_TOPICS.flatMap(c => c.topics);
const _s2Flat = S2_OWN_TOPICS.flatMap(c => c.topics);
const _emFlat = EM_OWN_TOPICS.flatMap(c => c.topics);
const _amFlat = A_MATH_EXAM_TOPICS.flatMap(c => c.topics);
const _jcFlat = JC_TOPICS.flatMap(c => c.topics);

export const SECONDARY_FLAT: string[] = [...new Set([..._s1Flat, ..._s2Flat, ..._emFlat, ..._amFlat])];
export const JC_FLAT: string[] = _jcFlat;
export const ALL_TOPICS_FLAT: string[] = [...new Set([...SECONDARY_FLAT, ...JC_FLAT])];

// Keep SEC12_EXAM_TOPICS as alias for backwards compat (used in lesson topic useMemo)
export const SEC12_EXAM_TOPICS = S2_EXAM_TOPICS;

// Legacy SECONDARY_TOPICS — kept for getTopicsForLevel fallback
export const SECONDARY_TOPICS = E_MATH_EXAM_TOPICS;

/** Returns canonical lesson topics for a given student level. */
export function getTopicsForLevel(level: string): TopicCategory[] {
  const l = level.toLowerCase();
  if (l.startsWith('jc')) return JC_TOPICS;
  if (l.startsWith('sec')) return SECONDARY_TOPICS;
  // Paper-code shortcuts so callers passing 'AM' / 'EM' / 'JC' / 'S1' / 'S2'
  // get the right canonical list instead of a Sec+JC mash-up.
  const paper = getTopicsForPaperLevel(level);
  if (paper.length > 0) return paper;
  return [
    ...SECONDARY_TOPICS.map(c => ({ ...c, label: `[Sec] ${c.label}` })),
    ...JC_TOPICS.map(c => ({ ...c, label: `[JC] ${c.label}` })),
  ];
}

/**
 * Returns the canonical topic list for a paper-code level — the codes used in the
 * question bank's `level` column and on the lessons editor / offline cache.
 *
 *   AM  → A_MATH_EXAM_TOPICS                 (33 topics — AM's own)
 *   EM  → E_MATH_EXAM_TOPICS                 (EM + [S2] + [S1] cascading; matches
 *                                             how EM questions are tagged in the QB)
 *   JC  → JC_TOPICS                          (30 topics — H2 Math)
 *   S1  → S1_EXAM_TOPICS                     (Sec 1's own)
 *   S2  → S2_EXAM_TOPICS                     (S2 + [S1] cascading)
 *
 * Unknown code → empty array (caller can fall back as needed).
 */
export function getTopicsForPaperLevel(level: string): TopicCategory[] {
  switch (level.toUpperCase()) {
    case 'AM':
    case 'S3_AM': return A_MATH_EXAM_TOPICS;     // Additional Math (Sec 3 + Sec 4 share the topic list)
    case 'EM':
    case 'EM_NA':
    case 'S3_EM': return E_MATH_EXAM_TOPICS;     // Elementary Math family (NA + Sec 3 + Sec 4)
    case 'JC':
    case 'JC1':
    case 'JC2': return JC_TOPICS;                // H2 Math family
    case 'S1': return S1_EXAM_TOPICS;
    case 'S2': return S2_EXAM_TOPICS;
    default: return [];
  }
}

/**
 * Returns the exam topic list appropriate for a given level + subject.
 * Cascading: S2 includes S1; EM includes S2+S1.
 */
export function getExamTopicsForSubject(studentLevel: string, subject: string): TopicCategory[] {
  const l = studentLevel.toLowerCase();
  if (l.startsWith('jc')) return JC_TOPICS;
  if (l.startsWith('sec')) {
    const secNum = parseInt(l.replace(/[^0-9]/g, '')) || 0;
    if (secNum <= 1) return S1_EXAM_TOPICS;
    if (secNum === 2) return S2_EXAM_TOPICS;           // S2 + S1
    if (subject === 'A Math') return A_MATH_EXAM_TOPICS;
    return E_MATH_EXAM_TOPICS;                         // EM + S2 + S1
  }
  return JC_TOPICS;
}
