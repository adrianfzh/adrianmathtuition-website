// What a student is stuck on, put in ONE vocabulary (5 Oct 2026, "learn from
// students' questions" — Adrian: "yes to all 3").
//
// The two signals speak different languages:
//   - an ask the bot filed (`ask_skills`) carries a CANONICAL topic
//     ("Trigonometry (Identities)") and a bank sub-skill;
//   - a mark lost on a paper (`notebook_mistakes.topic`) carries the marker's
//     own free text ("trigonometric identities and equations (double angle)").
// This file turns both into canonical topics and then into an AREA — the unit
// the weekly picture compares on. An area is the canonical topic, except where
// the syllabus splits one chapter many ways and the marker's words cannot tell
// the pieces apart (every "Trigonometry (…)" of A Math is one area, "Quadratic
// Functions" / "Nature of Roots" / "Quadratic Inequalities" are one area, …).
//
// Pure, no I/O, tested in stuck-topics.test.ts. The rules are keyword rules on
// purpose: free, deterministic, and a wrong one is one line to fix. A text no
// rule knows maps to nothing and is COUNTED (the report says how many), never
// guessed.

export type StuckSubject = 'AM' | 'EM' | 'H2';

/** 'A Math' / 'AM' / 'S3_AM' / 'E Math' / 'EM' / 'S1' / 'H2 Math' / 'JC2' … → the subject key, or null. */
export function subjectKey(raw: string | null | undefined): StuckSubject | null {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (s === 'AM' || s === 'S3_AM' || s === 'S4_AM' || s === 'A_MATH' || s === 'A_MATHS' || s === 'ADDITIONAL_MATH') return 'AM';
  if (s === 'EM' || s === 'S3_EM' || s === 'S4_EM' || s === 'E_MATH' || s === 'E_MATHS' || s === 'EM_NA' || /^S[12](_NA)?$/.test(s) || s === 'MATH' || s === 'IP_MATH') return 'EM';
  if (s === 'H2' || s === 'H2_MATH' || s === 'JC' || s === 'JC1' || s === 'JC2' || s === 'H1_MATH') return 'H2';
  return null;
}

export const SUBJECT_LABEL: Record<StuckSubject, string> = { AM: 'A Math', EM: 'E Math', H2: 'H2 Math' };

/**
 * An Airtable `Questions.Topic` value → {subject?, topic}. The bot writes
 * "AM: Trigonometry (Graphs)", "EM: Vectors" or a bare canonical name.
 */
export function parseAskTopic(raw: string | null | undefined): { subject: StuckSubject | null; topic: string } | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(AM|EM|H2|JC|S1|S2|S3_AM|S3_EM)\s*:\s*(.+)$/i);
  if (m) return { subject: subjectKey(m[1]), topic: m[2].trim() };
  return { subject: null, topic: s };
}

// ── canonical topic → area ──────────────────────────────────────────────────
const AREA_MERGE: Record<StuckSubject, Record<string, string>> = {
  AM: {
    'Quadratic Functions': 'Quadratics', 'Nature of Roots': 'Quadratics', 'Quadratic Inequalities': 'Quadratics',
    'Simultaneous Equations': 'Quadratics',
    'Indices': 'Indices and Logarithms', 'Logarithms': 'Indices and Logarithms',
    'Polynomials': 'Polynomials and Partial Fractions', 'Partial Fractions': 'Polynomials and Partial Fractions',
    'Coordinate Geometry': 'Coordinate Geometry', 'Circles': 'Coordinate Geometry',
    'Binomial Theorem': 'Binomial Theorem', 'Binomial Expansion': 'Binomial Theorem',
  },
  EM: {
    'Algebra (Quadratic Equations)': 'Quadratic Equations', 'Algebra (Quadratic Graphs)': 'Graphs of Functions',
    'Algebra (Graph on Graph Paper)': 'Graphs of Functions', 'Graphs of Functions': 'Graphs of Functions',
    'Indices': 'Indices', 'Indices (Standard Form)': 'Indices',
    'Financial Math (Interest)': 'Money', 'Financial Math (Hire Purchase)': 'Money', 'Financial Math (Taxation)': 'Money',
    'Financial Math (Exchange Rate)': 'Money',
    'Numbers (Percentages)': 'Percentage, Ratio and Rate', 'Numbers (Ratio)': 'Percentage, Ratio and Rate',
    'Numbers (Rate)': 'Percentage, Ratio and Rate', 'Proportion': 'Percentage, Ratio and Rate',
    'Numbers (Speed)': 'Speed and Travel Graphs', 'Distance and Speed Time Graphs': 'Speed and Travel Graphs',
    'Numbers (HCF and LCM)': 'Numbers', 'Numbers (Prime Factorization)': 'Numbers', 'Numbers (Estimation)': 'Numbers',
    'Angles': 'Angles and Polygons', 'Polygons': 'Angles and Polygons',
    'Circle Properties': 'Circle Properties', 'Circular Measure': 'Circular Measure',
    'Algebra (Expansion)': 'Algebra (Expanding and Factorising)', 'Algebra (Factorization)': 'Algebra (Expanding and Factorising)',
    'Algebra (Identities)': 'Algebra (Expanding and Factorising)', 'Algebra (Expressions)': 'Algebra (Expanding and Factorising)',
    'Algebra (Linear Equations)': 'Algebra (Equations and Formulae)', 'Algebra (Simultaneous Equations)': 'Algebra (Equations and Formulae)',
    'Algebra (Subject of Formula)': 'Algebra (Equations and Formulae)',
    'Map Scales': 'Map Scales', 'Geometrical Constructions': 'Constructions and Bearings',
  },
  H2: { 'APGP': 'Sequences and Series', 'Series and Sequences': 'Sequences and Series' },
};

