// Score forecast (17 Sep 2026, Adrian: "predict what a student will score on
// the 2025 and 2024 actual O-level exam, based on what is observed when they
// submit papers — do they have the required skills in each topic").
//
// Pure. Three steps:
//   1. buildProfile — from the student's marked papers, the share of marks
//      won per canonical topic, weighted towards recent papers (half-life
//      PROFILE_HALF_LIFE_DAYS), with the careless share kept separately.
//   2. forecastPaper — lay a real paper (its questions' topics and marks)
//      over the profile: expected marks per question, a RANGE for the paper,
//      the marks "unknown" (topics never seen), and the topics that cost most.
//   3. backtest — predict a paper the student already sat from their OTHER
//      papers and compare with the real total; the mean error over every such
//      pair is the honest accuracy figure (the gate for ever showing students).
//
// Topics: the bank's canonical names ("Differentiation (Techniques)",
// "Algebra (Fractions)"). A marked question on a GCE paper joins the bank row
// by question number (exact topics); any other marked question goes through
// canonicalTopic(), a keyword map from the marker's free-text topic.

export type Level = 'AM' | 'EM';

export interface ProfileQuestion {
  /** Canonical topics the question tests (usually one). */
  topics: string[];
  awarded: number;
  max: number;
  /** Marks lost to careless / arithmetic slips (kept apart from concept loss). */
  carelessLost?: number;
}
export interface ProfilePaper {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  questions: ProfileQuestion[];
}
export interface TopicStat {
  topic: string;
  /** Weighted marks won / available. */
  won: number;
  avail: number;
  /** Unweighted marks available — how much evidence. */
  evidence: number;
  rate: number;
  carelessLost: number;
}
export interface ProfileMeta {
  /** Marks won / available across all papers, recency-weighted. */
  overall: number;
  /** Concept rate: (won + careless) / available — what the student knows, before slips. */
  concept: number;
  /** Careless marks lost per mark available, recency-weighted. */
  carelessRate: number;
  /** Improvement in the overall rate per 30 days, fitted over the papers (0 when too few or too close together). */
  trendPer30d: number;
  /** The overall rate projected to `now` from the fitted trend, clamped. */
  projected: number;
  papers: number;
}
export type Profile = Map<string, TopicStat> & { meta?: ProfileMeta };

/** The trend is trusted only across ≥ 3 papers spanning ≥ 21 days, and never moves the forecast more than this. */
const TREND_MIN_PAPERS = 3;
const TREND_MIN_SPAN_DAYS = 21;
const TREND_MAX_SHIFT = 0.12;
/** Improvement assumed per 30 days when a student's own trend cannot be fitted yet (rate points, 0.03 = 3 %). */
export const DEFAULT_TREND_PER_30D = Number(process.env.FORECAST_DEFAULT_TREND ?? '0.03');

export const PROFILE_HALF_LIFE_DAYS = 45;
/** Below this much evidence on a topic, the rate is shrunk towards the student's overall rate. */
const PRIOR_MARKS = 6;

const DAY = 86400_000;

