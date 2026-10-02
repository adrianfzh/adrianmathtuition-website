// The humanities question bank (SPEC-HUMANITIES.md §H1, 2 Oct 2026): our OWN
// source sets and questions, and the level scheme each skill is read against.
// Pure — the data is two JSON files the build ships. Nothing here is a school's
// paper (docs/CONTENT-POLICY.md).
import schemesJson from '../../data/humanities/social-studies/schemes.json';
import setsJson from '../../data/humanities/social-studies/sets.json';

export type HumanitiesSkill = 'inference' | 'comparison' | 'reliability' | 'usefulness' | 'purpose' | 'how_far';
export const HUMANITIES_SKILLS: readonly HumanitiesSkill[] = ['inference', 'comparison', 'reliability', 'usefulness', 'purpose', 'how_far'];

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

const SETS = setsJson as unknown as HumanitiesSet[];
const SCHEMES = (schemesJson as unknown as { schemes: Record<HumanitiesSkill, HumanitiesScheme> }).schemes;
export const SCHEME_VERSION: string = (schemesJson as unknown as { version: string }).version;
export const SCHEME_RULES: string[] = (schemesJson as unknown as { rules: string[] }).rules;
export const CLAIM_TAGS: ClaimTag[] = (schemesJson as unknown as { tags: ClaimTag[] }).tags;

export function allSets(): HumanitiesSet[] { return SETS; }

export function schemeFor(skill: string): HumanitiesScheme | null {
  return (SCHEMES as Record<string, HumanitiesScheme>)[skill] ?? null;
}

/** The top level of a skill's scheme (3 for inference, 4 for the rest). */
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
export function seededAnswers(): { questionId: string; skill: HumanitiesSkill; level: number; text: string }[] {
  const out: { questionId: string; skill: HumanitiesSkill; level: number; text: string }[] = [];
  for (const set of SETS) for (const q of set.questions) for (const s of q.seeded ?? []) {
    out.push({ questionId: q.id, skill: q.skill, level: s.level, text: s.text });
  }
  return out;
}
