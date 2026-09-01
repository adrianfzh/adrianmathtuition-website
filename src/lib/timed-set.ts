// Timed practice sets (/app/practice/timed, 2026-09-02) — the pure helpers.
// The route (api/portal/practice/timed-set) assembles the set; the client
// runs the clock; every attempted question is graded through the ordinary
// /api/portal/practice/grade route with a `timed` tag so the attempt row
// carries duration_seconds + marking_json.timed. Nothing here touches I/O.
//
// Why exam pace: Adrian's point — untimed practice hides the time losses a
// prelim exposes. O-Level papers run ≈ 90 s per mark (P1: 90 marks in 2 h 15),
// H2 ≈ 108 s per mark (P1: 100 marks in 3 h). Sec 1–2 tests are looser but the
// O-Level pace is the habit worth building, so they use it too.

export const TIMED_SET_COUNTS = [3, 5] as const;
export type TimedSetCount = (typeof TIMED_SET_COUNTS)[number];

/** Floor so a set of tiny questions is never a 90-second sprint. */
export const MIN_LIMIT_SEC = 5 * 60;
/** Ceiling on a prefilled topic list (an exam's tested topics) — keeps the URL + rotation sane. */
export const MAX_TOPICS_PER_SET = 12;
/** A bank question with no recorded marks still needs a time allowance. */
export const FALLBACK_MARKS = 4;
/** Longest elapsed time the grade route will record for one set (guards a forged tag). */
export const MAX_ELAPSED_SEC = 4 * 60 * 60;

export function secondsPerMark(levelKey: string): number {
  return /^JC/i.test(levelKey) ? 108 : 90;
}

export function marksForTiming(marks: number | null | undefined): number {
  return typeof marks === 'number' && Number.isFinite(marks) && marks > 0 ? marks : FALLBACK_MARKS;
}

/** Whole minutes, never under the floor. */
export function timeLimitSeconds(levelKey: string, totalMarks: number): number {
  const raw = secondsPerMark(levelKey) * Math.max(0, totalMarks);
  return Math.max(MIN_LIMIT_SEC, Math.ceil(raw / 60) * 60);
}

export function normaliseCount(n: unknown): TimedSetCount {
  const v = typeof n === 'string' ? Number(n) : n;
  return v === 5 ? 5 : 3;
}

/**
 * Which topic each slot draws from: the topic list shuffled once, then
 * round-robin — a mixed set spreads across topics instead of drawing three
 * from the first one. `rand` is injectable so tests are deterministic.
 */
export function planSlots(topics: string[], count: number, rand: () => number = Math.random): string[] {
  const pool = [...new Set(topics.map(t => t.trim()).filter(Boolean))];
  if (!pool.length || count <= 0) return [];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface SetItemOutcome {
  /** Marks the question is worth (timing allowance when the bank has none). */
  marks: number;
  /** True when the student wrote or snapped anything for it. */
  attempted: boolean;
  /** Grader's score / outOf; null when blank or the grade call failed. */
  score: number | null;
  outOf: number | null;
}

export interface SetSummary {
  total: number;
  attempted: number;
  blank: number;
  /** Attempted but the grade call failed — shown, never counted as blank. */
  unmarked: number;
  score: number;
  outOf: number;
  pct: number | null;
}

export function summariseSet(items: SetItemOutcome[]): SetSummary {
  let score = 0, outOf = 0, attempted = 0, blank = 0, unmarked = 0;
  for (const it of items) {
    if (!it.attempted) { blank++; outOf += it.marks; continue; }
    attempted++;
    if (it.score == null || it.outOf == null) { unmarked++; outOf += it.marks; continue; }
    score += it.score;
    outOf += it.outOf;
  }
  return {
    total: items.length, attempted, blank, unmarked, score, outOf,
    pct: outOf > 0 ? Math.round((score / outOf) * 100) : null,
  };
}

/** One line of coaching under the score — the habit the set just measured. */
export function coachingLine(s: SetSummary, elapsedSec: number, timeLimitSec: number): string {
  if (s.total === 0) return '';
  if (s.blank > 0) {
    return `${s.blank} left blank — under exam time a blank costs the most. Write the first line even when you're not sure.`;
  }
  const used = timeLimitSec > 0 ? elapsedSec / timeLimitSec : 1;
  if (elapsedSec >= timeLimitSec) {
    return 'You used the whole clock. When a part stalls, move on — the next question\'s marks are cheaper than a stuck part.';
  }
  if (s.pct != null && s.pct >= 80 && used <= 0.6) return 'Fast and accurate — try Advanced or a 5-question set next.';
  if (s.pct != null && s.pct < 50 && used <= 0.6) {
    return 'You finished with time to spare but dropped marks — use the leftover minutes to check each answer against the question.';
  }
  if (s.pct != null && s.pct >= 80) return 'Strong set. Keep this pace and it holds up in the exam.';
  return 'Marked at exam pace — open the feedback below and redo the ones that slipped.';
}

export interface TimedMeta {
  setId: string;
  elapsedSec: number;
  timeLimitSec: number;
  overtime: boolean;
}

/**
 * The `timed` tag the client attaches to a grade call. Anything malformed
 * (or absent) is null — the attempt is then stored as ordinary practice.
 */
export function parseTimedMeta(raw: unknown): TimedMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as { setId?: unknown; elapsedSec?: unknown; timeLimitSec?: unknown };
  if (typeof t.setId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(t.setId)) return null;
  const elapsed = Number(t.elapsedSec);
  const limit = Number(t.timeLimitSec);
  if (!Number.isFinite(elapsed) || !Number.isFinite(limit)) return null;
  if (elapsed < 0 || limit <= 0 || elapsed > MAX_ELAPSED_SEC || limit > MAX_ELAPSED_SEC) return null;
  const elapsedSec = Math.round(elapsed);
  const timeLimitSec = Math.round(limit);
  return { setId: t.setId, elapsedSec, timeLimitSec, overtime: elapsedSec >= timeLimitSec };
}
