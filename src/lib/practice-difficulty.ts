// 🎚 Science practice difficulty — Core / Exam / Challenge (5 Oct 2026, Adrian: "#3 is really
// good > build it"). The old Standard / Advanced labels were guessed at extraction and never
// checked (Chemical Calculations 906 / 94, Kinematics 741 / 28). The real sort comes from what
// students do: a question's FIRST attempts by each student, and the share of them that were
// wrong. Until a question has MIN_FIRST_ATTEMPTS of them it carries an estimate (work score +
// a test solve, scripts/practice-difficulty/), and the results replace the estimate once there
// are enough. Pure — the nightly cron /api/cron/practice-difficulty does the reads and writes.
//
// Stored in the SCIENCE project's `practice_difficulty` table. Read by science practice: the
// student's Core / Exam / Challenge choice draws from it (lib/science-bank scienceNext).

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

// ── Moving levels up AND down, one step at a time (4 Nov 2026) ──────────────────────────────
// Adrian, 4 Nov 2026: "what about for other difficulties?" — every level can move up and down
// from students' first tries, maths and science alike. Three guards against flip-flopping:
//   • at least MIN_FIRST_ATTEMPTS first tries;
//   • a margin: the share that moves a question UP to a level is higher than the share that
//     moves it back DOWN (a question sitting on a boundary stays where it is);
//   • one step per move, and at most one move per MOVE_GAP_DAYS.
/** 0 = Core / Standard, 1 = Exam / Advanced, 2 = Challenge. */
export type Step = 0 | 1 | 2;
export type StepThresholds = {
  /** 0 → 1 when more than this share get it wrong first time */ up1: number;
  /** 1 → 0 when fewer than this share get it wrong */ down0: number;
  /** 1 → 2 when more than this share get it wrong */ up2: number;
  /** 2 → 1 when fewer than this share get it wrong */ down1: number;
};
/** Maths (long answers, marked): Core ↔ Advanced at 25 / 55 %, Advanced ↔ Challenge at 50 / 75 %. */
export const MATH_STEPS: StepThresholds = { up1: 0.55, down0: 0.25, up2: 0.75, down1: 0.5 };
/** Science MCQs (a blind guess is wrong 3 times in 4): the old 25 / 55 % lines with a 5-point margin. */
export const SCIENCE_STEPS: StepThresholds = { up1: 0.3, down0: 0.2, up2: 0.6, down1: 0.5 };
/** At most one move per question in this many days. */
export const MOVE_GAP_DAYS = 28;

/** The one-step move the results ask for, or null to stay. */
export function stepFromResults(cur: Step, share: number, th: StepThresholds): Step | null {
  if (cur === 0) return share > th.up1 ? 1 : null;
  if (cur === 1) return share > th.up2 ? 2 : share < th.down0 ? 0 : null;
  return share < th.down1 ? 1 : null;
}

