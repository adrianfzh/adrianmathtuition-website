// Practice by skill (SPEC-HUMANITIES.md §D, 7 Oct 2026): "give me five reliability
// questions". A skill's questions are served across sets, the ones not yet
// answered first, and the skills are offered weakest first — from the levels and
// marks already on humanities_runs (no new marking). Pure.
import { allSets, type HumanitiesSubject, type QuestionInContext, questionById } from './humanities-questions';
import { SKILL_WINDOW, type SkillRunRow } from './humanities-skills';

/** The order skills are listed in when the student has no answers yet. */
const SKILL_ORDER = ['inference', 'comparison', 'reliability', 'usefulness', 'purpose', 'surprise', 'how_far', 'sr_explain', 'sr_weigh', 'hist_evaluate', 'geo_describe', 'geo_explain', 'geo_evaluate'];
export const PRACTICE_RUN = 5;

/** Every question of a subject, by skill, in file order. */
export function questionsOf(subject: HumanitiesSubject, skill: string): QuestionInContext[] {
  const out: QuestionInContext[] = [];
  for (const set of allSets()) {
    if (set.subject !== subject) continue;
    for (const q of set.questions) if (q.skill === skill) { const ctx = questionById(q.id); if (ctx) out.push(ctx); }
  }
  return out;
}

/** The skills a subject has questions for, in the standard order. */
export function skillsOf(subject: HumanitiesSubject): string[] {
  const have = new Set(allSets().filter(s => s.subject === subject).flatMap(s => s.questions.map(q => q.skill as string)));
  return SKILL_ORDER.filter(k => have.has(k));
}

export interface SkillStanding {
  skill: string;
  /** Read answers of this skill. */
  answered: number;
  /** How the newest answers did, as a share of the top level or of full marks (0 … 1). Null = not tried. */
  share: number | null;
  /** Questions of this skill in the subject, and how many are still to do. */
  total: number;
  left: number;
}

/**
 * Every skill of the subject, the weakest first: tried skills by their share
 * (lowest first), then the skills not tried yet. Works for levels and for marks —
 * a point-marked answer's 0 is a real result.
 */
export function skillStandings(subject: HumanitiesSubject, rows: (SkillRunRow & { question_id: string })[]): SkillStanding[] {
  const answeredIds = new Set(rows.map(r => r.question_id));
  const out: SkillStanding[] = skillsOf(subject).map(skill => {
    const read = rows.filter(r => r.skill === skill && (r.status === 'marked' || r.status === 'held') && r.level_lo != null && r.level_hi != null && r.levels_max)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = read.slice(0, SKILL_WINDOW);
    const share = latest.length ? latest.reduce((n, r) => n + (r.level_lo! + r.level_hi!) / 2 / r.levels_max!, 0) / latest.length : null;
    const qs = questionsOf(subject, skill);
    return { skill, answered: read.length, share, total: qs.length, left: qs.filter(c => !answeredIds.has(c.question.id)).length };
  });
  const tried = out.filter(s => s.share != null).sort((a, b) => a.share! - b.share! || a.answered - b.answered);
  return [...tried, ...out.filter(s => s.share == null)];
}

/**
 * The next run of a skill: questions not answered yet, taken one set at a time so
 * a run moves across topics; when fewer than `n` are left, answered ones fill the run.
 */
export function practiceRun(subject: HumanitiesSubject, skill: string, answered: Set<string>, n = PRACTICE_RUN): QuestionInContext[] {
  const all = questionsOf(subject, skill);
  const fresh = all.filter(c => !answered.has(c.question.id));
  // One per set first, then the rest in file order.
  const seen = new Set<string>();
  const spread = fresh.filter(c => (seen.has(c.set.id) ? false : (seen.add(c.set.id), true)));
  const run = [...spread, ...fresh.filter(c => !spread.includes(c))].slice(0, n);
  return run.length < n ? [...run, ...all.filter(c => answered.has(c.question.id)).slice(0, n - run.length)] : run;
}

/** The next question of the same skill and subject that is not answered yet — "More … practice" on a report. */
export function nextOfSkill(subject: HumanitiesSubject, skill: string, answered: Set<string>, not?: string): string | null {
  return practiceRun(subject, skill, answered, 2).find(c => c.question.id !== not && !answered.has(c.question.id))?.question.id ?? null;
}

/** "about 6 marks in 10" — how a point-marked skill is going. */
export function shareText(share: number): string {
  return `about ${Math.round(share * 10)} marks in 10`;
}