export function buildProfile(papers: readonly ProfilePaper[], now: Date | string = new Date()): Profile {
  const t0 = typeof now === 'string' ? Date.parse(now) : now.getTime();
  const acc = new Map<string, { won: number; avail: number; evidence: number; careless: number }>();
  let wonAll = 0, availAll = 0;
  for (const p of papers) {
    const age = Math.max(0, (t0 - Date.parse(p.date + 'T00:00:00Z')) / DAY);
    const w = Math.pow(0.5, age / PROFILE_HALF_LIFE_DAYS);
    for (const q of p.questions) {
      if (!(q.max > 0) || !q.topics.length) continue;
      const share = 1 / q.topics.length;
      for (const t of q.topics) {
        const a = acc.get(t) ?? { won: 0, avail: 0, evidence: 0, careless: 0 };
        a.won += w * q.awarded * share; a.avail += w * q.max * share; a.evidence += q.max * share; a.careless += (q.carelessLost ?? 0) * share;
        acc.set(t, a);
      }
      wonAll += w * q.awarded; availAll += w * q.max;
    }
  }
  const overall = availAll > 0 ? wonAll / availAll : 0.7;
  // Careless: slips are lost marks the student KNOWS how to avoid — kept out of the
  // topic rates (concept) and charged once per paper instead.
  let carelessAll = 0;
  for (const a of acc.values()) carelessAll += a.careless;
  const evidenceAll = [...acc.values()].reduce((x, a) => x + a.evidence, 0);
  const carelessRate = evidenceAll > 0 ? Math.min(0.15, carelessAll / evidenceAll) : 0;
  // The improvement trend (17 Sep 2026): the overall rate per paper against its date,
  // weighted least squares, projected to `now`. A student at 60 % in June and 80 %
  // last week is heading up; the average alone forecast 9 marks low on A Math.
  const pts = papers.filter(p => p.questions.some(q => q.max > 0)).map(p => {
    const won = p.questions.reduce((x, q) => x + q.awarded, 0), avail = p.questions.reduce((x, q) => x + q.max, 0);
    return { t: (t0 - Date.parse(p.date + 'T00:00:00Z')) / DAY, y: avail > 0 ? won / avail : 0, w: avail };
  });
  // Too few papers to fit a trend → the default improvement a student on tuition
  // shows (DEFAULT_TREND_PER_30D, set from the back-test over every sat GCE paper).
  let trendPer30d = DEFAULT_TREND_PER_30D;
  if (pts.length >= TREND_MIN_PAPERS) {
    const span = Math.max(...pts.map(p => p.t)) - Math.min(...pts.map(p => p.t));
    if (span >= TREND_MIN_SPAN_DAYS) {
      const W = pts.reduce((x, p) => x + p.w, 0);
      const mt = pts.reduce((x, p) => x + p.w * p.t, 0) / W, my = pts.reduce((x, p) => x + p.w * p.y, 0) / W;
      const sxx = pts.reduce((x, p) => x + p.w * (p.t - mt) ** 2, 0);
      const sxy = pts.reduce((x, p) => x + p.w * (p.t - mt) * (p.y - my), 0);
      // t counts days AGO, so a rising student has a negative slope in t; flip the sign.
      if (sxx > 0) trendPer30d = -(sxy / sxx) * 30;
    }
  }
  // Projection: from the weighted mean date to now, capped so one hot paper cannot run away.
  const meanAge = pts.length ? pts.reduce((x, p) => x + p.w * p.t, 0) / pts.reduce((x, p) => x + p.w, 0) : 0;
  const shift = Math.max(-TREND_MAX_SHIFT, Math.min(TREND_MAX_SHIFT, trendPer30d * (meanAge / 30)));
  const projected = Math.max(0, Math.min(1, overall + shift));
  const out: Profile = new Map();
  for (const [topic, a] of acc) {
    // Concept rate (slips added back), shrunk towards the overall concept rate when thin,
    // then lifted by the same trend shift the whole student shows.
    const conceptAll = Math.min(1, overall + carelessRate);
    const raw = a.avail > 0 ? Math.min(1, (a.won + a.careless * (a.avail / Math.max(1, a.evidence))) / a.avail) : conceptAll;
    const k = a.evidence / (a.evidence + PRIOR_MARKS);
    const rate = Math.max(0, Math.min(1, k * raw + (1 - k) * conceptAll + shift));
    out.set(topic, { topic, won: a.won, avail: a.avail, evidence: a.evidence, rate, carelessLost: a.careless });
  }
  out.meta = { overall, concept: Math.min(1, overall + carelessRate), carelessRate, trendPer30d: Math.round(trendPer30d * 1000) / 1000, projected, papers: pts.length };
  return out;
}

export interface TargetQuestion { number: string; topics: string[]; marks: number }
export interface TargetPaper { key: string; label: string; total: number; questions: TargetQuestion[] }

export interface TopicLoss { topic: string; marks: number; expectedLost: number; known: boolean }
export interface Forecast {
  key: string;
  label: string;
  total: number;
  expected: number;
  low: number;
  high: number;
  /** Marks on topics the student has never been tested on. */
  unknownMarks: number;
  /** Topics ordered by expected marks lost, biggest first (known topics only). */
  losses: TopicLoss[];
  /** How much of the paper the profile could speak to, 0..1. */
  coverage: number;
  /** Marks expected to go to careless slips on this paper (already taken off `expected`). */
  carelessExpected: number;
  /** The student's improvement per 30 days that was applied (0 when not trusted). */
  trendPer30d: number;
}

