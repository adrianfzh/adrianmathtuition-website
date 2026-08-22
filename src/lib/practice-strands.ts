// Practice picker taxonomy helpers — pure, no I/O (tested in
// practice-strands.test.ts).
//
// The bank names topics "Family (Variant)" — "Differentiation (Techniques)",
// "Algebra (Fractions)" — and the picker used to list all 30–45 of them flat.
// Adrian's brief (2026-08-22): students want EITHER a topic generically, OR a
// specific part of it, OR a particular kind of question, and should get to the
// question fast either way. So the picker is three layers deep but each layer
// is one tap:
//   strand chip (3–4 per level)  →  family row, expanding to its variants
//   →  topic sheet: Start (mix) / or one question type (subgroups).
// This file owns the first two layers; question types come from the
// practice_subgroups RPC.

export type Strand = { key: string; label: string };

export type TopicGroup<T> = {
  family: string;
  /** One entry → a plain topic row; several → a family with variants. */
  topics: { topic: string; variant: string | null; row: T }[];
  total: number;
};

/** "Differentiation (Techniques)" → "Differentiation". */
export function familyOf(topic: string): string {
  const i = topic.indexOf(' (');
  return i > 0 ? topic.slice(0, i).trim() : topic.trim();
}

/** "Differentiation (Techniques)" → "Techniques"; no bracket → null. */
export function variantOf(topic: string): string | null {
  const m = topic.match(/\(([^)]*)\)\s*$/);
  return m ? m[1].trim() : null;
}

// Strand membership by topic FAMILY, per bank level (subgroups.level). A family
// not listed falls into the level's last ("Other") strand. Keep each list
// short — the chips are a coarse first cut, not a syllabus.
const STRANDS: Record<string, { strands: Strand[]; families: Record<string, string> }> = {
  AM: {
    strands: [
      { key: 'algebra', label: 'Algebra' },
      { key: 'geometry', label: 'Geometry & Trig' },
      { key: 'calculus', label: 'Calculus' },
    ],
    families: {
      'Binomial Theorem': 'algebra', Indices: 'algebra', 'Linear Law': 'algebra', Logarithms: 'algebra',
      'Modulus Functions': 'algebra', 'Nature of Roots': 'algebra', 'Partial Fractions': 'algebra',
      Polynomials: 'algebra', 'Quadratic Functions': 'algebra', 'Quadratic Inequalities': 'algebra',
      'Simultaneous Equations': 'algebra', Surds: 'algebra',
      Circles: 'geometry', 'Coordinate Geometry': 'geometry', 'Plane Geometry': 'geometry', Trigonometry: 'geometry',
      Differentiation: 'calculus', Integration: 'calculus', Kinematics: 'calculus',
    },
  },
  JC: {
    strands: [
      { key: 'algebra', label: 'Algebra & Graphs' },
      { key: 'calculus', label: 'Calculus' },
      { key: 'stats', label: 'Statistics' },
    ],
    families: {
      APGP: 'algebra', 'Binomial Expansion': 'algebra', 'Complex Numbers': 'algebra', Equations: 'algebra',
      Functions: 'algebra', 'Graphing Techniques': 'algebra', Inequalities: 'algebra',
      'Series and Sequences': 'algebra', 'Parametric Equations': 'algebra', Vectors: 'algebra',
      Differentiation: 'calculus', Integration: 'calculus',
      Distributions: 'stats', 'Hypothesis Testing': 'stats', 'Linear Regression': 'stats',
      'Permutations and Combinations': 'stats', Probability: 'stats', 'Sampling Methods': 'stats',
    },
  },
};

// E Math and lower sec share the MOE strands.
const SEC_STRANDS = {
  strands: [
    { key: 'number', label: 'Numbers & Algebra' },
    { key: 'geometry', label: 'Geometry & Measurement' },
    { key: 'stats', label: 'Statistics & Probability' },
  ],
  families: {
    Algebra: 'number', Numbers: 'number', Indices: 'number', 'Financial Math': 'number',
    'Number Patterns': 'number', Proportion: 'number', 'Map Scales': 'number', Matrices: 'number',
    Sets: 'number', 'Math In Real World Context': 'number', 'Distance and Speed Time Graphs': 'number',
    'Graphs of Functions': 'number',
    Angles: 'geometry', 'Circle Properties': 'geometry', 'Circular Measure': 'geometry',
    'Congruency and Similarity': 'geometry', 'Coordinate Geometry': 'geometry',
    'Geometrical Constructions': 'geometry', Mensuration: 'geometry', Polygons: 'geometry',
    "Pythagoras' Theorem": 'geometry', Trigonometry: 'geometry', Vectors: 'geometry',
    Probability: 'stats', Statistics: 'stats',
  } as Record<string, string>,
};
STRANDS.EM = SEC_STRANDS;
STRANDS.S1 = SEC_STRANDS;
STRANDS.S2 = SEC_STRANDS;

const OTHER: Strand = { key: 'other', label: 'Other' };

/** Strand chips for a bank level — only those that have at least one topic. */
export function strandsFor(level: string, topics: string[]): Strand[] {
  const cfg = STRANDS[level];
  if (!cfg) return [];
  const present = new Set(topics.map(t => strandKey(level, t)));
  const out = cfg.strands.filter(s => present.has(s.key));
  if (present.has(OTHER.key)) out.push(OTHER);
  // A single chip is no filter at all — hide the row.
  return out.length >= 2 ? out : [];
}

export function strandKey(level: string, topic: string): string {
  const cfg = STRANDS[level];
  if (!cfg) return OTHER.key;
  return cfg.families[familyOf(topic)] ?? OTHER.key;
}

/**
 * Group topic rows by family, keeping the caller's row objects. Order: the
 * input order of first appearance per family (callers pass a sorted list).
 */
export function groupTopics<T extends { topic: string; questionCount: number }>(rows: T[]): TopicGroup<T>[] {
  const byFamily = new Map<string, TopicGroup<T>>();
  for (const row of rows) {
    const family = familyOf(row.topic);
    let g = byFamily.get(family);
    if (!g) { g = { family, topics: [], total: 0 }; byFamily.set(family, g); }
    g.topics.push({ topic: row.topic, variant: variantOf(row.topic), row });
    g.total += row.questionCount;
  }
  return Array.from(byFamily.values());
}

/** Case-insensitive match on the topic name or any of its question-type names. */
export function topicMatches(topic: string, typeNames: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (topic.toLowerCase().includes(q)) return true;
  return typeNames.some(n => n.toLowerCase().includes(q));
}
