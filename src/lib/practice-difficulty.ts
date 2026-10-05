// 🎚 Science practice difficulty — Core / Exam / Challenge (5 Oct 2026, Adrian: "#3 is really
// good > build it"). The old Standard / Advanced labels were guessed at extraction and never
// checked (Chemical Calculations 906 / 94, Kinematics 741 / 28). The real sort comes from what
// students do: a question's FIRST attempts by each student, and the share of them that were
// wrong. Until a question has MIN_FIRST_ATTEMPTS of them it carries an estimate (work score +
// a test solve, scripts/practice-difficulty/), and the results replace the estimate once there
// are enough. Pure — the nightly cron /api/cron/practice-difficulty does the reads and writes.
//
// Stored in the SCIENCE project's `practice_difficulty` table. Nothing a student sees reads it
// yet — Adrian decides on level chips after the sample.

export type DifficultyLevel = 'core' | 'exam' | 'challenge';
export type DifficultySource = 'results' | 'estimate' | 'estimate-sample' | 'twin';

/** The sources a student's level choice draws from — the sample rows never serve. 'twin' = our own
 *  science twin, written AT a level and filed there once every check passed (SPEC-TWINS §11,
 *  scripts/science-twins/); students' results replace it once 20 have tried it, like an estimate. */
export const SERVED_DIFFICULTY_SOURCES: readonly DifficultySource[] = ['results', 'estimate', 'twin'];

export const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = { core: 'Core', exam: 'Exam', challenge: 'Challenge' };

/** A question is sorted by its results once this many students have tried it. */
export const MIN_FIRST_ATTEMPTS = 20;
/** Under this share wrong on a first try → Core (most students get it). */
export const CORE_MAX_WRONG = 0.25;
/** Over this share wrong on a first try → Challenge (more than half miss it). */
export const CHALLENGE_MIN_WRONG = 0.55;

/** The level a share of wrong first attempts gives: < 25 % Core, 25–55 % Exam, > 55 % Challenge. */
export function levelFromWrongShare(share: number): DifficultyLevel {
  if (share < CORE_MAX_WRONG) return 'core';
  if (share > CHALLENGE_MIN_WRONG) return 'challenge';
  return 'exam';
}

export type McqAttempt = {
  /** who tried it — the account id, or the Airtable id when there is no account */
  student: string;
  questionId: string;
  attemptedAt: string;
  correct: boolean;
};

export type FirstAttemptTally = { questionId: string; attempts: number; wrong: number; wrongShare: number };

/**
 * Each student's FIRST try at each question only (a second try after seeing the answer says
 * nothing about difficulty). Students in `exclude` (the preview / demo identity) are left out.
 */
export function tallyFirstAttempts(rows: readonly McqAttempt[], exclude: ReadonlySet<string> = new Set()): FirstAttemptTally[] {
  const first = new Map<string, McqAttempt>();
  for (const r of rows) {
    if (!r.student || !r.questionId || exclude.has(r.student)) continue;
    const k = `${r.student}|${r.questionId}`;
    const seen = first.get(k);
    if (!seen || r.attemptedAt < seen.attemptedAt) first.set(k, r);
  }
  const acc = new Map<string, { attempts: number; wrong: number }>();
  for (const r of first.values()) {
    const t = acc.get(r.questionId) ?? { attempts: 0, wrong: 0 };
    t.attempts += 1;
    if (!r.correct) t.wrong += 1;
    acc.set(r.questionId, t);
  }
  return [...acc.entries()]
    .map(([questionId, t]) => ({ questionId, ...t, wrongShare: t.attempts ? t.wrong / t.attempts : 0 }))
    .sort((a, b) => b.attempts - a.attempts || a.questionId.localeCompare(b.questionId));
}

export type DifficultyRow = {
  question_id: string;
  level: DifficultyLevel;
  source: DifficultySource;
  attempts: number;
  wrong: number;
  wrong_share: number | null;
  reason: string;
};

/**
 * The rows the nightly job writes: only questions with enough first attempts, set by their
 * results. A results row always replaces an estimate; below the threshold the estimate (or
 * nothing) stays — the tally is still reported.
 */
export function resultsRows(tallies: readonly FirstAttemptTally[], min = MIN_FIRST_ATTEMPTS): DifficultyRow[] {
  return tallies.filter(t => t.attempts >= min).map(t => {
    const level = levelFromWrongShare(t.wrongShare);
    return {
      question_id: t.questionId,
      level,
      source: 'results',
      attempts: t.attempts,
      wrong: t.wrong,
      wrong_share: Math.round(t.wrongShare * 1000) / 1000,
      reason: `${t.wrong} of ${t.attempts} students got it wrong first time (${Math.round(t.wrongShare * 100)}%)`,
    };
  });
}

/** The plain summary for job_runs and the report: how much evidence exists today. */
export function tallySummary(tallies: readonly FirstAttemptTally[], min = MIN_FIRST_ATTEMPTS): { questionsTried: number; firstAttempts: number; enough: number; maxOnOne: number } {
  return {
    questionsTried: tallies.length,
    firstAttempts: tallies.reduce((s, t) => s + t.attempts, 0),
    enough: tallies.filter(t => t.attempts >= min).length,
    maxOnOne: tallies.reduce((m, t) => Math.max(m, t.attempts), 0),
  };
}

// ── The estimate (sample first, 5 Oct 2026) ─────────────────────────────────────────────────
// Two signals for a question with too few results:
//   work score 1–5 — one careful read: steps, ideas that must be joined, traps
//   test solve     — a small fast model answers once with no working; wrong = harder.
//                    A second try separates a lucky guess from real knowledge.

export type TestSolve = 'right' | 'wrong' | 'split' | null;

/** A test solve from up to two tries: both right, both wrong, or one of each. */
export function testSolveOf(tries: readonly (boolean | null)[]): TestSolve {
  const t = tries.filter((x): x is boolean => typeof x === 'boolean');
  if (!t.length) return null;
  if (t.every(Boolean)) return 'right';
  if (t.every(x => !x)) return 'wrong';
  return 'split';
}

/**
 * Work score + test solve → a level.
 *   1–2 → Core, 3 → Exam, 4–5 → Challenge, then the test solve moves it:
 *   wrong both times → one step harder, but ONLY when the work score is 3 or more (5 Oct
 *   2026, after the sample: a fast model answering a short calculation with no working gets
 *   it wrong for reasons a student would not — chemistry calculations were over-sorted);
 *   right both times on a 4 → back to Exam (a 5 stays Challenge — a long question a model
 *   can do is still long for a student).
 */
/** A wrong test solve moves a question up only from this work score. */
export const SOLVE_BUMP_MIN_WORK = 3;
export function estimateLevel(workScore: number, solve: TestSolve): DifficultyLevel {
  const w = Math.max(1, Math.min(5, Math.round(workScore)));
  let lvl: DifficultyLevel = w <= 2 ? 'core' : w === 3 ? 'exam' : 'challenge';
  if (solve === 'wrong' && w >= SOLVE_BUMP_MIN_WORK) lvl = 'challenge';
  else if (solve === 'right' && w === 4) lvl = 'exam';
  return lvl;
}
