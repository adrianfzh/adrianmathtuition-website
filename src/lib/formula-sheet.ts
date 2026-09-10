// The formula sheet that grows (SPEC-NOTEBOOK-V2 §5, Adrian 11 Sep 2026: "yes
// do it"). Not the syllabus list: the formulas for the topics THIS student has
// met — in marked papers, asks, photos and practice — with the ones that cost
// marks flagged. Built once, shown twice: /app/my-notes/formulas and the
// formulas section of Before the paper (§4).
//
// Sources: Adrian's `formula_ref` rows through the teaching-knowledge layer
// (lib/teaching-knowledge.ts — `formula_ref` is filed by AREA, e.g. 'Trig',
// 'Indices/Logs', so topics are mapped to areas here before the RPC call), the
// public formula pages under /formulas (one link per topic that has one), and
// the Notebook's live mistakes for the ⚠ marks. Pure: the store hands in the
// rows, this shapes the sections.
import type { KnowledgeFormula } from './teaching-knowledge';
import type { StreamItem } from './notebook-stream';
import { getTopicsForPaperLevel } from './canonical-topics';

export type SeenVia = 'paper' | 'ask' | 'photo';

export interface TopicSeen {
  topic: string;
  /** 'A Math' | 'E Math' | 'H2 Math' when the source knew (a mistake's paper); else null. */
  subject: string | null;
  via: SeenVia[];
  /** Newest sighting, ISO. */
  at: string;
}

export interface FormulaWatch { title: string; where: string }

export interface FormulaLine extends KnowledgeFormula {
  /** The live mistake that names this formula, when one does. */
  misapplied: FormulaWatch | null;
}

export interface FormulaSection {
  topic: string;
  levelKey: string;
  via: SeenVia[];
  at: string;
  page: { href: string; title: string } | null;
  formulae: FormulaLine[];
  /** A live mistake in this topic (marks lost here), when there is one and no formula line claimed it. */
  watch: FormulaWatch | null;
}

const fold = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The topics the student has met, from the stream: newest sighting and how it was met. */
export function topicsMet(items: readonly StreamItem[]): TopicSeen[] {
  const by = new Map<string, TopicSeen>();
  for (const it of items) {
    const topic = (it.topic || '').trim();
    if (!topic) continue;
    const via: SeenVia | null = it.kind === 'mistake' ? 'paper' : it.kind === 'saved' || it.kind === 'skill' ? 'ask' : it.kind === 'photo' || it.kind === 'clip' ? 'photo' : null;
    if (!via) continue;
    const key = fold(topic);
    const cur = by.get(key);
    if (!cur) by.set(key, { topic, subject: it.subject ?? null, via: [via], at: it.at });
    else {
      if (!cur.via.includes(via)) cur.via.push(via);
      if (it.at > cur.at) cur.at = it.at;
      if (!cur.subject && it.subject) cur.subject = it.subject;
    }
  }
  return [...by.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.topic.localeCompare(b.topic)));
}

// ── formula_ref areas ────────────────────────────────────────────────────────
// formula_ref files by area, not canonical topic. Only A Math rows exist (11 Sep
// 2026: 20 rows — Algebra, Calculus, Coord geom, Indices/Logs, Trig); E Math and
// H2 topics get their formula page link and no lines until rows are filed.
const AREA_RULES: [RegExp, string][] = [
  [/logarithm|indices|surds|linear law/, 'Indices/Logs'],
  [/trigonometr/, 'Trig'],
  [/differentiation|integration|kinematics|calculus/, 'Calculus'],
  [/coordinate|circles?\b/, 'Coord geom'],
  [/quadratic|simultaneous|nature of roots|polynomial|partial fraction|binomial|algebra/, 'Algebra'],
];

/** The formula_ref areas a topic draws from (empty when none matches). */
export function formulaAreasFor(topic: string): string[] {
  const t = fold(topic);
  return AREA_RULES.filter(([re]) => re.test(t)).map(([, area]) => area);
}

