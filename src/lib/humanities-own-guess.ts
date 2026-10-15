// The question type of a question brought from school, guessed from its wording (lib/humanities-own).
// Its own file with type-only imports, so the page's form can use it without loading the question bank.
import type { HumanitiesSkill, HumanitiesSubject } from './humanities-questions';

export const OWN_SOURCE_SKILLS: HumanitiesSkill[] = ['inference', 'comparison', 'reliability', 'usefulness', 'purpose', 'surprise', 'how_far'];
/** The types a student may pick, per subject. */
export const OWN_SKILLS: Record<HumanitiesSubject, HumanitiesSkill[]> = {
  'social-studies': [...OWN_SOURCE_SKILLS, 'sr_explain', 'sr_weigh'],
  history: [...OWN_SOURCE_SKILLS, 'hist_evaluate'],
  geography: ['geo_describe', 'geo_explain', 'geo_evaluate'],
};

/** Does the question lean on sources or an extract? */
export function mentionsSources(question: string): boolean {
  return /\b(sources?|extracts?)\b/i.test(question);
}

/** The likely type, from the question's wording. null = we cannot tell; the student picks. */
export function guessSkill(subject: HumanitiesSubject, question: string): HumanitiesSkill | null {
  const q = question.toLowerCase().replace(/\s+/g, ' ');
  if (subject === 'geography') {
    if (/to what extent|how far do you agree|do you agree|evaluate/.test(q)) return 'geo_evaluate';
    if (/\b(describe|identify|state|name|compare|outline|give)\b/.test(q) && !/\b(explain|why|suggest|account for)\b/.test(q)) return 'geo_describe';
    if (/\b(explain|why|suggest|account for|how)\b/.test(q)) return 'geo_explain';
    return null;
  }
  const withSources = /\bsources?\b/.test(q) && !/\bextracts?\b/.test(q);
  if (withSources) {
    if (/using the sources|how far do the sources|sources in this case study|the sources (support|agree)/.test(q)) return 'how_far';
    if (/surpris/.test(q)) return 'surprise';
    if (/useful/.test(q)) return 'usefulness';
    if (/reliab|believ|trust|\bprove|accurate|less (likely|true)/.test(q)) return 'reliability';
    if (/how (similar|different)|\bcompare|\bdiffer\b|agree with source|\bsimilar\b/.test(q)) return 'comparison';
    if (/\bwhy\b.*\b(publish|produc|draw|drew|made|make|say|said|written|wrote|give|gave|release|print|issue|deliver)|purpose/.test(q)) return 'purpose';
    if (/message|what (does|do|can) .*(tell|suggest|show)|\binfer|view of|attitude/.test(q)) return 'inference';
    return null;
  }
  if (subject === 'history') return 'hist_evaluate';
  if (/do you agree|to what extent|how far do you agree|more important|most important|better way|more effective|weigh/.test(q)) return 'sr_weigh';
  if (/explain|describe|why|how/.test(q)) return 'sr_explain';
  return null;
}

