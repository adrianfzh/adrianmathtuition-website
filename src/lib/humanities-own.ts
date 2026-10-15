// A question the student brings from school (15 Oct 2026, Adrian: "why don't we just allow student to take a
// photo and upload the question, or just type it, then their responses > then grade it?").
// The student gives the question (typed, or a photo typed out by /api/portal/humanities/transcribe), the
// sources if it has any, and their answer. We guess the question type from its wording, the student can
// change it, and the answer is read on that type's level scheme — the same reader and the same report as
// our own questions. Only level-marked types: a Geography short question needs its own list of creditable
// points, which a school question does not come with. Pure; stored on the run as `own_question`.
import {
  schemeFor, SUBJECT_NAME,
  type HumanitiesSkill, type HumanitiesSubject, type HumanitiesSet, type QuestionInContext,
} from './humanities-questions';

export interface OwnQuestion {
  subject: HumanitiesSubject;
  skill: HumanitiesSkill;
  question: string;
  /** The sources or extract, as typed out (one block; the student's own Source A, B … labels inside). */
  sources: string;
  marks?: number | null;
}

export const OWN_PREFIX = 'own-';
export const isOwnId = (id: string): boolean => id.startsWith(OWN_PREFIX);
export const OWN_MAX_QUESTION = 1500;
export const OWN_MAX_SOURCES = 12000;

import { OWN_SKILLS, OWN_SOURCE_SKILLS as SOURCE } from './humanities-own-guess';
export { OWN_SKILLS, guessSkill, mentionsSources } from './humanities-own-guess';

export type OwnCheck = { ok: true; own: OwnQuestion } | { ok: false; error: string };

/** Tidy and check what the student sent. */
export function checkOwn(input: { subject?: unknown; skill?: unknown; question?: unknown; sources?: unknown; marks?: unknown }): OwnCheck {
  const subject = String(input.subject ?? '') as HumanitiesSubject;
  if (!(subject in OWN_SKILLS)) return { ok: false, error: 'Pick the subject.' };
  const skill = String(input.skill ?? '') as HumanitiesSkill;
  if (!OWN_SKILLS[subject].includes(skill)) return { ok: false, error: 'Pick the question type.' };
  const question = String(input.question ?? '').replace(/\r\n?/g, '\n').trim();
  if (question.split(/\s+/).filter(Boolean).length < 4) return { ok: false, error: 'Type or photograph the question first.' };
  if (question.length > OWN_MAX_QUESTION) return { ok: false, error: 'That question is too long. Give just the one question.' };
  const sources = String(input.sources ?? '').replace(/\r\n?/g, '\n').trim();
  if (sources.length > OWN_MAX_SOURCES) return { ok: false, error: 'The sources are too long. Give only the ones this question uses.' };
  if (SOURCE.includes(skill) && sources.split(/\s+/).filter(Boolean).length < 10) {
    return { ok: false, error: 'This question uses sources. Add them (type them, or send a photo).' };
  }
  const m = Number(input.marks);
  const marks = Number.isInteger(m) && m > 0 && m <= 30 ? m : null;
  return { ok: true, own: { subject, skill, question, sources, marks } };
}

/** The question in the shape the reader and the report already take. */
export function ownContext(id: string, own: OwnQuestion): QuestionInContext | null {
  const scheme = schemeFor(own.skill);
  if (!scheme) return null;
  const kind = SOURCE.includes(own.skill) ? 'source' : 'structured';
  const sources = own.sources ? [{ id: kind === 'source' ? 'The sources' : 'The extract', provenance: 'As given with the question.', text: own.sources }] : [];
  const set: HumanitiesSet = {
    id, subject: own.subject, kind, title: 'Your own question',
    issue: `A ${SUBJECT_NAME[own.subject]} question the student brought from school.`,
    sources,
    questions: [{ id, skill: own.skill, sources: sources.map(s => s.id), question: own.question, ...(own.marks ? { marks: own.marks } : {}) }],
  };
  return { set, question: set.questions[0], sources, inView: sources, scheme };
}

/** Either kind of question, from a run row. */
export function contextForRun(
  run: { question_id: string; own_question?: OwnQuestion | null },
  bank: (id: string) => QuestionInContext | null,
): QuestionInContext | null {
  return run.own_question ? ownContext(run.question_id, run.own_question) : bank(run.question_id);
}