export function areaMatchesTopic(area: string | null, topic: string): boolean {
  if (!area) return false;
  return formulaAreasFor(topic).some(a => fold(a) === fold(area));
}

// ── the public formula pages ─────────────────────────────────────────────────
type PageRule = [RegExp, string, string];
const AM_PAGES: PageRule[] = [
  [/logarithm/, 'logarithms', 'Logarithms'],
  [/indices|surds/, 'indices', 'Indices & Surds'],
  [/trigonometr/, 'trigo', 'Trigonometry'],
  [/differentiation|kinematics/, 'differentiation', 'Differentiation'],
  [/coordinate|circles?\b/, 'coordinate-geometry', 'Coordinate Geometry & Circles'],
  [/partial fraction/, 'partial-fractions', 'Partial Fractions'],
  [/polynomial|cubic|factori[sz]ation/, 'factorization-cubics', 'Polynomials & Cubics'],
  [/exponential|linear law/, 'exponential-log-graphs', 'Exponential & Log Graphs'],
];
const EM_PAGES: PageRule[] = [
  [/circular measure/, 'em-circular-measure', 'Circular Measure'],
  [/congruen|similar/, 'em-congruency-similarity', 'Congruency & Similarity'],
  [/coordinate/, 'em-coordinate-geometry', 'Coordinate Geometry'],
  [/standard form/, 'em-standard-form', 'Standard Form'],
  [/indices/, 'em-indices', 'Indices'],
  [/interest|hire purchase/, 'em-interest', 'Interest'],
  [/mensuration/, 'em-mensuration', 'Mensuration'],
  [/polygon|angles/, 'em-polygons', 'Angles & Polygons'],
  [/\bsets?\b/, 'em-sets', 'Sets'],
  [/statistic/, 'em-statistics', 'Statistics'],
  [/trigonometr|pythagoras/, 'em-trigonometry', 'Trigonometry'],
  [/vector/, 'em-vectors', 'Vectors'],
];
const JC_PAGES: PageRule[] = [
  [/complex/, 'jc-complex', 'Complex Numbers'],
  [/differentiation|maclaurin/, 'jc-differentiation', 'Differentiation'],
  [/function/, 'jc-functions', 'Functions'],
  [/graphing|parametric|inequalit/, 'jc-graphing', 'Graphing Techniques'],
  [/integration/, 'jc-integration', 'Integration'],
  [/apgp|series|sequence/, 'jc-sequences', 'Sequences & Series'],
  [/vector/, 'jc-vectors', 'Vectors'],
];

/** Which family of formula pages a practice level key belongs to. */
export function pageFamily(levelKey: string): 'AM' | 'EM' | 'JC' | null {
  const k = levelKey.toUpperCase();
  if (k.startsWith('JC')) return 'JC';
  if (k.includes('AM')) return 'AM';
  if (k.includes('EM') || k === 'S1' || k === 'S2') return 'EM';
  return null;
}

/** The /formulas page for a topic at a level, or null when Adrian has not written one. */
export function formulaPageFor(topic: string, levelKey: string): { href: string; title: string } | null {
  const fam = pageFamily(levelKey);
  if (!fam) return null;
  const rules = fam === 'AM' ? AM_PAGES : fam === 'EM' ? EM_PAGES : JC_PAGES;
  const t = fold(topic);
  const hit = rules.find(([re]) => re.test(t));
  return hit ? { href: `/formulas/${hit[1]}`, title: hit[2] } : null;
}

// ── which level a topic sits at ──────────────────────────────────────────────
function keyForSubject(subject: string | null, levelKeys: readonly string[]): string | null {
  const s = fold(subject);
  const want = s.startsWith('a math') ? 'AM' : s.startsWith('e math') ? 'EM' : s.includes('h2') || s.includes('h1') ? 'JC' : null;
  if (!want) return null;
  return levelKeys.find(k => k.toUpperCase().includes(want)) ?? null;
}

