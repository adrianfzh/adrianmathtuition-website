// The humanities question bank (SPEC-HUMANITIES.md §H1, 2 Oct 2026; H2, 3 Oct):
// our OWN source sets and questions, and the level scheme each skill is read
// against. Three files of sets — Social Studies source-based, Social Studies
// structured response, History source-based — and one file of schemes. Pure.
// A1 (7 Oct 2026): a fourth file, the Social Studies CASE STUDIES — the exam's
// shape: Background Information, Sources A–E/F, five linked questions (35 marks)
// ending with the 10-mark "how far" question. A case study is a set with a
// `background`; its questions are answered with every source of the set in view.
// Nothing here is a school's paper (docs/CONTENT-POLICY.md).
import schemesJson from '../../data/humanities/social-studies/schemes.json';
import setsJson from '../../data/humanities/social-studies/sets.json';
import structuredJson from '../../data/humanities/social-studies/structured.json';
import caseStudiesJson from '../../data/humanities/social-studies/case-studies.json';
import historyJson from '../../data/humanities/history/sets.json';
import geographyJson from '../../data/humanities/geography/sets.json';

export type HumanitiesSkill = 'inference' | 'comparison' | 'reliability' | 'usefulness' | 'purpose' | 'surprise' | 'how_far' | 'sr_explain' | 'sr_weigh' | 'geo_describe' | 'geo_explain';
/** The source skills — Social Studies and History share them. 'surprise' joined on 7 Oct 2026 (Adrian: "do it"). */
export const SOURCE_SKILLS: readonly HumanitiesSkill[] = ['inference', 'comparison', 'reliability', 'usefulness', 'purpose', 'surprise', 'how_far'];
/** The two structured-response parts (Social Studies): answered from own knowledge. */
export const STRUCTURED_SKILLS: readonly HumanitiesSkill[] = ['sr_explain', 'sr_weigh'];
/** Geography's point-marked parts (B, 7 Oct 2026): no level scheme — each question carries its own creditable points. */
export const POINTS_SKILLS: readonly HumanitiesSkill[] = ['geo_describe', 'geo_explain'];
export const HUMANITIES_SKILLS: readonly HumanitiesSkill[] = [...SOURCE_SKILLS, ...STRUCTURED_SKILLS];

export type HumanitiesSubject = 'social-studies' | 'history' | 'geography';
export type HumanitiesKind = 'source' | 'structured' | 'points';
export const SUBJECT_NAME: Record<HumanitiesSubject, string> = { 'social-studies': 'Social Studies', history: 'History', geography: 'Geography' };
/** Geography's clusters (the elective paper's three sections, with Geography in Everyday Life first). */
export type GeoCluster = 'everyday' | 'tourism' | 'climate' | 'tectonics';
export const GEO_CLUSTERS: readonly GeoCluster[] = ['everyday', 'tourism', 'climate', 'tectonics'];
export const GEO_CLUSTER_NAME: Record<GeoCluster, string> = { everyday: 'Geography in everyday life', tourism: 'Tourism', climate: 'Climate', tectonics: 'Tectonics' };

/** The three issues of the Social Studies syllabus. */
export type SsTheme = 'citizenship' | 'diversity' | 'globalised';
export const SS_THEMES: readonly SsTheme[] = ['citizenship', 'diversity', 'globalised'];
export const SS_THEME_NAME: Record<SsTheme, string> = {
  citizenship: 'Citizenship and governance',
  diversity: 'Living in a diverse society',
  globalised: 'Being part of a globalised world',
};

export interface HumanitiesSource { id: string; provenance: string; text: string }
/** A seeded answer: `level` is the level it was written at — or, on a point-marked question, the marks. */
export interface SeededAnswer { level: number; text: string }
/** One creditable point of a point-marked question; `develop` = what earns the second mark for it. */
export interface CreditPoint { id: string; text: string; develop?: string }
/** A small data table a Geography question gives ("Table 1"). */
export interface DataTable {
  caption: string; columns: string[]; rows: string[][];
  /** Draw the table as a figure ("Fig. 1") instead of showing it as a table. The reader still gets the numbers. */
  figure?: 'bar' | 'line' | 'climate';
}
export interface HumanitiesQuestion {
  id: string;
  skill: HumanitiesSkill;
  sources: string[];
  question: string;
  /** The exam's marks for this question — a case study only. Shown beside the question; the report still gives a level, never a mark. */
  marks?: number;
  seeded?: SeededAnswer[];
  model?: string;
  // ── point-marked (Geography) ──
  /** The command word: describe · explain · … */
  command?: string;
  /** The creditable points. One mark each; a second for developing it when `develop` is true. Capped at `marks`. */
  points?: CreditPoint[];
  develop?: boolean;
  /** Extra rules for this question's marking, sent to the reader. */
  rules?: string[];
  table?: DataTable;
}
export const isPointsQuestion = (q: Pick<HumanitiesQuestion, 'points'>): boolean => Array.isArray(q.points) && q.points.length > 0;
export interface HumanitiesSet {
  id: string;
  subject: HumanitiesSubject;
  kind: HumanitiesKind;
  title: string;
  issue: string;
  /** Background Information — present on a case study, and only there. */
  background?: string;
  theme?: SsTheme;
  cluster?: GeoCluster;
  sources: HumanitiesSource[];
  questions: HumanitiesQuestion[];
}
export const isCaseStudy = (set: Pick<HumanitiesSet, 'background'>): boolean => !!set.background;
export interface SchemeLevel { level: number; does: string }
export interface HumanitiesScheme {
  label: string;
  asks: string;
  levels: SchemeLevel[];
  note?: string;
  lifts: { from: number; how: string }[];
  slips: string[];
}
export interface ClaimTag { key: string; label: string; meaning: string }