export function forecastPaper(profile: Profile, target: TargetPaper): Forecast {
  let expected = 0, variance = 0, unknownMarks = 0, knownMarks = 0;
  const overall = overallRate(profile);
  const byTopic = new Map<string, TopicLoss>();
  for (const q of target.questions) {
    if (!(q.marks > 0)) continue;
    const share = q.topics.length ? 1 / q.topics.length : 1;
    const topics = q.topics.length ? q.topics : ['Other'];
    for (const t of topics) {
      const m = q.marks * share;
      const stat = profile.get(t);
      const known = !!stat && stat.evidence >= 2;
      const p = known ? stat!.rate : overall;
      expected += m * p;
      // Sampling noise on the topic rate: p(1-p) shrinks with evidence; unknown topics get a wide band.
      const n = known ? stat!.evidence : 2;
      variance += m * m * p * (1 - p) / Math.max(1, n / 2);
      if (known) knownMarks += m; else unknownMarks += m;
      const row = byTopic.get(t) ?? { topic: t, marks: 0, expectedLost: 0, known };
      row.marks += m; row.expectedLost += m * (1 - p); row.known = row.known && known;
      byTopic.set(t, row);
    }
  }
  const carelessExpected = (profile.meta?.carelessRate ?? 0) * target.total;
  expected -= carelessExpected;
  const band = Math.sqrt(variance) + 0.35 * unknownMarks;
  const losses = [...byTopic.values()].filter(r => r.known && r.expectedLost >= 0.5).sort((a, b) => b.expectedLost - a.expectedLost);
  return {
    key: target.key, label: target.label, total: target.total,
    carelessExpected: round1(carelessExpected), trendPer30d: profile.meta?.trendPer30d ?? 0,
    expected: round1(expected),
    low: Math.max(0, Math.round(expected - band)),
    high: Math.min(target.total, Math.round(expected + band)),
    unknownMarks: round1(unknownMarks), losses,
    coverage: knownMarks + unknownMarks > 0 ? round2(knownMarks / (knownMarks + unknownMarks)) : 0,
  };
}

export function overallRate(profile: Profile): number {
  // The unseen-topic rate: the student's projected concept rate (the trend applied), else the plain mean.
  if (profile.meta) return Math.max(0, Math.min(1, profile.meta.projected + profile.meta.carelessRate));
  let won = 0, avail = 0;
  for (const s of profile.values()) { won += s.won; avail += s.avail; }
  return avail > 0 ? won / avail : 0.7;
}

export interface BacktestCase {
  studentId: string;
  paperKey: string;
  /** Actual score scaled to the target's total. */
  actual: number;
  forecast: Forecast;
}
export interface BacktestSummary {
  n: number;
  meanAbsError: number;
  within5: number;
  within8: number;
  /** Positive = the forecast runs high. */
  bias: number;
}

/** Predict each sat GCE paper from the student's OTHER papers; summarise the error. */
export function backtest(
  students: readonly { studentId: string; papers: readonly (ProfilePaper & { gceKey?: string | null; actual?: number | null; total?: number | null })[] }[],
  targets: ReadonlyMap<string, TargetPaper>,
  now: Date | string = new Date(),
  /** `priorOnly`: predict from papers sat BEFORE the target only, as a real forecast must (no later improvement leaks in). */
  opts: { priorOnly?: boolean } = {},
): { cases: BacktestCase[]; summary: BacktestSummary } {
  const cases: BacktestCase[] = [];
  for (const s of students) {
    for (const p of s.papers) {
      if (!p.gceKey || p.actual == null || !(p.total && p.total > 0)) continue;
      const target = targets.get(p.gceKey);
      if (!target) continue;
      const others = s.papers.filter(o => o.id !== p.id && (!opts.priorOnly || o.date < p.date));
      if (!others.length) continue;
      const f = forecastPaper(buildProfile(others, opts.priorOnly ? p.date : now), target);
      cases.push({ studentId: s.studentId, paperKey: p.gceKey, actual: round1(p.actual / p.total * target.total), forecast: f });
    }
  }
  const errs = cases.map(c => c.forecast.expected - c.actual);
  const n = errs.length;
  return {
    cases,
    summary: {
      n,
      meanAbsError: n ? round1(errs.reduce((a, e) => a + Math.abs(e), 0) / n) : 0,
      within5: n ? round2(errs.filter(e => Math.abs(e) <= 5).length / n) : 0,
      within8: n ? round2(errs.filter(e => Math.abs(e) <= 8).length / n) : 0,
      bias: n ? round1(errs.reduce((a, e) => a + e, 0) / n) : 0,
    },
  };
}

