// A question the student brings from school (15 Oct 2026, Adrian: "why don't we just allow student to take a
// photo and upload the question, or just type it, then their responses > then grade it?").
// The student gives the question (typed, or a photo typed out by /api/portal/humanities/transcribe), the
// sources if it has any, and their answer. We guess the question type from its wording, the student can
// change it, and the answer is read on that type's level scheme — the same reader and the same report as
// our own questions. Only level-marked types: a Geography short question needs its own list of creditable
// points, which a school question does not come with. Pure; stored on the run as `own_question`.
import {
  schemeFor, SUBJECT_NAME, POINTS_SKILLS,
  type HumanitiesSkill, type HumanitiesSubject, type HumanitiesSet, type QuestionInContext, type CreditPoint,
} from './humanities-questions';

export interface OwnQuestion {
  subject: HumanitiesSubject;
  skill: HumanitiesSkill;
  question: string;
  /** The sources or extract, as typed out (one block; the student's own Source A, B … labels inside). */
  sources: string;
  marks?: number | null;
  /** Geography short questions (point-marked): the school's answer scheme if the student gave one. */
  scheme?: string;
  /** The creditable points, written at hand-in from `scheme` or from the question (lib/humanities-own-points). */
  points?: CreditPoint[];
  command?: string;
  develop?: boolean;
  rules?: string[];
}

export const isOwnPoints = (skill: string): boolean => (POINTS_SKILLS as readonly string[]).includes(skill);

export const OWN_PREFIX = 'own-';
export const isOwnId = (id: string): boolean => id.startsWith(OWN_PREFIX);
export const OWN_MAX_QUESTION = 1500;
export const OWN_MAX_SOURCES = 12000;

import { OWN_SKILLS, OWN_SOURCE_SKILLS as SOURCE } from './humanities-own-guess';
import { printedMarks } from './humanities-marks';
export { OWN_SKILLS, guessSkill, mentionsSources } from './humanities-own-guess';

export type OwnCheck = { ok: true; own: OwnQuestion } | { ok: false; error: string };

/** Tidy and check what the student sent. */
export function checkOwn(input: { subject?: unknown; skill?: unknown; question?: unknown; sources?: unknown; marks?: unknown; scheme?: unknown }): OwnCheck {
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
  const marks = Number.isInteger(m) && m > 0 && m <= 30 ? m : printedMarks(question);
  const scheme = String(input.scheme ?? '').replace(/\r\n?/g, '\n').trim().slice(0, OWN_MAX_SOURCES);
  if (isOwnPoints(skill)) {
    // One mark a point: the total must be known to mark it.
    if (!marks) return { ok: false, error: 'Add the marks for this question, for example [4].' };
    return { ok: true, own: { subject, skill, question, sources, marks, ...(scheme ? { scheme } : {}) } };
  }
  return { ok: true, own: { subject, skill, question, sources, marks } };
}

/** The question in the shape the reader and the report already take. */
export function ownContext(id: string, own: OwnQuestion): QuestionInContext | null {
  const points = isOwnPoints(own.skill);
  if (points && !(own.points?.length && own.marks)) return null;
  const scheme = points
    ? { label: own.command ? own.command[0].toUpperCase() + own.command.slice(1) : 'Geography', asks: '', levels: [], lifts: [], slips: [] }
    : schemeFor(own.skill);
  if (!scheme) return null;
  const kind = points ? 'points' : SOURCE.includes(own.skill) ? 'source' : 'structured';
  const label = points ? 'The figure or table' : kind === 'source' ? 'The sources' : 'The extract';
  const sources = own.sources ? [{ id: label, provenance: 'As given with the question.', text: own.sources }] : [];
  const set: HumanitiesSet = {
    id, subject: own.subject, kind, title: 'Your question',
    issue: `A ${own.subject === 'social-studies' ? 'Social Studies' : `${SUBJECT_NAME[own.subject]} Elective (Combined Humanities)`} question the student brought from school.`,
    sources,
    questions: [{
      id, skill: own.skill, sources: sources.map(s => s.id), question: own.question, ...(own.marks ? { marks: own.marks } : {}),
      ...(points ? { points: own.points, command: own.command ?? 'explain', develop: !!own.develop, rules: own.rules ?? [] } : {}),
    }],
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
