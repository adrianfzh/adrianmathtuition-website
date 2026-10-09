// The two number tiles at the top of /admin (9 Oct 2026, Adrian: "just admin dashboard
// put papers handed up (then the number), practice questions done (then a number)").
// Pure: rows in, today's count and a seven-day strip out. The reading is in
// lib/glance-store.ts; the tiles are built in lib/glance.ts.
//
// PAPERS HANDED IN — one per paper a real student handed in, on the Singapore day
// the row was created (paper_marking_runs.created_at). Left out:
//   · a row with no student (bench scripts, test uploads, a paper nobody is tagged on),
//   · the preview student,
//   · a row named "BENCH · …" (the bench names its scripts so),
//   · a row that REPLACES an earlier one — a re-mark or the same paper sent again
//     (the earlier row carries `superseded_by` = this row's id). The paper was counted
//     the day it first came in. A re-mark done in place keeps its row, so it never
//     counts twice either.
// A paper the tutor uploads for a named student counts: the student handed it in on paper.
//
// PRACTICE QUESTIONS DONE — one per question a real student answered, on the Singapore
// day of the answer. Left out: the preview student, the admin's own tries (identity
// 'admin'), and a row with nobody on it.

import { sgtDateISO, sgtDaysAgoISO } from './sgt';
import { SCIENCE_PREVIEW_IDENTITIES } from './portal-beta';

/** The preview student (portal-teste@example.com) — never a real hand-in or answer. */
export const PREVIEW_STUDENT_IDS: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;
/** Who is not a student: the preview student and the admin's own tries. */
const NOT_A_STUDENT = new Set<string>([...PREVIEW_STUDENT_IDS, 'admin']);

export interface DayCount {
  /** The count for today (Singapore). */
  today: number;
  /** One number per Singapore day, oldest first, today last. */
  perDay: number[];
  /** The sum of `perDay`. */
  total: number;
  /** How many different students are behind today's count. */
  studentsToday: number;
}

export interface HandinRow {
  id: string;
  created_at: string;
  student_id: string | null;
  paper_name?: string | null;
}

export interface PracticeRow {
  /** When the question was answered. */
  at: string;
  /** The student's id (Airtable record id / portal identity), or null. */
  who: string | null;
}

/** True for someone we count: a student id that is not the preview student or the admin. */
export function isRealStudent(who: string | null | undefined): who is string {
  return !!who && !NOT_A_STUDENT.has(who);
}

/** True when this row is a paper a real student handed in for the first time. */
export function isHandin(row: HandinRow, replacementIds: ReadonlySet<string>): boolean {
  if (!isRealStudent(row.student_id)) return false;
  if (/^\s*bench\b/i.test(row.paper_name ?? '')) return false;
  if (replacementIds.has(row.id)) return false;
  return true;
}

/** Bucket (instant, student) pairs into the last `days` Singapore days, today last. */
function bucket(items: { at: string; who: string }[], days: number, now: number): DayCount {
  const labels = Array.from({ length: days }, (_, i) => sgtDaysAgoISO(days - 1 - i, now));
  const index = new Map(labels.map((d, i) => [d, i]));
  const perDay = new Array<number>(days).fill(0);
  const todayWho = new Set<string>();
  for (const it of items) {
    const t = Date.parse(it.at);
    if (!Number.isFinite(t)) continue;
    const i = index.get(sgtDateISO(t));
    if (i == null) continue;
    perDay[i] += 1;
    if (i === days - 1) todayWho.add(it.who);
  }
  return { today: perDay[days - 1] ?? 0, perDay, total: perDay.reduce((a, b) => a + b, 0), studentsToday: todayWho.size };
}

/**
 * Papers handed in per Singapore day. `replacementIds` = every id some earlier row
 * points at with `superseded_by` (those rows re-mark or repeat a paper already counted).
 */
export function countHandins(rows: HandinRow[], replacementIds: Iterable<string>, days: number, now: number): DayCount {
  const repl = replacementIds instanceof Set ? (replacementIds as Set<string>) : new Set(replacementIds);
  const seen = new Set<string>();
  const items: { at: string; who: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.id) || !isHandin(r, repl)) continue;
    seen.add(r.id);
    items.push({ at: r.created_at, who: r.student_id as string });
  }
  return bucket(items, days, now);
}

/** Practice questions answered per Singapore day, real students only. */
export function countPractice(rows: PracticeRow[], days: number, now: number): DayCount {
  return bucket(rows.filter((r) => isRealStudent(r.who)).map((r) => ({ at: r.at, who: r.who as string })), days, now);
}