/** True when the question last moved less than MOVE_GAP_DAYS ago. */
export function movedRecently(last: string | null | undefined, now: Date, days = MOVE_GAP_DAYS): boolean {
  if (!last) return false;
  const t = Date.parse(last);
  return Number.isFinite(t) && now.getTime() - t < days * 86_400_000;
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

const SCI_STEP: Record<DifficultyLevel, Step> = { core: 0, exam: 1, challenge: 2 };
const SCI_LEVEL: readonly DifficultyLevel[] = ['core', 'exam', 'challenge'];
export type ScienceStored = { level: DifficultyLevel; source: DifficultySource; detail?: Record<string, unknown> | null };

/**
 * Science, from 4 Nov 2026: the FIRST results sort replaces an estimate outright (resultsRows);
 * after that a results-sorted question moves one step at a time, with the margin and the gap.
 * Returns the rows to write (counts refreshed for every question with enough tries; a level
 * change only when the step rule allows) and the moves made.
 */
export function planScienceRows(
  tallies: readonly FirstAttemptTally[],
  existing: ReadonlyMap<string, ScienceStored>,
  now: Date = new Date(),
  min = MIN_FIRST_ATTEMPTS,
): { rows: (DifficultyRow & { detail: Record<string, unknown> })[]; moves: { question_id: string; from: DifficultyLevel; to: DifficultyLevel }[] } {
  const rows: (DifficultyRow & { detail: Record<string, unknown> })[] = [];
  const moves: { question_id: string; from: DifficultyLevel; to: DifficultyLevel }[] = [];
  const first = new Map(resultsRows(tallies, min).map(r => [r.question_id, r]));
  for (const t of tallies) {
    const fresh = first.get(t.questionId);
    if (!fresh) continue;
    const had = existing.get(t.questionId);
    const detail = { ...(had?.detail ?? {}) } as Record<string, unknown>;
    if (!had || had.source !== 'results') {           // first sort by results: straight to the level
      if (!had || had.level !== fresh.level) detail.moved_at = now.toISOString();
      if (had && had.level !== fresh.level) moves.push({ question_id: t.questionId, from: had.level, to: fresh.level });
      rows.push({ ...fresh, detail });
      continue;
    }
    let level = had.level;
    if (!movedRecently(detail.moved_at as string | undefined, now)) {
      const next = stepFromResults(SCI_STEP[had.level], t.wrongShare, SCIENCE_STEPS);
      if (next != null) {
        level = SCI_LEVEL[next];
        detail.moved_at = now.toISOString();
        moves.push({ question_id: t.questionId, from: had.level, to: level });
      }
    }
    rows.push({ ...fresh, level, detail });
  }
  return { rows, moves };
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
//   • Every level moves up and down one step (4 Nov 2026, Adrian: "what about for other
//     difficulties?"): Core → Advanced over 55 % wrong, Advanced → Core under 25 %, Advanced →
//     Challenge over 75 %, Challenge → Advanced under 50 % (MATH_STEPS), at most one move per
//     MOVE_GAP_DAYS. (Earlier the same day: Challenge only ever moved down.)
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
/** A Challenge question stays Challenge only while at least this share get it wrong first time. */
export const MATH_CHALLENGE_KEEP_MIN_WRONG = MATH_STEPS.down1;

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
  /** when results last moved it (the gap between moves) */
  changed_at?: string | null;
};

export type MathDifficultyPlan = {
  /** the row for math_practice_difficulty, or null to leave it alone */
  row: (MathDifficultyStored & { question_id: string; attempts: number; wrong: number; wrong_share: number; reason: string; changed?: boolean }) | null;
  /** the new questions.difficulty to write, or null for no write */
  write: MathLevel | null;
  /** the change to log for the weekly line */
  change: { from: MathLevel; to: MathLevel } | null;
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
  now: Date = new Date(),
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
  if (stored?.pinned) return { ...none, row: { ...stored, ...counts } };
  // Adrian changed it by hand after results did → his tap wins from now on.
  if (stored && stored.source === 'results' && mathLevelOf(stored.level) !== cur) {
    return { ...none, row: { ...stored, ...counts, level: cur, pinned: true, reason: `${counts.reason}; changed by hand after results — your tap kept` } };
  }
  const base: MathDifficultyStored = stored ?? { starting_level: current, level: cur, source: 'start', pinned: false };
  const MATH_BY_STEP: readonly MathLevel[] = ['Standard', 'Advanced', 'Challenging'];
  const step = MATH_BY_STEP.indexOf(cur) as Step;
  const target = tally.attempts < min || movedRecently(stored?.changed_at, now) ? null
    : (() => { const n = stepFromResults(step, tally.wrongShare, MATH_STEPS); return n == null ? null : MATH_BY_STEP[n]; })();
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
  const rank = (l: string) => ['Standard', 'Advanced', 'Challenging'].indexOf(mathLevelOf(l));
  const word = (l: string) => MATH_LEVEL_LABEL[mathLevelOf(l)];
  const down = changes.filter(c => rank(c.to_level) < rank(c.from_level));
  const up = changes.filter(c => rank(c.to_level) > rank(c.from_level));
  const lines = [`🎚 Maths practice levels: students' first tries moved ${changes.length} question${changes.length === 1 ? '' : 's'} this week.`];
  const list = (cs: readonly MathChange[]) => {
    for (const c of cs.slice(0, listMax)) lines.push(`• ${c.label}: ${word(c.from_level)} → ${word(c.to_level)} — ${c.wrong} of ${c.attempts} wrong`);
    if (cs.length > listMax) lines.push(`• …and ${cs.length - listMax} more`);
  };
  if (down.length) { lines.push(`⬇️ ${down.length} moved down (most students got them):`); list(down); }
  if (up.length) { lines.push(`⬆️ ${up.length} moved up (most students got them wrong):`); list(up); }
  lines.push('To undo one, set its level again by hand — your tap then stays.');
  return lines.join('\n');
}
