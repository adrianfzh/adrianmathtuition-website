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
import expandTwoBracketsS2 from '../../data/lessons/expand-two-brackets-s2.json';
import expandOneBracketS2 from '../../data/lessons/expand-one-bracket-s2.json';
import expandAndSimplifyS2 from '../../data/lessons/expand-and-simplify-s2.json';
import numberInFrontS2 from '../../data/lessons/number-in-front-s2.json';
import furtherExpansionS2 from '../../data/lessons/further-expansion-s2.json';
import specialProductsS2 from '../../data/lessons/special-products-s2.json';
import expansionWithFractionsS2 from '../../data/lessons/expansion-with-fractions-s2.json';
import specialProductsMinusS2 from '../../data/lessons/special-products-minus-s2.json';
import specialProductsMixedS2 from '../../data/lessons/special-products-mixed-s2.json';
import usingTheIdentityS2 from '../../data/lessons/using-the-identity-s2.json';
import withoutACalculatorS2 from '../../data/lessons/without-a-calculator-s2.json';
import henceQuestionsS2 from '../../data/lessons/hence-questions-s2.json';
import lawsOfLogarithmsAm from '../../data/lessons/laws-of-logarithms-am.json';
import solvingLogEquationsAm from '../../data/lessons/solving-log-equations-am.json';
import solvingExponentialEquationsAm from '../../data/lessons/solving-exponential-equations-am.json';
import lawsOfIndicesAm from '../../data/lessons/laws-of-indices-am.json';
import sameBaseComparePowersAm from '../../data/lessons/same-base-compare-powers-am.json';
import solvingBySubstitutionAm from '../../data/lessons/solving-by-substitution-am.json';
import comparePowersTwoUnknownsAm from '../../data/lessons/compare-powers-two-unknowns-am.json';
import splitThePowerAm from '../../data/lessons/split-the-power-am.json';
import evaluate10ToTheXAm from '../../data/lessons/evaluate-10-to-the-x-am.json';
import exponentialGraphsAm from '../../data/lessons/exponential-graphs-am.json';
import linearFormWithLogsAm from '../../data/lessons/linear-form-with-logs-am.json';
import growthAndDecayAm from '../../data/lessons/growth-and-decay-am.json';
import sketchingLogGraphsAm from '../../data/lessons/sketching-log-graphs-am.json';
import logScalesAm from '../../data/lessons/log-scales-am.json';
import logOfNegativeUndefinedAm from '../../data/lessons/log-of-negative-undefined-am.json';
import whyLnWhenEAm from '../../data/lessons/why-ln-when-e-am.json';
import {
  validateLessonScript, type CheckScene, type LessonScript,
  type PlayScene, type ResolvedCheckScene, type SkippedCheckScene,
} from './lesson-script';
import { practiceEligibility, type EligibilityRow } from './portal-find';
import { questionMarkdown, totalMarksOf, questionStructured, type BankQuestion } from './bank-question-markdown';
import { studentRow } from './part-syllabus';

const RAW_SCRIPTS: Record<string, unknown> = {
  'binomial-theorem-am': binomialTheoremAm,
  'quadratic-functions-am': quadraticFunctionsAm,
  'expand-two-brackets-s2': expandTwoBracketsS2,
  'expand-one-bracket-s2': expandOneBracketS2,
  'expand-and-simplify-s2': expandAndSimplifyS2,
  'number-in-front-s2': numberInFrontS2,
  'further-expansion-s2': furtherExpansionS2,
  'special-products-s2': specialProductsS2,
  'expansion-with-fractions-s2': expansionWithFractionsS2,
  'special-products-minus-s2': specialProductsMinusS2,
  'special-products-mixed-s2': specialProductsMixedS2,
  'using-the-identity-s2': usingTheIdentityS2,
  'without-a-calculator-s2': withoutACalculatorS2,
  'hence-questions-s2': henceQuestionsS2,
  'laws-of-logarithms-am': lawsOfLogarithmsAm,
  'solving-log-equations-am': solvingLogEquationsAm,
  'solving-exponential-equations-am': solvingExponentialEquationsAm,
  'laws-of-indices-am': lawsOfIndicesAm,
  'same-base-compare-powers-am': sameBaseComparePowersAm,
  'solving-by-substitution-am': solvingBySubstitutionAm,
  'compare-powers-two-unknowns-am': comparePowersTwoUnknownsAm,
  'split-the-power-am': splitThePowerAm,
  'evaluate-10-to-the-x-am': evaluate10ToTheXAm,
  'exponential-graphs-am': exponentialGraphsAm,
  'linear-form-with-logs-am': linearFormWithLogsAm,
  'growth-and-decay-am': growthAndDecayAm,
  'sketching-log-graphs-am': sketchingLogGraphsAm,
  'log-scales-am': logScalesAm,
  'log-of-negative-undefined-am': logOfNegativeUndefinedAm,
  'why-ln-when-e-am': whyLnWhenEAm,
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
  'id, question_text, parts, total_marks, has_image, image_url, images, figure_url, solution, answer, deleted_at, flagged_count, ai_generated, verified, legacy_syllabus';

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
export function usableCheckAnswer(row: CheckQuestionRow | null | undefined): string | null {
  const q = row ? studentRow(row) : null;   // part marks: the one door (lib/part-syllabus.ts)
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
  row: CheckQuestionRow | null | undefined,
): ResolvedCheckScene | SkippedCheckScene {
  const q = row ? studentRow(row) : null;
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
    // The voice track rides along (the lead-in only — a check's narration
    // never contains the answer; see docs/LESSONS.md).
    ...(scene.narration !== undefined ? { narration: scene.narration } : {}),
    ...(scene.audio !== undefined ? { audio: scene.audio } : {}),
    ...(scene.timing !== undefined ? { timing: scene.timing } : {}),
    // A beat-narrated check: the one lead-in beat (and its actions) ride along.
    ...(scene.beats !== undefined ? { beats: scene.beats } : {}),
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