// ── The marker's free-text topic → the bank's canonical topic ───────────────
// Ordered: the first rule whose words appear wins, so put the specific before
// the general ("partial fractions" before "fractions", "r-formula" before "trig").
const AM_RULES: [RegExp, string][] = [
  [/partial fraction/, 'Partial Fractions'],
  [/binomial/, 'Binomial Theorem'],
  [/r-formula|r formula|r cos|r sin/, 'Trigonometry (R-Formula)'],
  [/trig.*(graph|sketch)/, 'Trigonometry (Graphs)'],
  [/trig.*(identit|prov)/, 'Trigonometry (Identities)'],
  [/trig.*equation|solve.*trig/, 'Trigonometry (Equations)'],
  [/trigonometr/, 'Trigonometry (Identities)'],
  [/linear law/, 'Linear Law'],
  [/log/, 'Logarithms'],
  [/indices|exponential/, 'Indices'],
  [/surd/, 'Surds'],
  [/kinematic|velocity|acceleration|displacement/, 'Kinematics'],
  [/integrat|area under|area between/, 'Integration (Area)'],
  [/tangent|normal/, 'Differentiation (Tangents and Normals)'],
  [/rate of change|rates of change|connected rate/, 'Differentiation (Rates of Change)'],
  [/stationary|maxim|minim|turning point/, 'Differentiation (Maximum and Minimum)'],
  [/increasing|decreasing/, 'Differentiation (Increasing and Decreasing Functions)'],
  [/differentiat|derivative|chain rule|product rule|quotient rule/, 'Differentiation (Techniques)'],
  [/nature of roots|discriminant/, 'Nature of Roots'],
  [/remainder|factor theorem|polynomial|cubic/, 'Polynomials'],
  [/quadratic|completing the square|modulus/, 'Quadratic Functions'],
  [/circle/, 'Circles'],
  [/plane geometry|similar|congruen|proof|cyclic|angle propert/, 'Plane Geometry'],
  [/coordinate/, 'Circles'],
];
const EM_RULES: [RegExp, string][] = [
  [/standard form/, 'Indices (Standard Form)'],
  [/indices|index/, 'Indices'],
  [/hcf|lcm|highest common|lowest common/, 'Numbers (HCF and LCM)'],
  [/prime/, 'Numbers (Prime Factorization)'],
  [/percent/, 'Numbers (Percentages)'],
  [/estimat|significant|rounding/, 'Numbers (Estimation)'],
  [/\bratio\b|\brate\b|\bspeed\b(?!.*graph)/, 'Numbers (Ratio)'],
  [/interest|hire purchase|financial|money|tax|exchange/, 'Financial Math (Interest)'],
  [/proportion|variation/, 'Proportion'],
  [/map scale/, 'Map Scales'],
  [/number pattern|sequence/, 'Number Patterns'],
  [/algebraic fraction|fraction/, 'Algebra (Fractions)'],
  [/simultaneous/, 'Algebra (Simultaneous Equations)'],
  [/inequalit/, 'Algebra (Inequalities)'],
  [/subject of|change the subject|changing the subject/, 'Algebra (Subject of Formula)'],
  [/factoris|factoriz/, 'Algebra (Factorization)'],
  [/expan/, 'Algebra (Expansion)'],
  [/quadratic graph|sketch.*quadratic/, 'Algebra (Quadratic Graphs)'],
  [/quadratic|discriminant|completing the square/, 'Algebra (Quadratic Equations)'],
  [/graph paper|plot|graph of/, 'Algebra (Graph on Graph Paper)'],
  [/linear equation|solve.*equation|equation/, 'Algebra (Linear Equations)'],
  [/identit/, 'Algebra (Identities)'],
  [/set notation|venn|\bsets?\b/, 'Sets'],
  [/probabilit/, 'Probability'],
  [/statistic|mean|median|mode|quartile|cumulative|histogram|stem|box/, 'Statistics'],
  [/matri/, 'Matrices'],
  [/vector/, 'Vectors'],
  [/speed.*time|distance.*time|travel graph/, 'Distance and Speed Time Graphs'],
  [/coordinate geometry|gradient|midpoint|length of line/, 'Coordinate Geometry'],
  [/circle propert|circle theorem|angle in.*circle|tangent/, 'Circle Properties'],
  [/arc|sector|radian|circular measure/, 'Circular Measure'],
  [/mensuration|volume|surface area|cone|cylinder|sphere|prism|pyramid/, 'Mensuration'],
  [/congruen|similar/, 'Congruency and Similarity'],
  [/construct/, 'Geometrical Constructions'],
  [/polygon|interior angle|exterior angle/, 'Polygons'],
  [/angle/, 'Angles'],
  [/bearing|trigonometr|sine rule|cosine rule|pythagoras|elevation|depression/, 'Trigonometry'],
  [/real world|real-world|context/, 'Math In Real World Context'],
];

/** The bank's canonical topic for a marker-detected topic string, or null when nothing fits. */
export function canonicalTopic(detected: string | null | undefined, level: Level): string | null {
  const s = String(detected ?? '').toLowerCase().replace(/^(am|em)\s*:\s*/, '').trim();
  if (!s) return null;
  for (const [re, topic] of level === 'AM' ? AM_RULES : EM_RULES) if (re.test(s)) return topic;
  return null;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
