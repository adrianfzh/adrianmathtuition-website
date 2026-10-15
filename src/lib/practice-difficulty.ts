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

// ── Maths: students' first tries correct Adrian's starting levels (15 Oct 2026) ─────────────
// Adrian tapped a starting level on every maths twin (SPEC-TWINS §12) and said: "let the data
// from the students sort out the difficulty levels > that is the most accurate way". Maths uses
// questions.difficulty ('Standard' = Core, 'Advanced', 'Challenging' = Challenge) and the nightly
// /api/cron/math-practice-difficulty writes it; the maths project's `math_practice_difficulty`
// keeps the starting level so a result never silently loses his tap.
//
// The rules (SPEC-TWINS §12 "Results correct the start"):
//   • A first try is WRONG when it scored under half the marks, or the student opened any
//     "Stuck? next step" help (they could not do it alone). No marks recorded → the verdict.
//   • Same thresholds as science: ≥ 20 first tries; under 25 % wrong → Core, over 55 % wrong →
//     Advanced; in between → no change (the level it has stays).
//   • Results move Core ↔ Advanced only. A Challenge question is never touched, and results
//     never make one.
//   • If Adrian changes a level by hand after results moved it, his tap wins: the question is
//     pinned and results leave it alone.

export type MathLevel = 'Standard' | 'Advanced' | 'Challenging';

/** Any stored difficulty → one of the three. Anything not Advanced/Challenging is Core. */
export function mathLevelOf(difficulty: string | null | undefined): MathLevel {
  const d = (difficulty || '').trim().toLowerCase();
  if (d === 'advanced') return 'Advanced';
  if (d === 'challenging' || d === 'challenge') return 'Challenging';
  return 'Standard';
}

export const MATH_LEVEL_LABEL: Record<MathLevel, string> = { Standard: 'Core', Advanced: 'Advanced', Challenging: 'Challenge' };

/** A first try is wrong under this share of the marks. */
export const MATH_WRONG_BELOW_SHARE = 0.5;

export type MathAttempt = {
  student: string;
  questionId: string;
  attemptedAt: string;
  verdict: string | null;
  score: number | null;
  outOf: number | null;
  /** steps of "Stuck? next step" the student opened before handing in */
  helpSteps: number;
};

export function mathAttemptWrong(a: MathAttempt): boolean {
  if (a.helpSteps > 0) return true;
  if (a.outOf != null && a.outOf > 0 && a.score != null && Number.isFinite(a.score)) return a.score / a.outOf < MATH_WRONG_BELOW_SHARE;
  return a.verdict !== 'correct';
}

/** Each student's first try per maths question, through the same tally science uses. */
export function tallyMathFirstAttempts(rows: readonly MathAttempt[], exclude: ReadonlySet<string> = new Set()): FirstAttemptTally[] {
  return tallyFirstAttempts(rows.map(a => ({ student: a.student, questionId: a.questionId, attemptedAt: a.attemptedAt, correct: !mathAttemptWrong(a) })), exclude);
}

/** What the results say: Core, Advanced, or null (the middle band — no change). */
export function mathLevelFromWrongShare(share: number): 'Standard' | 'Advanced' | null {
  const l = levelFromWrongShare(share);
  return l === 'core' ? 'Standard' : l === 'challenge' ? 'Advanced' : null;
}

export type MathDifficultyStored = {
  starting_level: string | null;
  level: string;
  source: 'start' | 'results';
  pinned: boolean;
};

export type MathDifficultyPlan = {
  /** the row for math_practice_difficulty, or null to leave it alone */
  row: (MathDifficultyStored & { question_id: string; attempts: number; wrong: number; wrong_share: number; reason: string; changed?: boolean }) | null;
  /** the new questions.difficulty to write, or null for no write */
  write: 'Standard' | 'Advanced' | null;
  /** the change to log for the weekly line */
  change: { from: MathLevel; to: 'Standard' | 'Advanced' } | null;
};

/**
 * One question's night: its current questions.difficulty, what the table remembers, and its
 * first-try tally → what to store, whether to change the level, and the change to report.
 */
export function planMathLevel(
  current: string | null,
  stored: MathDifficultyStored | null,
  tally: FirstAttemptTally,
  min = MIN_FIRST_ATTEMPTS,
): MathDifficultyPlan {
  const cur = mathLevelOf(current);
  const counts = {
    question_id: tally.questionId,
    attempts: tally.attempts,
    wrong: tally.wrong,
    wrong_share: Math.round(tally.wrongShare * 1000) / 1000,
    reason: `${tally.wrong} of ${tally.attempts} students got it wrong first time (${Math.round(tally.wrongShare * 100)}%)`,
  };
  const none: MathDifficultyPlan = { row: null, write: null, change: null };
  if (cur === 'Challenging') return none;                                   // Challenge stays as he set it
  if (stored?.pinned) return { ...none, row: { ...stored, ...counts } };
  // Adrian changed it by hand after results did → his tap wins from now on.
  if (stored && stored.source === 'results' && mathLevelOf(stored.level) !== cur) {
    return { ...none, row: { ...stored, ...counts, level: cur, pinned: true, reason: `${counts.reason}; changed by hand after results — your tap kept` } };
  }
  const base: MathDifficultyStored = stored ?? { starting_level: current, level: cur, source: 'start', pinned: false };
  const target = tally.attempts >= min ? mathLevelFromWrongShare(tally.wrongShare) : null;
  if (!target || target === cur) return { ...none, row: { ...base, ...counts, level: cur } };
  return {
    row: { ...base, ...counts, level: target, source: 'results', changed: true },
    write: target,
    change: { from: cur, to: target },
  };
}

export type MathChange = { from_level: string; to_level: string; starting_level: string | null; attempts: number; wrong: number; label: string };

/**
 * The weekly line to Adrian (Mondays). Leads with the ones that would surprise him: a tapped
 * Advanced that students found easy. Empty string when nothing changed.
 */
export function mathWeeklyLine(changes: readonly MathChange[], listMax = 5): string {
  if (!changes.length) return '';
  const down = changes.filter(c => c.from_level === 'Advanced' && c.to_level === 'Standard');
  const up = changes.filter(c => c.from_level === 'Standard' && c.to_level === 'Advanced');
  const lines = [`🎚 Maths practice levels: students' first tries moved ${changes.length} question${changes.length === 1 ? '' : 's'} this week.`];
  if (down.length) {
    lines.push(`⬇️ ${down.length} were Advanced → now Core (most students got them):`);
    for (const c of down.slice(0, listMax)) lines.push(`• ${c.label} — ${c.wrong} of ${c.attempts} wrong`);
    if (down.length > listMax) lines.push(`• …and ${down.length - listMax} more`);
  }
  if (up.length) lines.push(`⬆️ ${up.length} Core → now Advanced (more than half got them wrong).`);
  lines.push('To undo one, set its level again by hand — your tap then stays.');
  return lines.join('\n');
}
