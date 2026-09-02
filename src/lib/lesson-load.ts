// Loading + check-resolution for animated lesson scripts (data/lessons/*.json).
//
// Scripts are STATIC IMPORTS, not fs reads: the bundler inlines the JSON so a
// Vercel lambda never depends on files being traced into the deployment (the
// repo has been bitten by cwd-relative reads before). Adding a lesson = one
// import + one registry line here, plus its lib/lesson-catalog.ts row — the
// coherence test keeps all three in step.
//
// The check-resolution half is pure (row in → verdict out) so the eligibility
// behaviour is unit-testable without Supabase.

import binomialTheoremAm from '../../data/lessons/binomial-theorem-am.json';
import quadraticFunctionsAm from '../../data/lessons/quadratic-functions-am.json';
import {
  validateLessonScript, type CheckScene, type LessonScript,
  type PlayScene, type ResolvedCheckScene, type SkippedCheckScene,
} from './lesson-script';
import { practiceEligibility, type EligibilityRow } from './portal-find';
import { questionMarkdown, totalMarksOf, questionStructured, type BankQuestion } from './bank-question-markdown';

const RAW_SCRIPTS: Record<string, unknown> = {
  'binomial-theorem-am': binomialTheoremAm,
  'quadratic-functions-am': quadraticFunctionsAm,
};

/**
 * The validated script for a slug, or null (unknown slug / invalid file —
 * invalid scripts are also caught pre-commit by the vitest suite, so null here
 * in production means a slug nobody registered).
 */
export function loadLessonScript(slug: string): LessonScript | null {
  const raw = RAW_SCRIPTS[slug];
  if (!raw) return null;
  const result = validateLessonScript(raw);
  if (!result.ok) {
    console.error(`[lesson-load] data/lessons/${slug}.json failed validation:`, result.errors);
    return null;
  }
  return result.script;
}

/** The columns a check-question fetch must select (eligibility + display + answer). */
export const CHECK_QUESTION_COLUMNS =
  'id, question_text, parts, total_marks, has_image, image_url, images, figure_url, solution, answer, deleted_at, flagged_count, ai_generated, verified';

export type CheckQuestionRow = EligibilityRow & BankQuestion & {
  id: string;
  total_marks?: number | null;
};

/**
 * The official answer a lesson check may grade against, or null when the
 * question can't back a check: it must pass the SAME eligibility gate the
 * practice ?qid= deep link applies (lib/portal-find.practiceEligibility) AND
 * carry a top-level `answer` — eligibility alone also admits solution-only
 * rows, but checkTypedAnswer needs the short official answer to compare with.
 */
export function usableCheckAnswer(q: CheckQuestionRow | null | undefined): string | null {
  if (!q) return null;
  if (!practiceEligibility(q).ok) return null;
  const answer = typeof q.answer === 'string' ? q.answer.trim() : '';
  return answer ? answer : null;
}

/**
 * A check scene + its (possibly missing) bank row → what the player renders.
 * An ineligible/vanished question degrades to `check-skipped` — the lesson
 * keeps playing, it never breaks (mission rule).
 */
export function resolveCheckScene(
  scene: CheckScene,
  q: CheckQuestionRow | null | undefined,
): ResolvedCheckScene | SkippedCheckScene {
  const answer = usableCheckAnswer(q);
  if (!q || !answer) return { type: 'check-skipped' };
  return {
    type: 'check',
    qid: scene.qid,
    prompt: scene.prompt ?? null,
    placeholder: scene.placeholder ?? null,
    markdown: questionMarkdown(q),
    marks: q.total_marks ?? totalMarksOf(questionStructured(q).parts),
    answer,
    why: scene.why,
  };
}

/**
 * Swap every check scene for its resolved/skipped form. `rows` is keyed by
 * question id; a missing key skips that check.
 */
export function buildPlayScenes(
  script: LessonScript,
  rows: Map<string, CheckQuestionRow>,
): PlayScene[] {
  return script.scenes.map<PlayScene>(scene =>
    scene.type === 'check' ? resolveCheckScene(scene, rows.get(scene.qid)) : scene,
  );
}