/** The family prefix that is one area for A Math / H2 ("Trigonometry (Graphs)" → "Trigonometry"). */
const FAMILY_AREAS: Record<StuckSubject, string[]> = {
  AM: ['Trigonometry', 'Differentiation', 'Integration'],
  EM: [],
  H2: ['Differentiation', 'Integration', 'Distributions'],
};

export function areaOf(subject: StuckSubject, topic: string): string {
  const t = String(topic || '').trim();
  const merged = AREA_MERGE[subject][t];
  if (merged) return merged;
  const fam = t.match(/^([A-Za-z]+) \(/)?.[1];
  if (fam && FAMILY_AREAS[subject].includes(fam)) return fam;
  return t;
}

// ── the marker's free text → canonical topics ───────────────────────────────
/** generic = a catch-all for its area ("differentiat" → Techniques): dropped when a specific rule of the same area also hit. */
type Rule = { re: RegExp; topic: string; unless?: RegExp; generic?: boolean };

const TANGENT_UNLESS = /circle|alternate segment|chord|cyclic|semicircle/;

const AM_RULES: Rule[] = [
  { re: /r[- ]?formula|\br\s?(sin|cos)\s?\(|a\s?sin\s?θ?\s?[+−-]\s?b\s?cos|r\\+sin|r\\+cos/, topic: 'Trigonometry (R-Formula)' },
  { re: /kinematic|displacement|velocity|total distance|instantaneous rest/, topic: 'Kinematics' },
  { re: /rates? of change|connected rate/, topic: 'Differentiation (Rates of Change)' },
  { re: /increasing|decreasing/, topic: 'Differentiation (Increasing and Decreasing Functions)' },
  { re: /stationary|maxima|minima|max(imum)?\/min|optimi[sz]|nature of (a )?stationary|nature of stationary|turning points?\b(?!.*square)|maximum volume|volume function/, topic: 'Differentiation (Maximum and Minimum)', unless: /completing the square|quadratic function|r-formula|r sin|r cos|vertex/ },
  { re: /tangents?|normals?\b/, topic: 'Differentiation (Tangents and Normals)', unless: TANGENT_UNLESS },
  { re: /area (under|between|bounded|below|by integration|of a region)|integration.{0,30}\barea\b|definite integration — area/, topic: 'Integration (Area)' },
  { re: /equation of a curve|constant of integration|from (the )?second derivative|d²y\/dx²/, topic: 'Integration (Applications)' },
  { re: /reverse|reversal|'hence'|using a given|given derivative|derivative result|definite integral/, topic: 'Integration (Definite Integrals)' },
  { re: /integrat/, topic: 'Integration (Techniques)', generic: true },
  { re: /differentiat|chain rule|product rule|quotient rule/, topic: 'Differentiation (Techniques)', generic: true },
  { re: /trig[a-z]* graphs?|trigonometric curves?|amplitude|period\b|centre line/, topic: 'Trigonometry (Graphs)' },
  { re: /identit/, topic: 'Trigonometry (Identities)', unless: /cubic identit/ },
  { re: /trig[a-z]* equations?|solving .*trig|double angle and 'hence'/, topic: 'Trigonometry (Equations)' },
  { re: /addition formula|compound angle|double[- ]angle|exact values?|astc|reciprocal ratios|trigonometric ratios|inverse trig/, topic: 'Trigonometry (Ratios)' },
  { re: /cosine rule|sine rule|area of a triangle (and|with) (double|surd)|in context|height modelling|tides|ferris/, topic: 'Trigonometry (Applications)' },
  { re: /trigonometr/, topic: 'Trigonometry (Equations)', generic: true, unless: /differentiat|integrat|kinematic/ },
  { re: /binomial/, topic: 'Binomial Theorem' },
  { re: /linear law|plotting (ln|lg|e\^)|against t\b|y ?= ?mx ?\+ ?c/, topic: 'Linear Law' },
  { re: /partial fraction/, topic: 'Partial Fractions' },
  { re: /polynomial|factor theorem|remainder theorem|cubic|sum of cubes|difference of cubes|sum\/difference of cubes|divisibility/, topic: 'Polynomials' },
  { re: /circle geometry|circle propert|circle theorem|alternate segment|plane geometry|geometric proof|concyclic|similar triangles|congruen/, topic: 'Plane Geometry', unless: /coordinate geometry/ },
  { re: /coordinate geometry (of|—|-|–)?\s*(the )?circles?|equation of a circle|the circle|circles?,? (chords|tangent|perpendicular|diameter|intersection)|centre and radius/, topic: 'Circles' },
  { re: /coordinate geometry|distance formula|perpendicular bisector|kite|gradients?\b|midpoint|parallel lines/, topic: 'Coordinate Geometry', generic: true },
  { re: /logarithm|\blog\b|\blg\b|change of base|exponential (equation|growth|model|decay|and log|simultaneous|curves)|exponential ?\/|exponentials and|growth model|decay model|solving with ln|with e and ln/, topic: 'Logarithms', unless: /linear law|kinematic/ },
  { re: /indices|index form/, topic: 'Indices' },
  { re: /surd|rationalis/, topic: 'Surds' },
  { re: /discriminant|tangency|nature of roots|always[- ]negative|always[- ]positive|line meeting a curve|line[- ]curve/, topic: 'Nature of Roots' },
  { re: /quadratic inequalit/, topic: 'Quadratic Inequalities' },
  { re: /completing the square|quadratic function|^quadratics?\b|vertex form|turning[- ]point form|maximum value/, topic: 'Quadratic Functions', unless: /partial fraction/ },
  { re: /simultaneous/, topic: 'Simultaneous Equations' },
];

const EM_RULES: Rule[] = [
  { re: /3d|three dimensions|angle between a line and a plane/, topic: 'Trigonometry' },
  { re: /bearing|scale drawing|loci|constructions?/, topic: 'Geometrical Constructions' },
  { re: /sine rule|cosine rule|angles? of (elevation|depression)|trigonometr|obtuse angle|right-angled triangle/, topic: 'Trigonometry' },
  { re: /arc length|sector|segment area|area of (a )?segments?|radian measure/, topic: 'Circular Measure' },
  { re: /circle (propert|geometry|theorem)|angle at (the )?centre|cyclic quad|angles? in (a|the) semicircle|tangent perpendicular/, topic: 'Circle Properties' },
  { re: /congruen|similar (triangles|figures)|similarity/, topic: 'Congruency and Similarity' },
  { re: /similar (solids|cones)|volume scale|area scale/, topic: 'Mensuration' },
  { re: /vector|collinear/, topic: 'Vectors' },
  { re: /coordinate geometry|gradient of a line|equation of a line|straight lines|distance between two points/, topic: 'Coordinate Geometry' },
  { re: /speed-time|speed–time|distance-time|travel graph|acceleration-time|kinematics/, topic: 'Distance and Speed Time Graphs' },
  { re: /graphs? of (cubic|functions|exponential|y ?=)|graphical solution|solving (an )?(equation|inequality) (with|from|by) (a )?(graph|drawing)|by drawing a (straight )?line|tangent gradient|gradient (of a curve )?by (drawing a )?tangent|plotting a curve|table of values|reciprocal-type curve|recognising (exponential|graphs)|graphs: |cubic inequality/, topic: 'Graphs of Functions' },
  { re: /quadratic (graphs|curves)|sketching quadratic|quadratic functions — roots/, topic: 'Algebra (Quadratic Graphs)' },
  { re: /matri/, topic: 'Matrices' },
  { re: /\bsets?\b|venn|set (language|notation)/, topic: 'Sets' },
  { re: /cumulative|box[- ]and[- ]whisker|box plot|stem-and-leaf|standard deviation|grouped|histogram|statistic|mean|median|misleading|pie chart|bar chart|line graph|quartile/, topic: 'Statistics' },
  { re: /probabilit|tree diagram|without replacement|two-way table/, topic: 'Probability' },
  { re: /compound interest|simple interest|hire purchase|interest/, topic: 'Financial Math (Interest)' },
  { re: /\bgst\b|income tax|taxation/, topic: 'Financial Math (Taxation)' },
  { re: /exchange rate|currency|money/, topic: 'Financial Math (Exchange Rate)' },
  { re: /map (and model )?scales?|model scales|scales of models|scales and standard form/, topic: 'Map Scales' },
  { re: /mensuration|volume|surface area|cylinder|cone|hemisphere|sphere|pyramid|prism|cuboid|frustum|annul|area of circles/, topic: 'Mensuration' },
  { re: /polygon|interior and exterior|angle propert|parallel lines|isosceles|rhombus|quadrilateral/, topic: 'Polygons' },
  { re: /pythagoras/, topic: 'Pythagoras\' Theorem' },
  { re: /completing the square|quadratic equation|quadratic formula|forming (and solving )?a quadratic|roots of quadratic|rejecting a root|quadratic expressions/, topic: 'Algebra (Quadratic Equations)' },
  { re: /algebraic fraction|single fraction|rational equations/, topic: 'Algebra (Fractions)' },
  { re: /inequalit/, topic: 'Algebra (Inequalities)' },
  { re: /subject of (a |the )?formula|changing the subject|change of subject|substitution/, topic: 'Algebra (Subject of Formula)' },
  { re: /simultaneous/, topic: 'Algebra (Simultaneous Equations)' },
  { re: /factoris|grouping/, topic: 'Algebra (Factorization)', unless: /prime factori/ },
  { re: /expan(d|sion)|special products|difference of two squares|identities/, topic: 'Algebra (Expansion)' },
  { re: /linear equation|forming (and solving )?(an |linear )?equation/, topic: 'Algebra (Linear Equations)' },
  { re: /standard form|units of storage/, topic: 'Indices (Standard Form)' },
  { re: /indices|exponential/, topic: 'Indices' },
  { re: /hcf|lcm|prime factori|perfect squares|cube numbers/, topic: 'Numbers (HCF and LCM)' },
  { re: /estimat|bounds|limits of accuracy|rounding|significant figures/, topic: 'Numbers (Estimation)' },
  { re: /number patterns?|sequences?|nth term/, topic: 'Number Patterns' },
  { re: /percentage|reverse percentage/, topic: 'Numbers (Percentages)' },
  { re: /proportion|variation|inverse square/, topic: 'Proportion' },
  { re: /\bratios?\b/, topic: 'Numbers (Ratio)' },
  { re: /speed|distance and time/, topic: 'Numbers (Speed)' },
  { re: /(?<!exchange )\brates?\b|wages|\bpay\b|costing|\bcost/, topic: 'Numbers (Rate)' },
  { re: /real[- ]world|everyday|modelling|problem solving/, topic: 'Math In Real World Context' },
  { re: /algebra/, topic: 'Algebra (Expressions)', generic: true },
  { re: /\bodd\b|\beven\b|parity|counter-?example|number propert/, topic: 'Math In Real World Context' },
];

const H2_RULES: Rule[] = [
  { re: /hypothesis|significance level|z-test/, topic: 'Hypothesis Testing' },
  { re: /central limit|sampling distribution|sample mean|unbiased estimate/, topic: 'Distributions (Sampling)' },
  { re: /normal (distribution|variables|approximation)|inverse normal|linear combinations/, topic: 'Distributions (Normal)' },
  { re: /binomial distribution/, topic: 'Distributions (Binomial)' },
  { re: /poisson/, topic: 'Distributions (Poisson)' },
  { re: /discrete random/, topic: 'Distributions (DRV)' },
  { re: /regression|correlation|residual|least squares/, topic: 'Linear Regression' },
  { re: /permutation|combination(?!s of independent)/, topic: 'Permutations and Combinations' },
  { re: /sampling method|sampling;|sampling:/, topic: 'Sampling Methods' },
  { re: /probabilit/, topic: 'Probability' },
  { re: /maclaurin/, topic: 'Differentiation (Maclaurin Series)' },
  { re: /differential equation/, topic: 'Integration (Differential Equations)' },
  { re: /volume of revolution|area (under|between)|volumes|spherical cap/, topic: 'Integration (Area and Volume)' },
  { re: /parametric/, topic: 'Parametric Equations' },
  { re: /maxima|minima|optimi/, topic: 'Differentiation (Maximum and Minimum)' },
  { re: /rates of change/, topic: 'Differentiation (Rates of Change)' },
  { re: /tangent/, topic: 'Differentiation (Tangents and Normals)' },
  { re: /integrat/, topic: 'Integration (Techniques)' },
  { re: /differentiat/, topic: 'Differentiation (Techniques)' },
  { re: /complex/, topic: 'Complex Numbers' },
  { re: /vector|planes/, topic: 'Vectors' },
  { re: /binomial expansion/, topic: 'Binomial Expansion' },
  { re: /arithmetic progression|geometric (series|progression)|\bgp\b|\bap\b/, topic: 'APGP' },
  { re: /sequence|series|sigma|method of differences|recurrence/, topic: 'Series and Sequences' },
  { re: /induction/, topic: 'Mathematical Induction' },
  { re: /transformation|curve sketching|graphing|asymptote|rational functions|graphs and|conics|hyperbola|reciprocal and derivative/, topic: 'Graphing Techniques' },
  { re: /function/, topic: 'Functions', unless: /rational function/ },
  { re: /inequalit/, topic: 'Inequalities' },
  { re: /systems of linear equations|^equations/, topic: 'Equations' },
];

const RULES: Record<StuckSubject, Rule[]> = { AM: AM_RULES, EM: EM_RULES, H2: H2_RULES };

/** The most canonical topics one marker text yields (first mentioned first). */
export const MAX_TOPICS_PER_TEXT = 2;

/** "Algebra (Fractions)" → "Algebra"; a topic with no bracket has no family. */
function familyOf(topic: string): string | null {
  return topic.match(/^([A-Za-z]+) \(/)?.[1] ?? null;
}

/** Every canonical topic a text mentions, first mentioned first (same spot: the earlier, more specific rule). */
function scan(subject: StuckSubject, t: string): { topic: string; generic: boolean }[] {
  const hits: { at: number; order: number; topic: string; generic: boolean }[] = [];
  RULES[subject].forEach((r, order) => {
    if (r.unless && r.unless.test(t)) return;
    const m = r.re.exec(t);
    if (m) hits.push({ at: m.index, order, topic: r.topic, generic: !!r.generic });
  });
  hits.sort((a, b) => a.at - b.at || a.order - b.order);
  // a catch-all gives way to a specific rule of its own area ("differentiation
  // (increasing functions)" is Increasing and Decreasing, not Techniques)
  const specificAreas = new Set(hits.filter((h) => !h.generic).map((h) => areaOf(subject, h.topic)));
  const seen = new Set<string>();
  return hits.filter((h) => {
    if (h.generic && specificAreas.has(areaOf(subject, h.topic))) return false;
    if (seen.has(h.topic)) return false;
    seen.add(h.topic);
    return true;
  }).map(({ topic, generic }) => ({ topic, generic }));
}

/**
 * The marker's free-text topic → canonical topics of that subject, at most
 * MAX_TOPICS_PER_TEXT. [] = no rule knows it (counted as unmapped by the
 * caller, never guessed).
 *
 * The marker writes "HEAD — detail" ("kinematics — differentiation",
 * "coordinate geometry — circles"). The head says what the question is
 * about; the detail only REFINES it inside the same area ("differentiation —
 * tangents and normals" → Tangents and Normals), it never adds a second area
 * (one lost mark on a kinematics question is not also a differentiation
 * mistake). A text with no separator ("differentiation (product rule) and
 * integration by reversal") is all head, so it can name two areas.
 */
export function markerTopics(subject: StuckSubject, text: string | null | undefined): string[] {
  const t = String(text ?? '').toLowerCase().trim();
  if (!t || t === 'not identified') return [];
  const cut = t.search(/\s[—–]\s|\s-\s|:\s/);
  const head = cut > 0 ? t.slice(0, cut) : t;
  const headHits = scan(subject, head);
  const all = scan(subject, t);
  let picked: string[];
  if (!headHits.length) {
    picked = all.map((h) => h.topic);
  } else {
    // a catch-all head is refined by the detail inside the same area
    // ("differentiation — tangents and normals" → Tangents and Normals); a
    // specific head stays as it is ("trigonometric equations — double angle")
    picked = headHits.map((h) => {
      if (!h.generic) return h.topic;
      const area = areaOf(subject, h.topic);
      const fam = familyOf(h.topic);
      return all.find((x) => !x.generic && (areaOf(subject, x.topic) === area || (fam && familyOf(x.topic) === fam)))?.topic ?? h.topic;
    });
  }
  const out: string[] = [];
  const areas = new Set<string>();
  for (const p of picked) {
    const area = areaOf(subject, p);
    if (areas.has(area)) continue;
    areas.add(area);
    out.push(p);
    if (out.length >= MAX_TOPICS_PER_TEXT) break;
  }
  return out;
}
