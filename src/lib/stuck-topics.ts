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
//
// SCIENCE since 5 Oct 2026 (Adrian: "yes" to filing science asks under a topic
// too): the bot now files a science ask under the SCIENCE bank's tree topic
// (`ask_skills` bank='science', topic = the tree's topic verbatim, e.g.
// "Electrolysis"; the Questions row's Topic reads "CHEM: Electrolysis"), and the
// marker's science words ("Speed of reaction; Acids and bases") map to the
// same tree topics through the PHY / CHEM / BIO rules below.

export type MathSubject = 'AM' | 'EM' | 'H2';
export type ScienceSubject = 'PHY' | 'CHEM' | 'BIO';
export type StuckSubject = MathSubject | ScienceSubject;

export const MATH_SUBJECTS: readonly MathSubject[] = ['AM', 'EM', 'H2'];
export function isMath(subject: StuckSubject | null | undefined): subject is MathSubject {
  return !!subject && (MATH_SUBJECTS as readonly string[]).includes(subject);
}
export const SCIENCE_SUBJECTS: readonly StuckSubject[] = ['PHY', 'CHEM', 'BIO'];
export function isScience(subject: StuckSubject): boolean {
  return SCIENCE_SUBJECTS.includes(subject);
}

/** 'A Math' / 'AM' / 'S3_AM' / 'E Math' / 'EM' / 'S1' / 'H2 Math' / 'JC2' … → the subject key, or null. */
export function subjectKey(raw: string | null | undefined): StuckSubject | null {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (s === 'AM' || s === 'S3_AM' || s === 'S4_AM' || s === 'A_MATH' || s === 'A_MATHS' || s === 'ADDITIONAL_MATH') return 'AM';
  if (s === 'EM' || s === 'S3_EM' || s === 'S4_EM' || s === 'E_MATH' || s === 'E_MATHS' || s === 'EM_NA' || /^S[12](_NA)?$/.test(s) || s === 'MATH' || s === 'IP_MATH') return 'EM';
  if (s === 'H2' || s === 'H2_MATH' || s === 'JC' || s === 'JC1' || s === 'JC2' || s === 'H1_MATH') return 'H2';
  // the sciences: the Airtable / Notebook name, the bank's tree level, the Combined Science levels
  if (s === 'PHYSICS' || s === 'PHY' || s === 'PHYS' || s === 'PURE_PHYSICS' || s === 'CS_PHYS' || s === 'CS_PHY') return 'PHY';
  if (s === 'CHEMISTRY' || s === 'CHEM' || s === 'PURE_CHEMISTRY' || s === 'CS_CHEM') return 'CHEM';
  if (s === 'BIOLOGY' || s === 'BIO' || s === 'PURE_BIOLOGY' || s === 'CS_BIO') return 'BIO';
  return null;
}

export const SUBJECT_LABEL: Record<StuckSubject, string> = {
  AM: 'A Math', EM: 'E Math', H2: 'H2 Math', PHY: 'Physics', CHEM: 'Chemistry', BIO: 'Biology',
};

/**
 * An Airtable `Questions.Topic` value → {subject?, topic}. The bot writes
 * "AM: Trigonometry (Graphs)", "EM: Vectors" or a bare canonical name.
 */
export function parseAskTopic(raw: string | null | undefined): { subject: StuckSubject | null; topic: string } | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(AM|EM|H2|JC|S1|S2|S3_AM|S3_EM|PHY|CHEM|BIO)\s*:\s*(.+)$/i);
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
  // science: the bank tree's topics, merged where a school teaches them as one chapter
  PHY: {
    'Current of Electricity': 'Electricity', 'D.C. Circuits': 'Electricity', 'Practical Electricity': 'Electricity',
    'Magnetism': 'Magnetism and Electromagnetism', 'Electromagnetism': 'Magnetism and Electromagnetism',
    'Electromagnetic Induction': 'Magnetism and Electromagnetism',
  },
  CHEM: {
    'Ionic Bonding': 'Chemical Bonding', 'Covalent Bonding and Structure': 'Chemical Bonding',
    'Hydrocarbons and Fuels': 'Organic Chemistry', 'Alcohols and Carboxylic Acids': 'Organic Chemistry', 'Macromolecules': 'Organic Chemistry',
    'Acids and Bases': 'Acids, Bases and Salts', 'Salts': 'Acids, Bases and Salts',
  },
  BIO: {
    'Sexual Reproduction in Humans': 'Reproduction', 'Sexual Reproduction in Plants': 'Reproduction',
    'Coordination and Response (Hormones)': 'Coordination and Response', 'Coordination and Response (Nervous System)': 'Coordination and Response',
    'The Eye': 'Coordination and Response',
  },
};

