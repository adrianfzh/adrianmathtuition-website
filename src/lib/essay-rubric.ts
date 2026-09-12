// The rubric the essay brain marks against (SPEC-ESSAY-MARKING.md §Rubric and
// anchors as data). ONE copy, in data/rubrics/*.json, transcribed verbatim from
// the SEAB syllabus document and shipped with the app; the website sends the
// criteria to the bot with every essay, so the marker never holds its own copy
// and can never drift from the document. Pure; tested.
import english1184 from '../../data/rubrics/english-1184-writing.json';

export type EssaySubject = 'english';
export type EssayKind = 'continuous_writing' | 'situational_writing';

export interface RubricBand {
  band: number;
  mark_min: number;
  mark_max: number;
  descriptors: string[];
}
export interface RubricCriterion {
  key: string;
  label: string;
  max: number;
  assessment_criteria: string[];
  bands: RubricBand[];
}
export interface EssayRubric {
  subject: EssaySubject;
  syllabus: string;
  kind: EssayKind;
  /** The syllabus' word range for this kind, as printed. */
  length_words: string;
  criteria: RubricCriterion[];
}

interface RubricRow {
  subject: string; syllabus: string; essay_kind: string; criterion: string; criterion_max: number;
  assessment_criteria: string[]; band: number; marks: string; mark_min: number; mark_max: number; descriptors: string[];
}

export const ESSAY_KINDS: Record<EssayKind, { label: string; length_words: string; blurb: string }> = {
  continuous_writing: { label: 'Continuous writing', length_words: '350–500', blurb: 'One of the four set topics — a story, a recount, an argument.' },
  situational_writing: { label: 'Situational writing', length_words: '250–350', blurb: 'An email, letter, report or speech to suit the purpose, audience and context, using the given points.' },
};

const CRITERION_LABELS: Record<string, string> = {
  content: 'Content',
  language: 'Language',
  task_fulfilment: 'Task fulfilment',
};

/** The rubric for one (subject, kind), or null when nothing is seeded for it. */
export function essayRubricFor(subject: string, kind: string): EssayRubric | null {
  if (subject !== 'english') return null;
  if (!(kind in ESSAY_KINDS)) return null;
  const rows = (english1184.rows as RubricRow[]).filter(r => r.essay_kind === kind);
  if (!rows.length) return null;
  const byCriterion = new Map<string, RubricRow[]>();
  for (const r of rows) byCriterion.set(r.criterion, [...(byCriterion.get(r.criterion) ?? []), r]);
  // Content / task fulfilment first, language second — the order the document prints them.
  const order = (k: string) => (k === 'language' ? 1 : 0);
  const criteria: RubricCriterion[] = [...byCriterion.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([key, list]) => ({
      key,
      label: CRITERION_LABELS[key] ?? key,
      max: list[0].criterion_max,
      assessment_criteria: list[0].assessment_criteria,
      bands: list.map(r => ({ band: r.band, mark_min: r.mark_min, mark_max: r.mark_max, descriptors: r.descriptors }))
        .sort((a, b) => b.band - a.band),
    }));
  return {
    subject: 'english',
    syllabus: english1184.rows[0]?.syllabus ?? '1184',
    kind: kind as EssayKind,
    length_words: ESSAY_KINDS[kind as EssayKind].length_words,
    criteria,
  };
}

/** Where the rubric came from — shown under the band range. */
export const ESSAY_RUBRIC_SOURCE = english1184.source;