type RawSet = Omit<HumanitiesSet, 'subject' | 'kind'> & Partial<Pick<HumanitiesSet, 'subject' | 'kind'>>;
const SETS: HumanitiesSet[] = [setsJson, caseStudiesJson, structuredJson, historyJson, geographyJson]
  .flatMap(f => f as unknown as RawSet[])
  .map(s => ({ ...s, subject: s.subject ?? 'social-studies', kind: s.kind ?? 'source' }));
const FILE = schemesJson as unknown as {
  version: string; rules: string[]; tags: ClaimTag[];
  structured: { rules: string[]; tags: ClaimTag[] };
  schemes: Record<HumanitiesSkill, HumanitiesScheme>;
};
const SCHEMES = FILE.schemes;
export const SCHEME_VERSION: string = FILE.version;
/** The source-based rules and claim tags. Use rulesFor / tagsFor when the skill is known. */
export const SCHEME_RULES: string[] = FILE.rules;
export const CLAIM_TAGS: ClaimTag[] = FILE.tags;
/** Every tag a report can carry, source-based and structured. */
export const ALL_TAGS: ClaimTag[] = [...FILE.tags, ...FILE.structured.tags];

export const isStructured = (skill: string): boolean => (STRUCTURED_SKILLS as readonly string[]).includes(skill);
export function rulesFor(skill: string): string[] { return isStructured(skill) ? FILE.structured.rules : FILE.rules; }
export function tagsFor(skill: string): ClaimTag[] { return isStructured(skill) ? FILE.structured.tags : FILE.tags; }

export function allSets(): HumanitiesSet[] { return SETS; }
/** The Social Studies case studies, in file order. */
export function caseStudies(): HumanitiesSet[] { return SETS.filter(isCaseStudy); }
export function setsFor(subject: HumanitiesSubject, kind?: HumanitiesKind): HumanitiesSet[] {
  return SETS.filter(s => s.subject === subject && (!kind || s.kind === kind));
}

export function schemeFor(skill: string): HumanitiesScheme | null {
  return (SCHEMES as Record<string, HumanitiesScheme>)[skill] ?? null;
}

/** The top level of a skill's scheme (3 for inference and sr_explain, 4 for the rest). */
export function levelsMax(skill: string): number {
  const s = schemeFor(skill);
  return s ? Math.max(...s.levels.map(l => l.level)) : 0;
}

export interface QuestionInContext {
  set: HumanitiesSet;
  question: HumanitiesQuestion;
  /** The sources the question names, in the set's order. */
  sources: HumanitiesSource[];
  /**
   * The sources in view while answering, and what the reader is given: the named
   * ones, or — in a case study — every source of the set (a student cross-refers
   * to any of them, as in the exam).
   */
  inView: HumanitiesSource[];
  scheme: HumanitiesScheme;
}

export function questionById(id: string): QuestionInContext | null {
  for (const set of SETS) {
    const question = set.questions.find(q => q.id === id);
    if (!question) continue;
    // A point-marked question has no level scheme; it carries a bare one so the shape holds.
    const scheme = schemeFor(question.skill) ?? (isPointsQuestion(question)
      ? { label: question.command ? question.command[0].toUpperCase() + question.command.slice(1) : 'Geography', asks: '', levels: [], lifts: [], slips: [] }
      : null);
    if (!scheme) return null;
    const sources = set.sources.filter(s => question.sources.includes(s.id));
    return { set, question, sources, inView: isCaseStudy(set) ? set.sources : sources, scheme };
  }
  return null;
}

export function questionsBySkill(skill: string): QuestionInContext[] {
  const out: QuestionInContext[] = [];
  for (const set of SETS) for (const q of set.questions) {
    if (q.skill !== skill) continue;
    const ctx = questionById(q.id);
    if (ctx) out.push(ctx);
  }
  return out;
}

/** The top of a question's scale: its marks when point-marked, else the top level of its skill's scheme. */
export function maxOf(q: HumanitiesQuestion): number {
  return isPointsQuestion(q) ? q.marks ?? 0 : levelsMax(q.skill);
}

/** A data table as plain lines — what the reader is given. */
export function tableText(t: DataTable): string {
  const lines = [t.columns.join(' | '), ...t.rows.map(r => r.join(' | '))].join('\n');
  const shown = t.figure === 'climate' ? 'a climate graph (a temperature line above rainfall bars)' : `a ${t.figure} graph`;
  return t.figure ? `(Shown to the student as ${shown}, with every value printed on it.)\n${lines}` : lines;
}

/** The answer shown folded under the report: the written model, or the top seeded answer. */
export function modelAnswer(q: HumanitiesQuestion): string | null {
  if (q.model) return q.model;
  if (!q.seeded?.length) return null;
  return [...q.seeded].sort((a, b) => b.level - a.level)[0].text;
}

/** Every seeded answer in the bank, with the question it belongs to — the bench's input. */
export interface SeededRow { questionId: string; subject: HumanitiesSubject; kind: HumanitiesKind; skill: HumanitiesSkill; level: number; text: string }
export function seededAnswers(only?: { subject?: HumanitiesSubject; kind?: HumanitiesKind; sets?: string[] }): SeededRow[] {
  const out: SeededRow[] = [];
  for (const set of SETS) {
    if (only?.sets && !only.sets.includes(set.id)) continue;
    if (only?.subject && set.subject !== only.subject) continue;
    if (only?.kind && set.kind !== only.kind) continue;
    for (const q of set.questions) for (const s of q.seeded ?? []) {
      out.push({ questionId: q.id, subject: set.subject, kind: set.kind, skill: q.skill, level: s.level, text: s.text });
    }
  }
  return out;
}