/** The family prefix that is one area for A Math / H2 ("Trigonometry (Graphs)" → "Trigonometry"). */
const FAMILY_AREAS: Record<StuckSubject, string[]> = {
  AM: ['Trigonometry', 'Differentiation', 'Integration'],
  EM: [],
  H2: ['Differentiation', 'Integration', 'Distributions'],
  PHY: [], CHEM: [], BIO: [],
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

// ── science: the marker's words → the science bank's tree topics ──
const PHY_RULES: Rule[] = [
  { re: /radioactiv|half-life|alpha|beta|gamma|nuclear|isotope/, topic: 'Radioactivity' },
  { re: /electromagnetic spectrum|e\.?m\.? spectrum|x-rays?|microwaves?|infra-?red|ultraviolet|radio waves/, topic: 'Electromagnetic Spectrum' },
  { re: /electromagnetic induction|induced (e\.?m\.?f|current)|faraday|lenz|transformer|generator|dynamo/, topic: 'Electromagnetic Induction' },
  { re: /electromagnet|left-hand rule|motor|force on a (current|conductor)|solenoid/, topic: 'Electromagnetism', unless: /spectrum|induc/ },
  { re: /magnet/, topic: 'Magnetism', unless: /electromagnet/ },
  { re: /static|electrostatic|charging by|earthing|electric field/, topic: 'Static Electricity' },
  { re: /practical electricity|mains|fuse|earth wire|kilowatt-?hour|kwh|cost of electricity|electrical safety|power rating/, topic: 'Practical Electricity' },
  { re: /circuit|series and parallel|potential divider|thermistor|\bldr\b|resistors? in/, topic: 'D.C. Circuits' },
  { re: /electric|current|resistance|ohm|voltage|potential difference|e\.?m\.?f/, topic: 'Current of Electricity', generic: true },
  { re: /lens|refraction|reflection|total internal|critical angle|ray diagram|light/, topic: 'Light' },
  { re: /sound|echo|ultrasound|pitch|loudness/, topic: 'Sound' },
  { re: /waves?\b|wavelength|frequency|amplitude|ripple/, topic: 'General Wave Properties' },
  { re: /kinematic|velocity|acceleration|speed-time|displacement|free fall|terminal velocity/, topic: 'Kinematics' },
  { re: /moments?\b|turning effect|centre of gravity|stability|lever/, topic: 'Turning Effect of Forces' },
  { re: /pressure|manometer|barometer|hydraulic/, topic: 'Pressure' },
  { re: /density|mass and weight|mass, weight|weight|gravitational field strength/, topic: 'Mass Weight and Density' },
  { re: /work done|energy|power\b|efficiency|kinetic energy|potential energy/, topic: 'Energy Work and Power' },
  { re: /forces?|newton|friction|resultant|momentum|inertia/, topic: 'Forces' },
  { re: /kinetic (particle|model)|brownian|gas laws?|boyle/, topic: 'Kinetic Particle Theory' },
  { re: /thermal|heat|temperature|conduction|convection|radiation|latent|specific heat|melting|boiling|evaporation|cooling curve/, topic: 'Thermal Properties of Matter' },
  { re: /measurement|vernier|micrometer|precision|scalars?|vectors?|si units?|prefix/, topic: 'Measurement' },
];

const CHEM_RULES: Rule[] = [
  { re: /electroly|electrolysis|electrode|electroplat|electrochem|simple cells?|fuel cells?/, topic: 'Electrolysis' },
  { re: /redox|oxidation|reduction|oxidising|reducing agent|oxidation state/, topic: 'Oxidation and Reduction' },
  { re: /rates? of reaction|speed of reaction|reaction rate|collision theory|catalys/, topic: 'Rate of Reaction' },
  { re: /energy (changes?|from chemicals|profile)|energetics|enthalpy|exotherm|endotherm|bond energ/, topic: 'Energy from Chemicals' },
  { re: /mole concept|moles?\b|stoichiometr|chemical calculations?|reacting mass|limiting|titration|empirical|percentage yield|purity calc|concentration/, topic: 'Chemical Calculations' },
  { re: /formulae and equations|chemical equations?|ionic equations?|balancing/, topic: 'Chemical Formulae and Equations' },
  { re: /qualitative analysis|cation|anion|gas tests?|tests? for (ions|gases)|precipitat|haber|ammonia|fertilis|salt preparation|\bsalts?\b|solubility/, topic: 'Salts' },
  { re: /acids?|bases?\b|alkali|\bph\b|neutralis|oxides/, topic: 'Acids and Bases' },
  { re: /periodic table|group (1|17|18|i|vii|0)|halogen|alkali metals|noble gas|transition (metal|element)/, topic: 'The Periodic Table' },
  { re: /metals?\b|reactivity series|extraction|rust|corrosion|alloy/, topic: 'Metals', unless: /alkali metals|transition metals?/ },
  { re: /ionic bond|ionic compound|ionic lattice/, topic: 'Ionic Bonding' },
  { re: /covalent|giant (covalent|molecular)|simple molecular|intermolecular|structure and bonding|chemical bonding|bonding/, topic: 'Covalent Bonding and Structure' },
  { re: /atomic structure|isotope|electronic configuration|protons?|neutrons?|electrons? (shell|arrangement)/, topic: 'Atomic Structure' },
  { re: /polymer|macromolecul|nylon|terylene|plastic|silicone|condensation polymer|addition polymer/, topic: 'Macromolecules' },
  { re: /alcohol|ethanol|fermentation|carboxylic|ester/, topic: 'Alcohols and Carboxylic Acids' },
  { re: /alkanes?|alkenes?|crude oil|cracking|hydrocarbon|fuels?|homologous|isomer|unsaturat/, topic: 'Hydrocarbons and Fuels' },
  { re: /organic/, topic: 'Hydrocarbons and Fuels', generic: true },
  { re: /air\b|atmosphere|pollut|carbon cycle|greenhouse|global warming|ozone|acid rain|environment|combustion/, topic: 'Atmosphere and Environment' },
  { re: /separation|chromatograph|purification|distillation|filtration|crystallis|purity/, topic: 'Methods of Purification' },
  { re: /kinetic particle|diffusion|states of matter|changes of state/, topic: 'Kinetic Particle Theory' },
  { re: /elements, compounds|compounds and mixtures|mixtures/, topic: 'Elements, Compounds and Mixtures' },
  { re: /measurement|apparatus/, topic: 'Measurement' },
];

const BIO_RULES: Rule[] = [
  { re: /immun|antibod|vaccin|antibiotic|pathogen|disease|micro-?organism|bacteri|virus|biotechnolog|genetic engineering/, topic: 'Microorganisms and Biotechnology', unless: /coronary heart disease/ },
  { re: /protein synthesis|\bdna\b|gene mutation|molecular genetics|mutation/, topic: 'Molecular Genetics' },
  { re: /inheritance|monohybrid|genetic cross|alleles?|genotype|phenotype|pedigree|dominant|recessive/, topic: 'Inheritance' },
  { re: /variation|natural selection|evolution|selection/, topic: 'Variation and Selection' },
  { re: /cell division|mitosis|meiosis|asexual/, topic: 'Cell Division' },
  { re: /human reproduction|reproductive|contracepti|menstrua|pregnan|placenta|prostate|sexual reproduction in humans/, topic: 'Sexual Reproduction in Humans' },
  { re: /pollinat|plant reproduction|\bflowers?\b|seed dispersal|germination|sexual reproduction in plants/, topic: 'Sexual Reproduction in Plants' },
  { re: /reproduction/, topic: 'Sexual Reproduction in Humans', generic: true },
  { re: /\beye\b|retina|pupil|accommodation/, topic: 'The Eye' },
  { re: /nervous|neuron|reflex|synapse/, topic: 'Coordination and Response (Nervous System)' },
  { re: /hormon|insulin|glucagon|adrenaline|endocrine/, topic: 'Coordination and Response (Hormones)' },
  { re: /homeostasis|temperature regulation|blood glucose|negative feedback/, topic: 'Homeostasis' },
  { re: /excretion|kidney|nephron|urine|dialysis/, topic: 'Excretion' },
  { re: /respiration|gas exchange|alveol|anaerobic|aerobic|breathing/, topic: 'Respiration and Gas Exchange' },
  { re: /transpiration|transport in (flowering )?plants|xylem|phloem|stomata|translocation|wilting|plant transport/, topic: 'Transport in Plants' },
  { re: /transport in humans|heart|blood|circulat|arter|vein|capillar/, topic: 'Transport in Humans' },
  { re: /\btransport\b/, topic: 'Transport in Humans', unless: /active transport|plant/ },
  { re: /photosynthesis|nutrition in plants|plant nutrition|leaf (structure|adaptation)|chlorophyll|limiting factor/, topic: 'Nutrition in Plants' },
  { re: /digestion|nutrition in humans|diet|peristalsis|absorption|alimentary|small intestine|\bnutrition\b/, topic: 'Nutrition in Humans' },
  { re: /enzyme/, topic: 'Enzymes' },
  { re: /osmosis|diffusion|active transport|movement of substances|water potential/, topic: 'Movement of Substances' },
  { re: /biological molecules|food tests?|benedict|biuret|carbohydrate|protein|lipid|fats?\b/, topic: 'Biological Molecules' },
  { re: /impact of humans|deforestation|conservation|pollution|biomagnification|eutrophication/, topic: 'Impact of Humans on the Environment' },
  { re: /ecology|ecosystem|food (chain|web)|energy flow|pyramids? of|nitrogen cycle|carbon cycle|environment/, topic: 'Organisms and their Environment' },
  { re: /cell structure|organelle|specialised cells?|\bcells?\b|tissue|organisation/, topic: 'Cell Structure and Organisation' },
];

const RULES: Record<StuckSubject, Rule[]> = { AM: AM_RULES, EM: EM_RULES, H2: H2_RULES, PHY: PHY_RULES, CHEM: CHEM_RULES, BIO: BIO_RULES };

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

/** One HEAD — detail piece of a marker text → its canonical topics (uncapped, may repeat an area). */
function pieceTopics(subject: StuckSubject, t: string): string[] {
  const cut = t.search(/\s[—–]\s|\s-\s|:\s/);
  const head = cut > 0 ? t.slice(0, cut) : t;
  const headHits = scan(subject, head);
  const all = scan(subject, t);
  if (!headHits.length) return all.map((h) => h.topic);
  // a catch-all head is refined by the detail inside the same area
  // ("differentiation — tangents and normals" → Tangents and Normals); a
  // specific head stays as it is ("trigonometric equations — double angle")
  return headHits.map((h) => {
    if (!h.generic) return h.topic;
    const area = areaOf(subject, h.topic);
    const fam = familyOf(h.topic);
    return all.find((x) => !x.generic && (areaOf(subject, x.topic) === area || (fam && familyOf(x.topic) === fam)))?.topic ?? h.topic;
  });
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
  // a science text lists its topics with ';' or '/' ("Rate of reaction; Chemical
  // bonding", "Mole concept / Redox") — each piece is its own HEAD — detail text
  const pieces = isScience(subject) ? t.split(/\s*(?:;|\/)\s*/).filter(Boolean) : [t];
  const picked = pieces.flatMap((piece) => pieceTopics(subject, piece));
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