/** The student's level key a topic belongs to: the paper's subject when known, else the first canonical list that names it, else the first key. */
export function levelKeyForTopic(topic: string, subject: string | null, levelKeys: readonly string[]): string | null {
  if (!levelKeys.length) return null;
  const bySubject = keyForSubject(subject, levelKeys);
  if (bySubject) return bySubject;
  const t = fold(topic);
  for (const key of levelKeys) {
    for (const cat of getTopicsForPaperLevel(key)) {
      if (cat.topics.some(x => fold(x) === t)) return key;
    }
  }
  return levelKeys[0];
}

// ── the sheet ────────────────────────────────────────────────────────────────
const NOISE = new Set(['formula', 'rule', 'theorem', 'law', 'laws', 'the', 'of', 'and', 'for', 'with', 'general', 'term']);
/** "R-formula" → ['r-formula']; "Quadratic formula" → ['quadratic']; "Chain rule" → ['chain']. A hyphenated name stays whole — "R-formula" is the name. */
function distinctiveWords(s: string): string[] {
  const out: string[] = [];
  for (const tok of fold(s).replace(/[^a-z0-9 -]+/g, ' ').split(' ')) {
    if (tok.includes('-') && tok.length > 3) out.push(tok);
    for (const w of tok.split('-')) if (w.length > 3 && !NOISE.has(w)) out.push(w);
  }
  return out;
}

/** The live mistake in a topic that names this formula ("R-formula", "quadratic formula", "chain rule"). */
function mistakeNaming(formula: KnowledgeFormula, mistakes: readonly StreamItem[]): FormulaWatch | null {
  const words = distinctiveWords(formula.result);
  if (!words.length) return null;
  for (const m of mistakes) {
    const title = fold(m.title);
    if (words.some(w => title.includes(w))) return { title: m.title, where: m.mistake?.where ?? '' };
  }
  return null;
}

export function buildFormulaSheet(input: {
  topics: readonly TopicSeen[];
  levelKeys: readonly string[];
  /** formula_ref lines per level key, as the store loaded them. */
  formulaeByLevel: Record<string, KnowledgeFormula[]>;
  /** Live mistake items (kind 'mistake', mistake.live) — the ⚠ marks. */
  liveMistakes: readonly StreamItem[];
}): FormulaSection[] {
  const sections: FormulaSection[] = [];
  const claimed = new Set<string>();
  for (const t of input.topics) {
    const levelKey = levelKeyForTopic(t.topic, t.subject, input.levelKeys);
    if (!levelKey) continue;
    const inTopic = input.liveMistakes.filter(m => fold(m.topic) === fold(t.topic));
    const lines: FormulaLine[] = (input.formulaeByLevel[levelKey] ?? [])
      .filter(f => areaMatchesTopic(f.area, t.topic))
      .filter(f => { const k = `${levelKey}|${fold(f.result)}`; if (claimed.has(k)) return false; claimed.add(k); return true; })
      .map(f => ({ ...f, misapplied: mistakeNaming(f, inTopic) }));
    const named = new Set(lines.filter(l => l.misapplied).map(l => l.misapplied!.title));
    const first = inTopic.find(m => !named.has(m.title));
    sections.push({
      topic: t.topic, levelKey, via: t.via, at: t.at,
      page: formulaPageFor(t.topic, levelKey),
      formulae: lines,
      watch: first ? { title: first.title, where: first.mistake?.where ?? '' } : null,
    });
  }
  return sections;
}

/** The sections a Before-the-paper page shows: those whose topic the exam tests. */
export function sectionsForTopics(sections: readonly FormulaSection[], match: (topic: string) => boolean): FormulaSection[] {
  return sections.filter(s => match(s.topic));
}

/** "Seen in a marked paper · an ask · a photo" */
export function viaLine(via: readonly SeenVia[]): string {
  const words: Record<SeenVia, string> = { paper: 'a marked paper', ask: 'an ask', photo: 'a photo' };
  return `Seen in ${via.map(v => words[v]).join(' · ')}`;
}
