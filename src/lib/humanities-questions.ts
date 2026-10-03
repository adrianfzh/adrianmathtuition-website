// The humanities question bank (SPEC-HUMANITIES.md §H1, 2 Oct 2026; H2, 3 Oct):
// our OWN source sets and questions, and the level scheme each skill is read
// against. Three files of sets — Social Studies source-based, Social Studies
// structured response, History source-based — and one file of schemes. Pure.
// Nothing here is a school's paper (docs/CONTENT-POLICY.md).
import schemesJson from '../../data/humanities/social-studies/schemes.json';
import setsJson from '../../data/humanities/social-studies/sets.json';
import structuredJson from '../../data/humanities/social-studies/structured.json';
import historyJson from '../../data/humanities/history/sets.json';

export type HumanitiesSkill = 'inference' | 'comparison' | 'reliability' | 'usefulness' | 'purpose' | 'how_far' | 'sr_explain' | 'sr_weigh';
/** The six source skills — Social Studies and History share them. */
export const SOURCE_SKILLS: readonly HumanitiesSkill[] = ['inference', 'comparison', 'reliability', 'usefulness', 'purpose', 'how_far'];
/** The two structured-response parts (Social Studies): answered from own knowledge. */
export const STRUCTURED_SKILLS: readonly HumanitiesSkill[] = ['sr_explain', 'sr_weigh'];
export const HUMANITIES_SKILLS: readonly HumanitiesSkill[] = [...SOURCE_SKILLS, ...STRUCTURED_SKILLS];

export type HumanitiesSubject = 'social-studies' | 'history';
export type HumanitiesKind = 'source' | 'structured';
export const SUBJECT_NAME: Record<HumanitiesSubject, string> = { 'social-studies': 'Social Studies', history: 'History' };

export interface HumanitiesSource { id: string; provenance: string; text: string }
export interface SeededAnswer { level: number; text: string }
export interface HumanitiesQuestion {
  id: string;
  skill: HumanitiesSkill;
  sources: string[];
  question: string;
  seeded?: SeededAnswer[];
  model?: string;
}
export interface HumanitiesSet {
  id: string;
  subject: HumanitiesSubject;
  kind: HumanitiesKind;
  title: string;
  issue: string;
  sources: HumanitiesSource[];
  questions: HumanitiesQuestion[];
}
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
const SETS: HumanitiesSet[] = [setsJson, structuredJson, historyJson]
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
  scheme: HumanitiesScheme;
}

export function questionById(id: string): QuestionInContext | null {
  for (const set of SETS) {
    const question = set.questions.find(q => q.id === id);
    if (!question) continue;
    const scheme = schemeFor(question.skill);
    if (!scheme) return null;
    return { set, question, sources: set.sources.filter(s => question.sources.includes(s.id)), scheme };
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

/** The answer shown folded under the report: the written model, or the top seeded answer. */
export function modelAnswer(q: HumanitiesQuestion): string | null {
  if (q.model) return q.model;
  if (!q.seeded?.length) return null;
  return [...q.seeded].sort((a, b) => b.level - a.level)[0].text;
}

/** Every seeded answer in the bank, with the question it belongs to — the bench's input. */
export interface SeededRow { questionId: string; subject: HumanitiesSubject; kind: HumanitiesKind; skill: HumanitiesSkill; level: number; text: string }
export function seededAnswers(only?: { subject?: HumanitiesSubject; kind?: HumanitiesKind }): SeededRow[] {
  const out: SeededRow[] = [];
  for (const set of SETS) {
    if (only?.subject && set.subject !== only.subject) continue;
    if (only?.kind && set.kind !== only.kind) continue;
    for (const q of set.questions) for (const s of q.seeded ?? []) {
      out.push({ questionId: q.id, subject: set.subject, kind: set.kind, skill: q.skill, level: s.level, text: s.text });
    }
  }
  return out;
}
